import asyncio
import os
import json
import base64
import logging
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool

from util.logger import setup_logger

load_dotenv()

# In serverless environments (Vercel, Lambda), use stdout logging only
# File system is read-only except for /tmp, and logs are captured automatically
IS_SERVERLESS = os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME')
log_file = None if IS_SERVERLESS else 'logs/agent.log'

logger = setup_logger('agent', log_file=log_file, level=logging.DEBUG)


# ─── Config ───────────────────────────────────────────────────────────────────

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel"

# Single shared ElevenLabs client — used for both STT and TTS
eleven = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

GEMINI_API_KEYS = [
    os.environ["GEMINI_API_KEY_1"],
    os.environ["GEMINI_API_KEY_2"],
    os.environ["GEMINI_API_KEY_3"],
]

# Faster than Pro — default is Flash Lite. Override in .env if your key rejects it:
#   GEMINI_CHAT_MODEL=gemini-3-flash-preview
GEMINI_CHAT_MODEL = os.environ.get(
    "GEMINI_CHAT_MODEL", "gemini-3.1-flash-lite-preview"
)

_QUOTA_ERRORS = ("429", "ResourceExhausted", "RESOURCE_EXHAUSTED", "quota", "billing")


# ─── Gemini key rotation ──────────────────────────────────────────────────────

class GeminiKeyManager:
    def __init__(self, keys: list[str]):
        self.keys = keys
        self._index = 0
        self._exhausted: set[int] = set()
        self._llm = self._build(0)

    def _build(self, i: int) -> ChatGoogleGenerativeAI:
        logger.info(f"Gemini: key slot {i + 1}  model={GEMINI_CHAT_MODEL}")
        return ChatGoogleGenerativeAI(
            model=GEMINI_CHAT_MODEL,
            google_api_key=self.keys[i],
            temperature=0.2,
            # Short JSON correction — smaller cap = faster responses than Pro / huge defaults
            max_output_tokens=1024,
        )

    def _is_quota(self, exc: Exception) -> bool:
        return any(e.lower() in str(exc).lower() for e in _QUOTA_ERRORS)

    def _rotate(self) -> bool:
        self._exhausted.add(self._index)
        for i in range(len(self.keys)):
            if i not in self._exhausted:
                self._index = i
                self._llm = self._build(i)
                logger.warning(f"Gemini: rotated to key slot {i + 1}")
                return True
        logger.error("All Gemini keys exhausted")
        return False

    def invoke(self, *args, **kwargs):
        while True:
            try:
                return self._llm.invoke(*args, **kwargs)
            except Exception as exc:
                if self._is_quota(exc) and self._rotate():
                    continue
                raise

    @property
    def llm(self) -> ChatGoogleGenerativeAI:
        return self._llm

    @property
    def active_index(self) -> int:
        return self._index


key_manager = GeminiKeyManager(GEMINI_API_KEYS)


