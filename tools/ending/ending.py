# -*- coding: utf-8 -*-
"""The closing scene: the header's hill, later, with the live apps pinned to a board.

    python tools/ending/ending.py [--state night] [--commits N]

The page opens with the figure sitting under the cherry tree looking at the
city.  It closes on the same hill: the figure has got up and stands, facing us,
beside a wooden notice board under the tree, pinning four notes to it, the live
apps, by the light of an old street lamp.  Same layers as the header
(tools/header/layers/<state>), same palette, same commit-lit city.  It stays at
dusk whatever the hour: the header follows the clock, the ending is the evening
the page is set in.

The board, the lamp, the notes and the figure's three poses are painted
(tools/ending/kit, Gemini, keyed from magenta and scaled to the header's pixel
grid); everything that reads or moves is SVG.

GitHub cannot make part of an image a link, so the scene is written out as
six SVG slices that share one viewBox space and are placed side by side with no
gap; the four note slices each sit in their own <a>.  Every slice carries the
scene and only its viewBox differs, so the animations stay in step.

The loop is 60 seconds (60 / period must be whole, see svgmake): the figure
pins the last note; the notes take turns glowing; a gust lifts them one by one
up and out of the frame; the figure scratches their head; then reaches up and
the notes come fluttering back onto their pins.
"""
import argparse, json, pathlib, random, sys
import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
KIT = HERE / "kit"
sys.path.insert(0, str(ROOT / "tools" / "header")); sys.path.insert(0, str(ROOT / "tools"))
import svgmake, hero                                  # noqa: E402  the header's own tooling
from px import pixel_text, text_width                 # noqa: E402  the README's pixel face

W, H, SCALE = 440, 140, 2
X0 = 17                    # crop the left 17px of grass so the strip is 423 -> 846px, GitHub's column
GROUND = 122               # where feet and posts stand, the same row the sitting figure sat on
GOLD, GOLD2, GOLD3 = "#E8A35C", "#B8762E", "#6A3F14"
INK, INK2, WARM = "#30231A", "#80736A", "#FDD196"

NOTES = [  # name, two short lines, link
    ("APIN", ("LEAF DOCTOR", "ONE PHOTO"), "https://dxv-404-apin.hf.space"),
    ("ORACLE", ("A GROUP'S", "DECISIONS"), "https://oracleonline.app"),
    ("STRIDE", ("EVOLVED", "WALKERS"), "https://www.stridewalk.fun"),
    ("INK", ("STUDYING", "AS A GAME"), "https://github.com/Dxv-404/ink-education"),
]
LAMP_X, FIG_X, BOARD_X, BOARD_W = 50, 96, 132, 226        # lamp | figure | board, all standing on GROUND
LIT = {"dawn": 0.45, "day": 0.0, "dusk": 1.0, "night": 1.0}   # the page's hour decides whether the lamp is lit


