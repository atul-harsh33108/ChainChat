from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.workflow_service.db import get_db
from src.workflow_service.models import Template, Workflow, WorkflowVersion
from src.workflow_service.schemas import TemplateApplyRequest, TemplateApplyResponse, TemplateRead

logger = structlog.get_logger()
router = APIRouter()


def _current_user_id(request: Request) -> UUID:
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header")
    return UUID(user_id)


@router.get("", response_model=list[TemplateRead])
async def list_templates(
    request: Request,
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    _current_user_id(request)
    query = select(Template)
    if category:
        query = query.where(Template.category == category)
    result = await db.execute(query)
    templates = result.scalars().all()
    logger.info("templates_listed", count=len(templates))
    return templates


@router.get("/{template_id}", response_model=TemplateRead)
async def get_template(
    request: Request,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    _current_user_id(request)
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    logger.info("template_fetched", template_id=str(template_id))
    return template


@router.post("/{template_id}/apply", response_model=TemplateApplyResponse, status_code=status.HTTP_201_CREATED)
async def apply_template(
    request: Request,
    template_id: UUID,
    payload: TemplateApplyRequest,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(select(Template).where(Template.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    workflow = Workflow(
        id=uuid4(),
        workspace_id=payload.workspace_id,
        owner_id=payload.owner_id,
        name=payload.name or template.name,
        description=template.description,
        metadata=template.metadata,
    )
    db.add(workflow)
    await db.flush()

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version_number=1,
        name="Initial version from template",
        status="draft",
        graph=template.graph,
        metadata=template.metadata,
        created_by=user_id,
    )
    db.add(version)

    workflow.root_version_id = version.id
    await db.commit()
    await db.refresh(workflow)
    await db.refresh(version)

    logger.info(
        "template_applied",
        template_id=str(template_id),
        workflow_id=str(workflow.id),
        version_id=str(version.id),
        user_id=str(user_id),
    )
    return TemplateApplyResponse(workflow_id=workflow.id, version_id=version.id, name=workflow.name)