def _message_content_to_str(content) -> str:
    """LangChain / Gemini may return str or a list of blocks — normalize to str."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                t = block.get("text")
                if isinstance(t, str):
                    parts.append(t)
                else:
                    parts.append(str(block))
            else:
                text_attr = getattr(block, "text", None)
                parts.append(text_attr if isinstance(text_attr, str) else str(block))
        return "".join(parts)
    return str(content)


# ─── Scribe v2 keyterm lists per condition ───────────────────────────────────
# Scribe v2 accepts up to 100 keyterms (max 50 chars each).
# These bias the model toward recognising words it might otherwise mishear
# in atypical speech — contextually applied, not force-injected.

_KEYTERMS: dict[str, list[str]] = {
    "dysarthria": [
        # Common everyday words that get slurred or consonant-dropped
        "water", "hungry", "toilet", "help", "please", "thank you",
        "yes", "no", "maybe", "okay", "sorry", "hello", "goodbye",
        "pain", "tired", "hot", "cold", "outside", "inside", "today",
        "tomorrow", "yesterday", "family", "doctor", "medicine", "phone",
        "food", "drink", "sleep", "home", "walk", "sit", "stand",
        # Common patterns: final consonants dropped, vowels merged
        "want", "need", "going", "coming", "feeling", "better", "worse",
        "morning", "evening", "waiting", "ready", "finished", "together",
    ],
    "stuttering": [
        # Stuttering repeats onset sounds — bias toward completed words
        "because", "probably", "people", "sometimes", "together", "different",
        "problem", "beautiful", "important", "understand", "remember",
        "actually", "thinking", "feeling", "talking", "working", "trying",
        "something", "everything", "anything", "nothing", "someone",
        "question", "answer", "explain", "believe", "between", "before",
        # Common function words that get blocked on
        "would", "could", "should", "really", "little", "every",
    ],
    "aphasia": [
        # Aphasia causes word substitutions and paraphasias —
        # bias toward concrete nouns and high-frequency words
        "house", "car", "food", "water", "family", "doctor", "hospital",
        "money", "phone", "book", "door", "window", "table", "chair",
        "morning", "night", "today", "tomorrow", "happy", "sad", "angry",
        "walk", "talk", "eat", "drink", "sleep", "work", "help", "give",
        "come", "go", "see", "know", "think", "want", "like", "need",
        # Time and place words often substituted
        "here", "there", "when", "where", "before", "after", "always",
    ],
    "general": [
        # Broad coverage for unspecified speech difficulties
        "yes", "no", "please", "thank you", "help", "okay", "sorry",
        "water", "food", "home", "phone", "doctor", "family", "today",
        "want", "need", "feel", "think", "going", "coming", "ready",
    ],
}


# ─── Tool 1: Transcribe — ElevenLabs Scribe v2 ───────────────────────────────

@tool
def transcribe_audio(audio_b64: str, condition: str, keyterms_override: list | None = None) -> dict:
    """
    Transcribes speech audio using ElevenLabs Scribe v2.
    Always call this first. Returns the raw transcript.

    Args:
        audio_b64: Base64-encoded audio (webm/wav/mp3).
        condition: One of 'dysarthria', 'stuttering', 'aphasia', 'general'.
    """
    import time
    t_start = time.time()
    
    audio_bytes = base64.b64decode(audio_b64)
    logger.debug(f"Transcribing {len(audio_bytes)} bytes [{condition}]")

    # Pick the keyterm list for this condition (fall back to general)
    if keyterms_override:
        keyterms = keyterms_override[:100]  # Scribe v2 hard limit
        logger.debug(f"Using personalised keyterms ({len(keyterms)})")
    else:
        keyterms = _KEYTERMS.get(condition, _KEYTERMS["general"])

    # ElevenLabs SDK — speech_to_text.convert()
    import io
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = "audio.webm"   # SDK reads the .name attribute for mime type

    result = eleven.speech_to_text.convert(
        file=audio_file,
        model_id="scribe_v2",
        language_code="eng",         # lock to English — faster + more accurate
        tag_audio_events=True,       # marks [laughter], [silence] etc.
        keyterms=keyterms,           # condition-specific vocabulary bias
    )

    transcript = (result.text or "").strip()
    elapsed = time.time() - t_start
    logger.info(
        f"Scribe [{condition}] transcript: '{transcript[:100]}' "
        f"keyterms={len(keyterms)} elapsed={elapsed:.3f}s"
    )
    return {"raw_transcript": transcript}


# ─── Tool 2: Correct — Gemini reasoning ──────────────────────────────────────

@tool
def correct_speech(raw_transcript: str, condition: str, pattern_summary: str | None = None) -> dict:
    """
    Takes the raw transcript and reconstructs the most likely intended sentence.
    Uses Gemini to reason about the intended meaning.
    Call this after transcribe_audio.

    Args:
        raw_transcript: The raw text output from transcribe_audio.
        condition: Speech condition — helps Gemini apply the right corrections.
    """
    import time
    t_start = time.time()
    logger.debug(f"Starting correction [{condition}]: '{raw_transcript[:80]}'")
    
    condition_hints = {
        "dysarthria": (
            "Dysarthria causes slurred, slow, or mumbled speech. "
            "Consonants are often dropped or blurred. Words may run together. "
            "Focus on likely word boundaries and consonant restoration."
        ),
        "stuttering": (
            "Stuttering causes repetition of sounds, syllables, or words, "
            "and prolongations. Remove repeated fragments and false starts. "
            "The intended word is usually the last attempt before moving on."
        ),
        "aphasia": (
            "Aphasia causes word-finding difficulty. The speaker may use the "
            "wrong word, a related word, or leave gaps. Infer the most likely "
            "intended word from context. Preserve the core meaning."
        ),
        "general": (
            "The speaker has a speech difficulty. Correct for clarity while "
            "preserving the original meaning as closely as possible."
        ),
    }

    hint = condition_hints.get(condition, condition_hints["general"])

    personalisation_block = ""
    if pattern_summary and pattern_summary.strip():
        personalisation_block = f"""
    User-specific speech pattern (learned from their history):
    {pattern_summary.strip()}
    """
        logger.debug("Injecting personalised pattern summary into correction prompt")

    prompt = f"""You are a speech correction specialist helping people with speech disabilities communicate clearly.

Condition: {condition}
Context: {hint}
{personalisation_block}

Raw transcript (what the speech recognition heard):
"{raw_transcript}"

Your task:
1. Identify what the speaker most likely intended to say
2. Return a single clean, natural sentence — no fragments, no repetitions
3. Preserve their exact meaning and tone — do not add or remove ideas
4. If the transcript is too unclear to correct confidently, return your best guess with low confidence

