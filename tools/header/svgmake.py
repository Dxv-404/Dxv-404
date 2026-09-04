# -*- coding: utf-8 -*-
"""Assemble the animated header SVG.

GitHub strips inline <svg> from README markdown, so the only thing that can
animate is an <img src="header.svg"> - and inside that img no JavaScript runs.
CSS keyframes declared inside the SVG DO run.  So: bitmaps for everything
static, SVG elements only for what actually moves, CSS for the motion.

LOOP RULE: 60 / period must be a whole number.  Anything else drifts, and after
a few minutes the seam shows as the whole frame stuttering back to its start.

MOTION RULE: nothing that touches the ground may be animated as a whole image.
The trunk stays pinned and only the canopy sways; the seat stays pinned and
only the shoulders and head move.  Translating a whole sprite is what made the
tree slide sideways and the figure look like it was floating.
"""
import base64, io, json, math, random
import numpy as np
from PIL import Image

import parts, pxfont

MASTER = 60

#: The handle and the degree used to sit here as a fourth line.  Both are
#: redundant on a profile README - GitHub prints @Dxv-404 directly above the
#: file, and 03_identity.svg carries the handle, the course and the year in
#: full a few hundred pixels further down.  Dropping the line also removes the
#: worst-contrast row in the whole block (1.94:1 against the dusk sky), so the
#: editorial fix and the legibility fix turned out to be the same fix.
TYPE = dict(
    name="S. DEVKRISHNA",
    label="CURRENTLY WORKING ON",
    line1="REINFORCEMENT LEARNING",
    line2="MULTI-AGENT SYSTEMS  ·  EMERGENT BEHAVIOUR",
)
INK = (243, 247, 252)
SUB = (176, 190, 208)
MUT = (158, 172, 192)


def check(p):
    if abs(MASTER / p - round(MASTER / p)) > 1e-9:
        raise ValueError(f"period {p}s does not divide the {MASTER}s master loop")
    return p


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _b64(img):
    """Base64 a PNG, indexed where it is safe.

    The art is ~44 colours, so indexed PNG is roughly a third the size before
    base64 inflates it again.  RGBA is riskier: PNG carries transparency as a
    palette index, and `optimize=True` may re-index and reassign that entry,
    which silently punches holes in a sprite.  So the key entry is reserved
    explicitly, optimisation is off for that path, and the round-trip guard
    below rejects the result if a single pixel or alpha value moved.
    """
    b = io.BytesIO()
    src = img
    opt = True
    if img.mode == "RGB":
        img = img.convert("P", palette=Image.ADAPTIVE, colors=64)
    elif img.mode == "RGBA":
        a = np.asarray(img)
        if set(np.unique(a[..., 3]).tolist()) <= {0, 255} and a.size:
            q = Image.fromarray(a[..., :3], "RGB").quantize(colors=254)
            idx = np.asarray(q).copy()
            idx[a[..., 3] == 0] = 255
            out = Image.fromarray(idx, "P")
            # pad to exactly 255 entries first: getpalette() returns only as
            # many as the image actually used, so a bare slice leaves the
            # transparency index pointing at the wrong offset
            pal = list(q.getpalette() or [])[: 255 * 3]
            pal += [0] * (255 * 3 - len(pal))
            out.putpalette(pal + [0, 0, 0])
            out.info["transparency"] = 255
            img, opt = out, False
    img.save(b, format="PNG", optimize=opt)
    data = b.getvalue()
    _assert_roundtrip(src, data)
    return "data:image/png;base64," + base64.b64encode(data).decode()


def _assert_roundtrip(src, data, tol=6):
    """Fail loudly if an encoding step changed the picture."""
    rt = Image.open(io.BytesIO(data)).convert("RGBA")
    a, b_ = np.asarray(src.convert("RGBA")).astype(int), np.asarray(rt).astype(int)
    vis = (a[..., 3] > 0) & (b_[..., 3] > 0)
    if vis.any() and np.abs(a[..., :3] - b_[..., :3]).sum(2)[vis].max() > tol:
        raise RuntimeError("PNG encode changed pixels")
    if (a[..., 3] > 128).sum() != (b_[..., 3] > 128).sum():
        raise RuntimeError("PNG encode changed the alpha coverage")


