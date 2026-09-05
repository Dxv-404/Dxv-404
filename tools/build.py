#!/usr/bin/env python3
"""
build.py — regenerates every SVG in assets/ for the Dxv-404 profile README.

    python3 build.py [outdir]

Edit the DATA block at the bottom to change repo copy, then re-run.
"""
import os
import random
import sys

from px import (DARK, dot, mono, panel, pixel_text, rect, runs_to_path,
                svg, text_width)

random.seed(404)  # stable star field between builds

# ═════════════════════════════════════════════════════════════════════════════
# The character sprite. 28x40 source, drawn at 3x -> 84x120 on the page.
#   .  transparent      S  skin            J  jacket
#   K  outline          D  skin shadow     B  jacket shadow
#   L  eye highlight    
#   H  hair             E  eye             P  trousers
#   G  hair highlight   W  shirt           R  rim light
#   o  ground shadow
# ═════════════════════════════════════════════════════════════════════════════
SPRITE = [
    "............................",
    "..........KKKKKKKK..........",
    "........KKHHHHHHHHKK........",
    ".......KHHHHHHHHHHHHK.......",
    "......KHHHGGHHHHHHHHHK......",
    "......KHHGGHHHHHHHHHHK......",
    ".....RHHHHHHHHHHHHHHHHK.....",
    ".....RHHHKKKKKKKKKKHHHK.....",
    ".....RHHKSSSSSSSSSSKHHK.....",
    ".....RHKSSSSSSSSSSSSKHK.....",
    ".....KKSSSSSSSSSSSSSSKK.....",
    ".....KSSLEESSSSLEESSSK......",
    ".....KSSEEESSSSEEESSSK......",
    ".....KSSSSSSSSSSSSSSSK......",
    "......KSSSSSDDSSSSSSK.......",
    "......KSSSSSSSSSSSSK........",
    ".......KKSSSSSSSSKK.........",
    ".........KSSSSSK............",
    ".........KWWWWWK............",
    "......KKKKWWWWWKKKK.........",
    "....KKJJJJWWWWWJJJJKK.......",
    "...RJJJJJJWWWWWJJJJJJK......",
    "...RJJJJJJWWWWWJJJJJJK......",
    "...RJBJJJJWWWWWJJJJBJK......",
    "...RJBJJJJWWWWWJJJJBJK......",
    "...RJBJJJJJWWWJJJJJBJK......",
    "...RJBJJJJJJJJJJJJJBJK......",
    "...KJBJJJJJJJJJJJJJBJK......",
    "...KKJJJJJJJJJJJJJJJKK......",
    "....KSSKJJJJJJJJJKSSK.......",
    "....KSSKKPPPPPPPKKSSK.......",
    ".....KKKKPPPPPPPKKKK........",
    ".........KPPPKPPPK..........",
    ".........KPPPKPPPK..........",
    ".........KPPPKPPPK..........",
    ".........KPPPKPPPK..........",
    ".........KPPPKPPPK..........",
    ".........KKKKKKKKK..........",
    "........KKKKK.KKKKK.........",
    "......oooooooooooooooo......",
]

SP_COLOR = {
    "K": "#010409",
    "H": "#2b2b38",
    "G": "#4a4a5e",
    "S": "#f2c9a0",
    "D": "#d9a279",
    "E": "#0d1117",
    "L": "#e6edf3",
    "W": "#e6edf3",
    "J": "#2f6b4f",
    "B": "#1f4a37",
    "P": "#30363d",
    "R": "#58a6ff",
    "o": "#010409",
}
SP_OPACITY = {"R": 0.55, "o": 0.35}

HAIR = set("HG")
EYES = set("EL")


def _runs(rows, wanted, scale, ox, oy, recolor=None):
    """
    Collect run-length spans per glyph, then emit one <path> per colour.
    Keeps the sprite to a handful of nodes instead of ~900 rects.
    """
    buckets = {}
    for ry, row in enumerate(rows):
        cx = 0
        while cx < len(row):
            ch = row[cx]
            if ch in wanted:
                run = 1
                while cx + run < len(row) and row[cx + run] == ch:
                    run += 1
                buckets.setdefault(ch, []).append(
                    (ox + cx * scale, oy + ry * scale, run * scale, scale)
                )
                cx += run
            else:
                cx += 1
    out = []
    for ch, spans in buckets.items():
        fill = recolor or SP_COLOR[ch]
        op = SP_OPACITY.get(ch)
        a = f'<path d="{runs_to_path(spans)}" fill="{fill}"'
        if op is not None:
            a += f' opacity="{op}"'
        out.append(a + "/>")
    return "".join(out)


def sprite(ox, oy, scale=3):
    """
    Three independently clocked groups. Body bob is 2.2s, hair sway is 3.0s,
    so the pair only realigns every 33s — that irregularity is what reads as
    hand-drawn rather than looped.
    """
    for r in SPRITE:
        assert len(r) == 28, f"sprite row is {len(r)} cols, expected 28"

    body = _runs(SPRITE, set(SP_COLOR) - HAIR - EYES, scale, 0, 0)
    # skin behind the eyes so the blink has something to reveal
    lids = _runs(SPRITE, EYES, scale, 0, 0, recolor=SP_COLOR["S"])
    eyes = _runs(SPRITE, EYES, scale, 0, 0)
    hair = _runs(SPRITE, HAIR, scale, 0, 0)

    return (
        f'<g transform="translate({ox},{oy})">'
        f'<g class="bob">{body}{lids}'
        f'<g class="blink">{eyes}</g>'
        f'<g class="sway">{hair}</g>'
        f"</g></g>"
    )


SPRITE_CSS = """
.bob{animation:bob 2.2s steps(1,end) infinite}
@keyframes bob{0%,100%{transform:translateY(0)}25%{transform:translateY(-1px)}
50%{transform:translateY(-2px)}75%{transform:translateY(-1px)}}
.sway{animation:sway 3s ease-in-out infinite}
@keyframes sway{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1px)}}
.blink{animation:blink 4.3s steps(1,end) infinite}
@keyframes blink{0%,97%{opacity:1}98%,99%{opacity:0}100%{opacity:1}}
"""


