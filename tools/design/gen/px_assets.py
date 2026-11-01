"""Generates every Pixel-theme asset as true pixel art (drawn at 1x, scaled by the browser with image-rendering: pixelated)."""
import os, random
from px_lib import *
OUT = os.path.join(os.path.dirname(__file__), '..', 'tp2', 'project', 'img')
R = random.Random(7)

def tint(c, cx, cy, r, col, amax=.55):
    col = PAL[col]
    for y in range(int(cy - r), int(cy + r) + 1):
        for x in range(int(cx - r), int(cx + r) + 1):
            if not (0 <= x < c.w and 0 <= y < c.h): continue
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** .5 / r
            if d >= 1: continue
            a = (1 - d) * amax
            lv = int(a * 4 + BAYER[y % 4][x % 4] / 16) / 4  # quantised, dithered levels
            if lv <= 0: continue
            o = c.im.getpixel((x, y))
            c.px(x, y, tuple(int(o[i] + (col[i] - o[i]) * lv) for i in range(3)) + (255,))

def vignette(c, amax=.55):
    cx, cy = c.w / 2, c.h * .45
    for y in range(c.h):
        for x in range(c.w):
            d = (((x - cx) / (c.w * .62)) ** 2 + ((y - cy) / (c.h * .7)) ** 2) ** .5
            if d < .55: continue
            lv = int(min(1, (d - .55) * 1.6) * amax * 4 + BAYER[y % 4][x % 4] / 16) / 4
            if lv <= 0: continue
            o = c.im.getpixel((x, y)); k = PAL['ink']
            c.px(x, y, tuple(int(o[i] + (k[i] - o[i]) * lv) for i in range(3)) + (255,))

def wall(c, x0, y0, x1, y1):
    c.rect(x0, y0, x1, y1, 'st0')
    y = y0; row = 0
    while y <= y1:
        x = x0 - (row % 2) * 5
        while x <= x1:
            w = R.choice((9, 10, 11, 12))
            bx0, bx1, by1 = x + 1, x + w - 1, min(y + 4, y1)
            c.rect(bx0, y + 1, bx1, by1, R.choice(('st2', 'st2', 'st1', 'st2', 'st2', 'st3' if R.random() < .3 else 'st2')))
            c.line([(bx0, y + 1), (bx1 - 1, y + 1)], 'st3'); c.line([(bx0, y + 1), (bx0, by1 - 1)], 'st3')
            c.line([(bx0 + 1, by1), (bx1, by1)], 'st1')
            for _ in range(2): c.px(R.randint(bx0 + 1, max(bx0 + 1, bx1 - 1)), R.randint(y + 2, max(y + 2, by1 - 1)), R.choice(('st3', 'st1')))
            if R.random() < .06: c.line([(bx0 + 2, y + 2), (bx0 + 4, by1 - 1)], 'st0')
            x += w
        y += 5; row += 1

def beam(c, x0, x1, y0, h=5):
    c.rect(x0, y0, x1, y0 + h, 'wd2'); c.line([(x0, y0), (x1, y0)], 'wd4'); c.line([(x0, y0 + h), (x1, y0 + h)], 'wd0')
    for x in range(x0, x1, 7): c.line([(x, y0 + 2), (x + 4, y0 + 2)], 'wd1') if R.random() < .6 else None
    for x in range(x0 + 10, x1, 30): c.rect(x, y0 + 2, x + 1, y0 + 3, 'au1')

