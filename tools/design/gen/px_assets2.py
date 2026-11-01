"""Extra Pixel sprites for the tier 3/4 sequences: open chest, crown, trophy, spinning coin, night-sky castle backdrop.
Same rules as the rest of the set: one top-left light, hue-shifted ramps, selective outline, ordered dither for gradients."""
import os, random
from px_lib import *
from px_assets import OUT, tint
R = random.Random(11)

def chest_open():
    c = Canvas(24, 26)
    # lid, flipped back: we see its dark inside
    c.rect(1, 1, 22, 9, 'wd1'); c.rect(2, 2, 21, 8, 'wd0'); c.rect(2, 2, 21, 2, 'wd2')
    for x in (4, 19): c.rect(x, 1, x + 1, 9, 'au1')
    # glow spilling out of the box
    c.rect(2, 10, 21, 13, 'fl2'); c.rect(4, 10, 19, 11, 'fl3')
    for x, y, col in ((5, 9, 'au4'), (8, 8, 'au3'), (12, 9, 'au4'), (15, 8, 're3'), (18, 9, 'au3'), (10, 10, 'fl3')): c.px(x, y, col)
    c.ell(6, 8, 10, 12, 'au3'); c.px(7, 9, 'au4'); c.ell(13, 8, 17, 12, 'au2'); c.px(14, 9, 'au4')
    # box body
    c.rect(1, 13, 22, 25, 'wd1'); c.rect(2, 14, 21, 24, 'wd3'); c.rect(2, 14, 21, 15, 'wd4'); c.line([(2, 24), (21, 24)], 'wd2')
    for y in (18, 21): c.line([(3, y), (20, y)], 'wd2')
    for x in (4, 19): c.rect(x, 13, x + 1, 25, 'au2'); c.px(x, 14, 'au4')
    c.rect(10, 13, 13, 17, 'au3'); c.px(11, 15, 'ink'); c.px(10, 13, 'au4')
    c.outline('ink')
    c.save(f'{OUT}/px-chest-open.png')

def crown():
    c = Canvas(32, 24)
    pts = [(1, 22), (1, 6), (8, 13), (16, 2), (24, 13), (30, 6), (30, 22)]
    c.poly(pts, 'au1'); c.poly([(2, 21), (2, 8), (8, 14), (16, 4), (24, 14), (29, 8), (29, 21)], 'au2')
    c.poly([(3, 19), (3, 10), (8, 15), (16, 6), (16, 19)], 'au3')
    c.rect(1, 16, 30, 22, 'au1'); c.rect(2, 16, 29, 21, 'au2'); c.rect(2, 16, 29, 17, 'au4'); c.line([(2, 21), (29, 21)], 'au0')
    for x, g in ((7, 're'), (16, 'bl'), (25, 're')):
        c.rect(x - 2, 17, x + 1, 20, g + '0'); c.rect(x - 2, 17, x, 19, g + '2'); c.px(x - 2, 17, g + ('4' if g == 're' else '3'))
    for x, y in ((1, 5), (16, 1), (30, 5)): c.ell(x - 1, y - 1, x + 1, y + 1, 'au4'); c.px(x, y, 'wh2')
    c.px(4, 11, 'au4'); c.px(15, 5, 'au4'); c.line([(3, 12), (3, 15)], 'au4')
    c.outline('ink')
    c.save(f'{OUT}/px-crown.png')

def trophy():
    c = Canvas(24, 28)
    c.ell(3, 1, 20, 6, 'au1'); c.rect(3, 3, 20, 10, 'au2')
    c.poly([(3, 4), (20, 4), (17, 15), (12, 17), (6, 15)], 'au2'); c.poly([(4, 5), (11, 5), (11, 15), (7, 14)], 'au3'); c.line([(5, 5), (7, 12)], 'au4')
    c.ell(4, 2, 19, 5, 'au0'); c.ell(5, 2, 18, 4, 'au1')
    for x0 in (0, 19):
        c.ell(x0, 5, x0 + 5, 12, 'au2'); c.ell(x0 + 1, 6, x0 + 4, 11, None) if False else None
        c.rect(x0 + 2, 7, x0 + 3, 10, 'ink2')
    c.rect(10, 16, 13, 20, 'au1'); c.px(10, 16, 'au3')
    c.rect(6, 20, 17, 22, 'au2'); c.rect(6, 20, 17, 20, 'au4')
    c.rect(5, 23, 18, 27, 'wd2'); c.rect(5, 23, 18, 23, 'wd4'); c.rect(9, 24, 14, 26, 'au3')
    c.px(10, 9, 'wh2'); c.px(11, 8, 'wh2')
    c.outline('ink')
    c.save(f'{OUT}/px-trophy.png')

