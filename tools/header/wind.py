# -*- coding: utf-8 -*-
"""Build a wind sprite sheet from our own tree, by deformation.

Every generative tool tried so far — Veo, Wan image-to-video, the sprite-sheet
LoRAs — makes a NEW drawing that resembles the input.  That is exactly right
for a character sheet, where you want new poses, and exactly wrong for
animating a locked asset, where frame-to-frame identity is the whole point.
Veo proved it twice: loose framing kept our tree but cropped the trunk; locked
framing kept the frame but redrew the tree.

So the frames are generated here instead, by warping the asset we already
have.  Identity is then guaranteed by construction rather than hoped for:
every frame IS our tree, because nothing regenerates it.

The warp is a cantilever bend per clump — zero displacement where the clump
meets its branch, growing toward the tip — which is how foliage actually moves
and is the one thing a CSS translate cannot express.
"""
import numpy as np, cv2
from PIL import Image


def bend_field(mask, phase, amp, droop=0.35, power=1.6, turb=None):
    """Per-pixel displacement for one clump.

    Anchored at the clump's lowest row (where the branch holds it) and easing
    to full amplitude at the top, so the shape shears instead of sliding.
    """
    ys, xs = np.where(mask)
    if not len(ys):
        return None
    bottom, top = ys.max(), ys.min()
    span = max(1.0, float(bottom - top))
    yy = np.arange(mask.shape[0])[:, None].astype(np.float32)
    t = np.clip((bottom - yy) / span, 0, 1) ** power
    dx = amp * np.sin(phase) * t
    dy = -abs(amp) * droop * (1.0 - np.cos(phase)) * 0.5 * t
    if turb is not None:
        # A clump is not a rigid paddle.  Bending it as one unit moves every
        # petal by the same amount, which reads as a stamp tilting.  Real
        # foliage has parts of the same mass leading and lagging each other,
        # so a slow spatial noise is added on top of the bend.
        n1, n2 = turb
        n = n1 * np.cos(phase) + n2 * np.sin(phase)     # periodic in phase,
        dx = dx + n * t                                  # so the loop still closes
        dy = dy + n * t * 0.4
    return dx, dy


def turbulence(shape, cells=7, strength=1.7, seed=0):
    """Two smooth random fields, blended by phase so the result is periodic.

    Sampling one noise field over time would never return to its start and the
    60s loop would break.  Interpolating between a fixed pair with cos/sin is
    periodic by construction.
    """
    rng = np.random.default_rng(seed)
    h, w = shape
    out = []
    for _ in range(2):
        small = rng.normal(0, 1, (max(2, h // cells), max(2, w // cells)))
        big = cv2.resize(small.astype(np.float32), (w, h),
                         interpolation=cv2.INTER_CUBIC)
        big = cv2.GaussianBlur(big, (0, 0), max(1.0, cells / 2.0))
        m = np.abs(big).max() or 1.0
        out.append((big / m * strength).astype(np.float32))
    return out


def warp_clump(rgba, mask, phase, amp, turb=None):
    """Warp one clump by its bend field, on the pixel grid."""
    f = bend_field(mask, phase, amp, turb=turb)
    if f is None:
        return np.zeros_like(rgba)
    dx, dy = f
    h, w = mask.shape
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32),
                         np.arange(h, dtype=np.float32))
    # round the field so samples land on whole pixels: a fractional remap
    # resamples the art and softens every edge, which is fatal for pixel art
    # remap wants two full float32 maps; dx/dy broadcast from column vectors
    mx = np.ascontiguousarray((gx - np.round(dx)).astype(np.float32))
    my = np.ascontiguousarray((gy - np.round(dy)).astype(np.float32))
    if mx.shape != gx.shape:
        mx = np.broadcast_to(mx, gx.shape).astype(np.float32).copy()
    if my.shape != gy.shape:
        my = np.broadcast_to(my, gy.shape).astype(np.float32).copy()
    src = rgba.copy()
    src[..., 3] = np.where(mask, src[..., 3], 0)
    out = cv2.remap(src, mx, my, interpolation=cv2.INTER_NEAREST,
                    borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    return out


def sheet(tree_rgba, labels, clumps, frames=8, amp=2.6, seed=3):
    """Return (sheet_rgba, frame_w) — the tree in `frames` wind positions.

    Emitted as ONE wide image rather than N separate ones: a single indexed
    PNG shares its palette across every frame and compresses far better than
    the same frames stored apart, and the SVG can show one at a time by
    stepping a translate inside a clip.
    """
    rng = np.random.default_rng(seed)
    H, W = tree_rgba.shape[:2]
    ys, xs = np.where(tree_rgba[..., 3] > 0)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    fw, fh = int(x1 - x0) + 6, int(y1 - y0) + 4          # margin for the sway
    out = np.zeros((fh, fw * frames, 4), np.uint8)

    trunk = labels == 0
    offs = {c["i"]: rng.uniform(0, 2 * np.pi) for c in clumps}
    amps = {c["i"]: amp * (0.45 + 0.55 * rng.random()) for c in clumps}
    turb = turbulence((H, W), cells=6, strength=1.6, seed=seed + 11)

    for f in range(frames):
        ph = 2 * np.pi * f / frames
        frame = np.zeros((H, W, 4), np.uint8)
        # trunk first and unmoved — it is what holds the tree to the ground
        t = tree_rgba.copy()
        t[..., 3] = np.where(trunk, t[..., 3], 0)
        frame = _over(frame, t)
        for c in clumps:
            m = labels == c["i"]
            frame = _over(frame, warp_clump(tree_rgba, m,
                                            ph + offs[c["i"]], amps[c["i"]],
                                            turb=turb))
        crop = frame[max(0, y0 - 2):y1 + 2, max(0, x0 - 3):x1 + 3]
        out[:crop.shape[0], f * fw:f * fw + crop.shape[1]] = crop
    return out, fw, fh, int(x0 - 3), int(y0 - 2)


def _over(dst, src):
    a = (src[..., 3:4] > 128)
    return np.where(a, src, dst)
