import { useCallback, useRef, useState } from "react";

const SCHEDULE_AHEAD = 0.1; // seconds to schedule ahead of current time
const LOOKAHEAD_MS = 25;    // how often to check if we need to schedule

export function useMetronome() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat, setBeat] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextBeatTimeRef = useRef(0);
  const intervalRef = useRef(0); // seconds per beat, updated live

  const setBpm = useCallback((bpm: number) => {
    intervalRef.current = 60 / bpm;
  }, []);

  const start = useCallback((bpm: number) => {
    stop();

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    intervalRef.current = 60 / bpm;

    const scheduleTick = (time: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.05);
    };

    // Schedule first beat immediately
    nextBeatTimeRef.current = ctx.currentTime;
    scheduleTick(nextBeatTimeRef.current);
    setBeat(1);
    nextBeatTimeRef.current += intervalRef.current;

    // Lookahead scheduler: uses setInterval only to check the clock,
    // actual audio is scheduled on the Web Audio timeline for precision
    timerRef.current = setInterval(() => {
      while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleTick(nextBeatTimeRef.current);
        setBeat((b) => b + 1);
        nextBeatTimeRef.current += intervalRef.current;
      }
    }, LOOKAHEAD_MS);

    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setIsPlaying(false);
    setBeat(0);
  }, []);

  return { isPlaying, beat, start, stop, setBpm };
}
