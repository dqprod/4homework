"""Parent dashboard endpoints.

GET /parent/overview — aggregated stats for a child.
POST /parent/child — link a new child.
DELETE /parent/child/{child_id} — unlink a child.

All require the caller to have role='parent'.
"""
from __future__ import annotations

from datetime import date, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import AIErrorLog, ParentChild, Problem, Profile, ReviewSchedule, Subject
from app.schemas import ChildLinkOut, ChildLinkRequest, ChildSummary, MultiChildrenOverview, ParentOverviewOut

router = APIRouter(tags=["parent"])


async def _check_parent(user: Profile) -> None:
    if user.role != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents can access this endpoint",
        )


async def _verify_child(
    parent: Profile, child_id: str, session: AsyncSession
) -> None:
    link = (
        await session.execute(
            select(ParentChild).where(
                ParentChild.parent_id == parent.id,
                ParentChild.child_id == child_id,
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Target user is not your child",
        )


@router.get("/parent/overview", response_model=ParentOverviewOut)
async def parent_overview(
    child_id: str = Query(description="Child user id"),
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ParentOverviewOut:
    await _check_parent(user)
    await _verify_child(user, child_id, session)

    now = date.today()
    week_ago = now - timedelta(days=7)

    # Total problems
    total_problems = (
        await session.execute(
            select(func.count(Problem.id)).where(Problem.user_id == child_id)
        )
    ).scalar_one()

    # Problems by subject
    rows = (
        await session.execute(
            select(Subject.name, func.count(Problem.id))
            .join(Problem, Problem.subject_id == Subject.id)
            .where(Problem.user_id == child_id)
            .group_by(Subject.id)
        )
    ).all()
    problems_by_subject = {name: count for name, count in rows}

    # Total study time (problems created in the last week)
    total_study_time = (
        await session.execute(
            select(func.coalesce(func.sum(Problem.estimated_study_time), 0))
            .where(
                Problem.user_id == child_id,
                Problem.created_at >= week_ago,
            )
        )
    ).scalar_one()

    # Review completion rate
    total_reviews = (
        await session.execute(
            select(func.count(ReviewSchedule.id)).where(
                ReviewSchedule.user_id == child_id
            )
        )
    ).scalar_one()
    completed_reviews = 0
    if total_reviews > 0:
        completed_reviews = (
            await session.execute(
                select(func.count(ReviewSchedule.id)).where(
                    ReviewSchedule.user_id == child_id,
                    ReviewSchedule.completed == True,  # noqa: E712
                )
            )
        ).scalar_one()

    review_completion_rate = completed_reviews / total_reviews if total_reviews > 0 else 0.0

    # Upcoming reviews (scheduled_date >= today, not completed)
    upcoming_reviews = (
        await session.execute(
            select(func.count(ReviewSchedule.id)).where(
                ReviewSchedule.user_id == child_id,
                ReviewSchedule.scheduled_date >= now.isoformat(),
                ReviewSchedule.completed == False,  # noqa: E712
            )
        )
    ).scalar_one()

    # Overdue reviews (scheduled_date < today, not completed)
    overdue_reviews = (
        await session.execute(
            select(func.count(ReviewSchedule.id)).where(
                ReviewSchedule.user_id == child_id,
                ReviewSchedule.scheduled_date < now.isoformat(),
                ReviewSchedule.completed == False,  # noqa: E712
            )
        )
    ).scalar_one()

    return ParentOverviewOut(
        total_problems=total_problems,
        problems_by_subject=problems_by_subject,
        total_study_time_minutes=total_study_time,
        review_completion_rate=round(review_completion_rate, 2),
        upcoming_reviews=upcoming_reviews,
        overdue_reviews=overdue_reviews,
    )


@router.get("/parent/children", response_model=MultiChildrenOverview)
async def list_children_overview(
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> MultiChildrenOverview:
    await _check_parent(user)

    links = (
        await session.execute(
            select(ParentChild).where(ParentChild.parent_id == user.id)
        )
    ).scalars().all()

    now = date.today()

    children: list[ChildSummary] = []
    for link in links:
        child = await session.get(Profile, link.child_id)
        if not child:
            continue

        total = (
            await session.execute(
                select(func.count(Problem.id)).where(Problem.user_id == link.child_id)
            )
        ).scalar_one()

        study_time = (
            await session.execute(
                select(func.coalesce(func.sum(Problem.estimated_study_time), 0))
                .where(Problem.user_id == link.child_id)
            )
        ).scalar_one()

        completed = (
            await session.execute(
                select(func.count(ReviewSchedule.id)).where(
                    ReviewSchedule.user_id == link.child_id,
                    ReviewSchedule.completed == True,  # noqa: E712
                )
            )
        ).scalar_one()

        total_reviews = (
            await session.execute(
                select(func.count(ReviewSchedule.id)).where(ReviewSchedule.user_id == link.child_id)
            )
        ).scalar_one()

        due = (
            await session.execute(
                select(func.count(ReviewSchedule.id)).where(
                    ReviewSchedule.user_id == link.child_id,
                    ReviewSchedule.scheduled_date < now.isoformat(),
                    ReviewSchedule.completed == False,  # noqa: E712
                )
            )
        ).scalar_one()

        rate = completed / total_reviews if total_reviews > 0 else 0.0

        children.append(ChildSummary(
            child_id=child.id,
            child_name=child.full_name or child.id[:8],
            total_problems=total,
            study_time_minutes=study_time,
            due_reviews=due,
            completed_reviews=completed,
            completion_rate=round(rate, 2),
        ))

    return MultiChildrenOverview(children=children)


@router.post("/parent/child", response_model=ChildLinkOut, status_code=status.HTTP_201_CREATED)
async def add_child(
    body: ChildLinkRequest,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ChildLinkOut:
    await _check_parent(user)

    # Resolve child id from email or direct id
    if body.child_id:
        child_id = body.child_id
    elif body.child_email:
        child = (
            await session.execute(
                select(Profile).where(
                    Profile.full_name == body.child_email,  # simplified lookup
                    Profile.role == "student",
                )
            )
        ).scalar_one_or_none()
        if not child:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found with the given email",
            )
        child_id = child.id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide child_id or child_email",
        )

    # Verify child exists and is a student
    child = await session.get(Profile, child_id)
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child profile not found",
        )
    if child.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target user is not a student",
        )

    # Check existing link
    existing = (
        await session.execute(
            select(ParentChild).where(
                ParentChild.parent_id == user.id,
                ParentChild.child_id == child_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already linked to this child",
        )

    link = ParentChild(parent_id=user.id, child_id=child_id)
    session.add(link)
    await session.commit()
    await session.refresh(link)

    return ChildLinkOut(
        child_id=child.id,
        child_name=child.full_name,
        created_at=link.created_at,
    )


@router.delete("/parent/child/{child_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_child(
    child_id: str,
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _check_parent(user)

    link = (
        await session.execute(
            select(ParentChild).where(
                ParentChild.parent_id == user.id,
                ParentChild.child_id == child_id,
            )
        )
    ).scalar_one_or_none()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child link not found",
        )

    await session.delete(link)
    await session.commit()