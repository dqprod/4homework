"""GET /reviews — list review tasks for the caller (or a child, with parent auth).
PUT /reviews/{review_id}/status — mark a review complete/incomplete and
recompute the next Ebbinghaus stage.
"""
from __future__ import annotations

from datetime import datetime, date, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.config import settings
from app.db import get_session
from app.models import ParentChild, Profile, ReviewSchedule
from app.schemas import ReviewListOut, ReviewScheduleOut, ReviewStatusUpdate
from app.services import advance_on_completion, rollback_on_incompletion

router = APIRouter(tags=["reviews"])


@router.get("/reviews", response_model=ReviewListOut)
async def list_reviews(
    scheduled_date: str | None = Query(default=None, description="ISO date YYYY-MM-DD filter"),
    range_start: str | None = Query(default=None, description="ISO date range start"),
    range_end: str | None = Query(default=None, description="ISO date range end"),
    completed: bool | None = Query(default=None, description="Filter by completion status"),
    user_id: str | None = Query(default=None, description="Target user id (parent-only)"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ReviewListOut:
    if user_id and user_id != user.id:
        if user.role != "parent":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents may view another user's reviews",
            )
        link = (
            await session.execute(
                select(ParentChild).where(
                    ParentChild.parent_id == user.id,
                    ParentChild.child_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Target user is not your child",
            )
        target_id = user_id
    else:
        target_id = user.id

    where_clauses = [ReviewSchedule.user_id == target_id]

    if scheduled_date:
        where_clauses.append(ReviewSchedule.scheduled_date == scheduled_date)
    if range_start:
        where_clauses.append(ReviewSchedule.scheduled_date >= range_start)
    if range_end:
        where_clauses.append(ReviewSchedule.scheduled_date <= range_end)
    if completed is not None:
        where_clauses.append(ReviewSchedule.completed == completed)

    total = (
        await session.execute(
            select(func.count(ReviewSchedule.id)).where(*where_clauses)
        )
    ).scalar_one()

    rows = (
        (
            await session.execute(
                select(ReviewSchedule)
                .where(*where_clauses)
                .order_by(ReviewSchedule.scheduled_date.asc(), ReviewSchedule.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )

    return ReviewListOut(
        reviews=[ReviewScheduleOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.put("/reviews/{review_id}/status", response_model=ReviewScheduleOut)
async def update_review_status(
    review_id: str,
    body: ReviewStatusUpdate,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ReviewScheduleOut:
    review = await session.get(ReviewSchedule, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your review task")

    now_dt = datetime.now(timezone.utc)

    if body.completed:
        result = advance_on_completion(
            intervals=settings.ebbinghaus_intervals,
            current_stage=review.review_stage,
            completion_date=now_dt.date(),
        )
        review.review_stage = result.review_stage
        review.scheduled_date = result.scheduled_date.isoformat()
        review.completed = True
        review.completed_at = now_dt
        review.next_review_interval = result.next_review_interval
        review.updated_at = now_dt
    else:
        try:
            existing = date.fromisoformat(review.scheduled_date)
        except ValueError:
            existing = now_dt.date()
        rollback_on_incompletion(scheduled_date=existing)
        review.completed = False
        review.completed_at = None
        review.updated_at = now_dt

    await session.commit()
    await session.refresh(review)
    return ReviewScheduleOut.model_validate(review)