# ═════════════════════════════════════════════════════════════════════════════
# 01 — hero
# ═════════════════════════════════════════════════════════════════════════════
def hero(name, tagline, statusline):
    W, H = 900, 260
    b = [f'<rect width="{W}" height="{H}" fill="var(--ground)"/>']

    # layer 1 — star field, each star on its own clock
    stars = []
    for i in range(46):
        x = random.randint(4, W - 6)
        y = random.randint(4, 116)
        d = round(random.uniform(2.8, 6.8), 1)
        delay = round(random.uniform(0, 5), 1)
        stars.append(
            f'<rect x="{x}" y="{y}" width="2" height="2" fill="var(--blue)" '
            f'class="st" style="animation-duration:{d}s;animation-delay:-{delay}s"/>'
        )
    b.append(f'<g>{"".join(stars)}</g>')

    # layers 2 and 3 — two cloud bands, seamless because each is drawn twice
    def band(seed, y, blocks, op, cls):
        rnd = random.Random(seed)
        spans = []
        for pass_ in (0, 1):
            for _ in range(blocks):
                x = rnd.randint(0, W - 40) + pass_ * W
                w = rnd.randint(40, 150)
                h = rnd.choice([3, 4, 6])
                spans.append((x, y + rnd.randint(-6, 6), w, h))
        return (f'<path class="{cls}" d="{runs_to_path(spans)}" '
                f'fill="var(--borderhi)" opacity="{op}"/>')

    b.append(band(11, 52, 9, 0.30, "cloudFar"))
    b.append(band(22, 84, 7, 0.45, "cloudNear"))

    # layer 4 — city silhouette
    rnd = random.Random(7)
    blocks, wins = [], []
    x = -10
    while x < W + 20:
        w = rnd.randint(18, 46)
        h = rnd.randint(18, 62)
        blocks.append((x, 196 - h, w, h))
        for wy in range(196 - h + 5, 192, 9):
            for wx in range(x + 4, x + w - 4, 8):
                if rnd.random() < 0.30:
                    wins.append((wx, wy, 2, 3))
        x += w + rnd.randint(1, 7)
    b.append(f'<path d="{runs_to_path(blocks)}" fill="var(--inset)"/>')
    b.append(f'<path d="{runs_to_path(wins)}" fill="var(--yellow)" '
             f'opacity="0.3"/>')
    b.append(rect(0, 196, W, 64, "var(--inset)"))
    b.append(rect(0, 196, W, 1, "var(--border)"))

    # layer 5 — grass, sways against the clouds
    rnd = random.Random(31)
    gr = []
    for gx in range(0, W, 7):
        gh = rnd.randint(4, 11)
        gr.append((gx, 226 - gh, 2, gh))
    b.append(f'<path class="grass" d="{runs_to_path(gr)}" '
             f'fill="var(--border)" opacity="0.85"/>')

    # sprite
    b.append(sprite(58, 100, 3))

    # wordmark
    b.append(pixel_text(name, 190, 92, scale=5, fill="var(--text)", tracking=1))

    # subtitle bar
    tw = max(text_width(name, 5), 300)
    b.append(panel(190, 138, tw, 26, "var(--panel)", "var(--border)"))
    b.append(mono(tagline, 202, 155, 12, "var(--muted)"))

    # status
    b.append(f'<g class="pulse">{dot(196, 186, 4, "var(--green)")}</g>')
    b.append(pixel_text(statusline, 208, 181, scale=2, fill="var(--muted)"))

    css = (
        SPRITE_CSS
        + """
.st{animation-name:tw;animation-iteration-count:infinite;
animation-timing-function:ease-in-out}
@keyframes tw{0%,100%{opacity:.15}50%{opacity:.65}}
.cloudFar{animation:drift 45s linear infinite}
.cloudNear{animation:drift 28s linear infinite}
@keyframes drift{from{transform:translateX(0)}to{transform:translateX(-900px)}}
.grass{animation:gsway 4.5s ease-in-out infinite;transform-origin:450px 226px}
@keyframes gsway{0%,100%{transform:skewX(-3deg)}50%{transform:skewX(3deg)}}
.pulse{animation:pl 1.4s ease-in-out infinite}
@keyframes pl{0%,100%{opacity:1}50%{opacity:.35}}
"""
    )
    return svg(
        W, H, "".join(b), css,
        title=f"{name} — {tagline}",
        desc=f"{name}. {tagline}. {statusline}",
    )


# ═════════════════════════════════════════════════════════════════════════════
# rules — section dividers, wipe once on load then hold
# ═════════════════════════════════════════════════════════════════════════════
def rule(label):
    W, H = 900, 36
    tw = text_width(label, 3, 2)
    lx = (W - tw) // 2
    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        f'<g class="wipe">',
        rect(0, 17, lx - 16, 2, "var(--border)"),
        rect(lx + tw + 16, 17, W - (lx + tw + 16), 2, "var(--border)"),
        rect(lx - 26, 14, 8, 8, "var(--blue)"),
        "</g>",
        f'<g class="lbl">'
        + pixel_text(label, lx, 11, scale=3, fill="var(--text)", tracking=2)
        + "</g>",
    ]
    css = """
.wipe{animation:wp .55s cubic-bezier(.2,0,.1,1) both}
@keyframes wp{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.lbl{animation:fi .5s ease-out .35s both}
@keyframes fi{from{opacity:0}to{opacity:1}}
"""
    return svg(W, H, "".join(b), css, title=label, desc=f"Section: {label}")


# ═════════════════════════════════════════════════════════════════════════════
# 03 — identity strip
# ═════════════════════════════════════════════════════════════════════════════
def identity(rows):
    W = 900
    H = 34 + len(rows) * 26 + 14
    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
        rect(0, 0, 3, H, "var(--blue)"),
    ]
    y = 30
    for i, (k, v) in enumerate(rows):
        b.append(
            f'<g class="row" style="animation-delay:{i * 60}ms">'
            + pixel_text(k, 26, y - 8, scale=2, fill="var(--faint)")
            + mono(v, 150, y, 12, "var(--text)")
            + "</g>"
        )
        if i < len(rows) - 1:
            b.append(rect(26, y + 9, W - 52, 1, "var(--border)", 0.6))
        y += 26
    css = """
.row{animation:ri .45s cubic-bezier(.2,0,.1,1) both}
@keyframes ri{from{opacity:0;transform:translateY(5px)}
to{opacity:1;transform:translateY(0)}}
"""
    alt = "; ".join(f"{k}: {v}" for k, v in rows)
    return svg(W, H, "".join(b), css, title="Identity", desc=alt)


