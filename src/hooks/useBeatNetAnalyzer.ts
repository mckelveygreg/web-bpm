import { useCallback, useEffect, useRef, useState } from "react";
import type { BpmDataPoint } from "../types";
import beatnetWorkerUrl from "../workers/beatnet-worker.ts?worker&url";
import beatnetProcessorSource from "../workers/beatnet-processor.ts?raw";

const SAMPLE_RATE = 22050;

export function useBeatNetAnalyzer() {
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [timeSeries, setTimeSeries] = useState<BpmDataPoint[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef(0);
  const timeSeriesRef = useRef<BpmDataPoint[]>([]);
  const startTimeRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const fillTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmWindowRef = useRef<number[]>([]);
  const tempoPriorRef = useRef<number | null>(null);

  const setTempoPrior = useCallback((bpm: number | null) => {
    tempoPriorRef.current = bpm;
    workerRef.current?.postMessage({ type: "setTempoPrior", bpm });
  }, []);

  const disconnect = useCallback(async () => {
    const ctx = audioContextRef.current;
    if (ctx?.state === "running") {
      await ctx.suspend();
    }

    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserNodeRef.current?.disconnect();
    analyserNodeRef.current = null;

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

    workerRef.current?.postMessage({ type: "reset" });

    await audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      void disconnect();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [disconnect]);

  // Suspend/resume when app is backgrounded
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

  const initModel = useCallback(async () => {
    if (workerRef.current || modelLoading) return;
    setModelLoading(true);

    const worker = new Worker(beatnetWorkerUrl, { type: "module" });
    workerRef.current = worker;

    return new Promise<void>((resolve, reject) => {
      worker.onerror = (event) => {
        console.error("Worker error:", event.message, event.filename, event.lineno);
        setModelLoading(false);
        reject(new Error(event.message));
      };

      worker.onmessage = (e) => {
        const data = e.data;
        if (data.type === "ready") {
          setModelReady(true);
          setModelLoading(false);

          // Switch to production message handler
          worker.onmessage = handleWorkerMessage;
          resolve();
        } else if (data.type === "error") {
          setModelLoading(false);
          reject(new Error(data.message));
        }
      };

      worker.postMessage({ type: "init", baseUrl: import.meta.env.BASE_URL });
    });
  }, [modelLoading]);

  const handleWorkerMessage = useCallback(
    (e: MessageEvent) => {
      const data = e.data;
      if (data.type === "bpm") {
        const now = Date.now();
        let raw = data.bpm as number;
        const conf = data.confidence as number;

        // Octave correction: if a tempo prior is set, check if the raw
        // estimate is near a half or double of the target and correct it
        const prior = tempoPriorRef.current;
        if (prior !== null) {
          const ratio = raw / prior;
          // Within ~15% of half the target? → double it
          if (ratio > 0.42 && ratio < 0.58) raw *= 2;
          // Within ~15% of double the target? → halve it
          else if (ratio > 1.7 && ratio < 2.3) raw /= 2;
        }

        lastUpdateRef.current = now;

        const win = bpmWindowRef.current;

        // Detect tempo change: if new value diverges >10% from median,
        // clear the window so we adapt quickly instead of rejecting it
        if (win.length >= 3) {
          const sorted = [...win].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)]!;
          if (Math.abs(raw - median) / median > 0.1) {
            win.length = 0; // reset — tempo changed
          }
        }

        win.push(raw);
        if (win.length > 25) win.shift();

        const sorted = [...win].sort((a, b) => a - b);
        const bpm = sorted[Math.floor(sorted.length / 2)]!;

        setCurrentBpm(bpm);
        setConfidence(conf);
        setIsStable(conf > 0.5);

        setTimeSeries((prev) => {
          const next = [
            ...prev,
            {
              timestamp: now - startTimeRef.current,
              bpm,
              confidence: conf,
            },
          ];
          timeSeriesRef.current = next;
          return next;
        });
      }
    },
    [],
  );

  const start = useCallback(async (): Promise<MediaStream> => {
    // Initialize model if not ready
    if (!workerRef.current) {
      try {
        await initModel();
      } catch (err) {
        console.error("Failed to initialize BeatNet model:", err);
        throw err;
      }
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    const audioCtx = audioContextRef.current;

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Register AudioWorklet processor
    // Loading `.ts?url` can emit a `data:video/mp2t` URL (from the `.ts` MIME map),
    // which browsers reject for AudioWorklet modules. Use raw source + Blob with
    // explicit JavaScript MIME so deployed builds load reliably.
    const processorBlob = new Blob([beatnetProcessorSource], {
      type: "text/javascript",
    });
    const processorUrl = URL.createObjectURL(processorBlob);
    try {
      await audioCtx.audioWorklet.addModule(processorUrl);
    } finally {
      URL.revokeObjectURL(processorUrl);
    }

    const workletNode = new AudioWorkletNode(audioCtx, "beatnet-processor");
    workletNodeRef.current = workletNode;

    // Forward audio hops from worklet to web worker
    workletNode.port.onmessage = (e) => {
      workerRef.current?.postMessage(e.data);
    };

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    // Audio level metering on raw signal
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNodeRef.current = analyserNode;
    source.connect(analyserNode);

    source.connect(workletNode);
    // worklet doesn't output audio — connect to nothing (just processes)

    // Poll audio level
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

    // Fill timer for chart continuity
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
  }, [initModel]);

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
    modelReady,
    modelLoading,
    initModel,
    start,
    stop,
    getTimeSeries,
    setTempoPrior,
  };
}
