"""The crew page: home, league, games, members, a player's card, invite, settings and hosting, as a member and as a leader."""
from v3kit import *

def crew_head(th, c, leader=False, tab='Home'):
    right = (f'<span class="ib">{ICON["share"]}</span>' + (f'<span class="ib">{ICON["gear"]}</span>' if leader else ''))
    tabs = ''.join(f'<span class="{"on" if t == tab else ""}">{t}</span>' for t in ['Home', 'League', 'Games', 'Members'])
    role = '<span class="chipt a">Leader</span>' if leader else ''
    return (f'<header class="v3h crh"><span class="ib">‹</span>{emblem(c, 44)}<div><b>{c["name"]}</b><small>Season {c["season"]} · ends in 12 days</small></div>'
            f'<span class="sp"></span>{right}</header><div class="ktabs">{tabs}</div>')

def spark(vals, w=120, h=34, cls='spk'):
    mn, mx = min(vals), max(vals)
    pts = ' '.join(f'{i * w / (len(vals) - 1):.1f},{h - 3 - (v - mn) / (mx - mn or 1) * (h - 6):.1f}' for i, v in enumerate(vals))
    return f'<svg class="{cls}" viewBox="0 0 {w} {h}" width="{w}" height="{h}" aria-hidden="true"><polyline points="{pts}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>'

def home(th, leader=False):
    return screen(th, home_inner(th, leader))

def home_inner(th, leader=False):
    c = HOS if leader else FNT
    live = ('<div class="pnl lvc"><div class="hrow"><span class="klive">LIVE</span><b>Table QK7P</b><span class="sp"></span><span class="mut" style="font-size:12px">since 9:12 pm</span></div>'
            f'<div class="hrow">{stack(th, [P[3], P[0], P[7], P[8], P[2], P[6]], 28)}<span class="mut" style="font-size:12px">6 playing · 2 seats free</span></div>'
            '<div class="bb p">Join the table</div></div>') if not leader else (
            '<div class="pnl req"><div class="hrow"><b class="ttl" style="font-size:15px">2 people want to join</b><span class="sp"></span><span class="acc" style="font:700 12.5px var(--ui)">See all</span></div>'
            f'<div class="hrow">{av(th, P[9], 32)}<span class="txt"><b>Rohan</b><small>asked 2 h ago · plays at Friday Night Table</small></span><span class="mb n">✕</span><span class="mb y">{ICON["check"]}</span></div></div>'
            '<div class="bb p hz">' + ic('cards') + 'Host a crew table</div>')
    me_rank = ('4th', '+96', [0, 12, 8, 30, 22, 61, 54, 96]) if not leader else ('1st', '+212', [0, 40, 25, 80, 120, 150, 212])
    mine = (f'<div class="pnl"><div class="hrow"><span class="klbl">Your season</span><span class="sp"></span><span class="chipt">12 games</span></div>'
            f'<div class="hrow"><div class="rk"><b>{me_rank[0]}</b><small>of {c["members"]}</small></div><div class="nb"><b class="tu">{me_rank[1]} bb</b><small>won this season</small></div>'
            f'<span class="sp"></span><span class="acc">{spark(me_rank[2])}</span></div></div>')
    pod = ''.join(f'<div class="pd p{r}">{av(th, p, 44 if r == 1 else 36)}<b>{p["n"]}</b><small>{n} bb</small><i>{r}</i></div>' for r, p, n, _, _ in [STAND[1], STAND[0], STAND[2]])
    top = f'<div class="pnl"><div class="hrow"><span class="klbl">League</span><span class="sp"></span><span class="acc" style="font:700 12.5px var(--ui)">Full table ›</span></div><div class="podium">{pod}</div></div>'
    last = (f'<div class="row"><span class="dev">{ICON["cards"]}</span><span class="txt"><b>Fri 31 Oct · Meera won +184 bb</b><small>8 players · 3 h 12 min · you +22 bb</small></span><span class="go">›</span></div>')
    return crew_head(th, c, leader) + live + mine + top + last + nav('crews')

