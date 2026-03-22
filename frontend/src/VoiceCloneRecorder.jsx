import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAudioRecorder } from "./hooks/useAudioRecorder.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Reusable voice-clone recorder used by both onboarding and the dashboard.
 *
 * Props:
 *  - userId        : Clerk user ID
 *  - script        : the reading passage to display
 *  - onComplete    : called after voice is cloned and saved
 *  - onSkip?       : called when user presses "Skip" (omit to hide skip button)
 *  - existingVoice?: truthy if user already has a cloned voice
 */
export function VoiceCloneRecorder({ userId, script, onComplete, onSkip, existingVoice }) {
  const { isRecording, seconds, audioLevel, start, stop, discard } = useAudioRecorder();
  const setVoice = useMutation(api.users.setVoice);

  const [audioBlob, setAudioBlob] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | recording | cloning | done | error
  const [error, setError] = useState(null);

  const handleToggleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stop();
      setAudioBlob(blob);
      setStatus("idle");
    } else {
      setAudioBlob(null);
      setError(null);
      setStatus("recording");
      await start();
    }
  }, [isRecording, start, stop]);

  const handleDiscard = useCallback(() => {
    discard();
    setAudioBlob(null);
    setStatus("idle");
    setError(null);
  }, [discard]);

  const handleClone = useCallback(async () => {
    if (!audioBlob) return;
    setStatus("cloning");
    setError(null);

    try {
      const form = new FormData();
      form.append("audio", audioBlob, "voice-sample.webm");
      form.append("user_id", userId);

      const resp = await fetch(`${API_URL}/clone-voice`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server returned ${resp.status}`);
      }

      const { voice_id } = await resp.json();

      await setVoice({ user_id: userId, voice_id });
      setStatus("done");
      onComplete?.();
    } catch (e) {
      setError(e?.message ?? "Voice cloning failed");
      setStatus("idle");
    }
  }, [audioBlob, userId, setVoice, onComplete]);

  const v = audioLevel;
  const pulseScale = isRecording ? 1 + v * 0.15 : 1;

  return (
    <div className="vc-recorder">
      <div className="vc-script-box">
        <p className="vc-script-label">Read this aloud at a natural pace:</p>
        <p className="vc-script-text">{script}</p>
      </div>

      <div className="vc-controls">
        <button
          type="button"
          className={`onb-rec-btn${isRecording ? " onb-rec-btn--active" : ""}${status === "done" ? " onb-rec-btn--done" : ""}`}
          onClick={handleToggleRecord}
          disabled={status === "cloning" || status === "done"}
          style={{ transform: `scale(${pulseScale})` }}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {status === "done" ? (
            <span className="onb-rec-check" aria-hidden>✓</span>
          ) : isRecording ? (
            <span className="onb-rec-stop" aria-hidden />
          ) : (
            <span className="vc-mic-icon" aria-hidden>🎙</span>
          )}
        </button>

        <span className="onb-rec-status">
          {status === "done"
            ? "Voice cloned!"
            : status === "cloning"
              ? "Cloning your voice…"
              : isRecording
                ? `Recording… ${formatTime(seconds)}`
                : audioBlob
                  ? `${formatTime(Math.round(audioBlob.size / 16000))} recorded — ready to clone`
                  : existingVoice
                    ? "Record again to update your voice"
                    : "Tap to start recording"}
        </span>
      </div>

      {audioBlob && !isRecording && status !== "done" && (
        <div className="vc-action-row">
          <button
            type="button"
            className="btn btn--primary vc-clone-btn"
            onClick={handleClone}
            disabled={status === "cloning"}
          >
            {status === "cloning" ? "Cloning…" : "Clone my voice"}
          </button>
          <button
            type="button"
            className="btn btn--ghost vc-discard-btn"
            onClick={handleDiscard}
            disabled={status === "cloning"}
          >
            Re-record
          </button>
        </div>
      )}

      {error && <p className="onb-error">{error}</p>}

      {onSkip && status !== "done" && (
        <button
          type="button"
          className="vc-skip-btn"
          onClick={onSkip}
          disabled={status === "cloning"}
        >
          Skip for now
        </button>
      )}
    </div>
  );
}
