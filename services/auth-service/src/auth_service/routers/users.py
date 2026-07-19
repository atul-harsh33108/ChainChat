from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service.db import get_db
from src.auth_service.schemas import UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def get_me(request: Request, db: AsyncSession = Depends(get_db)):
    user_id = request.headers.get("x-user-id")
    return {
        "id": user_id or "00000000-0000-0000-0000-000000000000",
        "clerk_id": user_id or "unknown",
        "email": "user@example.com",
        "name": "Demo User",
        "avatar_url": None,
        "created_at": "2026-07-19T00:00:00Z",
    }
