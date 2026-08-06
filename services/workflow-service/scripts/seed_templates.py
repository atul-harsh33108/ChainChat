"""Seed the template gallery with starter prompt-chain templates (FEAT-06).

Idempotent: templates are keyed by their unique name; rows that already exist
are left untouched. Run from the service directory:

    .venv/bin/python scripts/seed_templates.py

Graphs use the builder's WorkflowGraph shape (nodes: id/type/label/position/
config, edges: id/source/target). Node ids double as execution step keys, so
they stay simple identifiers; edges chain prompt nodes in order.
"""

import asyncio
import sys
from pathlib import Path
from uuid import UUID, uuid4

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from src.workflow_service.db import AsyncSessionLocal
from src.workflow_service.models import Template

# created_by for seeded, non-user templates (a fixed nil UUID).
SYSTEM_USER = UUID("00000000-0000-0000-0000-000000000000")
DEFAULT_MODEL = "google/gemma-4-31b-it:free"


def _node(node_id: str, node_type: str, label: str, y: int, prompt: str | None = None) -> dict:
    config: dict = {}
    if prompt is not None:
        config = {"model": DEFAULT_MODEL, "temperature": 0.7, "prompt": prompt}
    return {
        "id": node_id,
        "type": node_type,
        "label": label,
        "position": {"x": 250, "y": y},
        "config": config,
    }


def _chain(*ids: str) -> list[dict]:
    return [
        {"id": f"e-{a}-{b}", "source": a, "target": b}
        for a, b in zip(ids, ids[1:])
    ]


TEMPLATES = [
    {
        "name": "Blog post pipeline",
        "description": "Topic, outline, draft, then a polished final post.",
        "category": "content",
        "tags": ["writing", "marketing"],
        "graph": {
            "nodes": [
                _node("start", "start", "Start", 0),
                _node(
                    "outline",
                    "prompt",
                    "Outline",
                    150,
                    "You are a content strategist. Write a detailed outline for a blog "
                    "post about the topic below. If the topic is empty, use 'The future "
                    "of remote work'.\n\nTopic: {topic}",
                ),
                _node(
                    "draft",
                    "prompt",
                    "Draft",
                    300,
                    "Write the full blog post following this outline. Use clear headings "
                    "and short paragraphs.\n\n{outline}",
                ),
                _node(
                    "polish",
                    "prompt",
                    "Polish",
                    450,
                    "Edit this draft for clarity, flow, and engagement. Return only the "
                    "final post.\n\n{draft}",
                ),
                _node("output", "output", "Final post", 600),
            ],
            "edges": _chain("start", "outline", "draft", "polish", "output"),
        },
    },
    {
        "name": "Code review chain",
        "description": "Review code for bugs and security issues, then summarize actions.",
        "category": "engineering",
        "tags": ["code", "review"],
        "graph": {
            "nodes": [
                _node("start", "start", "Start", 0),
                _node(
                    "review",
                    "prompt",
                    "Review",
                    150,
                    "You are a senior engineer. Review this code for bugs, security "
                    "issues, and style problems. If no code is provided, say so.\n\n"
                    "```\n{code}\n```",
                ),
                _node(
                    "actions",
                    "prompt",
                    "Action list",
                    300,
                    "Turn this code review into a prioritized bullet list of concrete "
                    "actions.\n\n{review}",
                ),
                _node("output", "output", "Report", 450),
            ],
            "edges": _chain("start", "review", "actions", "output"),
        },
    },
    {
        "name": "Meeting notes to action items",
        "description": "Extract decisions and action items, then draft the follow-up email.",
        "category": "productivity",
        "tags": ["meetings", "email"],
        "graph": {
            "nodes": [
                _node("start", "start", "Start", 0),
                _node(
                    "extract",
                    "prompt",
                    "Extract items",
                    150,
                    "From these meeting notes, list the decisions made and the action "
                    "items (with owners when mentioned).\n\n{notes}",
                ),
                _node(
                    "email",
                    "prompt",
                    "Follow-up email",
                    300,
                    "Draft a concise follow-up email summarizing these decisions and "
                    "action items.\n\n{extract}",
                ),
                _node("output", "output", "Email", 450),
            ],
            "edges": _chain("start", "extract", "email", "output"),
        },
    },
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        created = 0
        for spec in TEMPLATES:
            existing = await session.scalar(select(Template).where(Template.name == spec["name"]))
            if existing:
                print(f"skip (exists): {spec['name']}")
                continue
            session.add(
                Template(
                    id=uuid4(),
                    name=spec["name"],
                    description=spec["description"],
                    category=spec["category"],
                    tags=spec["tags"],
                    graph=spec["graph"],
                    is_public=True,
                    created_by=SYSTEM_USER,
                )
            )
            created += 1
            print(f"created: {spec['name']}")
        await session.commit()
        print(f"done: {created} created, {len(TEMPLATES) - created} already present")


if __name__ == "__main__":
    asyncio.run(main())