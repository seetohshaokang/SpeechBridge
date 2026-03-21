import os
import json
import base64
import logging
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

load_dotenv()
logger = logging.getLogger(__name__)


# ─── Config ───────────────────────────────────────────────────────────────────

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel"

# Single shared ElevenLabs client — used for both STT and TTS
eleven = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

GEMINI_API_KEYS = [
    os.environ["GEMINI_API_KEY_1"],
    os.environ["GEMINI_API_KEY_2"],
    os.environ["GEMINI_API_KEY_3"],
]

_QUOTA_ERRORS = ("429", "ResourceExhausted", "RESOURCE_EXHAUSTED", "quota", "billing")


# ─── Gemini key rotation ──────────────────────────────────────────────────────

class GeminiKeyManager:
    def __init__(self, keys: list[str]):
        self.keys = keys
        self._index = 0
        self._exhausted: set[int] = set()
        self._llm = self._build(0)

    def _build(self, i: int) -> ChatGoogleGenerativeAI:
        logger.info(f"Gemini: activating key slot {i + 1}")
        return ChatGoogleGenerativeAI(
            model="gemini-3.0",
            google_api_key=self.keys[i],
            temperature=0.2,
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
def transcribe_audio(audio_b64: str, condition: str) -> dict:
    """
    Transcribes speech audio using ElevenLabs Scribe v2.
    Always call this first. Returns the raw transcript.

    Args:
        audio_b64: Base64-encoded audio (webm/wav/mp3).
        condition: One of 'dysarthria', 'stuttering', 'aphasia', 'general'.
    """
    audio_bytes = base64.b64decode(audio_b64)

    # Pick the keyterm list for this condition (fall back to general)
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
    logger.info(
        f"Scribe [{condition}] transcript: '{transcript[:100]}'"
        f"  keyterms_used={len(keyterms)}"
    )
    return {"raw_transcript": transcript}


# ─── Tool 2: Correct — Gemini reasoning ──────────────────────────────────────

@tool
def correct_speech(raw_transcript: str, condition: str) -> dict:
    """
    Takes the raw transcript and reconstructs the most likely intended sentence.
    Uses Gemini to reason about the intended meaning.
    Call this after transcribe_audio.

    Args:
        raw_transcript: The raw text output from transcribe_audio.
        condition: Speech condition — helps Gemini apply the right corrections.
    """
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

    prompt = f"""You are a speech correction specialist helping people with speech disabilities communicate clearly.

Condition: {condition}
Context: {hint}

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

    raw = response.content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        parsed = json.loads(raw)
        logger.info(
            f"Correction: '{parsed.get('corrected_text', '')[:80]}' "
            f"confidence={parsed.get('confidence', 0)}"
        )
        return parsed
    except json.JSONDecodeError:
        logger.warning(f"Gemini returned non-JSON: {raw[:200]}")
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
    return {
        "audio_b64": base64.b64encode(audio_bytes).decode(),
        "format": "mp3",
    }


# ─── Agent ────────────────────────────────────────────────────────────────────

tools = [transcribe_audio, correct_speech, synthesise_voice]

_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are SpeechBridge. You help people with speech disabilities communicate clearly.

For every request you MUST call all three tools in this exact order:
1. transcribe_audio  — get the raw transcript from ElevenLabs
2. correct_speech    — fix the transcript with Gemini
3. synthesise_voice  — convert the corrected text to audio

Never skip a step. Never change the order."""),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])


def _build_executor() -> AgentExecutor:
    agent = create_tool_calling_agent(key_manager.llm, tools, _prompt)
    return AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        max_iterations=6,
        return_intermediate_steps=True,
    )


_executor = _build_executor()


# ─── Public entry point ───────────────────────────────────────────────────────

async def run_agent(
    audio_b64: str,
    condition: str,
    voice_id: str = DEFAULT_VOICE_ID,
) -> dict:
    """
    Called by FastAPI. Runs the full pipeline and returns a clean result dict.
    """
    global _executor

    payload = json.dumps({
        "audio_b64": audio_b64,
        "condition": condition,
        "voice_id": voice_id,
    })

    prev = key_manager.active_index
    try:
        result = await _executor.ainvoke({"input": payload})
    except Exception as exc:
        if key_manager.active_index != prev:
            logger.warning("Key rotated mid-run — rebuilding executor and retrying")
            _executor = _build_executor()
            result = await _executor.ainvoke({"input": payload})
        else:
            raise

    steps = result.get("intermediate_steps", [])

    def _tool_out(name: str) -> dict:
        hit = next((s[1] for s in steps if s[0].tool == name), None)
        if isinstance(hit, dict):
            return hit
        if isinstance(hit, str):
            try:
                return json.loads(hit)
            except Exception:
                return {"raw": hit}
        return {}

    t = _tool_out("transcribe_audio")
    c = _tool_out("correct_speech")
    v = _tool_out("synthesise_voice")

    return {
        "raw_transcript":  t.get("raw_transcript", ""),
        "corrected_text":  c.get("corrected_text", ""),
        "confidence":      c.get("confidence", 0.0),
        "changes":         c.get("changes", []),
        "audio_b64":       v.get("audio_b64"),
        "audio_format":    v.get("format", "mp3"),
        "gemini_key_used": key_manager.active_index + 1,
    }