# ═════════════════════════════════════════════════════════════════════════════
# 04 — method evidence. No scores, no bars: method -> the repo that proves it.
# ═════════════════════════════════════════════════════════════════════════════
def methods(items):
    W = 900
    ROW = 46
    H = 46 + len(items) * ROW + 10
    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
        pixel_text("METHOD", 26, 20, 2, "var(--faint)"),
        pixel_text("DEMONSTRATED IN", 470, 20, 2, "var(--faint)"),
        rect(26, 34, W - 52, 1, "var(--border)"),
    ]
    y = 62
    for i, (method, sub, repo, detail, color) in enumerate(items):
        b.append(
            f'<g class="row" style="animation-delay:{i * 60}ms">'
            + pixel_text(method, 26, y - 9, 2, "var(--text)")
            + mono(sub, 26, y + 14, 10, "var(--faint)")
            + rect(452, y - 10, 1, 26, "var(--border)")
            + dot(474, y - 3, 4, color)
            + mono(repo, 486, y + 1, 12, "var(--blue)", weight="600")
            + mono(detail, 486, y + 16, 10, "var(--muted)")
            + "</g>"
        )
        if i < len(items) - 1:
            b.append(rect(26, y + ROW - 24, W - 52, 1, "var(--border)", 0.55))
        y += ROW
    css = """
.row{animation:ri .5s cubic-bezier(.2,0,.1,1) both}
@keyframes ri{from{opacity:0;transform:translateY(6px)}
to{opacity:1;transform:translateY(0)}}
"""
    alt = "; ".join(f"{m} demonstrated in {r}" for m, _, r, _, _ in items)
    return svg(W, H, "".join(b), css,
               title="Methods and the repositories that demonstrate them",
               desc=alt)


# ═════════════════════════════════════════════════════════════════════════════
# 06-09 — repo cards. Each carries a small animation that explains the repo.
# ═════════════════════════════════════════════════════════════════════════════
def _art_crossroads():
    """Four vehicles at an unsignaled crossing; one yields, comms pulse."""
    g = ['<g>']
    g.append(rect(0, 0, 390, 150, "var(--inset)"))
    for gx in range(0, 391, 15):
        g.append(rect(gx, 0, 1, 150, "var(--border)", 0.25))
    for gy in range(0, 151, 15):
        g.append(rect(0, gy, 390, 1, "var(--border)", 0.25))
    g.append(rect(0, 66, 390, 18, "var(--border)", 0.5))
    g.append(rect(186, 0, 18, 150, "var(--border)", 0.5))
    for dx in range(6, 390, 26):
        if not 180 < dx < 210:
            g.append(rect(dx, 74, 12, 2, "var(--faint)", 0.7))
    for dy in range(6, 150, 26):
        if not 60 < dy < 90:
            g.append(rect(194, dy, 2, 12, "var(--faint)", 0.7))
    car = "#3572A5"
    g.append(f'<g class="c1">{rect(0, 69, 14, 10, car)}{rect(3, 71, 8, 2, "#9fd0f5")}</g>')
    g.append(f'<g class="c2">{rect(0, 71, 14, 10, "#4a8fd0")}{rect(3, 73, 8, 2, "#9fd0f5")}</g>')
    g.append(f'<g class="c3">{rect(188, 0, 10, 14, "#3fb950")}{rect(190, 3, 2, 8, "#a9f0bd")}</g>')
    g.append(f'<g class="c4">{rect(192, 0, 10, 14, "#d29922")}{rect(194, 3, 2, 8, "#f2d98a")}</g>')
    g.append(
        '<g class="ping"><circle cx="195" cy="75" r="10" fill="none" '
        'stroke="var(--blue)" stroke-width="2"/></g>'
    )
    g.append(
        '<g class="ping2"><circle cx="195" cy="75" r="10" fill="none" '
        'stroke="var(--blue)" stroke-width="2"/></g>'
    )
    g.append("</g>")
    css = """
.c1{animation:rt 4s steps(20,end) infinite}
.c2{animation:rt 4s steps(20,end) infinite reverse}
@keyframes rt{from{transform:translateX(-20px)}to{transform:translateX(400px)}}
.c3{animation:dn 4s steps(20,end) infinite;animation-delay:-1.1s}
.c4{animation:dn 4s steps(20,end) infinite reverse;animation-delay:-2.3s}
@keyframes dn{from{transform:translateY(-20px)}to{transform:translateY(160px)}}
.ping,.ping2{animation:pg 2s ease-out infinite}
.ping2{animation-delay:1s}
@keyframes pg{0%{opacity:.9;transform:scale(.2)}100%{opacity:0;transform:scale(2.4)}}
.ping,.ping2{transform-origin:195px 75px}
"""
    return "".join(g), css