def rect(x, y, w, h, fill, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"{extra}/>'


def ptext(s, x, y, scale, fill, tracking=1, shadow=None):
    out = pixel_text(s, x + 0.5, y + 0.5, scale, shadow, tracking) if shadow else ""
    return out + pixel_text(s, x, y, scale, fill, tracking)


def kit(name):
    return Image.open(KIT / f"{name}.png").convert("RGBA")


def fit_width(im, w):
    return im.resize((w, max(1, int(round(im.height * w / im.width)))), Image.BOX)


def cork_box(board):
    """The empty face of the painted board: the largest warm cork region."""
    a = np.asarray(board).astype(int); r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    cork = (al > 0) & (r > 150) & (g > 100) & (b < 150) & (r - b > 55) & (g > b + 20)
    rows = np.nonzero(cork.sum(1) > board.width * .3)[0]; cols = np.nonzero(cork.sum(0) > 8)[0]
    return int(cols.min()), int(rows.min()), int(cols.max() - cols.min() + 1), int(rows.max() - rows.min() + 1)


def layout():
    """Where everything stands, in scene coordinates.  Computed from the painted
    assets so the README block and the slices always agree."""
    board = fit_width(kit("board"), BOARD_W)
    fx, fy, fw, fh = cork_box(board)
    # the painted posts are long; keep the frame and the mossy feet, drop the plain middle
    a = np.asarray(board); top, keep = fy + fh + 8, 22
    board = Image.fromarray(np.vstack([a[:top], a[board.height - keep:]]), "RGBA")
    bx, by = BOARD_X, GROUND - board.height
    notes = [kit(f"note{i}") for i in (0, 1, 3, 2)]        # the curled-corner paper goes to INK, whose short name clears the curl
    # the painted notes are portrait and the face is a low strip: keep them at full
    # size (the words need the width) and trim their lower edge to fit the face
    nh = fh - 6
    notes = [n.crop((0, 0, n.width, min(n.height, nh))) for n in notes]
    gap = (fw - sum(n.width for n in notes)) / 5
    pos, x = [], bx + fx + gap
    for i, n in enumerate(notes):
        nx = int(round(x)); ny = by + fy + (fh - n.height) // 2 + (0, 2, -1, 1)[i]
        pos.append((nx, ny, n)); x += n.width + gap
    cuts = [X0, pos[0][0] - 4] + [(pos[i][0] + pos[i][2].width + pos[i + 1][0]) // 2 for i in range(3)] + [pos[3][0] + pos[3][2].width + 4, W]
    return dict(board=board, bx=bx, by=by, face=(bx + fx, by + fy, fw, fh), notes=pos, cuts=cuts)


# ── the scene ─────────────────────────────────────────────────────────────────
def build(state, commits, out_dir, moon=None, seed=7, full=False):
    layerdir = ROOT / "tools" / "header" / "layers" / state
    meta = json.load(open(layerdir / "scene.json"))
    rng = random.Random(seed)
    h = hero.HOUR[state]
    lit = LIT[state]
    L = layout()
    parts, css = [], []

    # the base, with the sitting figure filled in: they have got up
    base = np.array(Image.open(layerdir / "base.png").convert("RGB"))
    fb = meta["layers"]["fig"]
    x0, x1, y0, y1 = fb["x"], fb["x"] + fb["w"], fb["y"], fb["y"] + fb["h"] + 1
    base[y0:y1, x0:x1] = base[y0:y1, x0 - (x1 - x0):x0]
    base_im = Image.fromarray(base)
    parts.append("@BASE@")

    # stars, windows, moon: the header's own layers
    st = []
    for k in range(int(h["stars"])):
        sx, sy = rng.randint(int(W * .05), W - 4), rng.randint(2, 36)
        st.append(f'<rect class="s{k % 6}" x="{sx}" y="{sy}" width="1" height="1" fill="#E8EEFF"/>')
    parts.append('<g id="stars">' + "".join(st) + "</g>")
    for k in range(6): css.append(f".s{k}{{animation:tw 6s ease-in-out infinite;animation-delay:-{k}s}}")
    css.append("@keyframes tw{0%,100%{opacity:.9}35%{opacity:.5}50%{opacity:.3}70%{opacity:.62}}")
    wl, wcss, lit_n = svgmake.windows_layer(meta["windows"], int(round(commits * h["winmul"])), rng, hero.WIN_RATIO)
    parts.append(wl); css += wcss
    if h["moon"]:
        parts.append(svgmake.moon_layer(W, H, moon if moon is not None else hero.moon_phase(), dim=h["dim"]))

    # the tree, behind the board (its petals come last, over everything)
    tree = np.asarray(Image.open(layerdir / "tree.png").convert("RGBA"))
    try:
        labels = np.asarray(Image.open(layerdir / "tree_clumps.png").convert("L"))
    except FileNotFoundError:
        labels = None
    mc = meta.get("clumps")
    if labels is not None and mc:
        tl, tcss, _, _ = svgmake.tree_sheet_layer(tree, labels, mc); clumps = mc
    else:
        tl, tcss, clumps = svgmake.tree_layers(tree, rng, labels, mc)
    css += tcss
    ll, lcss = svgmake.leaves_layer(clumps, rng); css += lcss
    parts.append("@TREE@"); tree_parts = tl

    # the lamp's light, under everything it lights
    lamp = kit("lamp"); lx, ly = LAMP_X, GROUND - lamp.height          # the head is at the top of the sprite
    hx, hy = lx + lamp.width // 2, ly + 9
    parts.append('<defs><radialGradient id="lg"><stop offset="0" stop-color="#FDD196" stop-opacity=".5"/>'
                 '<stop offset=".45" stop-color="#F8A96E" stop-opacity=".16"/><stop offset="1" stop-color="#F8A96E" stop-opacity="0"/></radialGradient>'
                 '<radialGradient id="pool"><stop offset="0" stop-color="#FDD196" stop-opacity=".28"/><stop offset="1" stop-color="#FDD196" stop-opacity="0"/></radialGradient></defs>')
    if lit:
        parts.append(f'<g class="glow" opacity="{lit:.2f}"><ellipse cx="{hx}" cy="{hy}" rx="120" ry="78" fill="url(#lg)"/>'
                     f'<ellipse cx="{hx}" cy="{GROUND + 3}" rx="70" ry="9" fill="url(#pool)"/></g>')
        css.append(f".glow{{transform-origin:{hx}px {hy}px;animation:br 6s ease-in-out infinite,st 60s steps(1) infinite}}"
                   "@keyframes br{0%,100%{transform:scale(.97)}50%{transform:scale(1.03)}}"
                   "@keyframes st{0%,39.4%{opacity:1}39.5%{opacity:.4}39.8%{opacity:1}40.1%{opacity:.55}40.4%,100%{opacity:1}}")

    # the board, painted, with the LIVE APPS plate on its roof
    bx, by, board = L["bx"], L["by"], L["board"]
    parts.append('<g id="board">' + svgmake._img(board, bx, by))
    tw = text_width("LIVE APPS", 1, 1) + 10; tx = L["face"][0] + 2; ty = L["face"][1] - 15
    parts.append(rect(tx - 1, ty - 1, tw + 2, 13, GOLD3) + rect(tx, ty, tw, 11, "#171219") + rect(tx, ty, tw, 1, GOLD2) + ptext("LIVE APPS", tx + 5, ty + 2, 1, GOLD, 1, shadow=GOLD3) + "</g>")

    # the notes: painted paper, the words in the pixel face, each in its own group so it can fly
    for i, ((name, lines, _), (nx, ny, nimg)) in enumerate(zip(NOTES, L["notes"])):
        nw, nh = nimg.width, nimg.height
        # every line centred on the paper, tighter tracking for long names, so nothing meets the edge
        ntr = 1 if text_width(name, 1, 1) <= nw - 8 else 0
        cx_ = lambda t, sc, tr: nx + (nw - text_width(t, sc, tr)) / 2
        ty_ = ny + 11
        n = [f'<rect class="hl" x="{nx - 3}" y="{ny - 2}" width="{nw + 6}" height="{nh + 5}" fill="{WARM}" opacity="0"/>',
             svgmake._img(nimg, nx, ny),
             ptext(name, cx_(name, 1, ntr), ty_, 1, INK, ntr),
             pixel_text(lines[0], cx_(lines[0], .5, 1), ty_ + 12, .5, INK2, 1), pixel_text(lines[1], cx_(lines[1], .5, 1), ty_ + 19, .5, INK2, 1)]
        parts.append(f'<g class="note n{i}" style="transform-origin:{nx + nw // 2}px {ny}px">' + "".join(n) + "</g>")
        css.append(f".n{i} .hl{{animation:hl 10s ease-in-out infinite;animation-delay:{i * 2.5}s}}")
        f0, f1 = 40 + i * 1.6, 40 + i * 1.6 + 6                      # the gust, one note after another
        r0, r1 = 66 + i * 2.4, 66 + i * 2.4 + 5                      # the return
        css.append(f".n{i}{{animation:fly{i} 60s ease-in-out infinite}}@keyframes fly{i}{{"
                   f"0%,{f0:.1f}%{{transform:translate(0,0) rotate(0)}}"
                   f"{f0 + 1:.1f}%{{transform:translate(-1px,-2px) rotate(-3deg)}}"
                   f"{f1:.1f}%{{transform:translate(2px,-130px) rotate(-14deg)}}"
                   f"{f1 + .1:.1f}%,{r0:.1f}%{{transform:translate(0,-130px) rotate(0)}}"
                   f"{r0 + (r1 - r0) * .6:.1f}%{{transform:translate(1px,-8px) rotate(4deg)}}"
                   f"{r1:.1f}%,100%{{transform:translate(0,0) rotate(0)}}}}")
    css.append("@keyframes hl{0%,3%{opacity:0}12%,20%{opacity:.16}28%,100%{opacity:0}}")

    # the lamp itself and its moth, and the figure, one painted pose at a time
    parts.append(svgmake._img(lamp, lx, ly))
    if lit:
        parts.append(f'<g class="moth"><rect x="{hx + 7}" y="{hy - 2}" width="2" height="1" fill="#F0E0C0"/><rect x="{hx + 6}" y="{hy - 1}" width="1" height="1" fill="#C8B090" opacity=".7"/></g>')
        css.append(f".moth{{transform-origin:{hx}px {hy}px;animation:mo 4s linear infinite}}@keyframes mo{{to{{transform:rotate(360deg)}}}}")
    for pose, keys in (("reach", "0%,3.3%{opacity:1}3.4%,66%{opacity:0}66.1%,80%{opacity:1}80.1%,100%{opacity:0}"),
                       ("idle", "0%,3.3%{opacity:0}3.4%,41%{opacity:1}41.1%,80%{opacity:0}80.1%,100%{opacity:1}"),
                       ("scratch", "0%,41%{opacity:0}41.1%,66%{opacity:1}66.1%,100%{opacity:0}")):
        sp = kit(f"fig_{pose}")
        parts.append(f'<g class="fig {pose}">' + svgmake._img(sp, FIG_X, GROUND - sp.height) + "</g>")
        css.append(f".fig.{pose}{{animation:p_{pose} 60s steps(1) infinite}}@keyframes p_{pose}{{{keys}}}")
    parts.append(ll)                                                   # petals, over everything
    try:
        fground = np.asarray(Image.open(layerdir / "fground.png").convert("RGBA"))
        parts.append(svgmake._crop(fground, "gustg"))
        css.append(".gustg{animation:gustg 5s ease-in-out infinite;animation-delay:-1.7s}@keyframes gustg{0%,100%{transform:translate(0,0)}45%{transform:translate(-1px,0)}}")
    except FileNotFoundError:
        pass

    style = "<style>" + "".join(css) + "*{shape-rendering:crispEdges}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>"
    body = "".join(parts)
    out_dir = pathlib.Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    names = ["a", "apin", "oracle", "stride", "ink", "b"]
    labels_ = ["The hill from the header, later: a street lamp, and the figure standing at a wooden board",
               "APIN, pinned to the board", "Oracle, pinned to the board", "stride, pinned to the board", "INK, pinned to the board",
               "The cherry tree and the city"]
    cuts, written = L["cuts"], []
    for k in range(6):
        x0, x1 = cuts[k], cuts[k + 1]
        cx0, cx1 = max(0, x0 - 2), min(W, x1 + 2)
        piece = body.replace("@BASE@", svgmake._img(base_im.crop((cx0, 0, cx1, H)), cx0, 0))
        piece = piece.replace("@TREE@", tree_parts if x1 > 250 else "")       # the canopy starts at x=254
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} 0 {x1 - x0} {H}" width="{(x1 - x0) * SCALE}" height="{H * SCALE}" '
               f'role="img" aria-label="{labels_[k]}">{style}{piece}</svg>')
        p = out_dir / f"16_ending_{names[k]}.svg"; p.write_text(svg, encoding="utf-8"); written.append((p, x1 - x0))
    if full:                                                            # one whole-scene file, for previews only
        piece = body.replace("@BASE@", svgmake._img(base_im)).replace("@TREE@", tree_parts)
        (out_dir / "ending_full.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{X0} 0 {W - X0} {H}" width="{(W - X0) * SCALE}" height="{H * SCALE}">{style}{piece}</svg>', encoding="utf-8")
    return written, lit_n


def readme_block():
    """The HTML the README needs: six slices, no whitespace between them, the four
    note slices linked.  Widths are percentages of the column so the row never
    wraps and every slice scales by the same factor."""
    names = ["a", "apin", "oracle", "stride", "ink", "b"]
    cuts = layout()["cuts"]; total = cuts[-1] - cuts[0]
    out = ['<p align="center">']
    for k in range(6):
        w = (cuts[k + 1] - cuts[k]) / total * 100
        img = f'<img src="assets/16_ending_{names[k]}.svg" width="{w:.3f}%" alt="">'
        if 1 <= k <= 4:
            name, lines, href = NOTES[k - 1]
            img = f'<a href="{href}"><img src="assets/16_ending_{names[k]}.svg" width="{w:.3f}%" alt="{name}: {lines[0].lower()} {lines[1].lower()}. Pinned to the board; opens {href}"></a>'
        out.append(img)
    out.append("</p>")
    return "".join(out)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--state", choices=[b[1] for b in hero.BANDS], default="dusk",
                   help="the ending stays at evening whatever the hour; the header alone follows the clock")
    p.add_argument("--commits", type=int, default=24)
    p.add_argument("--out", default=str(ROOT / "assets"))
    p.add_argument("--moon", type=float, default=None)
    p.add_argument("--readme", action="store_true", help="print the README block and exit")
    p.add_argument("--full", action="store_true", help="also write ending_full.svg, the whole scene, for previews")
    a = p.parse_args()
    if a.readme:
        print(readme_block()); sys.exit()
    state = a.state
    written, lit_n = build(state, max(0, min(200, a.commits)), a.out, a.moon, full=a.full)
    for pth, w in written: print(f"{pth.name:24s} {w * SCALE}px  {len(pth.read_bytes()) // 1024} KB")
    print(f"state={state} lit windows={lit_n}")
