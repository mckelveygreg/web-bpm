"""
Export BeatNet model to ONNX and precompute preprocessing artifacts for browser use.

Produces:
  public/models/beatnet.onnx       - ONNX model with externalized LSTM state
  public/models/filterbank.json    - Logarithmic filterbank matrix + Hann window
  public/models/state_spaces.json  - Particle filter state spaces & transition matrices

All filterbank and state space computations are done in pure numpy, replicating
madmom's algorithms exactly, to avoid madmom's Python 3.10+ incompatibilities.
"""

import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------------------------------------------------------------------
# 1. BDA model (copied from BeatNet to avoid import issues with madmom/pyaudio)
# ---------------------------------------------------------------------------

class BDA(nn.Module):
    def __init__(self, dim_in=272, num_cells=150, num_layers=2, device="cpu"):
        super().__init__()
        self.dim_in = dim_in
        self.dim_hd = num_cells
        self.num_layers = num_layers
        self.device = device
        self.conv_out = 150
        self.kernelsize = 10

        self.conv1 = nn.Conv1d(1, 2, self.kernelsize)
        self.linear0 = nn.Linear(2 * int((self.dim_in - self.kernelsize + 1) / 2), self.conv_out)
        self.lstm = nn.LSTM(
            input_size=self.conv_out,
            hidden_size=self.dim_hd,
            num_layers=self.num_layers,
            batch_first=True,
            bidirectional=False,
        )
        self.linear = nn.Linear(in_features=self.dim_hd, out_features=3)
        self.softmax = nn.Softmax(dim=0)

        self.hidden = torch.zeros(2, 1, self.dim_hd)
        self.cell = torch.zeros(2, 1, self.dim_hd)

    def forward(self, data):
        x = data
        x = torch.reshape(x, (-1, self.dim_in))
        x = x.unsqueeze(0).transpose(0, 1)
        x = F.max_pool1d(F.relu(self.conv1(x)), 2)
        x = x.view(-1, self._num_flat(x))
        x = self.linear0(x)
        x = torch.reshape(x, (data.shape[0], data.shape[1], self.conv_out))
        x, (self.hidden, self.cell) = self.lstm(x, (self.hidden, self.cell))
        out = self.linear(x)
        out = out.transpose(1, 2)
        return out

    def _num_flat(self, x):
        size = x.size()[1:]
        n = 1
        for s in size:
            n *= s
        return n


class BDAStreamWrapper(nn.Module):
    """Wrapper that takes LSTM hidden state as explicit inputs/outputs for ONNX export."""

    def __init__(self, bda: BDA):
        super().__init__()
        self.conv1 = bda.conv1
        self.linear0 = bda.linear0
        self.lstm = bda.lstm
        self.linear = bda.linear
        self.dim_in = bda.dim_in
        self.conv_out = bda.conv_out

    def forward(self, data, h_in, c_in):
        # data: (1, 1, 272)
        x = data
        x = torch.reshape(x, (-1, self.dim_in))          # (1, 272)
        x = x.unsqueeze(0).transpose(0, 1)                # (1, 1, 272)
        x = F.max_pool1d(F.relu(self.conv1(x)), 2)        # (1, 2, 131)
        x = x.view(x.size(0), -1)                         # (1, 262)
        x = self.linear0(x)                                # (1, 150)
        x = torch.reshape(x, (data.shape[0], data.shape[1], self.conv_out))  # (1, 1, 150)
        x, (h_out, c_out) = self.lstm(x, (h_in, c_in))    # x: (1, 1, 150)
        out = self.linear(x)                               # (1, 1, 3)
        out = out.squeeze(1)                               # (1, 3)
        return out, h_out, c_out


# ---------------------------------------------------------------------------
# 2. Find BeatNet model weights
# ---------------------------------------------------------------------------

def find_weights():
    """Locate BeatNet pre-trained weights."""
    try:
        import BeatNet
        pkg_dir = os.path.dirname(BeatNet.__file__)
        weights_dir = os.path.join(pkg_dir, "models")
        if os.path.isdir(weights_dir):
            return weights_dir
    except ImportError:
        pass
    return None


# ---------------------------------------------------------------------------
# 3. Export ONNX
# ---------------------------------------------------------------------------

