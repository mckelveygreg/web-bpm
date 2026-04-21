/**
 * AudioWorklet processor that captures 441-sample frames (20ms at 22050 Hz)
 * and forwards them to the main thread via MessagePort.
 */

class BeatNetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(441);
    this.writePos = 0;
    this.hopSize = 441;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writePos++] = input[i];
      if (this.writePos >= this.hopSize) {
        this.port.postMessage({ type: "hop", samples: this.buffer.slice() });
        this.writePos = 0;
      }
    }

    return true;
  }
}

registerProcessor("beatnet-processor", BeatNetProcessor);