def _img(img, x=0, y=0):
    return (f'<image x="{x}" y="{y}" width="{img.width}" height="{img.height}" '
            f'image-rendering="pixelated" href="{_b64(img)}"/>')


def _crop(arr, cls=None):
    """Emit an RGBA array cropped to its content, wrapped in a class if given."""
    a = arr if isinstance(arr, np.ndarray) else np.asarray(arr.convert("RGBA"))
    ys, xs = np.where(a[..., 3] > 0)
    if not len(ys):
        return ""
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    tag = _img(Image.fromarray(a[y0:y1, x0:x1], "RGBA"), x0, y0)
    return f'<g class="{cls}">{tag}</g>' if cls else tag


def type_layer(W, H, t, ink, sub, mut, acc):
    """Stamp the type block into the upper-left sky.

    Every line has to clear the canopy, and the canopy is not a straight edge -
    it recedes as it descends (leftmost tree pixel is x=271 at y=40 but x=316
    at y=52).  So the widest line is placed lowest, where there is most room,
    and the block reads as a normal descending hierarchy anyway: eyebrow, the
    current focus, the standing interests, then the handle.
    """
    c = np.zeros((H, W, 4), np.uint8)
    # The eyebrow is TINTED toward the accent, not set in it.  The accent was
    # built for the old badge, which sat on its own dark backing rect; as bare
    # text on sky it measured 1.6:1 against dusk and 1.7:1 against day, which
    # is illegible.  Mixing it into `sub` inherits that colour's legibility -
    # and `sub` is per-hour, which matters because `day` sets DARK text while
    # every other state sets light, so any fixed colour is wrong for one of
    # them.  The result reads as its own thing without being unreadable.
    lab = tuple(int(round(s * 0.76 + a * 0.24)) for s, a in zip(sub, acc))

    # A 1px drop shadow, because the block spans a gradient.
    #
    # No single text colour can work here: the name sits on dark upper sky and
    # measures 9.3:1 at dusk, while two rows lower the horizon glow has come up
    # and the same family of grey measures 2.5:1.  Retuning the colours per
    # line only moves the problem, since one line is not even a constant
    # background across its own width.
    #
    # A shadow fixes it at the source - every glyph then carries its own local
    # contrast and stops depending on what is behind it.  This is the ordinary
    # way game UI text survives arbitrary backgrounds, and at a 5x7 face it has
    # to be an offset shadow rather than a full outline: an outline closes up
    # the counters of A, B, R and O at this size and the word turns to mush.
    #
    # The shadow is chosen AGAINST the ink, not fixed dark.  `day` sets near
    # black text on a pale sky, and a dark shadow behind dark text does nothing
    # at all.
    dark_ink = (np.asarray(ink, float) @ [.299, .587, .114]) < 128
    sh = (236, 240, 246) if dark_ink else (12, 10, 18)

    def line(text, x, y, colour, scale=1):
        pxfont.stamp(c, text, x + scale, y + scale, sh, scale=scale)
        pxfont.stamp(c, text, x, y, colour, scale=scale)

    line(t["name"], 17, 13, ink, scale=2)
    line(t["label"], 17, 32, lab)
    line(t["line1"], 17, 42, sub)                  # what he is on now
    line(t["line2"], 17, 52, mut)
    return Image.fromarray(c, "RGBA")


# ── the moving furniture ────────────────────────────────────────────────────

