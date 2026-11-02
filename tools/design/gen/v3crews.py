"""Crews tab: the bottom-bar tab that replaces League. Empty state, your crews, create a crew, join a crew."""
from v3kit import *

COLORS = [('#c0392b', '#f3c66b'), ('#2f6fd6', '#bfe0ff'), ('#1f8a5b', '#c9f2dc'), ('#7d3cc8', '#e6d3ff'), ('#e07a1f', '#fff0d9'), ('#222831', '#e8e8e8')]

def crew_card(th, c, me_role, rank, extra='', live=None):
    role = {'leader': '<span class="chipt a">Leader</span>', 'admin': '<span class="chipt o">Admin</span>', 'member': ''}[me_role]
    lv = ''
    if live:
        lv = (f'<div class="lvbar"><span class="klive">LIVE</span><span class="txt"><b>Table {live[0]} · {live[1]} playing</b><small>Started {live[2]} · blinds {live[3]}</small></span>'
              f'<span class="bb p sm">Join</span></div>')
    ps = [P[3], P[0], P[7], P[8], P[2]] if c is FNT else [P[9], P[11], P[5], P[12]]
    return (f'<div class="ccard">{lv}<div class="hrow">{emblem(c, 50)}<div class="txt"><b>{c["name"]}</b>'
            f'<small>{c["members"]} members · Season {c["season"]} · you’re {rank}</small></div>{role}</div>'
            f'<div class="hrow ft">{stack(th, ps, 28)}<span class="mut">+{c["members"]-len(ps)}</span><span class="sp"></span>{extra}</div></div>')

def crews_empty(th):
    ill = (f'<div class="cill">{emblem(dict(FNT, short="?"), 64, "e1")}{emblem(HOS, 50, "e2")}{emblem(OFF, 44, "e3")}</div>')
    inner = (head('Crews', back=False, right=f'<span class="ib">{ICON["qr"]}</span>')
             + f'<div class="pnl hero1">{ill}<b class="h">Play with the same friends every week</b>'
             '<p class="mut">A crew keeps your league, your games and your trophies together. Every table you play as a crew counts toward the season.</p></div>'
             '<div class="bb p hz">' + ic('plus') + 'Create a crew</div>'
             '<div class="pnl"><div class="ttl">Join a crew</div><span class="mut" style="font-size:12.5px">Type the 6-letter code your friend sent you</span>'
             '<div class="kslots"><span class="f">F</span><span class="f">N</span><span class="c"></span><span class="dash">–</span><span></span><span></span><span></span></div>'
             '<div class="hrow"><span class="bb g sm hz">' + ic('link') + 'Paste a link</span><span class="bb g sm hz">' + ic('qr') + 'Scan a code</span></div></div>'
             + nav('crews'))
    return screen(th, inner)

def crews_list(th, leader=False):
    live = ('QK7P', 6, '9:12 pm', '10/20')
    inner = (head('Crews', back=False, right=f'<span class="ib">{ICON["plus"]}</span>')
             + '<div class="ktabs"><span class="on">My crews · 2</span><span>Invites · 1</span></div>'
             + crew_card(th, FNT, 'member', '4th', '<span class="chipt">Next: Fri 9 pm</span>', live)
             + crew_card(th, HOS, 'leader', '1st', '<span class="chipt o">2 requests</span>')
             + f'<div class="row invite">{emblem(OFF, 36)}<span class="txt"><b>Arjun invited you to Office Fridays</b><small>9 members · Season 2</small></span><span class="bb p sm">View</span></div>'
             + '<div class="two"><span class="bb s hz">' + ic('plus') + 'Create</span><span class="bb s hz">' + ic('link') + 'Join with code</span></div>'
             + nav('crews', '<b class="bdg">1</b>'))
    return screen(th, inner)