def league(th):
    rows = ''
    for r, p, n, g, t in STAND[3:10]:
        me = ' me' if p is ME else ''
        tr = f'<span class="trend {"tu" if t == "up" else "td"}">{ICON["up"] if t == "up" else ICON["down"]}</span>' if t else '<span class="trend"></span>'
        rows += (f'<div class="lrow{me}"><span class="n">{r}</span>{av(th, p, 30)}<b>{p["n"]}{" (you)" if me else ""}</b>{tr}<span class="g">{g}</span>'
                 f'<span class="v {"tu" if n.startswith("+") else "td"}">{n}</span></div>')
    pod = ''.join(f'<div class="pd p{r}">{av(th, p, 52 if r == 1 else 42)}<b>{p["n"]}</b><small>{n} bb</small><i>{r}</i></div>' for r, p, n, _, _ in [STAND[1], STAND[0], STAND[2]])
    inner = (crew_head(th, FNT, tab='League')
             + '<div class="seg"><span class="on">Season 3</span><span>Season 2</span><span>All-time</span></div>'
             + f'<div class="podium big">{pod}</div>'
             + '<div class="lhead"><span>#</span><span style="flex:1;padding-left:40px">Player</span><span>Games</span><span style="width:58px;text-align:right">Won (bb)</span></div>'
             + f'<div class="ltable">{rows}</div>'
             + '<p class="hint">Ranked by big blinds won, so tables with different blinds count fairly. Season ends Fri 14 Nov; the winner gets the season trophy.</p>'
             + nav('crews'))
    return screen(th, inner)

def games(th):
    g = [('This week', [('Fri 31 Oct · 9:12 pm', 'QK7P · 8 players · 3 h 12 min', P[3], '+184', '+22', '')]),
         ('Last week', [('Fri 24 Oct · 9:40 pm', 'J2RM · 7 players · 2 h 40 min', P[0], '+150', '−40', ''),
                        ('Tue 21 Oct · 10:05 pm', 'Offline · 5 players · 1 h 55 min', ME, '+88', '+88', 'off'),
                        ('Sun 19 Oct · 4:30 pm', 'TT9A · 4 players · 35 min', P[7], '+60', '−20', 'void')]),
         ('October', [('Fri 17 Oct · 9:00 pm', 'P8WD · 9 players · 3 h 30 min', P[8], '+210', '+12', '')])]
    out = ''
    for grp, rows in g:
        out += f'<span class="klbl" style="margin-top:2px">{grp}</span>'
        for d, s, w, wn, mine, tag in rows:
            tg = {'off': '<span class="chipt">offline</span>', 'void': '<span class="chipt o">void</span>'}.get(tag, '')
            out += (f'<div class="grow{" void" if tag == "void" else ""}"><div class="txt"><b>{d}</b><small>{s}</small></div>'
                    f'<div class="win">{av(th, w, 26)}<span>{wn}</span></div><span class="me {"tu" if mine.startswith("+") else "td"}">{mine}</span>{tg}<span class="go">›</span></div>')
    inner = crew_head(th, FNT, tab='Games') + '<div class="seg"><span class="on">All games</span><span>I played</span><span>Trophies</span></div>' + f'<div class="glist">{out}</div>' + nav('crews')
    return screen(th, inner)