def windows_layer(wins, commits, rng, ratio=2.6):
    """Lit windows as individual rects, with genuinely varied flicker.

    The previous version gave every flickering window the same 12s period and
    one of only four phases, so the same handful blinked in lockstep and the
    repeat was obvious within half a minute.  Now each one draws its own period
    from the divisor set and its own delay, so no two agree for long.
    """
    order = list(range(len(wins)))
    rng.shuffle(order)
    # `ratio` exists because this number is a property of the CITY, not of the
    # encoding.  2.6 was right for a skyline with 225 detected windows; on a
    # composition whose city is a 166x20 silhouette it saturates instantly, so
    # every commit count from 22 upward renders identically - and 56 lights on
    # a strip that size reads as a string of fairy lights rather than a city.
    lit_n = max(6, min(len(wins), int(round(commits * ratio))))
    lit = order[:lit_n]
    periods = [10, 12, 15, 20, 30]
    rects, css, seen = [], [], set()
    for j, i in enumerate(lit):
        w = wins[i]
        cls = ""
        if rng.random() < 0.38:                       # a third of the city stirs
            p = rng.choice(periods)
            delay = rng.randrange(0, p * 2) / 2.0
            off = rng.choice([6, 8, 10, 14])          # how long it stays dark
            key = (p, delay, off)
            name = f"w{abs(hash(key)) % 100000}"
            if key not in seen:
                seen.add(key)
                css.append(f".{name}{{animation:{name} {p}s steps(1,end) "
                           f"infinite;animation-delay:-{delay}s}}")
                css.append(f"@keyframes {name}{{0%,{100-off}%{{opacity:1}}"
                           f"{100-off+1}%,100%{{opacity:.12}}}}")
            cls = f' class="{name}"'
        rects.append(f'<rect x="{w["x"]}" y="{w["y"]}" width="{w["w"]}" '
                     f'height="{w["h"]}" fill="{w["col"]}"{cls}/>')
    return '<g id="win">' + "".join(rects) + "</g>", css, lit_n


def tree_layers(tree_rgba, rng, labels=None, meta_clumps=None):
    """Trunk pinned, canopy clumps swaying by height.

    Amplitude scales with how far a clump sits above the trunk base, which is
    how a real tree moves - the crown travels, the bole does not.  Each clump
    also gets its own phase so the canopy shears rather than sliding as a slab.

    `labels` is the precomputed clump map.  Re-deriving the split per hour
    failed on the graded copies, so the structure is solved once and every
    state slices its own colours with the same stencil.
    """
    if labels is not None and meta_clumps:
        clumps = []
        for c in meta_clumps:
            m = labels == c["i"]
            if not m.any():
                continue
            img = tree_rgba.copy()
            img[..., 3] = np.where(m, tree_rgba[..., 3], 0)
            clumps.append(dict(img=img, **{k: c[k] for k in
                                           ("cx", "cy", "top", "bottom", "area")}))
        trunk = tree_rgba.copy()
        trunk[..., 3] = np.where(labels == 0, tree_rgba[..., 3], 0)
    else:
        clumps, trunk = parts.canopy_split(tree_rgba)
    if not clumps:
        return _crop(tree_rgba), [], []
    base_y = max(c["bottom"] for c in clumps)
    top_y = min(c["top"] for c in clumps)
    span = max(1, base_y - top_y)
    body, css = [_crop(trunk)], []
    check(6); check(10)
    for i, c in enumerate(clumps):
        h = (base_y - c["cy"]) / span                 # 0 at the base, 1 at the top
        # Kept small on purpose.  At 2px the upper clumps visibly separated
        # from the branches holding them, which is worse than not moving: a
        # clump that leaves its own twig behind reads as a bug, not as wind.
        amp = max(1, int(round(0.4 + 1.3 * h)))   # whole pixels: a pixel-art
        #                                            sprite may not land off-grid
        per = rng.choice([6, 10])
        delay = round(rng.uniform(0, per), 2)
        name = f"sw{i}"
        css.append(f".{name}{{animation:{name} {per}s ease-in-out infinite;"
                   f"animation-delay:-{delay}s}}")
        css.append(f"@keyframes {name}{{0%,100%{{transform:translate(0,0)}}"
                   f"50%{{transform:translate({amp}px,0)}}}}")
        body.append(_crop(c["img"], name))
    return "".join(body), css, clumps


