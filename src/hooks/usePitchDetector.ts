/**
 * usePitchDetector – React Native hook for real-time pitch detection.
 *
 * Uses expo-av Audio.Recording with Linear PCM and polls the WAV file
 * to extract audio samples, then runs the YIN algorithm for pitch detection.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { yin } from "../yin";

const SAMPLE_RATE = 44100;
const YIN_BUFFER_SIZE = 8192;
const POLL_INTERVAL_MS = 60;
const WAV_HEADER_BYTES = 44;
const LEVEL_SMOOTHING = 0.8;

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
  const midi = 69 + rounded;
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { note: NOTE_NAMES[noteIndex]!, octave, cents };
}

function wavBytesToFloat32Mono(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numChannels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  const audioFormat = view.getUint16(20, true);

  const dataOffset = WAV_HEADER_BYTES;
  const numBytes = bytes.byteLength - dataOffset;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(numBytes / (bytesPerSample * numChannels));
  const result = new Float32Array(numSamples);

  if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getFloat32(dataOffset + (i * numChannels + ch) * 4, true);
      }
      result[i] = sum / numChannels;
    }
  } else {
    const maxVal = Math.pow(2, bitsPerSample - 1);
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const offset = dataOffset + (i * numChannels + ch) * bytesPerSample;
        const sample = bytesPerSample === 2
          ? view.getInt16(offset, true)
          : view.getInt8(offset);
        sum += sample / maxVal;
      }
      result[i] = sum / numChannels;
    }
  }

  return result;
}

export function usePitchDetector() {
  const [note, setNote] = useState<string | null>(null);
  const [octave, setOctave] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [cents, setCents] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const smoothedLevelRef = useRef(0);

  const poll = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording || !isActiveRef.current) return;

    try {
      const uri = recording.getURI();
      if (!uri) return;

      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.size === undefined) return;
      if (info.size <= WAV_HEADER_BYTES) return;

      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: info.size,
      });

      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const samples = wavBytesToFloat32Mono(bytes);
      if (samples.length < YIN_BUFFER_SIZE) return;

      // Use the most recent YIN_BUFFER_SIZE samples
      const buf = samples.slice(samples.length - YIN_BUFFER_SIZE);

      // Audio level
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        sum += buf[i]! * buf[i]!;
      }
      const rms = Math.sqrt(sum / buf.length);
      const scaled = Math.min(1, rms * 2);
      smoothedLevelRef.current =
        LEVEL_SMOOTHING * smoothedLevelRef.current + (1 - LEVEL_SMOOTHING) * scaled;
      setAudioLevel(smoothedLevelRef.current);

      // Pitch detection
      const detected = yin(buf, SAMPLE_RATE);
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
    } catch (err) {
      console.error("[PitchDetector] poll error:", err);
    }
  }, []);

  const start = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Microphone permission is required");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      android: {
        extension: ".wav",
        outputFormat: Audio.AndroidOutputFormat.DEFAULT,
        audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: ".wav",
        outputFormat: Audio.IOSOutputFormat.LINEARPCM,
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: SAMPLE_RATE,
        numberOfChannels: 1,
        bitRate: 128000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      web: { mimeType: "audio/wav", bitsPerSecond: 128000 },
      keepAudioActiveHint: true,
      isMeteringEnabled: true,
    });

    recordingRef.current = recording;
    isActiveRef.current = true;
    smoothedLevelRef.current = 0;

    await recording.startAsync();
    setIsActive(true);

    pollTimerRef.current = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }, [poll]);

  const stop = useCallback(async () => {
    isActiveRef.current = false;

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore
      }
      recordingRef.current = null;
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    setIsActive(false);
    setNote(null);
    setOctave(null);
    setFrequency(null);
    setCents(0);
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return { note, octave, frequency, cents, audioLevel, isActive, start, stop };
}
