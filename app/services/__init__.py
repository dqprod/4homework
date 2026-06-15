"""Ebbinghaus forgetting-curve scheduler.

Pure functions; no I/O, no DB. Easy to unit-test.

Contract (from homework_learn.md):
- intervals = [1, 2, 4, 7, 15, 30] (configurable)
- New problem -> stage=0, scheduled_date = today + initial_interval
- Mark complete -> stage += 1, scheduled_date = completion_date + intervals[stage]
- Mark incomplete -> reset completed/completed_at, keep scheduled_date
- After last interval, hold the longest interval (no row removal).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Sequence


@dataclass(frozen=True)
class ScheduleResult:
    review_stage: int
    scheduled_date: date
    next_review_interval: int  # days until next review; None when no further review
    completed: bool


def resolve_interval(intervals: Sequence[int], stage: int) -> int:
    """Return interval days for the given stage. Holds last value past end."""
    if not intervals:
        raise ValueError("intervals must be non-empty")
    idx = min(max(stage, 0), len(intervals) - 1)
    return intervals[idx]


def initial_schedule(
    *,
    intervals: Sequence[int],
    initial_interval: int,
    today: date | None = None,
) -> ScheduleResult:
    """Schedule the first review for a freshly created problem."""
    if not intervals:
        raise ValueError("intervals must be non-empty")
    base = today or datetime.now(timezone.utc).date()
    interval = initial_interval if initial_interval > 0 else intervals[0]
    return ScheduleResult(
        review_stage=0,
        scheduled_date=base + timedelta(days=interval),
        next_review_interval=resolve_interval(intervals, 0),
        completed=False,
    )


def advance_on_completion(
    *,
    intervals: Sequence[int],
    current_stage: int,
    completion_date: date | None = None,
) -> ScheduleResult:
    """Compute the next review state when a review is marked complete."""
    if not intervals:
        raise ValueError("intervals must be non-empty")
    base = completion_date or datetime.now(timezone.utc).date()
    new_stage = current_stage + 1
    next_interval = resolve_interval(intervals, new_stage)
    return ScheduleResult(
        review_stage=new_stage,
        scheduled_date=base + timedelta(days=next_interval),
        next_review_interval=next_interval,
        completed=True,
    )


def rollback_on_incompletion(
    *,
    scheduled_date: date,
) -> ScheduleResult:
    """Reset completion flags while keeping the original scheduled_date."""
    return ScheduleResult(
        review_stage=0,  # stage stays meaningful from caller; this fn doesn't change it
        scheduled_date=scheduled_date,
        next_review_interval=None,
        completed=False,
    )