def tree_sheet_layer(tree_rgba, labels, clumps, frames=16, period=4, amp=2.6):
    """The tree as a real sprite-sheet animation.

    Every frame is OUR tree, deformed - not a regenerated lookalike.  The
    canopy bends as a cantilever from where each clump meets its branch, which
    is motion a CSS translate cannot express: a translate slides a rigid
    stamp, this shears the shape.

    Emitted as ONE wide indexed PNG behind a clip, stepped with translateX.
    A shared palette across all frames makes it a fraction of the size of the
    same frames stored separately.
    """
    import wind
    sh, fw, fh, ox, oy = wind.sheet(tree_rgba, labels, clumps,
                                    frames=frames, amp=amp)
    img = Image.fromarray(sh, "RGBA")
    check(period)
    body = (f'<clipPath id="tclip"><rect x="{ox}" y="{oy}" width="{fw}" '
            f'height="{fh}"/></clipPath>'
            f'<g clip-path="url(#tclip)"><g class="tsheet">'
            f'{_img(img, ox, oy)}</g></g>')
    css = [f".tsheet{{animation:tsheet {period}s steps({frames}) infinite}}",
           f"@keyframes tsheet{{from{{transform:translateX(0)}}"
           f"to{{transform:translateX(-{fw*frames}px)}}}}"]
    return body, css, fw, fh


def leaves_layer(clumps, rng, n=16, W=440):
    """Cherry petals, carried on the wind across the frame.

    A petal is a falling AEROFOIL, not a falling object: it swings from side to
    side several times on the way down and, being flat, turns edge-on at each
    reversal and briefly almost vanishes.

    They also travel.  Confined to a few pixels under the canopy they read as
    debris; carried left across the sky on the same wind that is bending the
    tree, they read as blossom - and they tie the tree to the rest of the
    picture instead of leaving it as an isolated object in the corner.
    """
    if not clumps:
        return "", []
    out, css = [], []
    for i in range(n):
        c = clumps[rng.randrange(len(clumps))]
        x = int(c["cx"] + rng.randint(-10, 8))
        y = int(c["cy"] + rng.randint(-6, 6))
        per = check(rng.choice([20, 30, 60]))
        delay = round(rng.uniform(0, per), 1)
        drop = rng.randint(26, 70)
        sw = rng.randint(4, 10)
        # the wind runs right-to-left across the hill, so they mostly travel
        # left; distance varies a lot so they do not move as a flock
        net = -rng.randint(30, 190)
        name = f"lf{i}"
        css.append(f".{name}{{animation:{name} {per}s linear infinite;"
                   f"animation-delay:-{delay}s}}")
        k = ["0%{opacity:0;transform:translate(0,0)}", "4%{opacity:.85}"]
        for j, (fx, fy, o) in enumerate([
                (0.14, 0.13, .85), (0.22, 0.22, .3), (0.36, 0.34, .85),
                (0.47, 0.46, .35), (0.62, 0.60, .8), (0.74, 0.72, .35),
                (0.88, 0.86, .7)]):
            side = sw * (1 if j % 2 == 0 else -0.6)
            k.append(f"{int(8+fx*84)}%{{opacity:{o};transform:translate("
                     f"{net*fx+side:.0f}px,{drop*fy:.0f}px)}}")
        k.append(f"100%{{opacity:0;transform:translate({net}px,{drop}px)}}")
        css.append(f"@keyframes {name}{{" + "".join(k) + "}")
        col = rng.choice(["#F2C2D2", "#E7A9C0", "#F7D4DE", "#EFB8CB"])
        out.append(f'<rect class="{name}" x="{x}" y="{y}" width="1" height="1" '
                   f'fill="{col}"/>')
    return '<g id="leaves">' + "".join(out) + "</g>", css