def window(c, x0, y0, w, hh):
    c.rect(x0 - 2, y0 - 2, x0 + w + 2, y0 + hh + 3, 'wd1'); c.rect(x0 - 1, y0 - 1, x0 + w + 1, y0 + hh + 1, 'wd3')
    c.dither(x0, y0, x0 + w, y0 + hh, 'night', 'night2', lambda x, y: (y - y0) / hh)
    for _ in range(w * hh // 40): c.px(R.randint(x0, x0 + w), R.randint(y0, y0 + hh * 2 // 3), R.choice(('star', 'night3')))
    mx, my = x0 + w * 2 // 3, y0 + hh // 4
    c.ell(mx - 4, my - 4, mx + 4, my + 4, 'au4'); c.ell(mx - 2, my - 5, mx + 5, my + 3, 'night')
    c.rect(x0 + w // 2, y0, x0 + w // 2, y0 + hh, 'wd2'); c.rect(x0, y0 + hh // 2, x0 + w, y0 + hh // 2, 'wd2')
    c.rect(x0 - 3, y0 + hh + 2, x0 + w + 3, y0 + hh + 4, 'wd4'); c.line([(x0 - 3, y0 + hh + 4), (x0 + w + 3, y0 + hh + 4)], 'wd1')

def bottle(c, x, y, col):
    ramp = {'re': ('re1', 're2', 're3'), 'gr': ('gr2', 'gr3', 'gr4'), 'bl': ('bl1', 'bl2', 'bl3'), 'au': ('au1', 'au2', 'au3'), 'pu': ('pu1', 'pu2', 'pu3')}[col]
    c.rect(x, y - 6, x + 3, y, ramp[1]); c.rect(x + 1, y - 9, x + 2, y - 7, ramp[0]); c.px(x + 1, y - 10, 'wd3')
    c.line([(x, y - 6), (x, y)], ramp[2]); c.px(x + 1, y - 5, 'wh2'); c.line([(x + 3, y - 6), (x + 3, y)], ramp[0])

def shelf(c, x0, x1, y, items=True, cat=False):
    c.rect(x0, y, x1, y + 2, 'wd3'); c.line([(x0, y), (x1, y)], 'wd5'); c.line([(x0, y + 2), (x1, y + 2)], 'wd1')
    c.rect(x0 + 2, y + 3, x0 + 3, y + 6, 'wd1'); c.rect(x1 - 3, y + 3, x1 - 2, y + 6, 'wd1')
    if items:
        x = x0 + 2
        for col in ('re', 'gr', 'au', 'bl', 'pu', 're', 'gr'):
            if x + 4 > x1 - (16 if cat else 2): break
            bottle(c, x, y - 1, col); x += R.choice((5, 6, 7))
    if cat:
        cx = x1 - 15
        c.ell(cx, y - 6, cx + 11, y, 'ink2'); c.ell(cx + 1, y - 6, cx + 9, y - 1, 'st1'); c.ell(cx + 8, y - 8, cx + 13, y - 2, 'st1')
        c.px(cx + 9, y - 9, 'st1'); c.px(cx + 12, y - 9, 'st1'); c.px(cx + 10, y - 5, 'ink'); c.px(cx + 12, y - 5, 'ink'); c.px(cx + 2, y - 5, 'st2'); c.px(cx + 4, y - 6, 'st2')

def sconce(c, x, y):
    c.rect(x - 2, y + 4, x + 2, y + 5, 'au1'); c.rect(x - 1, y + 6, x + 1, y + 7, 'au0')
    c.rect(x - 1, y, x + 1, y + 3, 'wh2'); c.px(x + 1, y + 1, 'wh1')
    c.px(x, y - 1, 'fl2'); c.px(x, y - 2, 'fl3'); c.px(x, y - 3, 'fl1')

def barrel(c, x0, y0, w=12, hh=14):
    c.ell(x0, y0, x0 + w, y0 + hh, 'wd1'); c.ell(x0, y0, x0 + w - 1, y0 + hh - 1, 'wd3')
    c.rect(x0 + 2, y0 + 2, x0 + 3, y0 + hh - 2, 'wd4')
    for yy in (y0 + 3, y0 + hh - 3): c.line([(x0 + 1, yy), (x0 + w - 1, yy)], 'st2')
    c.line([(x0 + w - 2, y0 + 3), (x0 + w - 2, y0 + hh - 3)], 'wd2')

def fireplace(c, x0, y0, w, hh):
    c.rect(x0, y0, x0 + w, y0 + hh, 'st3')
    for yy in range(y0 + 1, y0 + hh, 4):
        for xx in range(x0 + (yy // 4) % 2 * 3, x0 + w, 6): c.rect(xx + 1, yy, xx + 4, yy + 2, 'st4'); c.px(xx + 4, yy + 2, 'st2')
    ix0, iy0 = x0 + 5, y0 + 9
    c.rect(ix0, iy0, x0 + w - 5, y0 + hh, 'ink'); c.ell(ix0, iy0 - 4, x0 + w - 5, iy0 + 4, 'ink')
    c.rect(x0 - 2, y0 - 2, x0 + w + 2, y0, 'wd3'); c.line([(x0 - 2, y0 - 2), (x0 + w + 2, y0 - 2)], 'wd5')
    c.rect(ix0 + 2, y0 + hh - 3, x0 + w - 7, y0 + hh - 1, 'wd2'); c.line([(ix0 + 3, y0 + hh - 2), (x0 + w - 8, y0 + hh - 3)], 'wd4')

def fire_sheet():
    c = Canvas(48, 16)
    for f in range(3):
        ox = f * 16
        for k, (col, sh) in enumerate((('fl0', 0), ('fl1', 2), ('fl2', 4), ('fl3', 6))):
            hgt = 14 - sh - (f + k) % 3
            for x in range(3 + sh // 2, 13 - sh // 2):
                top = 16 - int(hgt * (1 - abs(x - 8) / 7.0) ** .7) - R.randint(0, 2)
                c.line([(ox + x, max(top, 2 + sh)), (ox + x, 15)], col)
    c.save(f'{OUT}/px-fire.png')

def tavern_phone():
    c = Canvas(130, 281); wall(c, 0, 0, 129, 280)
    beam(c, 0, 129, 18); beam(c, 0, 129, 222, 4)
    window(c, 84, 28, 30, 22)
    shelf(c, 3, 46, 46, cat=True)
    for x, y in ((10, 62), (120, 62)): sconce(c, x, y)
    for x, y in ((10, 60), (120, 60)): tint(c, x, y, 22, 'fl1', .6)
    tint(c, 99, 39, 18, 'night3', .25)
    for k in range(4): c.rect(4 + k * 3, 24, 4 + k * 3, 30 + k % 2 * 3, 'gr3'); c.px(4 + k * 3, 31 + k % 2 * 3, 'gr4')
    barrel(c, 1, 190, 12, 15); barrel(c, 117, 188, 12, 16)
    c.rect(0, 206, 129, 221, 'wd1')
    for y in range(206, 222, 3): c.line([(0, y), (129, y)], 'wd2')
    vignette(c); c.save(f'{OUT}/px-tavern-phone.png')

def tavern_lap():
    c = Canvas(360, 225); wall(c, 0, 0, 359, 224)
    beam(c, 0, 359, 14); beam(c, 0, 359, 44, 3)
    window(c, 170, 20, 34, 20); window(c, 82, 22, 20, 16)
    shelf(c, 4, 70, 36, cat=True); shelf(c, 222, 272, 36)
    fireplace(c, 2, 98, 36, 52)
    tint(c, 20, 140, 46, 'fl1', .65)
    for x, y in ((58, 60), (250, 60)): sconce(c, x, y); tint(c, x, y, 24, 'fl1', .55)
    barrel(c, 238, 140, 14, 18); barrel(c, 252, 146, 14, 18); barrel(c, 244, 124, 14, 18)
    c.rect(0, 172, 359, 224, 'wd1')
    for y in range(172, 224, 3): c.line([(0, y), (359, y)], 'wd2')
    vignette(c, .45); c.save(f'{OUT}/px-tavern-lap.png')

def table(w, hh, name, rim=5):
    c = Canvas(w, hh)
    ocx, ocy, orx, ory = (w - 1) / 2, (hh - 1) / 2, w / 2, hh / 2
    for y in range(hh):
        for x in range(w):
            d = ((x - ocx) / orx) ** 2 + ((y - ocy) / ory) ** 2
            if d > 1: continue
            lt = ((ocx - x) / orx * .55 + (ocy - y) / ory * .65)  # light from the top-left
            v = int((lt + 1) * 2 + BAYER[y % 4][x % 4] / 16 - .3)
            c.px(x, y, ('wd1', 'wd2', 'wd3', 'wd4', 'wd5')[max(0, min(v, 4))])
            if d > .93: c.px(x, y, 'wd0' if (x - ocx) / orx + (y - ocy) / ory > -.2 else 'wd1')
            if (x * 7 + y * 3) % 23 == 0 and d < .9: c.px(x, y, 'wd1')
    c.ell(rim - 1, rim - 1, w - rim, hh - rim, 'wd0')
    c.ell(rim, rim, w - rim - 1, hh - rim - 1, 'fe1')
    cx, cy, rx, ry = (w - 1) / 2, (hh - 1) / 2, (w - 2 * rim) / 2, (hh - 2 * rim) / 2
    for y in range(hh):
        for x in range(w):
            d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            if d < .93:
                t = 1 - d ** .8
                lv = int(t * 3.2 + BAYER[y % 4][x % 4] / 16)
                c.px(x, y, ('fe1', 'fe2', 'fe3', 'fe4')[min(lv, 3)])
                if R.random() < .015: c.px(x, y, 'fe1')
    for k in range(0, 360, 3):
        import math
        a = math.radians(k)
        x, y = cx + (rx - 4) * math.cos(a), cy + (ry - 4) * math.sin(a)
        if k % 6 == 0: c.px(x, y, 'au2')
    import math
    for k in range(0, 360, 20):
        a = math.radians(k); x, y = cx + (w / 2 - rim / 2 - .5) * math.cos(a), cy + (hh / 2 - rim / 2 - .5) * math.sin(a)
        c.px(x, y, 'au4'); c.px(x + 1, y + 1, 'au1')
    c.save(f'{OUT}/{name}.png')

# ---------- Bram the innkeeper ----------
def bram(pose, frame=0):
    c = Canvas(48, 48)
    # torso
    c.poly([(8, 47), (12, 31), (36, 31), (40, 47)], 'gr1'); c.poly([(9, 47), (13, 32), (34, 32), (37, 47)], 'gr2'); c.poly([(11, 47), (14, 33), (22, 33), (20, 47)], 'gr3')
    c.rect(17, 34, 31, 47, 'ap1'); c.rect(17, 34, 29, 46, 'ap2'); c.line([(17, 34), (17, 47)], 'ap3'); c.line([(16, 34), (12, 31)], 'ap0'); c.line([(32, 34), (36, 31)], 'ap0')
    c.rect(22, 38, 26, 41, 'ap1'); c.px(23, 39, 'au3')
    # head
    c.ell(14, 6, 34, 28, 'sk1'); c.ell(14, 6, 33, 27, 'sk2'); c.ell(16, 7, 28, 20, 'sk3'); c.ell(18, 8, 22, 12, 'sk4')
    c.ell(11, 15, 15, 21, 'sk2'); c.ell(33, 15, 37, 21, 'sk1'); c.px(12, 17, 'sk3')
    c.rect(13, 13, 15, 19, 'br1'); c.rect(33, 13, 35, 19, 'br1')
    # beard
    c.poly([(13, 20), (35, 20), (36, 28), (30, 36), (24, 38), (18, 36), (12, 28)], 'br1')
    c.poly([(14, 21), (34, 21), (34, 28), (29, 34), (24, 36), (19, 34), (14, 28)], 'br2')
    c.poly([(15, 22), (23, 22), (22, 30), (18, 32), (15, 27)], 'br3')
    for x in (17, 21, 26, 30): c.line([(x, 25), (x + 1, 31)], 'br1')
    c.px(16, 23, 'br4'); c.px(18, 22, 'br4')
    # nose + cheeks + moustache
    c.ell(21, 16, 27, 21, 'sk2'); c.px(22, 17, 'sk4'); c.px(26, 20, 'sk1')
    c.px(18, 19, 're3'); c.px(30, 19, 're3')
    c.poly([(16, 22), (24, 21), (32, 22), (30, 24), (24, 23), (18, 24)], 'br3'); c.line([(18, 24), (30, 24)], 'br1')
    eyes = {'shuffle': 'open', 'deal': 'wink', 'turn': 'open', 'big': 'wide', 'ship': 'happy', 'wait': 'closed'}[pose]
    if frame == 1 and eyes == 'open': eyes = 'closed'
    for ex in (19, 28):
        c.line([(ex - 2, 12), (ex + 1, 12 - (1 if pose == 'turn' and ex == 28 else 0))], 'br1')
        if eyes == 'open' or (eyes == 'wink' and ex == 19): c.rect(ex - 1, 14, ex, 15, 'ink'); c.px(ex - 1, 14, 'wh2')
        elif eyes == 'wide': c.rect(ex - 2, 13, ex + 1, 16, 'wh2'); c.rect(ex - 1, 14, ex, 15, 'ink')
        elif eyes == 'happy': c.line([(ex - 2, 15), (ex - 1, 14), (ex, 14), (ex + 1, 15)], 'ink')
        else: c.line([(ex - 2, 15), (ex + 1, 15)], 'ink')
    if pose == 'big': c.ell(21, 25, 27, 31, 'ink'); c.rect(22, 26, 26, 27, 're2'); c.px(37, 9, 'bl3'); c.px(37, 10, 'bl3'); c.px(38, 11, 'bl2')
    if pose == 'ship': c.line([(20, 26), (24, 28), (28, 26)], 'ink')
    def arm(pts, hand):
        c.line(pts, 'gr2', 5); c.line(pts, 'gr3', 2)
        hx, hy = hand; c.ell(hx - 3, hy - 3, hx + 3, hy + 3, 'sk2'); c.ell(hx - 3, hy - 3, hx + 1, hy + 1, 'sk3')
    if pose in ('shuffle', 'wait'):
        arm([(12, 34), (16, 42), (20, 43)], (21, 42)); arm([(36, 34), (32, 42), (28, 43)], (27, 42))
        if pose == 'shuffle':
            off = (0, 2)[frame]
            for k, col in enumerate(('wh2', 're2', 'wh2')):
                x = 22 + (k - 1) * (2 + off); c.rect(x, 35 - k, x + 4, 41 - k, col); c.line([(x, 35 - k), (x + 4, 35 - k)], 'wh1')
        else:
            c.rect(21, 34, 27, 42, 'wh1'); c.rect(22, 35, 26, 41, 'au2'); c.line([(27, 36), (29, 37), (29, 39), (27, 40)], 'wh1')
            c.px(23, 36 - frame, 'wh2'); c.px(25, 37 - frame, 'wh2')
    if pose == 'deal':
        arm([(12, 34), (16, 42), (20, 43)], (21, 42)); arm([(36, 33), (41, 27), (44, 22)], (44, 21))
        cx = 40 + frame * 3; cy = 12 - frame * 4
        c.rect(cx, cy, cx + 4, cy + 6, 're1'); c.rect(cx + 1, cy + 1, cx + 3, cy + 5, 're2'); c.px(cx + 2, cy + 3, 'au3')
    if pose == 'turn':
        arm([(12, 34), (16, 42), (20, 43)], (21, 42)); arm([(36, 33), (40, 26), (41, 20)], (41, 20))
        c.rect(40, 14, 41, 17, 'sk3')
        if frame == 0: c.rect(42, 3, 44, 9, 'au3'); c.rect(42, 11, 44, 12, 'au3')
    if pose == 'big':
        arm([(12, 33), (8, 26), (6, 19)], (6, 18)); arm([(36, 33), (40, 26), (42, 19)], (42, 18))
        if frame: c.px(4, 12, 'au4'); c.px(44, 11, 'au4'); c.px(3, 13, 'au3')
    if pose == 'ship':
        arm([(12, 34), (16, 42), (20, 43)], (21, 42)); arm([(36, 33), (40, 24), (40, 17 - frame)], (40, 17 - frame))
        my = 6 - frame
        c.rect(37, my, 45, my + 9, 'au1'); c.rect(38, my + 1, 44, my + 9, 'au2'); c.rect(38, my - 2, 44, my, 'wh2'); c.rect(46, my + 2, 47, my + 6, 'au1'); c.px(39, my + 3, 'au4')
    c.outline('ink', 'ink2')
    return c.im

def bram_sheets():
    for p in ('shuffle', 'deal', 'turn', 'big', 'ship', 'wait'):
        sheet = Image.new('RGBA', (96, 48), (0, 0, 0, 0))
        for f in range(2): sheet.paste(bram(p, f), (f * 48, 0))
        sheet.save(f'{OUT}/px-bram-{p}.png')

# ---------- avatars ----------
HAIRC = [('br0', 'br1', 'br2'), ('ink', 'ink2', 'st1'), ('wd1', 'wd2', 'wd3'), ('au1', 'au2', 'au3'), ('ink', 'pu1', 'pu2'), ('re0', 're1', 're2')]
SHIRT = [('gr1', 'gr2', 'gr3'), ('re1', 're2', 're3'), ('au1', 'au2', 'au3'), ('bl1', 'bl2', 'bl3'), ('pu1', 'pu2', 'pu3'), ('wd2', 'wd3', 'wd4')]
SKIN = [('sk2', 'sk3', 'sk4'), ('sk2', 'sk3', 'sk3'), ('sk1', 'sk2', 'sk3'), ('sk0', 'sk1', 'sk2')]
def avatar(p):
    c = Canvas(20, 20)
    hc = HAIRC[(p['hair'] + p['hue']) % 6]; sc = SHIRT[p['hue'] - 1]; sk = SKIN[p['skin']]
    if p['hair'] in (1, 2): c.rect(4, 5, 15, 13 + (4 if p['hair'] == 2 else 0), hc[0])
    c.ell(2, 15, 17, 24, sc[0]); c.ell(2, 15, 16, 23, sc[1]); c.ell(3, 16, 9, 20, sc[2])
    c.rect(8, 12, 11, 15, sk[0])
    c.ell(5, 3, 14, 14, sk[0]); c.ell(5, 3, 13, 13, sk[1]); c.ell(6, 4, 9, 7, sk[2])
    hs = p['hair']
    if hs == 0: c.rect(5, 2, 14, 5, hc[1]); c.rect(5, 2, 9, 3, hc[2])
    if hs == 1: c.rect(5, 2, 14, 6, hc[1]); c.rect(4, 4, 5, 11, hc[1]); c.rect(14, 4, 15, 11, hc[0]); c.rect(6, 2, 9, 3, hc[2])
    if hs == 2: c.rect(5, 2, 14, 5, hc[1]); c.rect(4, 4, 5, 16, hc[1]); c.rect(14, 4, 15, 16, hc[0]); c.px(7, 3, hc[2])
    if hs == 3: c.ell(7, 0, 12, 4, hc[1]); c.rect(5, 3, 14, 5, hc[1]); c.px(8, 1, hc[2])
    if hs == 4:
        for x in range(5, 15, 2): c.px(x, 1, hc[1])
        c.rect(5, 2, 14, 5, hc[1]); c.px(6, 2, hc[2]); c.px(10, 2, hc[2])
    if hs == 5: c.rect(4, 2, 15, 5, 're2'); c.line([(4, 5), (15, 5)], 're1'); c.px(6, 3, 're3')
    c.px(7, 9, 'ink'); c.px(11, 9, 'ink'); c.line([(8, 12), (10, 12)], 'sk0')
    if p['acc'] == 1: c.line([(6, 9), (12, 9)], 'au3'); c.px(7, 9, 'ink'); c.px(11, 9, 'ink')
    if p['acc'] == 2: c.px(4, 11, 'au3')
    if p['acc'] == 3: c.rect(3, 6, 4, 11, 'au2'); c.rect(15, 6, 16, 11, 'au2'); c.line([(4, 3), (15, 3)], 'au2')
    c.outline('ink', 'ink2')
    return c

def photo_avatar():
    """a custom profile photo, auto-pixelated to fit the theme: more colours, no outline"""
    c = Canvas(20, 20, 'bl1')
    c.dither(0, 0, 19, 19, 'bl1', 'bl2', lambda x, y: 1 - y / 20)
    c.ell(1, 14, 18, 26, 're1'); c.ell(2, 14, 16, 24, 're2')
    c.rect(8, 11, 11, 15, 'sk1'); c.ell(5, 3, 14, 13, 'sk2'); c.ell(6, 3, 12, 11, 'sk3'); c.px(7, 5, 'sk4')
    c.rect(4, 1, 15, 4, 'ink2'); c.rect(4, 3, 5, 14, 'ink2'); c.rect(14, 3, 15, 13, 'ink'); c.px(8, 2, 'st2')
    c.px(7, 8, 'ink'); c.px(11, 8, 'ink'); c.line([(8, 11), (10, 11)], 're1')
    return c

# ---------- cards, coins, ui ----------
SUIT_BITS = {
 's': ['....#....', '...###...', '..#####..', '.#######.', '#########', '#########', '.##.#.##.', '....#....', '...###...'],
 'h': ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
 'd': ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'],
 'c': ['...###...', '..#####..', '..#####..', '##.###.##', '#########', '##.#.#.##', '....#....', '...###...', '.........'],
}
def suit_svg(k):
    rects = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1"/>' for y, row in enumerate(SUIT_BITS[k]) for x, ch in enumerate(row) if ch == '#')
    hi = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="#fff" opacity=".45"/>' for y, row in enumerate(SUIT_BITS[k][:4]) for x, ch in enumerate(row) if ch == '#' and (x + y) % 5 == 0 and x < 4)
    return f'<symbol id="su-{k}" viewBox="0 0 9 9"><g fill="currentColor" shape-rendering="crispEdges">{rects}</g>{hi}</symbol>'

def card_back():
    c = Canvas(25, 35, 're1')
    for y in range(35):
        for x in range(25):
            if (x + y) % 6 == 0 or (x - y) % 6 == 0: c.px(x, y, 're2')
    c.rect(0, 0, 24, 1, 'au2'); c.rect(0, 33, 24, 34, 'au1'); c.rect(0, 0, 1, 34, 'au2'); c.rect(23, 0, 24, 34, 'au1')
    c.rect(3, 3, 21, 3, 'au0'); c.rect(3, 31, 21, 31, 'au0'); c.rect(3, 3, 3, 31, 'au0'); c.rect(21, 3, 21, 31, 'au0')
    c.poly([(12, 11), (18, 17), (12, 23), (6, 17)], 'au1'); c.poly([(12, 12), (17, 17), (12, 22), (7, 17)], 'au3'); c.poly([(12, 13), (14, 15), (12, 17), (10, 15)], 'au4')
    c.px(12, 12, 'wh2')
    c.save(f'{OUT}/px-back.png')

def coin(name, ramp, gem=None):
    c = Canvas(12, 12)
    c.ell(0, 0, 11, 11, ramp[0]); c.ell(0, 0, 10, 10, ramp[1]); c.ell(2, 2, 9, 9, ramp[0]); c.ell(2, 2, 8, 8, ramp[2])
    if gem: c.poly([(5, 3), (8, 6), (5, 8), (3, 6)], gem[1]); c.px(4, 5, gem[2])
    else: c.rect(4, 4, 6, 7, ramp[1]); c.px(4, 4, ramp[3])
    c.px(2, 3, ramp[3]); c.px(3, 2, ramp[3])
    c.outline('ink')
    c.save(f'{OUT}/{name}.png')

def face(letter):
    c = Canvas(20, 24)
    if letter == 'K':
        c.ell(4, 6, 15, 18, 'sk2'); c.ell(4, 6, 14, 17, 'sk3'); c.rect(4, 3, 15, 7, 'au2'); c.px(5, 2, 'au3'); c.px(9, 1, 'au3'); c.px(14, 2, 'au3'); c.px(9, 4, 're2')
        c.poly([(4, 13), (15, 13), (13, 21), (9, 23), (6, 21)], 'wh1'); c.poly([(5, 14), (11, 14), (9, 21)], 'wh2')
        c.px(7, 10, 'ink'); c.px(12, 10, 'ink'); c.rect(2, 20, 17, 23, 're1')
    if letter == 'Q':
        c.rect(3, 6, 16, 22, 'br1'); c.ell(5, 6, 14, 17, 'sk3'); c.ell(5, 6, 13, 16, 'sk4'); c.rect(5, 3, 14, 6, 'au2'); c.px(9, 2, 'au4'); c.px(9, 4, 'bl3')
        c.px(7, 10, 'ink'); c.px(12, 10, 'ink'); c.px(9, 13, 're2'); c.px(10, 13, 're2'); c.rect(3, 19, 16, 23, 'pu2')
    if letter == 'J':
        c.ell(4, 4, 15, 18, 'st3'); c.ell(4, 4, 14, 17, 'st4'); c.rect(5, 10, 14, 11, 'ink'); c.rect(9, 2, 10, 5, 're2')
        c.line([(6, 7), (8, 7)], 'wh2'); c.rect(3, 19, 16, 23, 'bl2'); c.line([(16, 4), (16, 22)], 'wh1'); c.rect(14, 16, 18, 17, 'au2')
    c.outline('ink')
    c.save(f'{OUT}/px-f{letter}.png')

def frame9():
    c = Canvas(12, 12)
    c.rect(0, 0, 11, 11, 'ink'); c.rect(1, 1, 10, 10, 'wd3'); c.rect(1, 1, 10, 1, 'wd5'); c.rect(1, 1, 1, 10, 'wd4'); c.rect(1, 10, 10, 10, 'wd1'); c.rect(10, 1, 10, 10, 'wd1')
    c.rect(3, 3, 8, 8, 'ink2'); c.rect(4, 4, 7, 7, 'ink2')
    for x, y in ((2, 2), (9, 2), (2, 9), (9, 9)): c.px(x, y, 'au3')
    c.save(f'{OUT}/px-frame.png')

def chest_and_misc():
    c = Canvas(24, 20)
    c.rect(1, 8, 22, 19, 'wd1'); c.rect(2, 9, 21, 18, 'wd3'); c.rect(1, 2, 22, 8, 'wd2'); c.ell(1, 0, 22, 8, 'wd3'); c.rect(2, 2, 21, 3, 'wd4')
    for x in (4, 19): c.rect(x, 1, x + 1, 19, 'au2')
    c.rect(10, 7, 13, 12, 'au3'); c.px(11, 9, 'ink'); c.outline('ink')
    c.save(f'{OUT}/px-chest.png')
    h = Canvas(9, 8)
    for y, row in enumerate(['.##.##...', '#######..', '#######..', '.#####...', '..###....', '...#.....']):
        for x, ch in enumerate(row):
            if ch == '#': h.px(x, y, 're2')
    h.px(1, 1, 're4'); h.outline('ink'); h.save(f'{OUT}/px-heart.png')

def all_assets():
    os.makedirs(OUT, exist_ok=True)
    tavern_phone(); tavern_lap(); fire_sheet()
    table(97, 158, 'px-table-phone', rim=6); table(190, 125, 'px-table-lap', rim=6)
    bram_sheets(); card_back(); frame9(); chest_and_misc()
    coin('px-coin', ('au0', 'au2', 'au3', 'au4')); coin('px-gem', ('st1', 'st3', 'st4', 'wh2'), gem=('re0', 're2', 're4'))
    for l in 'KQJ': face(l)
    from core import P, DEV
    for p in P + [DEV]: avatar(p).save(f'{OUT}/px-av-{p["i"].lower()}.png')
    photo_avatar().save(f'{OUT}/px-av-photo.png')
if __name__ == '__main__': all_assets(); print('ok')