def _art_stride():
    """Six-jointed walker, stepped frames, generation counter ticking."""
    g = ['<g>']
    g.append(rect(0, 0, 390, 150, "var(--inset)"))
    for i in range(26):
        op = 0.10 + i * 0.012
        g.append(rect(0, 112 + (i % 3) * 2, 390, 2, "var(--ts)", round(op, 3)))
    g.append(rect(0, 118, 390, 2, "var(--border)"))
    for dx in range(0, 390, 6):
        g.append(rect(dx, 121, 3, 1, "var(--border)", 0.5))

    C = "#3178c6"
    L = "#7db3e8"
    # four keyframe poses, cross-faded with steps() so it reads as sprite frames
    poses = [
        [(0, -34, 0, -14), (-9, 6, 9, 6), (-13, 20, 12, 20)],
        [(0, -34, 0, -14), (-4, 8, 12, 4), (-10, 20, 15, 18)],
        [(0, -33, 0, -13), (2, 9, 9, 7), (-2, 21, 13, 20)],
        [(0, -34, 0, -14), (10, 6, -4, 8), (14, 20, -10, 20)],
    ]
    for i, p in enumerate(poses):
        hx, hy, px_, py = p[0]
        (k1x, k1y, k2x, k2y) = p[1]
        (f1x, f1y, f2x, f2y) = p[2]
        lines = (
            f'<circle cx="{195 + hx}" cy="{78 + hy}" r="7" fill="{C}"/>'
            f'<rect x="{193 + px_}" y="{78 + hy + 6}" width="5" height="22" fill="{C}"/>'
            f'<path d="M{195 + px_} {78 + py + 14} L{195 + k1x} {78 + k1y} '
            f'L{195 + f1x} {78 + f1y}" stroke="{C}" stroke-width="4" fill="none"/>'
            f'<path d="M{195 + px_} {78 + py + 14} L{195 + k2x} {78 + k2y} '
            f'L{195 + f2x} {78 + f2y}" stroke="{L}" stroke-width="4" fill="none"/>'
            f'<circle cx="{195 + k1x}" cy="{78 + k1y}" r="2.5" fill="{L}"/>'
            f'<circle cx="{195 + k2x}" cy="{78 + k2y}" r="2.5" fill="{C}"/>'
        )
        g.append(f'<g class="p{i}">{lines}</g>')

    g.append(rect(300, 12, 78, 20, "var(--ground)", 0.85))
    g.append(pixel_text("GEN", 306, 18, 2, "var(--faint)"))
    for i, n in enumerate(["18", "37", "56", "75"]):
        g.append(f'<g class="p{i}">' + pixel_text(n, 344, 18, 2, "var(--ts)") + "</g>")
    g.append("</g>")
    # p0 is the resting still: with motion disabled exactly one pose shows
    css = """
.p0,.p1,.p2,.p3{animation:fr 1.6s steps(1,end) infinite}
.p1,.p2,.p3{opacity:0}
.p1{animation-delay:.4s}.p2{animation-delay:.8s}.p3{animation-delay:1.2s}
@keyframes fr{0%{opacity:1}25%{opacity:1}25.01%,100%{opacity:0}}
"""
    return "".join(g), css


def _art_afwah():
    """Rumor seeded on one platform cascades to the others; a checker kills it."""
    rnd = random.Random(5)
    g = ['<g>', rect(0, 0, 390, 150, "var(--inset)")]
    clusters = [(78, 44), (280, 40), (72, 108), (286, 106)]
    nodes = []
    for ci, (cx, cy) in enumerate(clusters):
        g.append(rect(cx - 52, cy - 30, 104, 60, "var(--border)", 0.13))
        g.append(pixel_text(f"P{ci + 1}", cx - 50, cy - 28, 2, "var(--faint)"))
        pts = []
        for _ in range(9):
            pts.append((cx + rnd.randint(-42, 42), cy + rnd.randint(-20, 22)))
        for a in range(len(pts)):
            for bn in range(a + 1, len(pts)):
                if rnd.random() < 0.30:
                    g.append(
                        f'<line x1="{pts[a][0]}" y1="{pts[a][1]}" x2="{pts[bn][0]}" '
                        f'y2="{pts[bn][1]}" stroke="var(--border)" stroke-width="1" '
                        f'opacity="0.55"/>'
                    )
        nodes.append(pts)
    # inter-platform hops
    for a, bn in ((0, 1), (0, 2), (1, 3), (2, 3)):
        g.append(
            f'<line x1="{clusters[a][0]}" y1="{clusters[a][1]}" '
            f'x2="{clusters[bn][0]}" y2="{clusters[bn][1]}" '
            f'stroke="var(--jupyter)" stroke-width="1" opacity="0.30" '
            f'stroke-dasharray="3 4"/>'
        )
    # base nodes, then the infected overlay per cluster with staggered onset
    for ci, pts in enumerate(nodes):
        for x, y in pts:
            g.append(rect(x - 2, y - 2, 4, 4, "var(--faint)"))
    for ci, pts in enumerate(nodes):
        inner = "".join(rect(x - 2, y - 2, 4, 4, "#DA5B0B") for x, y in pts)
        g.append(f'<g class="inf i{ci}">{inner}</g>')
    # fact-checker
    g.append(
        '<g class="chk">'
        + rect(186, 70, 10, 10, "#3fb950")
        + '<circle cx="191" cy="75" r="16" fill="none" stroke="#3fb950" '
          'stroke-width="2" opacity="0.8"/>'
        + "</g>"
    )
    g.append("</g>")
    css = """
.inf{animation:casc 6s steps(1,end) infinite;opacity:0}
.i0{animation-delay:0s}.i1{animation-delay:.9s}
.i2{animation-delay:1.5s}.i3{animation-delay:2.2s}
@keyframes casc{0%{opacity:0}4%,66%{opacity:1}70%,100%{opacity:0}}
.chk{animation:ck 6s steps(1,end) infinite;opacity:0;transform-origin:191px 75px}
@keyframes ck{0%,62%{opacity:0}66%{opacity:1}74%{opacity:1}78%,100%{opacity:0}}
"""
    return "".join(g), css


