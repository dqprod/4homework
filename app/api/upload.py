"""POST /upload — accept one image + subject, persist problem stub
immediately, then run AI parse in a background task.

Phase 2 enhancement:
- Returns 201 with `processing: true` so the frontend can poll.
- GET /problems/{id} will reflect `processing=false` once AI completes.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.config import settings
from app.db import SessionLocal, get_session
from app.models import AIErrorLog, Problem, Profile, ReviewSchedule, Subject
from app.schemas import ReviewScheduleOut, UploadResponse
from app.services import initial_schedule
from app.services.ai_client import dump_ai_result_as_raw, get_client
from app.services.storage import StorageError, save_image

router = APIRouter(tags=["upload"])


def _run_ai_parse(
    problem_id: str,
    user_id: str,
    subject_name: str,
    image_data: bytes,
    content_type: str,
    uploaded_url: str,
) -> None:
    """Sync AI call -> write back to DB. Runs in a worker thread (BackgroundTasks)."""
    async def _do_parse():
        ai_client = get_client()
        try:
            ai = await ai_client.parse_problem(
                image_bytes=image_data, subject_name=subject_name
            )
            init = initial_schedule(
                intervals=settings.ebbinghaus_intervals,
                initial_interval=settings.ebbinghaus_initial_interval,
            )
            async with SessionLocal() as session:
                problem = await session.get(Problem, problem_id)
                if not problem:
                    return
                problem.problem_text = ai.problem_text
                problem.solution_steps = ai.solution_steps
                problem.final_answer = ai.final_answer
                problem.estimated_study_time = ai.estimated_study_time
                problem.ai_response_raw = dump_ai_result_as_raw(ai)
                problem.processing = False

                review = ReviewSchedule(
                    problem_id=problem.id,
                    user_id=user_id,
                    review_stage=init.review_stage,
                    scheduled_date=init.scheduled_date.isoformat(),
                    completed=False,
                    next_review_interval=init.next_review_interval,
                )
                session.add(review)
                await session.commit()
        except Exception as exc:
            async with SessionLocal() as session:
                try:
                    error_log = AIErrorLog(
                        user_id=user_id,
                        image_url=uploaded_url,
                        error_message=str(exc),
                    )
                    session.add(error_log)
                    problem = await session.get(Problem, problem_id)
                    if problem:
                        problem.processing = False
                        problem.problem_text = problem.problem_text or "(AI 解析に失敗しました)"
                        problem.ai_response_raw = {"error": str(exc)}
                    await session.commit()
                except Exception:
                    await session.rollback()

    asyncio.run(_do_parse())


@router.post("/upload", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_problem(
    background: BackgroundTasks,
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

    # Persist problem stub with `processing=true`. Frontend will see
    # the AI fill in once the background task finishes.
    problem = Problem(
        user_id=user.id,
        subject_id=subject.id,
        original_image_url=image_url,
        problem_text="(解析中...)",
        processing=True,
    )
    session.add(problem)
    await session.commit()
    await session.refresh(problem)

    # Schedule AI work. BackgroundTasks runs AFTER response is sent to client.
    background.add_task(
        _run_ai_parse,
        problem_id=problem.id,
        user_id=user.id,
        subject_name=subject.name,
        image_data=data,
        content_type=file.content_type or "image/jpeg",
        uploaded_url=image_url,
    )

    return UploadResponse(
        problem_id=problem.id,
        subject_id=subject.id,
        subject_name=subject.name,
        original_image_url=problem.original_image_url,
        problem_text=problem.problem_text,
        solution_steps=None,
        final_answer=None,
        estimated_study_time=None,
        memo=None,
        review_schedule=None,
        processing=True,
        created_at=problem.created_at,
    )