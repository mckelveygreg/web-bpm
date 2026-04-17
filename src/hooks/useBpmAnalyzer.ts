import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeBpmAnalyzer,
  type BpmAnalyzer,
} from "realtime-bpm-analyzer";
import type { BpmDataPoint } from "../types";

const THROTTLE_MS = 200;
const MIN_CONFIDENCE = 2;

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
  const bpmWindowRef = useRef<number[]>([]);
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


    source.connect(analyzer.node);

    // Poll audio level from the raw analyser node (~60fps) with EMA smoothing
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const SMOOTHING = 0.8;
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
    bpmWindowRef.current = [];
    setIsActive(true);
    setTimeSeries([]);
    setCurrentBpm(null);
    setIsStable(false);
    setConfidence(0);

    analyzer.on(
      "bpm",
      (data: { bpm: ReadonlyArray<{ tempo: number; count: number }> }) => {
        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;

        const top = data.bpm[0];
        if (!top) return;

        const raw = Math.round(top.tempo);
        const reliable = top.count >= MIN_CONFIDENCE;

        if (!reliable) return;

        lastUpdateRef.current = now;

        const win = bpmWindowRef.current;

        // Outlier rejection: if we have an established reading, ignore wild jumps
        if (win.length >= 3) {
          const sorted = [...win].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)]!;
          if (Math.abs(raw - median) / median > 0.3) return;
        }

        win.push(raw);
        if (win.length > 15) win.shift();

        // Use median for display — robust to remaining outliers
        const sorted = [...win].sort((a, b) => a - b);
        const avg = sorted[Math.floor(sorted.length / 2)]!;

        setCurrentBpm(avg);
        setConfidence(top.count);

        setTimeSeries((prev) => {
          const next = [
            ...prev,
            { timestamp: now - sTime, bpm: avg, confidence: top.count },
          ];
          timeSeriesRef.current = next;
          return next;
        });
      },
    );

    analyzer.on("analyzerReset", () => {
      bpmWindowRef.current = [];
      setIsStable(false);
    });

    analyzer.on(
      "bpmStable",
      (data: { bpm: ReadonlyArray<{ tempo: number; count: number }> }) => {
        const top = data.bpm[0];
        if (!top) return;

        const raw = Math.round(top.tempo);

        const win = bpmWindowRef.current;

        if (win.length >= 3) {
          const sorted = [...win].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)]!;
          if (Math.abs(raw - median) / median > 0.3) return;
        }

        win.push(raw);
        if (win.length > 15) win.shift();

        const sorted = [...win].sort((a, b) => a - b);
        const avg = sorted[Math.floor(sorted.length / 2)]!;

        setCurrentBpm(avg);
        setConfidence(top.count);
        setIsStable(true);

        const now = Date.now();
        setTimeSeries((prev) => {
          const next = [
            ...prev,
            { timestamp: now - sTime, bpm: avg, confidence: top.count },
          ];
          timeSeriesRef.current = next;
          return next;
        });
      },
    );

    // Emit null data points every second when no real data arrives, so the chart keeps scrolling
    fillTimerRef.current = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 1500) return;
      setTimeSeries((prev) => {
        const next = [
          ...prev,
          { timestamp: now - sTime, bpm: null, confidence: 0 },
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
