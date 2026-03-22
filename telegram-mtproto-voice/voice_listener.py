"""
MTProto listener: downloads voice notes from allow-listed chats, runs them
through the SpeechBridge reconstruction pipeline, and replies with the
corrected audio + text.

Anyone without a stored ElevenLabs voice_id (in Convex telegram_users) is
asked to send a ~1 minute sample first — not only brand-new rows.

Run:
  cd SpeechBridge/telegram-mtproto-voice && source .venv/bin/activate
  pip install -r requirements.txt
  python voice_listener.py
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import sys
import tempfile
from pathlib import Path

import httpx
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.tl.types import DocumentAttributeAudio

from convex_telegram import convex_deployment_url, convex_mutation, convex_query

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)

SPEECHBRIDGE_URL = os.environ.get("SPEECHBRIDGE_API_URL", "http://localhost:8001")
CONDITION = os.environ.get("SPEECH_CONDITION", "general")
MIN_CLONE_SECONDS = int(os.environ.get("TELEGRAM_MIN_CLONE_SECONDS", "30"))


def _parse_allowed_chat_ids(raw: str) -> set[int]:
    out: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        out.add(int(part))
    return out


def _env_required(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        logger.error("Missing required env: %s", key)
        sys.exit(1)
    return v


def _voice_duration_seconds(msg) -> int:
    if not msg.document:
        return 0
    for attr in msg.document.attributes or []:
        if isinstance(attr, DocumentAttributeAudio):
            return int(attr.duration or 0)
    return 0


async def _process_voice(
    audio_bytes: bytes,
    user_id: str,
    *,
    voice_id: str | None = None,
) -> dict | None:
    """POST audio to SpeechBridge /process and return the JSON response."""
    url = f"{SPEECHBRIDGE_URL}/process"
    data: dict[str, str] = {"condition": CONDITION, "user_id": user_id}
    if voice_id:
        data["voice_id"] = voice_id
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                url,
                files={"audio": ("voice.ogg", audio_bytes, "audio/ogg")},
                data=data,
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("SpeechBridge %s: %s", exc.response.status_code, exc.response.text[:300])
    except Exception as exc:
        logger.error("SpeechBridge request failed: %s", exc)
    return None


async def _clone_voice_upload(audio_bytes: bytes, user_id: str) -> str | None:
    url = f"{SPEECHBRIDGE_URL}/clone-voice"
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                url,
                files={"audio": ("voice.ogg", audio_bytes, "audio/ogg")},
                data={"user_id": user_id},
            )
            resp.raise_for_status()
            body = resp.json()
            vid = body.get("voice_id")
            return str(vid) if vid else None
    except httpx.HTTPStatusError as exc:
        logger.error("clone-voice %s: %s", exc.response.status_code, exc.response.text[:300])
    except Exception as exc:
        logger.error("clone-voice failed: %s", exc)
    return None


async def _telegram_profile_row(tg_user_id: str) -> dict | None:
    if not convex_deployment_url():
        return None
    try:
        row = await convex_query(
            "telegram_users:getByTgUserId",
            {"tg_user_id": tg_user_id},
        )
        if isinstance(row, dict):
            return row
    except Exception as exc:
        logger.warning("Convex telegram_users lookup failed: %s", exc)
    return None


def _has_cloned_voice(row: dict | None) -> bool:
    if not row:
        return False
    vid = row.get("voice_id")
    return isinstance(vid, str) and len(vid.strip()) > 0


async def _save_voice_id(
    tg_user_id: str,
    voice_id: str,
    *,
    tg_username: str | None,
) -> None:
    if not convex_deployment_url():
        logger.error("CONVEX_URL is not set — cannot persist voice_id")
        return
    try:
        await convex_mutation(
            "telegram_users:setVoiceId",
            {
                "tg_user_id": tg_user_id,
                "voice_id": voice_id,
                "tg_username": tg_username,
                "condition": CONDITION,
            },
        )
        logger.info("Saved voice_id for tg_user_id=%s", tg_user_id)
    except Exception as exc:
        logger.error("Convex setVoiceId failed: %s", exc)


async def _send_reconstruction_reply(
    client: TelegramClient,
    event: events.NewMessage.Event,
    msg,
    result: dict,
) -> None:
    corrected = result.get("corrected_text", "")
    confidence = result.get("confidence", 0)
    raw_transcript = result.get("raw_transcript", "")
    audio_b64 = result.get("audio_b64")

    text_reply = (
        f"🗣 **Heard:** {raw_transcript}\n"
        f"✅ **Meant:** {corrected}\n"
        f"📊 Confidence: {confidence:.0%}"
    )
    text_msg = await event.reply(text_reply, parse_mode="md")

    if audio_b64:
        mp3_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(mp3_bytes)
            tmp_path = tmp.name
        try:
            await client.send_file(
                event.chat_id,
                tmp_path,
                voice_note=True,
            )
            logger.info("Reconstructed audio sent (chat_id=%s)", event.chat_id)
        finally:
            Path(tmp_path).unlink(missing_ok=True)

        # Clean up: delete the original voice note and the text log
        try:
            await client.delete_messages(event.chat_id, [msg.id, text_msg.id])
            logger.info("Deleted original voice note + text log (chat_id=%s)", event.chat_id)
        except Exception as exc:
            logger.warning("Could not delete messages: %s", exc)


async def main() -> None:
    api_id = int(_env_required("TELEGRAM_API_ID"))
    api_hash = _env_required("TELEGRAM_API_HASH")
    phone = os.environ.get("TELEGRAM_PHONE", "").strip() or None
    session_name = os.environ.get("TELEGRAM_SESSION_NAME", "speechbuddy")

    allowed_raw = os.environ.get("ALLOWED_CHAT_IDS", "")
    allowed = _parse_allowed_chat_ids(allowed_raw)
    if not allowed:
        logger.error(
            "ALLOWED_CHAT_IDS is empty. Set comma-separated chat IDs you have "
            "written consent to process. Refusing to run."
        )
        sys.exit(1)

    download_root = Path(os.environ.get("VOICE_DOWNLOAD_DIR", "downloads/voice"))
    download_root.mkdir(parents=True, exist_ok=True)

    if not convex_deployment_url():
        logger.warning(
            "CONVEX_URL is unset — voice cloning cannot be persisted; "
            "set it (same as backend) to store voice_id per Telegram user."
        )

    client = TelegramClient(session_name, api_id, api_hash)

    @client.on(events.NewMessage(chats=list(allowed)))
    async def on_new_message(event: events.NewMessage.Event) -> None:
        msg = event.message
        if not getattr(msg, "voice", None):
            return

        fname = f"{event.chat_id}_{msg.id}.ogg"
        dest = download_root / fname
        await msg.download_media(file=str(dest))
        logger.info("Voice note saved: %s (chat_id=%s, sender=%s)", dest, event.chat_id, msg.sender_id)

        audio_bytes = dest.read_bytes()
        sender_id = int(msg.sender_id)
        tg_key = str(sender_id)
        user_id = f"tg_{sender_id}"
        duration = _voice_duration_seconds(msg)

        sender = await event.get_sender()
        tg_username = getattr(sender, "username", None) if sender else None

        row = await _telegram_profile_row(tg_key)
        voice_id = None
        if _has_cloned_voice(row):
            voice_id = str(row["voice_id"]).strip()

        # ── No clone on file: anyone missing voice_id (new row or cleared) ──
        if not voice_id:
            if not convex_deployment_url():
                await event.reply(
                    "⚠️ Voice cloning is not configured (CONVEX_URL). "
                    "Add CONVEX_URL to .env — reconstruction will use the default voice only."
                )
                result = await _process_voice(audio_bytes, user_id)
                if result:
                    await _send_reconstruction_reply(client, event, msg, result)
                return

            if duration < MIN_CLONE_SECONDS:
                await event.reply(
                    f"🎙 **No cloned voice on file** for your Telegram account yet.\n\n"
                    f"Send a **voice note of at least ~{MIN_CLONE_SECONDS} seconds** "
                    f"(about one minute is ideal) so we can learn your voice. "
                    f"After that, your speech will be reconstructed in **your** voice.\n\n"
                    f"_This message was only {duration}s — please send a longer sample._",
                    parse_mode="md",
                )
                return

            new_vid = await _clone_voice_upload(audio_bytes, user_id)
            if not new_vid:
                await event.reply("⚠️ Voice cloning failed — check backend logs (ElevenLabs /clone-voice).")
                return
            await _save_voice_id(tg_key, new_vid, tg_username=tg_username)
            await event.reply(
                "✅ **Voice saved.** Your next voice notes will be reconstructed using your cloned voice.",
                parse_mode="md",
            )
            return

        # ── Normal reconstruction ──
        logger.info(
            "Sending to SpeechBridge /process (%s, %d bytes, voice_id=%s…)...",
            CONDITION,
            len(audio_bytes),
            voice_id[:8],
        )
        result = await _process_voice(audio_bytes, user_id, voice_id=voice_id)
        if not result:
            await event.reply("⚠️ SpeechBridge processing failed — check backend logs.")
            return

        await _send_reconstruction_reply(client, event, msg, result)

    logger.info(
        "Listening for voice notes in chats: %s | pipeline: %s/process [%s] | min_clone=%ss",
        sorted(allowed),
        SPEECHBRIDGE_URL,
        CONDITION,
        MIN_CLONE_SECONDS,
    )
    await client.start(phone=phone)
    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
