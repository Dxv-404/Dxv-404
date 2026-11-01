"""Layout lab pages: one page per theme and device, seven player counts side by side, each frame at true device size then scaled for display."""
import sys
from responsive import *

def disp_scale(W, H): return min(460 / H, 520 / W)

def page(th, dev, show=True):
    name, W, H = dev
    s = disp_scale(W, H)
    frames = ''
    for n in COUNTS:
        f, mode, u = frame(th, W, H, n)
        frames += (f'<div class="lab-c"><div class="lab-h"><b>{n} players</b></div>'
                   f'<div class="lab-f" style="width:{W * s:.0f}px;height:{H * s:.0f}px"><div class="lab-in" style="transform:scale({s:.4f})">{f}</div></div></div>')
    mode, u, lw, lh, dock = mode_for(W, H)
    how = {'phone': 'phone layout' + (f', drawn at 500 px wide and scaled ×{u:.2f}' if u != 1 else ''),
           'land': f'sideways layout, {dock} px thumb column on the right', 'lap': f'desktop layout, drawn at {lw} × {lh} and scaled ×{u:.2f}'}[mode]
    bw = int(len(COUNTS) * (W * s + 24) + 88)
    bh = int(H * s + 190)
    css = ('.lab-row{display:flex;gap:24px;align-items:flex-start}.lab-c{display:grid;gap:8px}.lab-h b{font:var(--dspw,700) 15px var(--dsp)}'
           '.lab-f{position:relative;overflow:hidden;border-radius:14px;box-shadow:0 0 0 1px var(--line),0 12px 28px rgba(0,0,0,.3)}.lab-in{position:absolute;left:0;top:0;transform-origin:0 0}')
    body = (f'<div class="tp sheet th-{th.key}" style="width:{bw}px;height:{bh}px"><div><h1>{name} · {W} × {H}</h1>'
            f'<p class="lede">{how}. Same engine, 2 to 15 players.</p></div><div class="lab-row">{frames}</div></div>')
    fn = f'lab-{th.key}-{W}x{H}.dc.html'
    write(fn, doc(th, f'{th.name} {name}', bw, bh, body, css))
    return fn, bw, bh

if __name__ == '__main__':
    import run
    keys = sys.argv[1:] or list(run.THEMES)
    for k in keys:
        for d in DEVICES: print(page(run.THEMES[k], d)[0])

def results(path, themes):
    import json
    from sysboards import SYS_CSS, C
    d = json.load(open(path))
    cell = {}
    for k, v in d.items():
        t = k.split('-')[1]
        for r in v:
            c = cell.setdefault((r['w'], r['h'], r['n']), dict(ok=0, bad=[], mf=99))
            if r['issues']: c['bad'].append(t)
            else: c['ok'] += 1
            c['mf'] = min(c['mf'], r['minFont'])
    head = '<span class="h">Screen</span>' + ''.join(f'<span class="h">{n} players</span>' for n in COUNTS)
    rows = ''
    for name, W, H in DEVICES:
        mode, u, lw, lh, dock = mode_for(W, H)
        rows += f'<span class="d"><b>{name}</b><small>{W} × {H} · {mode_label(mode, u, lw, lh, 7)}</small></span>'
        for n in COUNTS:
            c = cell.get((W, H, n), dict(ok=0, bad=['?'], mf=0))
            cls = 'ok' if not c['bad'] else 'no'
            comp = ' · compact' if is_compact(mode, lw, lh, n) else ''
            rows += f'<span class="c {cls}"><b>{"✓" if not c["bad"] else "✕"} {c["ok"]}/{len(themes)}</b><small>min text {c["mf"]:.1f} px{comp}</small></span>'
    total = sum(c['ok'] for c in cell.values()); allc = sum(c['ok'] + len(c['bad']) for c in cell.values())
    css = SYS_CSS + '''
.lr{display:grid;grid-template-columns:230px repeat(7,1fr);border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(201,161,91,.25)}
.lr>span{padding:9px 12px;border-bottom:1px solid rgba(201,161,91,.12);border-right:1px solid rgba(201,161,91,.08);display:grid;gap:2px}
.lr .h{font-weight:800;color:#ecd39b;background:rgba(246,240,225,.05);font-size:13px}.lr .d b{font:600 15px Fraunces}.lr .d small,.lr .c small{font-size:11px;color:#b9a88b}
.lr .c b{font-size:14px}.lr .ok b{color:#7fd1a3}.lr .no b{color:#ff8a7a}.lr .ok{background:rgba(47,138,99,.08)}
.big{font:600 46px Fraunces;color:#7fd1a3}
'''
    rules = ('<div class="rules">'
             '<div><b>How a layout is chosen.</b> Portrait under 600 px wide: phone layout. Sideways and under 600 px tall: table on the left, thumb column on the right. Anything bigger: the desktop layout. Tablets reuse these, drawn at a fixed size and scaled up, never down past 90%, so text stays above 9 px.</div>'
             '<div><b>The table fills what is left.</b> Rail, felt and seat ring are worked out from the free space after the top bar and your controls, so a 667 px iPhone SE and a 932 px Pro Max both use their whole screen.</div>'
             '<div><b>Compact phones.</b> Short screens, or narrow screens with a crowded table, get a slimmer hand bar and buttons (still 50 px tall), and the dealer moves into the top bar to free the top of the table.</div>'
             '<div><b>Seats never touch.</b> Seats are spaced along the rail; if two would touch, the engine gives them more room and takes it from where there is space. Folded players shrink to a mini avatar on tables over 10.</div>'
             '<div><b>The board fits between the seats.</b> The community cards are sized to the gap left by the seats beside them, from 46 px down to 30 px.</div>'
             '<div><b>What is checked.</b> No two seats overlap; no bet hits a seat, card or the pot; nothing is clipped by the screen edge; the top bar and buttons fit; your cards never cover your stack; every button is at least 44 px tall; no label is under 9 px.</div></div>')
    body = ('<div class="tp sheet th-classic" style="width:2240px;height:820px"><div><h1>Layout lab: every screen, every table size, every theme</h1>'
            f'<p class="lede">{len(DEVICES)} screen sizes × {len(COUNTS)} player counts × {len(themes)} themes = {allc} layouts, each rendered in a real browser and checked automatically. The boards to the right show the Classic theme at every size.</p></div>'
            f'<div style="display:grid;grid-template-columns:1.6fr 1fr;gap:36px"><div style="display:grid;gap:14px;align-content:start"><div class="lr">{head}{rows}</div></div>'
            f'<div style="display:grid;gap:14px;align-content:start"><div><span class="big">{total} / {allc}</span><p style="color:#b9a88b;font-size:14px">layouts pass every check</p></div>{rules}</div></div></div>')
    return write('sys-lab.dc.html', doc(C, "Layout lab results", 2240, 820, body, css))

def mode_label(mode, u, lw, lh, _):
    if mode == 'phone': return 'phone layout' + (f', ×{u:.2f}' if u != 1 else '')
    if mode == 'land': return 'sideways layout'
    return f'desktop layout, ×{u:.2f}'
