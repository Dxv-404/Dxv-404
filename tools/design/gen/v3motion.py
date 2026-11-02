"""Every new animation and micro-animation, playing live in the theme's own feel (its easing and speed from the v2 motion rules)."""
from v3kit import *

DEMOS = [
    # (title, trigger, base duration s, description, demo html)
    ('Tab underline', 'Switching Crews tabs or the bottom bar', .45,
     'The underline grows from the middle of the new tab; the old one fades.', '<div class="d-tabs"><span>Home</span><span>League</span><span>Games</span><span>Members</span><i></i></div>'),
    ('Cards arrive', 'Opening the Crews tab', .5,
     'Crew cards rise 14 px and fade in, 60 ms apart.', '<div class="d-list"><i></i><i></i><i></i></div>'),
    ('LIVE', 'A crew table is running', 1.4,
     'The dot breathes; nothing else on the card moves.', '<div class="d-live"><span class="klive">LIVE</span></div>'),
    ('Badge stamp', 'Crew made, or invitation opened', .7,
     'The badge drops from 2× with a tilt and lands with a small overshoot.', 'EMB'),
    ('Confetti', 'Crew made', 2.6,
     'Theme-coloured pieces fall once across the screen.', '<div class="d-conf">' + ''.join(f'<i style="left:{k*23+6}px;animation-delay:{-(k*.31)%2.6:.2f}s"></i>' for k in range(12)) + '</div>'),
    ('Request approved', 'A leader taps ✓', .5,
     'The row turns green, ticks, then slides up into the member list.', '<div class="d-req"><span class="txt"><b>Rohan</b><small>wants to join</small></span><span class="ok">✓</span></div>'),
    ('Wrong code', 'A crew or device code does not match', .42,
     'One shake, the boxes go the theme’s red, then calm.', '<div class="kslots err d-k"><span>F</span><span>N</span><span>T</span><span>9</span></div>'),
    ('Digits flip in', 'A code appears', .5,
     'Each digit flips down into place, 60 ms after the last.', '<div class="digits d-dig"><span>4</span><span>8</span><span>2</span><i></i><span>9</span><span>1</span><span>3</span></div>'),
    ('Ring drains', 'A one-time code is showing', 300,
     'The ring empties over the code’s life; it turns red for the last 30 seconds (sped up here).', '<div class="ring d-ring" style="--rs:96px"><b>4:52</b></div>'),
    ('Scan line', 'Showing a QR', 2.4,
     'A thin line sweeps the QR so it reads as “waiting to be scanned”.', 'QR'),
    ('Devices join', 'A device signs in', 1.2,
     'Dots travel from one device to the other; the new one slides in.', '<div class="d-dev"><span>' + ICON['laptop'] + '</span><em><i></i><i></i><i></i></em><span class="n">' + ICON['phone'] + '</span></div>'),
    ('− / + tick', 'Changing a raise', .15,
     'The number rolls to the next value; +20 floats off; a held button pulses a ring.', '<div class="d-pm"><span class="pm">−</span><b><em>650</em><em>670</em><em>690</em></b><span class="pm on">+</span></div>'),
    ('Slider snap', 'Tapping a preset', .3,
     'The thumb glides to the preset’s mark with the theme’s easing.', '<div class="d-sl"><div class="trk"><b></b><u></u></div><div class="d-pre"><span>½</span><span>Pot</span><span>All</span></div></div>'),
    ('All-in glow', 'The raise reaches your stack', 1.6,
     'A slow glow so all-in is unmistakable; it never flashes.', '<div class="d-ai"><span class="bb r">All-in 1,840</span></div>'),
    ('Chips pour', 'A rebuy', 1.8,
     'Chips drop into your stack; the number counts up to the rebuy.', 'POUR'),
    ('Next-deal bar', 'Bust-out sheet, results', 5,
     'A thin bar drains to the next deal so nobody wonders how long they have.', '<div class="d-bar"><i></i><small>Next hand in 5</small></div>'),
    ('Winner card', 'End of a win scene', .6,
     'The winner card rises in 1 s after the scene starts, with the theme’s easing.', 'WIN'),
    ('Reveal flip', 'Showdown', .45,
     'The winner flips first; everyone else 0.6 s later, 80 ms apart.', 'FLIP'),
    ('Best five lift', 'Showdown', .5,
     'The five cards that made the hand rise 5 px with the theme’s glow; the others dim.', 'BEST'),
    ('Podium', 'League tab', 2.4,
     'The leader bobs gently; when ranks change, rows slide to their new place.', 'POD'),
]

