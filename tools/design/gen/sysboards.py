"""Shared-rule boards, drawn in the Classic theme."""
from builders import *
from classic import TH as C

def frame(cls, inner): return f'<div class="tp {cls} th-classic">{inner}</div>'

def phone_scene(kind, states, felt, dense='dense', top_extra='', overlay='', hero=None, acts=None, sub='Blinds 10 / 20'):
    players = order('lap')[:len(states)]
    hero = hero or (f'{hold()}<div class="hmeta"><span class="hname">Dev</span><span class="hstack">1,840</span>'
                    '<span class="hhint"><span class="s1">Hold your cards to look</span><span class="s2">Two pair, Aces and Kings</span></span></div>')
    acts = acts or '<button class="act fold">Fold</button><button class="act call">Call<small>120</small></button><button class="act raise">Raise<small>240+</small></button>'
    return frame(f'phone {dense}', topbar(C, 'phone', 'Hand 23', sub) + top_extra
                 + f'<div class="arena">{dealer_block(C, "phone")}' + table_block(C, kind, states, players, felt) + '</div>'
                 + f'<section class="hero">{hero}</section><nav class="actions">{acts}</nav>' + overlay)

def col(title, txt, body, w=390):
    return f'<div class="sc" style="width:{w}px"><div class="cap"><b>{title}</b><small>{txt}</small></div>{body}</div>'

SYS_CSS = '''
.sysw{display:flex;gap:40px;align-items:flex-start}
.sc{display:grid;gap:12px}.sc .cap{display:grid;gap:4px;min-height:92px;align-content:start}
.sc .cap b{font:600 20px 'Fraunces'}.sc .cap small{font-size:13px;color:#b9a88b;line-height:1.45}
.sc>.tp{border-radius:26px;box-shadow:0 0 0 1px rgba(201,161,91,.3),0 20px 40px rgba(0,0,0,.4)}
.rules{display:grid;gap:10px;font-size:13.5px;line-height:1.45;color:#f3ead7}
.rules div{padding:12px 14px;border-radius:12px;background:rgba(246,240,225,.05);box-shadow:inset 0 0 0 1px rgba(201,161,91,.2)}
.rules b{color:#ecd39b}
'''

# ---------- crowded tables ----------
def crowd():
    s6 = [dict(tag=('', 'Call 120'), bet='120'), dict(hot='HOT', stack='3,020'), dict(cls='away', tag=('away', 'Away'), cards=False),
          dict(tag=('raise', 'Raise 120'), bet='120'), dict(tag=('allin', 'All-in'), bet='240', chip='b'), dict(cls='turn', tag=('', 'Thinking'))]
    s15 = lap_states()
    for st in s15:
        if 'fold' in st.get('cls', ''): st['cls'] = 'mini'
    felt = felt_main('phone', C)
    p6 = phone_scene('phone6', s6, felt, dense='')
    p10 = phone_scene('phone', phone_states(), felt)
    felt15 = f'<div class="board">{"".join(card(c, 40) for c in BOARD)}{slot(40)}</div><div class="pot">{chip()}<strong>1,300</strong>pot</div>'
    from responsive import frame as rf
    p15 = rf(C, 390, 844, 15)[0]
    land = rf(C, 844, 390, 15)[0]
    body = ('<div class="tp sheet th-classic" style="width:2260px;height:1200px"><div><h1>Crowded tables: one layout engine for 2 to 15 players</h1>'
            '<p class="lede">Seats are placed by the app, not by hand: spread evenly along the rail by arc length, skipping the dealer and your own spot. Every layout is checked automatically so no seat, tag or bet can overlap another. Players who folded shrink to a mini avatar, so the people still in the hand get the room.</p></div><div class="sysw">'
            + col('6 players', 'Full plates, roomy rail, larger avatars.', p6)
            + col('10 players', 'Compact plates. Action tags sit under each plate, bets are placed where nothing collides.', p10)
            + col('15 players', 'Folded players become mini avatars; the 6 still in the hand keep full plates.', p15)
            + col('15 players, phone sideways', 'Table on the left, your cards and buttons always in the right column so your thumb never moves.', land, 844)
            + '</div></div>')
    return write('sys-crowd.dc.html', doc(C, 'Crowded table layouts', 2260, 1200, body, SYS_CSS))

