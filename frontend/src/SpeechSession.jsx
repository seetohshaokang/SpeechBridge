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

export function SpeechSession({ userId = "anonymous" }) {
  const { isRecording, seconds, start, stop } = useAudioRecorder();
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

  return (
    <section className="speech-session">
      <h2 className="ss-heading">Record your speech</h2>
      <p className="ss-sub">
        Tap the mic, say something, then submit. The AI will transcribe, correct,
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

      {/* Mic button */}
      <button
        className={`ss-mic-btn ${isRecording ? "ss-mic-btn--active" : ""}`}
        onClick={handleRecord}
        disabled={processing}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <span className="ss-mic-icon">{isRecording ? "⏹" : "🎙️"}</span>
        <span className="ss-mic-label">
          {isRecording
            ? `Recording… ${formatTime(seconds)}`
            : audioBlob
              ? "Record again"
              : "Tap to record"}
        </span>
      </button>

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