def coin_spin():
    s = Canvas(48, 12)
    for k, w in enumerate((12, 8, 3, 8)):
        x0 = k * 12 + (12 - w) // 2
        if w == 3:
            s.rect(x0, 0, x0 + 2, 11, 'au2'); s.line([(x0, 1), (x0, 10)], 'au4'); continue
        s.ell(x0, 0, x0 + w - 1, 11, 'au0'); s.ell(x0, 0, x0 + w - 2, 10, 'au2')
        s.ell(x0 + 2, 2, x0 + w - 3, 9, 'au3'); s.px(x0 + 2, 3, 'au4'); s.px(x0 + 3, 2, 'au4')
        if w == 12: s.rect(x0 + 4, 4, x0 + 6, 7, 'au2')
    s.outline('ink')
    s.save(f'{OUT}/px-coinspin.png')

def sky():
    W, H = 130, 282
    c = Canvas(W, H, 'night')
    c.dither(0, 0, W - 1, 150, 'ink', 'night', lambda x, y: y / 150)
    c.dither(0, 120, W - 1, 210, 'night', 'night2', lambda x, y: (y - 120) / 90)
    c.dither(0, 190, W - 1, 230, 'night2', 'pu1', lambda x, y: (y - 190) / 60)
    for _ in range(80):
        x, y = R.randint(0, W - 1), R.randint(0, 170)
        c.px(x, y, R.choice(('star', 'star', 'night3', 'wh1')))
    for x, y in ((20, 30), (100, 18), (60, 64), (114, 96)):
        c.px(x, y, 'wh2'); c.px(x - 1, y, 'star'); c.px(x + 1, y, 'star'); c.px(x, y - 1, 'star'); c.px(x, y + 1, 'star')
    # moon with craters and a dithered halo
    tint(c, 96, 52, 30, 'night3', .5)
    c.ell(84, 40, 108, 64, 'wh1'); c.ell(84, 40, 106, 62, 'wh2'); c.ell(90, 46, 95, 51, 'wh1'); c.ell(98, 54, 102, 58, 'wh1'); c.px(88, 56, 'wh1')
    # far mountains
    pts = [(0, 200), (14, 176), (26, 186), (44, 160), (60, 182), (78, 168), (96, 186), (112, 164), (130, 180), (130, 230), (0, 230)]
    c.poly(pts, 'st1')
    for x, y in ((44, 160), (112, 164)): c.poly([(x - 6, y + 8), (x, y), (x + 6, y + 8), (x + 2, y + 6), (x - 2, y + 9)], 'wh0')
    # castle on the hill (left), lit windows
    c.ell(-20, 214, 80, 260, 'gr0')
    c.rect(18, 188, 56, 222, 'st2'); c.rect(18, 188, 19, 222, 'st3')
    for x0 in (12, 30, 50):
        c.rect(x0, 178 if x0 != 30 else 166, x0 + 9, 222, 'st2'); c.line([(x0, 178 if x0 != 30 else 166), (x0, 222)], 'st3')
        top = 178 if x0 != 30 else 166
        for k in range(0, 10, 3): c.rect(x0 + k, top - 3, x0 + k + 1, top - 1, 'st2')
        c.poly([(x0 - 1, top - 3), (x0 + 4, top - 14), (x0 + 10, top - 3)], 're1')
        c.px(x0 + 4, top - 15, 'au3')
    for x, y in ((15, 192), (33, 176), (34, 192), (53, 192), (24, 200), (43, 204)): c.rect(x, y, x + 1, y + 2, 'fl2'); c.px(x, y, 'fl3')
    c.rect(33, 212, 38, 222, 'wd0'); c.ell(33, 209, 38, 214, 'wd0')
    # near hills, trees, and the meadow
    c.ell(40, 226, 190, 300, 'gr1'); c.ell(-40, 238, 70, 300, 'gr1')
    for x in range(0, W, 9):
        y = 236 + (x * 7) % 9
        c.poly([(x, y + 10), (x + 4, y - 4), (x + 8, y + 10)], 'gr0'); c.px(x + 4, y - 3, 'gr2')
    c.rect(0, 252, W - 1, H - 1, 'fe1'); c.dither(0, 248, W - 1, 260, 'gr1', 'fe1', lambda x, y: (y - 248) / 12)
    for _ in range(90): c.px(R.randint(0, W - 1), R.randint(254, H - 1), R.choice(('fe2', 'fe0', 'gr2')))
    for _ in range(10):
        x, y = R.randint(2, W - 3), R.randint(258, H - 4); c.px(x, y, R.choice(('re3', 'au4', 'wh2'))); c.px(x, y + 1, 'gr2')
    c.save(f'{OUT}/px-sky.png')

def all2():
    chest_open(); crown(); trophy(); coin_spin(); sky()
if __name__ == '__main__': all2(); print('ok')