def members(th):
    req = ''.join(f'<div class="hrow mrow">{av(th, p, 36)}<span class="txt"><b>{p["n"]}</b><small>{why}</small></span><span class="mb n">✕</span><span class="mb y">{ICON["check"]}</span></div>'
                  for p, why in [(P[9], 'asked 2 h ago'), (P[11], 'asked yesterday · invited by Kabir')])
    ms = [(ME, 'Leader', 'a', 'you', True), (P[11], 'Admin', 'o', 'joined Sep', False), (P[5], '', '', 'at table QK7P', True), (P[12], '', '', 'last played 3 days ago', False),
          (P[2], '', '', 'last played 1 week ago', False), (P[10], '', '', 'joined yesterday', False)]
    mem = ''.join(f'<div class="hrow mrow">{av(th, p, 36)}{"<i class=onl></i>" if on else ""}<span class="txt"><b>{p["n"]}</b><small>{s}</small></span>'
                  f'{f"<span class=chipt.{c}>{r}</span>".replace("chipt.", "chipt ") if r else ""}<span class="mm">{ICON["more"]}</span></div>' for p, r, c, s, on in ms)
    inner = (crew_head(th, HOS, True, 'Members')
             + '<div class="hrow"><div class="inp" style="flex:1;height:42px"><span class="ph">Search 7 members</span></div><span class="bb p sm hz">' + ic('plus') + 'Invite</span></div>'
             + f'<div class="pnl req" style="gap:8px"><span class="klbl">Wants to join · 2</span>{req}</div>'
             + f'<div class="mlist">{mem}</div>' + nav('crews'))
    return screen(th, inner)

def member_sheet(th):
    sheet = (f'<div class="bsheet"><span class="grip"></span><div class="hrow">{av(th, P[5], 54)}<span class="txt"><b style="font:var(--dspw,700) 20px var(--dsp)">Ishaan</b>'
             '<small class="mut">Member since Sep · 9 games · −40 bb</small></span></div>'
             '<div class="alist"><div class="row">' + ic('cards') + '<span class="txt"><b>Player card</b><small>Results, best hands, trophies</small></span><span class="go">›</span></div>'
             '<div class="row">' + ic('lock') + '<span class="txt"><b>Make admin</b><small>Can approve requests and host crew tables</small></span><span class="go">›</span></div>'
             '<div class="row">' + ic('trophy') + '<span class="txt"><b>Hand over leadership</b><small>Ishaan becomes leader, you become admin</small></span><span class="go">›</span></div></div>'
             '<div class="bb d">Remove from crew</div><p class="hint" style="margin:-4px 0 0">Their past results stay in the league as before.</p></div>')
    return screen(th, members_bg(th), overlay='<div class="kdim"></div>' + sheet)

def members_bg(th):
    return crew_head(th, HOS, True, 'Members') + '<div class="mlist">' + ''.join(f'<div class="hrow mrow">{av(th, p, 36)}<span class="txt"><b>{p["n"]}</b><small>member</small></span></div>' for p in [ME, P[11], P[5], P[12]]) + '</div>' + nav('crews')

def invite_sheet(th):
    sheet = ('<div class="bsheet"><span class="grip"></span><div class="hrow"><b style="font:var(--dspw,700) 21px var(--dsp)">Invite to Hostel 4B</b><span class="sp"></span><span class="ib">✕</span></div>'
             f'<div class="qrw">{qr("H4B7KX", 25, 5)}<div class="qrc"><span class="klbl">Code</span><b class="big">H4B-7KX</b><small class="mut">Scan with any phone camera, or type the code in Crews › Join</small></div></div>'
             '<div class="three"><span class="bb s sm hz">' + ic('whatsapp') + 'WhatsApp</span><span class="bb s sm hz">' + ic('copy') + 'Link</span><span class="bb s sm hz">' + ic('share') + 'Share</span></div>'
             '<div class="pnl" style="gap:10px"><div class="swrow"><span>Let people in by themselves<small>Off: you or an admin approves each one</small></span><span class="sw"></span></div>'
             '<div class="hrow" style="font-size:12.5px"><span class="mut">Code made 3 Oct · used 6 times</span><span class="sp"></span><span class="acc" style="font-weight:700">Make a new code</span></div></div></div>')
    return screen(th, members_bg(th), overlay='<div class="kdim"></div>' + sheet)

