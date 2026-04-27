/**
 * Pure computational functions for the BeatNet pipeline.
 * Ported from src/workers/beatnet-core.ts for React Native.
 * Uses fft.js instead of onnxruntime-web.
 */
import FFT from "fft.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterbankConfig {
  sample_rate: number;
  win_length: number;
  hop_size: number;
  n_fft: number;
  num_bands: number;
  fmin: number;
  fmax: number;
  diff_ratio: number;
  filterbank: number[][];
  hann_window: number[];
}

export interface StateSpacesConfig {
  min_bpm: number;
  max_bpm: number;
  num_tempi: number;
  fps: number;
  tempi: number[];
  intervals: number[];
  beat_state_space: {
    num_states: number;
    state_positions: number[];
    state_intervals: number[];
  };
}

// ---------------------------------------------------------------------------
// Spectrogram
// ---------------------------------------------------------------------------

export interface SpectrogramState {
  ringBuffer: Float32Array;
  ringWritePos: number;
  ringFilled: boolean;
  prevSpectrum: Float32Array | null;
  hannWindow: Float32Array;
  fbMatrix: Float32Array;
  fbNumBands: number;
  fbNBins: number;
  winLen: number;
  diffRatio: number;
  fft: { realTransform: (out: number[], data: Float32Array) => void };
  fftOut: number[];
  fftInput: Float32Array;
  fftSize: number;
}

