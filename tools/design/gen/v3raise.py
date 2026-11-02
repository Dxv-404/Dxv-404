"""Raising: minus and plus, a typed amount, the slider and the presets, on every screen size, with laptop keys. And the
action buttons, made clearly readable in every theme."""
from v3kit import *
from responsive import frame as rf

PRE = [('Min', 240), ('½ pot', 650), ('¾ pot', 975), ('Pot', 1300), ('All-in', 1840)]
MAXV = 1840

def slider(v, ticks=True):
    pct = (v - 240) / (MAXV - 240) * 100
    tk = ''.join(f'<i style="left:{(x - 240) / (MAXV - 240) * 100:.1f}%"></i>' for _, x in PRE[1:4]) if ticks else ''
    lab = ''.join(f'<span style="left:{(x - 240) / (MAXV - 240) * 100:.1f}%">{n}</span>' for n, x in [('Min', 240), ('½', 650), ('Pot', 1300), ('All', 1840)]) if ticks else ''
    return f'<div class="rsl"><div class="trk"><b style="width:{pct:.1f}%"></b>{tk}<u style="left:{pct:.1f}%"></u></div><div class="tlab">{lab}</div></div>'

def presets(on):
    return '<div class="rpre">' + ''.join(f'<span class="{"on" if n == on else ""}">{n}</span>' for n, _ in PRE) + '</div>'

def amount(v, state=''):
    allin = v >= MAXV
    plus = '<span class="pm p dis">' + ICON['plus'] + '</span>' if allin else '<span class="pm p' + (' press' if state == 'hold' else '') + '">' + ICON['plus'] + '</span>'
    minus = '<span class="pm m">' + ICON['minus'] + '</span>'
    fl = '<span class="flo">+20</span>' if state == 'hold' else ''
    val = f'{v:,}'
    num = (f'<span class="amt typing">1,2<i class="caret"></i></span>' if state == 'type' else f'<span class="amt">{val}{fl}</span>')
    return f'<div class="ramt">{minus}<div class="amc">{num}<small>{"all your chips" if allin else "raise to · min 240"}</small></div>{plus}</div>'

def sheet(v, on='', state='', compact=False):
    allin = v >= MAXV
    go = f'All-in {MAXV:,}' if allin else f'Raise to {v:,}'
    top = '<div class="rtop"><b>Raise</b><span class="mut">Pot 1,300 · you have 1,840</span></div>'
    if state == 'type':
        pad = ''.join(f'<span>{k}</span>' for k in '123456789') + '<span>00</span><span>0</span><span>⌫</span>'
        mid = f'<div class="rpad">{pad}</div><p class="rnote">Up to 1,840. Typing more than you have makes it all-in.</p>'
    else:
        mid = slider(v) + presets(on)
        if state == 'hold': mid += '<p class="rnote">Each tap is one big blind (20). Hold to keep going; it speeds up.</p>'
    return (f'<div class="rsheet{" cmp" if compact else ""}{" allin" if allin else ""}"><span class="grip"></span>{top}{amount(v, state)}{mid}'
            f'<div class="racts"><span class="bb g">Cancel</span><span class="bb r go">{go}</span></div></div>')

def phone(th, v, on, state='', W=390, H=844):
    f, mode, u = rf(th, W, H, 10, overlay='<div class="kdim rdim"></div>' + sheet(v, on, state, compact=H < 760))
    return f

def land(th):
    panel = (f'<div class="rdock"><div class="rtop"><b>Raise</b><span class="mut">pot 1,300</span></div>{amount(650)}{slider(650, False)}'
             '<div class="rpre g2">' + ''.join(f'<span class="{"on" if n == "½ pot" else ""}">{n}</span>' for n, _ in PRE[1:]) + '</div>'
             '<div class="racts"><span class="bb g sm">Cancel</span><span class="bb r sm go">Raise to 650</span></div></div>')
    f, mode, u = rf(th, 844, 390, 10, overlay=panel)
    return f

