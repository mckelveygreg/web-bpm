import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
} from "realtime-bpm-analyzer";
import type { BpmDataPoint } from "../types";

const THROTTLE_MS = 250;
const CONVERGENCE_RATE = 0.25; // move 25% of the gap per tick
const MAX_STEP = 6;           // cap per-tick movement to reject noise
const RAW_WINDOW = 5;         // rolling median window on raw readings (~1.25s)
const MIN_COUNT = 1;          // ignore candidates with fewer peak matches

type Candidate = { tempo: number; count: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Pick the best candidate, preferring one near the target or current displayed BPM.
 * Falls back to the library's top candidate if nothing is close.
 */
function pickCandidate(
  candidates: ReadonlyArray<Candidate>,
  anchor: number | null,
): Candidate | null {
  const valid = candidates.filter((c) => c.count >= MIN_COUNT);
  if (valid.length === 0) return null;

  if (anchor !== null) {
    // Find the candidate closest to the anchor (target or displayed BPM)
    let best = valid[0]!;
    let bestDist = Math.abs(best.tempo - anchor);
    for (let i = 1; i < valid.length; i++) {
      const dist = Math.abs(valid[i]!.tempo - anchor);
      if (dist < bestDist) {
        best = valid[i]!;
        bestDist = dist;
      }
    }
    return best;
  }

  return valid[0]!;
}

/**
 * Snap a candidate to the same octave as the anchor.
 * Catches half-time / double-time flips from the analyzer.
 */
function octaveCorrect(candidate: number, anchor: number): number {
  let corrected = candidate;
  while (corrected < anchor * 0.75) corrected *= 2;
  while (corrected > anchor * 1.5) corrected /= 2;
  return Math.round(corrected);
}

export function useBpmAnalyzer() {
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [timeSeries, setTimeSeries] = useState<BpmDataPoint[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<BpmAnalyzer | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastUpdateRef = useRef(0);
  const timeSeriesRef = useRef<BpmDataPoint[]>([]);
  const levelRafRef = useRef(0);
  const displayedBpmRef = useRef<number | null>(null);
  const rawBpmWindow = useRef<number[]>([]);
  const fillTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const targetBpmRef = useRef<number | null>(null);

  const setTargetBpm = useCallback((bpm: number | null) => {
    targetBpmRef.current = bpm;
  }, []);

  const disconnect = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx?.state === "running") {
      await ctx.suspend();
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserNodeRef.current?.disconnect();
    analyserNodeRef.current = null;
    analyzerRef.current?.disconnect();
    analyzerRef.current = null;

    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = 0;
    }

    if (fillTimerRef.current) {
      clearInterval(fillTimerRef.current);
      fillTimerRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    await audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [disconnect]);

  // Suspend/resume when app is backgrounded (mobile battery optimization)
  useEffect(() => {
    const handler = () => {
      const ctx = audioContextRef.current;
      if (!ctx || !isActive) return;
      if (document.hidden) {
        void ctx.suspend();
      } else {
        void ctx.resume();
      }
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isActive]);

  const start = useCallback(async (): Promise<MediaStream> => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const audioCtx = audioContextRef.current;

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const analyzer = await createRealtimeBpmAnalyzer(audioCtx, {
      continuousAnalysis: true,
      stabilizationTime: 20_000,
    });
    analyzerRef.current = analyzer;

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    // AnalyserNode on raw mic signal for audio level metering
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNodeRef.current = analyserNode;
    source.connect(analyserNode);

    // Moderate gain to bring mic peaks above the library's 0.2 minimum threshold
    // without boosting noise floor into peak range.
    // Raw mic RMS ~5-10%, peak ~0.08-0.25 → gain 3x → peaks ~0.24-0.75
    const gain = audioCtx.createGain();
    gain.gain.value = 3;

    source.connect(gain).connect(analyzer.node);

    // Poll audio level from the raw analyser node (~60fps) with EMA smoothing
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const SMOOTHING = 0.8; // 0 = no smoothing, 1 = frozen; 0.8 feels responsive but stable
    let smoothedLevel = 0;
    const pollLevel = () => {
      analyserNode.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = dataArray[i]!;
        const v = (sample - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const scaled = Math.min(1, rms * 2);
      smoothedLevel = SMOOTHING * smoothedLevel + (1 - SMOOTHING) * scaled;
      setAudioLevel(smoothedLevel);
      levelRafRef.current = requestAnimationFrame(pollLevel);
    };
    levelRafRef.current = requestAnimationFrame(pollLevel);

    const sTime = Date.now();
    startTimeRef.current = sTime;
    lastUpdateRef.current = 0;
    timeSeriesRef.current = [];
    displayedBpmRef.current = null;
    rawBpmWindow.current = [];
    setIsActive(true);
    setTimeSeries([]);
    setCurrentBpm(null);
    setIsStable(false);
    setConfidence(0);

    analyzer.on(
      "bpm",
      (data: { bpm: ReadonlyArray<Candidate> }) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;
        lastUpdateRef.current = now;

        // Prefer candidate near target BPM, then near displayed BPM, then top
        const anchor = targetBpmRef.current ?? displayedBpmRef.current;
        const top = pickCandidate(data.bpm, anchor);
        if (!top) return;

        const rounded = Math.round(top.tempo);

        // Rolling median on raw readings to reject outliers before convergence
        const rw = rawBpmWindow.current;
        rw.push(rounded);
        if (rw.length > RAW_WINDOW) rw.shift();
        const filtered = rw.length >= 3 ? median(rw) : rounded;

        // Octave-correct then proportionally converge for stable output
        const prev = displayedBpmRef.current;
        let displayed: number;
        if (prev === null) {
          displayed = filtered;
        } else {
          const corrected = octaveCorrect(filtered, prev);
          const delta = corrected - prev;
          const absDelta = Math.abs(delta);
          // Snap when close, otherwise move proportionally (capped)
          const step = absDelta <= 2
            ? absDelta
            : Math.min(MAX_STEP, Math.max(1, Math.round(absDelta * CONVERGENCE_RATE)));
          displayed = prev + Math.sign(delta) * step;
        }
        displayedBpmRef.current = displayed;

        setCurrentBpm(displayed);
        setConfidence(top.count);

        setTimeSeries((prev) => {
          const next = [
            ...prev,
            {
              timestamp: now - sTime,
              bpm: displayed,
              confidence: top.count,
            },
          ];
          timeSeriesRef.current = next;
          return next;
        });
      },
    );

    analyzer.on("analyzerReset", () => {
      displayedBpmRef.current = null;
      rawBpmWindow.current = [];
      setIsStable(false);
    });

    analyzer.on(
      "bpmStable",
      (data: { bpm: ReadonlyArray<Candidate> }) => {
        const anchor = targetBpmRef.current ?? displayedBpmRef.current;
        const top = pickCandidate(data.bpm, anchor);
        if (!top) return;

        setCurrentBpm(Math.round(top.tempo));
        setConfidence(top.count);
        setIsStable(true);

        const now = Date.now();
        setTimeSeries((prev) => {
          const next = [
            ...prev,
            {
              timestamp: now - sTime,
              bpm: Math.round(top.tempo),
              confidence: top.count,
            },
          ];
          timeSeriesRef.current = next;
          return next;
        });
      },
    );

    // Fill timer: emit the last known BPM every second so the chart stays continuous
    fillTimerRef.current = setInterval(() => {
      const displayed = displayedBpmRef.current;
      if (displayed === null) return;
      const now = Date.now();
      // Only fill if no real data arrived in the last 1.5s
      if (now - lastUpdateRef.current < 1500) return;
      setTimeSeries((prev) => {
        const next = [
          ...prev,
          { timestamp: now - sTime, bpm: displayed, confidence: 0 },
        ];
        timeSeriesRef.current = next;
        return next;
      });
    }, 1000);

    return stream;
  }, []);

  const stop = useCallback(async () => {
    await disconnect();
    setIsActive(false);
    setAudioLevel(0);
  }, [disconnect]);

  const getTimeSeries = useCallback(() => timeSeriesRef.current, []);

  return {
    currentBpm,
    isStable,
    confidence,
    timeSeries,
    isActive,
    audioLevel,
    start,
    stop,
    setTargetBpm,
    getTimeSeries,
  };
}
