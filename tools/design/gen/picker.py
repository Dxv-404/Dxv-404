"""Theme picker that shows the theme on every kind of screen before you choose it. The previews are real layouts from the engine."""
from builders import *
from responsive import frame as rf
from sysboards import THEME_INFO

def mini(th, W, H, n, box_w, box_h, label):
    s = min(box_w / W, box_h / H)
    f, mode, u = rf(th, W, H, n)
    return (f'<figure class="pk-m"><div class="pk-f" style="width:{W * s:.0f}px;height:{H * s:.0f}px"><div class="pk-in" style="transform:scale({s:.4f})">{f}</div></div>'
            f'<figcaption>{label}</figcaption></figure>')

CSS = '''
.pk-m{margin:0;display:grid;gap:6px;justify-items:center}.pk-m figcaption{font:600 11.5px var(--ui);color:var(--mut)}
.pk-f{position:relative;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px var(--line),0 10px 24px rgba(0,0,0,.35)}.pk-in{position:absolute;left:0;top:0;transform-origin:0 0}
.pk-ph{display:flex;flex-direction:column;gap:12px;padding:18px 16px 0}
.pk-hd{display:flex;align-items:center;gap:10px}.pk-hd b{font:var(--dspw,700) 22px var(--dsp)}
.pk-themes{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.pk-themes span{display:grid;justify-items:center;gap:5px;padding:8px 4px 7px;border-radius:calc(var(--r-panel,14px) * .7);font:700 11px var(--ui);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.pk-themes span.on{box-shadow:inset 0 0 0 2px var(--acc),0 0 0 3px var(--bg),0 0 0 4px var(--acc)}.pk-themes i{width:38px;height:20px;border-radius:10px}
.pk-seg{display:flex;gap:3px;padding:3px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.pk-seg span{flex:1;text-align:center;padding:8px 2px;border-radius:calc(var(--r-btn,12px) * .8);font:700 12px var(--ui);color:var(--mut)}.pk-seg span.on{background:var(--acc);color:var(--acctx)}
.pk-lbl{font:700 10.5px var(--ui);letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.pk-strip{display:flex;gap:14px;align-items:center;overflow:hidden;margin-right:-16px;padding:4px 0}
.pk-dots{display:flex;gap:6px;justify-content:center}.pk-dots i{width:6px;height:6px;border-radius:50%;background:var(--line)}.pk-dots i.on{background:var(--acc);width:16px;border-radius:3px}
.pk-use{height:52px;border-radius:var(--r-btn,12px);display:grid;place-items:center;font:800 15.5px var(--ui);background:var(--b-call);color:var(--b-calltx);box-shadow:var(--b-callsh,none)}
.pk-note{font-size:11.5px;color:var(--mut);text-align:center;line-height:1.4}
.pk-lap{position:relative}
.pk-dim{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px)}
.pk-dlg{position:absolute;left:70px;top:50px;right:70px;bottom:50px;display:grid;grid-template-columns:250px 1fr;gap:26px;padding:26px;background:var(--panel,var(--bg));box-shadow:var(--panelsh),0 30px 80px rgba(0,0,0,.6);border-radius:var(--r-panel,18px)}
.pk-dlg{background:var(--bg)}
.pk-list{display:grid;gap:6px;align-content:start}.pk-list b{font:var(--dspw,700) 24px var(--dsp);margin-bottom:8px}
.pk-list span{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:calc(var(--r-btn,12px) * .8);font:700 13.5px var(--ui);box-shadow:inset 0 0 0 1px var(--line)}
.pk-list span.on{box-shadow:inset 0 0 0 2px var(--acc)}.pk-list i{width:30px;height:16px;border-radius:8px;flex:none}
.pk-grid{display:grid;gap:14px;align-content:start}.pk-top{display:flex;align-items:center;gap:14px}.pk-top .pk-seg{width:360px}
.pk-row{display:flex;gap:22px;align-items:flex-end;justify-content:center}
'''

