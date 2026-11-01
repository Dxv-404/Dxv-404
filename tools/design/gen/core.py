"""Train Poker v2 mockup generator: shared layout engine + board builders. Themes plug in art and copy."""
import math, os, html, re
OUT = os.path.join(os.path.dirname(__file__), '..', 'tp2', 'project')

# ---------------- people ----------------
P = [
 dict(n='Aditya', i='AD', hue=3, hair=0, skin=1, acc=0),
 dict(n='Sneha', i='SN', hue=2, hair=2, skin=1, acc=2),
 dict(n='Kabir', i='KA', hue=4, hair=4, skin=2, acc=0),
 dict(n='Meera', i='ME', hue=5, hair=1, skin=0, acc=0),
 dict(n='Arjun', i='AR', hue=1, hair=5, skin=2, acc=0),
 dict(n='Ishaan', i='IS', hue=6, hair=0, skin=1, acc=1),
 dict(n='Tara', i='TA', hue=3, hair=3, skin=0, acc=0),
 dict(n='Riya', i='RI', hue=6, hair=2, skin=1, acc=0),
 dict(n='Zoya', i='ZO', hue=2, hair=1, skin=1, acc=0, photo=True),
 dict(n='Rohan', i='RO', hue=4, hair=4, skin=3, acc=3),
 dict(n='Vikram', i='VI', hue=1, hair=0, skin=3, acc=1),
 dict(n='Nisha', i='NI', hue=5, hair=3, skin=2, acc=2),
 dict(n='Kunal', i='KU', hue=3, hair=5, skin=1, acc=0),
 dict(n='Priya', i='PR', hue=6, hair=2, skin=0, acc=0),
]
DEV = dict(n='Dev', i='DV', hue=2, hair=4, skin=2, acc=0)
for k, p in enumerate(P): p['k'] = k

# ---------------- cards ----------------
SUIT_PATHS = {
 's': 'M12 1.6C8.6 5.7 2.6 9.3 2.6 14c0 2.9 2.2 4.9 4.8 4.9 1.6 0 3-.8 3.8-2-.2 2.3-1 4.1-2.6 5.5h6.8c-1.6-1.4-2.4-3.2-2.6-5.5.8 1.2 2.2 2 3.8 2 2.6 0 4.8-2 4.8-4.9 0-4.7-6-8.3-9.4-12.4z',
 'h': 'M12 21.6C5.4 16.4 1.8 12.6 1.8 8.1 1.8 5 4.1 2.8 7 2.8c2.1 0 3.9 1.2 5 3 1.1-1.8 2.9-3 5-3 2.9 0 5.2 2.2 5.2 5.3 0 4.5-3.6 8.3-10.2 13.5z',
 'd': 'M12 1.4c2.4 3.7 5.3 7.2 8.6 10.6-3.3 3.4-6.2 6.9-8.6 10.6-2.4-3.7-5.3-7.2-8.6-10.6 3.3-3.4 6.2-6.9 8.6-10.6z',
 'c': 'M12 2.4a4.9 4.9 0 0 1 3.6 8.2 4.9 4.9 0 1 1 -1.3 7.4c.2 1.6.9 2.9 2.2 3.9H7.5c1.3-1 2-2.3 2.2-3.9a4.9 4.9 0 1 1 -1.3-7.4A4.9 4.9 0 0 1 12 2.4z',
}
def suit_symbols(paths=None, extra_attr=''):
    paths = paths or SUIT_PATHS
    return ''.join(f'<symbol id="su-{k}" viewBox="0 0 24 24"><path d="{v}" fill="currentColor" {extra_attr}/></symbol>' for k, v in paths.items())

def use(id_, cls, vb=None):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#{id_}"/></svg>'

def card(code, w=46, cls='', faces=True):
    """code like 'Ks', 'Th', '9d'"""
    r, s = code[:-1], code[-1]
    rr = '10' if r in ('T', '10') else r
    size = 's' if w < 60 else ('m' if w < 100 else 'l')
    ten = ' ten' if rr == '10' else ''
    inner = f'<b class="r{ten}">{rr}</b>'
    if size != 's':
        inner += use('su-' + s, 'su')
    if size == 'l' and faces and rr in 'JQK':
        inner += f'<svg class="art" viewBox="0 0 60 80" aria-hidden="true"><use href="#f{rr}"/></svg>'
    else:
        inner += use('su-' + s, 'pip')
    if size == 'l':
        inner += f'<span class="ix2"><b>{rr}</b><svg aria-hidden="true"><use href="#su-{s}"/></svg></span>'
    return f'<div class="cd {size} {s} {cls}" style="--w:{w}px">{inner}</div>'