def birds_layer(rng, W):
    """Two birds crossing, and one perched on a branch that takes off once.

    The perched one is the point.  A bird flying past is scenery; a bird that
    sits still for fifty seconds and then leaves is something you only catch if
    you were already looking.
    """
    out, css = [], []
    for i, (y, per, sc) in enumerate([(22, 30, 1), (34, 60, 1),
                                      (15, 60, -1), (27, 30, -1)]):
        check(per)
        d = round(rng.uniform(0, per), 1)
        name = f"bd{i}"
        css.append(f".{name}{{animation:{name} {per}s linear infinite;"
                   f"animation-delay:-{d}s}}")
        x0, x1 = (-8, W + 8) if sc > 0 else (W + 8, -8)
        # the height lives in the shape, not in the keyframes.  Putting it in
        # the translate meant every bird flew at the transform origin plus its
        # drift, so all three skimmed the horizon instead of the sky.
        css.append(f"@keyframes {name}{{0%{{opacity:0;transform:translate({x0}px,4px)}}"
                   f"10%{{opacity:.8}}50%{{transform:translate({(x0+x1)//2}px,-2px)}}"
                   f"90%{{opacity:.8}}"
                   f"100%{{opacity:0;transform:translate({x1}px,-6px)}}}}")
        # two-frame wingbeat: the shapes swap, they do not tween
        out.append(
            f'<g class="{name}"><g class="flap">'
            f'<path d="M0 {y+1} L2 {y} L4 {y+1}" fill="none" stroke="#12151C" '
            f'stroke-width="1"/></g><g class="flap2">'
            f'<path d="M0 {y} L2 {y+1.5} L4 {y}" fill="none" stroke="#12151C" '
            f'stroke-width="1"/></g></g>')
    css.append(".flap{animation:fl .5s steps(1,end) infinite}"
               ".flap2{animation:fl2 .5s steps(1,end) infinite}")
    css.append("@keyframes fl{0%,50%{opacity:1}51%,100%{opacity:0}}")
    css.append("@keyframes fl2{0%,50%{opacity:0}51%,100%{opacity:1}}")
    check(0.5)

    # the perched one
    px, py = 372, 34
    out.append(f'<g id="perch" transform="translate({px},{py})">'
               f'<rect x="0" y="0" width="2" height="2" fill="#20242E"/>'
               f'<rect x="2" y="1" width="1" height="1" fill="#20242E"/></g>')
    css.append("#perch{animation:perch 60s linear infinite}")
    css.append("@keyframes perch{0%,82%{opacity:1;transform:translate(372px,34px)}"
               "86%{opacity:1;transform:translate(366px,26px)}"
               "94%{opacity:.6;transform:translate(340px,6px)}"
               "97%,100%{opacity:0;transform:translate(320px,0px)}}")
    return '<g id="birds">' + "".join(out) + "</g>", css


def speaker_layer(x, y):
    """A small bluetooth speaker on the grass, and what is coming out of it.

    This is the detail that makes the scene his rather than generic: it gives
    the head-nod a reason, and it is the only object in the frame that implies
    sound.
    """
    out = [
        f'<rect x="{x}" y="{y}" width="5" height="7" rx="1" fill="#14181F"/>',
        f'<rect x="{x+1}" y="{y+1}" width="3" height="4" fill="#2B323D"/>',
        f'<rect x="{x+1}" y="{y+6}" width="3" height="1" fill="#3A4350"/>',
        f'<rect class="pw" x="{x+3}" y="{y+5}" width="1" height="1" fill="#7FE3C0"/>',
    ]
    for i in range(3):
        out.append(f'<path class="spk{i}" d="M{x+6+i*2} {y-1-i} q{1.5+i} {2+i} 0 {4+i*2}" '
                   f'fill="none" stroke="#CFE4D8" stroke-width="1" opacity="0"/>')
    css = [".pw{animation:pw 2s steps(1,end) infinite}",
           "@keyframes pw{0%,60%{opacity:1}61%,100%{opacity:.25}}"]
    for i in range(3):
        css.append(f".spk{i}{{animation:spkw 1.5s ease-out infinite;"
                   f"animation-delay:-{round(i*0.5,2)}s}}")
    css.append("@keyframes spkw{0%{opacity:0}20%{opacity:.55}70%{opacity:.18}"
               "100%{opacity:0}}")
    check(1.5); check(2)
    return '<g id="spk">' + "".join(out) + "</g>", css


