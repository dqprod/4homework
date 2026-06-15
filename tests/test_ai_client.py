"""Tests for the RealNvidiaClient JSON parsing logic.

These tests verify the `_parse_model_response` function handles all the edge
cases defined in the md spec without making any network calls.

Also tests `get_client()` factory returns the correct class for each backend.
"""
from __future__ import annotations

import json

import pytest

from app.services.ai_client import (
    AIResult,
    MockAIClient,
    RealNvidiaClient,
    _parse_model_response,
    get_client,
)

# ---- _parse_model_response ----

FULL_RESPONSE = {
    "choices": [
        {
            "message": {
                "content": json.dumps(
                    {
                        "problem_text": "りんごが5個あります。3個食べました。残りは何個ですか？",
                        "solution_steps": "1. 全部の数を確認する：5個\n2. 食べた数を引く：5 - 3 = 2\n3. 答え：2個",
                        "final_answer": "2個",
                        "estimated_study_time": 5,
                    }
                )
            }
        }
    ]
}


def test_parse_full_response():
    result = _parse_model_response(FULL_RESPONSE, "算数")
    assert result.problem_text == "りんごが5個あります。3個食べました。残りは何個ですか？"
    assert "食べた数を引く" in result.solution_steps
    assert result.final_answer == "2個"
    assert result.estimated_study_time == 5
    assert result.raw["subject"] == "算数"


def test_parse_with_markdown_fences():
    body = {
        "choices": [
            {
                "message": {
                    "content": "```json\n{\n  \"problem_text\": \"x\",\n  \"final_answer\": \"y\"\n}\n```"
                }
            }
        ]
    }
    result = _parse_model_response(body, "算数")
    assert result.problem_text == "x"
    assert result.final_answer == "y"


def test_parse_non_json_fallback():
    """If model returns plain text (not JSON), _parse_model_response uses
    the raw text as problem_text and marks the failure."""
    body = {"choices": [{"message": {"content": "This is an example problem in Japanese."}}]}
    result = _parse_model_response(body, "算数")
    assert "This is" in result.problem_text
    assert "JSON を返しませんでした" in result.solution_steps
    assert result.estimated_study_time == 5


def test_parse_empty_response_raises():
    with pytest.raises(KeyError, match="Empty model response"):
        _parse_model_response({"choices": [{"message": {"content": ""}}]}, "算数")


def test_parse_missing_choices_raises():
    with pytest.raises(KeyError):
        _parse_model_response({}, "算数")


# ---- Factory dispatch ----


def test_get_client_mock():
    client = get_client()
    # Default backend is 'mock' when no env override
    assert isinstance(client, MockAIClient)


def test_real_client_can_instantiate():
    """RealNvidiaClient does not require env to instantiate — it lazily
    reads settings on __init__."""
    c = RealNvidiaClient()
    assert c._api_key == ""  # noqa: SLF001 — default env won't have key
    assert c._timeout == 60