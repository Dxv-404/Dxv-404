# -*- coding: utf-8 -*-
"""Cut a sprite into independently animatable sub-parts.

Whole-sprite transforms were the reason two complaints existed at once: the
tree "moves left" because translating the image moves the trunk base along with
the canopy, and the figure "floats" because any translate applied to him also
moves his contact with the ground.

A thing that is attached to the world cannot be animated as one rigid image.
It has to be split at the joint: trunk versus canopy, seat versus shoulders,
head versus body.  Then the attached part stays put and only the free part
moves.
"""
import numpy as np, cv2
from PIL import Image


def _rgba(x):
    return np.asarray(x.convert("RGBA")) if isinstance(x, Image.Image) else x


def band(rgba, y0, y1):
    """the sprite restricted to rows [y0, y1) — everything else transparent.

    Note the explicit `:` for the column axis.  `a[:y0, 3] = 0` on a 3-D array
    does NOT clear the alpha of those rows — it clears every channel of column
    index 3, i.e. one vertical line of pixels.  Written that way this returned
    the whole figure with a single column knocked out, so the "head" nod was
    silently nodding the entire man on top of a duplicate of himself.
    """
    a = _rgba(rgba).copy()
    a[:y0, :, 3] = 0
    a[y1:, :, 3] = 0
    return a


def head(rgba, box, hair_hue=(0, 360), frac=0.30):
    """Isolate the head so it can nod without dragging the shoulders.

    Found by scanning down from the top of the figure for the dark hair mass
    and taking the rows it occupies plus a little neck, rather than a fixed
    fraction — the hair is the highest thing on him and the most reliable
    landmark at this size.
    """
    a = _rgba(rgba)
    y0, h = box["y"], box["h"]
    lim = y0 + max(4, int(h * frac))
    return band(a, y0, lim), (y0, lim)


def wind_edge(rgba, side="left", thickness=1):
    """The silhouette edge on the windward side.

    Shifting just this reads as fabric and hair lifting, because that is what
    actually moves on a person sitting still: the outline flutters, the body
    does not.  Moving the whole figure instead is what made every earlier
    version look like it was bobbing in water.
    """
    a = _rgba(rgba)
    m = (a[..., 3] > 128).astype(np.uint8)
    k = np.zeros((3, 3), np.uint8)
    k[1, 1] = 1
    k[1, 2 if side == "left" else 0] = 1
    k[0, 1] = 1                                   # also the top edge
    edge = m & ~cv2.erode(m, k, iterations=thickness).astype(bool)
    out = a.copy()
    out[..., 3] = np.where(edge, 255, 0)
    return out


def clusters(rgba, min_area=18, close=3):
    """Split a canopy into its separate foliage clumps.

    Returns a list of (rgba, cx, cy, area) sorted top-down.  Each clump gets
    its own phase and its own sway amplitude, so the canopy moves like a tree
    in wind rather than like a sign swinging on a post.
    """
    a = _rgba(rgba)
    m = (a[..., 3] > 128).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((close, close), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < min_area:
            continue
        c = a.copy()
        c[..., 3] = np.where(lab == i, a[..., 3], 0)
        out.append(dict(img=c, cx=float(cent[i][0]), cy=float(cent[i][1]),
                        area=int(stats[i, cv2.CC_STAT_AREA]),
                        top=int(stats[i, cv2.CC_STAT_TOP])))
    out.sort(key=lambda d: d["top"])
    return out


def canopy_split(rgba, sat_min=0.16, reach=10, min_seed=14):
    """Separate the canopy into clumps, and the trunk from both.

    Colour alone is not enough.  Keying on "is it green" grabs only the bright
    cores and leaves each clump's dark underside and its warm rim behind in the
    trunk layer, so a swaying clump would slide out of its own outline.

    So colour is used only to SEED.  Every opaque pixel within `reach` of a
    seed is then assigned to that seed's clump by nearest-label distance
    transform, which pulls in the dark leaves, the rim, and the twigs running
    through the clump.  Whatever is left over — the trunk and the long bare
    limbs — is the part that must not move.
    """
    a = _rgba(rgba)
    opaque = a[..., 3] > 128
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV).astype(float)
    h, s, v = hsv[..., 0] * 2, hsv[..., 1] / 255.0, hsv[..., 2] / 255.0
    # Seed on VALUE, not hue.  A hue window tuned to green foliage finds
    # nothing on a pink cherry canopy, and widening it to include pink then
    # swallows the brown bark, which sits between the two.  What is reliably
    # true of both trees is that the canopy is lighter than the wood.
    if opaque.any():
        cut = np.quantile(v[opaque], 0.42)
        seed = opaque & (v > max(cut, 0.18)) & (s > sat_min * 0.5)
    else:
        seed = opaque
    seed = cv2.morphologyEx(seed.astype(np.uint8), cv2.MORPH_OPEN,
                            np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(seed, 8)
    keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_seed]
    if not keep:
        return [], a
    seedmask = np.isin(lab, keep)

    # nearest-seed assignment: distance transform on the INVERSE of the seeds
    # hands back, for every pixel, the label of the closest seed pixel
    dist, nearest = cv2.distanceTransformWithLabels(
        (~seedmask).astype(np.uint8), cv2.DIST_L2, 3,
        labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.where(seedmask)
    seed_lab = np.zeros(nearest.max() + 1, np.int32)
    seed_lab[nearest[seedmask]] = lab[seedmask]
    owner = seed_lab[nearest]
    grown = opaque & (dist <= reach) & (owner > 0)

    out = []
    for i in keep:
        m = grown & (owner == i)
        if m.sum() < min_seed:
            continue
        c = a.copy()
        c[..., 3] = np.where(m, a[..., 3], 0)
        yy, xx = np.where(m)
        out.append(dict(img=c, cx=float(xx.mean()), cy=float(yy.mean()),
                        top=int(yy.min()), bottom=int(yy.max()),
                        area=int(m.sum())))
    out.sort(key=lambda d: d["top"])
    trunk = a.copy()
    trunk[..., 3] = np.where(opaque & ~grown, a[..., 3], 0)
    return out, trunk
