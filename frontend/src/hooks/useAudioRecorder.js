import { useState, useRef, useCallback } from "react";

/**
 * Hook that wraps the MediaRecorder API + Web Audio AnalyserNode.
 *
 * Returns { isRecording, seconds, audioLevel, analyserRef, start, stop }
 *   - audioLevel: 0‑1 normalised RMS amplitude (updates ~60 fps via rAF)
 *   - analyserRef: ref to the AnalyserNode (for custom drawing)
 * `stop` resolves with a Blob (webm audio).
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const resolveBlob = useRef(null);

  const audioCtx = useRef(null);
  const analyserRef = useRef(null);
  const rafId = useRef(null);
  const dataArray = useRef(null);

  function pollLevel() {
    if (!analyserRef.current || !dataArray.current) return;
    analyserRef.current.getByteFrequencyData(dataArray.current);
    let sum = 0;
    for (let i = 0; i < dataArray.current.length; i++) sum += dataArray.current[i];
    const avg = sum / dataArray.current.length / 255;
    // Curve so quiet speech still moves the UI; cap at 1
    setAudioLevel(Math.min(Math.pow(Math.max(avg, 0), 0.55) * 2.4, 1));
    rafId.current = requestAnimationFrame(pollLevel);
  }

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Browsers start AudioContext suspended until resumed (often after tap)
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    audioCtx.current = ctx;
    analyserRef.current = analyser;
    dataArray.current = new Uint8Array(analyser.frequencyBinCount);
    rafId.current = requestAnimationFrame(pollLevel);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    chunks.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      cancelAnimationFrame(rafId.current);
      audioCtx.current?.close();
      audioCtx.current = null;
      analyserRef.current = null;
      setAudioLevel(0);
      const blob = new Blob(chunks.current, { type: mimeType });
      resolveBlob.current?.(blob);
      resolveBlob.current = null;
    };

    mediaRecorder.current = recorder;
    recorder.start(250);
    setIsRecording(true);
    setSeconds(0);

    timer.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      resolveBlob.current = resolve;
      mediaRecorder.current?.stop();
      setIsRecording(false);
    });
  }, []);

  /** Stop an in-progress recording without resolving a blob (e.g. “New session”). */
  const discard = useCallback(() => {
    resolveBlob.current = null;
    clearInterval(timer.current);
    timer.current = null;
    cancelAnimationFrame(rafId.current);
    rafId.current = null;
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    setIsRecording(false);
    setSeconds(0);
    setAudioLevel(0);
  }, []);

  return { isRecording, seconds, audioLevel, analyserRef, start, stop, discard };
}
