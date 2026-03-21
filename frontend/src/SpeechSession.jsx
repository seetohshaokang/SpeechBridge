import { useState, useRef, useCallback } from "react";
import { useAudioRecorder } from "./hooks/useAudioRecorder.js";

const CONDITIONS = [
  { value: "general", label: "General" },
  { value: "dysarthria", label: "Dysarthria" },
  { value: "stuttering", label: "Stuttering" },
  { value: "aphasia", label: "Aphasia" },
];

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Outward purple ripples behind the record disc; speed scales slightly with volume. */
function RecordRipples({ audioLevel }) {
  const v = audioLevel;
  const dur = `${(2.05 - v * 0.65).toFixed(2)}s`;
  return (
    <div className="ss-record-ripples" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="ss-ripple-ring"
          style={{
            animationDelay: `${i * 0.52}s`,
            animationDuration: dur,
          }}
        />
      ))}
    </div>
  );
}

export function SpeechSession({ userId = "anonymous" }) {
  const { isRecording, seconds, audioLevel, start, stop } = useAudioRecorder();
  const [condition, setCondition] = useState("general");
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);

  const handleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stop();
      setAudioBlob(blob);
    } else {
      setAudioBlob(null);
      setResult(null);
      setError(null);
      await start();
    }
  }, [isRecording, start, stop]);

  const handleSubmit = useCallback(async () => {
    if (!audioBlob) return;
    setProcessing(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("audio", audioBlob, "recording.webm");
    form.append("condition", condition);
    form.append("user_id", userId);

    try {
      const resp = await fetch(`${API_URL}/process`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail ?? `Server returned ${resp.status}`);
      }
      setResult(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }, [audioBlob, condition, userId]);

  const playResult = useCallback(() => {
    if (!result?.audio_b64 || !audioRef.current) return;
    audioRef.current.src = `data:audio/mp3;base64,${result.audio_b64}`;
    audioRef.current.play();
  }, [result]);

  /**
   * Elegant, volume-reactive logo: still at silence; soft pulse + tiny drift when you speak.
   * Motion scales with `audioLevel` — no jitter unless there’s signal.
   */
  const t = typeof performance !== "undefined" ? performance.now() * 0.001 : 0;
  const v = audioLevel;
  const logoStyle = (() => {
    if (!isRecording) {
      return {
        transform: "scale(1) translateZ(0)",
        filter: "drop-shadow(0 0 10px rgb(168 85 247 / 0.3))",
      };
    }
    const slow = Math.sin(t * 2.4);
    const slow2 = Math.cos(t * 1.9);
    // Max ~1.4px drift at full level — multiplied by v so quiet = calm
    const drift = v * 1.45;
    const tx = slow * drift * 0.65;
    const ty = slow2 * drift * 0.5;
    const rotDeg = slow * v * 0.35;
    // Clearer “breathing” with volume — still capped so it doesn’t feel jumpy
    const baseScale = 1 + v * 0.16 + slow * v * 0.028;
    const glowPx = 10 + v * 14;
    const glowA = 0.2 + v * 0.22;
    return {
      transform: `translate(${tx}px, ${ty}px) rotate(${rotDeg}deg) scale(${baseScale}) translateZ(0)`,
      filter: `drop-shadow(0 0 ${glowPx}px rgb(168 85 247 / ${glowA}))`,
    };
  })();

  /** Outer disc + ring: subtle motion tied to volume (separate from logo). */
  const discStyle = (() => {
    if (!isRecording) return undefined;
    const slow = Math.sin(t * 2.4);
    const slow2 = Math.cos(t * 1.9);
    const drift = v * 0.85;
    const tx = slow * drift * 0.45;
    const ty = slow2 * drift * 0.38;
    const s = 1 + v * 0.042 + slow * v * 0.014;
    return {
      transform: `translate(${tx}px, ${ty}px) scale(${s}) translateZ(0)`,
      boxShadow: `0 0 ${14 + v * 26}px rgb(168 85 247 / ${0.22 + v * 0.28})`,
    };
  })();

  return (
    <section className="speech-session">
      <h2 className="ss-heading">Record your speech</h2>
      <p className="ss-sub">
        Tap the logo, say something, then submit. The AI will transcribe, correct,
        and read it back.
      </p>

      {/* Condition selector */}
      <div className="ss-condition-row">
        <label htmlFor="condition-select">Condition</label>
        <select
          id="condition-select"
          className="ss-select"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          disabled={isRecording || processing}
        >
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Logo + outer disc + ripples */}
      <div className="ss-logo-record">
        <div className="ss-logo-orbit">
          {isRecording && <RecordRipples audioLevel={v} />}
          <div
            className={`ss-logo-disc${isRecording ? " ss-logo-disc--active" : ""}`}
            style={discStyle}
            aria-hidden
          />
          <button
            type="button"
            className={`ss-logo-btn${isRecording ? " ss-logo-btn--active" : ""}`}
            onClick={handleRecord}
            disabled={processing}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
          >
            <span className="ss-logo-img-wrap">
              <img
                src="/speechbridge-logo.png"
                alt="Record"
                className={`ss-logo-img${isRecording ? " ss-logo-img--live" : ""}`}
                draggable={false}
                style={logoStyle}
              />
            </span>
          </button>
        </div>
        <span className="ss-logo-hint">
          {isRecording
            ? `Recording… ${formatTime(seconds)}`
            : audioBlob
              ? "Tap logo to record again"
              : "Tap logo to record"}
        </span>
      </div>

      {/* Preview + submit */}
      {audioBlob && !isRecording && (
        <div className="ss-actions">
          <audio controls src={URL.createObjectURL(audioBlob)} className="ss-preview" />
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={processing}
          >
            {processing ? "Processing…" : "Submit for correction"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && <p className="ss-error">Error: {error}</p>}

      {/* Results */}
      {result && (
        <div className="ss-results">
          <div className="ss-result-card">
            <h3>What you said</h3>
            <p className="ss-transcript">{result.raw_transcript || "—"}</p>
          </div>

          <div className="ss-result-card ss-result-card--corrected">
            <h3>
              Corrected{" "}
              <span className="ss-confidence">
                {Math.round((result.confidence ?? 0) * 100)}% confidence
              </span>
            </h3>
            <p className="ss-transcript">{result.corrected_text || "—"}</p>
            {result.changes?.length > 0 && (
              <ul className="ss-changes">
                {result.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </div>

          {result.audio_b64 && (
            <button className="btn btn--primary" onClick={playResult}>
              🔊 Play corrected audio
            </button>
          )}

          <audio ref={audioRef} className="ss-hidden" />

          <p className="ss-meta">
            Processed in {result.processing_ms}ms · Gemini key #{result.gemini_key_used}
          </p>
        </div>
      )}
    </section>
  );
}
