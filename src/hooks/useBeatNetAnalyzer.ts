/**
 * useBeatNetAnalyzer – React Native hook for real-time BPM detection.
 *
 * Uses expo-av Audio.Recording with Linear PCM encoding to capture
 * microphone audio, runs it through the BeatNet CRNN pipeline via
 * onnxruntime-react-native, and applies a particle-filter cascade for
 * beat tracking.
 *
 * Architecture:
 *   expo-av recording (LINEAR_PCM, 22050 Hz)
 *     → polling timer reads accumulated PCM from the WAV file
 *     → 441-sample hops fed into computeFeatures()
 *     → ONNX inference (BDA CRNN model)
 *     → particle filter → BPM estimate
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { InferenceSession, Tensor } from "onnxruntime-react-native";
import type {
  FilterbankConfig,
  StateSpacesConfig,
  SpectrogramState,
  ParticleFilterState,
} from "../beatnet-core";
import {
  createSpectrogramState,
  resetSpectrogramState,
  computeFeatures,
  createParticleFilter,
  updateParticleFilter,
  resyncPhases,
} from "../beatnet-core";

// Model assets bundled into the app
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_ASSET = require("../../assets/models/beatnet.onnx") as number;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FILTERBANK_ASSET = require("../../assets/models/filterbank.json") as FilterbankConfig;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const STATE_SPACES_ASSET = require("../../assets/models/state_spaces.json") as StateSpacesConfig;

export interface BpmDataPoint {
  timestamp: number;
  bpm: number | null;
  confidence: number;
}

const SAMPLE_RATE = 22050;
const HOP_SIZE = 441; // ~20ms at 22050 Hz
const POLL_INTERVAL_MS = 100; // poll every 100ms → ~4-5 hops per poll
const BPM_WINDOW_SIZE = 25;
const PARTICLE_COUNT = 600; // lower than web for mobile perf
const MAX_SERIES_POINTS = 900;
const WAV_HEADER_BYTES = 44;
// Temporal discontinuity thresholds for the hop queue
const MAX_HOPS_BEFORE_RESYNC = 20;
const HOPS_TO_RETAIN_AFTER_RESYNC = 3;
// Octave correction: if BPM is within these ratio bands of the prior, correct it
const HALF_TEMPO_RATIO_LO = 0.42;
const HALF_TEMPO_RATIO_HI = 0.58;
const DOUBLE_TEMPO_RATIO_LO = 1.7;
const DOUBLE_TEMPO_RATIO_HI = 2.3;

// ---------------------------------------------------------------------------
// WAV / PCM helpers
// ---------------------------------------------------------------------------

/**
 * Read a WAV file and return its PCM samples as Float32Array.
 * Supports 16-bit and 32-bit float PCM.
 */