def settings(th):
    inner = (head('Crew settings', 'Only you and admins see this')
             + f'<div class="pnl"><div class="hrow">{emblem(HOS, 54)}<div class="fld" style="flex:1"><span>Name</span><div class="inp" style="height:44px">Hostel 4B</div></div></div>'
             '<div class="hrow" style="font-size:12.5px"><span class="mut">Badge and colour</span><span class="sp"></span><span class="acc" style="font-weight:700">Change ›</span></div></div>'
             + '<div class="pnl"><span class="klbl">Who can host crew tables</span><div class="seg"><span class="on">Everyone</span><span>Admins</span><span>Only me</span></div>'
             '<span class="klbl" style="margin-top:4px">Season length</span><div class="seg"><span>1 month</span><span class="on">3 months</span><span>6 months</span><span>Off</span></div>'
             '<div class="hrow" style="font-size:12.5px"><span class="mut">Season 1 ends Fri 14 Nov</span><span class="sp"></span><span class="acc" style="font-weight:700">End it now ›</span></div></div>'
             + '<div class="pnl" style="gap:8px"><div class="row"><span class="txt"><b>Seat disputes</b><small>1 open · someone says a seat wasn’t them</small></span><span class="chipt a">1</span><span class="go">›</span></div>'
             '<div class="row"><span class="txt"><b>Correct a result</b><small>Move chips between players, everyone sees why</small></span><span class="go">›</span></div></div>'
             + '<div class="bb g" style="margin-top:auto">Delete crew</div><p class="hint" style="margin:0 0 20px">Only possible when you are the last member.</p>')
    return screen(th, inner)

def host_sheet(th):
    sheet = ('<div class="bsheet"><span class="grip"></span><div class="hrow"><b style="font:var(--dspw,700) 21px var(--dsp)">Host a crew table</b><span class="sp"></span><span class="chipt a">Counts for Season 1</span></div>'
             '<div class="pnl" style="gap:6px"><span class="klbl">Crew rules</span><span style="font:600 13.5px var(--ui)">1,000 chips · blinds 10/20, up every 20 min · 2 rebuys of 1,000</span>'
             '<span class="acc" style="font:700 12.5px var(--ui)">Change for tonight ›</span></div>'
             '<div class="bb p">Online<small>Friends join from anywhere</small></div><div class="bb s">Offline<small>No internet: the host app on a hotspot</small></div>'
             '<div class="bb g">Pair phones by QR<small>No internet and no host app</small></div>'
             '<p class="hint" style="margin:0">Everyone in the crew gets a notification that the table is open.</p></div>')
    return screen(th, home_inner(th, True), overlay='<div class="kdim"></div>' + sheet)

def player_card(th):
    best = ''.join(card(c, 34) for c in ['Kh', 'Kd', 'Ks', '7c', '7d'])
    inner = (head('Meera', 'Friday Night Table · leader')
             + f'<div class="pcard">{av(th, P[3], 86, "menu")}<b>Meera</b><span class="mut" style="font-size:12.5px">1st this season · member since Season 1</span></div>'
             + '<div class="three"><div class="stat"><b>11</b><small>games</small></div><div class="stat"><b class="tu">+412</b><small>bb this season</small></div><div class="stat"><b>38%</b><small>hands won</small></div></div>'
             + f'<div class="pnl"><span class="klbl">Best hand this season</span><div class="hrow" style="gap:5px">{best}</div><small class="mut">Full house, kings full of sevens · Fri 24 Oct</small></div>'
             + f'<div class="pnl"><div class="hrow"><span class="klbl">Last 8 games</span><span class="sp"></span><span class="acc">{spark([0, 30, 18, 95, 140, 120, 260, 412], 140)}</span></div></div>'
             + '<div class="pnl"><span class="klbl">Trophies</span><div class="troph">' + ''.join(f'<span><i>{e}</i><small>{t}</small></span>' for e, t in [('🏆', 'Season 2'), ('🪑', 'Iron chair'), ('🔥', 'Comeback')]) + '</div></div>'
             + nav('crews'))
    return screen(th, inner)

