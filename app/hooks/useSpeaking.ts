"use client";

import { useEffect, useState } from "react";

const SAMPLE_INTERVAL_MS = 200;
const SPEAKING_THRESHOLD = 0.035;
// Keep the indicator on briefly between words so it doesn't flicker.
const RELEASE_MS = 450;

let sharedContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const WindowAudioContext =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!WindowAudioContext) return null;
  sharedContext ??= new WindowAudioContext();
  return sharedContext;
};

/** True while the stream's audio is above a speaking threshold. */
export const useSpeaking = (stream: MediaStream | null, enabled = true) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioTrack = stream?.getAudioTracks()[0] ?? null;

  useEffect(() => {
    if (!enabled || !audioTrack) return;
    const context = getAudioContext();
    if (!context) return;

    void context.resume().catch(() => {});
    const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let lastLoudAt = 0;
    let speaking = false;

    const intervalId = window.setInterval(() => {
      // Nobody can see the indicator in a background tab; skip the work.
      if (document.hidden) {
        lastLoudAt = 0;
      } else if (!audioTrack.enabled || audioTrack.readyState !== "live") {
        lastLoudAt = 0;
      } else {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        if (Math.sqrt(sum / samples.length) > SPEAKING_THRESHOLD) {
          lastLoudAt = performance.now();
        }
      }

      const next = performance.now() - lastLoudAt < RELEASE_MS;
      if (next !== speaking) {
        speaking = next;
        setIsSpeaking(next);
      }
    }, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      setIsSpeaking(false);
    };
  }, [audioTrack, enabled]);

  return enabled && Boolean(audioTrack) && isSpeaking;
};