function wavBytesToFloat32(bytes: Uint8Array): Float32Array {
  // Parse WAV header to determine format
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Bytes 20-21: audio format (1=PCM, 3=IEEE_FLOAT)
  const audioFormat = view.getUint16(20, true);
  // Bytes 22-23: num channels
  const numChannels = view.getUint16(22, true);
  // Bytes 34-35: bits per sample
  const bitsPerSample = view.getUint16(34, true);

  const dataOffset = WAV_HEADER_BYTES;
  const numBytes = bytes.byteLength - dataOffset;

  if (audioFormat === 3 && bitsPerSample === 32) {
    // IEEE float 32
    const numSamples = Math.floor(numBytes / (4 * numChannels));
    const result = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += view.getFloat32(dataOffset + (i * numChannels + ch) * 4, true);
      }
      result[i] = sum / numChannels;
    }
    return result;
  } else {
    // 16-bit PCM (default for expo-av on iOS)
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(numBytes / (bytesPerSample * numChannels));
    const result = new Float32Array(numSamples);
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
    return result;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBeatNetAnalyzer() {
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [timeSeries, setTimeSeries] = useState<BpmDataPoint[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);

  const sessionRef = useRef<InferenceSession | null>(null);
  const ssConfigRef = useRef<StateSpacesConfig | null>(null);
  const specStateRef = useRef<SpectrogramState | null>(null);
  const pfRef = useRef<ParticleFilterState | null>(null);

  // LSTM state tensors
  const hStateRef = useRef<Tensor | null>(null);
  const cStateRef = useRef<Tensor | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fillTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimeRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const processedBytesRef = useRef(0);
  const bpmWindowRef = useRef<number[]>([]);
  const tempoPriorRef = useRef<number | null>(null);
  const timeSeriesRef = useRef<BpmDataPoint[]>([]);
  const isActiveRef = useRef(false);

  // ---------------------------------------------------------------------------
  // LSTM helpers
  // ---------------------------------------------------------------------------

  const resetLSTM = useCallback(() => {
    const stateData = new Float32Array(2 * 1 * 150);
    hStateRef.current = new Tensor("float32", stateData.slice(), [2, 1, 150]);
    cStateRef.current = new Tensor("float32", stateData.slice(), [2, 1, 150]);
  }, []);

  const resetAll = useCallback(() => {
    resetLSTM();
    frameCountRef.current = 0;
    lastUpdateRef.current = 0;
    if (specStateRef.current) resetSpectrogramState(specStateRef.current);
    if (ssConfigRef.current) {
      pfRef.current = createParticleFilter(
        ssConfigRef.current,
        PARTICLE_COUNT,
        BPM_WINDOW_SIZE,
        tempoPriorRef.current,
      );
    }
  }, [resetLSTM]);

  // ---------------------------------------------------------------------------
  // ONNX inference
  // ---------------------------------------------------------------------------

  const runInference = useCallback(async (
    features: Float32Array,
  ): Promise<{ beatProb: number; downbeatProb: number }> => {
    const session = sessionRef.current;
    if (!session || !hStateRef.current || !cStateRef.current) {
      throw new Error("Session not initialized");
    }

    const inputTensor = new Tensor("float32", features, [1, 1, 272]);

    const results = await session.run({
      input: inputTensor,
      h_in: hStateRef.current,
      c_in: cStateRef.current,
    });

    const hOut = results["h_out"] as Tensor;
    const cOut = results["c_out"] as Tensor;
    const outputTensor = results["output"] as Tensor;

    const logits = Array.from(outputTensor.data as Float32Array);

    // Update LSTM state for the next inference step
    hStateRef.current = hOut;
    cStateRef.current = cOut;

    const maxVal = Math.max(logits[0]!, logits[1]!, logits[2]!);
    const exp0 = Math.exp(logits[0]! - maxVal);
    const exp1 = Math.exp(logits[1]! - maxVal);
    const exp2 = Math.exp(logits[2]! - maxVal);
    const sumExp = exp0 + exp1 + exp2;

    return {
      beatProb: exp0 / sumExp,
      downbeatProb: exp1 / sumExp,
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Process a single 441-sample hop
  // ---------------------------------------------------------------------------

  const processHop = useCallback(async (samples: Float32Array) => {
    if (!specStateRef.current || !pfRef.current || !ssConfigRef.current) return;

    const features = computeFeatures(specStateRef.current, samples);
    if (!features) return;

    frameCountRef.current++;
    if (frameCountRef.current < 5) return;

    try {
      const { beatProb, downbeatProb } = await runInference(features);
      const activation = Math.max(beatProb, downbeatProb);
      const rawBpm = updateParticleFilter(pfRef.current, ssConfigRef.current, activation);

      if (rawBpm <= 0) return;

      pfRef.current.bpmWindow.push(rawBpm);
      if (pfRef.current.bpmWindow.length > BPM_WINDOW_SIZE) {
        pfRef.current.bpmWindow.shift();
      }

      const sorted = [...pfRef.current.bpmWindow].sort((a, b) => a - b);
      const bpm = sorted[Math.floor(sorted.length / 2)]!;
      const isBeat = beatProb > 0.3 || downbeatProb > 0.3;

      let variance = 0;
      for (let i = 0; i < pfRef.current.numParticles; i++) {
        const diff = (ssConfigRef.current.tempi[pfRef.current.tempoIdx[i]!] ?? 0) - rawBpm;
        variance += pfRef.current.particles[i]! * diff * diff;
      }
      const cv = Math.sqrt(variance) / rawBpm;
      const conf = Math.max(0, Math.min(1, 1 - cv * 8));

      const now = Date.now();
      if (now - lastUiUpdateRef.current < 100) return;
      lastUiUpdateRef.current = now;

      // Octave correction
      let displayBpm = bpm;
      const prior = tempoPriorRef.current;
      if (prior !== null) {
        const ratio = displayBpm / prior;
        if (ratio > HALF_TEMPO_RATIO_LO && ratio < HALF_TEMPO_RATIO_HI) displayBpm *= 2;
        else if (ratio > DOUBLE_TEMPO_RATIO_LO && ratio < DOUBLE_TEMPO_RATIO_HI) displayBpm /= 2;
      }

      const win = bpmWindowRef.current;
      if (win.length >= 3) {
        const s = [...win].sort((a, b) => a - b);
        const median = s[Math.floor(s.length / 2)]!;
        if (Math.abs(displayBpm - median) / median > 0.1) {
          win.length = 0;
        }
      }
      win.push(displayBpm);
      if (win.length > 25) win.shift();

      const finalSorted = [...win].sort((a, b) => a - b);
      const finalBpm = finalSorted[Math.floor(finalSorted.length / 2)]!;

      lastUpdateRef.current = now;

      setCurrentBpm(Math.round(finalBpm * 100) / 100);
      setConfidence(conf);
      setIsStable(conf > 0.5);

      if (isBeat) {
        setTimeSeries((prev) => {
          const next = [
            ...prev,
            {
              timestamp: now - startTimeRef.current,
              bpm: Math.round(finalBpm * 100) / 100,
              confidence: conf,
            },
          ];
          const trimmed = next.length > MAX_SERIES_POINTS
            ? next.slice(next.length - MAX_SERIES_POINTS)
            : next;
          timeSeriesRef.current = trimmed;
          return trimmed;
        });
      }
    } catch (err) {
      console.error("[BeatNet] inference error:", err);
    }
  }, [runInference]);

  // ---------------------------------------------------------------------------
  // Poll the WAV file and extract new PCM samples
  // ---------------------------------------------------------------------------

  const pollRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording || !isActiveRef.current) return;

    try {
      const uri = recording.getURI();
      if (!uri) return;

      // Read the current recording file
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.size === undefined) return;

      const fileSize = info.size;
      if (fileSize <= WAV_HEADER_BYTES) return;

      // Only process new bytes since last poll
      const newBytes = fileSize - processedBytesRef.current;
      if (newBytes < 2) return; // need at least one 16-bit sample

      // Read the entire file and slice new bytes
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: fileSize,
      });

      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Parse full WAV once to get format info, then slice PCM data
      const allSamples = wavBytesToFloat32(bytes);

      // Calculate audio level (RMS of recent samples)
      const levelWindow = allSamples.slice(-256);
      let sum = 0;
      for (let i = 0; i < levelWindow.length; i++) {
        sum += levelWindow[i]! * levelWindow[i]!;
      }
      const rms = Math.sqrt(sum / levelWindow.length);
      setAudioLevel(Math.min(1, rms * 2));

      // Skip samples we've already processed
      const alreadyProcessedSamples = Math.max(
        0,
        Math.floor((processedBytesRef.current - WAV_HEADER_BYTES) / 2),
      );
      const newSamples = allSamples.slice(alreadyProcessedSamples);
      processedBytesRef.current = fileSize;

      // Feed new samples as hops
      let offset = 0;
      const hops: Float32Array[] = [];
      while (offset + HOP_SIZE <= newSamples.length) {
        hops.push(newSamples.slice(offset, offset + HOP_SIZE));
        offset += HOP_SIZE;
      }

      // Drop hops if queue is too large (temporal discontinuity)
      if (hops.length > MAX_HOPS_BEFORE_RESYNC) {
        hops.splice(0, hops.length - HOPS_TO_RETAIN_AFTER_RESYNC);
        if (pfRef.current && ssConfigRef.current) {
          resyncPhases(pfRef.current, ssConfigRef.current);
        }
      }

      for (const hop of hops) {
        await processHop(hop);
      }
    } catch (err) {
      console.error("[BeatNet] poll error:", err);
    }
  }, [processHop]);

  // ---------------------------------------------------------------------------
  // Model initialization
  // ---------------------------------------------------------------------------

  const initModel = useCallback(async () => {
    if (sessionRef.current || modelLoading) return;
    setModelLoading(true);

    try {
      console.log("[BeatNet] Creating ONNX inference session...");
      const modelAsset = Asset.fromModule(MODEL_ASSET);
      if (!modelAsset.localUri) {
        await modelAsset.downloadAsync();
      }
      const modelUri = modelAsset.localUri ?? modelAsset.uri;
      const session = await InferenceSession.create(modelUri);
      sessionRef.current = session;

      const fbConfig = FILTERBANK_ASSET;
      const ssConfig = STATE_SPACES_ASSET;
      ssConfigRef.current = ssConfig;

      console.log("[BeatNet] Initializing spectrogram state...");
      specStateRef.current = createSpectrogramState(fbConfig);
      pfRef.current = createParticleFilter(
        ssConfig,
        PARTICLE_COUNT,
        BPM_WINDOW_SIZE,
        tempoPriorRef.current,
      );
      resetLSTM();

      setModelReady(true);
      setModelLoading(false);
      console.log("[BeatNet] Ready!");
    } catch (err) {
      console.error("[BeatNet] init failed:", err);
      setModelLoading(false);
      throw err;
    }
  }, [modelLoading, resetLSTM]);

  // ---------------------------------------------------------------------------
  // Start / stop
  // ---------------------------------------------------------------------------

  const start = useCallback(async () => {
    // Request microphone permission
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Microphone permission is required");
    }

    // Initialize model if not ready
    if (!sessionRef.current) {
      await initModel();
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });

    // Configure recording with Linear PCM at 22050 Hz
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
      web: {
        mimeType: "audio/wav",
        bitsPerSecond: 128000,
      },
      keepAudioActiveHint: true,
      isMeteringEnabled: true,
    });
    recordingRef.current = recording;
    processedBytesRef.current = WAV_HEADER_BYTES;

    startTimeRef.current = Date.now();
    lastUpdateRef.current = 0;
    lastUiUpdateRef.current = 0;
    frameCountRef.current = 0;
    bpmWindowRef.current = [];
    timeSeriesRef.current = [];
    isActiveRef.current = true;

    resetAll();

    setIsActive(true);
    setTimeSeries([]);
    setCurrentBpm(null);
    setIsStable(false);
    setConfidence(0);

    await recording.startAsync();

    // Poll recording file every POLL_INTERVAL_MS
    pollTimerRef.current = setInterval(() => {
      void pollRecording();
    }, POLL_INTERVAL_MS);

    // Chart fill timer: insert null points when no beats detected
    fillTimerRef.current = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 1500) return;
      setTimeSeries((prev) => {
        const next = [
          ...prev,
          { timestamp: now - startTimeRef.current, bpm: null, confidence: 0 },
        ];
        const trimmed = next.length > MAX_SERIES_POINTS
          ? next.slice(next.length - MAX_SERIES_POINTS)
          : next;
        timeSeriesRef.current = trimmed;
        return trimmed;
      });
    }, 1000);
  }, [initModel, resetAll, pollRecording]);

  const stop = useCallback(async () => {
    isActiveRef.current = false;

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (fillTimerRef.current) {
      clearInterval(fillTimerRef.current);
      fillTimerRef.current = null;
    }

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore errors on stop
      }
      recordingRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    setIsActive(false);
    setAudioLevel(0);
  }, []);

  const setTempoPrior = useCallback((bpm: number | null) => {
    tempoPriorRef.current = bpm;
    if (pfRef.current) pfRef.current.tempoPriorBpm = bpm;
  }, []);

  const getTimeSeries = useCallback(() => timeSeriesRef.current, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

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
