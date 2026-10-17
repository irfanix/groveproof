"""Plain-language explanation of a check.

"AI explains. Code counts."  The language model only rewrites numbers that
code already computed. A guard checks every number in its text; if any
number is not in the result, the AI text is thrown away and a fixed template
is used instead.
"""
from __future__ import annotations

import os
import re

import httpx

NUM_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

VERDICT_WORDS = {
    "Verified": "Verified",
    "NeedsReview": "Needs review",
    "NotEligible": "Not eligible",
    "CantCheckYet": "Can't check yet",
    "AlreadyClaimed": "Already claimed",
}


def allowed_numbers(result: dict) -> set[float]:
    """Every number that appears anywhere in the result, plus a few safe variants."""
    found: set[float] = set()

    def walk(x):
        if isinstance(x, bool):
            return
        if isinstance(x, (int, float)):
            v = float(x)
            for d in (0, 1, 2):
                found.add(round(v, d))
            if 0 < abs(v) < 1:  # 0.2 deduction may be written as 20%
                for d in (0, 1):
                    found.add(round(v * 100, d))
        elif isinstance(x, dict):
            for vv in x.values():
                walk(vv)
        elif isinstance(x, (list, tuple)):
            for vv in x:
                walk(vv)
        elif isinstance(x, str):
            for m in NUM_RE.findall(x):
                try:
                    found.add(float(m.replace(",", "")))
                except ValueError:
                    pass

    walk(result)
    return found


def numbers_ok(text: str, result: dict) -> bool:
    allowed = allowed_numbers(result)
    for m in NUM_RE.findall(text):
        v = float(m.replace(",", ""))
        if v not in allowed and round(v, 2) not in allowed:
            return False
    return True


def template(result: dict) -> str:
    n, c = result["numbers"], result["credits"]
    word = VERDICT_WORDS[result["verdict"]]
    text = f"Result: {word}. {result['reason']}"
    if result["verdict"] == "Verified":
        text += (f" Based on {c['forest_ha_used']} ha of forest, we estimate {c['annual_co2_t']} tonnes of CO2 "
                 f"stored per year. After setting aside {round(c['uncertainty_deduction'] * 100)}% for uncertainty "
                 f"and {round(c['buffer_share'] * 100)}% as a safety buffer, {c['credits']} credits can be created.")
    return text


def explain(result: dict) -> dict:
    """Returns {"text": ..., "source": "ai" | "template"}."""
    fallback = {"text": template(result), "source": "template"}
    key = os.getenv("LLM_API_KEY")
    if not key:
        return fallback
    base = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
    facts = {
        "verdict": VERDICT_WORDS[result["verdict"]],
        "reason": result["reason"],
        "numbers": result["numbers"],
        "credits": {k: result["credits"][k] for k in ("annual_co2_t", "uncertainty_deduction", "buffer_share", "credits")},
    }
    prompt = (
        "Explain this forest check to a non-expert in 3 short sentences of simple English. "
        "Use ONLY numbers that appear in the facts. Do not add new numbers, do not guess, "
        "never use the words fake or fraud. Facts:\n" + str(facts)
    )
    try:
        r = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "temperature": 0, "max_tokens": 200,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=20,
        )
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return fallback
    if not text or not numbers_ok(text, result) or re.search(r"\b(fake|fraud)\b", text, re.I):
        return fallback
    return {"text": text, "source": "ai"}
