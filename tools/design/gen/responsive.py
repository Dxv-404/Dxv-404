"""One layout engine for every screen: picks a layout mode from the viewport, works out the table geometry from the space that is
actually left, then places 1-14 opponents with the same arc-length seat engine. Big screens keep a fixed logical size and scale up
(CSS zoom), so type and touch targets never shrink below the phone design."""
from builders import *

DEVICES = [  # name, width, height (CSS px)
 ('Small phone', 360, 740), ('iPhone SE', 375, 667), ('Phone', 390, 844), ('Large phone', 430, 932),
 ('Small phone sideways', 667, 375), ('Phone sideways', 844, 390),
 ('Tablet', 820, 1180), ('Tablet sideways', 1180, 820),
 ('Small laptop', 1280, 720), ('Laptop', 1440, 900), ('Desktop', 1920, 1080),
]
COUNTS = [2, 4, 6, 8, 10, 12, 15]

def mode_for(W, H):
    """-> mode, zoom, logical width, logical height, dock width"""
    if H >= W:
        if W < 600: return 'phone', 1, W, H, 0
        u = W / 540; return 'phone', u, 540, round(H / u), 0          # tablet portrait: the phone layout, drawn larger
    if H < 600:
        dock = 204 if W < 700 else (240 if W < 760 else 284)
        return 'land', 1, W, H, dock                                     # phone sideways: table left, thumb column right
    u = max(.9, min(W / 1440, H / 760))                                  # never shrink type below 90 %
    return 'lap', u, round(W / u), round(H / u), 0                               # tablets sideways, laptops, desktops

def is_compact(mode, lw, lh, n):
    """short or narrow phones with a crowded table: slimmer hero and buttons, dealer moves into the top bar"""
    return mode == 'phone' and (lh < 760 or (lw < 380 and n > 6))

def arena_size(mode, lw, lh, dock, compact):
    if mode == 'phone': return lw, lh - (52 + 86 + 66 if compact else 56 + 98 + 80)
    if mode == 'land': return lw - dock, lh - 46
    return lw - 340, lh - 64 - 168

def make_geo(mode, aw, ah, n, compact=False):
    crowd = n > 10
    if mode == 'phone':
        tl = 54 if crowd else 50
        tt = 52 if compact else int(max(70, min(104, ah * .17)))
        g = dict(W=aw, H=ah, tl=tl, tt=tt, tw=aw - 2 * tl, th=ah - tt - 34, rx=14 if crowd else 12, ry=10 if crowd else 8,
                 gaps=[(90, 26 if crowd else (40 if n <= 6 else 30)), (270, 1)], topx=0 if compact else 76, yk=1.1 if crowd else 1, mode='phone')
    elif mode == 'land':
        tl = 62 if n > 10 else 66
        g = dict(W=aw, H=ah, tl=tl, tt=44, tw=aw - 2 * tl, th=ah - (100 if n > 10 else 72), rx=12, ry=12, gaps=[(90, 8 if n > 10 else 22), (270, 1)], topx=0, yk=1.3 if n > 10 else 1, mode='land')
    else:
        g = dict(W=aw, H=ah, tl=170, tt=124, tw=aw - 340, th=ah - 124 - 84, rx=16, ry=14, gaps=[(90, 18), (270, 1)], topx=108, mode='lap')
    key = f'{mode}-{aw}x{ah}-{n}{"c" if compact else ""}'
    GEO[key] = g
    return key

def states_for(n):
    k = n - 1
    if n <= 10:
        st = phone_states()[:k]
    else:
        st = lap_states()[:k]
        for s in st:
            if 'fold' in s.get('cls', ''): s['cls'] = 'mini'
    if n == 2: st = [dict(tag=('raise', 'Raise 120'), bet='120', stack='2,310')]
    return st, order('lap')[:k]

def fit_card(key, states, players, mode, n):
    """widest board card that clears every seat sitting level with the board/pot stack"""
    w = {'phone': 46 if n <= 10 else 40, 'land': 36, 'lap': 74 if n <= 10 else 66}[mode]
    cx, cy = place(key, [dict(s) for s in states], players)
    st2 = [dict(s) for s in states]; place(key, st2, players)
    half = {'phone': 37 if n <= 10 else 34, 'land': 32, 'lap': 49}[mode]
    gap = 10 if mode == 'lap' else 5
    while w > 26:
        H = w * 1.4 + (70 if mode != 'land' else 40)
        bw = (5 * w + 4 * gap) / 2
        if bw > (GEO[key]['tw'] - 40) / 2: w -= 2; continue
        if all(abs(s['x'] - cx) - half - 6 >= bw for s in st2 if s['y'] + 50 > cy - H / 2 and s['y'] - 40 < cy + H / 2 and 'mini' not in s.get('cls', '')):
            break
        w -= 2
    return w

