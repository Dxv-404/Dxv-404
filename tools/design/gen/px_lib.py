"""Tiny pixel-art toolkit: fixed palette, hue-shifted ramps, ordered dithering, auto outline with selective outlining."""
from PIL import Image, ImageDraw
import random

def h(c): c = c.lstrip('#'); return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
PAL = {k: h(v) for k, v in {
 'ink': '#1a1220', 'ink2': '#2b1d2e', 'night': '#141d38', 'night2': '#22325a', 'night3': '#3a5a8a', 'star': '#cfe0ff',
 'st0': '#2a2433', 'st1': '#3b3346', 'st2': '#4f4558', 'st3': '#6a5f73', 'st4': '#8a7f8f',
 'wd0': '#2a170f', 'wd1': '#3a2216', 'wd2': '#5a3420', 'wd3': '#7a4a2a', 'wd4': '#9c6236', 'wd5': '#c08048',
 'fe0': '#132a1e', 'fe1': '#1f3b2a', 'fe2': '#2a5236', 'fe3': '#356a42', 'fe4': '#46854f',
 'au0': '#4a2f0c', 'au1': '#6b4a12', 'au2': '#a8741a', 'au3': '#e0a83a', 'au4': '#ffe08a',
 'fl0': '#c2502a', 'fl1': '#ff9a3c', 'fl2': '#ffd36b', 'fl3': '#fff4c2',
 'sk0': '#5a3424', 'sk1': '#8c5a3c', 'sk2': '#c08460', 'sk3': '#e8b48a', 'sk4': '#f6d2ae',
 'br0': '#4a1e0c', 'br1': '#6b2d12', 'br2': '#a8481c', 'br3': '#d9702c', 'br4': '#f0a050',
 'gr0': '#1a2a20', 'gr1': '#233a2a', 'gr2': '#2e5a3a', 'gr3': '#3f7a4a', 'gr4': '#5a9a5a',
 'ap0': '#3a2418', 'ap1': '#4a3020', 'ap2': '#6a4630', 'ap3': '#8a6040',
 'wh0': '#a89a8a', 'wh1': '#d8ccb8', 'wh2': '#f6efe0',
 're0': '#5a1020', 're1': '#8a1c2a', 're2': '#c2303a', 're3': '#e85a50', 're4': '#ff9a8a',
 'bl0': '#1a2450', 'bl1': '#2a3a7a', 'bl2': '#3a5aa8', 'bl3': '#6a8ad8',
 'pu1': '#4a2a5a', 'pu2': '#6a3a7a', 'pu3': '#9a5aa8',
}.items()}
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

class Canvas:
    def __init__(s, w, h, bg=None):
        s.im = Image.new('RGBA', (w, h), PAL[bg] if bg else (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im); s.w, s.h = w, h
    def px(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h: s.im.putpixel((int(x), int(y)), PAL[c] if isinstance(c, str) else c)
    def rect(s, x0, y0, x1, y1, c):
        if x1 >= x0 and y1 >= y0: s.d.rectangle([x0, y0, x1, y1], fill=PAL[c])
    def ell(s, x0, y0, x1, y1, c):
        if x1 >= x0 and y1 >= y0: s.d.ellipse([x0, y0, x1, y1], fill=PAL[c])
    def poly(s, pts, c): s.d.polygon(pts, fill=PAL[c])
    def line(s, pts, c, w=1): s.d.line(pts, fill=PAL[c], width=w)
    def dither(s, x0, y0, x1, y1, a, b, f):
        """fill rect mixing colours a/b; f(x,y)->0..1 share of b, ordered dither"""
        for y in range(max(0, y0), min(s.h, y1 + 1)):
            for x in range(max(0, x0), min(s.w, x1 + 1)):
                t = f(x, y)
                if t <= 0: continue
                s.px(x, y, b if t * 16 > BAYER[y % 4][x % 4] else a) if t < 1 else s.px(x, y, b)
    def glow(s, cx, cy, r, ramp):
        """dithered light pool: blends the existing pixel toward ramp colours by distance"""
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if not (0 <= x < s.w and 0 <= y < s.h): continue
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** .5 / r
                if d >= 1: continue
                k = int((1 - d) * len(ramp) * 1.0 + BAYER[y % 4][x % 4] / 16 - .5)
                if k >= 1: s.px(x, y, ramp[min(k, len(ramp)) - 1])
    def outline(s, c='ink', light=None):
        """dark outline around opaque pixels; with light set, top/left outline uses a lighter tone (sel-out)"""
        a = s.im.split()[3].load(); W, H = s.w, s.h; out = []
        for y in range(H):
            for x in range(W):
                if a[x, y]: continue
                n = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < W and 0 <= y + dy < H and a[x + dx, y + dy]]
                if n:
                    top_left = any(nx > x or ny > y for nx, ny in n) and not any(nx < x or ny < y for nx, ny in n)
                    out.append((x, y, light if (light and top_left) else c))
        for x, y, col in out: s.px(x, y, col)
    def save(s, path, scale=1):
        im = s.im if scale == 1 else s.im.resize((s.w * scale, s.h * scale), Image.NEAREST)
        im.save(path)

def shade_ell(c, x0, y0, x1, y1, ramp):
    """ellipse lit from the top-left: shadow body, mid, highlight"""
    c.ell(x0, y0, x1, y1, ramp[0]); c.ell(x0, y0, x1 - 1, y1 - 1, ramp[1])
    w, hh = x1 - x0, y1 - y0
    c.ell(x0 + w * .12, y0 + hh * .1, x1 - w * .3, y1 - hh * .35, ramp[2])
    if len(ramp) > 3: c.ell(x0 + w * .22, y0 + hh * .16, x0 + w * .42, y0 + hh * .34, ramp[3])
