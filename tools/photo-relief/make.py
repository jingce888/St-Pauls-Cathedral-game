#!/usr/bin/env python3
"""
Turns photographs of carved reliefs into game assets (public/data/reliefs/):
  <id>.jpg      albedo: the photo cropped to the carving, large-scale lighting divided out,
                colour matched to the cathedral's Portland stone
  <id>_n.jpg    tangent-space normal map (OpenGL convention) from the relief height
  <id>_h.bin    relief height grid, uint16 (0..65535 -> 0..depth metres), row 0 = bottom
  manifest.json sizes in metres and grid dimensions

Depth comes from depth.py (Depth Anything V2): the low-resolution pass gives the overall
shape, the high-resolution pass the detail. The camera's tilt is removed with a plane fitted
to the edge of the crop. Crops, sizes and relief depths are in panels.json.

  python3 tools/photo-relief/make.py <photo dir> <work dir>
"""
import json, sys, os
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
WORK = sys.argv[2] if len(sys.argv) > 2 else SRC
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "reliefs")
os.makedirs(OUT, exist_ok=True)
PANELS = {k: (v["photo"], tuple(v["crop"]), v["width"], v["depth"], v["cols"]) for k, v in json.load(open(os.path.join(os.path.dirname(__file__), "panels.json"))).items()}
# Portland stone as the cathedral's interior shows it (sRGB mean of the albedo)
TARGET = np.array([196.0, 186.0, 168.0])


def blur(a, r):
    """Separable box blur, three passes (close to a Gaussian of sigma ~ r)."""
    out = a.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            c = np.cumsum(np.pad(out, [(r + 1, r) if ax == axis else (0, 0) for ax in range(out.ndim)], mode="edge"), axis=axis)
            n = out.shape[axis]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
            lo = np.take(c, np.arange(0, n), axis=axis)
            out = (hi - lo) / (2 * r + 1)
    return out


def resize(a, w, h):
    return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize((w, h), Image.BICUBIC), np.float64)


def plane_fit(d, ring):
    """Least-squares plane through the pixels of the crop's edge ring (outliers rejected)."""
    H, W = d.shape
    yy, xx = np.mgrid[0:H, 0:W]
    m = np.zeros_like(d, bool)
    m[:ring], m[-ring:], m[:, :ring], m[:, -ring:] = True, True, True, True
    for _ in range(3):
        A = np.stack([xx[m], yy[m], np.ones(m.sum())], 1)
        coef, *_ = np.linalg.lstsq(A, d[m], rcond=None)
        res = d - (coef[0] * xx + coef[1] * yy + coef[2])
        s = res[m].std()
        m &= np.abs(res) < 1.5 * s + 1e-9
    return coef[0] * xx + coef[1] * yy + coef[2]


manifest = []
for pid, (fname, box, width_m, depth_m, cols) in PANELS.items():
    img = Image.open(os.path.join(SRC, fname)).convert("RGB")
    W0, H0 = img.size
    lo = resize(np.load(os.path.join(WORK, f"{pid}_lo.npy")), W0, H0)
    hi = resize(np.load(os.path.join(WORK, f"{pid}_hi.npy")), W0, H0)
    # fuse: shape from the low-resolution pass, detail from the high-resolution one
    A = np.stack([hi.ravel(), np.ones(hi.size)], 1)
    (k, c), *_ = np.linalg.lstsq(A, lo.ravel(), rcond=None)
    hi = hi * k + c
    s = 18
    d = blur(lo, s) + (hi - blur(hi, s))
    x0, y0, x1, y1 = box
    d = d[y0:y1, x0:x1]
    photo = np.asarray(img, np.float64)[y0:y1, x0:x1]
    H, W = d.shape
    # remove the camera's tilt, then scale: the deepest recess at 0, the most prominent carving at depth_m
    d = d - plane_fit(d, max(6, int(0.03 * min(W, H))))
    p_lo, p_hi = np.percentile(d, 1.0), np.percentile(d, 99.7)
    h = np.clip((d - p_lo) / (p_hi - p_lo), 0, 1.05) * depth_m
    height_m = width_m * H / W

    # albedo: divide out large-scale light (keep the carving's own shadows), match the stone colour
    lum = photo @ np.array([0.299, 0.587, 0.114])
    big = blur(lum, max(12, W // 14))
    flat = photo / np.maximum(big, 8)[..., None] * lum.mean()
    flat = 0.35 * photo + 0.65 * flat
    flat *= TARGET / flat.reshape(-1, 3).mean(0)
    # gentle contrast compression so the photo's shading doesn't fight the game's lighting
    m = flat.mean()
    flat = m + (flat - m) * 0.85
    tex_w = 1024 if W >= H else int(round(1024 * W / H))
    tex_h = int(round(tex_w * H / W))
    Image.fromarray(np.clip(flat, 0, 255).astype(np.uint8)).resize((tex_w, tex_h), Image.LANCZOS).save(os.path.join(OUT, f"{pid}.jpg"), quality=88, optimize=True)

    # normal map from the height (plus a little of the photo's fine relief), at texture resolution
    ht = resize(h, tex_w, tex_h)
    fine = resize(lum - blur(lum, 3), tex_w, tex_h) / 255.0 * depth_m * 0.06
    ht = ht + fine
    px = width_m / tex_w
    gy, gx = np.gradient(ht, px)
    n = np.dstack([-gx, gy, np.ones_like(gx)])  # image rows run down, texture v up: flip y
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(os.path.join(OUT, f"{pid}_n.jpg"), quality=92)

    # the mesh grid (rows bottom to top)
    rows = int(round(cols * H / W))
    hg = resize(h, cols + 1, rows + 1)[::-1]
    q = np.clip(hg / depth_m, 0, 1.05) / 1.05
    (q * 65535).astype("<u2").tofile(os.path.join(OUT, f"{pid}_h.bin"))
    manifest.append({"id": pid, "width": round(width_m, 3), "height": round(height_m, 3), "depth": round(depth_m * 1.05, 4), "cols": cols + 1, "rows": rows + 1})
    # previews for checking
    Image.fromarray((np.clip(h / depth_m, 0, 1) * 255).astype(np.uint8)).save(os.path.join(WORK, f"prev_{pid}_h.png"))
    print(pid, f"{W}x{H}px", f"{width_m}x{height_m:.2f} m", f"grid {cols + 1}x{rows + 1}", f"tex {tex_w}x{tex_h}")

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
