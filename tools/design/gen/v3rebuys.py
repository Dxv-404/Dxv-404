"""Rebuys: the host chooses how many and how big; players see what is left; going bust offers exactly what the rules allow."""
from v3kit import *

def setup(th, custom=False):
    amt = ('<div class="fld"><span>Chips per rebuy</span><div class="seg"><span>Starting chips · 1,000</span><span class="on">Custom</span></div>'
           '<div class="inp f"><span class="num">1,500</span><i class="caret"></i><span class="sp"></span><span class="mut" style="font-size:12px">chips</span></div>'
           '<small class="mut" style="font-size:11.5px">Between 200 (20 big blinds) and 10,000</small></div>') if custom else (
           '<div class="fld"><span>Chips per rebuy</span><div class="seg"><span class="on">Starting chips · 1,000</span><span>Custom</span></div></div>')
    n = '<span>1</span><span class="on">2</span><span>3</span><span>No limit</span>' if not custom else '<span>1</span><span>2</span><span class="on">3</span><span>No limit</span>'
    summ = ('Everyone can rebuy <b>3 times</b>, <b>1,500 chips</b> each, once they are out of chips. Rebuys close after <b>level 6</b>.' if custom else
            'Everyone can rebuy <b>twice</b>, <b>1,000 chips</b> each, once they are out of chips. Rebuys stay open all night.')
    inner = (head('Open a table', 'Online · anyone with the code')
             + '<div class="pnl"><div class="hrow"><div class="txt"><b style="font:var(--dspw,700) 16px var(--dsp)">Chips and blinds</b><small>1,000 chips · blinds 10/20 · up every 20 min</small></div><span class="acc" style="font:700 12.5px var(--ui)">Edit</span></div></div>'
             + '<div class="pnl rbp"><div class="swrow"><span><b style="font:var(--dspw,700) 17px var(--dsp)">Rebuys</b><small>Only when a player is out of chips</small></span><span class="sw on"></span></div>'
             f'<div class="fld"><span>Rebuys per player</span><div class="seg">{n}</div></div>' + amt
             + '<div class="fld"><span>Rebuys close</span><div class="seg"><span' + ('' if custom else ' class="on"') + '>Never</span><span>After level 4</span><span' + (' class="on"' if custom else '') + '>After level 6</span></div></div>'
             f'<div class="sum">{ic("check")}<span>{summ}</span></div></div>'
             + '<div class="pnl"><div class="hrow"><div class="txt"><b style="font:var(--dspw,700) 16px var(--dsp)">Table</b><small>9 seats · 20 s to act · crew: Friday Night Table</small></div><span class="acc" style="font:700 12.5px var(--ui)">Edit</span></div></div>'
             + '<div class="bb p" style="margin-top:auto;margin-bottom:22px">Open the table</div>')
    return screen(th, inner)

def lap_setup(th):
    c1 = ('<div class="pnl"><b class="lt2">Chips and blinds</b><div class="fld"><span>Starting chips</span><div class="inp">1,000</div></div>'
          '<div class="two"><div class="fld"><span>Small blind</span><div class="inp">10</div></div><div class="fld"><span>Big blind</span><div class="inp">20</div></div></div>'
          '<div class="fld"><span>Blinds go up</span><div class="seg"><span>Never</span><span class="on">20 min</span><span>10 hands</span></div></div></div>')
    c2 = ('<div class="pnl rbp"><div class="swrow"><span><b class="lt2">Rebuys</b><small>Only when a player is out of chips</small></span><span class="sw on"></span></div>'
          '<div class="fld"><span>Rebuys per player</span><div class="seg"><span>1</span><span class="on">2</span><span>3</span><span>No limit</span></div></div>'
          '<div class="fld"><span>Chips per rebuy</span><div class="seg"><span class="on">Starting chips · 1,000</span><span>Custom</span></div></div>'
          '<div class="fld"><span>Rebuys close</span><div class="seg"><span class="on">Never</span><span>Level 4</span><span>Level 6</span></div></div>'
          f'<div class="sum">{ic("check")}<span>Everyone can rebuy <b>twice</b>, <b>1,000 chips</b> each, once they are out of chips.</span></div></div>')
    c3 = ('<div class="pnl"><b class="lt2">Table</b><div class="fld"><span>Seats</span><div class="seg"><span>6</span><span class="on">9</span><span>12</span><span>15</span></div></div>'
          '<div class="fld"><span>Time to act</span><div class="seg"><span>No limit</span><span class="on">20 s</span><span>30 s</span></div></div>'
          f'<div class="fld"><span>Crew table</span><div class="inp">{emblem(FNT, 24)} Friday Night Table</div></div></div>')
    dlg = (f'<div class="ldlg wide"><div class="hrow"><b class="lt">Open a table</b><span class="chipt">Online</span><span class="sp"></span><span class="ib">✕</span></div>'
           f'<div class="three3">{c1}{c2}{c3}</div><div class="hrow"><span class="mut" style="font-size:13px">Friends join with code QK7P or the link</span><span class="sp"></span><span class="bb p" style="width:260px">Open the table</span></div></div>')
    return scaled(f'<div class="tp v3s th-{th.key}" style="width:1440px;height:900px"><div class="fx" aria-hidden="true">{th.bg("lap")}</div><div class="kdim" style="z-index:3"></div>{dlg}</div>', 1440, 900, .62)

