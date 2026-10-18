"""Free-text questions for the GroveProof assistant.

The website answers the common questions itself from the records (no AI needed).
For other questions, and only if an AI key is set, a language model answers using
ONLY the facts the website sends. The same number guard as the explanation is used:
if the answer contains a number that is not in the facts, it is thrown away.
"""
from __future__ import annotations

import json
import os
import re

import httpx

from .explain import NUM_RE, unknown_numbers


def answer(question: str, facts: dict) -> dict:
    key = os.getenv("LLM_API_KEY")
    if not key:
        raise LookupError("No AI model is connected")
    base = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
    model = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")
    prompt = (
        "You are the GroveProof assistant. Answer the user's question in at most 4 short sentences of simple English, "
        "using ONLY the facts below. If the facts do not contain the answer, say what is missing and which page to open "
        "(Check a forest, Dashboard, Look up a credit). Never invent numbers. Never call anyone fake or a fraud. "
        "Remind the user that a blockchain record cannot prove a photo or claim is true when relevant.\n"
        f"Facts (JSON): {json.dumps(facts)[:6000]}\nQuestion: {question[:500]}"
    )
    r = httpx.post(f"{base}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                   json={"model": model, "temperature": 0, "max_tokens": 260,
                         "messages": [{"role": "user", "content": prompt}]}, timeout=25)
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"].strip()
    bad = unknown_numbers(text, {"facts": facts, "question": question})
    if bad:
        raise ValueError(f"The AI answer contained numbers that are not in the records ({', '.join(bad[:3])}), so it was not shown.")
    if re.search(r"\b(fake|fraud)\b", text, re.I):
        raise ValueError("The AI answer used an accusing word, so it was not shown.")
    return {"answer": text, "source": "ai", "numbers_checked": len(NUM_RE.findall(text))}