export function createSpectrogramState(
  fbConfig: FilterbankConfig,
  fftSize = 2048,
): SpectrogramState {
  const winLen = fbConfig.win_length;
  const fbNumBands = fbConfig.num_bands;
  const fbNBins = fbConfig.filterbank[0]!.length;
  const fbMatrix = new Float32Array(fbNumBands * fbNBins);
  for (let b = 0; b < fbNumBands; b++) {
    const row = fbConfig.filterbank[b]!;
    for (let j = 0; j < fbNBins; j++) {
      fbMatrix[b * fbNBins + j] = row[j]!;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const fft = new FFT(fftSize);

  return {
    ringBuffer: new Float32Array(winLen),
    ringWritePos: 0,
    ringFilled: false,
    prevSpectrum: null,
    hannWindow: new Float32Array(fbConfig.hann_window),
    fbMatrix,
    fbNumBands,
    fbNBins,
    winLen,
    diffRatio: fbConfig.diff_ratio,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    fft,
    fftOut: new Array<number>(fftSize * 2).fill(0),
    fftInput: new Float32Array(fftSize),
    fftSize,
  };
}

export function resetSpectrogramState(state: SpectrogramState): void {
  state.ringBuffer.fill(0);
  state.ringWritePos = 0;
  state.ringFilled = false;
  state.prevSpectrum = null;
}

/**
 * Feed a hop of audio samples and compute the 272-dim feature vector.
 * Returns null until we have a full window buffered.
 */
export function computeFeatures(
  state: SpectrogramState,
  samples: Float32Array,
): Float32Array | null {
  const { winLen, hannWindow, fbMatrix, fbNumBands, fbNBins, fftSize } = state;

  // Write samples into ring buffer
  for (let i = 0; i < samples.length; i++) {
    state.ringBuffer[state.ringWritePos] = samples[i]!;
    state.ringWritePos = (state.ringWritePos + 1) % winLen;
    if (state.ringWritePos === 0) state.ringFilled = true;
  }

  if (!state.ringFilled) return null;

  // Extract the current window
  const frame = new Float32Array(winLen);
  for (let i = 0; i < winLen; i++) {
    frame[i] = state.ringBuffer[(state.ringWritePos + i) % winLen]!;
  }

  // Apply Hann window
  for (let i = 0; i < winLen; i++) {
    frame[i] = frame[i]! * hannWindow[i]!;
  }

  // FFT magnitude spectrum
  const nBinsOriginal = Math.floor(winLen / 2) + 1;
  const nBinsFFT = Math.floor(fftSize / 2) + 1;
  const magnitudes = new Float32Array(nBinsOriginal);

  state.fftInput.fill(0);
  state.fftInput.set(frame);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  state.fft.realTransform(state.fftOut, state.fftInput);

  const mags = new Float32Array(nBinsFFT);
  for (let k = 0; k < nBinsFFT; k++) {
    const re = state.fftOut[k * 2]!;
    const im = state.fftOut[k * 2 + 1]!;
    mags[k] = Math.sqrt(re * re + im * im);
  }

  // Resample to filterbank bins
  const binRatio = fftSize / winLen;
  for (let k = 0; k < nBinsOriginal; k++) {
    const pos = k * binRatio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, nBinsFFT - 1);
    const frac = pos - lo;
    magnitudes[k] = mags[lo]! * (1 - frac) + mags[hi]! * frac;
  }

  // Apply filterbank
  const filtered = new Float32Array(fbNumBands);
  for (let b = 0; b < fbNumBands; b++) {
    let sum = 0;
    const offset = b * fbNBins;
    for (let j = 0; j < nBinsOriginal; j++) {
      sum += fbMatrix[offset + j]! * magnitudes[j]!;
    }
    filtered[b] = sum;
  }

  // Log compression
  for (let b = 0; b < fbNumBands; b++) {
    filtered[b] = Math.log(1 + filtered[b]!);
  }

  // Spectral difference
  const diff = new Float32Array(fbNumBands);
  if (state.prevSpectrum) {
    for (let b = 0; b < fbNumBands; b++) {
      diff[b] = Math.max(0, filtered[b]! - state.diffRatio * state.prevSpectrum[b]!);
    }
  }
  state.prevSpectrum = filtered.slice();

  // Concatenate
  const features = new Float32Array(fbNumBands * 2);
  features.set(filtered, 0);
  features.set(diff, fbNumBands);

  return features;
}

// ---------------------------------------------------------------------------
// Particle Filter
// ---------------------------------------------------------------------------

// Gaussian variance for beat-phase likelihood in the particle filter.
// σ²=0.03 — slightly wider than original 0.02 for real music timing
// but not so wide that sub-harmonic particles get false credit.
const BEAT_PHASE_VARIANCE = 0.03;

export interface ParticleFilterState {
  particles: Float32Array;
  tempoIdx: Int32Array;
  phases: Float32Array;
  numParticles: number;
  bpmWindow: number[];
  bpmWindowSize: number;
  tempoPriorBpm: number | null;
}

export function createParticleFilter(
  ssConfig: StateSpacesConfig,
  numParticles = 1500,
  bpmWindowSize = 10,
  tempoPriorBpm: number | null = null,
): ParticleFilterState {
  const particles = new Float32Array(numParticles);
  const tempoIdx = new Int32Array(numParticles);
  const phases = new Float32Array(numParticles);
  const numTempi = ssConfig.num_tempi;
  const tempi = ssConfig.tempi;

  if (tempoPriorBpm !== null) {
    const targetSigma = tempoPriorBpm * 0.1;
    for (let i = 0; i < numParticles; i++) {
      // Box-Muller transform to sample from N(tempoPriorBpm, targetSigma)
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const sampledBpm = tempoPriorBpm + z * targetSigma;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < numTempi; j++) {
        const dist = Math.abs(tempi[j]! - sampledBpm);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
      tempoIdx[i] = bestIdx;
      phases[i] = Math.random() * ssConfig.intervals[bestIdx]!;
      particles[i] = 1 / numParticles;
    }
  } else {
    for (let i = 0; i < numParticles; i++) {
      const idx = Math.floor(Math.random() * numTempi);
      tempoIdx[i] = idx;
      phases[i] = Math.random() * ssConfig.intervals[idx]!;
      particles[i] = 1 / numParticles;
    }
  }

  return { particles, tempoIdx, phases, numParticles, bpmWindow: [], bpmWindowSize, tempoPriorBpm };
}

export function updateParticleFilter(
  pf: ParticleFilterState,
  ssConfig: StateSpacesConfig,
  beatProb: number,
): number {
  const { numParticles } = pf;
  const numTempi = ssConfig.num_tempi;
  const intervals = ssConfig.intervals;
  const tempi = ssConfig.tempi;

  // 1. Propagate
  for (let i = 0; i < numParticles; i++) {
    const interval = intervals[pf.tempoIdx[i]!]!;
    pf.phases[i] = (pf.phases[i]! + 1) % interval;

    const r = Math.random();
    if (r < 0.01) {
      const jump = Math.random() < 0.5 ? -2 : 2;
      pf.tempoIdx[i] = Math.max(0, Math.min(numTempi - 1, pf.tempoIdx[i]! + jump));
    } else if (r < 0.06) {
      const jump = Math.random() < 0.5 ? -1 : 1;
      pf.tempoIdx[i] = Math.max(0, Math.min(numTempi - 1, pf.tempoIdx[i]! + jump));
    }
  }

  // 2. Multiplicative weight update
  let totalWeight = 0;
  for (let i = 0; i < numParticles; i++) {
    const interval = intervals[pf.tempoIdx[i]!]!;
    const normalizedPhase = pf.phases[i]! / interval;
    const beatDist = Math.min(normalizedPhase, 1 - normalizedPhase);
    const beatLikelihood = Math.exp(-(beatDist * beatDist) / (2 * BEAT_PHASE_VARIANCE));
    const likelihood = beatProb * beatLikelihood + (1 - beatProb) * (1 - beatLikelihood);
    pf.particles[i] = pf.particles[i]! * likelihood;
    totalWeight += pf.particles[i]!;
  }

  if (totalWeight > 0) {
    for (let i = 0; i < numParticles; i++) {
      pf.particles[i]! /= totalWeight;
    }
  }

  // 3. Resample
  const effectiveN = 1 / pf.particles.reduce((sum, w) => sum + w * w, 0);
  if (effectiveN < numParticles / 2) {
    systematicResample(pf);
  }

  // 4. Estimate via histogram mode with octave disambiguation
  const tempoWeights = new Float64Array(numTempi);
  for (let i = 0; i < numParticles; i++) {
    const idx = pf.tempoIdx[i]!;
    tempoWeights[idx] = tempoWeights[idx]! + pf.particles[i]!;
  }

  let bestIdx = 0;
  let bestWeight = 0;
  for (let t = 0; t < numTempi; t++) {
    if (tempoWeights[t]! > bestWeight) {
      bestWeight = tempoWeights[t]!;
      bestIdx = t;
    }
  }

  let smoothNum = 0;
  let smoothDen = 0;
  for (let t = Math.max(0, bestIdx - 3); t <= Math.min(numTempi - 1, bestIdx + 3); t++) {
    smoothNum += tempoWeights[t]! * tempi[t]!;
    smoothDen += tempoWeights[t]!;
  }
  let bpmEstimate = smoothDen > 0 ? smoothNum / smoothDen : tempi[bestIdx]!;

  const doubleTarget = bpmEstimate * 2;
  if (doubleTarget <= tempi[numTempi - 1]!) {
    let doubleWeight = 0;
    for (let t = 0; t < numTempi; t++) {
      if (Math.abs(tempi[t]! - doubleTarget) < doubleTarget * 0.08) {
        doubleWeight += tempoWeights[t]!;
      }
    }
    let currentWeight = 0;
    for (let t = 0; t < numTempi; t++) {
      if (Math.abs(tempi[t]! - bpmEstimate) < bpmEstimate * 0.08) {
        currentWeight += tempoWeights[t]!;
      }
    }
    if (doubleWeight > currentWeight * 0.2) {
      bpmEstimate = doubleTarget;
    }
  }

  return bpmEstimate;
}

export function resyncPhases(pf: ParticleFilterState, ssConfig: StateSpacesConfig): void {
  for (let i = 0; i < pf.numParticles; i++) {
    const interval = ssConfig.intervals[pf.tempoIdx[i]!]!;
    pf.phases[i] = Math.random() * interval;
  }
}

function systematicResample(pf: ParticleFilterState): void {
  const { numParticles } = pf;
  const cumWeights = new Float32Array(numParticles);
  cumWeights[0] = pf.particles[0]!;
  for (let i = 1; i < numParticles; i++) {
    cumWeights[i] = cumWeights[i - 1]! + pf.particles[i]!;
  }

  const newTempoIdx = new Int32Array(numParticles);
  const newPhases = new Float32Array(numParticles);

  const step = 1 / numParticles;
  let u = Math.random() * step;
  let j = 0;

  for (let i = 0; i < numParticles; i++) {
    while (j < numParticles - 1 && cumWeights[j]! < u) j++;
    newTempoIdx[i] = pf.tempoIdx[j]!;
    newPhases[i] = pf.phases[j]!;
    u += step;
  }

  pf.tempoIdx = newTempoIdx;
  pf.phases = newPhases;
  pf.particles.fill(1 / numParticles);
}
