import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useBeatNetAnalyzer } from "./useBeatNetAnalyzer";
import { useAudioRecorder } from "./useAudioRecorder";
import { saveSession } from "../services/db";
import type { Session } from "../types";

export interface SessionMetadata {
  name: string;
  venue: string;
  genre: string;
  notes: string;
}

export interface UseSessionReturn {
  currentBpm: number | null;
  isStable: boolean;
  confidence: number;
  timeSeries: { timestamp: number; bpm: number | null; confidence: number }[];
  isActive: boolean;
  audioLevel: number;
  elapsed: number;
  isRecordingAudio: boolean;
  modelReady: boolean;
  modelLoading: boolean;
  initModel: () => void;
  metadata: SessionMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<SessionMetadata>>;
  setTargetBpm: (bpm: number | null) => void;
  start: (recordAudio: boolean) => Promise<void>;
  stop: () => Promise<Session>;
}

export function useSession(): UseSessionReturn {
  const bpm = useBeatNetAnalyzer();
  const recorder = useAudioRecorder();

  const [elapsed, setElapsed] = useState(0);
  const [metadata, setMetadata] = useState<SessionMetadata>({
    name: "",
    venue: "",
    genre: "",
    notes: "",
  });

  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef("");
  const recordAudioRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  const targetBpmRef = useRef<number | null>(null);

  const setTargetBpm = useCallback((val: number | null) => {
    targetBpmRef.current = val;
    bpm.setTempoPrior(val);
  }, [bpm.setTempoPrior]);

  // Keep stable refs so stop() always sees latest function versions
  const bpmStopRef = useRef(bpm.stop);
  bpmStopRef.current = bpm.stop;
  const bpmGetTimeSeriesRef = useRef(bpm.getTimeSeries);
  bpmGetTimeSeriesRef.current = bpm.getTimeSeries;
  const recorderStopRef = useRef(recorder.stopRecording);
  recorderStopRef.current = recorder.stopRecording;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
      }
    };
  }, []);

  const start = useCallback(
    async (recordAudio: boolean) => {
      sessionIdRef.current = uuidv4();
      recordAudioRef.current = recordAudio;
      startTimeRef.current = Date.now();
      setElapsed(0);

      const stream = await bpm.start();

      if (recordAudio) {
        recorder.startRecording(stream);
      }

      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 500);

      // Request wake lock
      if ("wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {
          // Wake lock not available or denied — continue without it
        }
      }
    },
    [bpm.start, recorder.startRecording],
  );

  const stop = useCallback(async (): Promise<Session> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Await the audio blob before stopping the BPM analyzer (which kills
    // the stream). MediaRecorder needs the stream alive to flush final data.
    let audioBlob: Blob | undefined;
    if (recordAudioRef.current) {
      const blob = await recorderStopRef.current();
      audioBlob = blob ?? undefined;
    }

    await bpmStopRef.current();

    // Release wake lock
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }

    const duration = Date.now() - startTimeRef.current;
    const md = metadataRef.current;

    const session: Session = {
      id: sessionIdRef.current,
      name: md.name || `Session ${new Date().toLocaleDateString()}`,
      venue: md.venue,
      genre: md.genre,
      notes: md.notes,
      createdAt: new Date(startTimeRef.current),
      duration,
      bpmTimeSeries: bpmGetTimeSeriesRef.current(),
      targetBpm: targetBpmRef.current,
      audioBlob,
    };

    await saveSession(session);
    return session;
  }, []);

  return {
    currentBpm: bpm.currentBpm,
    isStable: bpm.isStable,
    confidence: bpm.confidence,
    timeSeries: bpm.timeSeries,
    isActive: bpm.isActive,
    audioLevel: bpm.audioLevel,
    elapsed,
    isRecordingAudio: recorder.isRecording,
    modelReady: bpm.modelReady,
    modelLoading: bpm.modelLoading,
    initModel: bpm.initModel,
    metadata,
    setMetadata,
    setTargetBpm,
    start,
    stop,
  };
}
