"""Shared boards for v3: where every option leads, who can do what in a crew, and the rules behind rebuys, results and devices."""
from v3kit import *

def box(t, s='', cls=''):
    tag = '<em class="tg n">new</em>' if cls == 'new' else '<em class="tg l">leader</em>' if cls == 'lead' else ''
    return f'<div class="nd {cls}"><b>{t}{tag}</b>{f"<small>{s}</small>" if s else ""}</div>'

def lane(title, items, cls=''):
    return f'<div class="ln {cls}"><span class="klbl">{title}</span>{"".join(items)}</div>'

MAP_CSS = r'''
.map{display:flex;gap:22px;align-items:flex-start}
.ln{display:grid;gap:10px;width:250px;align-content:start;position:relative}
.ln::after{content:"›";position:absolute;right:-17px;top:40%;font-size:26px;color:var(--acc)}
.ln.last::after{display:none}
.nd{padding:11px 13px;border-radius:var(--r-btn,12px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line));display:grid;gap:2px}
.nd b{font:700 13.5px var(--ui)}.nd small{font-size:11.5px;color:var(--mut);line-height:1.4}
.tg{font:800 9.5px var(--ui);font-style:normal;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border-radius:99px;margin-left:7px;vertical-align:2px}.tg.n{background:var(--acc);color:var(--acctx)}.tg.l{background:#2f6fd6;color:#fff}
.grp{display:grid;gap:14px;padding:18px;border-radius:var(--r-panel,16px);box-shadow:inset 0 0 0 1px var(--line)}
.grp>h3{margin:0;font:var(--dspw,700) 20px var(--dsp)}
.legend2{display:flex;gap:18px;font-size:12.5px;color:var(--mut)}.legend2 span{display:flex;align-items:center;gap:6px}.legend2 i{width:14px;height:14px;border-radius:4px}
.mtx{border-collapse:separate;border-spacing:0;width:100%;font-size:13.5px}
.mtx th,.mtx td{padding:10px 14px;text-align:left;box-shadow:inset 0 -1px 0 var(--line)}.mtx th{font:800 11px var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.mtx td.c{text-align:center;width:120px;font-weight:800}.mtx td.y{color:#3fbf7f}.mtx td.n{color:var(--mut);opacity:.6}
.rulez{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.rulez .pnl{gap:8px}.rulez .pnl p{margin:0;font-size:13px;line-height:1.55;color:var(--mut)}.rulez .pnl p b{color:var(--tx)}
'''

def sitemap(th):
    play = lane('Play (menu)', [box('Join a table', 'code boxes → the table'), box('Host a new table', 'Online · Offline · Pair phones by QR'),
                                box('Open a table', 'chips, blinds, rebuys (new), table', 'new'), box('Your crews strip', 'tap → crew page'), box('Profile', 'name, picture, devices (new)', 'new'), box('Settings', 'theme, table, motion, sounds')])
    crews = lane('Crews (new tab)', [box('Crews list', 'your crews, invites, LIVE strip', 'new'), box('Create a crew', 'name, badge, colour', 'new'), box('Join a crew', 'code · link · QR', 'new'),
                                     box('Invitation', 'preview, ask to join', 'new'), box('Request sent', 'waiting for the leader', 'new')])
    crew = lane('A crew', [box('Home', 'live table, your season, podium, last game', 'new'), box('League', 'season · last season · all-time', 'new'), box('Games', 'every game → game page → replays', 'new'),
                           box('Members', 'roles, requests, ⋯ actions', 'new'), box('Player card', 'season, best hand, form, trophies', 'new'), box('Leave crew', 'question box', 'new')])
    lead = lane('Leader only', [box('Requests', 'approve or decline', 'lead'), box('Invite', 'code, QR, share, auto-admit', 'lead'), box('Member actions', 'admin, hand over, remove', 'lead'),
                                box('Crew settings', 'name, badge, who hosts, seasons, disputes', 'lead'), box('Host a crew table', 'crew rules prefilled', 'lead')])
    dev = lane('Profile › devices', [box('Your devices', 'list, rename, log out', 'new'), box('Add a device', 'one-time code or QR', 'new'), box('Use an account I have', 'type or scan the code', 'new'),
                                     box('Bring crews over?', 'only if that device had some', 'new'), box('Signed in', 'notice on the other devices', 'new')])
    table = lane('At the table', [box('Raise', '− / +, type, slider, presets, keys', 'new'), box('Table rules', 'incl. rebuys left', 'new'), box('Bust-out', 'rebuy · watch · leave', 'new'),
                                  box('Results', 'scene + winner, then every hand shown', 'new'), box('Seat on another device', 'move here or watch', 'new')], 'last')
    return f'<div class="map">{play}{crews}{crew}{lead}{dev}{table}</div>'

