from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.workflow_service.db import get_db
from src.workflow_service.models import Comment, Workflow
from src.workflow_service.permissions import current_user_id, require_role
from src.workflow_service.schemas import CommentCreate, CommentRead

logger = structlog.get_logger()
router = APIRouter()


@router.get("/{workflow_id}/comments", response_model=list[CommentRead])
async def list_comments(
    request: Request,
    workflow_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """List comments on a workflow, optionally scoped to a version."""
    user_id = current_user_id(request)
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    await require_role(request, workflow.workspace_id, "viewer")

    result = await db.execute(
        select(Comment)
        .where(Comment.workflow_id == workflow_id)
        .order_by(Comment.created_at)
    )
    comments = result.scalars().all()
    logger.info("comments_listed", workflow_id=str(workflow_id), count=len(comments), user_id=str(user_id))
    return comments


@router.post("/{workflow_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    request: Request,
    workflow_id: UUID,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a workflow, optionally threaded against a version."""
    user_id = current_user_id(request)
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    await require_role(request, workflow.workspace_id, "viewer")

    comment = Comment(
        id=uuid4(),
        workflow_id=workflow_id,
        version_id=payload.version_id,
        author_id=user_id,
        content=payload.content,
        meta_data=payload.meta_data,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    logger.info(
        "comment_created",
        workflow_id=str(workflow_id),
        comment_id=str(comment.id),
        user_id=str(user_id),
    )
    return comment


@router.delete("/{workflow_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    request: Request,
    workflow_id: UUID,
    comment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a comment. Only the author or a workspace owner may do so."""
    user_id = current_user_id(request)
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    comment = await db.get(Comment, comment_id)
    if not comment or comment.workflow_id != workflow_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    # Authors may delete their own comments; owners may delete any. Editors and
    # viewers may not delete others' comments.
    if comment.author_id != user_id:
        await require_role(request, workflow.workspace_id, "owner")

    await db.delete(comment)
    await db.commit()
    logger.info(
        "comment_deleted",
        workflow_id=str(workflow_id),
        comment_id=str(comment_id),
        user_id=str(user_id),
    )
    return None