Respond ONLY with valid JSON in this exact format:
{{
  "corrected_text": "the corrected sentence here",
  "confidence": 0.87,
  "changes": ["removed stutter on 'ca-can'", "restored word 'water'"]
}}"""

    response = key_manager.invoke(prompt)

    raw = (
        _message_content_to_str(response.content)
        .strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )

    try:
        parsed = json.loads(raw)
        elapsed = time.time() - t_start
        logger.info(
            f"Correction: '{parsed.get('corrected_text', '')[:80]}' "
            f"confidence={parsed.get('confidence', 0)} elapsed={elapsed:.3f}s"
        )
        return parsed
    except json.JSONDecodeError:
        elapsed = time.time() - t_start
        logger.warning(f"Gemini returned non-JSON: {raw[:200]} elapsed={elapsed:.3f}s")
        return {
            "corrected_text": raw_transcript,
            "confidence": 0.4,
            "changes": ["could not parse correction — returned original"],
        }


# ─── Tool 3: Synthesise — ElevenLabs TTS ─────────────────────────────────────

@tool
def synthesise_voice(text: str, voice_id: str = DEFAULT_VOICE_ID) -> dict:
    """
    Converts corrected text to clear natural speech using ElevenLabs TTS.
    Always call this last, after correct_speech.

    Args:
        text: The corrected sentence to speak.
        voice_id: ElevenLabs voice ID.
    """
    import time
    t_start = time.time()
    logger.debug(f"Synthesising: '{text[:80]}'")
    
    # ElevenLabs SDK — text_to_speech.convert()
    # Returns a generator of audio chunks — join them into bytes
    audio_chunks = eleven.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id="eleven_v3",          # latest model — matches your example
        output_format="mp3_44100_128", # 44.1kHz MP3, matches your example
        voice_settings={
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.2,
        },
    )

    audio_bytes = b"".join(audio_chunks)
    elapsed = time.time() - t_start
    logger.info(f"TTS generated {len(audio_bytes)} bytes in {elapsed:.3f}s")
    
    return {
        "audio_b64": base64.b64encode(audio_bytes).decode(),
        "format": "mp3",
    }


# ─── Pipeline ────────────────────────────────────────────────────────────────
# LangChain 1.2+ removed AgentExecutor / create_tool_calling_agent from
# `langchain.agents`. The original agent only ever ran these three tools in
# fixed order, so we call them directly (same behaviour, fewer moving parts).


def _normalize_tool_result(out) -> dict:
    """Tools may return dict or JSON string depending on LangChain version."""
    if isinstance(out, dict):
        return out
    if isinstance(out, str):
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            return {"raw": out}
    return {}


def _run_pipeline_sync(
    audio_b64: str,
    condition: str,
    voice_id: str,
    pattern_summary: str | None = None,
    keyterms_override: list | None = None,
) -> dict:
    import time
    pipeline_start = time.time()
    logger.info(
        f"Pipeline started: condition={condition}  "
        f"personalised={'yes' if pattern_summary else 'no'}"
    )
    
    t = _normalize_tool_result(
        transcribe_audio.invoke({
            "audio_b64":         audio_b64,
            "condition":         condition,
            "keyterms_override": keyterms_override,
        })
    )

    raw = t.get("raw_transcript", "")

    c = _normalize_tool_result(
        correct_speech.invoke({
            "raw_transcript":  raw,
            "condition":       condition,
            "pattern_summary": pattern_summary,
        })
    )

    corrected = c.get("corrected_text", "")
    v = _normalize_tool_result(
        synthesise_voice.invoke({"text": corrected, "voice_id": voice_id})
    )

    total_elapsed = time.time() - pipeline_start
    logger.info(f"Pipeline completed in {total_elapsed:.3f}s")

    return {
        "raw_transcript": raw,
        "corrected_text": corrected,
        "confidence": float(c.get("confidence", 0.0) or 0.0),
        "changes": c.get("changes", []) or [],
        "audio_b64": v.get("audio_b64"),
        "audio_format": v.get("format", "mp3"),
        "gemini_key_used": key_manager.active_index + 1,
    }


# ─── Public entry point ───────────────────────────────────────────────────────

async def run_agent(
    audio_b64: str,
    condition: str,
    voice_id: str = DEFAULT_VOICE_ID,
    pattern_summary: str | None = None,
    keyterms_override: list | None = None,
) -> dict:
    """
    Called by FastAPI. Runs the full pipeline and returns a clean result dict.
    """
    prev = key_manager.active_index
    try:
        return await asyncio.to_thread(
            _run_pipeline_sync,
            audio_b64,
            condition,
            voice_id,
            pattern_summary,
            keyterms_override,
        )
    except Exception:
        if key_manager.active_index != prev:
            logger.warning("Key rotated mid-run — retrying pipeline once")
            return await asyncio.to_thread(
                _run_pipeline_sync, audio_b64, condition, voice_id
            )
        raise