def back(w=46, cls=''):
    return f'<div class="cd dn {cls}" style="--w:{w}px"><svg class="bk" viewBox="0 0 50 70" preserveAspectRatio="none" aria-hidden="true"><use href="#cb"/></svg></div>'

def slot(w):
    return f'<div class="slot" style="--w:{w}px"></div>'

def chip(kind='a'):
    return f'<svg class="chip" viewBox="0 0 24 24" aria-hidden="true"><use href="#ch-{kind}"/></svg>'

def hold(c1='As', c2='Ah'):
    return ('<div class="hc" role="img" aria-label="Your two cards, press and hold to look">'
            f'<div class="flip">{card(c1, 66)}{back(66)}</div><div class="flip">{card(c2, 66)}{back(66)}</div><span class="thumb"></span></div>')

# ---------------- layout engine ----------------
def ellipse_slots(cx, cy, rx, ry, n, gaps, weights=None, topx=0, yk=1):
    """n points evenly spaced by arc length on an ellipse, skipping gap arcs. Angles: 0 right, 90 bottom."""
    N = 1800
    pts, keep = [], []
    for k in range(N):
        a = k / N * 360
        x, y = cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))
        ok = all(abs(((a - g + 180) % 360) - 180) > hw for g, hw in gaps) and not (y < cy and abs(x - cx) < topx)
        pts.append((x, y, a)); keep.append(ok)
    # start just after the bottom gap, go clockwise (increasing angle)
    start = next(k for k in range(N) if keep[k] and not keep[k - 1])
    seq = [pts[(start + k) % N] for k in range(N) if keep[(start + k) % N]]
    L = [0.0]
    for k in range(1, len(seq)):
        dx, dy = seq[k][0] - seq[k - 1][0], (seq[k][1] - seq[k - 1][1]) * yk
        L.append(L[-1] + (math.hypot(dx, dy) if math.hypot(dx, dy) < 20 else 0))
    tot = L[-1]
    out, j = [], 0
    wts = weights or [1] * n
    W = sum(wts); acc = 0
    for m in range(n):
        target = tot * (acc + wts[m] / 2) / W; acc += wts[m]
        while L[j] < target: j += 1
        out.append(seq[j])
    return out

GEO = {
 'phone': dict(W=390, H=612, tl=50, tt=104, tw=290, th=474, rx=12, ry=8, gaps=[(90, 30), (270, 27)]),
 'phone15': dict(W=390, H=612, tl=58, tt=104, tw=274, th=474, rx=14, ry=10, gaps=[(90, 26), (270, 30)]),
 'phone6': dict(W=390, H=612, tl=50, tt=104, tw=290, th=474, rx=12, ry=8, gaps=[(90, 40), (270, 30)]),
 'land': dict(W=560, H=344, tl=66, tt=44, tw=428, th=272, rx=12, ry=12, gaps=[(90, 22), (270, 10)]),
 'lap': dict(W=1100, H=668, tl=170, tt=124, tw=760, th=500, rx=16, ry=14, gaps=[(90, 18), (270, 13)]),
}

def seat_html(th, p, st, ctx):
    cls = ['seat'] + [x for x in st.get('cls', '').split() if x]
    inner = ''
    if st.get('shown'):
        inner += '<div class="shown">' + ''.join(card(c, st.get('sw', 22)) for c in st['shown']) + '</div>'
    elif st.get('cards', True) and 'fold' not in cls and 'away' not in cls:
        inner += '<div class="backs">' + back(17) + back(17) + '</div>'
    hot = f'<span class="hotb">{st["hot"]}</span>' if st.get('hot') else ''
    status = st.get('status', '')
    inner += f'<div class="av">{th.avatar(p, ctx)}{hot}{status}</div>'
    inner += f'<div class="plate"><b>{p["n"]}</b><i>{st.get("stack", "1,000")}</i></div>'
    if st.get('tag'):
        tcls, ttxt = st['tag']
        inner += f'<div class="tag {tcls}">{ttxt}</div>'
    return f'<div class="{" ".join(cls)}" style="left:{st["x"]:.0f}px;top:{st["y"]:.0f}px" data-n="{p["n"]}">{inner}</div>'

