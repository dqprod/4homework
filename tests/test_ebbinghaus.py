"""Ebbinghaus scheduler — pure-function unit tests."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services import (
    advance_on_completion,
    initial_schedule,
    resolve_interval,
    rollback_on_incompletion,
)

INTERVALS = [1, 2, 4, 7, 15, 30]
TODAY = date(2026, 6, 13)


def test_resolve_interval_clamps_to_last():
    assert resolve_interval(INTERVALS, 0) == 1
    assert resolve_interval(INTERVALS, 3) == 7
    assert resolve_interval(INTERVALS, 100) == 30  # clamp


def test_initial_schedule_uses_initial_interval():
    r = initial_schedule(intervals=INTERVALS, initial_interval=1, today=TODAY)
    assert r.review_stage == 0
    assert r.scheduled_date == TODAY + timedelta(days=1)
    assert r.completed is False
    assert r.next_review_interval == 1


def test_advance_stage_zero_to_one():
    r = advance_on_completion(
        intervals=INTERVALS, current_stage=0, completion_date=TODAY
    )
    assert r.review_stage == 1
    assert r.scheduled_date == TODAY + timedelta(days=2)  # intervals[1] = 2
    assert r.completed is True
    assert r.next_review_interval == 2


def test_advance_stage_walks_full_curve():
    dates = [TODAY]
    stage = 0
    for _ in range(6):  # walk one past the end
        r = advance_on_completion(
            intervals=INTERVALS, current_stage=stage, completion_date=dates[-1]
        )
        dates.append(r.scheduled_date)
        stage = r.review_stage
    # Expected deltas: 1->2 (+2), 2->3 (+4), 3->4 (+7), 4->5 (+15), 5->6 (+30), 6->7 (+30)
    deltas = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
    assert deltas == [2, 4, 7, 15, 30, 30]


def test_rollback_keeps_scheduled_date():
    original = TODAY + timedelta(days=7)
    r = rollback_on_incompletion(scheduled_date=original)
    assert r.scheduled_date == original
    assert r.completed is False
    assert r.next_review_interval is None


def test_initial_schedule_empty_intervals_raises():
    with pytest.raises(ValueError):
        initial_schedule(intervals=[], initial_interval=1, today=TODAY)
