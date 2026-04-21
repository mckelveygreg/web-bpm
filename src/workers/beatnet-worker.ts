/**
 * BeatNet Web Worker
 *
 * Receives 441-sample audio frames (hops) from the AudioWorklet processor,
 * computes a log-filterbank spectrogram, runs ONNX inference (BDA CRNN),
 * applies a particle filter cascade for beat/downbeat tracking, and posts
 * BPM + beat events back to the main thread.
 *
 * Messages IN:
 *   { type: "init", baseUrl: string }      – load model + artifacts
 *   { type: "hop", samples: Float32Array } – one 441-sample audio frame
 *   { type: "reset" }                      – reset LSTM state + particle filter
 *
 * Messages OUT:
 *   { type: "ready" }                    – model loaded
 *   { type: "bpm", bpm: number, beat: boolean, downbeat: boolean, confidence: number }
 *   { type: "error", message: string }
 */

import * as ort from "onnxruntime-web";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import type {
  FilterbankConfig,
  StateSpacesConfig,
  SpectrogramState,
  ParticleFilterState,
} from "./beatnet-core";
import {
  createSpectrogramState,
  resetSpectrogramState,
  computeFeatures,
  createParticleFilter,
  updateParticleFilter,
  resyncPhases,
} from "./beatnet-core";

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

let session: ort.InferenceSession | null = null;
let ssConfig: StateSpacesConfig | null = null;
let specState: SpectrogramState | null = null;
let pf: ParticleFilterState | null = null;

let hState: ort.Tensor;
let cState: ort.Tensor;

let frameCount = 0;
let hopQueue: Float32Array[] = [];
let processing = false;
let tempoPriorBpm: number | null = null;
let mobileProfile = false;
let lastPostedAt = 0;

const BPM_WINDOW_SIZE = 25;
const DEFAULT_PARTICLE_COUNT = 1500;
const MOBILE_PARTICLE_COUNT = 600;
const DEFAULT_POST_INTERVAL_MS = 100;
const MOBILE_POST_INTERVAL_MS = 300;

function getParticleCount() {
  return mobileProfile ? MOBILE_PARTICLE_COUNT : DEFAULT_PARTICLE_COUNT;
}

function getPostIntervalMs() {
  return mobileProfile ? MOBILE_POST_INTERVAL_MS : DEFAULT_POST_INTERVAL_MS;
}

function requireOk(response: Response, assetName: string) {
  if (!response.ok) {
    throw new Error(
      `Failed to load ${assetName} (${response.status} ${response.statusText}) from ${response.url}`,
    );
  }

  return response;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

async function init(baseUrl: string, nextMobileProfile = false) {
  try {
    mobileProfile = nextMobileProfile;
    lastPostedAt = 0;
    const publicBase = new URL(baseUrl, self.location.origin);
    const modelsBase = new URL("models/", publicBase);
    console.log("[BeatNet] Loading from:", modelsBase.href);

    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };

    console.log("[BeatNet] Fetching model configs...");
    const [fbResp, ssResp] = await Promise.all([
      fetch(new URL("filterbank.json", modelsBase)),
      fetch(new URL("state_spaces.json", modelsBase)),
    ]);

    const fbConfig = (await requireOk(fbResp, "filterbank config").json()) as FilterbankConfig;
    ssConfig = (await requireOk(ssResp, "state space config").json()) as StateSpacesConfig;

    console.log("[BeatNet] Creating ONNX session...");
    session = await ort.InferenceSession.create(
      new URL("beatnet.onnx", modelsBase).href,
      {
        executionProviders: ["wasm"],
        graphOptimizationLevel: mobileProfile ? "basic" : "all",
      },
    );

    console.log("[BeatNet] Initializing state...");
    specState = createSpectrogramState(fbConfig);
    pf = createParticleFilter(
      ssConfig,
      getParticleCount(),
      BPM_WINDOW_SIZE,
      tempoPriorBpm,
    );
    resetLSTM();

    console.log("[BeatNet] Ready!");
    self.postMessage({ type: "ready" });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[BeatNet] Initialization failed:", errMsg, err);
    self.postMessage({
      type: "error",
      message: errMsg,
    });
  }
}

function resetLSTM() {
  hState?.dispose?.();
  cState?.dispose?.();
  const stateData = new Float32Array(2 * 1 * 150);
  hState = new ort.Tensor("float32", stateData.slice(), [2, 1, 150]);
  cState = new ort.Tensor("float32", stateData.slice(), [2, 1, 150]);
}

function resetAll() {
  resetLSTM();
  frameCount = 0;
  lastPostedAt = 0;
  if (specState) resetSpectrogramState(specState);
  if (ssConfig) {
    pf = createParticleFilter(
      ssConfig,
      getParticleCount(),
      BPM_WINDOW_SIZE,
      tempoPriorBpm,
    );
  }
}