# ── assembly ────────────────────────────────────────────────────────────────

def plane_layer(W, y=8, t_in=20.0, dur=12.0, linger=8.0):
    """An aircraft crossing once per master loop, contrail lingering behind.

    Replaces the old #air element, which was a single 2x1 pixel translating
    across the sky with its opacity blinking - and it read as exactly that, a
    blinking light passing through.  The fix is not to remove the light but to
    give it something to belong to: a body, and above all a contrail.  The
    contrail is the picture.  It is a rect scaled out from the entry point so
    its far end is always under the plane, filled with a left-to-right
    gradient so the old end is always fainter, and after the plane has left it
    fades over `linger` seconds rather than vanishing.  The beacon pulses on a
    slow ease instead of strobing - real beacons do blink, but at this scale a
    hard blink is the only thing the eye sees.

    All timings are expressed as percentages of the 60s master so the event
    happens once per loop and the loop still closes.
    """
    check(60); check(2)
    a = t_in / MASTER * 100; b = (t_in + dur) / MASTER * 100
    c = (t_in + dur + linger) / MASTER * 100
    x0, x1 = -30, W + 30
    body = (f'<g id="pln"><rect x="0" y="0" width="3" height="1" fill="#E8ECF2"/>'
            f'<rect x="1" y="-1" width="1" height="3" fill="#E8ECF2"/>'
            f'<circle id="bcn" cx="3.5" cy="0.5" r=".7" fill="#FFE0AA"/></g>')
    svg = (f'<defs><linearGradient id="ctg" x1="0" x2="1"><stop offset="0" stop-color="#F4F6FA" stop-opacity="0"/>'
           f'<stop offset=".55" stop-color="#F4F6FA" stop-opacity=".28"/>'
           f'<stop offset="1" stop-color="#F4F6FA" stop-opacity=".62"/></linearGradient></defs>'
           f'<rect id="ctr" x="{x0}" y="{y}" width="{x1 - x0}" height="1" fill="url(#ctg)"/>'
           f'<g id="plw" transform="translate({x0},{y})">{body}</g>')
    css = [
        f"#plw{{animation:plf {MASTER}s linear infinite}}",
        f"@keyframes plf{{0%,{a:.3f}%{{transform:translate({x0}px,{y}px);opacity:0}}"
        f"{a + .01:.3f}%{{opacity:1}}{b - .01:.3f}%{{opacity:1}}"
        f"{b:.3f}%,100%{{transform:translate({x1}px,{y}px);opacity:0}}}}",
        f"#ctr{{transform-origin:{x0}px {y}px;transform:scaleX(0);animation:ctr {MASTER}s linear infinite}}",
        f"@keyframes ctr{{0%,{a:.3f}%{{transform:scaleX(0);opacity:0}}"
        f"{a + .01:.3f}%{{opacity:1}}{b:.3f}%{{transform:scaleX(1);opacity:1}}"
        f"{c:.3f}%,100%{{transform:scaleX(1);opacity:0}}}}",
        "#bcn{animation:bcn 2s ease-in-out infinite}",
        "@keyframes bcn{0%,100%{opacity:1}50%{opacity:.4}}",
    ]
    return svg, css


