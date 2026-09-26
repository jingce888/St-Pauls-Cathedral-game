#!/usr/bin/env python3
"""
Relative depth of each photo in panels.json with Depth Anything V2 (ONNX, CPU):
writes <id>_lo.npy (518 px wide: overall shape) and <id>_hi.npy (1036 px: detail) to the work dir.

  pip install onnxruntime pillow numpy
  curl -L -o depth-anything-v2-base.onnx \\
    https://huggingface.co/onnx-community/depth-anything-v2-base/resolve/main/onnx/model.onnx
  python3 tools/photo-relief/depth.py <photo dir> <work dir> <model.onnx>
"""
import json, os, sys, time
import numpy as np
import onnxruntime as ort
from PIL import Image

photos, work, model = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(work, exist_ok=True)
panels = json.load(open(os.path.join(os.path.dirname(__file__), "panels.json")))
sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
mean = np.array([0.485, 0.456, 0.406], np.float32)
std = np.array([0.229, 0.224, 0.225], np.float32)


def infer(img, W, H):
    x = (np.asarray(img.resize((W, H), Image.BICUBIC), np.float32) / 255.0 - mean) / std
    out = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0]
    return out[0] if out.ndim == 3 else out[0, 0]


for pid, p in panels.items():
    img = Image.open(os.path.join(photos, p["photo"])).convert("RGB")
    t = time.time()
    # sizes are multiples of the 14 px patch, keeping the photo's aspect
    lw = 518; lh = int(round(lw * img.height / img.width / 14)) * 14
    np.save(os.path.join(work, f"{pid}_lo.npy"), infer(img, lw, lh))
    np.save(os.path.join(work, f"{pid}_hi.npy"), infer(img, 2 * lw, 2 * lh))
    print(pid, f"{time.time() - t:.1f}s")