PHONE_ORDER = [0, 1, 2, 3, 4, 7, 8, 9, 6]
LAP_ORDER = [0, 1, 2, 3, 4, 7, 8, 9, 6, 11, 5, 10, 13, 12]
def order(kind): return [P[k] for k in (PHONE_ORDER if kind == 'phone' else LAP_ORDER)]

def place(kind, states, players):
    g = GEO[kind]
    cx, cy = g['tl'] + g['tw'] / 2, g['tt'] + g['th'] / 2
    wts = [.5 if 'mini' in st.get('cls', '') else 1 for st in states]
    # seat footprints (half width, above centre, below centre) by layout mode; mini seats are just the avatar
    fp = g.get('fp') or {'lap': (52, 32, 78), 'land': (31, 18, 46)}.get(g.get('mode', kind), (37, 24, 56))
    def foot(st, x, y):
        if 'mini' in st.get('cls', ''): return (x - 18, y - 18, x + 18, y + 18)
        return (x - fp[0], y - fp[1], x + fp[0], y + fp[2])
    hit0 = lambda r, q: not (r[2] <= q[0] or q[2] <= r[0] or r[3] <= q[1] or q[3] <= r[1])
    for _ in range(80):   # relax: give more arc to neighbours that would touch
        pts = ellipse_slots(cx, cy, g['tw'] / 2 + g['rx'], g['th'] / 2 + g['ry'], len(states), g['gaps'], wts, g.get('topx', 0), g.get('yk', 1))
        bad = [i for i in range(len(states) - 1) if hit0(foot(states[i], *pts[i][:2]), foot(states[i + 1], *pts[i + 1][:2]))]
        if not bad: break
        for i in bad: wts[i] *= 1.12; wts[i + 1] *= 1.12
    for st, (x, y, a) in zip(states, pts):
        st['x'], st['y'], st['a'] = x, y, a
    # bets: search along the seat->centre ray (with lateral nudges) for the first spot that collides with nothing
    ph = g.get('mode', kind) != 'lap'
    sw, sh0, sh1 = (37, 38, 50) if ph else (49, 46, 60)
    seatR = [(st['x'] - sw, st['y'] - sh0, st['x'] + sw, st['y'] + sh1) for st in states]
    bw, bh = (134, 78) if ph else (226, 92)
    used = [(cx - bw, cy - bh, cx + bw, cy + bh)]
    hit = lambda r, q: not (r[2] <= q[0] or q[2] <= r[0] or r[3] <= q[1] or q[3] <= r[1])
    for i, st in enumerate(states):
        if 'bet' not in st: continue
        x, y = st['x'], st['y']; d = math.hypot(cx - x, cy - y); ux, uy = (cx - x) / d, (cy - y) / d
        best = None
        base = math.atan2(uy, ux)
        cand = [(x + ux * D - uy * lat, y + uy * D + ux * lat) for D in range(44, 170, 6) for lat in (0, 18, -18, 36, -36, 54, -54)]
        cand += [(x + math.cos(base + math.radians(t)) * D * 1.3, y + math.sin(base + math.radians(t)) * D) for t in (30, -30, 50, -50, 70, -70, 90, -90) for D in range(46, 110, 6)]
        for bx, by in cand:
            if True:
                r = (bx - 32, by - 11, bx + 32, by + 11) if ph else (bx - 40, by - 14, bx + 40, by + 14)
                ex, ey = (bx - cx) / (g['tw'] / 2 - g['rx'] - 14), (by - cy) / (g['th'] / 2 - g['ry'] - 10)
                if ex * ex + ey * ey > 1: continue
                if any(hit(r, q) for q in seatR) or any(hit(r, q) for q in used): continue
                best = (bx, by, r); break
            if best: break
        if not best: continue  # no room: the amount stays in the seat's action tag only
        bx, by, r = best
        used.append(r)
        st['bx'], st['by'] = bx, by
    return cx, cy

