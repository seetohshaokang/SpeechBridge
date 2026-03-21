import { useState, useRef, useCallback } from "react";

/**
 * Hook that wraps the MediaRecorder API.
 *
 * Returns { isRecording, seconds, start, stop }
 * `stop` resolves with a Blob (webm audio).
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const resolveBlob = useRef(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

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

  return { isRecording, seconds, start, stop };
}
