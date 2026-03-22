"""
ElevenLabs Instant Voice Cloning via REST POST /v1/voices/add (httpx).

Supports samples from URLs or in-memory bytes — same shape as the ElevenLabs
multipart API expects.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger(__name__)


@dataclass
class CloneVoiceParams:
    name: str
    description: str = ""
    """Remote MP3 (or other) URLs to fetch and attach as samples."""
    file_urls: list[str] = field(default_factory=list)
    """In-memory samples: (filename, raw bytes, content_type)."""
    samples: list[tuple[str, bytes, str]] = field(default_factory=list)
    labels: dict[str, str] = field(default_factory=dict)
    remove_background_noise: bool = True


class CloneVoiceError(Exception):
    """ElevenLabs /v1/voices/add returned a non-success status."""

    def __init__(self, status_code: int, body: Any):
        self.status_code = status_code
        self.body = body
        super().__init__(f"ElevenLabs {status_code}: {body!r}")


def http_error_detail(status_code: int, body: Any) -> tuple[int, str]:
    """Map ElevenLabs JSON errors to HTTP status + user-facing message."""
    if isinstance(body, dict):
        detail = body.get("detail")
        if isinstance(detail, dict) and detail.get("status") == "missing_permissions":
            return (
                403,
                "Your ElevenLabs API key is missing the Instant Voice Cloning "
                "permission. In the ElevenLabs dashboard, create or edit an API key "
                "and enable create_instant_voice_clone, then set ELEVENLABS_API_KEY "
                "in backend/.env and restart the server.",
            )
        if isinstance(detail, str):
            return status_code if status_code < 500 else 502, detail
    if status_code == 401:
        return (
            403,
            "ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY and that "
            "the key includes voice cloning access for your plan.",
        )
    return 502, f"ElevenLabs returned {status_code}: {body!r}"


async def clone_voice_handler(params: CloneVoiceParams) -> str:
    """
    Clones a voice using ElevenLabs POST /v1/voices/add.

    Uses samples from ``file_urls`` (fetched with httpx) and/or ``samples``
    (filename, bytes, mime). Returns ``voice_id`` or raises ``httpx.HTTPStatusError``
    with response body available on ``e.response``.
    """
    name = params.name
    description = params.description
    file_urls = params.file_urls or []
    local = params.samples or []
    labels = params.labels or {}

    if not file_urls and not local:
        raise ValueError("clone_voice_handler: need file_urls or samples")

    elevenlabs_url = os.environ.get(
        "ELEVENLABS_CLONE_URL", "https://api.elevenlabs.io/v1/voices/add"
    )
    elevenlabs_api_key = os.environ["ELEVENLABS_API_KEY"]

    multipart_files: list[tuple[str, tuple[str, bytes, str]]] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        for i, file_url in enumerate(file_urls):
            try:
                mp3_response = await client.get(file_url)
                mp3_response.raise_for_status()
                content = mp3_response.content
                multipart_files.append(
                    ("files", (f"sample_{i}.mp3", content, "audio/mpeg")),
                )
            except Exception as err:
                logger.error("Failed to fetch audio from %s: %s", file_url, err)
                raise

        for filename, content, mime in local:
            multipart_files.append(("files", (filename, content, mime)))

        data: dict[str, Any] = {
            "name": name,
            "description": description,
            "remove_background_noise": str(params.remove_background_noise).lower(),
        }
        if labels:
            data["labels"] = json.dumps(labels)

        response = await client.post(
            elevenlabs_url,
            headers={
                "Accept": "application/json",
                "xi-api-key": elevenlabs_api_key,
            },
            data=data,
            files=multipart_files,
        )

    if response.is_success:
        try:
            response_data = response.json()
            voice_id = response_data.get("voice_id", "")
            if not voice_id:
                logger.error("ElevenLabs OK but no voice_id: %s", response_data)
            return voice_id
        except Exception as err:
            logger.error("Failed to parse ElevenLabs response: %s", err)
            raise

    try:
        body = response.json()
    except Exception:
        body = response.text
    raise CloneVoiceError(response.status_code, body)


async def clone_voice_from_upload(
    *,
    name: str,
    description: str,
    filename: str,
    audio_bytes: bytes,
    content_type: str | None,
) -> str:
    """Convenience wrapper for a single browser upload (e.g. webm from MediaRecorder)."""
    mime = content_type or "application/octet-stream"
    if ";" in mime:
        mime = mime.split(";", 1)[0].strip()
    params = CloneVoiceParams(
        name=name,
        description=description,
        samples=[(filename, audio_bytes, mime)],
    )
    return await clone_voice_handler(params)
