"""GET /reviews — list review tasks for the caller (or a child, with parent auth).
PUT /reviews/{id}/status — mark a review complete/incomplete and
recompute the next Ebbinghaus stage. Writes a ReviewRecord on completion.
POST /reviews/{id}/feedback — record difficulty rating (1-5) and/or notes.
POST /notifications/digest — send review reminder digest (in-app + email if SMTP set).
"""
from __future__ import annotations

from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.config import settings
from app.db import SessionLocal, get_session
from app.models import ParentChild, Profile, ReviewRecord, ReviewSchedule
from app.schemas import ReviewListOut, ReviewScheduleOut, ReviewStatusUpdate
from app.services import advance_on_completion, rollback_on_incompletion
from app.services.notifications import send_review_reminders

router = APIRouter(tags=["reviews"])


class ReviewFeedbackRequest(BaseModel):
    difficulty_rating: Optional[int] = None
    notes: Optional[str] = None


@router.get("/reviews", response_model=ReviewListOut)
async def list_reviews(
    scheduled_date: Optional[str] = Query(default=None),
    range_start: Optional[str] = Query(default=None),
    range_end: Optional[str] = Query(default=None),
    completed: Optional[bool] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ReviewListOut:
    if user_id and user_id != user.id:
        if user.role != "parent":
            raise HTTPException(status_code=403, detail="Only parents may view another user's reviews")
        link = (await session.execute(
            select(ParentChild).where(
                ParentChild.parent_id == user.id,
                ParentChild.child_id == user_id,
            ))).scalar_one_or_none()
        if not link:
            raise HTTPException(status_code=403, detail="Target user is not your child")
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

    total = (await session.execute(
        select(func.count(ReviewSchedule.id)).where(*where_clauses)
    )).scalar_one()

    rows = (await session.execute(
        select(ReviewSchedule)
        .where(*where_clauses)
        .order_by(ReviewSchedule.scheduled_date.asc(), ReviewSchedule.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )).scalars().all()

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

        # Write review_records entry (Phase 2 requirement)
        record = ReviewRecord(
            review_schedule_id=review.id,
            problem_id=review.problem_id,
            user_id=review.user_id,
            reviewed_at=now_dt,
        )
        session.add(record)
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


@router.post("/reviews/{review_id}/feedback")
async def submit_review_feedback(
    review_id: str,
    body: ReviewFeedbackRequest,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Record difficulty rating (1-5) and/or notes for this review schedule."""
    review = await session.get(ReviewSchedule, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your review")

    if body.difficulty_rating is not None and not (1 <= body.difficulty_rating <= 5):
        raise HTTPException(status_code=400, detail="difficulty_rating must be 1-5")

    record = (
        await session.execute(
            select(ReviewRecord)
            .where(ReviewRecord.review_schedule_id == review_id)
            .order_by(ReviewRecord.reviewed_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not record:
        record = ReviewRecord(
            review_schedule_id=review_id,
            problem_id=review.problem_id,
            user_id=review.user_id,
        )
        session.add(record)
    if body.difficulty_rating is not None:
        record.difficulty_rating = body.difficulty_rating
    if body.notes is not None:
        record.notes = body.notes
    await session.commit()
    return {"ok": True, "record_id": record.id}


@router.post("/notifications/run-digest")
async def run_review_reminder_digest(
    background: BackgroundTasks,
    user: Profile = Depends(current_user),
    email: str = Query(default=None, description="Override recipient email"),
) -> dict:
    """Trigger reminder email/in-app notifications for reviews due today.

    Usually called by a cron. Manual trigger is available via this endpoint.
    Returns count of users notified. Each child's reviews are summarized
    and sent to their parent (if linked), or to themselves if solo.
    """
    target_ids: list[str] = []
    async with SessionLocal() as session:
        if user.role == "parent":
            links = (await session.execute(
                select(ParentChild).where(ParentChild.parent_id == user.id)
            )).scalars().all()
            for link in links:
                target_ids.append(link.child_id)
            target_ids.append(user.id)  # parent's own reviews too
        else:
            target_ids.append(user.id)

    user_emails = {}
    if email:
        user_emails[user.id] = email

    background.add_task(
        send_review_reminders,
        target_ids=target_ids,
        parent_email=email,
        user_emails=user_emails,
    )
    return {"queued": True, "targets": target_ids, "email": email or "not-provided"}