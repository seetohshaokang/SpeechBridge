import base64
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

import asyncio

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agent import run_agent, DEFAULT_VOICE_ID
from util.convex_http import (
    convex_auth_headers,
    convex_deployment_url,
    convex_request_body,
    parse_convex_response,
)
from util.summarise import run_summarisation

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def _base_mime_type(content_type: str | None) -> str | None:
    """Strip MIME parameters — browsers send e.g. audio/webm;codecs=opus."""
    if not content_type:
        return None
    return content_type.split(";", 1)[0].strip().lower()

# ─── Convex helpers ───────────────────────────────────────────────────────────
# httpx is still needed here to talk to Convex's HTTP API.
# (ElevenLabs + Gemini use their own SDKs in agent.py)
# CONVEX_URL must be set in backend/.env (same URL as frontend VITE_CONVEX_URL).

async def convex_query(function: str, args: dict) -> Any:
    """Call a Convex query. Returns None if CONVEX_URL is unset; else the decoded value (dict, bool, …)."""
    base = convex_deployment_url()
    if not base:
        return None
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/api/query",
            headers=convex_auth_headers(),
            json=convex_request_body(function, args),
            timeout=10,
        )
        resp.raise_for_status()
        return parse_convex_response(resp.json())


async def convex_mutation(function: str, args: dict) -> dict:
    """Fire a Convex mutation. Returns {} if CONVEX_URL is unset or response has no object value."""
    base = convex_deployment_url()
    if not base:
        logger.warning(
            "CONVEX_URL is not set in backend/.env — skipping Convex mutation %r (sessions will not persist)",
            function,
        )
        return {}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/api/mutation",
            headers=convex_auth_headers(),
            json=convex_request_body(function, args),
            timeout=10,
        )
        resp.raise_for_status()
        value = parse_convex_response(resp.json())
        if value is None:
            return {}
        if not isinstance(value, dict):
            logger.warning("Convex mutation %r returned non-dict %s", function, type(value))
            return {}
        return value


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SpeechBridge backend starting up...")
    if not convex_deployment_url():
        logger.warning(
            "CONVEX_URL is missing in backend/.env — set it to the same URL as "
            "frontend VITE_CONVEX_URL (e.g. https://….convex.cloud) so /process can save sessions."
        )
    yield
    logger.info("SpeechBridge backend shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SpeechBridge API",
    description="AI speech correction for people with speech disabilities.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",    # Vite dev server
        "http://localhost:3000",    # CRA dev server
        os.environ.get("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Models ───────────────────────────────────────────────────────────────────

ConditionType = Literal["dysarthria", "stuttering", "aphasia", "general"]


class ProcessResponse(BaseModel):
    session_id: str
    raw_transcript: str
    corrected_text: str
    confidence: float
    changes: list[str]
    audio_b64: str | None
    audio_format: str
    gemini_key_used: int
    processing_ms: int


# ─── GET /health ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Quick liveness check — hit this to confirm the server is up."""
    return {"status": "ok", "service": "SpeechBridge"}


# ─── POST /process ────────────────────────────────────────────────────────────

@app.post("/process", response_model=ProcessResponse)
async def process_audio(
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(..., description="Audio file — webm, wav, or mp3"),
    condition: ConditionType = Form(default="general"),
    user_id: str = Form(default="anonymous"),
):
    """
    Main MVP endpoint.

    Accepts a multipart form with:
      - audio     : recorded audio file (webm / wav / mp3)
      - condition : 'dysarthria' | 'stuttering' | 'aphasia' | 'general'
      - user_id   : any string identifier (used to tag the saved session)

    Returns corrected text + base64 MP3 audio ready to play in React.
    """
    t_start = time.monotonic()

    # ── Validate ──────────────────────────────────────────────────────────────
    allowed_types = {
        "audio/webm", "audio/wav", "audio/mpeg",
        "audio/mp3", "audio/ogg", "audio/mp4",
        "application/octet-stream",  # Chrome sometimes sends this for webm
    }
    base_type = _base_mime_type(audio.content_type)
    if base_type and base_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported audio type '{audio.content_type}'. Send webm, wav, or mp3.",
        )

    audio_bytes = await audio.read()

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Audio file is empty.")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio too large — max 25 MB.")

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    logger.info(
        f"Received audio  user={user_id}  condition={condition}  "
        f"size={len(audio_bytes) / 1024:.1f} KB"
    )

    # ── Fetch user profile for personalisation ───────────────────────────────
    pattern_summary    = None
    keyterms_override  = None
    if user_id != "anonymous":
        try:
            profile = await convex_query("users:getProfile", {"user_id": user_id})
            if profile and isinstance(profile, dict):
                pattern_summary   = profile.get("pattern_summary")
                keyterms_override = profile.get("keyterms")
                if pattern_summary:
                    logger.info(f"Profile loaded for user={user_id} — personalisation active")
        except Exception as exc:
            logger.warning(f"Profile fetch failed ({exc}) — using defaults")

    # ── Run the agent ─────────────────────────────────────────────────────────
    try:
        result = await run_agent(
            audio_b64=audio_b64,
            condition=condition,
            voice_id=DEFAULT_VOICE_ID,
            pattern_summary=pattern_summary,
            keyterms_override=keyterms_override,
        )
    except Exception as exc:
        logger.error(f"Agent error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail=f"Speech processing failed: {str(exc)}",
        )

    processing_ms = int((time.monotonic() - t_start) * 1000)
    logger.info(
        f"Done  user={user_id}  confidence={result.get('confidence', 0):.2f}  "
        f"gemini_key={result.get('gemini_key_used')}  {processing_ms}ms"
    )

    # ── Save session to Convex (non-blocking — failure won't break the response)
    session_id = f"{user_id}_{int(time.time() * 1000)}"
    try:
        saved = await convex_mutation(
            "sessions:save",
            {
                "session_id":     session_id,
                "user_id":        user_id,
                "condition":      condition,
                "raw_transcript": result["raw_transcript"],
                "corrected_text": result["corrected_text"],
                "confidence":     result["confidence"],
                "changes":        result["changes"],
                "processing_ms":  processing_ms,
            },
        )
        session_id = saved.get("session_id", session_id)
    except Exception as exc:
        logger.warning(f"Convex save failed ({exc}) — returning result anyway.")

    # ── Trigger summarisation in background if threshold is met ───────────────
    if user_id != "anonymous":
        try:
            should = await convex_query(
                "users:shouldSummarise",
                {"user_id": user_id, "confidence": result["confidence"]},
            )
            if should:
                logger.info(f"Scheduling summarisation for user={user_id}")
                background_tasks.add_task(
                    asyncio.to_thread,
                    run_summarisation,
                    user_id,
                    condition,
                )
        except Exception as exc:
            logger.warning(f"shouldSummarise check failed ({exc}) — skipping")

    return ProcessResponse(
        session_id=session_id,
        raw_transcript=result["raw_transcript"],
        corrected_text=result["corrected_text"],
        confidence=result["confidence"],
        changes=result["changes"],
        audio_b64=result["audio_b64"],
        audio_format=result["audio_format"],
        gemini_key_used=result["gemini_key_used"],
        processing_ms=processing_ms,
    )


# ─── Global error handler ─────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error — check backend logs."},
    )