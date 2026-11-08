"""Optional Claude integration (stdlib HTTP). Used only when ANTHROPIC_API_KEY is set.

Every call is defensive: on any error it returns None and the engine falls back to its
deterministic extractive/template mode, so the product never shows an ungrounded answer.
"""
from __future__ import annotations

import json
import os
import urllib.request

API_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/") + "/v1/messages"
ANSWER_MODEL = os.environ.get("WAYFINDER_ANSWER_MODEL", "claude-sonnet-5-5")
DRAFT_MODEL = os.environ.get("WAYFINDER_DRAFT_MODEL", "claude-sonnet-5-5")


def available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _call(model: str, system: str, user: str, max_tokens: int = 800) -> str | None:
    body = json.dumps({"model": model, "max_tokens": max_tokens, "system": system,
                       "messages": [{"role": "user", "content": user}]}).encode()
    req = urllib.request.Request(API_URL, data=body, headers={
        "x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01",
        "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    except Exception as e:  # noqa: BLE001 - any failure falls back to offline mode
        print(f"[llm] fallback: {e}")
        return None


ANSWER_SYSTEM = """You are Ask Wayfinder, an assistant for frontline manufacturing workers.
Answer ONLY from the numbered approved passages provided. Rules:
- Every sentence must end with a citation like [1] or [2] pointing to the passage that supports it.
- Use exact values (numbers, units, part names) from the passages. Never add facts not in the passages.
- Maximum 80 words, plain language, imperative steps where useful.
- If the passages do not answer the question, reply with exactly: NO_ANSWER"""


def grounded_answer(question: str, numbered: list[tuple[int, dict]]) -> str | None:
    ctx = "\n".join(f"[{n}] ({c['doc_id']} v{c['version']} - {c['section']}) {c['text']}" for n, c in numbered)
    return _call(ANSWER_MODEL, ANSWER_SYSTEM, f"Approved passages:\n{ctx}\n\nWorker question: {question}", 400)


DRAFT_SYSTEM = """You turn an approved Standard Operating Procedure into a short training module draft for SME review.
Return ONLY JSON: {"sections":[{"heading":str,"items":[{"text":str,"source":passage_id}]}]}.
Sections: Learning objectives, Step-by-step procedure, Critical values to remember, Safety reminders, Knowledge check.
Every item must cite the passage_id it is based on. Keep exact values. Plain language (grade 6-8). No new facts."""


def draft_module(sop: dict, passages: list[dict]) -> dict | None:
    ctx = "\n".join(f"{p['pid']}: [{p['section']}] {p['text']}" for p in passages)
    out = _call(DRAFT_MODEL, DRAFT_SYSTEM, f"SOP {sop['id']} - {sop['title']} v{sop['version']}\n{ctx}", 1500)
    if not out:
        return None
    try:
        start, end = out.find("{"), out.rfind("}")
        data = json.loads(out[start:end + 1])
        return data if isinstance(data.get("sections"), list) else None
    except Exception:  # noqa: BLE001
        return None
