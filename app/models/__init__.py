"""SQLAlchemy 2.0 ORM models. Mirrors the 7-table schema in homework_learn.md.

Tables: profiles, subjects, problems, review_schedules, review_records,
        parent_child, ai_error_logs.

Notes:
- UUID PKs are stored as strings (CHAR(36)) for SQLite portability. Postgres
  swap-in Phase 2 will use `UUID` type with gen_random_uuid().
- All timestamps are timezone-aware (TIMESTAMPTZ semantics via DateTime(tz)).
- ON DELETE CASCADE is encoded in ForeignKey(... ondelete='CASCADE').
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy import JSON  # SQLAlchemy 2.0 unified JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    full_name: Mapped[Optional[str]] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16))  # 'student' | 'parent'
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=text("CURRENT_TIMESTAMP")
    )

    __table_args__ = (
        CheckConstraint("role IN ('student','parent')", name="profiles_role_check"),
    )


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(32))


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subjects.id", ondelete="RESTRICT"), nullable=False
    )
    original_image_url: Mapped[str] = mapped_column(Text, nullable=False)
    problem_text: Mapped[str] = mapped_column(Text, nullable=False)
    solution_steps: Mapped[Optional[str]] = mapped_column(Text)
    final_answer: Mapped[Optional[str]] = mapped_column(Text)
    estimated_study_time: Mapped[Optional[int]] = mapped_column(Integer)  # minutes
    memo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # user annotation
    ai_response_raw: Mapped[Optional[dict]] = mapped_column(JSON)
    processing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # async AI
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    subject: Mapped[Subject] = relationship(lazy="joined")
    review_schedules: Mapped[list["ReviewSchedule"]] = relationship(
        back_populates="problem", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_problems_user_id", "user_id"),
        Index("ix_problems_subject_id", "subject_id"),
        Index("ix_problems_created_at", "created_at"),
    )


class ReviewSchedule(Base):
    __tablename__ = "review_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    problem_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    review_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    scheduled_date: Mapped[str] = mapped_column(String(10), nullable=False)  # ISO date YYYY-MM-DD
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    next_review_interval: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    problem: Mapped[Problem] = relationship(back_populates="review_schedules", lazy="joined")

    __table_args__ = (
        Index("ix_review_schedules_user_id", "user_id"),
        Index("ix_review_schedules_scheduled_date", "scheduled_date"),
        Index("ix_review_schedules_problem_id", "problem_id"),
        Index("ix_review_schedules_user_scheduled", "user_id", "scheduled_date"),
    )


class ReviewRecord(Base):
    __tablename__ = "review_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    review_schedule_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("review_schedules.id", ondelete="CASCADE"), nullable=False
    )
    problem_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    difficulty_rating: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint(
            "difficulty_rating BETWEEN 1 AND 5", name="review_records_difficulty_check"
        ),
    )


class ParentChild(Base):
    __tablename__ = "parent_child"

    parent_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    child_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AIErrorLog(Base):
    __tablename__ = "ai_error_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="SET NULL")
    )
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    request_payload: Mapped[Optional[dict]] = mapped_column(JSON)
    response_payload: Mapped[Optional[dict]] = mapped_column(JSON)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ManualReview(Base):
    """User-triggered extra review date, outside the Ebbinghaus schedule."""
    __tablename__ = "manual_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    problem_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("problems.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    scheduled_date: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_manual_reviews_user_id", "user_id"),
        Index("ix_manual_reviews_scheduled_date", "scheduled_date"),
        Index("ix_manual_reviews_problem_id", "problem_id"),
    )


# Seed data — five subjects from the md spec.
SEED_SUBJECTS = [
    ("算数", "🔢"),
    ("国语", "📖"),
    ("理科", "🔬"),
    ("社会", "🌏"),
    ("英语", "🅰️"),
]
