"""Notification helpers — review reminder emails and in-app digests.

Email is optional: only if SMTP_HOST is configured. Otherwise falls back to
writing reminder rows to a local file (logs/notify-YYYY-MM-DD.log) so
the digest flow is observable end-to-end without external infra.
"""
from __future__ import annotations

import logging
import os
import smtplib
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

from sqlalchemy import select

from app.db import SessionLocal
from app.models import ParentChild, Problem, Profile, ReviewSchedule, Subject

log = logging.getLogger("notify")
log.setLevel(logging.INFO)

_NOTIFY_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
_NOTIFY_DIR.mkdir(parents=True, exist_ok=True)
_file_handler = RotatingFileHandler(
    _NOTIFY_DIR / "notify.log", maxBytes=2_000_000, backupCount=3
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
if not log.handlers:
    log.addHandler(_file_handler)


def _smtp_send(to_email: str, subject: str, body_html: str) -> bool:
    """Returns True if SMTP is configured and the send succeeded. False otherwise."""
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        log.info(f"[notify-skip] SMTP not configured, would email {to_email}: {subject}")
        return False

    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    sender = os.environ.get("SMTP_FROM", user or "noreply@4homework.local")

    msg = MIMEMultipart("alternative")
    msg["From"] = sender
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=15) as s:
            s.starttls()
            if user and password:
                s.login(user, password)
            s.sendmail(sender, [to_email], msg.as_string())
        log.info(f"[notify-ok] sent {subject!r} to {to_email}")
        return True
    except Exception as exc:
        log.warning(f"[notify-fail] {to_email}: {exc}")
        return False


async def _build_digest(target_id: str) -> tuple[Optional[str], str, str, int]:
    """Returns (recipient_email, subject, body_html, due_count)."""
    async with SessionLocal() as session:
        profile = await session.get(Profile, target_id)
        if not profile:
            return None, "", "", 0

        today = date.today().isoformat()
        # Due today + overdue
        rows = (await session.execute(
            select(ReviewSchedule)
            .where(ReviewSchedule.user_id == target_id)
            .where(ReviewSchedule.completed == False)  # noqa: E712
            .where(ReviewSchedule.scheduled_date <= today)
        )).scalars().all()
        if not rows:
            return None, "", "", 0

        # Hydrate problem + subject names (with null guards for orphaned references)
        items: list[tuple] = []
        for r in rows:
            p = await session.get(Problem, r.problem_id)
            s = await session.get(Subject, p.subject_id) if p else None
            if not p or not s:
                # Skip if review references a deleted/nonexistent problem
                continue
            items.append((r, p, s))

        subject = f"📚 {profile.full_name or '学習者'}さん、復習が {len(items)} 件あります"
        rows_html = ""
        for r, p, s in items:
            rows_html += f"""
            <tr>
              <td style='padding:8px;border-bottom:1px solid #eee'>{s.name if s else '?'}</td>
              <td style='padding:8px;border-bottom:1px solid #eee'>{(p.problem_text or '')[:60]}</td>
              <td style='padding:8px;border-bottom:1px solid #eee'>{r.scheduled_date}</td>
              <td style='padding:8px;border-bottom:1px solid #eee'>{ '⚠️ 期間超過' if r.scheduled_date < today else '📌 今日'}</td>
            </tr>
            """
        body = f"""
        <html><body style='font-family:sans-serif'>
          <h2>4homework 復習リマインダー</h2>
          <p>{profile.full_name or '学習者'}さんの復習スケジュール</p>
          <table style='border-collapse:collapse;width:100%'>
            <thead><tr>
              <th style='text-align:left;padding:8px;border-bottom:2px solid #ccc'>科目</th>
              <th style='text-align:left;padding:8px;border-bottom:2px solid #ccc'>問題</th>
              <th style='text-align:left;padding:8px;border-bottom:2px solid #ccc'>日</th>
              <th style='text-align:left;padding:8px;border-bottom:2px solid #ccc'>状態</th>
            </tr></thead>
            <tbody>{rows_html}</tbody>
          </table>
          <p style='margin-top:16px;color:#666;font-size:12px'>
            4homework アプリを開いて復習を記録しましょう。
          </p>
        </body></html>"""
        # We don't actually have an email column in profiles (no field).
        # In production wire this up via auth.users.email or add column.
        recipient = f"user-{target_id[:8]}@4homework.invalid"
        return recipient, subject, body, len(items)


async def send_review_reminders(
    target_ids: list[str],
    parent_email: Optional[str] = None,
) -> int:
    """Builds and sends notifications. Returns number of users notified."""
    notified = 0
    for tid in target_ids:
        recipient, subject, body, count = await _build_digest(tid)
        if not recipient:
            continue
        sent = _smtp_send(recipient, subject, body)
        # Always log the digest regardless of SMTP result
        log.info(
            f"[digest] target={tid} due={count} smtp={'sent' if sent else 'logged-only'}"
        )
        notified += 1
    return notified