def felt_for(th, mode, n, w=46):
    gap = 5 if mode != 'lap' else 10
    side = '<div class="sidepot"><span>Main 1,060</span><span>Side 240</span></div>' if mode != 'land' else ''
    pot = th.pot_html(mode if mode != 'land' else 'phone', '1,300') if hasattr(th, 'pot_html') else f'<div class="pot">{chip("a")}<strong>1,300</strong>pot</div>'
    return f'<div class="board" style="gap:{gap}px">{"".join(card(c, w) for c in BOARD)}{slot(w)}</div>{pot}{side if n > 2 else ""}'

def frame(th, W, H, n, extra_arena='', overlay='', cls='', post=None):
    mode, u, lw, lh, dock = mode_for(W, H)
    compact = is_compact(mode, lw, lh, n)
    aw, ah = arena_size(mode, lw, lh, dock, compact)
    key = make_geo(mode, aw, ah, n, compact)
    cw = fit_card(key, *states_for(n), mode, n)
    states, players = states_for(n)
    dens = {'phone': 'dense' + (' xdense' if n > 10 or (compact and n > 6) else '') + (' compact' if compact else '') + (' narrow' if lw < 380 else ''), 'land': 'xdense' + (' short' if lh < 400 else ''), 'lap': ''}[mode]
    sub = f'Blinds 10 / 20 · {n} players'
    tbl = table_block(th, key, states, players, felt_for(th, mode, n, cw))
    if post: tbl = post(tbl, key, states, cw)
    arena = (f'<div class="arena">{th.arena_deco("phone" if mode != "lap" else "lap")}{dealer_block(th, mode)}'
             + tbl + extra_arena + '</div>')
    hero_cards = hold()
    if mode == 'phone':
        body = (f'<div class="fx" aria-hidden="true">{th.bg("phone")}</div>' + topbar(th, 'phone', 'Hand 23', sub, f'<span class="tdl">{th.dealer("idle", "mini")}</span>' if compact and th.dealer_name else '') + arena
                + f'<section class="hero">{hero_cards}<div class="hmeta"><span class="hname">Dev · your turn</span><span class="hstack">1,840</span>'
                '<span class="hhint"><span class="s1">Hold your cards to look</span><span class="s2">Two pair, Aces and Kings</span></span></div>'
                '<div class="tbank"><span class="rg"><span>18</span></span>sec</div></section>'
                '<nav class="actions"><button class="act fold">Fold</button><button class="act call tap">Call<small>120</small></button><button class="act raise">Raise<small>240+</small></button></nav>')
        style = f'width:{lw}px;height:{lh}px'
    elif mode == 'land':
        body = (f'<div class="fx" aria-hidden="true">{th.bg("phone")}</div>' + topbar(th, 'land', 'Hand 23', sub) + arena
                + f'<aside class="dock"><section class="hero">{hold().replace("66px", "52px")}<div class="hmeta"><span class="hname">Dev</span><span class="hstack">1,840</span></div></section>'
                '<div class="presets"><span>½ pot</span><span>Pot</span><span>All-in</span></div><nav class="actions"><button class="act fold">Fold</button><button class="act call">Call<small>120</small></button><button class="act raise">Raise</button></nav></aside>')
        style = f'width:{lw}px;height:{lh}px;grid-template-columns:minmax(0,1fr) {dock}px'
    else:
        body = (f'<div class="fx" aria-hidden="true">{th.bg("lap")}</div>'
                + topbar(th, 'lap', 'Friday Night Table', f'Hand 23 · blinds 10 / 20 · {n} players') + arena
                + '<div class="dock"><section class="hero">' + hold().replace('66px', '84px')
                + '<div class="hmeta"><span class="hname">Dev · your turn</span><span class="hstack">1,840</span><span class="hhint"><span class="s1">Hold cards or Space to look</span><span class="s2">Two pair, Aces and Kings</span></span></div></section>'
                + '<div class="actions"><div class="rb"><div class="presets"><span>Min</span><span>½ pot</span><span>¾ pot</span><span>Pot</span><span>All-in</span></div><div class="slider"></div></div>'
                + '<button class="act fold">Fold <kbd>F</kbd></button><button class="act call tap">Call 120 <kbd>C</kbd></button><button class="act raise">Raise to 680 <kbd>R</kbd></button></div></div>'
                + f'<aside class="side">{th.side()}</aside>')
        style = f'width:{lw}px;height:{lh}px'
    if u != 1: style += f';zoom:{u:.4f}'
    return f'<div class="tp {mode} {dens} th-{th.key} {cls}" style="{style}" data-w="{W}" data-h="{H}" data-n="{n}" data-u="{u:.4f}">{body}{overlay}</div>', mode, u
