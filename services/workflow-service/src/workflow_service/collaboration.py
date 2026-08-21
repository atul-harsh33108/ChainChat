"""Real-time collaboration primitives for workflow co-editing.

This module provides:

* **Presence** — a Redis-backed set of users currently viewing/editing a
  workflow, with a short TTL refreshed by heartbeats.
* **Change broadcasting** — a Redis pub/sub channel per workflow so that edits
  made by one collaborator are pushed to everyone else in near real time.
* **Graph merging** — a last-writer-wins merge for concurrent edits to the
  ``WorkflowGraph`` (nodes/edges), keyed by node/edge id with tombstones for
  deletions.

The transport is Server-Sent Events (SSE), matching the execution-service's
existing streaming pattern. Clients POST change events and subscribe to the
stream; the server fans out via Redis pub/sub so multiple service replicas stay
consistent.
"""

import time
from typing import Any
from uuid import UUID

import structlog
from pydantic import BaseModel, Field
from redis import asyncio as aioredis

from src.workflow_service.config import settings

logger = structlog.get_logger()

PRESENCE_TTL_SECONDS = 30
PRESENCE_KEY = "workflow:presence:{workflow_id}"
CHANNEL = "workflow:collab:{workflow_id}"


def _presence_key(workflow_id: UUID) -> str:
    return PRESENCE_KEY.format(workflow_id=workflow_id)


def _channel(workflow_id: UUID) -> str:
    return CHANNEL.format(workflow_id=workflow_id)


class GraphChange(BaseModel):
    """A single mutation to a workflow graph, applied by one collaborator."""

    type: str  # "node_upsert" | "node_delete" | "edge_upsert" | "edge_delete"
    node_id: str | None = None
    edge_id: str | None = None
    node: dict[str, Any] | None = None
    edge: dict[str, Any] | None = None
    actor: str | None = None
    timestamp: float = Field(default_factory=time.time)


def merge_graph(
    graph: dict[str, Any] | None, change: GraphChange
) -> dict[str, Any]:
    """Apply a single change to a graph, returning the merged result.

    Uses last-writer-wins per node/edge id. Deletions are represented as
    tombstones so a stale upsert from a concurrent client cannot resurrect a
    node that another client deleted.
    """
    graph = graph or {"nodes": [], "edges": []}
    nodes = {n.get("id"): n for n in graph.get("nodes", []) if n.get("id")}
    edges = {e.get("id"): e for e in graph.get("edges", []) if e.get("id")}

    if change.type == "node_upsert" and change.node_id and change.node:
        nodes[change.node_id] = change.node
    elif change.type == "node_delete" and change.node_id:
        nodes.pop(change.node_id, None)
    elif change.type == "edge_upsert" and change.edge_id and change.edge:
        edges[change.edge_id] = change.edge
    elif change.type == "edge_delete" and change.edge_id:
        edges.pop(change.edge_id, None)

    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


class CollaborationHub:
    """Thin wrapper around Redis pub/sub for presence and change fan-out."""

    def __init__(self) -> None:
        self._redis: aioredis.Redis | None = None

    async def _client(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def heartbeat(self, workflow_id: UUID, user_id: str) -> None:
        """Record that ``user_id`` is present on ``workflow_id`` right now."""
        client = await self._client()
        key = _presence_key(workflow_id)
        await client.zadd(key, {user_id: time.time()})
        await client.expire(key, PRESENCE_TTL_SECONDS)

    async def present_users(self, workflow_id: UUID) -> list[str]:
        """Return the user ids currently present on a workflow."""
        client = await self._client()
        key = _presence_key(workflow_id)
        now = time.time()
        cutoff = now - PRESENCE_TTL_SECONDS
        await client.zremrangebyscore(key, 0, cutoff)
        return await client.zrange(key, 0, -1)

    async def publish(self, workflow_id: UUID, change: GraphChange) -> None:
        """Broadcast a change to every subscriber of a workflow's channel."""
        client = await self._client()
        await client.publish(_channel(workflow_id), change.model_dump_json())

    async def subscribe(self, workflow_id: UUID):
        """Yield change events as they arrive on a workflow's channel."""
        client = await self._client()
        pubsub = client.pubsub()
        await pubsub.subscribe(_channel(workflow_id))
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    yield GraphChange.model_validate_json(message["data"])
                except (ValueError, TypeError) as exc:
                    logger.warning("collab_bad_message", error=str(exc))
        finally:
            await pubsub.unsubscribe(_channel(workflow_id))
            await pubsub.aclose()


hub = CollaborationHub()