def lap(th):
    pop = (f'<div class="rpop"><div class="rtop"><b>Raise</b><span class="mut">Pot 1,300 · you have 1,840</span></div>'
           f'{amount(680)}{slider(680)}{presets("")}'
           '<div class="keys"><span><b class="kbd">←</b><b class="kbd">→</b> 1 big blind</span><span><b class="kbd">⇧</b>+<b class="kbd">←</b><b class="kbd">→</b> 5 big blinds</span>'
           '<span><b class="kbd">↑</b><b class="kbd">↓</b> next amount</span><span><b class="kbd">Home</b> min · <b class="kbd">End</b> all-in</span><span>Type digits to set it</span></div>'
           '<div class="racts"><span class="bb g">Cancel <b class="kbd">Esc</b></span><span class="bb r go">Raise to 680 <b class="kbd">⏎</b></span></div><i class="tail"></i></div>')
    f, mode, u = rf(th, 1440, 900, 10, overlay=pop)
    return f

def legend(th):
    rows = [('R', 'Open raise'), ('← →', 'One big blind less or more'), ('⇧ ← →', 'Five big blinds'), ('↑ ↓', 'Jump to the next preset'),
            ('Home', 'Minimum raise'), ('End', 'All-in'), ('0–9', 'Type an exact amount'), ('⏎', 'Raise'), ('Esc', 'Close without raising'),
            ('F', 'Fold'), ('C', 'Check or call'), ('Space', 'Hold to look at your cards')]
    r = ''.join(f'<div class="lg2"><span>{"".join(f"<b class=kbd>{k}</b>" for k in a.split())}</span><small>{b}</small></div>' for a, b in rows)
    return f'<div class="tp v3s th-{th.key} legend" style="width:390px;height:844px"><div class="fx" aria-hidden="true">{th.bg("menu")}</div><div class="v3b"><div class="v3h"><div><b>Keyboard</b><small>Laptops and tablets with a keyboard</small></div></div>{r}<p class="hint">Hints show on the buttons only when a keyboard was used; phones never see them.</p></div></div>'

def acts_fixed(th):
    """The action bar with the readability fixes: full-strength amounts and per-theme text colours where they were faint."""
    f, mode, u = rf(th, 390, 844, 10)
    return f