def _art_arivu():
    """A citation graph growing backwards; one ancestry path lights up."""
    g = ['<g>', rect(0, 0, 390, 150, "var(--inset)")]
    cols = [(330, [75]), (258, [44, 75, 108]),
            (186, [30, 60, 90, 120]), (114, [40, 72, 104]),
            (42, [56, 92])]
    for cx, ys in cols:
        for y in ys:
            g.append(rect(cx - 3, y - 3, 6, 6, "var(--faint)"))
    edges = []
    rnd = random.Random(9)
    for i in range(len(cols) - 1):
        cx, ys = cols[i]
        nx, nys = cols[i + 1]
        for y in ys:
            for ny in nys:
                if rnd.random() < 0.55:
                    edges.append((cx, y, nx, ny))
    for x1, y1, x2, y2 in edges:
        g.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="var(--border)" stroke-width="1" opacity="0.6"/>'
        )
    path = [(330, 75), (258, 75), (186, 60), (114, 72), (42, 56)]
    for i in range(len(path) - 1):
        x1, y1 = path[i]
        x2, y2 = path[i + 1]
        g.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#3572A5" '
            f'stroke-width="2" class="ln l{i}"/>'
        )
    for i, (x, y) in enumerate(path):
        g.append(
            f'<g class="nd n{i}">{rect(x - 4, y - 4, 8, 8, "#3572A5")}</g>'
        )
    g.append(pixel_text("NOW", 322, 128, 2, "var(--faint)"))
    g.append(pixel_text("ORIGIN", 26, 128, 2, "var(--faint)"))
    g.append(rect(26, 138, 338, 1, "var(--border)"))
    g.append("</g>")
    # base opacity 1 so the resting still shows the full ancestry path
    css = """
.ln,.nd{animation:up 5s ease-out infinite}
.n0{animation-delay:0s}.l0{animation-delay:.35s}.n1{animation-delay:.7s}
.l1{animation-delay:1.05s}.n2{animation-delay:1.4s}.l2{animation-delay:1.75s}
.n3{animation-delay:2.1s}.l3{animation-delay:2.45s}.n4{animation-delay:2.8s}
@keyframes up{0%{opacity:0}6%,72%{opacity:1}86%,100%{opacity:0}}
"""
    return "".join(g), css


def _art_gone():
    """A gridworld with the one thing the agent is paid for and the one thing
    it is not.

    G-ONE asks whether self-preservation emerges from selection alone: agents
    are rewarded only for reaching forage and never for staying alive.  So the
    picture shows a forage tile it IS paid for, a hazard it is NOT paid to
    avoid, and an agent routing around the hazard anyway.
    """
    C, X0, Y0 = 18, 150, 12
    g = ['<g>', rect(0, 0, 390, 150, "var(--inset)")]
    for r in range(7):
        for c in range(11):
            g.append(f'<rect x="{X0 + c * C}" y="{Y0 + r * C}" width="{C - 1}" '
                     f'height="{C - 1}" fill="none" stroke="var(--border)" '
                     f'stroke-width="1" opacity=".55"/>')

    def tile(c, r, fill, cls=""):
        k = f' class="{cls}"' if cls else ""
        return (f'<rect{k} x="{X0 + c * C + 2}" y="{Y0 + r * C + 2}" '
                f'width="{C - 5}" height="{C - 5}" fill="{fill}"/>')

    for c, r in ((3, 1), (5, 3), (7, 2), (4, 5)):
        g.append(tile(c, r, "var(--border)"))          # walls
    g.append(tile(9, 5, "var(--green)"))               # the rewarded goal
    g.append(tile(6, 0, "#B4553F", "swch"))            # the off-switch
    g.append(tile(1, 3, "var(--blue)", "agt"))         # the agent
    g.append(pixel_text("HAZARD", X0 + 5 * C - 4, Y0 - 9, 1, "#B4553F"))
    g.append(pixel_text("FORAGE", X0 + 8 * C - 4, Y0 + 7 * C + 3, 1, "var(--green)"))
    g.append(pixel_text("SELF-", 16, 46, 2, "var(--muted)"))
    g.append(pixel_text("PRESERVE", 16, 62, 2, "var(--muted)"))
    g.append(pixel_text("NEVER", 16, 88, 1, "var(--faint)"))
    g.append(pixel_text("REWARDED", 16, 100, 1, "var(--faint)"))
    g.append("</g>")
    # The agent tracks along the bottom rather than straight across: the whole
    # finding is that it routes AROUND the off-switch without being asked to.
    css = """
.agt{animation:ag 6s ease-in-out infinite}
@keyframes ag{0%,6%{transform:translate(0,0)}
 22%{transform:translate(36px,36px)}46%{transform:translate(108px,36px)}
 70%,78%{transform:translate(144px,36px)}100%{transform:translate(0,0)}}
.swch{animation:sw 6s ease-in-out infinite}
@keyframes sw{0%,100%{opacity:.45}50%{opacity:1}}
"""
    return "".join(g), css


def _art_apin():
    """A leaf, the heat of where the model looked, and how sure it was.

    Three things the repo is actually about, and nothing else: the input is a
    leaf photo, the explanation is a Grad-CAM map, and the point of the ensemble
    is a calibrated confidence that admits uncertainty.  The bar sits
    deliberately short of full - "says when unsure" is the claim.
    """
    g = ['<g>', rect(0, 0, 390, 150, "var(--inset)")]
    rows = [(60, 6), (52, 22), (46, 34), (42, 42), (40, 48), (40, 52), (42, 50),
            (46, 44), (52, 34), (60, 20), (70, 8)]
    for k, (x0, w) in enumerate(rows):
        y = 22 + k * 9
        g.append(rect(x0, y, w, 8, "#3f7a4a"))
        g.append(rect(x0, y, 3, 8, "#2e5c37"))
    g.append(rect(88, 22, 2, 99, "#2e5c37"))
    for (x, y, wd) in ((100, 58, 10), (104, 66, 14), (110, 74, 12), (106, 82, 8)):
        g.append(rect(x, y, wd, 7, "#8a6a2a"))
    g.append('<g class="cam">' + rect(94, 52, 30, 42, "#e34c26") + '</g>')
    g.append('<g class="cam2">' + rect(100, 60, 18, 26, "#f1e05a") + '</g>')
    g.append(pixel_text("GRAD-CAM", 46, 130, 1, "var(--faint)"))
    g.append(pixel_text("OKRA", 176, 18, 2, "var(--text)"))
    g.append(pixel_text("YELLOW VEIN MOSAIC", 176, 36, 1, "var(--muted)"))
    g.append(pixel_text("CONFIDENCE", 176, 58, 1, "var(--faint)"))
    g.append(rect(176, 70, 190, 10, "var(--border)"))
    g.append('<rect class="cf" x="176" y="70" width="190" height="10" fill="var(--green)"/>')
    g.append(pixel_text("0.83  CALIBRATED", 176, 86, 1, "var(--text)"))
    g.append(pixel_text("SEVERITY  MODERATE", 176, 106, 1, "var(--muted)"))
    g.append(pixel_text("3 CROPS  ROUTED FIRST", 176, 120, 1, "var(--faint)"))
    g.append("</g>")
    css = """
.cam{opacity:.32;animation:cm 4s ease-in-out infinite}
.cam2{opacity:.42;animation:cm 4s ease-in-out infinite;animation-delay:.4s}
@keyframes cm{0%,100%{opacity:.28}50%{opacity:.55}}
.cf{transform-origin:176px 0;animation:cf 5s ease-in-out infinite}
@keyframes cf{0%,100%{transform:scaleX(.83)}50%{transform:scaleX(.78)}}
"""
    return "".join(g), css