def demo_html(th, html):
    if html == 'EMB': return f'<div class="d-emb">{emblem(HOS, 70, "stampx")}</div>'
    if html == 'QR': return f'<div class="d-qr"><div class="scanl"></div>{qr("demo", 21, 4)}</div>'
    if html == 'POUR': return '<div class="d-pour">' + ''.join(f'<svg class="chip" viewBox="0 0 24 24" style="animation-delay:{k*.1:.1f}s;left:{40 + (k%3)*10}px"><use href="#ch-{"ab"[k%2]}"/></svg>' for k in range(6)) + '<b class="cnt2">1,000</b></div>'
    if html == 'WIN': return f'<div class="d-win"><div class="wsx">{av(th, P[7], 32)}<b>Riya wins 1,300</b></div></div>'
    if html == 'FLIP': return '<div class="d-flip">' + ''.join(f'<div class="fl {"w" if k < 2 else "l"}" style="--d:{0 if k < 2 else .6 + (k-2)*.08:.2f}s">{card(c, 38)}{back(38)}</div>' for k, c in enumerate(['Kh', '7d', 'Ah', 'Kd'])) + '</div>'
    if html == 'BEST': return '<div class="d-best">' + ''.join(card(c, 34, 'bw' if c in ('Ks', '7h', 'Kc') else 'bl') for c in ['Ks', '7h', '2d', 'Kc', '9h']) + '</div>'
    if html == 'POD': return '<div class="podium d-pod">' + ''.join(f'<div class="pd p{r}">{av(th, p, 30 if r == 1 else 26)}<i>{r}</i></div>' for r, p in [(2, P[0]), (1, P[3]), (3, P[7])]) + '</div>'
    return html