CSS = r'''
.rdim{z-index:30}
.rsheet{position:absolute;left:0;right:0;bottom:0;z-index:31;padding:8px 16px 22px;border-radius:var(--r-panel,20px) var(--r-panel,20px) 0 0;background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 -18px 40px rgba(0,0,0,.45);display:grid;gap:12px;animation:rise .4s cubic-bezier(.2,.8,.25,1) both}
.rsheet .grip{width:40px;height:4px;border-radius:2px;background:var(--line);justify-self:center}
.rtop{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.rtop b{font:var(--dspw,700) 19px var(--dsp)}.rtop span{font-size:12px}
.ramt{display:flex;align-items:center;gap:12px}
.pm{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--chipbg);box-shadow:inset 0 0 0 1.5px var(--line);color:var(--tx);position:relative}
.pm svg{width:24px;height:24px}.pm.press{transform:scale(.92);box-shadow:inset 0 0 0 2px var(--acc);background:color-mix(in srgb,var(--acc) 22%,var(--chipbg))}
.pm.press::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--acc);animation:hold 1s ease-out infinite}
@keyframes hold{from{opacity:.9;transform:scale(.9)}to{opacity:0;transform:scale(1.25)}}
.pm.dis{opacity:.35}
.amc{flex:1;display:grid;justify-items:center;gap:2px}
.amt{position:relative;font:var(--numw,700) 42px/1.05 var(--num);color:var(--tx);border-bottom:2px dashed var(--line);padding:0 6px;display:flex;align-items:center}
.amt.typing{border-bottom:2px solid var(--acc)}.amc small{font-size:11.5px;color:var(--mut)}
.flo{position:absolute;right:-30px;top:-4px;font:var(--numw,700) 14px var(--num);color:var(--acc);animation:flo 1s ease-out infinite}
@keyframes flo{from{transform:translateY(8px);opacity:0}30%{opacity:1}to{transform:translateY(-14px);opacity:0}}
.rsl{display:grid;gap:4px;padding:2px 6px}
.trk{position:relative;height:8px;border-radius:4px;background:color-mix(in srgb,var(--tx) 14%,transparent)}
.trk b{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--acc)}
.trk i{position:absolute;top:-3px;width:2px;height:14px;margin-left:-1px;background:color-mix(in srgb,var(--tx) 35%,transparent)}
.trk u{position:absolute;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:var(--tx);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 45%,transparent),0 4px 10px rgba(0,0,0,.35)}
.tlab{position:relative;height:14px}.tlab span{position:absolute;transform:translateX(-50%);font:600 10px var(--ui);color:var(--mut)}
.tlab span:first-child{transform:none}.tlab span:last-child{transform:translateX(-100%)}
.rpre{display:flex;gap:6px}.rpre span{flex:1;text-align:center;padding:10px 2px;border-radius:var(--r-btn,10px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);font:700 12.5px var(--ui);white-space:nowrap}
.rpre span.on{background:var(--acc);color:var(--acctx);box-shadow:none}
.rpre.g2{display:grid;grid-template-columns:1fr 1fr}
.racts{display:grid;grid-template-columns:1fr 1.7fr;gap:10px}.racts .bb{height:54px}.racts .go{font-size:16.5px}
.rsheet.allin .go{animation:glow 1.6s ease-in-out infinite}
@keyframes glow{50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--b-raise) 45%,transparent),0 0 24px color-mix(in srgb,var(--acc) 60%,transparent)}}
.rnote{margin:-4px 0 0;font-size:11.5px;color:var(--mut);text-align:center}
.rpad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.rpad span{height:44px;display:grid;place-items:center;border-radius:var(--r-btn,10px);background:var(--chipbg);font:var(--numw,600) 21px var(--num)}
.rsheet.cmp{gap:8px;padding-bottom:16px}.rsheet.cmp .pm{width:46px;height:46px}.rsheet.cmp .amt{font-size:34px}.rsheet.cmp .racts .bb{height:48px}.rsheet.cmp .rpre span{padding:8px 1px;font-size:11.5px}
.rdock{position:absolute;right:0;top:46px;bottom:0;width:284px;z-index:31;padding:10px 12px 12px;background:var(--bg);box-shadow:var(--panelsh,inset 1px 0 0 var(--line)),-12px 0 30px rgba(0,0,0,.35);display:grid;gap:9px;align-content:start;animation:slidein .35s cubic-bezier(.2,.8,.25,1) both}
@keyframes slidein{from{transform:translateX(30px);opacity:0}}
.rdock .pm{width:42px;height:42px}.rdock .amt{font-size:30px}.rdock .rpre span{padding:7px 2px;font-size:11.5px}.rdock .racts .bb{height:42px}
.rpop{position:absolute;right:360px;bottom:120px;z-index:31;width:470px;padding:16px 18px 18px;border-radius:var(--r-panel,18px);background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 24px 60px rgba(0,0,0,.55);display:grid;gap:12px;animation:pop3 .3s cubic-bezier(.2,.9,.3,1.1) both}
@keyframes pop3{from{transform:translateY(10px) scale(.97);opacity:0}}
.rpop .tail{position:absolute;right:56px;bottom:-9px;width:18px;height:18px;background:var(--bg);transform:rotate(45deg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.keys{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--mut)}.keys span{display:flex;align-items:center;gap:4px}
.racts .kbd{margin-left:6px;height:20px;min-width:20px;font-size:10.5px;background:rgba(0,0,0,.18);color:inherit}
.legend .lg2{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:var(--r-btn,10px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.legend .lg2 span{display:flex;gap:4px;min-width:96px}.legend .lg2 small{font-size:13px}
.legend .v3b{gap:7px}
.act small{opacity:1!important;font-weight:700}
.tp.lap .dock .rb{visibility:hidden}
'''
FIX = {  # per theme: where a button's text was too faint against its colour
    'ivory': '.th-ivory{--b-raise:#8f6436}',
    'cyber': '.th-cyber .act.raise small{color:#fff}',
    'edo': '.th-edo .act.call{color:#14203d}',
}