ART = {
    "crossroads-rl": _art_crossroads,
    "stride": _art_stride,
    "Afwah": _art_afwah,
    "Arivu": _art_arivu,
    "G-ONE": _art_gone,
    "APIN": _art_apin,
}

STATE_LABEL = {"active": ("ACTIVE", "yellow"), "live": ("LIVE", "green"),
               "private": ("PRIVATE", "faint")}



def card(repo):
    W, H = 430, 372
    art, artcss = ART[repo["name"]]()
    lang_color = DARK[repo["langkey"]]
    slabel, scolor = STATE_LABEL[repo["state"]]

    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
        # header
        dot(20, 20, 4, f"var(--{repo['langkey']})"),
        mono(repo["lang"], 32, 24, 11, "var(--muted)"),
        f'<g class="pulse">{dot(W - 30 - text_width(slabel, 2) - 10, 20, 3, f"var(--{scolor})")}</g>',
        pixel_text(slabel, W - 20 - text_width(slabel, 2), 15, 2,
                   f"var(--{scolor})"),
        rect(0, 38, W, 1, "var(--border)"),
        # art window
        f'<g transform="translate(20,52)">{art}</g>',
        rect(20, 52, 390, 150, "none"),
        f'<rect x="20" y="52" width="390" height="150" fill="none" '
        f'stroke="var(--border)" stroke-width="1"/>',
        # name
        pixel_text(repo["name"], 20, 218, 3, "var(--text)", tracking=2),
        rect(20, 246, W - 40, 1, "var(--border)"),
    ]
    y = 264
    for line in repo["desc"]:
        b.append(mono(line, 20, y, 11, "var(--muted)"))
        y += 15
    y += 6
    for f in repo["facts"]:
        b.append(rect(20, y - 7, 6, 6, lang_color))
        b.append(mono(f, 32, y, 10, "var(--text)"))
        y += 16
    b.append(rect(20, H - 34, W - 40, 1, "var(--border)"))
    b.append(mono("\u25b8 " + repo["path"], 20, H - 14, 11, "var(--blue)",
                  weight="600"))

    css = artcss + """
.pulse{animation:pl 1.6s ease-in-out infinite}
@keyframes pl{0%,100%{opacity:1}50%{opacity:.3}}
"""
    return svg(W, H, "".join(b), css, title=repo["name"],
               desc=f"{repo['name']} — {' '.join(repo['desc'])}")


# ═════════════════════════════════════════════════════════════════════════════
# 11 — repository index. Every public repo, grouped by domain, no ranking.
# ═════════════════════════════════════════════════════════════════════════════
STATE_GLYPH = {
    "live": ("\u25b2", "green"),
    "active": ("\u25b7", "yellow"),
    "done": ("\u25a0", "muted"),
    "fork": ("\u25cb", "faint"),
}


def index(groups):
    W = 900
    rows = sum(len(v) for _, v in groups)
    H = 24 + len(groups) * 30 + rows * 22 + 40
    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
    ]
    y = 40
    i = 0
    for gname, entries in groups:
        b.append(rect(24, y - 12, 6, 6, "var(--blue)"))
        b.append(pixel_text(gname, 38, y - 14, 2, "var(--text)", tracking=2))
        b.append(rect(24, y - 2, W - 48, 1, "var(--border)"))
        y += 18
        for e in entries:
            glyph, gcol = STATE_GLYPH[e["state"]]
            b.append(
                f'<g class="row" style="animation-delay:{i * 25}ms">'
                + dot(32, y - 4, 4, f"var(--{e['langkey']})")
                + mono(e["name"], 46, y, 12, "var(--text)", weight="600")
                + mono("\u00b7" * 3, 210, y, 11, "var(--border)")
                + mono(e["blurb"], 240, y, 11, "var(--muted)")
                + mono(e["lang"], 742, y, 10, "var(--faint)")
                + mono(glyph, 862, y, 11, f"var(--{gcol})")
                + "</g>"
            )
            y += 22
            i += 1
        y += 12
    # legend
    b.append(rect(24, H - 30, W - 48, 1, "var(--border)"))
    lx = 30
    for key, label in (("live", "LIVE"), ("active", "ACTIVE"),
                       ("done", "COMPLETE"), ("fork", "FORK")):
        glyph, gcol = STATE_GLYPH[key]
        b.append(mono(glyph, lx, H - 12, 11, f"var(--{gcol})"))
        b.append(pixel_text(label, lx + 14, H - 20, 2, "var(--faint)"))
        lx += text_width(label, 2) + 46
    css = """
.row{animation:ri .4s cubic-bezier(.2,0,.1,1) both}
@keyframes ri{from{opacity:0;transform:translateY(5px)}
to{opacity:1;transform:translateY(0)}}
"""
    alt = "; ".join(
        f"{e['name']}: {e['blurb']}" for _, v in groups for e in v
    )
    return svg(W, H, "".join(b), css, title="Repository index", desc=alt)


# ═════════════════════════════════════════════════════════════════════════════
# DATA — edit here, then re-run. Everything below is verified against
# github.com/Dxv-404 public repositories.
# ═════════════════════════════════════════════════════════════════════════════
NAME = "S.DEVKRISHNA"
TAGLINE = "data science  \u00b7  reinforcement learning  \u00b7  agent simulation"
STATUS = "OPEN TO INTERNSHIP  -  BENGALURU"