def leave_ask(th):
    ask = ('<div class="askb"><p>Leave Friday Night Table?</p><small>Your results stay in the league as “Former player”. You can ask to join again later.</small>'
           '<div class="two"><span class="bb g">Stay</span><span class="bb d">Leave</span></div></div>')
    return screen(th, home_inner(th), overlay='<div class="kdim"></div>' + ask)

CSS = r'''
.crh .kemb{margin-left:-2px}.crh b{font-size:19px}
.lvc{box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),inset 0 0 0 1.5px var(--acc)}.lvc .hrow b{font:700 14px var(--ui)}
.req .txt{flex:1;display:grid;gap:1px}.req .txt b{font:700 13.5px var(--ui)}.req .txt small{font-size:11px;color:var(--mut)}
.mb{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font:800 14px var(--ui);flex:none}.mb svg{width:18px;height:18px}
.mb.y{background:var(--b-call);color:var(--b-calltx)}.mb.n{background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--mut)}
.rk{display:grid}.rk b{font:var(--numw,700) 34px/1 var(--num)}.rk small{font-size:11px;color:var(--mut)}
.nb{display:grid;margin-left:14px}.nb b{font:var(--numw,700) 18px var(--num)}.nb small{font-size:11px;color:var(--mut)}
.spk{display:block}
.podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:end;gap:6px}
.pd{display:grid;justify-items:center;gap:2px;text-align:center;position:relative}.pd b{font:700 12.5px var(--ui)}.pd small{font:var(--numw,700) 11.5px var(--num);color:var(--acc)}
.pd i{font-style:normal;display:grid;place-items:center;width:100%;border-radius:8px 8px 0 0;margin-top:4px;font:var(--numw,800) 15px var(--num);background:color-mix(in srgb,var(--acc) 22%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,var(--acc) 60%,transparent)}
.pd.p1 i{height:44px;background:color-mix(in srgb,var(--acc) 40%,transparent)}.pd.p2 i{height:30px}.pd.p3 i{height:20px}
.podium.big .pd.p1 .av{animation:crown 2.4s ease-in-out infinite}
@keyframes crown{50%{transform:translateY(-4px)}}
.lhead{display:flex;gap:8px;font:700 10px var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--mut);padding:0 10px}
.ltable{display:grid;gap:4px}
.lrow{display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:var(--r-btn,10px);background:var(--chipbg)}
.lrow .n{width:16px;font:var(--numw,700) 13px var(--num);color:var(--mut)}.lrow b{flex:1;font:700 13px var(--ui)}.lrow .g{width:34px;text-align:center;font-size:12px;color:var(--mut)}
.lrow .v{width:52px;text-align:right;font:var(--numw,700) 13.5px var(--num)}
.lrow.me{box-shadow:inset 0 0 0 1.5px var(--acc);background:color-mix(in srgb,var(--acc) 12%,var(--chipbg))}
.tu{color:#3fbf7f}.td{color:var(--red,#e0524a)}
.glist{display:grid;gap:7px}
.grow{display:flex;align-items:center;gap:8px;padding:10px 11px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.grow .txt{flex:1;display:grid;gap:2px;min-width:0}.grow .txt b{font:700 13px var(--ui)}.grow .txt small{font-size:11px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grow .win{display:flex;align-items:center;gap:4px;font:var(--numw,700) 11.5px var(--num);color:var(--acc)}
.grow .me{font:var(--numw,700) 12.5px var(--num);width:40px;text-align:right}.grow.void{opacity:.6}.grow .go{color:var(--mut)}
.mlist{display:grid;gap:2px}
.mrow{padding:8px 4px;position:relative;box-shadow:inset 0 -1px 0 var(--line)}.mrow .txt{flex:1;display:grid;gap:1px}.mrow .txt b{font:700 14px var(--ui)}.mrow .txt small{font-size:11.5px;color:var(--mut)}
.mrow .onl{position:absolute;left:32px;top:34px;width:11px;height:11px;border-radius:50%;background:#3fbf7f;box-shadow:0 0 0 2px var(--bg);z-index:3}
.mm{width:30px;height:30px;display:grid;place-items:center;color:var(--mut)}.mm svg{width:18px;height:18px}
.alist{display:grid;gap:7px}
.qrw{display:flex;gap:14px;align-items:center;padding:12px;border-radius:var(--r-panel,14px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.qrc{display:grid;gap:4px}.qrc .big{font-size:26px}.qrc small{font-size:11.5px;line-height:1.4}
.pcard{display:grid;justify-items:center;gap:4px;text-align:center}.pcard>b{font:var(--dspw,700) 24px var(--dsp)}
.troph{display:flex;gap:10px}.troph span{flex:1;display:grid;justify-items:center;gap:4px;padding:10px 4px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.troph i{font-style:normal;font-size:24px;animation:bob 3s ease-in-out infinite}.troph span:nth-child(2) i{animation-delay:.4s}.troph span:nth-child(3) i{animation-delay:.8s}.troph small{font-size:11px;color:var(--mut)}
@keyframes bob{50%{translate:0 -4px}}
'''