# ---------- odds at scale ----------
def odds():
    hu = [dict(cls='fold', tag=('fold', 'Fold')) for _ in range(9)]
    hu[5] = dict(shown=['Kh', 'Qh'], tag=('odds', '29%'), stack='0', sw=24)
    felt_hu = (f'<div class="board" style="gap:5px">{"".join(card(c, 46) for c in BOARD[:3])}{back(46, "ghost")}{back(46, "ghost")}</div>'
               '<div class="tv"><div class="tvr"><span class="nm">Dev</span><span class="bar"><i style="--p:71%;background:#c9a15b"></i></span><b>71%</b></div>'
               '<div class="tvr"><span class="nm">Riya</span><span class="bar"><i style="--p:29%;background:#a83c32"></i></span><b>29%</b></div><small>Heads-up: full TV bars fit</small></div>')
    six = [dict(shown=['Jd', 'Td'], tag=('odds', '11%'), stack='0', sw=22), dict(cls='fold', tag=('fold', 'Fold')),
           dict(shown=['9c', '9s'], tag=('odds', '18%'), stack='0', sw=22), dict(shown=['Ac', 'Qs'], tag=('odds', '6%'), stack='0', sw=22),
           dict(cls='fold', tag=('fold', 'Fold')), dict(shown=['Kh', 'Qh'], tag=('odds', '14%'), stack='0', sw=22),
           dict(shown=['7c', '7d'], tag=('odds', '19%'), stack='0', sw=22), dict(cls='fold', tag=('fold', 'Fold')), dict(cls='fold', tag=('fold', 'Fold'))]
    eq = [('DV', 32, 22, '#c9a15b'), ('TA', 19, 14, '#2f8a63'), ('KA', 18, 12, '#24577f'), ('RI', 14, 20, '#a83c32'), ('AD', 11, 14, '#8a5a2b'), ('ME', 6, 18, '#6b4a7a')]
    bar = '<div class="eq">' + ''.join(f'<span style="--c:{c};--p:{p}%;--p0:{p0}%">{n}</span>' for n, p, p0, c in eq) + '</div>'
    felt6 = (f'<div class="board" style="gap:5px">{"".join(card(c, 46) for c in BOARD[:3])}{back(46, "ghost")}{back(46, "ghost")}</div>{bar}'
             '<div class="pot">' + chip() + '<strong>7,240</strong>6-way all-in</div>')
    hero = (f'{hold()}<div class="hmeta"><span class="hname">Dev · all-in</span><span class="hstack">32%</span><span class="hhint">to win · best of 6</span></div>')
    acts = '<button class="act ghost">Dealing the turn…</button>'
    p_hu = phone_scene('phone', hu, felt_hu, hero=hero.replace('32%', '71%').replace('best of 6', 'heads-up'), acts=acts)
    p_6 = phone_scene('phone', six, felt6, hero=hero, acts=acts)
    css = SYS_CSS + '''
.tv{position:relative;z-index:1;width:236px;display:grid;gap:5px;padding:8px 10px;border-radius:10px;background:rgba(0,0,0,.45)}
.tvr{display:grid;grid-template-columns:40px 1fr 38px;align-items:center;gap:6px;font-size:12px;font-weight:700}
.tvr .bar{height:12px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}.tvr .bar i{display:block;height:100%;width:var(--p)}
.tvr b{font-family:Fraunces;text-align:right}.tv small{font-size:10.5px;color:#b9a88b;text-align:center}
'''
    body = ('<div class="tp sheet th-classic" style="width:1460px;height:1200px"><div><h1>All-in odds that work at any table size</h1>'
            '<p class="lede">A list of players under the board breaks as soon as four or more people are all in. So the odds move onto the seats: each player\'s cards and win chance appear on their own plate, one stacked bar on the felt shows the whole race, and your own chance sits in big type where your stack usually is.</p></div><div class="sysw">'
            + col('Heads-up', 'Two players: classic TV bars fit under the board.', p_hu)
            + col('Six-way all-in', 'Odds pill on every seat, one stacked bar on the felt. The bar animates as each card lands.', p_6)
            + '<div class="sc" style="width:520px"><div class="cap"><b>The rules</b><small>How the odds are worked out and shown</small></div><div class="rules">'
            '<div><b>Who sees cards?</b> Only once every remaining player is all-in and no more betting is possible. Folded hands are never shown.</div>'
            '<div><b>Calculation.</b> Exact for 2 to 3 players. For 4 or more, 20,000 simulated run-outs on the host phone, under 80 ms on a mid-range Android. Updated after the flop, turn and river.</div>'
            '<div><b>Scaling.</b> 2 players: TV bars. 3 to 15: seat pills plus the stacked bar. Over 8 still in: the bar groups anyone below 5% as "others".</div>'
            '<div><b>Ties.</b> A split chance is shown as a striped segment and "tie 4%" in the hand log.</div>'
            '<div><b>Setting.</b> The host can turn odds off for the whole table, and anyone can hide them on their own screen.</div></div></div>'
            '</div></div>')
    return write('sys-odds.dc.html', doc(C, 'All-in odds at scale', 1460, 1200, body, css))

