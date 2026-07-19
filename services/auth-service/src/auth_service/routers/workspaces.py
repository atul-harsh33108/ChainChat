from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth_service.db import get_db
from src.auth_service.schemas import WorkspaceRead

router = APIRouter()


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(request: Request, db: AsyncSession = Depends(get_db)):
    return []


@router.post("", response_model=WorkspaceRead)
async def create_workspace(request: Request, db: AsyncSession = Depends(get_db)):
    return {
        "id": "00000000-0000-0000-0000-000000000000",
        "name": "Demo Workspace",
        "slug": "demo",
        "plan": "free",
        "subscription_status": "active",
        "created_at": "2026-07-19T00:00:00Z",
    }
