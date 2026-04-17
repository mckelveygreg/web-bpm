import { useCallback, useEffect, useRef, useState } from "react";
import { yin } from "../utils/yin";

const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F",
  "F♯", "G", "G♯", "A", "A♯", "B",
] as const;

const A4 = 440;

function frequencyToNote(
  freq: number,
): { note: string; octave: number; cents: number } {
  const semitones = 12 * Math.log2(freq / A4);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  // A4 is MIDI note 69 → note index 9, octave 4
  const midi = 69 + rounded;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { note: NOTE_NAMES[noteIndex]!, octave, cents };
}

const LEVEL_SMOOTHING = 0.8;

export function usePitchDetector() {
  const [note, setNote] = useState<string | null>(null);
  const [octave, setOctave] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [cents, setCents] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const disconnect = useCallback(async () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;

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

  const start = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 8192;
    analyserRef.current = analyser;
    source.connect(analyser);

    const timeBuf = new Float32Array(analyser.fftSize);
    const levelBuf = new Uint8Array(analyser.frequencyBinCount);
    let smoothedLevel = 0;

    const poll = () => {
      // Audio level (RMS)
      analyser.getByteTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) {
        const v = (levelBuf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / levelBuf.length);
      const scaled = Math.min(1, rms * 2);
      smoothedLevel =
        LEVEL_SMOOTHING * smoothedLevel + (1 - LEVEL_SMOOTHING) * scaled;
      setAudioLevel(smoothedLevel);

      // Pitch detection
      analyser.getFloatTimeDomainData(timeBuf);
      const detected = yin(timeBuf, ctx.sampleRate);

      if (detected !== null && detected >= 20 && detected <= 5000) {
        const info = frequencyToNote(detected);
        setFrequency(Math.round(detected * 10) / 10);
        setNote(info.note);
        setOctave(info.octave);
        setCents(info.cents);
      } else {
        setFrequency(null);
        setNote(null);
        setOctave(null);
        setCents(0);
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    setIsActive(true);
  }, []);

  const stop = useCallback(async () => {
    await disconnect();
    setIsActive(false);
    setNote(null);
    setOctave(null);
    setFrequency(null);
    setCents(0);
    setAudioLevel(0);
  }, [disconnect]);

  return { note, octave, frequency, cents, audioLevel, isActive, start, stop };
}