def export_onnx(output_path: str):
    weights_dir = find_weights()
    if not weights_dir:
        print("ERROR: Could not find BeatNet model weights. Install BeatNet: pip install BeatNet")
        sys.exit(1)

    weights_file = os.path.join(weights_dir, "model_1_weights.pt")
    print(f"Loading weights from {weights_file}")

    bda = BDA(272, 150, 2, "cpu")
    bda.load_state_dict(torch.load(weights_file, map_location="cpu", weights_only=True), strict=False)
    bda.eval()

    wrapper = BDAStreamWrapper(bda)
    wrapper.eval()

    # Dummy inputs for tracing
    dummy_input = torch.randn(1, 1, 272)
    dummy_h = torch.zeros(2, 1, 150)
    dummy_c = torch.zeros(2, 1, 150)

    # Verify wrapper matches original
    bda.hidden = dummy_h.clone()
    bda.cell = dummy_c.clone()
    with torch.no_grad():
        orig_out = bda(dummy_input)
        wrap_out, _, _ = wrapper(dummy_input, dummy_h, dummy_c)

    orig_activations = orig_out[0]  # (3, 1)
    wrap_activations = wrap_out[0]  # (3,)
    diff = (orig_activations.squeeze() - wrap_activations).abs().max().item()
    print(f"Max diff between original and wrapper: {diff:.2e}")
    assert diff < 1e-5, f"Wrapper output differs too much: {diff}"

    torch.onnx.export(
        wrapper,
        (dummy_input, dummy_h, dummy_c),
        output_path,
        input_names=["input", "h_in", "c_in"],
        output_names=["output", "h_out", "c_out"],
        opset_version=17,
        dynamic_axes={"input": {1: "seq_len"}},
    )

    # The dynamo exporter saves weights as external data by default.
    # Merge everything into a single self-contained ONNX file for the browser.
    import onnx
    from onnx.external_data_helper import convert_model_to_external_data
    model = onnx.load(output_path, load_external_data=True)
    # Remove external data references and embed weights inline
    for tensor in model.graph.initializer:
        tensor.ClearField("data_location")
        tensor.ClearField("external_data")
    onnx.save(model, output_path)
    # Remove the leftover .data file
    data_path = output_path + ".data"
    if os.path.exists(data_path):
        os.remove(data_path)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Exported ONNX model to {output_path} ({size_mb:.2f} MB)")


# ---------------------------------------------------------------------------
# 4. Build logarithmic filterbank (pure numpy, replicating madmom exactly)
# ---------------------------------------------------------------------------

def _log_frequencies(bands_per_octave, fmin, fmax, fref=440.0):
    """Replicate madmom.audio.filters.log_frequencies exactly."""
    left = np.floor(np.log2(float(fmin) / fref) * bands_per_octave)
    right = np.ceil(np.log2(float(fmax) / fref) * bands_per_octave)
    frequencies = fref * 2.0 ** (np.arange(left, right) / float(bands_per_octave))
    frequencies = frequencies[np.searchsorted(frequencies, fmin):]
    frequencies = frequencies[:np.searchsorted(frequencies, fmax, 'right')]
    return frequencies


def _frequencies2bins(frequencies, bin_frequencies, unique_bins=False):
    """Replicate madmom.audio.filters.frequencies2bins exactly."""
    frequencies = np.asarray(frequencies)
    bin_frequencies = np.asarray(bin_frequencies)
    indices = bin_frequencies.searchsorted(frequencies)
    indices = np.clip(indices, 1, len(bin_frequencies) - 1)
    left = bin_frequencies[indices - 1]
    right = bin_frequencies[indices]
    indices -= (frequencies - left < right - frequencies).astype(int)
    if unique_bins:
        indices = np.unique(indices)
    return indices


def _triangular_filter(start, center, stop, num_bins, norm=False):
    """Create a single triangular filter, replicating madmom TriangularFilter."""
    start, center, stop = int(start), int(center), int(stop)
    center_rel = center - start
    stop_rel = stop - start
    data = np.zeros(stop_rel, dtype=np.float32)
    if center_rel > 0:
        data[:center_rel] = np.linspace(0, 1, center_rel, endpoint=False)
    if stop_rel - center_rel > 0:
        data[center_rel:] = np.linspace(1, 0, stop_rel - center_rel, endpoint=False)
    if norm:
        area = data.sum()
        if area > 0:
            data /= area
    filt = np.zeros(num_bins, dtype=np.float32)
    filt[start:start + len(data)] = data
    return filt