def create1(th):
    shapes = ''.join(f'<span class="{"on" if k == "shield" else ""}">{emblem(dict(FNT, shape=k, short=""), 34)}</span>' for k in SHAPES)
    cols = ''.join(f'<i class="{"on" if k == 1 else ""}" style="background:{a};box-shadow:inset 0 0 0 3px {b}"></i>' for k, (a, b) in enumerate(COLORS))
    c = dict(HOS, name='Hostel 4B')
    inner = (head('New crew', 'Step 1 of 2')
             + f'<div class="prev">{emblem(c, 92, "stamp")}<b>Hostel 4B</b><small class="mut">Season 1 starts with your first game</small></div>'
             + '<div class="fld"><span>Crew name</span><div class="inp f">Hostel 4B<i class="caret"></i><span class="sp"></span><span class="mut" style="font-size:12px">9 / 24</span></div></div>'
             + f'<div class="fld"><span>Badge</span><div class="pick shapes">{shapes}</div></div>'
             + f'<div class="fld"><span>Colour</span><div class="pick cols">{cols}</div></div>'
             + '<div class="pnl" style="gap:6px"><div class="swrow"><span>Seasons<small>The league resets every 3 months; all-time stays</small></span><span class="sw on"></span></div></div>'
             + '<div class="bb p" style="margin-top:auto;margin-bottom:22px">Create crew</div>')
    return screen(th, inner)

def create2(th):
    conf = ''.join(f'<i style="left:{(k*37)%380+6}px;background:{COLORS[k%6][0] if k%2 else "var(--acc)"};animation-delay:{-(k*.17)%2.6:.2f}s"></i>' for k in range(26))
    inner = (head('Hostel 4B', 'You’re the leader', back=False, right='<span class="ib">✕</span>')
             + f'<div class="made">{emblem(HOS, 110, "stamp")}<b>Crew made</b><p class="mut">Invite your friends. Anyone with the code can ask to join; you let them in.</p></div>'
             + '<div class="pnl codep"><span class="klbl">Crew code</span><div class="digits"><span>H</span><span>4</span><span>B</span><i></i><span>7</span><span>K</span><span>X</span></div>'
             + '<div class="three"><span class="bb s sm hz">' + ic('whatsapp') + 'WhatsApp</span><span class="bb s sm hz">' + ic('copy') + 'Copy link</span><span class="bb s sm hz">' + ic('qr') + 'QR</span></div></div>'
             + '<div class="pnl" style="gap:8px"><div class="swrow"><span>Let people in by themselves<small>Off: you approve each request</small></span><span class="sw"></span></div></div>'
             + '<div class="bb p" style="margin-top:auto;margin-bottom:22px">Go to the crew</div>')
    return screen(th, inner, overlay=f'<div class="conf" aria-hidden="true" style="position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden">{conf}</div>')

def join1(th, err=False):
    sl = '<span class="f">F</span><span class="f">N</span><span class="f">T</span><span class="dash">–</span><span class="f">4</span><span class="f">Q</span><span class="' + ('f' if err else 'c') + '">' + ('9' if err else '') + '</span>'
    msg = ('<p class="errm">No crew has the code FNT-4Q9. Check the last letters with your friend.</p>' if err else
           '<p class="hint">Codes are 6 letters and numbers, like FNT-4Q2. Capitals don’t matter.</p>')
    inner = (head('Join a crew')
             + f'<div class="pnl" style="gap:14px"><div class="ttl">Type the crew code</div><div class="kslots{" err" if err else ""}">{sl}</div>{msg}</div>'
             + '<p class="or2"><span>or</span></p>'
             + '<div class="row">' + ic('link') + '<span class="txt"><b>Paste an invite link</b><small>trainpoker.app/c/FNT4Q2</small></span><span class="go">›</span></div>'
             + '<div class="row">' + ic('qr') + '<span class="txt"><b>Scan a crew QR</b><small>From a friend’s phone or a printed card</small></span><span class="go">›</span></div>'
             + '<div class="bb p" style="margin-top:auto;margin-bottom:22px">' + ('Try again' if err else 'Find crew') + '</div>')
    return screen(th, inner)