IDENTITY = [
    # Only what a visitor could verify.  "Builds multi-agent simulations" and
    # "speaks five languages" were dropped: one is a claim the cards should
    # make for themselves, the other is padding.  A short list of checkable
    # facts reads as confidence; a long list of adjectives reads as a pitch.
    ("WHO", "S. Devkrishna \u00b7 he/him \u00b7 @Dxv-404"),
    ("STUDY", "BSc (Hons) Data Science \u00b7 CHRIST University, Pune Lavasa \u00b7 2027"),
    ("WORK", "Django developer @ BEO Software \u00b7 data science @ NFI SmartFarm"),
    ("WROTE", "Jadoo: a wearable assistive system \u2014 CRC Press book chapter, 2024"),
]

METHODS = [
    # Rule: a row survives only if the repository is PUBLIC and its README
    # states the fact.  Rows went for pointing at a repository that does not
    # exist under this account (cognito) or at a two-commit stub (leetcoder),
    # and stride's line was rewritten from what its README actually says -
    # the old "75 generations, CMA-ES" was not in it.
    ("EMERGENT BEHAVIOUR", "artificial life",
     "G-ONE", "agents evolved only to forage; does self-preservation emerge anyway?",
     DARK["python"]),
    ("MULTI-AGENT RL", "emergent coordination",
     "crossroads-rl", "4+ PPO agents, a 6-action space with a 1-bit signal channel",
     DARK["python"]),
    ("EVOLUTIONARY OPTIMISATION", "genetic algorithms",
     "stride", "17 configurations x 30 seeds; GA against DE and PSO; Three.js dashboard",
     DARK["ts"]),
    ("CITATION RETRIEVAL", "intellectual ancestry",
     "Arivu", "Postgres, OpenAlex and Semantic Scholar; critical-path analysis",
     DARK["python"]),
    ("CALIBRATED CLASSIFICATION", "applied CV",
     "APIN", "ensemble leaf-disease diagnosis, Grad-CAM, says when unsure - live",
     DARK["python"]),
]

CARDS = [
    {
        "name": "G-ONE", "lang": "Python", "langkey": "python",
        "state": "active", "path": "Dxv-404/G-ONE",
        "desc": ["Do evolved agents keep themselves alive when",
                 "nothing rewards it? Small recurrent networks",
                 "evolve in a grid world, paid only to forage."],
        "facts": ["no priors, no pretrained weights, no text",
                  "reward for foraging, never for survival",
                  "research in progress"],
    },
    {
        "name": "crossroads-rl", "lang": "Python", "langkey": "python",
        "state": "active", "path": "Dxv-404/crossroads-rl",
        "desc": ["Multi-agent reinforcement learning at",
                 "unsignaled intersections. Agents learn to",
                 "negotiate traffic flow from scratch."],
        "facts": ["6-action space: motion + 1-bit signal",
                  "4+ PPO agents (Stable Baselines3)",
                  "protocols emerge from reward alone"],
    },
    {
        "name": "stride", "lang": "TypeScript", "langkey": "ts",
        "state": "active", "path": "Dxv-404/stride",
        "desc": ["Evolving 2D bipedal walkers with genetic",
                 "algorithms. Six motorised joints learn to",
                 "walk in a pymunk physics simulation."],
        "facts": ["6 joints, 18 sine-wave genes",
                  "17 configurations x 30 seeds",
                  "GA vs DE and PSO; Three.js dashboard"],
    },
    {
        "name": "Arivu", "lang": "Python", "langkey": "python",
        "state": "active", "path": "Dxv-404/Arivu",
        "desc": ["Research intelligence platform. Traces the",
                 "intellectual ancestry of a paper and finds",
                 "the white space around it."],
        "facts": ["Postgres",
                  "OpenAlex and Semantic Scholar",
                  "critical-path citation analysis"],
    },
]

# The one deployment that answered: dxv-404-apin.hf.space returned 200 when
# checked.  ink-education's Render app timed out at 75s and stridewalk.fun
# returned 403 to a browser user-agent, so neither is called "live" here.
APIN = {
    "name": "APIN", "lang": "Python", "langkey": "python",
    "state": "live", "path": "dxv-404-apin.hf.space",
    "desc": ["Leaf-disease diagnosis for tomato, okra and brassica from one",
             "smartphone photo, with a personal field notebook. Several models",
             "read the leaf; where they disagree, it says so instead of guessing."],
    "facts": ["ensemble classifier with calibrated confidence",
              "Grad-CAM heatmap of where the model looked",
              "severity, treatment and prevention advice"],
}

CREDITS_WHO = (
    "S. Devkrishna \u2014 BSc (Hons) Data Science",
    "CHRIST University, Pune Lavasa \u00b7 2027 \u00b7 Bengaluru",
)
CREDITS_STACK = [("Python", "python"), ("PyTorch", "jupyter"),
                 ("Django", "green"), ("React", "ts"),
                 ("TypeScript", "ts"), ("Postgres", "blue"),
                 ("Docker", "blue")]
CREDITS_LINKS = ["@Dxv-404", "dxv-404-apin.hf.space", "basketball"]

INDEX = [
    # Public repositories only, grouped, stubs under three commits left out.
    # The former PRIVATE group listed four names that do not exist under this
    # account; two of them are public here under their real names.
    ("AGENTS & EMERGENT BEHAVIOUR", [
        dict(name="G-ONE", langkey="python", lang="Python", state="active",
             blurb="does self-preservation evolve without being rewarded"),
        dict(name="crossroads-rl", langkey="python", lang="Python", state="active",
             blurb="multi-agent RL at unsignaled intersections"),
        dict(name="Afwah", langkey="jupyter", lang="Jupyter", state="active",
             blurb="misinformation cascade, Monte Carlo, 4 platforms"),
        dict(name="stride", langkey="ts", lang="TypeScript", state="active",
             blurb="GA bipedal locomotion + Three.js dashboard"),
    ]),
    ("RESEARCH TOOLING", [
        dict(name="Arivu", langkey="python", lang="Python", state="active",
             blurb="citation-ancestry research platform"),
        dict(name="adr-system", langkey="ts", lang="TypeScript", state="active",
             blurb="versioned research decision records on GitHub"),
    ]),
    ("APPLIED & SHIPPED", [
        dict(name="APIN", langkey="python", lang="Python", state="live",
             blurb="leaf-disease diagnosis from a phone photo"),
        dict(name="ink-education", langkey="html", lang="HTML", state="active",
             blurb="gamified pixel-art study toolkit"),
        dict(name="Sanchari", langkey="js", lang="JavaScript", state="active",
             blurb="vehicle rental, Django REST + React/Vite"),
        dict(name="Yaatra", langkey="php", lang="PHP", state="done",
             blurb="seasonal travel discovery and booking"),
    ]),
    ("EARLIER", [
        dict(name="leetcoder", langkey="python", lang="Python", state="done",
             blurb="Selenium + Claude API daily solver"),
        dict(name="cam-to-ascii", langkey="html", lang="HTML", state="done",
             blurb="camera feed to ASCII"),
    ]),
]


