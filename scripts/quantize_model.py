"""
Convert beatnet.onnx weights from float32 to float16.

Float16 conversion halves the size of all weight tensors (Conv, Linear, LSTM)
with negligible accuracy loss. Unlike dynamic INT8 quantization, this approach
works on all op types including LSTM, which holds most of the model's weights.

The model runs as float32 at inference time — ORT automatically upcasts fp16
initializers to fp32 when executing. The benefit is purely in file size and
initial memory load.

Usage:
    pip install onnx onnxconverter-common onnxruntime
    python scripts/quantize_model.py

Produces:
    public/models/beatnet.onnx  (replaces the float32 version in-place)
    public/models/beatnet.onnx.f32.bak  (backup of original)
"""

import os
import shutil
import sys


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
MODEL_PATH = os.path.join(REPO_ROOT, "public", "models", "beatnet.onnx")


def check_deps():
    missing = []
    try:
        import onnx
    except ImportError:
        missing.append("onnx")
    try:
        from onnxconverter_common import float16
    except ImportError:
        missing.append("onnxconverter-common")
    try:
        import onnxruntime
    except ImportError:
        missing.append("onnxruntime")

    if missing:
        print(f"Missing dependencies: {', '.join(missing)}")
        print("Install them with: pip install onnx onnxconverter-common onnxruntime")
        sys.exit(1)

def main():
    check_deps()
    from onnxconverter_common import float16
    import onnx

    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model not found at {MODEL_PATH}")
        sys.exit(1)

    print(f"Quantizing {MODEL_PATH} to float16...")

    # Backup
    backup_path = MODEL_PATH + ".f32.bak"
    if not os.path.exists(backup_path):
        print(f"Creating backup at {backup_path}")
        shutil.copy2(MODEL_PATH, backup_path)

    model = onnx.load(MODEL_PATH)
    model_fp16 = float16.convert_float_to_float16(model)
    onnx.save(model_fp16, MODEL_PATH)

    print("Done!")

if __name__ == "__main__":
    main()
