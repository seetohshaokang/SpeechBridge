import { useState, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAudioRecorder } from "./hooks/useAudioRecorder.js";
import {
  CONDITION_ORDER,
  ONBOARDING_BY_CONDITION,
} from "./onboarding/onboardingData.js";
import { VoiceCloneRecorder } from "./VoiceCloneRecorder.jsx";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

console.log("[OnboardingFlow] Initialized with API_URL:", API_URL);

function ConditionInfoButton({ label, description }) {
  return (
    <span className="onb-info">
      <button
        type="button"
        className="onb-info-btn"
        aria-label={`More about ${label}`}
      >
        ?
      </button>
      <span className="onb-info-popover" role="tooltip">
        <strong className="onb-info-title">{label}</strong>
        <p className="onb-info-text">{description}</p>
      </span>
    </span>
  );
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Per-phrase recorder: record → submit to /process silently → mark done.
 * Resets when `phraseKey` changes (new phrase).
 */
function PhraseRecorder({ conditionId, userId, phraseKey, onSubmitted }) {
  const { isRecording, seconds, audioLevel, start, stop, discard } =
    useAudioRecorder();
  const [audioBlob, setAudioBlob] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    discard();
    setAudioBlob(null);
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [phraseKey, discard]);

  const handleToggleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stop();
      setAudioBlob(blob);
    } else {
      setAudioBlob(null);
      setSubmitted(false);
      setError(null);
      await start();
    }
  }, [isRecording, start, stop]);

  const handleSubmit = useCallback(async () => {
    if (!audioBlob) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append("audio", audioBlob, "recording.webm");
    form.append("condition", conditionId);
    form.append("user_id", userId);

    console.log("[OnboardingFlow] Submitting audio to backend:", {
      apiUrl: API_URL,
      endpoint: `${API_URL}/process`,
      condition: conditionId,
      userId: userId,
      audioBlobSize: audioBlob.size,
    });

    try {
      const resp = await fetch(`${API_URL}/process`, {
        method: "POST",
        body: form,
      });

      console.log("[OnboardingFlow] Received response:", {
        status: resp.status,
        statusText: resp.statusText,
        ok: resp.ok,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error("[OnboardingFlow] Request failed:", {
          status: resp.status,
          body,
        });
        throw new Error(body.detail ?? `Server returned ${resp.status}`);
      }
      
      const result = await resp.json();
      console.log("[OnboardingFlow] Success:", {
        hasResult: !!result,
        processingMs: result.processing_ms,
      });
      setSubmitted(true);
      onSubmitted();
    } catch (e) {
      console.error("[OnboardingFlow] Error:", {
        message: e?.message,
        error: e,
      });
      setError(e?.message ?? "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [audioBlob, conditionId, userId, onSubmitted]);

  const v = audioLevel;
  const pulseScale = isRecording ? 1 + v * 0.15 : 1;

  return (
    <div className="onb-recorder">
      <button
        type="button"
        className={`onb-rec-btn${isRecording ? " onb-rec-btn--active" : ""}${submitted ? " onb-rec-btn--done" : ""}`}
        onClick={handleToggleRecord}
        disabled={submitting || submitted}
        style={{ transform: `scale(${pulseScale})` }}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {submitted ? (
          <span className="onb-rec-check" aria-hidden>✓</span>
        ) : isRecording ? (
          <span className="onb-rec-stop" aria-hidden />
        ) : (
          <img
            src="/speechbridge-logo.png"
            alt="Record"
            className="onb-rec-logo"
            draggable={false}
          />
        )}
      </button>

      <span className="onb-rec-status">
        {submitted
          ? "Recorded"
          : submitting
            ? "Processing…"
            : isRecording
              ? `Recording… ${formatTime(seconds)}`
              : audioBlob
                ? "Tap Submit to continue"
                : "Tap to record"}
      </span>

      {audioBlob && !isRecording && !submitted && (
        <button
          type="button"
          className="btn btn--primary onb-rec-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Processing…" : "Submit"}
        </button>
      )}

      {error && <p className="onb-error">{error}</p>}
    </div>
  );
}

export function OnboardingFlow({ userId = "anonymous" }) {
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const [phase, setPhase] = useState("pick");
  const [conditionId, setConditionId] = useState(null);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phraseSubmitted, setPhraseSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const data = conditionId ? ONBOARDING_BY_CONDITION[conditionId] : null;
  const totalPhrases = data?.phrases?.length ?? 0;

  const handlePick = useCallback((id) => {
    setConditionId(id);
    setPhraseIndex(0);
    setPhraseSubmitted(false);
    setPhase("phrases");
    setError(null);
  }, []);

  const handleNext = useCallback(async () => {
    if (!data) return;
    if (phraseIndex < totalPhrases - 1) {
      setPhraseIndex((i) => i + 1);
      setPhraseSubmitted(false);
      return;
    }
    setPhase("voice-clone");
  }, [data, phraseIndex, totalPhrases]);

  const handleFinishOnboarding = useCallback(async () => {
    setPhase("saving");
    setError(null);
    try {
      await completeOnboarding({ condition: conditionId });
    } catch (e) {
      setError(e?.message ?? "Something went wrong");
      setPhase("voice-clone");
    }
  }, [completeOnboarding, conditionId]);

  const handleBack = useCallback(() => {
    if (phase === "phrases" && phraseIndex > 0) {
      setPhraseIndex((i) => i - 1);
      setPhraseSubmitted(false);
      return;
    }
    if (phase === "phrases") {
      setPhase("pick");
      setConditionId(null);
      setPhraseIndex(0);
      setPhraseSubmitted(false);
    }
  }, [phase, phraseIndex]);

  if (phase === "pick") {
    return (
      <section className="onb onb--pick" aria-labelledby="onb-pick-title">
        <h1 id="onb-pick-title" className="onb-title">
          Welcome — what would you like to focus on?
        </h1>
        <p className="onb-lead">
          Choose the option that best matches your goals. You&apos;ll read a few
          practice phrases aloud so we can tailor coaching to you.
        </p>
        <ul className="onb-cards">
          {CONDITION_ORDER.map((id) => {
            const c = ONBOARDING_BY_CONDITION[id];
            return (
              <li key={id} className="onb-card-li">
                <div className="onb-card-split">
                  <button
                    type="button"
                    className="onb-card"
                    onClick={() => handlePick(id)}
                  >
                    <span className="onb-card-title">{c.label}</span>
                    <span className="onb-card-hint">
                      {id === "dysarthria" && "Consonant clusters & clarity"}
                      {id === "stuttering" && "First sounds & smooth starts"}
                      {id === "aphasia" && "Words for people, places & daily life"}
                      {id === "general" && "Everyday conversation"}
                    </span>
                  </button>
                  <div
                    className="onb-card-info-slot"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <ConditionInfoButton
                      label={c.label}
                      description={c.description}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  if (phase === "phrases" && data) {
    const phrase = data.phrases[phraseIndex];
    const stepNum = phraseIndex + 1;
    const phraseKey = `${conditionId}-${phraseIndex}`;

    return (
      <section
        className="onb onb--phrases"
        aria-labelledby="onb-phrase-title"
      >
        <div className="onb-toolbar">
          <button type="button" className="onb-back-link" onClick={handleBack}>
            ← Back
          </button>
          <span className="onb-progress">
            Phrase {stepNum} of {totalPhrases}
          </span>
          <span className="onb-toolbar-spacer" aria-hidden />
        </div>

        <p className="onb-condition-pill">
          {data.shortLabel}
          <ConditionInfoButton label={data.label} description={data.description} />
        </p>

        <h1 id="onb-phrase-title" className="onb-sr-only">
          Practice phrase {stepNum}
        </h1>
        <p className="onb-phrase">{phrase}</p>
        <p className="onb-instruction">
          Record yourself reading this phrase aloud.
        </p>

        <PhraseRecorder
          conditionId={conditionId}
          userId={userId}
          phraseKey={phraseKey}
          onSubmitted={() => setPhraseSubmitted(true)}
        />

        {error && <p className="onb-error">{error}</p>}

        <div className="onb-actions">
          <button
            type="button"
            className="btn btn--primary onb-next"
            onClick={handleNext}
            disabled={!phraseSubmitted}
          >
            {stepNum >= totalPhrases ? "Finish & start" : "Next phrase"}
          </button>
        </div>
      </section>
    );
  }

  if (phase === "voice-clone" && data) {
    return (
      <section className="onb onb--voice-clone" aria-labelledby="onb-vc-title">
        <div className="onb-toolbar">
          <button type="button" className="onb-back-link" onClick={() => setPhase("phrases")}>
            ← Back
          </button>
          <span className="onb-progress">Optional</span>
          <span className="onb-toolbar-spacer" aria-hidden />
        </div>

        <h1 id="onb-vc-title" className="onb-title">
          Clone your voice
        </h1>
        <p className="onb-lead">
          Read the passage below so we can make the output audio sound like you.
          This takes about a minute.
        </p>

        <VoiceCloneRecorder
          userId={userId}
          script={data.voiceScript}
          onComplete={handleFinishOnboarding}
          onSkip={handleFinishOnboarding}
        />

        {error && <p className="onb-error">{error}</p>}
      </section>
    );
  }

  if (phase === "saving") {
    return (
      <section className="onb onb--saving">
        <p className="onb-saving">Saving your profile…</p>
      </section>
    );
  }

  return null;
}
