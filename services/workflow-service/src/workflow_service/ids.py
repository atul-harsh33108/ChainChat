"""Coercion between external identity provider IDs and internal UUIDs.

Clerk issues opaque string IDs such as ``user_2abcDEF...`` and ``org_2xyz...``,
but the database columns are ``UUID``. Rather than migrating every column to
text, external IDs are mapped onto a deterministic UUIDv5 so the same Clerk ID
always resolves to the same internal UUID.
"""

from uuid import UUID, uuid5, NAMESPACE_URL

# Stable namespace for ChainChat external identifiers.
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