def table_block(th, kind, states, players, felt_inner, dbtn_at=0, extra=''):
    g = GEO[kind]
    cx, cy = place(kind, states, players)
    seats = ''.join(seat_html(th, p, st, kind) for p, st in zip(players, states))
    bets = ''.join(f'<div class="bet" style="left:{st["bx"]:.0f}px;top:{st["by"]:.0f}px">{chip(st.get("chip","a"))}<span>{st["bet"]}</span></div>' for st in states if 'bx' in st)
    st0 = states[dbtn_at]
    bets_xy = [(st['bx'], st['by']) for st in states if 'bx' in st]
    FP = {'lap': (54, 50, 82), 'land': (32, 32, 48)}.get(g.get('mode', kind), (38, 42, 58))
    ring = [(round(r * math.cos(math.radians(a))), round(r * math.sin(math.radians(a)))) for r in (48, 60, 74, 90) for a in range(0, 360, 15)]
    found = False
    for ox, oy in [(46, -30), (50, 4), (-46, -34), (30, -56), (64, -40), (-50, 6)] + ring:
        dx, dy = st0['x'] + ox, st0['y'] + oy
        cbw, cbh = ((134, 78) if g.get('mode', kind) != 'lap' else (226, 92))
        if abs(dx - cx) < cbw + 14 and abs(dy - cy) < cbh + 14: continue
        if not (16 <= dx <= g['W'] - 16 and 16 <= dy <= g['H'] - 16): continue
        bxw, byh = (44, 22) if g.get('mode', kind) != 'lap' else (60, 28)
        if all(abs(dx - bx) > bxw or abs(dy - by) > byh for bx, by in bets_xy) and all(not (st['x'] - F[0] - 14 < dx < st['x'] + F[0] + 14 and st['y'] - F[1] - 14 < dy < st['y'] + F[2] + 14) for st in states for F in [(18, 18, 18) if 'mini' in st.get('cls', '') else FP]): found = True; break
    tbl = (f'<div class="table" style="left:{g["tl"]}px;top:{g["tt"]}px;width:{g["tw"]}px;height:{g["th"]}px">'
           f'{th.rail_deco(kind) if hasattr(th, "rail_deco") else ""}<div class="felt">{th.felt_deco(kind)}{felt_inner}</div></div>')
    if found: return tbl + bets + f'<div class="dbtn" style="left:{dx:.0f}px;top:{dy:.0f}px">D</div>' + seats + extra
    # no clear spot on the felt: the button rides on the dealer's avatar instead
    name = players[dbtn_at]['n']
    seats = re.sub(r'(data-n="' + re.escape(name) + r'">.*?<div class="av">)', r'\1<span class="dbadge">D</span>', seats, count=1, flags=re.S)
    return tbl + bets + seats + extra

# ---------------- document ----------------
def esc(s): return html.escape(s, quote=True)

def doc(th, title, w, h, body, css='', sprite=True, frame_cls=''):
    sp = th.sprite() if sprite else ''
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{esc(title)}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="base2.css">
<link rel="stylesheet" href="{th.css}">
</head>
<body>
<x-dc>
<helmet>
<style>body{{margin:0}}{css}</style>
</helmet>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>{sp}</defs></svg>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def write(name, text):
    with open(os.path.join(OUT, name), 'w') as f: f.write(text)
    return name

ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'

def topbar(th, kind, title, sub, extra=''):
    return (f'<header class="top"><button class="ib" aria-label="Table menu">{ICON_MENU}</button>'
            f'<div class="hm"><b>{title}</b><small>{sub}</small></div><span class="sp"></span>{extra}'
            f'<span class="net" aria-label="Connection good"><i></i><i></i><i></i></span>'
            f'<span class="pill code">QK7P</span><button class="ib info" aria-label="Hand rankings">i</button></header>')

# ---------------- standard scenes ----------------
BOARD = ['Ks', '7h', '2d', 'Kc']
def phone_states():
    return [
     dict(tag=('', 'Call 120'), bet='120', stack='2,310'),
     dict(cls='fold', tag=('fold', 'Fold'), stack='960'),
     dict(tag=('', 'Call 120'), bet='120', stack='1,505', status='<span class="status weak" title="Weak connection">!</span>'),
     dict(hot='3 IN A ROW', stack='3,020'),
     dict(cls='away', tag=('away', 'Away 2:41'), stack='1,000', cards=False),
     dict(tag=('raise', 'Raise 120'), bet='120', stack='1,180'),
     dict(tag=('allin', 'All-in'), bet='240', chip='b', stack='0'),
     dict(cls='fold', tag=('fold', 'Fold'), stack='740'),
     dict(cls='turn', stack='1,890', tag=('', 'Thinking')),
    ]

