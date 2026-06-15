"""Pydantic v2 request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Upload ----------

class UploadResponse(BaseModel):
    problem_id: str
    subject_id: int
    subject_name: str
    original_image_url: str
    problem_text: str
    solution_steps: Optional[str] = None
    final_answer: Optional[str] = None
    estimated_study_time: Optional[int] = None
    memo: Optional[str] = None
    review_schedule: "ReviewScheduleOut"
    created_at: datetime


# ---------- Problem list ----------

class ReviewScheduleMini(BaseModel):
    id: str
    review_stage: int
    scheduled_date: str
    completed: bool
    next_review_interval: Optional[int] = None

    model_config = {"from_attributes": True}


class ProblemOut(BaseModel):
    id: str
    user_id: str
    subject_id: int
    subject_name: str
    original_image_url: str
    problem_text: str
    solution_steps: Optional[str] = None
    final_answer: Optional[str] = None
    estimated_study_time: Optional[int] = None
    memo: Optional[str] = None
    created_at: datetime
    latest_review: Optional[ReviewScheduleMini] = None

    model_config = {"from_attributes": True}


class ProblemListOut(BaseModel):
    problems: list[ProblemOut]
    total: int
    page: int
    limit: int


# ---------- Problem detail ----------

class ProblemDetailOut(BaseModel):
    id: str
    user_id: str
    subject_id: int
    subject_name: str
    original_image_url: str
    problem_text: str
    solution_steps: Optional[str] = None
    final_answer: Optional[str] = None
    estimated_study_time: Optional[int] = None
    memo: Optional[str] = None
    created_at: datetime
    review_schedules: list = []
    manual_reviews: list = []

    model_config = {"from_attributes": True}


# ---------- Review ----------

class ReviewStatusUpdate(BaseModel):
    completed: bool


class ReviewScheduleOut(BaseModel):
    id: str
    problem_id: str
    user_id: str
    review_stage: int
    scheduled_date: str
    completed: bool
    completed_at: Optional[datetime] = None
    next_review_interval: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ReviewListOut(BaseModel):
    reviews: list["ReviewScheduleOut"]
    total: int
    page: int
    limit: int


# ---------- Manual review ----------

class ManualReviewCreate(BaseModel):
    scheduled_date: str
    note: Optional[str] = None


class ManualReviewOut(BaseModel):
    id: str
    problem_id: str
    user_id: str
    scheduled_date: str
    note: Optional[str] = None
    completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Problem update ----------

class ProblemUpdate(BaseModel):
    memo: Optional[str] = None
    subject_id: Optional[int] = None


# ---------- Parent ----------

class ParentOverviewOut(BaseModel):
    total_problems: int = 0
    problems_by_subject: dict[str, int] = {}
    total_study_time_minutes: int = 0
    review_completion_rate: float = 0.0
    upcoming_reviews: int = 0
    overdue_reviews: int = 0


class ChildSummary(BaseModel):
    child_id: str
    child_name: str
    total_problems: int
    study_time_minutes: int
    due_reviews: int
    completed_reviews: int
    completion_rate: float


class MultiChildrenOverview(BaseModel):
    children: list[ChildSummary]


class ChildLinkRequest(BaseModel):
    child_email: Optional[str] = None
    child_id: Optional[str] = None


class ChildLinkOut(BaseModel):
    child_id: str
    child_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Profile ----------

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None


class ProfileOut(BaseModel):
    id: str
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# Resolve forward refs
UploadResponse.model_rebuild()
ProblemDetailOut.model_rebuild()
ReviewListOut.model_rebuild()