# ---------- presence ----------
def presence():
    st = phone_states()
    banner = '<div class="pb warn"><span class="net weak"><i></i><i></i><i></i></span><span><b>Reconnecting…</b> your seat and cards are safe</span><span class="t">0:07</span></div>'
    p1 = phone_scene('phone', st, felt_main('phone', C), top_extra='', overlay=banner)
    toast = ('<div class="pt"><b>Welcome back, Dev</b><small>You were away for 2 hands. Hand 21 you folded automatically, hand 22 you sat out and missed the blinds. You are back in from the next hand.</small>'
             '<div><span class="p">Deal me in</span><span>Sit out a bit</span></div></div>')
    p2 = phone_scene('phone', st, felt_main('phone', C), overlay=toast, acts='<button class="act ghost">Waiting for next hand</button>')
    pause = ('<div class="pp"><div class="pc"><span class="ring"><span>1:36</span></span><b>Game paused</b><small>Riya (host) lost connection. Nothing is lost: the table is saved on every phone.</small>'
             '<div class="opts"><div><b>Online mode</b>If Riya is not back in 2 minutes, the server keeps running the game and Meera becomes host.</div>'
             '<div><b>Offline mode</b>The host phone is the table, so everyone waits. When Riya returns the hand resumes exactly where it stopped.</div></div></div></div>')
    p3 = phone_scene('phone', st, felt_main('phone', C), overlay=pause, acts='<button class="act ghost">Paused</button>')
    sheet = ('<div class="ps"><div class="hd"><span class="av">' + C.avatar(P[4], 'menu') + '</span><span><b>Arjun</b><small>Away 2:41 · missed 3 hands · 1,000 chips</small></span></div>'
             '<div class="row"><span>Hold his seat</span><small>Chips stay, he sits out and posts no blinds</small><i class="on"></i></div>'
             '<div class="row"><span>Auto-remove after</span><small>Seat freed, chips saved to the league</small><b>10 min</b></div>'
             '<div class="btns"><span>Remove now</span><span class="p">Keep waiting</span></div></div>')
    p4 = phone_scene('phone', st, felt_main('phone', C), overlay=sheet, acts='<button class="act ghost">Host tools</button>')
    css = SYS_CSS + '''
.pb{position:absolute;left:12px;right:12px;top:62px;z-index:40;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:#3a2a10;box-shadow:inset 0 0 0 1px #f0b429;font-size:12.5px;animation:pb 2s ease-in-out infinite}
.pb .t{margin-left:auto;font-family:Fraunces;color:#f0b429}.pb b{color:#f0b429}
@keyframes pb{50%{box-shadow:inset 0 0 0 1px #f0b429,0 0 20px rgba(240,180,41,.35)}}
.pt{position:absolute;left:14px;right:14px;bottom:192px;z-index:40;padding:16px;border-radius:16px;background:rgba(15,9,6,.96);box-shadow:inset 0 0 0 1px rgba(201,161,91,.45),0 16px 40px rgba(0,0,0,.6);display:grid;gap:6px}
.pt b{font:italic 600 20px Fraunces;color:#ecd39b}.pt small{font-size:12.5px;color:#d8cbb2;line-height:1.45}
.pt div,.ps .btns{display:flex;gap:8px;margin-top:6px}.pt span,.ps .btns span{flex:1;text-align:center;padding:11px;border-radius:12px;font-weight:700;font-size:13.5px;box-shadow:inset 0 0 0 1px rgba(201,161,91,.45)}
.pt span.p,.ps .btns span.p{background:linear-gradient(180deg,#ecd39b,#c9a15b);color:#2a1a0e;box-shadow:none}
.pp{position:absolute;inset:0;z-index:40;background:rgba(10,6,4,.78);display:grid;place-items:center;padding:20px}
.pc{display:grid;justify-items:center;gap:8px;text-align:center;padding:22px 18px;border-radius:18px;background:#1b120d;box-shadow:inset 0 0 0 1px rgba(201,161,91,.45)}
.pc .ring{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#ecd39b 78%,rgba(255,255,255,.1) 0);position:relative}
.pc .ring::before{content:"";position:absolute;inset:5px;border-radius:50%;background:#1b120d}.pc .ring span{position:relative;font:600 18px Fraunces}
.pc b{font:italic 600 26px Fraunces;color:#ecd39b}.pc>small{font-size:13px;color:#d8cbb2;line-height:1.45}
.opts{display:grid;gap:8px;margin-top:6px;text-align:left}.opts div{font-size:12px;color:#b9a88b;line-height:1.4;padding:10px 12px;border-radius:10px;background:rgba(246,240,225,.05)}
.opts b{display:block;font:700 12.5px Figtree;color:#f3ead7;margin-bottom:2px}
.ps{position:absolute;left:0;right:0;bottom:0;z-index:40;padding:18px 18px 24px;border-radius:22px 22px 0 0;background:#1f150f;box-shadow:0 -20px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(201,161,91,.4);display:grid;gap:12px}
.ps .hd{display:flex;gap:12px;align-items:center}.ps .hd .av{--av:46px}.ps .hd b{display:block;font:italic 600 20px Fraunces}.ps .hd small{font-size:12px;color:#b9a88b}
.ps .row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(246,240,225,.05)}
.ps .row span{font-weight:700;font-size:14px}.ps .row small{grid-column:1;font-size:11.5px;color:#b9a88b}.ps .row i,.ps .row b{grid-row:1/span 2;grid-column:2}
.ps .row i{width:44px;height:26px;border-radius:13px;background:#2f8a63;position:relative}.ps .row i::after{content:"";position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff}
.ps .row b{font-family:Fraunces;color:#ecd39b}
'''
    body = ('<div class="tp sheet th-classic" style="width:1780px;height:1200px"><div><h1>Leaving, dropping out and coming back</h1>'
            '<p class="lede">Phones lose signal, screens lock and people go to get chai. None of that should cost anyone their seat or freeze the table. These are the four states every theme draws.</p></div><div class="sysw">'
            + col('1 · Signal drops', 'Your phone shows a banner, other players see a yellow "!" on your seat. Your turn clock keeps running; if it runs out you check if you can, otherwise fold. Nothing else is decided for you.', p1)
            + col('2 · You come back', 'Rejoin from the same phone or with the table code and your name. You land in your old seat with your chips. Missed hands are explained once.', p2)
            + col('3 · The host drops', 'The table pauses instead of breaking. Online, the server takes over after 2 minutes. Offline, everyone waits for the host phone.', p3)
            + col('4 · Someone stays away', 'After 2 missed turns a player is set to Away: they sit out, skip blinds, and the host decides how long to hold the seat.', p4)
            + '</div></div>')
    return write('sys-presence.dc.html', doc(C, 'Presence and reconnecting', 1780, 1200, body, css))

