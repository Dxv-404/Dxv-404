# -*- coding: utf-8 -*-
"""Project cards for the README: a painted pixel scene in a painted frame.

    python tools/cards/card.py g_one        -> assets/06_g_one.svg

Anatomy (all sizes in card pixels; the card is 430 wide):
  frame    Gemini-painted inlay kit in tools/cards/kit: one corner medallion,
           mirrored into four corners, and one edge tile, repeated along the
           four sides (rotated for the verticals).  Same on every card.
  art      the repo's painting (tools/cards/src/<id>.png, a 2048 square),
           cropped to a landscape window and cut to the card palette
  bleed    the nearest creatures are lifted from the painting as sprites and
           drawn again over the window's bottom edge, so the picture steps
           out onto the card body
  plate    the name, on a gold-edged plate riding the window's bottom edge,
           left; the tag under it
  body     two facts a stranger can read, three labelled values, a two- or
           three-line blurb.  No bars, no icons that need a legend.
  motion   fireflies (two of them drift out past the card and back), the
           plant's glow breathing, a light running the frame every 16 s, the
           four corner gems glinting in turn, the visible creatures blinking.
           All CSS inside the SVG, so it plays wherever GitHub shows the image.

The SVG has a clear margin around the card so the fireflies can leave it.
"""
import base64, io, json, pathlib, sys
import numpy as np
from PIL import Image, ImageEnhance

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from px import rect, pixel_text, mono, svg, text_width  # noqa: E402

CW, CH = 430, 516            # card
M, T = 14, 22                # margin around the card; frame thickness
AX, AY, AW, AH = T, T, CW - 2 * T, 268          # art window
WIN_W, WIN_H = 390, 336                          # the painting is quantised at this size, then scaled to the window
PALE, MUTED, PANEL, LINE = "#F3EAD8", "#8E96A0", "#151A21", "#2A323C"
GOLD, GOLD2, GOLD3, SHADOW = "#E8A35C", "#B8762E", "#6A3F14", "#0B0910"