def build(th):
    info = {t[0]: t for t in THEME_INFO}
    names = [t[0] for t in THEME_INFO]
    me = th.name
    chips = ''.join(f'<span class="{"on" if n == me else ""}" style="background:{info[n][4]};color:{info[n][8]}"><i style="background:{info[n][5]};box-shadow:0 0 0 3px {info[n][6]}"></i>{n}</span>' for n in names)
    phone_set = (f'<div class="tp full th-{th.key}"><div class="fx" aria-hidden="true">{th.bg("menu")}</div><div class="pk-ph" style="position:relative;z-index:2">'
                 '<div class="pk-hd"><span class="ib">‹</span><b>Theme</b></div>'
                 f'<div class="pk-themes">{chips}</div>'
                 '<span class="pk-lbl">See it on</span><div class="pk-seg"><span class="on">Phone</span><span>Sideways</span><span>Tablet</span><span>Laptop</span></div>'
                 '<div class="pk-strip">' + mini(th, 390, 844, 10, 150, 300, 'Phone') + mini(th, 844, 390, 10, 300, 300, 'Sideways') + '</div>'
                 '<div class="pk-dots"><i class="on"></i><i></i><i></i><i></i></div>'
                 '<span class="pk-lbl">Players at the table</span><div class="pk-seg"><span>2</span><span>6</span><span class="on">10</span><span>15</span></div>'
                 f'<div class="pk-use">Use {me}</div><p class="pk-note">Only your screen changes. Swipe the preview to see every screen size.</p></div></div>')
    lst = ''.join(f'<span class="{"on" if n == me else ""}"><i style="background:{info[n][5]};box-shadow:0 0 0 2px {info[n][6]}"></i>{n}</span>' for n in names)
    previews = ('<div class="pk-row">' + mini(th, 390, 844, 10, 170, 340, 'Phone · 390 × 844') + mini(th, 820, 1180, 10, 240, 340, 'Tablet · 820 × 1180')
                + mini(th, 1440, 900, 10, 420, 340, 'Laptop · 1440 × 900') + '</div>'
                '<div class="pk-row">' + mini(th, 844, 390, 10, 380, 220, 'Phone sideways · 844 × 390') + mini(th, 360, 740, 10, 110, 220, 'Small phone · 360 × 740')
                + mini(th, 1920, 1080, 10, 380, 220, 'Desktop · 1920 × 1080') + '</div>')
    lap_set = (f'<div class="tp pk-lap th-{th.key}" style="width:1440px;height:900px"><div class="fx" aria-hidden="true">{th.bg("lap")}</div><div class="pk-dim"></div>'
               f'<div class="pk-dlg"><div class="pk-list"><b>Theme</b>{lst}<p class="pk-note" style="text-align:left;margin-top:8px">Each player picks their own. It only changes your screen.</p></div>'
               '<div class="pk-grid"><div class="pk-top"><span class="pk-lbl">Players</span><div class="pk-seg"><span>2</span><span>6</span><span class="on">10</span><span>15</span></div><span class="sp"></span>'
               f'<div class="pk-use" style="width:200px">Use {me}</div></div>{previews}</div></div></div>')
    body = (f'<div class="tp sheet th-{th.key}" style="width:1990px;height:1100px"><div><h1>{th.name} on every screen: the theme picker</h1>'
            '<p class="lede">Picking a theme shows it on every kind of screen before you commit, with the number of players you usually play with. The previews are real layouts from the same engine as the game, not screenshots, so what you see is what you get.</p></div>'
            f'<div style="display:flex;gap:40px;align-items:flex-start"><div class="pz-col" style="display:grid;gap:10px"><b style="font:var(--dspw,700) 19px var(--dsp)">On a phone</b><div style="border-radius:28px;overflow:hidden;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.35)">{phone_set}</div></div>'
            f'<div style="display:grid;gap:10px"><b style="font:var(--dspw,700) 19px var(--dsp)">On a laptop</b><div style="border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px var(--line),0 18px 40px rgba(0,0,0,.35)">{lap_set}</div></div></div></div>')
    return write(f'{th.key}-sizes.dc.html', doc(th, f'{th.name} on every screen', 1990, 1100, body, CSS))