def lap_states():
    s = phone_states()
    s[8] = dict(tag=('', 'Call 120'), bet='120', stack='1,890')
    s += [
     dict(cls='fold', tag=('fold', 'Fold'), stack='1,275'),
     dict(cls='away', tag=('away', 'Back in 0:42'), stack='1,410', cards=False, status='<span class="status off" title="Disconnected">⏻</span>'),
     dict(tag=('', 'Call 120'), bet='120', stack='2,045'),
     dict(cls='fold', tag=('fold', 'Fold'), stack='1,155'),
     dict(cls='turn', stack='880', tag=('', 'Thinking')),
    ]
    return s

def felt_main(kind, th, pot='1,300', extra=''):
    w = 46 if kind == 'phone' else 74
    cards = ''.join(card(c, w) for c in BOARD) + slot(w)
    return (getattr(th, 'whisper', '') + f'<div class="board" style="gap:{5 if kind=="phone" else 10}px">{cards}</div>'
            + (th.pot_html(kind, pot) if hasattr(th, 'pot_html') else f'<div class="pot">{chip("a")}<strong>{pot}</strong>pot</div>')
            + f'<div class="sidepot"><span>Main 1,060</span><span>Side 240</span></div>{extra}')

def seat_xy(i, kind='phone'):
    st = phone_states() if kind == 'phone' else lap_states()
    place(kind, st, order(kind))
    return st[i]['x'], st[i]['y'] + (56 if kind == 'phone' else 64)

POT_XY = (195, 56 + 104 + 237 + 30)

def casino_chip(id_, base, edge, inlay, ring, mark=''):
    """A detailed casino chip: base, six edge inserts, dashed inner ring, inlay disc, optional centre mark."""
    ins = ''.join(f'<rect x="10.4" y="0.9" width="3.2" height="4.2" rx=".6" fill="{edge}" transform="rotate({a} 12 12)"/>' for a in range(0, 360, 60))
    return (f'<symbol id="{id_}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.2" fill="{base}"/>{ins}'
            f'<circle cx="12" cy="12" r="11.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>'
            f'<circle cx="12" cy="12" r="7.6" fill="none" stroke="{ring}" stroke-width=".7" stroke-dasharray="1.4 1.1"/>'
            f'<circle cx="12" cy="12" r="6.3" fill="{inlay}"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".5"/>'
            f'{mark}<ellipse cx="9" cy="7" rx="5" ry="2.4" fill="rgba(255,255,255,.18)" transform="rotate(-30 9 7)"/></symbol>')

def cardk(code, w, cls='', **vars):
    """card with extra CSS custom properties, e.g. cardk('Ks', 60, 'fan', k=2)"""
    v = ''.join(f'--{k}:{x};' for k, x in vars.items())
    return card(code, w, cls).replace('style="', f'style="{v}', 1)

import re as _re
def scoped(h, c, names, pre):
    """Prefix the given class names in markup and CSS so banner styles never collide with theme or base rules."""
    pre = pre + '_'
    names = sorted(set(names.split()), key=len, reverse=True)
    bad = set(names) & {'cd', 's', 'm', 'l', 'h', 'd', 'c', 'r', 'ten', 'su', 'pip', 'art', 'ix2', 'win', 'lose', 'dn', 'chip', 'seat'}
    assert not bad, f'reserved card/table class names in banner: {bad}'
    def fix_attr(m):
        toks = m.group(1).split()
        return 'class="' + ' '.join(pre + t if t in names else t for t in toks) + '"'
    h = _re.sub(r'class="([^"]*)"', fix_attr, h)
    c = c.replace('animation-delay:', 'animation-fill-mode:both;animation-delay:')
    for n in names: c = _re.sub(r'\.' + _re.escape(n) + r'(?![\w-])', '.' + pre + n, c)
    return h, c
