from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.workflow_service.db import get_db
from src.workflow_service.ids import to_uuid
from src.workflow_service.models import Template, Workflow, WorkflowVersion
from src.workflow_service.schemas import (
    TemplateApplyRequest,
    TemplateApplyResponse,
    TemplateCreate,
    TemplateRead,
)

logger = structlog.get_logger()
router = APIRouter()


def _current_user_id(request: Request) -> UUID:
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header")
    # Clerk IDs ("user_2abc...") are not UUIDs, so map them deterministically.
    return to_uuid(user_id)


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


@router.post("", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    request: Request,
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    """Creates a reusable template, optionally snapshotting a workflow's graph.

    ``payload.graph`` is the source of truth for the template's content (the
    caller -- typically the builder's "Save as template" action -- sends the
    current in-editor graph directly, the same way ``create_workflow_version``
    persists it), while ``payload.source_workflow_id`` is kept only as a
    provenance link back to the workflow it was created from.
    """
    user_id = _current_user_id(request)

    if payload.source_workflow_id is not None:
        workflow_result = await db.execute(
            select(Workflow).where(Workflow.id == payload.source_workflow_id)
        )
        if workflow_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Source workflow not found"
            )

    template = Template(
        id=uuid4(),
        source_workflow_id=payload.source_workflow_id,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        tags=payload.tags,
        graph=payload.graph,
        meta_data=payload.meta_data,
        is_public=payload.is_public,
        created_by=user_id,
    )
    db.add(template)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'A template named "{payload.name}" already exists',
        ) from exc
    await db.refresh(template)

    logger.info(
        "template_created",
        template_id=str(template.id),
        source_workflow_id=str(payload.source_workflow_id) if payload.source_workflow_id else None,
        user_id=str(user_id),
    )
    return template


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
        meta_data=template.meta_data,
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
        meta_data=template.meta_data,
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