CSS = r'''
.mgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}
.mt{display:grid;gap:8px;padding:14px;border-radius:var(--r-panel,14px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.mt .hd{display:flex;align-items:baseline;gap:8px}.mt .hd b{font:var(--dspw,700) 16px var(--dsp)}.mt .hd span{margin-left:auto;font:var(--numw,700) 12px var(--num);color:var(--acc);white-space:nowrap}
.mt small{font-size:11.5px;color:var(--mut);line-height:1.4}.mt .tr{font:700 10.5px var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.stage{height:150px;border-radius:calc(var(--r-panel,14px) * .7);background:var(--bg);box-shadow:inset 0 0 0 1px var(--line);display:grid;place-items:center;position:relative;overflow:hidden}
.stage *{animation-timing-function:var(--ease)!important}
.d-tabs{position:relative;display:flex;gap:14px;font:700 12px var(--ui);color:var(--mut);padding-bottom:8px}.d-tabs span:nth-child(2){color:var(--tx)}
.d-tabs i{position:absolute;bottom:0;height:3px;border-radius:2px;background:var(--acc);animation:dtab calc(2.4s * var(--k)) infinite}
@keyframes dtab{0%,15%{left:0;width:38px}35%,60%{left:52px;width:52px}80%,100%{left:118px;width:44px}}
.d-list{display:grid;gap:8px;width:200px}.d-list i{height:30px;border-radius:8px;background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);animation:dli calc(2.2s * var(--k)) infinite both}
.d-list i:nth-child(2){animation-delay:.06s}.d-list i:nth-child(3){animation-delay:.12s}
@keyframes dli{0%{transform:translateY(14px);opacity:0}25%,100%{transform:none;opacity:1}}
.d-emb .stampx{animation:stamp calc(1.8s * var(--k)) infinite both}
@keyframes stamp{0%{transform:scale(2.2) rotate(-14deg);opacity:0}40%{transform:scale(.94);opacity:1}55%,100%{transform:none;opacity:1}}
.d-conf{position:absolute;inset:0}.d-conf i{position:absolute;top:-14px;width:7px;height:12px;border-radius:2px;background:var(--acc);animation:dconf calc(2.6s * var(--k)) linear infinite}.d-conf i:nth-child(3n){background:#2f6fd6}.d-conf i:nth-child(3n+1){background:#c0392b}
@keyframes dconf{to{transform:translateY(170px) rotate(540deg)}}
.d-req{display:flex;align-items:center;gap:10px;width:210px;padding:10px 12px;border-radius:10px;background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);animation:dreq calc(2.6s * var(--k)) infinite}
.d-req .txt b{font:700 13px var(--ui)}.d-req .txt small{font-size:11px;color:var(--mut)}.d-req .ok{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--b-call);color:var(--b-calltx);font-weight:800}
@keyframes dreq{0%,30%{transform:none;box-shadow:inset 0 0 0 1px var(--line)}40%,60%{box-shadow:inset 0 0 0 2px #3fbf7f}80%{transform:translateY(-40px);opacity:0}100%{opacity:0}}
.d-k{width:210px}.d-k span{height:46px;font-size:22px}.kslots.err.d-k span{animation:shake calc(.42s * var(--k)) infinite;animation-iteration-count:infinite}
@keyframes shake{0%,40%,100%{transform:none}8%{transform:translateX(-6px)}16%{transform:translateX(5px)}24%{transform:translateX(-3px)}32%{transform:translateX(2px)}}
.d-dig span{animation:dig calc(2.2s * var(--k)) infinite both}
@keyframes dig{0%{transform:rotateX(90deg);opacity:0}20%,100%{transform:none;opacity:1}}
.d-ring{animation:ringd2 calc(6s * var(--k)) linear infinite}.d-ring b{font:var(--numw,700) 18px var(--num)}
@keyframes ringd2{from{--p:1}85%{background:conic-gradient(var(--acc) calc(var(--p) * 360deg),color-mix(in srgb,var(--tx) 12%,transparent) 0)}to{--p:0}}
.d-qr{position:relative;padding:6px;background:#fff;border-radius:10px;overflow:hidden}.scanl{position:absolute;left:0;right:0;height:3px;background:var(--acc);box-shadow:0 0 10px var(--acc);animation:scan calc(2.4s * var(--k)) infinite;z-index:2}
@keyframes scan{0%,100%{top:6%}50%{top:90%}}
.d-dev{display:flex;align-items:center;gap:10px}.d-dev>span{width:46px;height:46px;display:grid;place-items:center;border-radius:12px;background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--acc)}.d-dev svg{width:26px;height:26px}
.d-dev em{display:flex;gap:6px}.d-dev em i{width:8px;height:8px;border-radius:50%;background:var(--acc);animation:wire calc(1.2s * var(--k)) infinite}.d-dev em i:nth-child(2){animation-delay:.2s}.d-dev em i:nth-child(3){animation-delay:.4s}
@keyframes wire{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:none}}
.d-dev .n{animation:land calc(2.4s * var(--k)) infinite both}@keyframes land{0%{transform:translateX(-30px);opacity:0}30%,100%{transform:none;opacity:1}}
.d-pm{display:flex;align-items:center;gap:14px}.d-pm .pm{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--chipbg);box-shadow:inset 0 0 0 1.5px var(--line);font:800 20px var(--ui)}
.d-pm .pm.on{animation:pmp calc(.9s * var(--k)) infinite;box-shadow:inset 0 0 0 2px var(--acc)}@keyframes pmp{50%{transform:scale(.9)}}
.d-pm b{height:36px;overflow:hidden;display:grid;font:var(--numw,700) 30px/36px var(--num)}.d-pm b em{font-style:normal;animation:roll calc(1.8s * var(--k)) infinite}
@keyframes roll{0%,25%{transform:translateY(0)}33%,58%{transform:translateY(-36px)}66%,100%{transform:translateY(-72px)}}
.d-sl{width:220px;display:grid;gap:10px}.d-sl .trk{position:relative;height:8px;border-radius:4px;background:color-mix(in srgb,var(--tx) 14%,transparent)}
.d-sl .trk b{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--acc);animation:slw calc(3s * var(--k)) infinite}
.d-sl .trk u{position:absolute;top:50%;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:var(--tx);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 45%,transparent);animation:sll calc(3s * var(--k)) infinite}
@keyframes slw{0%,20%{width:25%}33%,53%{width:62%}66%,100%{width:100%}}@keyframes sll{0%,20%{left:25%}33%,53%{left:62%}66%,100%{left:100%}}
.d-pre{display:flex;justify-content:space-between;font:700 11px var(--ui);color:var(--mut)}
.d-ai .bb{animation:glow calc(1.6s * var(--k)) infinite;width:180px}
@keyframes glow{50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 45%,transparent),0 0 24px color-mix(in srgb,var(--acc) 60%,transparent)}}
.d-pour{position:relative;width:160px;height:130px}.d-pour .chip{position:absolute;top:0;width:24px;height:24px;animation:pour calc(1.8s * var(--k)) infinite}.d-pour .cnt2{position:absolute;left:0;right:0;bottom:4px;text-align:center;font:var(--numw,700) 22px var(--num)}
@keyframes pour{0%{transform:translate(40px,-20px);opacity:0}20%{opacity:1}70%,100%{transform:translate(0,80px);opacity:0}}
.d-bar{width:220px;display:grid;gap:6px}.d-bar i{height:5px;border-radius:3px;background:var(--acc);transform-origin:left;animation:tmr calc(5s * var(--k)) linear infinite}.d-bar small{font-size:11.5px;color:var(--mut);text-align:center}
@keyframes tmr{to{transform:scaleX(0)}}
.d-win{position:absolute;inset:0;display:grid;align-items:end;padding:12px}.wsx{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:var(--chipbg);box-shadow:0 0 0 1.5px var(--acc);animation:wsx calc(2.6s * var(--k)) infinite both}.wsx b{font:var(--dspw,700) 16px var(--dsp)}
@keyframes wsx{0%,20%{transform:translateY(40px);opacity:0}45%,90%{transform:none;opacity:1}100%{opacity:0}}
.d-flip{display:flex;gap:10px}.fl{position:relative;width:38px;height:53px;perspective:300px}.fl>.cd{position:absolute;inset:0;backface-visibility:hidden}
.fl>.cd:not(.dn){animation:ff calc(3s * var(--k)) infinite both;animation-delay:var(--d)}.fl>.cd.dn{animation:fb calc(3s * var(--k)) infinite both;animation-delay:var(--d)}
.fl.l>.cd:not(.dn){filter:brightness(.8)}
@keyframes ff{0%,10%{transform:rotateY(180deg)}25%,90%{transform:none}100%{transform:rotateY(180deg)}}@keyframes fb{0%,10%{transform:none}25%,90%{transform:rotateY(-180deg)}100%{transform:none}}
.d-best{display:flex;gap:5px}.d-best .bw{animation:bw calc(2.4s * var(--k)) infinite}.d-best .bl{animation:bl calc(2.4s * var(--k)) infinite}
@keyframes bw{0%,20%{transform:none;box-shadow:none}40%,90%{transform:translateY(-6px);box-shadow:var(--winsh)}}@keyframes bl{0%,20%{filter:none}40%,90%{filter:brightness(.5) saturate(.5)}}
.d-pod{width:200px}.podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:end;gap:6px}.pd{display:grid;justify-items:center;gap:3px}.pd i{font-style:normal;display:grid;place-items:center;width:100%;border-radius:6px 6px 0 0;font:var(--numw,800) 13px var(--num);background:color-mix(in srgb,var(--acc) 25%,transparent)}
.pd.p1 i{height:36px}.pd.p2 i{height:24px}.pd.p3 i{height:16px}.d-pod .pd.p1 .av{animation:bob calc(2.4s * var(--k)) infinite}@keyframes bob{50%{transform:translateY(-5px)}}
.feel{display:flex;gap:16px;align-items:center;padding:16px 18px;border-radius:var(--r-panel,14px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.feel b{font:var(--dspw,700) 18px var(--dsp)}.feel span{font-size:13px;color:var(--mut);line-height:1.5}
.feel code{font:600 12px var(--num);padding:3px 8px;border-radius:6px;background:var(--chipbg);color:var(--acc);white-space:nowrap}
'''

