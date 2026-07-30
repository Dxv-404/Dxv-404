"""
px.py — shared primitives for the Dxv-404 profile README assets.

Everything here exists to produce SVGs that survive GitHub's image pipeline:
  * no external fonts  -> all display type is drawn as <rect> runs
  * no JS              -> motion is CSS animation only
  * no <use> across files -> every file is standalone
"""

# ─────────────────────────────────────────────────────────────────────────────
# 5x7 display font. Drawn as pixel runs, so it needs no font on the client.
# ─────────────────────────────────────────────────────────────────────────────
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10011", "01111"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10011", "10101", "10101", "10101", "11001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ",": ["00000", "00000", "00000", "00000", "01100", "01100", "00100"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
    "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
    "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
    ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
    "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
    "#": ["01010", "11111", "01010", "01010", "01010", "11111", "01010"],
    "*": ["00000", "01010", "00100", "11111", "00100", "01010", "00000"],
}

GLYPH_W, GLYPH_H = 5, 7


def text_width(s, scale=2, tracking=1):
    """Pixel width of a string rendered by pixel_text."""
    if not s:
        return 0
    return (len(s) * (GLYPH_W + tracking) - tracking) * scale


def _px(v):
    return str(int(v)) if float(v) == int(v) else f"{v:.2f}".rstrip("0").rstrip(".")


def runs_to_path(runs):
    """
    Collapse a list of (x, y, w, h) rectangles into one path `d` string.
    One <path> instead of hundreds of <rect>s cuts file size roughly 4x,
    which matters because GitHub gets slow past ~400 KB of README imagery.
    """
    parts = []
    for x, y, w, h in runs:
        parts.append(
            f"M{_px(x)} {_px(y)}h{_px(w)}v{_px(h)}h-{_px(w)}z"
        )
    return "".join(parts)


def pixel_text(s, x, y, scale=2, fill="currentColor", tracking=1, opacity=None):
    """
    Render `s` in the 5x7 display face as a single merged <path>.
    Origin (x, y) is the top-left. Unknown glyphs fall back to space.
    """
    s = s.upper()
    runs = []
    pen = x
    for ch in s:
        rows = FONT.get(ch, FONT[" "])
        for ry, row in enumerate(rows):
            cx = 0
            while cx < GLYPH_W:
                if row[cx] == "1":
                    run = 1
                    while cx + run < GLYPH_W and row[cx + run] == "1":
                        run += 1
                    runs.append(
                        (pen + cx * scale, y + ry * scale, run * scale, scale)
                    )
                    cx += run
                else:
                    cx += 1
        pen += (GLYPH_W + tracking) * scale
    if not runs:
        return ""
    op = f' opacity="{opacity}"' if opacity is not None else ""
    return f'<path d="{runs_to_path(runs)}" fill="{fill}"{op}/>'


def rect(x, y, w, h, fill="currentColor", opacity=None, cls=None):
    """Compact <rect>. Numbers are trimmed to keep file size down."""
    def n(v):
        return str(int(v)) if float(v) == int(v) else f"{v:.2f}".rstrip("0").rstrip(".")

    a = f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" fill="{fill}"'
    if opacity is not None:
        a += f' opacity="{opacity}"'
    if cls:
        a += f' class="{cls}"'
    return a + "/>"


def mono(s, x, y, size=11, fill="var(--muted)", anchor="start", weight="400",
         opacity=None, spacing=None):
    """
    Body copy. Uses a generic monospace stack so it renders everywhere
    without shipping a font file.
    """
    esc = (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    a = (
        f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" '
        f'text-anchor="{anchor}" font-weight="{weight}" '
        f'font-family="ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,'
        f'Liberation Mono,monospace"'
    )
    if opacity is not None:
        a += f' opacity="{opacity}"'
    if spacing is not None:
        a += f' letter-spacing="{spacing}"'
    return a + f">{esc}</text>"


# ─────────────────────────────────────────────────────────────────────────────
# Palette. Dark is authored; light is applied by a media query inside the SVG
# so each asset is a single self-contained file.
# ─────────────────────────────────────────────────────────────────────────────
DARK = {
    "ground": "#0d1117",
    "panel": "#161b22",
    "inset": "#010409",
    "border": "#30363d",
    "borderhi": "#484f58",
    "text": "#e6edf3",
    "muted": "#8b949e",
    "faint": "#6e7681",
    "blue": "#58a6ff",
    "green": "#3fb950",
    "yellow": "#d29922",
    "python": "#3572A5",
    "ts": "#3178c6",
    "js": "#f1e05a",
    "html": "#e34c26",
    "jupyter": "#DA5B0B",
    "php": "#4F5D95",
}

LIGHT = {
    "ground": "#ffffff",
    "panel": "#f6f8fa",
    "inset": "#eaeef2",
    "border": "#d1d9e0",
    "borderhi": "#afb8c1",
    "text": "#1f2328",
    "muted": "#59636e",
    "faint": "#818b98",
    "blue": "#0969da",
    "green": "#1a7f37",
    "yellow": "#9a6700",
    "python": "#2b5c86",
    "ts": "#2a63a0",
    "js": "#9a8500",
    "html": "#c23b18",
    "jupyter": "#b04a09",
    "php": "#414d7c",
}

REDUCED = (
    "@media (prefers-reduced-motion:reduce){"
    "*{animation:none!important;transform:none!important}}"
)


def vars_block(extra_dark="", extra_light=""):
    d = ";".join(f"--{k}:{v}" for k, v in DARK.items())
    l = ";".join(f"--{k}:{v}" for k, v in LIGHT.items())
    return (
        f":root{{{d}{extra_dark}}}"
        f"@media (prefers-color-scheme:light){{:root{{{l}{extra_light}}}}}"
    )


def svg(w, h, body, css="", title="", desc=""):
    """Wrap body in a standalone, self-describing SVG document."""
    meta = ""
    if title:
        meta += f"<title>{title}</title>"
    if desc:
        meta += f"<desc>{desc}</desc>"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" role="img" '
        f'font-family="ui-monospace,monospace">'
        f"{meta}"
        f"<style>{vars_block()}{css}{REDUCED}</style>"
        f"{body}"
        f"</svg>"
    )


def panel(x, y, w, h, fill="var(--panel)", stroke="var(--border)", sw=1):
    """Square-cornered panel. No border-radius anywhere in this system."""
    return (
        f'<rect x="{x + sw / 2}" y="{y + sw / 2}" width="{w - sw}" '
        f'height="{h - sw}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'
    )


def dot(cx, cy, r, fill):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