# ── painting ────────────────────────────────────────────────────────────────
def quantise(path, w=WIN_W, h=WIN_H, k=48, rescue=16, shift=0):
    """Centre-crop to the window, BOX-downscale, median-cut to k colours, then
    rescue the worst-served colours one at a time (farthest-point), so small
    accents - the red in the crack, the mint plant tips - keep their colour."""
    im = Image.open(path).convert("RGB")
    tw, th = im.size
    nh = int(round(tw * h / w))
    top = (th - nh) // 2 + int(shift)
    im = im.crop((0, top, tw, top + nh)).resize((w, h), Image.BOX)
    im = ImageEnhance.Color(im).enhance(1.22)
    q = im.quantize(colors=k, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    a = np.array(im).astype(np.int32).reshape(-1, 3)
    pal = np.array(sorted({tuple(c) for c in np.array(q).reshape(-1, 3)}), np.int32)
    d = ((a[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
    best, idx = d.min(1), d.argmin(1)
    for _ in range(rescue):
        worst = int(best.argmax())
        if best[worst] < 42 ** 2 / 3:
            break
        c = a[worst]; dn = ((a - c) ** 2).sum(-1); take = dn < best
        best = np.where(take, dn, best); idx = np.where(take, len(pal), idx); pal = np.vstack([pal, c])
    return Image.fromarray(pal[idx].reshape(h, w, 3).astype(np.uint8))


def b64(img):
    b = io.BytesIO(); img.save(b, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def img(x, y, im, w=None, h=None):
    w = w or im.width; h = h or im.height
    return f'<image x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" image-rendering="pixelated" href="{b64(im)}"/>'


def ptext(s, x, y, scale, fill, tracking=1, shadow=SHADOW):
    return pixel_text(s, x + 1, y + 1, scale, shadow, tracking) + pixel_text(s, x, y, scale, fill, tracking)


# ── frame ───────────────────────────────────────────────────────────────────
def frame(g):
    corner = Image.open(HERE / "kit" / "corner.png").convert("RGBA")
    edge = Image.open(HERE / "kit" / "edge.png").convert("RGBA")
    vert = edge.rotate(90, expand=True)
    ew = edge.width * (T / edge.height)
    def sc(im, w, h): return im.resize((int(w), int(h)), Image.NEAREST)
    g.append(f'<defs><pattern id="hp" x="{T}" y="0" width="{ew:.1f}" height="{T}" patternUnits="userSpaceOnUse">{img(0, 0, sc(edge, ew, T))}</pattern>'
             f'<pattern id="vp" x="0" y="{T}" width="{T}" height="{ew:.1f}" patternUnits="userSpaceOnUse">{img(0, 0, sc(vert, T, ew))}</pattern></defs>')
    g += [f'<rect x="{T}" y="0" width="{CW - 2 * T}" height="{T}" fill="url(#hp)"/>',
          f'<g transform="translate(0 {CH}) scale(1 -1)"><rect x="{T}" y="0" width="{CW - 2 * T}" height="{T}" fill="url(#hp)"/></g>',
          f'<rect x="0" y="{T}" width="{T}" height="{CH - 2 * T}" fill="url(#vp)"/>',
          f'<g transform="translate({CW} 0) scale(-1 1)"><rect x="0" y="{T}" width="{T}" height="{CH - 2 * T}" fill="url(#vp)"/></g>']
    cs = T + 26
    c = img(0, 0, sc(corner, cs, cs))
    g += [c, f'<g transform="translate({CW} 0) scale(-1 1)">{c}</g>',
          f'<g transform="translate(0 {CH}) scale(1 -1)">{c}</g>', f'<g transform="translate({CW} {CH}) scale(-1 -1)">{c}</g>']
    return cs


# ── card ────────────────────────────────────────────────────────────────────
def build(spec):
    W, H = CW + 2 * M, CH + 2 * M
    g, css = [rect(0, 0, CW, CH, PANEL)], []
    cs = frame(g)
    # art
    win = quantise(HERE / "src" / f"{spec['id']}.png", shift=spec.get("shift", 0))
    S = AW / WIN_W
    win = win.crop((0, 0, WIN_W, int(round(AH / S))))     # the window shows the top rows; the rest is where the creatures bleed from
    flip = spec.get("flip", False)
    if flip: win = win.transpose(Image.FLIP_LEFT_RIGHT)
    g.append(f'<g class="art">{img(AX, AY, win, AW, AH)}</g>')
    # the plant's glow breathes
    if spec.get("glow"):
        gx0 = WIN_W - spec["glow"][0] if flip else spec["glow"][0]
        gx, gy = AX + gx0 * S, AY + spec["glow"][1] * S
        c0, c1 = spec.get("glow_color", ("#B8FFC8", "#9BFFB0"))
        g.append(f'<defs><radialGradient id="pg"><stop offset="0" stop-color="{c0}" stop-opacity=".34"/><stop offset=".55" stop-color="{c1}" stop-opacity=".10"/><stop offset="1" stop-color="{c1}" stop-opacity="0"/></radialGradient></defs>')
        g.append(f'<clipPath id="artc"><rect x="{AX}" y="{AY}" width="{AW}" height="{AH}"/></clipPath>')
        g.append(f'<g clip-path="url(#artc)"><circle class="glow" cx="{gx:.0f}" cy="{gy:.0f}" r="44" fill="url(#pg)"/></g>')
        css.append(f".glow{{transform-origin:{gx:.0f}px {gy:.0f}px;animation:gl 6s ease-in-out infinite}}@keyframes gl{{0%,100%{{transform:scale(.9);opacity:.8}}50%{{transform:scale(1.2);opacity:1}}}}")
    # plate, left, riding the window's bottom edge
    name, tag = spec["name"], spec["tag"]
    ns = 3 if text_width(name, 3, 2) + 40 <= 200 else 2
    pw = text_width(name, ns, 2) + 40; px = T + 12; py = AY + AH - 18
    g += [rect(px - 2, py - 2, pw + 4, 40, GOLD3), rect(px, py, pw, 36, GOLD2), rect(px + 2, py + 2, pw - 4, 32, "#171219")]
    for (x, y) in ((px + 3, py + 3), (px + pw - 6, py + 3), (px + 3, py + 30), (px + pw - 6, py + 30)): g.append(rect(x, y, 3, 3, GOLD2))
    g.append(ptext(name, px + 20, py + (36 - 7 * ns) // 2 + 1, ns, GOLD, 2, shadow=GOLD3))
    g.append(pixel_text(tag, px + 2, py + 44, 1, MUTED, 1))
    # bleed: the nearest creatures stand on the body
    eyes = []
    sheet_p = HERE / "src" / f"{spec['id']}_sprites.png"
    if sheet_p.exists():
        meta = json.load(open(HERE / "src" / f"{spec['id']}_sprites.json"))
        sheet = Image.open(sheet_p).convert("RGBA")
        for i, sp in enumerate(meta["sprites"]):
            sw = sp["size"]
            if sp["cy"] * S > AH - 30:
                spr = sheet.crop((i * sw, 0, (i + 1) * sw, sw))
                cx = WIN_W - sp["cx"] if flip else sp["cx"]
                if flip: spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
                x, y = AX + cx * S - sw * S / 2, AY + sp["cy"] * S - sw * S / 2
                g.append(img(x, y, spr, sw * S, sw * S))
                if spec.get("blink", True): eyes.append((x + sw * S * (0.40 if flip else 0.60), y + sw * S * 0.44))
    # body
    y = py + 68; x0 = T + 12; w0 = CW - 2 * T - 24
    for i, (k, v) in enumerate(spec["rows"]):
        g.append(pixel_text(k, x0, y + i * 22, 1, GOLD, 1)); g.append(pixel_text(v, x0 + 124, y + i * 22, 1, PALE, 1))
    g.append(rect(x0, y + 50, w0, 1, LINE))
    for i, (lab, val) in enumerate(zip(spec.get("labels", ("LANGUAGE", "STATUS", "ACTIVITY")), spec["facts"])):
        cx = x0 + i * (w0 // 3)
        g.append(pixel_text(lab, cx, y + 62, 1, MUTED, 1)); g.append(pixel_text(val, cx, y + 75, 1, PALE, 1))
        if i: g.append(rect(cx - 10, y + 60, 1, 26, LINE))
    for i, l in enumerate(spec["blurb"]): g.append(mono(l, x0, y + 104 + i * 13, 10, MUTED))
    # frame light, gem glints, blinks
    per = 2 * (CW - T + CH - T)
    g.append(f'<rect class="run" x="{T // 2}" y="{T // 2}" width="{CW - T}" height="{CH - T}" fill="none" stroke="{PALE}" stroke-width="1" stroke-dasharray="16 {per}" opacity=".85"/>')
    css.append(f".run{{animation:run 16s linear infinite}}@keyframes run{{to{{stroke-dashoffset:-{per + 16}}}}}")
    gx = cs // 2
    for i, (x, y) in enumerate(((gx, gx), (CW - gx, gx), (gx, CH - gx), (CW - gx, CH - gx))):
        g.append(f'<rect class="gem g{i}" x="{x - 3}" y="{y - 3}" width="6" height="6" fill="{PALE}"/>')
    css.append(".gem{opacity:0;animation:gg 7s steps(1) infinite}@keyframes gg{0%,3%{opacity:1}4%,100%{opacity:0}}.g1{animation-delay:1.75s}.g2{animation-delay:3.5s}.g3{animation-delay:5.25s}")
    for i, (ex, ey) in enumerate(eyes):
        g.append(f'<rect class="lid l{i}" x="{ex - 2:.0f}" y="{ey - 1:.0f}" width="4" height="3" fill="#F2DDA0"/>')
        css.append(f".l{i}{{animation:bl 6.5s steps(1) infinite;animation-delay:-{i * 2.1:.1f}s}}")
    css.append(".lid{opacity:0}@keyframes bl{0%,93%{opacity:0}94%,97%{opacity:1}98%,100%{opacity:0}}")
    # fireflies: five in the meadow, two of them drift out past the card and back
    rng = np.random.default_rng(spec.get("seed", 7))
    for i in range(5):
        x = AX + int(rng.integers(40, AW - 40)); y = AY + int(rng.integers(120, AH - 30))
        if i < 2:
            dx, dy = (-(x + M + 6) if i == 0 else (CW - x + M + 4)), -int(rng.integers(20, 60)); dur = 18
        else:
            dx, dy = int(rng.integers(-14, 14)), int(rng.integers(-10, 6)); dur = int(rng.choice([6, 8, 12]))
        g.append(f'<g class="ff f{i}"><rect x="{x - 1}" y="{y - 1}" width="3" height="3" fill="#FFD27A" opacity=".35"/><rect x="{x}" y="{y}" width="1" height="1" fill="#FFF1C4"/></g>')
        css.append(f".f{i}{{animation:fd{i} {dur}s ease-in-out infinite;animation-delay:-{float(rng.uniform(0, 6)):.1f}s}}"
                   f"@keyframes fd{i}{{0%,100%{{transform:translate(0,0);opacity:.9}}50%{{transform:translate({dx}px,{dy}px);opacity:{'.9' if i < 2 else '.35'}}}}}")
    d = spec.get("reveal", 0.0)
    css.append(f".card{{animation:rv .9s cubic-bezier(.2,.7,.2,1) {d:.1f}s both}}@keyframes rv{{from{{opacity:0;transform:translate({M}px,{M + 14}px)}}to{{opacity:1;transform:translate({M}px,{M}px)}}}}"
               f".art{{animation:ra .8s ease-out {d + .35:.2f}s both}}@keyframes ra{{from{{opacity:0}}to{{opacity:1}}}}")
    body = f'<g class="card" transform="translate({M} {M})">{"".join(g)}</g>'
    return svg(W, H, body, "".join(css), title=spec["name"], desc=spec["alt"])


CARDS = {
    "g_one": dict(
        id="g_one", name="G-ONE", tag="RESEARCH", reveal=0.00, glow=(285, 162),
        rows=[("REWARDED FOR", "EATING ONLY"), ("THE QUESTION", "DO THEY LEARN TO SURVIVE?")],
        facts=("PYTHON", "RUNNING", "166 COMMITS"),
        blurb=["Small recurrent networks evolve in a grid world,",
               "paid only to eat. Whether they also learn to avoid",
               "the predator is the experiment."],
        alt="G-ONE: evolved agents in a night meadow, rewarded only to eat. Do they learn to survive anyway?",
        out="assets/06_g_one.svg"),
    "crossroads_rl": dict(
        id="crossroads_rl", name="CROSSROADS-RL", tag="RESEARCH", reveal=0.15, flip=True, blink=False, glow=(267, 156), glow_color=("#9FF5E8", "#5DCAA5"),
        rows=[("THE SIGNAL", "ONE BIT, NOTHING ELSE"), ("THE QUESTION", "DO THEY INVENT RIGHT OF WAY?")],
        facts=("PYTHON", "COMPLETE", "FEB 2026"),
        blurb=["Four PPO agents meet at a crossing with no lights, no",
               "signs and no rules: three motions and a one-bit signal",
               "each. Three reward regimes, three driving cultures."],
        alt="crossroads-rl: four reinforcement-learning agents negotiate an unsignaled crossroads at dusk with a one-bit signal. Do they invent right of way?",
        out="assets/07_crossroads_rl.svg"),
    "stride": dict(
        id="stride", name="STRIDE", tag="STUDY", reveal=0.30, flip=True, blink=False, glow=(327, 100), glow_color=("#FFE0A0", "#E8A35C"),
        rows=[("THE GENES", "18 NUMBERS, 6 JOINTS"), ("THE QUESTION", "CAN EVOLUTION TEACH IT TO WALK?")],
        facts=("TS + PYTHON", "LIVE", "MAR 2026"),
        blurb=["A stick figure with six motorised joints learns to walk",
               "by evolution alone: 100 walkers, 75 generations, 18 genes",
               "each. Genetic algorithm against PSO, DE and CMA-ES."],
        alt="stride: a line of stick-figure walkers crosses a salt flat at dusk, the first fallen, the last walking on toward the horizon. Can evolution teach a six-jointed figure to walk?",
        out="assets/08_stride.svg"),
    "arivu": dict(
        id="arivu", name="ARIVU", tag="TOOL", reveal=0.45, blink=False, glow=(207, 253), glow_color=("#FFE0A0", "#E8A35C"),
        rows=[("IT TRACES", "WHERE A PAPER'S IDEAS CAME FROM"), ("THE QUESTION", "CUT ONE PAPER: DOES THE FIELD FALL?")],
        facts=("PYTHON", "BUILT", "92 COMMITS"),
        blurb=["Follows a paper's citations back through its ancestors,",
               "then removes them one at a time to see which ones the",
               "field cannot stand without. Postgres, OpenAlex, S2."],
        alt="Arivu: a vast lantern tree at dusk, its glowing roots spread across the ground, one root cut and gone dark. It traces where a paper's ideas came from; cut one paper, does the field fall?",
        out="assets/09_arivu.svg"),
    "apin": dict(
        id="apin", name="APIN", tag="LIVE APP", reveal=0.60, flip=True, blink=False, glow=(197, 201), glow_color=("#D8FFF4", "#7FE0C8"),
        rows=[("IT READS", "ONE LEAF FROM ONE PHOTO"), ("THE QUESTION", "WHAT IS WRONG, AND HOW SURE?")],
        labels=("LANGUAGE", "STATUS", "WHERE"), facts=("PYTHON", "LIVE", "HUGGING FACE"),
        blurb=["Photograph a tomato, okra or cabbage leaf and get a",
               "diagnosis with calibrated confidence, a heat map of",
               "where the model looked, and what to do about it."],
        alt="APIN: a figure kneels in a vegetable field at dusk, lighting one cabbage leaf with a phone. Leaf-disease diagnosis for tomato, okra and brassica with calibrated confidence and a Grad-CAM heat map. Live on Hugging Face.",
        out="assets/10_apin.svg"),
    "afwah": dict(
        id="afwah", name="AFWAH", tag="STUDY", reveal=0.75, blink=False, glow=(215, 269), glow_color=("#FFE0A0", "#E8A35C"),
        rows=[("IT SPREADS", "ONE RUMOUR ACROSS FOUR NETWORKS"), ("THE QUESTION", "WHICH PLATFORM LETS IT LIVE?")],
        facts=("PYTHON", "COMPLETE", "FEB 2026"),
        blurb=["A rumour is seeded on a few nodes and left to run through",
               "four platforms with their own shapes and rules, a thousand",
               "times over. Fact-checkers fight it. Sometimes it dies."],
        alt="Afwah: a lone telephone pole on a dusk hill, four wires running to four distant clusters of lights, birds spreading out along the wires from the pole, the nearest burning ember orange, one pale blue bird on a wire gone dark. A Monte Carlo simulation of misinformation across four social networks.",
        out="assets/11_afwah.svg"),
    "oracle": dict(
        id="oracle", name="ORACLE", tag="IN PROGRESS", reveal=0.90, blink=False, glow=(203, 186), glow_color=("#FFE0A0", "#E8A35C"),
        rows=[("IT KEEPS", "A GROUP'S RESEARCH DECISIONS"), ("THE RULE", "NOTHING CHANGES WITHOUT REVIEW")],
        facts=("MARKDOWN + YAML", "TEMPLATE", "AUG 2026"),
        blurb=["A repository template for research decision records:",
               "decisions, notes, living documents and a library, every",
               "change passing through a governed pull-request gate."],
        alt="Oracle: a tall standing stone in a dusk meadow, its face carved with rows of glowing entries like a ledger, a figure adding a new page while a circle of eight holds lanterns, five lit and raised, three dark. A template for a research group's governed decision records: nothing is written until enough of the group approves.",
        out="assets/12_oracle.svg"),
    "ink": dict(
        id="ink", name="INK", tag="APP", reveal=1.05, blink=False, glow=(152, 135), glow_color=("#FFE0A0", "#E8A35C"),
        rows=[("IT TURNS", "QUESTIONS INTO BOUNTIES"), ("THE IDEA", "STUDYING AS A GAME WORTH PLAYING")],
        facts=("HTML + PYTHON", "SHIPPED", "2025"),
        blurb=["A retro campus toolkit: post a doubt as a bounty, trade",
               "notes in a marketplace, book tutoring, find a study spot,",
               "and keep a pixel dashboard of habits and streaks."],
        alt="INK: a campus notice board at dusk pinned with glowing notes, students gathered under string lights. A retro, gamified academic toolkit.",
        out="assets/13_ink.svg"),
}


if __name__ == "__main__":
    for key in (sys.argv[1:] or CARDS):
        spec = CARDS[key]
        s = build(spec)
        out = HERE.parent.parent / spec["out"]
        out.write_text(s, encoding="utf-8")
        print(out.relative_to(HERE.parent.parent), len(s.encode()) // 1024, "KB")
