"""
SpeechBridge — Summarisation job
Fetches the last N high-confidence sessions for a user, calls Gemini once
to produce a personalised profile, then writes it to Convex.

Called from two places:
  1. main.py BackgroundTasks — after every /process save when shouldSummarise is true
  2. (future) main.py /onboard endpoint — immediately after 10 onboarding phrases
"""

import os
import json
import logging
import sys

import httpx
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from agent import key_manager, _message_content_to_str
from util.convex_http import (
    convex_auth_headers,
    convex_deployment_url,
    convex_request_body,
    parse_convex_response,
)

load_dotenv()
logger = logging.getLogger(__name__)

# How many sessions to feed into each summarisation
SESSIONS_PER_SUMMARY = 10

# Cap — summarisation stops firing after this many runs per user
SUMMARISATION_CAP = 50


# ─── Convex helpers (sync — summarisation runs in a thread via asyncio.to_thread)

def _convex_query_sync(function: str, args: dict):
    base = convex_deployment_url()
    if not base:
        return None
    resp = httpx.post(
        f"{base}/api/query",
        headers=convex_auth_headers(),
        json=convex_request_body(function, args),
        timeout=10,
    )
    resp.raise_for_status()
    return parse_convex_response(resp.json())


def _convex_mutation_sync(function: str, args: dict) -> dict:
    base = convex_deployment_url()
    if not base:
        return {}
    resp = httpx.post(
        f"{base}/api/mutation",
        headers=convex_auth_headers(),
        json=convex_request_body(function, args),
        timeout=10,
    )
    resp.raise_for_status()
    value = parse_convex_response(resp.json())
    if not isinstance(value, dict):
        return {}
    return value


# ─── Summarisation prompt ─────────────────────────────────────────────────────

def _build_prompt(sessions: list[dict], condition: str) -> str:
    pairs = "\n".join(
        f'  [{i+1}] Raw:       "{s["raw_transcript"]}"\n'
        f'       Corrected: "{s["corrected_text"]}"'
        for i, s in enumerate(sessions)
    )

    return f"""You are a speech-language AI analysing correction patterns for a user with {condition}.

Below are {len(sessions)} pairs showing what the speech recogniser heard (raw) vs what the user actually intended (corrected):

{pairs}

Your tasks:
1. Identify this user's specific speech patterns — what sounds do they drop, substitute, or repeat?
   Be specific: e.g. "drops final -ing", "substitutes w for r", "repeats onset consonants on p and b words"

2. Extract up to 40 individual words this user commonly says, suitable for biasing a speech recogniser.
   These must be single words only, max 50 characters each.
   Prioritise words that appeared in the corrected sentences — their real vocabulary.

Respond ONLY with valid JSON in this exact format — no markdown fences:
{{
  "pattern_summary": "2-3 sentences describing this user's specific speech patterns and what corrections are typically needed",
  "keyterms": ["word1", "word2", "word3"]
}}"""


# ─── Main job function ────────────────────────────────────────────────────────

def run_summarisation(user_id: str, condition: str) -> bool:
    """
    Fetches sessions, calls Gemini, writes profile to Convex.
    Returns True if successful, False if skipped or failed.
    Designed to run inside asyncio.to_thread() from main.py.
    """
    logger.info(f"Summarisation starting  user={user_id}  condition={condition}")

    # ── Fetch user to check cap ───────────────────────────────────────────────
    try:
        profile = _convex_query_sync("users:getProfile", {"user_id": user_id})
    except Exception as exc:
        logger.error(f"Summarisation: failed to fetch profile — {exc}")
        return False

    if not profile or not isinstance(profile, dict):
        logger.warning(f"Summarisation: no profile found for user={user_id} — skipping")
        return False

    summarisation_count = profile.get("summarisation_count", 0)
    if summarisation_count >= SUMMARISATION_CAP:
        logger.info(f"Summarisation: cap reached ({SUMMARISATION_CAP}) for user={user_id} — skipping")
        return False

    # ── Fetch last N high-confidence sessions ─────────────────────────────────
    try:
        sessions = _convex_query_sync(
            "sessions:getForSummarisation",
            {
                "user_id":         user_id,
                "limit":           SESSIONS_PER_SUMMARY,
                "min_confidence":  0.75,
            },
        )
    except Exception as exc:
        logger.error(f"Summarisation: failed to fetch sessions — {exc}")
        return False

    # sessions:getForSummarisation returns a list directly
    if isinstance(sessions, dict):
        sessions = sessions.get("sessions", [])

    if not sessions or len(sessions) < SESSIONS_PER_SUMMARY:
        logger.info(
            f"Summarisation: not enough sessions yet "
            f"(have {len(sessions) if sessions else 0}, need {SESSIONS_PER_SUMMARY}) — skipping"
        )
        return False

    # ── Call Gemini once ──────────────────────────────────────────────────────
    prompt = _build_prompt(sessions, condition)
    try:
        response = key_manager.invoke(prompt)
        raw = (
            _message_content_to_str(response.content)
            .strip()
            .removeprefix("```json")
            .removeprefix("```")
            .removesuffix("```")
            .strip()
        )
        parsed = json.loads(raw)
    except Exception as exc:
        logger.error(f"Summarisation: Gemini call failed — {exc}")
        return False

    pattern_summary = parsed.get("pattern_summary", "").strip()
    keyterms        = [
        k.strip() for k in parsed.get("keyterms", [])
        if isinstance(k, str) and k.strip() and len(k.strip()) <= 50
    ][:40]  # hard cap at 40 — Scribe v2 limit is 100 but 40 is plenty

    if not pattern_summary or not keyterms:
        logger.warning(f"Summarisation: Gemini returned empty profile — skipping write")
        return False

    logger.info(
        f"Summarisation: Gemini produced summary ({len(pattern_summary)} chars) "
        f"and {len(keyterms)} keyterms"
    )

    # ── Archive current version before overwriting ────────────────────────────
    new_version = summarisation_count + 1
    try:
        _convex_mutation_sync(
            "profile_versions:save",
            {
                "user_id":         user_id,
                "version":         new_version,
                "pattern_summary": pattern_summary,
                "keyterms":        keyterms,
                "sessions_used":   len(sessions),
            },
        )
    except Exception as exc:
        logger.warning(f"Summarisation: profile_versions save failed — {exc} — continuing anyway")

    # ── Write new profile to users table ─────────────────────────────────────
    try:
        _convex_mutation_sync(
            "users:updateProfile",
            {
                "user_id":         user_id,
                "pattern_summary": pattern_summary,
                "keyterms":        keyterms,
            },
        )
    except Exception as exc:
        logger.error(f"Summarisation: users:updateProfile failed — {exc}")
        return False

    logger.info(
        f"Summarisation complete  user={user_id}  "
        f"version={new_version}  keyterms={len(keyterms)}"
    )
    return True