"""Crews and the crew page on every screen size: small, regular and large phones, sideways, tablet, laptop and desktop."""
from v3kit import *
import v3crews, v3crew

RAIL = [('play', '♠', 'Play'), ('crews', '⬢', 'Crews'), ('replays', '↺', 'Replays'), ('theme', '◐', 'Theme')]

def rail(th, wide=True):
    items = ''.join(f'<span class="{"on" if k == "crews" else ""}"><i>{i}</i>{t if wide else ""}</span>' for k, i, t in RAIL)
    me = f'<span class="rme">{av(th, ME, 34, "menu")}{"<b>Dev</b>" if wide else ""}</span>'
    return f'<nav class="rail{" w" if wide else ""}"><div class="rlogo">{th.logo("menu") if wide else ""}</div>{items}<span class="sp"></span>{me}</nav>'

def crew_list_col(th, sel=True):
    live = ('QK7P', 6, '9:12 pm', '10/20')
    return ('<div class="clist"><div class="hrow"><b class="ct">Crews</b><span class="sp"></span><span class="ib">' + ICON['plus'] + '</span></div>'
            + v3crews.crew_card(th, FNT, 'member', '4th', '<span class="chipt">Next: Fri 9 pm</span>', live).replace('class="ccard"', 'class="ccard sel"' if sel else 'class="ccard"')
            + v3crews.crew_card(th, HOS, 'leader', '1st', '<span class="chipt o">2 requests</span>')
            + f'<div class="row invite">{emblem(OFF, 32)}<span class="txt"><b>Office Fridays</b><small>Arjun invited you</small></span><span class="bb p sm">View</span></div>'
            + '<div class="two"><span class="bb s sm hz">' + ic('plus') + 'Create</span><span class="bb s sm hz">' + ic('link') + 'Join</span></div></div>')

def league_block(th, n=10):
    rows = ''
    for r, p, v, g, t in STAND[:n]:
        me = ' me' if p is ME else ''
        tr = f'<span class="trend {"tu" if t == "up" else "td"}">{ICON["up"] if t == "up" else ICON["down"]}</span>' if t else '<span class="trend"></span>'
        rows += (f'<div class="lrow{me}"><span class="n">{r}</span>{av(th, p, 30)}<b>{p["n"]}{" (you)" if me else ""}</b>{tr}<span class="g">{g}</span>'
                 f'<span class="v {"tu" if v.startswith("+") else "td"}">{v}</span></div>')
    return ('<div class="pnl"><div class="hrow"><b class="ttl">League · Season 3</b><span class="sp"></span><div class="seg" style="width:250px"><span class="on">Season 3</span><span>Season 2</span><span>All-time</span></div></div>'
            '<div class="lhead"><span>#</span><span style="flex:1;padding-left:40px">Player</span><span>Games</span><span style="width:58px;text-align:right">Won (bb)</span></div>'
            f'<div class="ltable">{rows}</div></div>')

def side_cards(th):
    live = ('<div class="pnl lvc"><div class="hrow"><span class="klive">LIVE</span><b style="font:700 14px var(--ui)">Table QK7P</b><span class="sp"></span><span class="mut" style="font-size:12px">since 9:12 pm</span></div>'
            f'<div class="hrow">{stack(th, [P[3], P[0], P[7], P[8], P[2], P[6]], 30)}<span class="mut" style="font-size:12px">6 playing · 2 seats free</span></div><div class="bb p">Join the table</div></div>')
    mine = ('<div class="pnl"><span class="klbl">Your season</span><div class="hrow"><div class="rk"><b>4th</b><small>of 13</small></div><div class="nb"><b class="tu">+96 bb</b><small>12 games</small></div>'
            f'<span class="sp"></span><span class="acc">{v3crew.spark([0, 12, 8, 30, 22, 61, 54, 96])}</span></div></div>')
    return live + mine

def games_block(th):
    g = [('Fri 31 Oct', 'QK7P · 8 players', P[3], '+184', '+22'), ('Fri 24 Oct', 'J2RM · 7 players', P[0], '+150', '−40'), ('Tue 21 Oct', 'Offline · 5 players', ME, '+88', '+88'),
         ('Fri 17 Oct', 'P8WD · 9 players', P[8], '+210', '+12')]
    rows = ''.join(f'<div class="grow"><div class="txt"><b>{d}</b><small>{s}</small></div><div class="win">{av(th, w, 24)}<span>{wn}</span></div><span class="me {"tu" if m.startswith("+") else "td"}">{m}</span></div>' for d, s, w, wn, m in g)
    return f'<div class="pnl"><div class="hrow"><b class="ttl">Games</b><span class="sp"></span><span class="acc" style="font:700 12.5px var(--ui)">All 41 ›</span></div><div class="glist">{rows}</div></div>'