def build(th):
    r1 = ''.join([
        col('Phone · open', 'Raise, with − and +', 'The amount is big and in the middle, with − and + on either side: each tap is one big blind. The slider has marks at ½ pot and pot; the presets jump straight there.', phone(th, 650, '½ pot')),
        col('Phone · holding +', 'Hold to keep going', 'Holding + repeats and speeds up after a second. A small “+20” floats off each step so you can feel it count.', phone(th, 690, '', 'hold')),
        col('Phone · typing', 'Type an exact amount', 'Tap the number to type it. The presets swap for a number pad; anything above your stack becomes all-in.', phone(th, 1200, '', 'type')),
        col('Phone · all-in', 'All-in', 'At the top of the range + greys out and the button becomes “All-in 1,840” with a slow glow, so it never happens by accident.', phone(th, 1840, 'All-in')),
        col('Keyboard', 'Laptop keys', 'Every raise control has a key. Hints show on laptops only after a key was pressed.', legend(th)),
    ])
    r2 = ''.join([
        col('Small phone · 360 × 740', 'Short screens', 'The same sheet, tighter: smaller − and +, slimmer presets, the board still visible above it.', phone(th, 650, '½ pot', W=360, H=740), 360),
        col('Phone sideways · 844 × 390', 'Sideways', 'The raise panel replaces the thumb column on the right, so the table stays fully in view. Presets in a 2 × 2 grid.', land(th), 844),
        col('Laptop · 1440 × 900', 'Laptop', 'A popover above the Raise button, with the keys written in. ← → move by a big blind, ⇧ by five, ↑ ↓ jump between presets, ⏎ raises.', scaled(lap(th), 1440, 900, .62), 893),
    ])
    r3 = ''.join([
        col('Tablet · 820 × 1180', 'Tablet', 'The phone layout, drawn larger: the sheet keeps the same proportions and touch sizes grow with it.', scaled(phone(th, 975, '¾ pot', W=820, H=1180), 820, 1180, .62), 508),
        col('Readable buttons', 'Fold, Call, Raise', 'Every label and amount at full strength in the theme’s own button colours. Where a colour pair was too faint it was darkened just enough (ivory raise, cyber and edo amounts).', acts_fixed(th)),
    ])
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div><div class="v3row">{r3}</div>' + note(
        ('Steps', '− and + move by one big blind. Holding repeats every 120 ms, then every 60 ms after a second. Presets are ½ pot, ¾ pot and pot of the current pot.'),
        ('Limits', 'Never below the minimum raise, never above your stack. At the top, + disables and the button says All-in; typing more than you have also means all-in.'),
        ('Readable', 'Every button label and amount meets 4.5 : 1 contrast in all nine themes; a check in the test suite keeps it that way.'),
        ('Motion', 'Sheet rises 0.4 s; the amount rolls between values (0.15 s); + pulses a ring while held; the thumb snaps to presets with the theme’s easing; all-in glows slowly.'))
    return board(th, f'{th.key}-raise.dc.html', f'{th.name}: raising', 'Minus and plus, typing an exact amount, the slider and presets, on every screen size and with laptop keys. Plus the action buttons, made clearly readable in this theme.', body, 2300, 3000, CSS + FIX.get(th.key, ''))