def build(th):
    r1 = ''.join([
        col('Member', 'Crew home', 'Everything about the crew on one screen: the table running right now, your season, the top three and the last game. Four tabs keep the rest one tap away.', home(th)),
        col('Member · League tab', 'The league', 'A podium for the top three, then everyone else. Your row is outlined. Season, last season or all-time; ranked by big blinds won.', league(th)),
        col('Member · Games tab', 'Every game the crew played', 'Grouped by week. Each row shows who won, what you made and whether it was offline or voided. Tapping one opens the full game and its replays.', games(th)),
        col('Member · a player', 'A player’s card', 'Tap anyone in the league or members list. Their season, their best hand drawn in the theme’s cards, their form and their trophies.', player_card(th)),
        col('Member · leaving', 'Leave the crew', 'The theme’s question box, never the browser’s. It says what stays behind.', leave_ask(th)),
    ])
    r2 = ''.join([
        col('Leader', 'Crew home, as the leader', 'Same home, plus what only a leader needs: who wants to join (approve in one tap), a Host button and the settings gear.', home(th, True)),
        col('Leader · Members tab', 'Members and requests', 'Requests sit at the top. Roles show as chips; a green dot means that person is at a table right now. The ⋯ opens what you can do.', members(th)),
        col('Leader · a member', 'What a leader can do', 'View their card, make them an admin, hand over leadership, or remove them. Removing never deletes their past results.', member_sheet(th)),
        col('Leader · invite', 'Invite people', 'The code, a QR to scan across the table and three ways to share. The leader decides whether people get in by themselves.', invite_sheet(th)),
        col('Leader · settings', 'Crew settings', 'Name and badge, who can host, season length (or no seasons), seat disputes and corrections. Delete is last and only works when you are alone.', settings(th)),
        col('Leader · host', 'Host a crew table', 'The crew’s saved rules are filled in; change them just for tonight. Online, offline or QR, and the crew gets a notification.', host_sheet(th)),
    ])
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div>' + note(
        ('Roles', 'Leader: everything. Admin: approve requests, host, correct results. Member: play, invite (if the crew allows), leave.'),
        ('Fair league', 'Ranked by big blinds won, so a 5/10 night and a 50/100 night count the same. Voided games never count.'),
        ('Notifications', 'Table opened, your request approved, season ended, a seat dispute about you. Each can be switched off in Settings.'),
        ('Motion', 'Tabs slide their underline; the podium leader bobs; sheets rise 0.45 s; approving a request flips the row to “joined” and slides it into the list.'))
    return board(th, f'{th.key}-crew.dc.html', f'{th.name}: the crew page', 'What a member sees and what a leader sees, and where every option leads: home, league, games, members, a player’s card, inviting, settings and hosting.', body, 2560, 2170, CSS)
