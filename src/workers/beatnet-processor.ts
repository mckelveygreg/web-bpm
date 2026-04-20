/**
 * AudioWorklet processor that captures 441-sample frames (20ms at 22050 Hz)
 * and forwards them to the main thread via MessagePort.
 */

class BeatNetProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private writePos = 0;
  private readonly hopSize = 441; // 20ms at 22050 Hz

  constructor() {
    super();
    this.buffer = new Float32Array(this.hopSize);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writePos++] = input[i]!;
      if (this.writePos >= this.hopSize) {
        // Send completed hop frame to main thread / worker
        this.port.postMessage(
          { type: "hop", samples: this.buffer.slice() },
        );
        this.writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("beatnet-processor", BeatNetProcessor);
