"""End-to-end API tests for all endpoints."""
from __future__ import annotations

import io

from app.db import SessionLocal
from app.models import ParentChild, Profile


PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\x5b\xd1\x88\xa7\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def _upload(client, user_id: str, subject_id: int) -> dict:
    files = {"file": ("hw.png", io.BytesIO(PNG_1x1), "image/png")}
    data = {"subject_id": str(subject_id)}
    r = await client.post(
        "/upload", files=files, data=data, headers={"X-User-Id": user_id}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_subjects_seeded(client, subjects):
    assert len(subjects) == 5
    names = [s.name for s in subjects]
    assert "算数" in names and "国语" in names


async def test_upload_requires_auth(client, subjects):
    files = {"file": ("hw.png", io.BytesIO(PNG_1x1), "image/png")}
    r = await client.post(
        "/upload", files=files, data={"subject_id": str(subjects[0].id)}
    )
    assert r.status_code == 401


async def test_upload_unknown_subject_rejected(client, student_profile, subjects):
    files = {"file": ("hw.png", io.BytesIO(PNG_1x1), "image/png")}
    r = await client.post(
        "/upload",
        files=files,
        data={"subject_id": "9999"},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 400


async def test_upload_creates_problem_and_review(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    assert body["problem_text"].startswith("[算数]")
    assert body["subject_name"] == "算数"
    rs = body["review_schedule"]
    assert rs["review_stage"] == 0
    assert rs["completed"] is False
    assert rs["next_review_interval"] == 1


async def test_list_problems_filters_to_owner(client, student_profile, other_student_profile, subjects):
    await _upload(client, student_profile.id, subjects[0].id)
    await _upload(client, student_profile.id, subjects[1].id)
    await _upload(client, other_student_profile.id, subjects[0].id)

    r = await client.get("/problems", headers={"X-User-Id": student_profile.id})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    for p in body["problems"]:
        assert p["user_id"] == student_profile.id
        assert p["latest_review"]["review_stage"] == 0


async def test_list_problems_subject_filter(client, student_profile, subjects):
    await _upload(client, student_profile.id, subjects[0].id)
    await _upload(client, student_profile.id, subjects[1].id)
    r = await client.get(
        f"/problems?subject_id={subjects[0].id}",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["problems"][0]["subject_name"] == "算数"


async def test_mark_complete_advances_stage(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    rid = body["review_schedule"]["id"]
    r = await client.put(
        f"/reviews/{rid}/status",
        json={"completed": True},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["completed"] is True
    assert out["review_stage"] == 1
    # intervals[1] = 2 days
    assert out["next_review_interval"] == 2


async def test_mark_incomplete_keeps_scheduled_date(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    rid = body["review_schedule"]["id"]
    stage0_date = body["review_schedule"]["scheduled_date"]

    # Complete stage 0 -> stage 1, date advances to completion_date + 2 days.
    r = await client.put(
        f"/reviews/{rid}/status",
        json={"completed": True},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    stage1_date = r.json()["scheduled_date"]
    assert stage1_date != stage0_date

    # Rollback: per md "保持原计划日期", the current review's scheduled_date
    # is preserved (not the original stage-0 date, not reset).
    r = await client.put(
        f"/reviews/{rid}/status",
        json={"completed": False},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    out = r.json()
    assert out["completed"] is False
    assert out["scheduled_date"] == stage1_date
    assert out["completed_at"] is None


async def test_review_403_for_other_user(client, student_profile, other_student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    rid = body["review_schedule"]["id"]
    r = await client.put(
        f"/reviews/{rid}/status",
        json={"completed": True},
        headers={"X-User-Id": other_student_profile.id},
    )
    assert r.status_code == 403


# ---- Problem detail (GET /problems/{id}) ----

async def test_get_problem_detail(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    pid = body["problem_id"]

    r = await client.get(f"/problems/{pid}", headers={"X-User-Id": student_profile.id})
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == pid
    assert data["subject_name"] == "算数"
    assert len(data["review_schedules"]) == 1
    assert data["review_schedules"][0]["review_stage"] == 0


async def test_get_problem_detail_404(client, student_profile):
    r = await client.get(
        "/problems/00000000-0000-0000-0000-000000000000",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 404


async def test_get_problem_detail_403_other_user(client, student_profile, other_student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    pid = body["problem_id"]
    r = await client.get(
        f"/problems/{pid}",
        headers={"X-User-Id": other_student_profile.id},
    )
    assert r.status_code == 403


# ---- DELETE /problems/{id} ----

async def test_delete_problem(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    pid = body["problem_id"]
    r = await client.delete(
        f"/problems/{pid}",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 204
    # Verify it's gone
    r2 = await client.get(f"/problems/{pid}", headers={"X-User-Id": student_profile.id})
    assert r2.status_code == 404


async def test_delete_problem_403_other_user(client, student_profile, other_student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    pid = body["problem_id"]
    r = await client.delete(
        f"/problems/{pid}",
        headers={"X-User-Id": other_student_profile.id},
    )
    assert r.status_code == 403


async def test_delete_problem_404(client, student_profile):
    r = await client.delete(
        "/problems/00000000-0000-0000-0000-000000000000",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 404


# ---- GET /reviews (list) ----

async def test_list_reviews_default(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    rid = body["review_schedule"]["id"]

    r = await client.get("/reviews", headers={"X-User-Id": student_profile.id})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    ids = [rv["id"] for rv in data["reviews"]]
    assert rid in ids


async def test_list_reviews_filter_today(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    today = body["review_schedule"]["scheduled_date"]
    r = await client.get(
        f"/reviews?range_start={today}&range_end={today}",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200


async def test_list_reviews_filter_completed(client, student_profile, subjects):
    body = await _upload(client, student_profile.id, subjects[0].id)
    rid = body["review_schedule"]["id"]
    await client.put(
        f"/reviews/{rid}/status",
        json={"completed": True},
        headers={"X-User-Id": student_profile.id},
    )
    r = await client.get(
        "/reviews?completed=true",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    assert all(rv["completed"] for rv in r.json()["reviews"])


# ---- Profile update (PATCH /profiles) ----

async def test_update_profile(client, student_profile):
    r = await client.patch(
        "/profiles",
        json={"full_name": "新太郎", "username": "shintaro"},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["full_name"] == "新太郎"
    assert data["username"] == "shintaro"
    assert data["role"] == "student"


async def test_update_profile_partial(client, student_profile):
    r = await client.patch(
        "/profiles",
        json={"full_name": "Updated"},
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 200
    assert r.json()["full_name"] == "Updated"


# ---- Parent overview (GET /parent/overview) ----

async def test_parent_overview_requires_parent_role(client, student_profile, subjects):
    r = await client.get(
        f"/parent/overview?child_id={student_profile.id}",
        headers={"X-User-Id": student_profile.id},
    )
    assert r.status_code == 403


async def test_parent_overview_works_for_parent(client, student_profile, other_student_profile, subjects):
    """Parent profile links child, uploads happen, parent sees stats."""
    await _upload(client, other_student_profile.id, subjects[0].id)
    await _upload(client, other_student_profile.id, subjects[1].id)

    # Create a parent profile and link child
    parent_id = "parent-parent-parent-parent-parent-parentid"
    async with SessionLocal() as session:
        parent = Profile(id=parent_id, role="parent", full_name="Parent")
        session.add(parent)
        link = ParentChild(parent_id=parent_id, child_id=other_student_profile.id)
        session.add(link)
        await session.commit()

    r = await client.get(
        f"/parent/overview?child_id={other_student_profile.id}",
        headers={"X-User-Id": parent_id},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["total_problems"] >= 2
    assert data["review_completion_rate"] >= 0.0


# ---- Parent child link (POST/DELETE /parent/child) ----

async def test_add_child_by_id(client, other_student_profile):
    parent_id = "p2p2p2p2p2p2p2p2p2p2p2p2p2p2p2"
    async with SessionLocal() as session:
        parent = Profile(id=parent_id, role="parent", full_name="Parent2")
        session.add(parent)
        await session.commit()

    r = await client.post(
        "/parent/child",
        json={"child_id": other_student_profile.id},
        headers={"X-User-Id": parent_id},
    )
    assert r.status_code == 201
    assert r.json()["child_id"] == other_student_profile.id


async def test_add_child_duplicate(client, other_student_profile):
    parent_id = "p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3"
    async with SessionLocal() as session:
        parent = Profile(id=parent_id, role="parent", full_name="Parent3")
        session.add(parent)
        link = ParentChild(parent_id=parent_id, child_id=other_student_profile.id)
        session.add(link)
        await session.commit()

    r = await client.post(
        "/parent/child",
        json={"child_id": other_student_profile.id},
        headers={"X-User-Id": parent_id},
    )
    assert r.status_code == 409


async def test_remove_child(client, other_student_profile):
    parent_id = "p4p4p4p4p4p4p4p4p4p4p4p4p4p4p4"
    async with SessionLocal() as session:
        parent = Profile(id=parent_id, role="parent", full_name="Parent4")
        session.add(parent)
        link = ParentChild(parent_id=parent_id, child_id=other_student_profile.id)
        session.add(link)
        await session.commit()

    r = await client.delete(
        f"/parent/child/{other_student_profile.id}",
        headers={"X-User-Id": parent_id},
    )
    assert r.status_code == 204


async def test_remove_child_not_linked(client, other_student_profile):
    parent_id = "p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5"
    async with SessionLocal() as session:
        parent = Profile(id=parent_id, role="parent", full_name="Parent5")
        session.add(parent)
        await session.commit()

    r = await client.delete(
        f"/parent/child/{other_student_profile.id}",
        headers={"X-User-Id": parent_id},
    )
    assert r.status_code == 404