def join2(th):
    ps = [P[3], P[0], P[7], P[8], P[2], P[6]]
    inner = (head('Invitation', back=True)
             + f'<div class="invh">{emblem(FNT, 96, "stamp")}<span class="klbl">You’re invited to</span><b>Friday Night Table</b>'
             f'<div class="hrow" style="justify-content:center">{stack(th, ps, 30)}<span class="mut">13 members</span></div></div>'
             + '<div class="three"><div class="stat"><b>3</b><small>season</small></div><div class="stat"><b>41</b><small>games played</small></div><div class="stat"><b>Fri</b><small>usually plays</small></div></div>'
             + f'<div class="row">{av(th, P[3], 34)}<span class="txt"><b>Meera leads this crew</b><small>She’ll see your request and let you in</small></span></div>'
             + '<div class="pnl" style="gap:7px;font-size:12.5px;line-height:1.5"><span class="klbl">When you join</span>'
             '<span>· Your games at crew tables count in the league</span><span>· Members see your name, picture and results</span><span>· You can leave any time; your results stay</span></div>'
             + '<div class="two" style="margin-top:auto;margin-bottom:22px"><span class="bb g">Not now</span><span class="bb p">Ask to join</span></div>')
    return screen(th, inner)

def join3(th):
    inner = (head('Friday Night Table', 'Request sent', back=True)
             + f'<div class="made">{emblem(FNT, 84)}<div class="wait"><i></i><i></i><i></i></div><b>Waiting for Meera</b>'
             '<p class="mut">We’ll let you know the moment you’re in. You can still play at any table in the meantime.</p></div>'
             + '<div class="pnl" style="gap:8px"><div class="swrow"><span>Tell me when I’m in<small>A notification on this phone</small></span><span class="sw on"></span></div></div>'
             + '<div class="bb g" style="margin-top:auto">Cancel request</div><div style="height:22px"></div>')
    return screen(th, inner, overlay='<div class="toast" style="top:76px">' + ic('check') + 'You’re in! Welcome to Friday Night Table</div>')

CSS = r'''
.ccard{border-radius:var(--r-panel,16px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line));padding:13px;display:grid;gap:11px;overflow:hidden}
.ccard .txt{flex:1;display:grid;gap:2px;min-width:0}.ccard .txt b{font:var(--dspw,700) 17px var(--dsp)}.ccard .txt small{font-size:11.5px;color:var(--mut)}
.ccard .ft{font-size:11.5px}
.lvbar{display:flex;align-items:center;gap:10px;margin:-13px -13px 0;padding:10px 13px;background:color-mix(in srgb,var(--acc) 16%,transparent);box-shadow:inset 0 -1px 0 color-mix(in srgb,var(--acc) 35%,transparent)}
.lvbar .txt b{font:700 12.5px var(--ui)}.lvbar .txt small{font-size:11px}
.row.invite{box-shadow:inset 0 0 0 1.5px var(--acc)}
.hero1{justify-items:center;text-align:center;padding:22px 18px}.hero1 .h{font:var(--dspw,700) 21px/1.2 var(--dsp)}.hero1 p{margin:0;font-size:13px;line-height:1.5}
.cill{position:relative;width:170px;height:96px}.cill .kemb{position:absolute}.cill .e1{left:52px;top:8px;z-index:2;animation:bob 3.2s ease-in-out infinite}
.cill .e2{left:8px;top:34px;transform:rotate(-12deg);opacity:.85;animation:bob 3.2s .4s ease-in-out infinite}.cill .e3{right:8px;top:38px;transform:rotate(10deg);opacity:.85;animation:bob 3.2s .8s ease-in-out infinite}
@keyframes bob{50%{translate:0 -5px}}
.prev{display:grid;justify-items:center;gap:6px;padding:6px 0 4px}.prev b{font:var(--dspw,700) 22px var(--dsp)}.prev small{font-size:12px}
.pick{display:flex;gap:8px}.pick span{flex:1;height:52px;display:grid;place-items:center;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.pick span.on{box-shadow:inset 0 0 0 2px var(--acc)}
.cols i{flex:1;height:34px;border-radius:var(--r-btn,10px)}.cols i.on{outline:2px solid var(--acc);outline-offset:3px}
.made{display:grid;justify-items:center;gap:8px;text-align:center;padding:10px 6px 0}.made>b{font:var(--dspw,700) 26px var(--dsp)}.made p{margin:0;font-size:13px;line-height:1.5;max-width:300px}
.codep{justify-items:stretch;text-align:center}
.or2{display:flex;align-items:center;gap:12px;margin:0;font:700 11px var(--ui);letter-spacing:.24em;color:var(--mut);text-transform:uppercase}.or2::before,.or2::after{content:"";flex:1;height:1px;background:var(--line)}
.row>.ico{color:var(--acc);width:22px;height:22px}
.errm{margin:0;font-size:12.5px;color:var(--red,#e0524a);line-height:1.45}
.invh{display:grid;justify-items:center;gap:8px;text-align:center;padding:4px 0}.invh>b{font:var(--dspw,700) 26px/1.1 var(--dsp)}
.wait{display:flex;gap:6px}.wait i{width:8px;height:8px;border-radius:50%;background:var(--acc);animation:wd 1.2s ease-in-out infinite}.wait i:nth-child(2){animation-delay:.15s}.wait i:nth-child(3){animation-delay:.3s}
@keyframes wd{50%{transform:translateY(-6px);opacity:.4}}
'''

