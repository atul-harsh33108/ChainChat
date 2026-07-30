"""Coercion between external identity provider IDs and internal UUIDs.

Mirrors ``workflow_service.ids`` so the same Clerk workspace ID maps to the same
internal UUID in both services.
"""

from uuid import UUID, uuid5, NAMESPACE_URL

# Must match workflow-service exactly, or workspace ids would diverge.
_NAMESPACE = uuid5(NAMESPACE_URL, "https://chainchat.io/ids")


def to_uuid(value: str | UUID) -> UUID:
    """Return ``value`` as a UUID, deriving one for non-UUID external IDs."""
    if isinstance(value, UUID):
        return value

    text = str(value).strip()
    try:
        return UUID(text)
    except (ValueError, AttributeError, TypeError):
        return uuid5(_NAMESPACE, text)