if __name__ == '__main__':
    for f in (crowd(), odds(), presence()): print(f)

THEME_INFO = [
 ('Classic', 'The app as it is today', 'Fraunces · Figtree', 'Marco', '#1b120d', '#0f4a3b', '#4a2c1c', '#ecd39b', '#f3ead7', 'Classic'),
 ('Noir', 'Black lacquer, champagne hairlines', 'Cormorant · Jost', 'none', '#0b0b0c', '#151517', '#c8a96a', '#c8a96a', '#ede6d6', 'Minimal'),
 ('Ivory', 'Cream letterpress, forest felt, saddle leather', 'DM Serif · DM Sans', 'none', '#f3eee4', '#1f4a3a', '#b88a5d', '#1f4a3a', '#22261f', 'Minimal'),
 ('Velvet', 'Oxblood velvet, tufted leather, champagne piping', 'Bodoni Moda · Manrope', 'none', '#1a080d', '#4a0f1c', '#5a1422', '#e6c995', '#f6e9dc', 'Minimal'),
 ('Cyber', 'Anime cyberpunk croupier, plum and magenta', 'Chakra Petch · Share Tech Mono', 'Vex', '#120a18', '#2a1435', '#ff2e88', '#ff2e88', '#f1e9ff', 'Fancy'),
 ('Ink', 'Manga panels, screentone, ink SFX', 'Reggae One · M PLUS 1p', 'Kage', '#f5f2ea', '#ffffff', '#111111', '#e8202a', '#111111', 'Fancy'),
 ('Pixel', 'Hand-pixelled fantasy tavern by candlelight', 'Silkscreen · Pixelify Sans', 'Bram', '#1c120c', '#2f6b3a', '#6b4226', '#ffcf5a', '#f6e7c8', 'Fancy'),
 ('Night Train', 'Last train home, windows full of city', 'Zen Kaku Gothic · VT323', 'Hoshi', '#12263a', '#2f5d50', '#8a9ea2', '#8fc93a', '#eaf2f0', 'Fancy'),
 ('Edo', 'Woodblock prints, waves, a fox spirit', 'Shippori Mincho · Yuji Syuku', 'Kitsune', '#efe3c8', '#24386f', '#6b301c', '#d2422d', '#1e2a4a', 'Fancy'),
]
def main_board():
    def tile(t):
        n, tag, fonts, dealer, bg, felt, rim, acc, tx, grp = t
        return (f'<div class="tt" style="background:{bg};color:{tx}"><div class="mini"><div class="ov" style="background:{felt};box-shadow:0 0 0 6px {rim}"></div>'
                f'<span class="c1"></span><span class="c2" style="background:{acc}"></span></div>'
                f'<div class="tx"><b>{n}</b><small>{tag}</small><em style="color:{acc}">{fonts}{" · dealer " + dealer if dealer != "none" else " · no dealer"}</em></div></div>')
    grp = lambda g: ''.join(tile(t) for t in THEME_INFO if t[-1] == g)
    st = ('<div class="tp full th-classic set"><div class="sh2">Settings</div><b class="h">Theme</b><div class="pick">'
          + ''.join(f'<span class="{"on" if t[0]=="Classic" else ""}" style="background:{t[4]};color:{t[8]}"><i style="background:{t[5]};box-shadow:0 0 0 3px {t[6]}"></i>{t[0]}</span>' for t in THEME_INFO)
          + '</div><p class="note">Only changes your screen. Everyone at the table can pick a different one. All 9 are inside the app, so they work offline.</p>'
          '<b class="h">Motion</b><div class="seg"><span>Full</span><span class="on">Calm</span><span>Off</span></div>'
          '<b class="h">Win animations</b><div class="seg"><span class="on">All tiers</span><span>Big hands only</span><span>Off</span></div>'
          '<div class="tg"><span>Four-colour deck</span><i class="y"></i></div><div class="tg"><span>Vibrate on my turn</span><i class="y"></i></div><div class="tg"><span>Sounds</span><i></i></div></div>')
    css = '''
.mainw{display:grid;grid-template-columns:1fr 390px;gap:44px;flex:1;min-height:0}
.grp{display:grid;gap:10px}.grp>span{font:700 11px Figtree;letter-spacing:.28em;text-transform:uppercase;color:#b9a88b}
.row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.row5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.tt{border-radius:16px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 10px 24px rgba(0,0,0,.35)}
.tt .mini{position:relative;height:110px}.tt .ov{position:absolute;left:18%;right:18%;top:22px;bottom:18px;border-radius:999px}
.tt .c1,.tt .c2{position:absolute;top:44px;width:24px;height:34px;border-radius:4px;background:#f6f0e1;box-shadow:0 3px 8px rgba(0,0,0,.4)}.tt .c1{left:calc(50% - 27px)}.tt .c2{left:calc(50% + 3px)}
.tt .tx{padding:4px 14px 14px;display:grid;gap:3px}.tt b{font:600 19px Fraunces}.tt small{font-size:12px;opacity:.8;line-height:1.35}.tt em{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em}
.set{border-radius:30px;padding:22px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 0 0 1px rgba(201,161,91,.3)}
.set .sh2{font:600 26px Fraunces}.set .h{font-size:13px;color:#b9a88b;margin-top:6px}
.pick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pick span{border-radius:12px;padding:10px 6px 8px;display:grid;justify-items:center;gap:6px;font-size:11.5px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.pick span.on{box-shadow:inset 0 0 0 2px #ecd39b}.pick i{width:44px;height:24px;border-radius:12px}
.note{font-size:11.5px;color:#b9a88b;line-height:1.45}
.seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(246,240,225,.06)}.seg span{flex:1;text-align:center;padding:9px 2px;border-radius:9px;font-size:12.5px;font-weight:700;color:#b9a88b}.seg span.on{background:#ecd39b;color:#2a1a0e}
.tg{display:flex;align-items:center;justify-content:space-between;font-size:14px;padding:4px 2px}.tg i{width:44px;height:26px;border-radius:13px;background:rgba(246,240,225,.15);position:relative}.tg i::after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff}.tg i.y{background:#2f8a63}.tg i.y::after{left:21px}
'''
    body = ('<div class="tp sheet th-classic" style="width:1440px;height:960px"><div><h1>Train Poker: nine themes</h1>'
            '<p class="lede">Every player picks their own theme; it only changes their screen. One Classic theme exactly like today\'s app, three quiet luxury themes, five full-character themes with their own dealer, deck, chips and win animations. Rows below go theme by theme: loading, menu, phone table, laptop table, win tiers, leaving and rejoining, micro-animations, the theme picker on every screen, deck and dealer.</p></div>'
            f'<div class="mainw"><div style="display:grid;gap:22px;align-content:start"><div class="grp"><span>Classic and minimal</span><div class="row3" style="grid-template-columns:repeat(4,minmax(0,1fr))">{grp("Classic")}{grp("Minimal")}</div></div>'
            f'<div class="grp"><span>Fancy</span><div class="row5">{grp("Fancy")}</div></div></div>{st}</div></div>')
    return write('Main.dc.html', doc(C, 'Train Poker themes', 1440, 960, body, css))

if __name__ == '__main__':
    print(main_board())
