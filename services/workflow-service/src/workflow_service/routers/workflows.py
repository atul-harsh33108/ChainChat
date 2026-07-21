from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.workflow_service.db import get_db
from src.workflow_service.models import Workflow, WorkflowEdge, WorkflowNode, WorkflowVersion
from src.workflow_service.schemas import (
    WorkflowCreate,
    WorkflowForkRequest,
    WorkflowForkResponse,
    WorkflowRead,
    WorkflowUpdate,
    WorkflowVersionCreate,
    WorkflowVersionRead,
)

logger = structlog.get_logger()
router = APIRouter()


def _current_user_id(request: Request) -> UUID:
    user_id = request.headers.get("x-user-id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing x-user-id header")
    return UUID(user_id)


@router.get("", response_model=list[WorkflowRead])
async def list_workflows(
    request: Request,
    workspace_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    query = select(Workflow).options(selectinload(Workflow.versions))
    if workspace_id:
        query = query.where(Workflow.workspace_id == workspace_id)
    result = await db.execute(query)
    workflows = result.scalars().all()
    logger.info("workflows_listed", count=len(workflows), user_id=str(user_id))
    return workflows


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: Request,
    payload: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    workflow = Workflow(
        id=uuid4(),
        workspace_id=payload.workspace_id,
        owner_id=user_id,
        name=payload.name,
        description=payload.description,
        meta_data=payload.meta_data,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    logger.info("workflow_created", workflow_Describe what you are looking for in your next job
Startups tell us this is one of the first things they look at in a profile
0 / 300id=str(workflow.id), user_id=str(user_id))
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(selectinload(Workflow.versions))
    )
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    logger.info("workflow_fetched", workflow_id=str(workflow_id), user_id=str(user_id))
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    request: Request,
    workflow_id: UUID,
    payload: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workflow, field, value)

    await db.commit()
    await db.refresh(workflow)
    logger.info("workflow_updated", workflow_id=str(workflow_id), user_id=str(user_id))
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    await db.delete(workflow)
    await db.commit()
    logger.info("workflow_deleted", workflow_id=str(workflow_id), user_id=str(user_id))
    return None


@router.post("/{workflow_id}/fork", response_model=WorkflowForkResponse, status_code=status.HTTP_201_CREATED)
async def fork_workflow(
    request: Request,
    workflow_id: UUID,
    payload: WorkflowForkRequest,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(
        select(Workflow)
        .where(Workflow.id == workflow_id)
        .options(selectinload(Workflow.versions).selectinload(WorkflowVersion.nodes))
        .options(selectinload(Workflow.versions).selectinload(WorkflowVersion.edges))
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    new_name = payload.new_name or f"{source.name} (copy)"
    forked = Workflow(
        id=uuid4(),
        workspace_id=payload.target_workspace_id,
        owner_id=user_id,
        name=new_name,
        description=source.description,
        parent_id=source.id,
        meta_data=source.meta_data,
    )
    db.add(forked)
    await db.flush()

    version_map: dict[UUID, UUID] = {}
    for source_version in source.versions:
        version_id = uuid4()
        version_map[source_version.id] = version_id
        version = WorkflowVersion(
            id=version_id,
            workflow_id=forked.id,
            version_number=source_version.version_number,
            name=source_version.name,
            description=source_version.description,
            change_summary=source_version.change_summary,
            status=source_version.status,
            graph=source_version.graph,
            meta_data=source_version.meta_data,
            created_by=user_id,
        )
        db.add(version)

    node_map: dict[UUID, UUID] = {}
    for source_version in source.versions:
        new_version_id = version_map[source_version.id]
        for source_node in source_version.nodes:
            node_id = uuid4()
            node_map[source_node.id] = node_id
            db.add(
                WorkflowNode(
                    id=node_id,
                    version_id=new_version_id,
                    node_type=source_node.node_type,
                    label=source_node.label,
                    position_x=source_node.position_x,
                    position_y=source_node.position_y,
                    config=source_node.config,
                )
            )
        for source_edge in source_version.edges:
            db.add(
                WorkflowEdge(
                    id=uuid4(),
                    version_id=new_version_id,
                    source_node_id=node_map.get(source_edge.source_node_id, source_edge.source_node_id),
                    target_node_id=node_map.get(source_edge.target_node_id, source_edge.target_node_id),
                    label=source_edge.label,
                    condition=source_edge.condition,
                )
            )

    await db.commit()
    await db.refresh(forked)
    logger.info("workflow_forked", source_id=str(workflow_id), fork_id=str(forked.id), user_id=str(user_id))
    return WorkflowForkResponse(id=forked.id, name=forked.name, parent_id=source.id)


@router.get("/{workflow_id}/versions", response_model=list[WorkflowVersionRead])
async def list_workflow_versions(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    result = await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow_id)
        .options(selectinload(WorkflowVersion.nodes), selectinload(WorkflowVersion.edges))
        .order_by(WorkflowVersion.version_number.desc())
    )
    versions = result.scalars().all()
    logger.info("workflow_versions_listed", workflow_id=str(workflow_id), count=len(versions), user_id=str(user_id))
    return versions


@router.post("/{workflow_id}/versions", response_model=WorkflowVersionRead, status_code=status.HTTP_201_CREATED)
async def create_workflow_version(
    request: Request,
    workflow_id: UUID,
    payload: WorkflowVersionCreate,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    workflow_result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = workflow_result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    latest_result = await db.execute(
        select(WorkflowVersion)
        .where(WorkflowVersion.workflow_id == workflow_id)
        .order_by(WorkflowVersion.version_number.desc())
    )
    latest = latest_result.scalar_one_or_none()
    next_version = (latest.version_number + 1) if latest else 1

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow_id,
        version_number=next_version,
        name=payload.name,
        description=payload.description,
        change_summary=payload.change_summary,
        status=payload.status,
        graph=payload.graph,
        meta_data=payload.meta_data,
        created_by=user_id,
    )
    db.add(version)

    if workflow.root_version_id is None:
        workflow.root_version_id = version.id

    await db.commit()
    await db.refresh(version)
    logger.info("workflow_version_created", workflow_id=str(workflow_id), version_id=str(version.id), user_id=str(user_id))
    return version