def build(th):
    ease, k, txt = FEEL[th.key]
    tiles = ''.join(f'<div class="mt"><div class="hd"><b>{t}</b><span>{(round(d * k, 2) if d < 100 else d):g} s</span></div><span class="tr">{trg}</span>'
                    f'<div class="stage">{demo_html(th, h)}</div><small>{desc}</small></div>' for t, trg, d, desc, h in DEMOS)
    head_ = (f'<div class="feel"><b>{th.name}’s feel</b><span>{txt}</span><span class="sp"></span><code>easing {ease}</code><code>speed × {k:g}</code></div>')
    body = head_ + f'<div class="mgrid" style="--ease:{ease};--k:{k}">{tiles}</div>' + note(
        ('One feel per theme', 'Every new animation uses the theme’s easing and speed from the v2 motion rules, so crews, raising and results move like the rest of the table.'),
        ('Never in the way', 'Animations never block a tap. Anything longer than 0.5 s can be skipped by tapping; your turn always cuts in.'),
        ('Calm and Off', 'Calm keeps the meaning and drops the flourishes (no confetti, no bob, no floaters). Off and reduced motion show the end state at once.'),
        ('Performance', 'Only transform and opacity animate, so the moves run on the graphics chip; long loops (LIVE, ring) are tiny and pause when the app is hidden.'))
    return board(th, f'{th.key}-motion3.dc.html', f'{th.name}: animations for crews, devices, raising and results', 'Each new animation and micro-animation playing live in this theme’s own feel. Timings shown are already scaled to the theme’s speed.', body, 1900, 1600, CSS)