def tablef(th, overlay='', hint=('Rebuys left 2 of 3', '1,000 chips each'), acts=None, stack_txt=None):
    body = phone_body(th, bubble=False, hero_hint=hint, actions=acts)
    if stack_txt: body = body.replace('<span class="hstack">1,840</span>', f'<span class="hstack">{stack_txt}</span>')
    return f'<div class="tp phone dense th-{th.key}" style="width:390px;height:844px">{body}{overlay}</div>'

def rules_sheet(th):
    rows = [('Chips', '1,000 to start'), ('Blinds', '10/20, up every 20 min · level 3 now'), ('Rebuys', '2 each, 1,000 chips, when out of chips'), ('You', '1 rebuy used · 1 left'),
            ('Time to act', '20 seconds'), ('Crew', 'Friday Night Table · counts for Season 3')]
    r = ''.join(f'<div class="rr"><span class="mut">{a}</span><b>{b}</b></div>' for a, b in rows)
    sheet = f'<div class="bsheet" style="z-index:41"><span class="grip"></span><b style="font:var(--dspw,700) 20px var(--dsp)">Table rules</b>{r}<div class="bb g">Close</div></div>'
    return tablef(th, '<div class="kdim" style="z-index:40"></div>' + sheet)

def bust(th, left=True):
    if left:
        sheet = ('<div class="bsheet bust" style="z-index:41"><span class="grip"></span><div class="bico">0</div><b class="bt">You’re out of chips</b>'
                 '<p class="mut">You finished hand 31 with nothing left. You have <b class="acc">2 rebuys</b> left tonight.</p>'
                 '<div class="bb r">Rebuy 1,000<small>2 of 2 left · you’re dealt in next hand</small></div>'
                 '<div class="two"><span class="bb g">Watch</span><span class="bb g">Leave table</span></div>'
                 '<div class="tmr"><i style="--d:12s"></i><span>Decide before the next hand or you sit it out</span></div></div>')
    else:
        sheet = ('<div class="bsheet bust" style="z-index:41"><span class="grip"></span><div class="bico">6<small>th</small></div><b class="bt">That’s your night</b>'
                 '<p class="mut">You’re out of chips and out of rebuys. You finished <b class="acc">6th of 8</b>; it’s in the league already.</p>'
                 '<div class="pnl" style="gap:4px;font-size:12.5px"><div class="rr"><span class="mut">Bought in</span><b>3,000</b></div><div class="rr"><span class="mut">Biggest pot won</span><b>1,240</b></div></div>'
                 '<div class="two"><span class="bb p">Keep watching</span><span class="bb g">Leave table</span></div></div>')
    return tablef(th, '<div class="kdim" style="z-index:40"></div>' + sheet, hint=('Out of chips', 'Rebuy or watch'), acts='<button class="act ghost">Out of chips</button>', stack_txt='0')

def rebought(th):
    chips = ''.join(f'<svg class="chip pour" viewBox="0 0 24 24" style="left:{150 + (k % 3) * 12}px;animation-delay:{k * .09:.2f}s"><use href="#ch-{"ab"[k % 2]}"/></svg>' for k in range(9))
    return tablef(th, f'<div class="pourw">{chips}</div><div class="toast" style="top:64px;z-index:45">{ic("check")}Rebuy 1 of 2 · 1,000 chips. You’re in next hand.</div>',
                  hint=('Rebuys left 1 of 2', 'In next hand'), acts='<button class="act ghost">Waiting for the next hand</button>', stack_txt='<span class="cnt">1,000</span>')

def closed(th):
    sheet = ('<div class="bsheet bust" style="z-index:41"><span class="grip"></span><div class="bico">⏱</div><b class="bt">Rebuys have closed</b>'
             '<p class="mut">The host closed rebuys after level 6, and the table is on level 7. You finished <b class="acc">5th of 8</b>.</p>'
             '<div class="two"><span class="bb p">Keep watching</span><span class="bb g">Leave table</span></div></div>')
    return tablef(th, '<div class="kdim" style="z-index:40"></div>' + sheet, hint=('Out of chips', ''), acts='<button class="act ghost">Out of chips</button>', stack_txt='0')