def members_block(th):
    ms = [(P[3], 'Leader', 'a'), (P[0], 'Admin', 'o'), (P[7], '', ''), (ME, '', ''), (P[2], '', ''), (P[8], '', '')]
    rows = ''.join(f'<div class="hrow mrow">{av(th, p, 32)}<span class="txt"><b>{p["n"]}</b></span>{f"<span class=chipt.{c}>{r}</span>".replace("chipt.", "chipt ") if r else ""}</div>' for p, r, c in ms)
    return f'<div class="pnl"><div class="hrow"><b class="ttl">Members · 13</b><span class="sp"></span><span class="bb s sm hz">{ic("plus")}Invite</span></div><div class="mlist">{rows}</div></div>'

def crew_main(th, cols=2):
    hdr = (f'<div class="cmh">{emblem(FNT, 64)}<div class="txt"><b>Friday Night Table</b><small>13 members · Season 3 · ends in 12 days · led by Meera</small></div><span class="sp"></span>'
           f'<span class="bb s sm hz">{ic("share")}Invite</span><span class="ib">{ICON["more"]}</span></div>'
           '<div class="ktabs"><span class="on">Overview</span><span>League</span><span>Games</span><span>Members</span><span>Trophies</span></div>')
    if cols == 3:
        grid = f'<div class="cgrid c3"><div class="cc">{league_block(th)}</div><div class="cc">{side_cards(th)}{games_block(th)}</div><div class="cc">{members_block(th)}</div></div>'
    else:
        grid = f'<div class="cgrid c2"><div class="cc">{league_block(th, 8)}</div><div class="cc">{side_cards(th)}{games_block(th)}</div></div>'
    return f'<div class="cmain">{hdr}{grid}</div>'

def big(th, W, H, cols, s):
    inner = (f'<div class="tp v3s bigs th-{th.key}" style="width:{W}px;height:{H}px"><div class="fx" aria-hidden="true">{th.bg("lap")}</div>'
             f'<div class="lay">{rail(th)}{crew_list_col(th)}{crew_main(th, cols)}</div></div>')
    return scaled(inner, W, H, s)

def tablet(th):
    inner = (f'<div class="tp v3s bigs tab th-{th.key}" style="width:820px;height:1180px"><div class="fx" aria-hidden="true">{th.bg("menu")}</div>'
             f'<div class="lay tabl">{crew_list_col(th)}<div class="cmain">'
             f'<div class="cmh">{emblem(FNT, 52)}<div class="txt"><b>Friday Night Table</b><small>Season 3 · ends in 12 days</small></div><span class="sp"></span><span class="ib">{ICON["share"]}</span></div>'
             '<div class="ktabs"><span class="on">Home</span><span>League</span><span>Games</span><span>Members</span></div>'
             f'{side_cards(th)}{league_block(th, 6)}</div></div>{nav("crews")}</div>')
    return scaled(inner, 820, 1180, .62)

def side(th):
    inner = (f'<div class="tp v3s bigs sidew th-{th.key}" style="width:844px;height:390px"><div class="fx" aria-hidden="true">{th.bg("menu")}</div>'
             f'<div class="lay sidel">{rail(th, False)}<div class="clist slim">'
             + v3crews.crew_card(th, FNT, 'member', '4th', '', ('QK7P', 6, '9:12 pm', '10/20')).replace('class="ccard"', 'class="ccard sel"')
             + v3crews.crew_card(th, HOS, 'leader', '1st', '') + '</div>'
             f'<div class="cmain"><div class="ktabs"><span class="on">Home</span><span>League</span><span>Games</span><span>Members</span></div>{side_cards(th)}</div></div></div>')
    return inner

def phone(th, which, W, H):
    if which == 'list':
        s = v3crews.crews_list(th)
    else:
        s = v3crew.home(th)
    return s.replace('style="width:390px;height:844px"', f'style="width:{W}px;height:{H}px"', 1)

