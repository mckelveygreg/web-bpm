const YIN_THRESHOLD = 0.15;

/**
 * YIN pitch detection algorithm.
 * Returns the detected fundamental frequency in Hz, or null if no pitch found.
 */
export function yin(buffer: Float32Array, sampleRate: number): number | null {
  const halfLen = Math.floor(buffer.length / 2);

  // Step 2: Difference function
  const diff = new Float32Array(halfLen);
  for (let tau = 0; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = buffer[i]! - buffer[i + tau]!;
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Step 3: Cumulative mean normalized difference
  const cmndf = new Float32Array(halfLen);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += diff[tau]!;
    cmndf[tau] = (diff[tau]! * tau) / runningSum;
  }

  // Step 4: Absolute threshold — find first dip below threshold
  let tauEstimate = -1;
  for (let tau = 2; tau < halfLen; tau++) {
    if (cmndf[tau]! < YIN_THRESHOLD) {
      // Walk to the local minimum
      while (tau + 1 < halfLen && cmndf[tau + 1]! < cmndf[tau]!) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) return null;

  // Step 5: Parabolic interpolation for sub-sample accuracy
  const t = tauEstimate;
  if (t > 0 && t < halfLen - 1) {
    const s0 = cmndf[t - 1]!;
    const s1 = cmndf[t]!;
    const s2 = cmndf[t + 1]!;
    const shift = (s0 - s2) / (2 * (s0 - 2 * s1 + s2));
    if (isFinite(shift)) {
      return sampleRate / (t + shift);
    }
  }

  return sampleRate / t;
}
