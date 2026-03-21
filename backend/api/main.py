"""
SpeechBridge — FastAPI backend entry point
Run with: uvicorn api.main:app --reload --port 8000
"""

import os
import base64
import logging
import time
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agent import run_agent, DEFAULT_VOICE_ID

from util.logger import setup_logger

load_dotenv()

logger = setup_logger('api', log_file='logs/api.log', level=logging.INFO)

CONVEX_URL = os.environ.get("CONVEX_URL", "")


# ─── Convex helpers ───────────────────────────────────────────────────────────
# httpx is still needed here to talk to Convex's HTTP API.
# (ElevenLabs + Gemini use their own SDKs in agent.py)

async def convex_mutation(function: str, args: dict) -> dict:
    """Fire a Convex mutation. Safe to call even if CONVEX_URL is not set."""
    if not CONVEX_URL:
        return {}
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{CONVEX_URL}/api/mutation",
            json={"path": function, "args": args},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("value", {})


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SpeechBridge backend starting up...")
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


# ─── GET / ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """So opening http://localhost:8000/ in a browser isn't a 404."""
    return {
        "service": "SpeechBridge",
        "health": "/health",
        "process": "POST /process",
        "docs": "/docs",
    }


# ─── GET /health ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Quick liveness check — hit this to confirm the server is up."""
    return {"status": "ok", "service": "SpeechBridge"}


# ─── POST /process ────────────────────────────────────────────────────────────

@app.post("/process", response_model=ProcessResponse)
async def process_audio(
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
    # Browsers send e.g. "audio/webm;codecs=opus" — compare base type only.
    def _base_mime(ct: str | None) -> str | None:
        if not ct:
            return None
        return ct.split(";", 1)[0].strip().lower()

    allowed_types = {
        "audio/webm",
        "audio/wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/ogg",
        "audio/mp4",
        "application/octet-stream",  # some clients for webm
    }
    base = _base_mime(audio.content_type)
    if base and base not in allowed_types:
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

    # ── Run the agent ─────────────────────────────────────────────────────────
    try:
        result = await run_agent(
            audio_b64=audio_b64,
            condition=condition,
            voice_id=DEFAULT_VOICE_ID,
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