def build(th):
    r1 = ''.join([
        col('New player', 'Crews, before you have one', 'The tab explains itself, with two ways in. The code boxes are right there because most people arrive with a code from WhatsApp.', crews_empty(th)),
        col('Member and leader', 'Your crews', 'Each crew is a card. A crew with a table running shows a LIVE strip you can join from here. Your role shows on the card; a leader sees pending requests.', crews_list(th)),
        col('Create · step 1', 'Name it, give it a badge', 'Four badge shapes and six colours; the badge preview updates as you type. Seasons can be switched off for crews that only want an all-time table.', create1(th)),
        col('Create · step 2', 'Crew made', 'The badge stamps in and confetti falls in the theme’s colours. The code is big enough to read out across a table; share sends a link that opens the invite.', create2(th)),
    ])
    r2 = ''.join([
        col('Join · code', 'Type the code', 'Six characters with a dash after three, typed into the same boxes as the table code. Letters fill in as you type; paste and scan are the other ways in.', join1(th)),
        col('Join · wrong code', 'When the code is wrong', 'The boxes shake once and turn the theme’s red; the message says what to check. Five wrong codes in a minute and the boxes rest for 30 seconds.', join1(th, err=True)),
        col('Join · preview', 'See the crew before joining', 'Who leads it, how big it is, when it plays and exactly what joining shares. Nothing happens until you tap Ask to join.', join2(th)),
        col('Join · waiting', 'Request sent', 'The leader approves (unless the crew lets people in by themselves). When they do, a toast slides in and the crew appears in your list.', join3(th)),
    ])
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div>' + note(
        ('Where it lives', 'Crews replaces League in the bottom bar: Play · Crews · Replays · Theme. A league belongs to a crew, so it moved inside the crew page.'),
        ('No sign-up', 'Creating or joining asks only for your name (already set on most phones). The account is made quietly in the background, as today.'),
        ('Codes', 'Crew codes are 6 characters (letters and numbers, no 0/O or 1/I). Leaders can make a new code at any time; the old one stops working.'),
        ('Motion', 'Tab underline slides in; badges stamp (0.7 s, overshoot); confetti falls 2.6 s; wrong code shakes 0.42 s; toast rises and leaves after 4 s.'))
    return board(th, f'{th.key}-crews.dc.html', f'{th.name}: the Crews tab', 'The tab that replaces League. What a new player sees, what a member and a leader see, and the two ways in: making a crew and joining one with a code.', body, 1800, 2160, CSS)
