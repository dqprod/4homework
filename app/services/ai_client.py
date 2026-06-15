"""AI client abstraction. Swap mock <-> real Nvidia without touching callers.

Interface contract (the four fields the md spec requires):
- problem_text, solution_steps, final_answer, estimated_study_time

Mock implementation: deterministic, file-size-driven, subject-aware.
Real implementation (Phase 2): will POST to NVIDIA_API_BASE/chat/completions
with the same prompt template.
"""
from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass, field
from typing import Protocol

import httpx


PROBLEM_PROMPT = """You are a patient tutor for a Japanese elementary-school student.
A homework image will be provided.
Return ONLY valid JSON of the form:
{
  "problem_text": "<the full question text, transcribed verbatim in Japanese>",
  "solution_steps": "<step-by-step solution using methods taught in Japanese elementary school, in Japanese, markdown allowed>",
  "final_answer": "<the final answer in Japanese>",
  "estimated_study_time": <integer minutes, 3..30>
}
Do not add any text outside the JSON."""


@dataclass
class AIResult:
    problem_text: str
    solution_steps: str
    final_answer: str
    estimated_study_time: int
    raw: dict = field(default_factory=dict)


class AIClient(Protocol):
    async def parse_problem(
        self, *, image_bytes: bytes, subject_name: str
    ) -> AIResult: ...


class MockAIClient:
    """Deterministic mock. Hash the bytes -> seed the response."""

    async def parse_problem(
        self, *, image_bytes: bytes, subject_name: str
    ) -> AIResult:
        digest = hashlib.sha256(image_bytes).hexdigest()[:8]
        study_time = 5 + (len(image_bytes) % 20)  # 5..24 min, deterministic
        return AIResult(
            problem_text=f"[{subject_name}] 問題サンプル #{digest}：りんごが 5 個 あります。",
            solution_steps=(
                f"1. 問題文を 読む ({subject_name})\n"
                f"2. 数字を 確認する (digest={digest})\n"
                f"3. 計算する\n"
                f"4. 答えを 書く"
            ),
            final_answer=f"答え #{digest}",
            estimated_study_time=study_time,
            raw={"mock": True, "digest": digest, "bytes": len(image_bytes)},
        )


class RealNvidiaClient:
    """Chat-completions client for Nvidia API Catalog (OpenAI-compatible).

    Sends vision-mode request to NVIDIA_API_BASE + /chat/completions.
    Parses JSON from model response and maps to AIResult fields.

    If the model returns non-JSON text (e.g. streaming corruption), falls
    back to embedding the entire response as problem_text.
    """

    def __init__(self) -> None:
        from app.config import settings

        self._base_url = settings.nvidia_api_base.rstrip("/")
        self._model = settings.nvidia_model
        self._api_key = settings.nvidia_api_key
        self._timeout = getattr(settings, "nvidia_timeout", 60)
        self._max_retries = getattr(settings, "nvidia_max_retries", 2)

    async def parse_problem(
        self, *, image_bytes: bytes, subject_name: str
    ) -> AIResult:
        if not self._api_key:
            return AIResult(
                problem_text="(NVIDIA_API_KEY not configured)",
                solution_steps="",
                final_answer="",
                estimated_study_time=5,
                raw={"error": "NVIDIA_API_KEY not set"},
            )

        data_url = _image_to_data_url(image_bytes)
        payload = build_real_client_payload(subject_name, data_url)

        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.post(
                        f"{self._base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                    resp.raise_for_status()
                    body: dict = resp.json()
                return _parse_model_response(body, subject_name)
            except httpx.TimeoutException as exc:
                last_exc = exc
                continue  # retry
            except (httpx.HTTPStatusError, json.JSONDecodeError, KeyError) as exc:
                last_exc = exc
                break  # don't retry client errors
            except Exception as exc:
                last_exc = exc
                break  # unknown; don't retry

        return AIResult(
            problem_text=f"(AI 解析エラー: {last_exc})",
            solution_steps="",
            final_answer="",
            estimated_study_time=5,
            raw={"error": str(last_exc)},
        )


def _image_to_data_url(image_bytes: bytes) -> str:
    """Encode bytes as a data URL so the vision endpoint can see it."""
    # Heuristic content-type from first bytes; default to png.
    if image_bytes[:3] == b"\x89PNG":
        mime = "image/png"
    elif image_bytes[:2] == b"\xff\xd8":
        mime = "image/jpeg"
    elif image_bytes[:4] == b"RIFF":
        mime = "image/webp"
    else:
        mime = "image/png"
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


def build_real_client_payload(
    subject_name: str, image_data_url: str
) -> dict:
    """Build the full request body (messages + model)."""
    from app.config import settings

    return {
        "model": settings.nvidia_model,
        "messages": [
            {"role": "system", "content": PROBLEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Subject: {subject_name}"},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data_url},
                    },
                ],
            },
        ],
        "max_tokens": 1024,
        "temperature": 0.1,
    }


def _parse_model_response(body: dict, subject_name: str) -> AIResult:
    """Extract the four fields from a standard chat-completions response.

    Handles:
      - choices[0].message.content = pure JSON
      - content with surrounding markdown fences ```json ... ```
      - parse failures → use raw content as problem_text
    """
    choices = body.get("choices")
    if not choices or not isinstance(choices, list) or len(choices) == 0:
        raise KeyError(f"Empty choices list in model response: keys={list(body.keys())}")

    raw_text: str = (
        choices[0].get("message", {}).get("content", "")
    ).strip()
    if not raw_text:
        raise KeyError("Empty model response (no content in choices[0].message)")

    # Strip possible markdown fence
    cleaned = raw_text
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # Not JSON — use raw text as problem_text
        return AIResult(
            problem_text=raw_text[:2000],
            solution_steps="(モデルが JSON を返しませんでした)",
            final_answer="",
            estimated_study_time=5,
            raw={"raw_response": raw_text, "subject": subject_name},
        )

    return AIResult(
        problem_text=str(parsed.get("problem_text", raw_text[:1000])),
        solution_steps=str(parsed.get("solution_steps", "")),
        final_answer=str(parsed.get("final_answer", "")),
        estimated_study_time=int(parsed.get("estimated_study_time", 5)),
        raw={"parsed": parsed, "subject": subject_name},
    )


def get_client() -> AIClient:
    """Factory. Returns RealNvidiaClient or MockAIClient based on env."""
    from app.config import settings

    if settings.ai_backend == "real":
        return RealNvidiaClient()
    return MockAIClient()


def dump_ai_result_as_raw(result: AIResult) -> dict:
    """Serialize AIResult the way the real API would (so ai_response_raw
    in DB has a stable shape across mock and real backends)."""
    return {
        "problem_text": result.problem_text,
        "solution_steps": result.solution_steps,
        "final_answer": result.final_answer,
        "estimated_study_time": result.estimated_study_time,
        "_meta": result.raw,
    }