def moon_layer(W, H, phase, x=214, y=22, R=6, dim=1.0):
    """The moon at its real phase for the date the workflow ran.

    phase in [0,1): 0 new, .25 first quarter, .5 full, .75 last quarter.
    Drawn as a bitmap so it stays on the pixel grid.  The terminator is the
    ellipse x = h(row) * cos(2*pi*phase), which is what a lit sphere actually
    shows; waxing lights the right limb, waning the left.  `dim` is for dawn,
    where the moon is still up but the sky is no longer dark enough for it to
    burn.
    """
    import math
    c = np.zeros((H, W, 4), np.uint8)
    cosp = math.cos(2 * math.pi * phase)
    waxing = phase < 0.5
    for j in range(-R, R + 1):
        h = math.sqrt(max(0.0, R * R - j * j))
        xt = h * cosp
        for i in range(-R, R + 1):
            if i * i + j * j > R * R + 0.5:
                continue
            lit = (i > xt) if waxing else (i < -xt)
            if lit:
                col = (236, 238, 230, int(255 * dim))
            else:
                col = (58, 46, 80, int(150 * dim))          # earthshine-dark limb
            c[y + j, x + i] = col
    # a soft halo, a few pixels wide, very faint
    for j in range(-R - 3, R + 4):
        for i in range(-R - 3, R + 4):
            d = math.sqrt(i * i + j * j)
            if R < d <= R + 3 and 0 <= y + j < H and 0 <= x + i < W:
                a = int(38 * dim * (1 - (d - R) / 3.5))
                if c[y + j, x + i, 3] == 0:
                    c[y + j, x + i] = (220, 226, 250, a)
    return _crop(c)