def _build_log_filterbank(n_fft, sample_rate, num_bands_per_octave, fmin, fmax):
    """
    Build filterbank matrix matching madmom LogarithmicFilterbank exactly.
    
    Uses log_frequencies → frequencies2bins(unique=True) → overlapping TriangularFilters.
    Returns shape (num_filter_bands, n_bins).
    """
    bin_freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    n_bins = len(bin_freqs)

    # Get center frequencies (log-spaced, 24 per octave)
    frequencies = _log_frequencies(num_bands_per_octave, fmin, fmax, fref=440.0)
    # Map to unique FFT bins
    bins = _frequencies2bins(frequencies, bin_freqs, unique_bins=True)

    print(f"  log_frequencies: {len(frequencies)} center freqs, "
          f"mapped to {len(bins)} unique bins")
    print(f"  Creating {len(bins) - 2} overlapping triangular filters")

    # Create overlapping triangular filters from consecutive triplets
    filters = []
    for i in range(len(bins) - 2):
        start, center, stop = int(bins[i]), int(bins[i + 1]), int(bins[i + 2])
        # Handle too-small filters (same as madmom)
        if stop - start < 2:
            center = start
            stop = start + 1
        filt = _triangular_filter(start, center, stop, n_bins, norm=True)
        filters.append(filt)

    # Stack: shape (num_filter_bands, n_bins)
    filterbank = np.array(filters, dtype=np.float32)
    return filterbank


def export_filterbank(output_path: str):
    """Build and export the logarithmic filterbank matching BeatNet's preprocessing."""
    sample_rate = 22050
    win_length = int(64 * 0.001 * sample_rate)  # 1411
    hop_size = int(20 * 0.001 * sample_rate)     # 441
    n_fft = win_length
    num_bands_per_octave = 24
    fmin = 30.0
    fmax = 17000.0

    filterbank = _build_log_filterbank(n_fft, sample_rate, num_bands_per_octave, fmin, fmax)
    num_filter_bands = filterbank.shape[0]
    feature_dim = num_filter_bands * 2  # spec + diff stacked by hstack

    print(f"  Filterbank shape: {filterbank.shape}")
    print(f"  Number of filter bands: {num_filter_bands}")
    print(f"  Feature dim (spec + diff): {feature_dim}")
    
    if feature_dim != 272:
        print(f"  WARNING: Feature dim {feature_dim} != 272 (expected by model).")
        print(f"  The model's linear0 expects input dim = "
              f"2 * floor((dim_in - 10 + 1) / 2) = 2 * floor(({feature_dim} - 9) / 2)")
        print(f"  Model was trained with dim_in=272, i.e. 136 bands x 2")

    # Hann window
    hann = np.hanning(win_length).tolist()

    result = {
        "sample_rate": sample_rate,
        "win_length": win_length,
        "hop_size": hop_size,
        "n_fft": n_fft,
        "num_bands": num_filter_bands,
        "fmin": fmin,
        "fmax": fmax,
        "diff_ratio": 0.5,
        "filterbank": filterbank.tolist(),
        "hann_window": hann,
    }

    with open(output_path, "w") as f:
        json.dump(result, f)
    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Exported filterbank to {output_path} ({size_kb:.1f} KB)")


# ---------------------------------------------------------------------------
# 5. Export particle filter state spaces (pure numpy)
# ---------------------------------------------------------------------------

def export_state_spaces(output_path: str):
    """Precompute particle filter state spaces matching BeatNet's PF cascade."""
    min_bpm = 55.0
    max_bpm = 215.0
    num_tempi = 300
    fps = 50

    # Log-spaced tempi from min to max BPM
    tempi = np.logspace(np.log2(min_bpm), np.log2(max_bpm), num_tempi, base=2)
    # Intervals in frames (how many frames per beat at each tempo)
    intervals = 60.0 * fps / tempi

    # Beat state space: for each tempo, create phase states [0, interval)
    state_positions = []
    state_intervals = []
    for interval in intervals:
        n_phases = int(np.ceil(interval))
        for phase in range(n_phases):
            state_positions.append(phase / interval)  # normalized [0, 1)
            state_intervals.append(interval)

    result = {
        "min_bpm": min_bpm,
        "max_bpm": max_bpm,
        "num_tempi": num_tempi,
        "fps": fps,
        "tempi": tempi.tolist(),
        "intervals": intervals.tolist(),
        "beat_state_space": {
            "num_states": len(state_positions),
            "state_positions": state_positions,
            "state_intervals": state_intervals,
        },
    }

    with open(output_path, "w") as f:
        json.dump(result, f)
    size_kb = os.path.getsize(output_path) / 1024
    print(f"Exported state spaces to {output_path} ({size_kb:.1f} KB)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "models")
    os.makedirs(out_dir, exist_ok=True)

    print("=== Exporting ONNX model ===")
    export_onnx(os.path.join(out_dir, "beatnet.onnx"))

    print("\n=== Exporting filterbank ===")
    export_filterbank(os.path.join(out_dir, "filterbank.json"))

    print("\n=== Exporting state spaces ===")
    export_state_spaces(os.path.join(out_dir, "state_spaces.json"))

    print("\nDone! All artifacts exported to public/models/")
