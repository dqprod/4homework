"""POST /upload — accept one image + subject, run AI parse, persist problem
and seed an initial Ebbinghaus review schedule.

Mirrors the md spec for `POST /upload`. Synchronous in MVP (mock AI is
fast); in Phase 2 the AI call moves to a background task.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import AIErrorLog, Problem, Profile, ReviewSchedule, Subject
from app.schemas import ReviewScheduleOut, UploadResponse
from app.services import initial_schedule
from app.services.ai_client import dump_ai_result_as_raw, get_client
from app.services.storage import StorageError, save_image
from app.config import settings

router = APIRouter(tags=["upload"])


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_problem(
    file: UploadFile = File(..., description="Homework image"),
    subject_id: int = Form(..., description="Subject id (see /subjects)"),
    user: Profile = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> UploadResponse:
    subject = (
        await session.execute(select(Subject).where(Subject.id == subject_id))
    ).scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=400, detail=f"Unknown subject_id: {subject_id}")

    data = await file.read()
    try:
        image_url = save_image(
            user_id=user.id,
            content_type=file.content_type or "image/jpeg",
            data=data,
        )
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # AI call (mock in MVP). Errors are logged but do not fail the upload —
    # we still want the image saved and a stub record visible to the user.
    ai_client = get_client()
    try:
        ai = await ai_client.parse_problem(
            image_bytes=data, subject_name=subject.name
        )
        problem_text = ai.problem_text
        solution_steps = ai.solution_steps
        final_answer = ai.final_answer
        estimated_time = ai.estimated_study_time
        ai_raw = dump_ai_result_as_raw(ai)
    except Exception as exc:  # noqa: BLE001 — broad catch is intentional (md "健壮性" req)
        session.add(
            AIErrorLog(
                user_id=user.id,
                image_url=image_url,
                error_message=str(exc),
            )
        )
        await session.flush()
        problem_text = "(AI 解析に失敗しました)"
        solution_steps = None
        final_answer = None
        estimated_time = None
        ai_raw = {"error": str(exc)}

    problem = Problem(
        user_id=user.id,
        subject_id=subject.id,
        original_image_url=image_url,
        problem_text=problem_text,
        solution_steps=solution_steps,
        final_answer=final_answer,
        estimated_study_time=estimated_time,
        ai_response_raw=ai_raw,
    )
    session.add(problem)
    await session.flush()  # populate problem.id

    init = initial_schedule(
        intervals=settings.ebbinghaus_intervals,
        initial_interval=settings.ebbinghaus_initial_interval,
    )
    review = ReviewSchedule(
        problem_id=problem.id,
        user_id=user.id,
        review_stage=init.review_stage,
        scheduled_date=init.scheduled_date.isoformat(),
        completed=False,
        next_review_interval=init.next_review_interval,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)

    return UploadResponse(
        problem_id=problem.id,
        subject_id=subject.id,
        subject_name=subject.name,
        original_image_url=problem.original_image_url,
        problem_text=problem.problem_text,
        solution_steps=problem.solution_steps,
        final_answer=problem.final_answer,
        estimated_study_time=problem.estimated_study_time,
        review_schedule=ReviewScheduleOut.model_validate(review),
        created_at=problem.created_at,
    )