CSS = r'''
.rbp{box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),inset 0 0 0 1.5px var(--acc)}
.sum{display:flex;gap:9px;align-items:flex-start;padding:10px 11px;border-radius:var(--r-btn,10px);background:color-mix(in srgb,var(--acc) 14%,transparent);font-size:12.5px;line-height:1.45}
.sum .ico{color:var(--acc);margin-top:1px}
.num{font:var(--numw,700) 18px var(--num)}
.lt2{font:var(--dspw,700) 18px var(--dsp)}
.ldlg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;padding:30px;border-radius:var(--r-panel,20px);background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 30px 80px rgba(0,0,0,.6);display:grid;gap:18px}
.ldlg.wide{width:1180px}.ldlg .lt{font:var(--dspw,700) 28px var(--dsp)}
.three3{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:16px;align-items:start}
.rr{display:flex;justify-content:space-between;gap:12px;padding:8px 0;box-shadow:inset 0 -1px 0 var(--line);font-size:13.5px}.rr b{font-weight:700;text-align:right}
.bust{justify-items:center;text-align:center}.bust .bb{width:100%}.bust .two,.bust .pnl{width:100%;box-sizing:border-box}.bust p{margin:0;font-size:13.5px;line-height:1.5}
.bico{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;font:var(--numw,700) 34px var(--num);background:var(--chipbg);box-shadow:inset 0 0 0 2px var(--line);animation:pop .5s both}
.bico small{font-size:13px}.bt{font:var(--dspw,700) 24px var(--dsp)}
.tmr{width:100%;display:grid;gap:5px;font-size:11.5px;color:var(--mut)}.tmr i{height:4px;border-radius:2px;background:var(--acc);animation:tmr var(--d) linear infinite;transform-origin:left}
@keyframes tmr{to{transform:scaleX(0)}}
.pourw{position:absolute;left:0;right:0;bottom:200px;height:200px;z-index:44;pointer-events:none}
.pour{position:absolute;top:0;width:26px;height:26px;animation:pour 1.8s cubic-bezier(.4,0,.6,1) infinite;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
@keyframes pour{0%{transform:translate(60px,-40px);opacity:0}20%{opacity:1}70%{transform:translate(0,150px);opacity:1}100%{transform:translate(0,150px);opacity:0}}
.cnt{display:inline-block;animation:cnt 1.8s steps(1) infinite}
@keyframes cnt{0%{opacity:.4}40%{opacity:1}}
'''

def build(th):
    r1 = ''.join([
        col('Host · rebuys', 'Rebuy controls when hosting', 'A Rebuys block on the Open a table screen: how many per player, how many chips each, and when they close. A plain sentence underneath says exactly what the players will get.', setup(th)),
        col('Host · custom amount', 'A custom rebuy size', 'Pick Custom to type the chips per rebuy. The allowed range is shown under the box; the sentence updates as you type.', setup(th, True)),
        col('At the table', 'What is left, always visible', 'Under your stack: rebuys left and their size. The table menu’s Table rules list everything the host chose, plus what you have used.', rules_sheet(th)),
        col('Bust-out · rebuys left', 'Out of chips, with rebuys', 'Right after the bust-out scene: rebuy (with how many are left), watch, or leave. A bar runs down to the next deal; if it empties you sit that hand out.', bust(th)),
    ])
    r2 = ''.join([
        col('Rebought', 'Back in', 'Chips pour into your stack and it counts up to 1,000; a toast confirms which rebuy that was. You’re dealt in on the next hand.', rebought(th)),
        col('Bust-out · none left', 'Out of rebuys', 'No rebuy button at all. Your finishing place and night in numbers; watching is the main choice because friends like an audience.', bust(th, False)),
        col('Bust-out · closed', 'Rebuys closed', 'When the host closed rebuys after a blind level, the sheet says so and why.', closed(th)),
        col('Laptop · host', 'Hosting on a laptop', 'All of setup in one dialog with three columns, Rebuys in the middle and outlined, so nothing hides below the fold.', lap_setup(th), 893),
    ])
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div>' + note(
        ('Rule', 'A rebuy is only offered at 0 chips, between hands. No top-ups. Rebuys per player: 1, 2, 3 or no limit; chips per rebuy: the starting stack or a custom number.'),
        ('Everywhere', 'Online tables, the offline host app and QR mode all use the same controls and rules. Crews save their rules as the default for crew tables.'),
        ('League', 'Every rebuy counts as money in, so the league stays fair however big the rebuys are.'),
        ('Motion', 'Bust-out sheet rises after the scene; the next-deal bar drains to the deal; chips pour 1.8 s with the stack counting up; the toast leaves after 4 s.'))
    return board(th, f'{th.key}-rebuys.dc.html', f'{th.name}: rebuys', 'How the host sets the number and size of rebuys, how players always know what is left, and what happens the moment someone runs out of chips.', body, 2480, 2160, CSS)