// ---------------------------------------------------------------------------
// ONNX inference
// ---------------------------------------------------------------------------

async function runInference(
  features: Float32Array,
): Promise<{ beatProb: number; downbeatProb: number }> {
  if (!session) throw new Error("Session not initialized");

  const inputTensor = new ort.Tensor("float32", features, [1, 1, 272]);
  const prevHState = hState;
  const prevCState = cState;

  const results = await session.run({
    input: inputTensor,
    h_in: hState,
    c_in: cState,
  });

  inputTensor.dispose?.();

  const hOut = results["h_out"] as ort.Tensor;
  const cOut = results["c_out"] as ort.Tensor;
  const outputTensor = results["output"] as ort.Tensor;

  // Copy logits before disposing transient outputs.
  const logits = Array.from(outputTensor.data as Float32Array);

  hState = hOut;
  cState = cOut;

  outputTensor.dispose?.();
  prevHState?.dispose?.();
  prevCState?.dispose?.();

  const maxVal = Math.max(logits[0]!, logits[1]!, logits[2]!);
  const exp0 = Math.exp(logits[0]! - maxVal);
  const exp1 = Math.exp(logits[1]! - maxVal);
  const exp2 = Math.exp(logits[2]! - maxVal);
  const sumExp = exp0 + exp1 + exp2;

  return {
    beatProb: exp0 / sumExp,
    downbeatProb: exp1 / sumExp,
  };
}

// ---------------------------------------------------------------------------
// Frame processing
// ---------------------------------------------------------------------------

async function processHop(samples: Float32Array) {
  if (!specState || !pf || !ssConfig) return;

  const features = computeFeatures(specState, samples);
  if (!features) return;

  frameCount++;
  if (frameCount < 5) return;

  try {
    const { beatProb, downbeatProb } = await runInference(features);
    const activation = Math.max(beatProb, downbeatProb);
    const rawBpm = updateParticleFilter(pf, ssConfig, activation);

    if (rawBpm > 0) {
      pf.bpmWindow.push(rawBpm);
      if (pf.bpmWindow.length > BPM_WINDOW_SIZE) pf.bpmWindow.shift();

      const sorted = [...pf.bpmWindow].sort((a, b) => a - b);
      const bpm = sorted[Math.floor(sorted.length / 2)]!;

      const isBeat = beatProb > 0.3 || downbeatProb > 0.3;
      const isDownbeat = downbeatProb > 0.3;

      let variance = 0;
      for (let i = 0; i < pf.numParticles; i++) {
        const diff = (ssConfig.tempi[pf.tempoIdx[i]!] ?? 0) - rawBpm;
        variance += pf.particles[i]! * diff * diff;
      }
      // Scale coefficient of variation so "Locked" (conf > 0.5) requires
      // particle spread < ~6% of BPM — much tighter than the previous 1x scale.
      const cv = Math.sqrt(variance) / rawBpm;
      const confidence = Math.max(0, Math.min(1, 1 - cv * 8));

      const now = Date.now();
      if (now - lastPostedAt >= getPostIntervalMs()) {
        lastPostedAt = now;
        self.postMessage({
          type: "bpm",
          bpm: Math.round(bpm * 100) / 100,
          beat: isBeat,
          downbeat: isDownbeat,
          confidence,
        });
      }
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Hop queue
// ---------------------------------------------------------------------------

async function drainQueue() {
  if (processing) return;
  processing = true;
  while (hopQueue.length > 0) {
    if (hopQueue.length > 20) {
      // Keep the 3 most recent frames and discard the rest.
      // The dropped frames create a temporal discontinuity, so re-randomize
      // beat-phase state — tempo weights (which BPM cluster has won) are
      // preserved so the filter doesn't have to re-converge from scratch.
      hopQueue.splice(0, hopQueue.length - 3);
      if (pf && ssConfig) resyncPhases(pf, ssConfig);
    }
    const samples = hopQueue.shift()!;
    await processHop(samples);
  }
  processing = false;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  switch (data.type) {
    case "init":
      void init(
        data.baseUrl as string,
        Boolean((data as { mobileProfile?: boolean }).mobileProfile),
      );
      break;
    case "hop":
      hopQueue.push(data.samples as Float32Array);
      void drainQueue();
      break;
    case "reset":
      hopQueue = [];
      processing = false;
      resetAll();
      break;
    case "setTempoPrior":
      tempoPriorBpm = (data.bpm as number | null) ?? null;
      // Only store the prior — do NOT recreate the particle filter.
      // Recreating it throws away all accumulated convergence state,
      // causing the filter to re-converge (often to the wrong tempo).
      // The prior is used at init time for biased seeding and is
      // also stored on the filter state for the hook's octave correction.
      if (pf) pf.tempoPriorBpm = tempoPriorBpm;
      break;
  }
};
