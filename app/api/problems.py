"""GET /problems — list problems owned by the caller, with filters + pagination.
GET /problems/{id} — problem detail with all review schedules.
DELETE /problems/{id} — delete problem, cascade review_schedules, remove image.

`user_id` query param: if supplied, the caller must be a parent and the
target must be a child of that parent.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import ManualReview, ParentChild, Problem, Profile, ReviewSchedule, Subject
from app.schemas import (
    ManualReviewCreate,
    ManualReviewOut,
    ProblemDetailOut,
    ProblemListOut,
    ProblemOut,
    ProblemUpdate,
    ReviewScheduleMini,
    ReviewScheduleOut,
    ReviewStatusUpdate,
)
from app.services.storage import delete_image

router = APIRouter(tags=["problems"])


async def _resolve_target_id(
    user: Profile,
    user_id: str | None,
    session: AsyncSession,
) -> str:
    """Resolve the target user_id for a query.

    Students always see only their own; parents may pass user_id for a child.
    """
    if user_id is None or user_id == user.id:
        return user.id
    if user.role != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents may view another user's data",
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
    return user_id


@router.get("/problems", response_model=ProblemListOut)
async def list_problems(
    user_id: str | None = Query(default=None, description="Target user id (parent-only)"),
    subject_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProblemListOut:
    target_id = await _resolve_target_id(user, user_id, session)

    where_clauses = [Problem.user_id == target_id]
    if subject_id is not None:
        where_clauses.append(Problem.subject_id == subject_id)

    total = (
        await session.execute(select(func.count(Problem.id)).where(*where_clauses))
    ).scalar_one()

    rows = (
        await session.execute(
            select(Problem, Subject.name)
            .join(Subject, Subject.id == Problem.subject_id)
            .where(*where_clauses)
            .order_by(Problem.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()

    items: list[ProblemOut] = []
    for problem, subject_name in rows:
        latest = (
            await session.execute(
                select(ReviewSchedule)
                .where(ReviewSchedule.problem_id == problem.id)
                .order_by(ReviewSchedule.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        items.append(
            ProblemOut(
                id=problem.id,
                user_id=problem.user_id,
                subject_id=problem.subject_id,
                subject_name=subject_name,
                original_image_url=problem.original_image_url,
                problem_text=problem.problem_text,
                solution_steps=problem.solution_steps,
                final_answer=problem.final_answer,
                estimated_study_time=problem.estimated_study_time,
                memo=problem.memo,
                created_at=problem.created_at,
                latest_review=(
                    ReviewScheduleMini.model_validate(latest) if latest else None
                ),
            )
        )

    return ProblemListOut(problems=items, total=total, page=page, limit=limit)


@router.get("/problems/{problem_id}", response_model=ProblemDetailOut)
async def get_problem_detail(
    problem_id: str,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProblemDetailOut:
    problem = await session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    # Verify access: owner or parent of owner
    if problem.user_id != user.id:
        if user.role != "parent":
            raise HTTPException(status_code=403, detail="Not your problem")
        link = (
            await session.execute(
                select(ParentChild).where(
                    ParentChild.parent_id == user.id,
                    ParentChild.child_id == problem.user_id,
                )
            )
        ).scalar_one_or_none()
        if not link:
            raise HTTPException(status_code=403, detail="Target user is not your child")

    # Fetch all review schedules
    reviews = (
        (
            await session.execute(
                select(ReviewSchedule)
                .where(ReviewSchedule.problem_id == problem_id)
                .order_by(ReviewSchedule.scheduled_date.asc())
            )
        )
        .scalars()
        .all()
    )
    manual_reviews = (
        (
            await session.execute(
                select(ManualReview)
                .where(ManualReview.problem_id == problem_id)
                .order_by(ManualReview.scheduled_date.asc())
            )
        )
        .scalars()
        .all()
    )
    subject_name = (
        await session.execute(select(Subject.name).where(Subject.id == problem.subject_id))
    ).scalar_one()

    return ProblemDetailOut(
        id=problem.id,
        user_id=problem.user_id,
        subject_id=problem.subject_id,
        subject_name=subject_name,
        original_image_url=problem.original_image_url,
        problem_text=problem.problem_text,
        solution_steps=problem.solution_steps,
        final_answer=problem.final_answer,
        estimated_study_time=problem.estimated_study_time,
        memo=problem.memo,
        created_at=problem.created_at,
        review_schedules=[ReviewScheduleOut.model_validate(r) for r in reviews],
        manual_reviews=[ManualReviewOut.model_validate(m) for m in manual_reviews],
    )


@router.delete("/problems/{problem_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_problem(
    problem_id: str,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    problem = await session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    if problem.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your problem")

    # Delete image from storage (best-effort)
    delete_image(problem.original_image_url)

    # Cascade delete via ORM (review_schedules are cascade="all, delete-orphan")
    await session.delete(problem)
    await session.commit()


@router.patch("/problems/{problem_id}", response_model=ProblemOut)
async def update_problem(
    problem_id: str,
    body: ProblemUpdate,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ProblemOut:
    problem = await session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    if problem.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your problem")

    if body.memo is not None:
        problem.memo = body.memo
    if body.subject_id is not None:
        problem.subject_id = body.subject_id
    await session.commit()
    await session.refresh(problem)

    subject_name = (
        await session.execute(select(Subject.name).where(Subject.id == problem.subject_id))
    ).scalar_one()
    latest = (
        await session.execute(
            select(ReviewSchedule)
            .where(ReviewSchedule.problem_id == problem.id)
            .order_by(ReviewSchedule.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return ProblemOut(
        id=problem.id,
        user_id=problem.user_id,
        subject_id=problem.subject_id,
        subject_name=subject_name,
        original_image_url=problem.original_image_url,
        problem_text=problem.problem_text,
        solution_steps=problem.solution_steps,
        final_answer=problem.final_answer,
        estimated_study_time=problem.estimated_study_time,
        memo=problem.memo,
        created_at=problem.created_at,
        latest_review=ReviewScheduleMini.model_validate(latest) if latest else None,
    )


@router.post("/problems/{problem_id}/manual-reviews", response_model=ManualReviewOut, status_code=201)
async def add_manual_review(
    problem_id: str,
    body: ManualReviewCreate,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ManualReviewOut:
    problem = await session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    if problem.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your problem")

    mr = ManualReview(
        problem_id=problem_id,
        user_id=user.id,
        scheduled_date=body.scheduled_date,
        note=body.note,
    )
    session.add(mr)
    await session.commit()
    await session.refresh(mr)
    return ManualReviewOut.model_validate(mr)


@router.put("/manual-reviews/{review_id}/status")
async def update_manual_review(
    review_id: str,
    body: ReviewStatusUpdate,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ManualReviewOut:
    mr = await session.get(ManualReview, review_id)
    if not mr:
        raise HTTPException(status_code=404, detail="Manual review not found")
    if mr.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your review")

    mr.completed = body.completed
    mr.completed_at = datetime.now(timezone.utc) if body.completed else None
    await session.commit()
    await session.refresh(mr)
    return ManualReviewOut.model_validate(mr)


@router.delete("/manual-reviews/{review_id}", status_code=204, response_model=None)
async def delete_manual_review(
    review_id: str,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    mr = await session.get(ManualReview, review_id)
    if not mr:
        raise HTTPException(status_code=404, detail="Manual review not found")
    if mr.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your review")
    await session.delete(mr)
    await session.commit()