def feature(repo):
    """A full-width panel for a project that is a PROCESS, not a codebase.

    oracle has no interface to screenshot and no metric to plot - what it is,
    is a route a document takes.  A route needs horizontal room to read, so it
    gets the full width with the art running left-to-right beside the text,
    rather than a half-width card with the diagram crushed into 390px.
    """
    W, H = 900, 240
    art, artcss = ART[repo["name"]]()
    slabel, scolor = STATE_LABEL[repo["state"]]
    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
        dot(20, 20, 4, f"var(--{repo['langkey']})"),
        mono(repo["lang"], 32, 24, 11, "var(--muted)"),
        f'<g class="pulse">{dot(W - 30 - text_width(slabel, 2) - 10, 20, 3, f"var(--{scolor})")}</g>',
        pixel_text(slabel, W - 20 - text_width(slabel, 2), 15, 2,
                   f"var(--{scolor})"),
        rect(0, 38, W, 1, "var(--border)"),
        f'<g transform="translate(20,54)">{art}</g>',
        f'<rect x="20" y="54" width="390" height="150" fill="none" '
        f'stroke="var(--border)" stroke-width="1"/>',
        pixel_text(repo["name"], 440, 62, 3, "var(--text)", tracking=2),
        rect(440, 90, W - 464, 1, "var(--border)"),
    ]
    y = 110
    for line in repo["desc"]:
        b.append(mono(line, 440, y, 11, "var(--muted)"))
        y += 15
    y += 8
    for f in repo["facts"]:
        b.append(rect(440, y - 7, 6, 6, DARK[repo["langkey"]]))
        b.append(mono(f, 452, y, 10, "var(--text)"))
        y += 16
    b.append(mono("▸ " + repo["path"], 440, H - 16, 11, "var(--blue)",
                  weight="600"))
    css = artcss + """
.pulse{animation:pl 1.6s ease-in-out infinite}
@keyframes pl{0%,100%{opacity:1}50%{opacity:.3}}
"""
    return svg(W, H, "".join(b), css, title=repo["name"],
               desc=f"{repo['name']} — {' '.join(repo['desc'])}")


def credits(who, stack, links):
    """The closing strip: who, what with, where.

    Deliberately the quietest panel in the README - no art, no animation
    beyond a single cursor.  It is the last thing on the page, and something
    blinking for attention at the end undoes the settling the header spent
    sixty seconds establishing.
    """
    W, H = 900, 168

    def mw(t, size):
        """Width of monospace text. text_width() measures the 5x7 DISPLAY
        face and takes a scale, not a font size - passing a size to it here
        reported roughly six times the real width and pushed the stack row
        clean off the panel."""
        return len(t) * size * 0.6

    b = [
        f'<rect width="{W}" height="{H}" fill="var(--ground)"/>',
        panel(0, 0, W, H, "var(--panel)", "var(--border)"),
        pixel_text("CREDITS", 24, 20, 2, "var(--muted)", tracking=2),
        rect(24, 40, W - 48, 1, "var(--border)"),
        mono(who[0], 24, 66, 12, "var(--text)", weight="600"),
        mono(who[1], 24, 86, 11, "var(--muted)"),
        pixel_text("STACK", 24, 108, 1, "var(--faint)"),
    ]
    x = 72
    for name, key in stack:
        b.append(rect(x, 106, 6, 6, f"var(--{key})"))
        b.append(mono(name, x + 12, 113, 10, "var(--muted)"))
        x += 24 + mw(name, 10)
    b.append(rect(24, 128, W - 48, 1, "var(--border)"))
    x = 24
    for label in links:
        b.append(mono("▸ " + label, x, 152, 11, "var(--blue)",
                      weight="600"))
        x += 26 + mw("▸ " + label, 11)
    b.append(f'<rect class="cur" x="{W - 40}" y="142" width="8" height="12" '
             f'fill="var(--green)"/>')
    css = (".cur{animation:cu 1.2s steps(1,end) infinite}"
           "@keyframes cu{0%,55%{opacity:1}56%,100%{opacity:0}}")
    return svg(W, H, "".join(b), css, title="Credits",
               desc=f"{who[0]}. {who[1]}. "
                    f"Stack: {', '.join(n for n, _ in stack)}. "
                    f"Links: {', '.join(links)}.")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "assets"
    os.makedirs(out, exist_ok=True)
    files = {
        # 01 is the animated hero, built by tools/header/hero.py.
        "02_rule_who.svg": rule("WHO"),
        "03_identity.svg": identity(IDENTITY),
        "04_methods.svg": methods(METHODS),
        "05_rule_work.svg": rule("WORK"),
        # 06-10, the project cards, are built by tools/cards/card.py from the
        # painted frame kit and each repo's painting; this script no longer
        # writes them, so a rebuild here cannot overwrite them.
        "14_rule_index.svg": rule("INDEX"),
        "15_index.svg": index(INDEX),
        "16_credits.svg": credits(CREDITS_WHO, CREDITS_STACK, CREDITS_LINKS),
    }
    for fn, data in files.items():
        p = os.path.join(out, fn)
        with open(p, "w", encoding="utf-8") as f:
            f.write(data)
        print(f"{fn:22} {len(data.encode('utf-8')) / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