def build(layerdir, out_path, commits=24, pushed_today=True, seed=7,
          W=440, H=140, scale=2, stars=26, accent="#B4553F", typ=None,
          ink=None, sub=None, mut=None, win_ratio=2.6,
          plane=True, moon=None, moon_at=None):
    meta = json.load(open(f"{layerdir}/scene.json"))
    rng = random.Random(seed)
    base = Image.open(f"{layerdir}/base.png").convert("RGB")
    fig = np.asarray(Image.open(f"{layerdir}/fig.png").convert("RGBA"))
    tree = np.asarray(Image.open(f"{layerdir}/tree.png").convert("RGBA"))
    try:
        fground = np.asarray(Image.open(f"{layerdir}/fground.png").convert("RGBA"))
    except FileNotFoundError:
        fground = None

    fb = meta["layers"]["fig"]
    parts_out, css = [], []

    parts_out.append(_img(base, 0, 0))

    # stars, behind everything solid
    st, placed, guard = [], 0, 0
    while placed < stars and guard < stars * 40:
        guard += 1
        sx, sy = rng.randint(int(W * .46), W - 4), rng.randint(2, 44)
        if 14 <= sx <= 275 and 10 <= sy <= 52:        # never inside a letter
            continue
        st.append(f'<rect class="s{placed%6}" x="{sx}" y="{sy}" width="1" '
                  f'height="1" fill="#E8EEFF"/>')
        placed += 1
    parts_out.append('<g id="stars">' + "".join(st) + "</g>")
    for k in range(6):
        css.append(f".s{k}{{animation:tw 6s ease-in-out infinite;"
                   f"animation-delay:-{k}s}}")
    css.append("@keyframes tw{0%,100%{opacity:.9}35%{opacity:.5}"
               "50%{opacity:.3}70%{opacity:.62}}")
    check(6)

    wl, wcss, lit_n = windows_layer(meta["windows"], commits, rng, win_ratio)
    parts_out.append(wl); css += wcss

    if plane:
        pl, pcss = plane_layer(W)
        parts_out.append(pl); css += pcss
    if moon is not None:
        parts_out.append(moon_layer(W, H, moon, **(moon_at or {})))

    if pushed_today:
        parts_out.append('<rect id="wish" x="296" y="8" width="3" height="1" '
                         'fill="#FFFFFF" opacity="0"/>')
        css.append("#wish{animation:wish 30s linear infinite}")
        css.append("@keyframes wish{0%,90%{opacity:0;transform:translate(0,0)}"
                   "91%{opacity:1}96%{opacity:0;transform:translate(44px,20px)}"
                   "100%{opacity:0;transform:translate(44px,20px)}}")
        check(30)

    try:
        labels = np.asarray(Image.open(f"{layerdir}/tree_clumps.png").convert("L"))
    except FileNotFoundError:
        labels = None
    mc = meta.get("clumps")
    if labels is not None and mc:
        # sprite-sheet path: real deformation, frames pre-baked from our asset
        tl, tcss, _, _ = tree_sheet_layer(tree, labels, mc)
        clumps = mc
    else:
        tl, tcss, clumps = tree_layers(tree, rng, labels, mc)
    parts_out.append(tl); css += tcss

    bl, bcss = birds_layer(rng, W)
    parts_out.append(bl); css += bcss

    ll, lcss = leaves_layer(clumps, rng)
    parts_out.append(ll); css += lcss

    # the figure: body pinned, head nodding, silhouette edge lifting
    parts_out.append(_crop(fig))
    hd, (hy0, hy1) = parts.head(fig, fb)
    parts_out.append(_crop(hd, "nod"))
    # An organic nod is not a sine wave.  `ease-in-out` at 1px means the head
    # is ALWAYS moving, which at this scale reads as vibration, not rhythm.
    # A real nod holds still, drops sharply on the beat, comes back, and waits.
    # So: discrete steps with a long hold, and a deeper accent every fourth
    # beat so the loop does not tick like a metronome.
    css.append(".nod{animation:nod 2s steps(1,end) infinite}")
    css.append("@keyframes nod{"
               "0%,20%{transform:translateY(0)}"
               "21%,29%{transform:translateY(1px)}"      # beat 1
               "30%,45%{transform:translateY(0)}"
               "46%,54%{transform:translateY(1px)}"      # beat 2
               "55%,70%{transform:translateY(0)}"
               "71%,79%{transform:translateY(1px)}"      # beat 3
               "80%,90%{transform:translateY(0)}"
               "91%,96%{transform:translateY(2px)}"      # beat 4, the accent
               "97%,100%{transform:translateY(0)}}")
    check(2)
    we = parts.wind_edge(fig, side="left")
    parts_out.append(_crop(we, "gust"))
    css.append(".gust{animation:gust 5s ease-in-out infinite}")
    css.append("@keyframes gust{0%,100%{transform:translate(0,0)}"
               "30%{transform:translate(-1px,0)}"
               "62%{transform:translate(-1px,-1px)}}")
    check(5)

    sp, scss = speaker_layer(fb["x"] + fb["w"] + 5, fb["y"] + fb["h"] - 9)
    parts_out.append(sp); css += scss

    # foreground grass LAST of the scene, so it overlaps his base and he is
    # sitting IN the hill rather than on top of a picture of one
    if fground is not None:
        parts_out.append(_crop(fground, "gustg"))
        css.append(".gustg{animation:gustg 5s ease-in-out infinite;"
                   "animation-delay:-1.7s}")
        css.append("@keyframes gustg{0%,100%{transform:translate(0,0)}"
                   "45%{transform:translate(-1px,0)}}")

    tl_img = type_layer(W, H, typ or TYPE, ink or INK, sub or SUB,
                        mut or MUT, hex_rgb(accent))
    parts_out.append(_crop(tl_img))

    style = ("<style>" + "".join(css) +
             "*{shape-rendering:crispEdges}#win rect{will-change:opacity}</style>")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
           f'width="{W*scale}" height="{H*scale}" role="img" '
           f'aria-label="Pixel-art header: a figure sits on a hilltop above a '
           f'city at dusk">{style}{"".join(parts_out)}</svg>')
    open(out_path, "w", encoding="utf-8").write(svg)
    return dict(bytes=len(svg.encode()), lit=lit_n, total=len(meta["windows"]),
                clumps=len(clumps))