def roles(th):
    rows = [('See the crew, league, games and players', 1, 1, 1), ('Play at crew tables (they count for the league)', 1, 1, 1), ('Invite people (when the crew allows it)', 1, 1, 1),
            ('Host a crew table', 'setting', 1, 1), ('Approve or decline join requests', 0, 1, 1), ('Correct a result, with a reason everyone sees', 0, 1, 1),
            ('Void a game', 0, 1, 1), ('Make someone an admin, or remove a member', 0, 0, 1), ('Rename, badge, seasons, who can host', 0, 0, 1),
            ('Hand over leadership', 0, 0, 1), ('Delete the crew (only when alone)', 0, 0, 1), ('Leave the crew', 1, 1, 'after handing over')]
    cell = lambda v: '<td class="c y">✓</td>' if v == 1 else ('<td class="c n">—</td>' if v == 0 else f'<td class="c" style="font-weight:600;font-size:12px;color:var(--mut)">{v}</td>')
    body = ''.join(f'<tr><td>{a}</td>{cell(m)}{cell(ad)}{cell(l)}</tr>' for a, m, ad, l in rows)
    return f'<table class="mtx"><tr><th>Can…</th><th style="text-align:center">Member</th><th style="text-align:center">Admin</th><th style="text-align:center">Leader</th></tr>{body}</table>'

def rules():
    return ('<div class="rulez">'
            '<div class="pnl"><div class="ttl">Rebuys</div><p>Offered only at <b>0 chips</b>, between hands; no top-ups. The host sets <b>how many</b> (1, 2, 3, no limit), <b>how big</b> (the starting stack or a custom 20–500 big blinds) and <b>until when</b> (never, or after a blind level). Every rebuy counts as money in for the league.</p></div>'
            '<div class="pnl"><div class="ttl">Results</div><p>At a showdown <b>every player still in the hand shows</b>; folded hands never do. The scene plays, then the winner, then everyone else, about <b>8 seconds</b> in all (3 when everyone folded). The server waits before dealing. Tapping skips ahead; your turn cuts in.</p></div>'
            '<div class="pnl"><div class="ttl">Devices</div><p>A <b>6-digit code</b> (or QR) works <b>once, for 5 minutes</b>; 5 wrong tries cancel it. New sign-ins are announced on your other devices. <b>One seat per player</b>: a second device asks to move the seat or watch.</p></div>'
            '<div class="pnl"><div class="ttl">Crews</div><p>Crew codes: <b>6 characters</b>, no look-alike letters. Ranked by <b>big blinds won</b>, so different blinds count fairly. Seasons of 1, 3 or 6 months, or none. Leaving keeps your results as “Former player”.</p></div>'
            '<div class="pnl"><div class="ttl">Raising</div><p><b>− and +</b> step one big blind; holding repeats and speeds up. Presets: min, ½ pot, ¾ pot, pot, all-in. Typing above your stack means all-in. Laptop: <b>← →</b>, <b>⇧</b>, <b>↑ ↓</b>, <b>Home</b>, <b>End</b>, <b>⏎</b>, <b>Esc</b>.</p></div>'
            '<div class="pnl"><div class="ttl">Readable buttons</div><p>Every action label and amount meets <b>4.5 : 1</b> contrast in all nine themes. A check in the test suite fails the build if a theme drops below.</p></div></div>')

def build(th):
    lg = '<div class="legend2"><span><em class="tg n" style="margin:0">new</em>New in this update</span><span><em class="tg l" style="margin:0">leader</em>Leader, and admins where the table below says so</span><span>No tag: already in the app</span></div>'
    body = (f'<div class="grp"><h3>Where every option leads</h3>{lg}{sitemap(th)}</div>'
            f'<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start"><div class="grp"><h3>Who can do what in a crew</h3>{roles(th)}</div>'
            f'<div class="grp"><h3>The rules behind it</h3>{rules().replace("repeat(3,1fr)", "repeat(2,1fr)")}</div></div>')
    return board(th, 'Main.dc.html', 'Train Poker v3: the map and the rules', 'Every place a menu option leads, what each crew role can do, and the rules behind rebuys, results, devices, crews and raising. Drawn in Classic; every theme follows the same map.', body, 1880, 1330, MAP_CSS)