CSS = v3crews.CSS + v3crew.CSS + r'''
.bigs .lay{position:absolute;inset:0;z-index:2;display:flex;gap:0}
.rail{display:flex;flex-direction:column;gap:6px;padding:18px 10px;width:76px;box-shadow:inset -1px 0 0 var(--line);background:color-mix(in srgb,var(--bg) 85%,transparent);flex:none;align-items:center}
.rail.w{width:220px;align-items:stretch;padding:22px 16px}
.rail span{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:var(--r-btn,12px);font:700 14px var(--ui);color:var(--mut)}
.rail span i{font-style:normal;font-size:18px;width:22px;text-align:center}.rail span.on{background:color-mix(in srgb,var(--acc) 16%,transparent);color:var(--acc);box-shadow:inset 3px 0 0 var(--acc)}
.rlogo{min-height:20px;margin-bottom:14px;transform:scale(.62);transform-origin:left top;height:70px;width:300px}
.rme{margin-top:auto}.rme b{font:700 14px var(--ui);color:var(--tx)}
.rail .rme{padding:6px}
.clist{width:340px;flex:none;padding:22px 16px;display:flex;flex-direction:column;gap:12px;box-shadow:inset -1px 0 0 var(--line);overflow:hidden;background:color-mix(in srgb,var(--bg) 60%,transparent)}
.clist .ct{font:var(--dspw,700) 26px var(--dsp)}.ccard.sel{box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),inset 0 0 0 2px var(--acc)}
.cmain{flex:1;min-width:0;padding:22px 26px;display:flex;flex-direction:column;gap:14px;overflow:hidden}
.cmh{display:flex;align-items:center;gap:14px}.cmh .txt b{font:var(--dspw,700) 28px var(--dsp);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tab .cmh .txt b{font-size:22px}.pnl .ttl{white-space:nowrap}.cmh .txt small{font-size:13px;color:var(--mut)}
.cgrid{display:grid;gap:16px;align-items:start}.cgrid.c2{grid-template-columns:1.25fr 1fr}.cgrid.c3{grid-template-columns:1.3fr 1fr .8fr}.cc{display:grid;gap:14px}
.tab .lay.tabl{flex-direction:row;bottom:80px}.tab .clist{width:300px}.tab .cmain{padding:20px}
.tab > .v3nav{position:absolute;left:0;right:0;bottom:0;margin:0;z-index:3}
.sidew .clist.slim{width:300px;padding:12px;gap:8px}.sidew .ccard{padding:10px;gap:8px}.sidew .ccard .hrow.ft{display:none}.sidew .lvbar{margin:-10px -10px 0}
.sidew .cmain{padding:12px 16px;gap:10px}.sidew .rail{width:64px;padding:12px 8px}.sidew .rail span{padding:10px}
.sidew .pnl{padding:11px;gap:8px}.sidew .bb{height:44px}
'''

def build(th):
    r1 = ''.join([
        col('Small phone · 360 × 740', 'Small phone', 'Cards keep their full width; the bottom bar stays pinned and the list scrolls under it.', phone(th, 'list', 360, 740), 360),
        col('Small phone · 360 × 740', 'Crew home, small', 'The crew home on a short screen: the live table and your season stay above the fold.', phone(th, 'home', 360, 740), 360),
        col('Large phone · 430 × 932', 'Large phone', 'More room: the same layout, nothing stretched.', phone(th, 'home', 430, 932), 430),
        col('Phone sideways · 844 × 390', 'Sideways', 'An icon rail replaces the bottom bar; crews on the left, the selected crew on the right.', side(th), 844),
    ])
    r2 = ''.join([
        col('Tablet · 820 × 1180', 'Tablet', 'Two panes: crews on the left, the crew on the right, the bottom bar under both.', tablet(th), 508),
        col('Laptop · 1440 × 900', 'Laptop', 'A rail with the logo, the crews column, then the crew: the league next to the live table, your season and the last games.', big(th, 1440, 900, 2, .62), 893),
    ])
    r3 = col('Desktop · 1920 × 1080', 'Desktop', 'A third column for members, so the whole crew is on one screen with no tabs to open.', big(th, 1920, 1080, 3, .62), 1190)
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div><div class="v3row">{r3}</div>' + note(
        ('Phones', 'One column, bottom bar pinned, content scrolls under it. Tap targets stay 44 px or more at every size.'),
        ('Sideways', 'The rail moves to the left edge so the short screen keeps its height for content.'),
        ('Big screens', 'The menu becomes a rail with the logo; crews and the selected crew sit side by side. Nothing is just a stretched phone.'),
        ('Same parts', 'Every size uses the same crew cards, league rows and panels; only how many sit side by side changes.'))
    return board(th, f'{th.key}-crewsizes.dc.html', f'{th.name}: crews on every screen', 'The Crews tab and a crew page on small, regular and large phones, sideways, tablet, laptop and desktop.', body, 2220, 2760, CSS)
