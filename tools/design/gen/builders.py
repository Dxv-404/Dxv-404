from core import *

TIERS = [
 ('Tier 1', 'Small win', 'Pot won without a showdown, or high card up to two pair. About 1.5 seconds: a strip slides over the felt and the table keeps going underneath.', '1.5 s'),
 ('Tier 2', 'Good hand', 'Three of a kind, straight, flush. About 3 seconds: the table dims and the hand gets a full-screen moment. Tap to skip.', '3 s'),
 ('Tier 3', 'Big hand', 'Full house, four of a kind. About 4.5 seconds of arcade: several beats, the dealer cuts in, the screen shakes. Tap to skip.', '4.5 s'),
 ('Tier 4', 'Legendary', 'Straight flush, royal flush. About 7 seconds, played on every phone at the table at once. Everything the theme has, then a trophy on the winner\'s card.', '7 s'),
 ('Moment', 'Bust-out', 'Bust-out, bad beat, biggest pot, comeback: short scenes of their own, never louder than tier 2.', '3 s'),
]

class Theme:
    key = 'x'; name = 'X'; dealer_name = None
    hand_title = 'Hand 23'; bubble = 'Riya raises to 120. Your move, Dev.'
    logo_txt = 'Train Poker'
    @property
    def css(self): return f't-{self.key}.css'
    def sprite(self): return suit_symbols() + self.chips() + self.back_symbol() + self.faces()
    def chips(self):
        return ('<symbol id="ch-a" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="var(--c1)"/><circle cx="12" cy="12" r="7" fill="var(--c2)"/></symbol>'
                '<symbol id="ch-b" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="var(--c2)"/><circle cx="12" cy="12" r="7" fill="var(--c1)"/></symbol>')
    def back_symbol(self): return '<symbol id="cb" viewBox="0 0 50 70"></symbol>'
    def faces(self): return ''
    def avatar(self, p, ctx):
        return f'<span class="ini h{p["hue"]}">{p["i"]}</span>'
    def dealer(self, pose='idle', ctx='phone'): return ''
    def bg(self, kind): return ''
    def arena_deco(self, kind): return ''
    def felt_deco(self, kind): return ''
    def logo(self, ctx): return f'<div class="lg">{self.logo_txt}</div>'
    def tier(self, i): return ('', '')
    def t3(self): return ('', '')
    def t4(self): return ('', '')
    def tier_set(self): return [self.tier(1), self.tier(2), self.t3(), self.t4(), self.tier(4)]
    def side(self): return default_side(self)
    def deck_extra(self): return ''
    def poses(self): return []
    def loading_extra(self): return ''
    def menu_extra(self): return ''
    def board_css(self, kind): return ''

def dealer_block(th, kind):
    d = th.dealer('idle', kind)
    if not d: return ''
    nm = f'<span class="dn">{th.dealer_name}</span>' if th.dealer_name else ''
    return f'<div class="dealer">{d}{nm}</div>'

# ---------------- phone table ----------------
def phone_body(th, states=None, felt=None, bubble=True, hero_hint=('Hold your cards to look', 'Two pair, Aces and Kings'), actions=None, extra_arena=''):
    states = states or phone_states()
    players = order('phone')
    felt = felt if felt is not None else felt_main('phone', th)
    bub = f'<div class="bubble" style="top:8px;left:calc(50% + 48px)">{th.bubble}</div>' if bubble and th.dealer_name else ''
    acts = actions or ('<button class="act fold">Fold</button><button class="act call tap">Call<small>120</small></button>'
                       '<button class="act raise">Raise<small>240+</small></button>')
    return (f'<div class="fx" aria-hidden="true">{th.bg("phone")}</div>'
            + topbar(th, 'phone', th.hand_title, 'Blinds 10 / 20 · 10 players')
            + f'<div class="arena">{th.arena_deco("phone")}{dealer_block(th, "phone")}{bub}'
            + table_block(th, 'phone', states, players, felt, dbtn_at=0) + extra_arena + '</div>'
            + f'<section class="hero" aria-label="Your seat">{hold()}<div class="hmeta"><span class="hname">Dev · your turn</span>'
            + f'<span class="hstack">1,840</span><span class="hhint"><span class="s1">{hero_hint[0]}</span><span class="s2">{hero_hint[1]}</span></span></div>'
            + '<div class="tbank"><span class="rg"><span>18</span></span>sec</div></section>'
            + f'<nav class="actions" aria-label="Your actions">{acts}</nav>')

def build_phone(th):
    body = f'<div class="tp phone dense th-{th.key}">{phone_body(th)}</div>'
    return write(f'{th.key}-phone.dc.html', doc(th, f'{th.name} phone table', 390, 844, body, th.board_css('phone')))

# ---------------- laptop ----------------
def default_side(th):
    rows = [(DEV, '1,840', 'You', 'me'), (P[3], '3,020', 'Hot streak', ''), (P[0], '2,310', 'Online', ''), (P[2], '1,505', 'Weak signal', ''),
            (P[10], '1,410', 'Back in 0:42', ''), (P[4], '1,000', 'Away 2:41', ''), (P[13], '880', 'Online', ''), (P[6], '0', 'All-in', '')]
    pl = ''.join(f'<div class="prow {c}"><span class="av">{th.avatar(p, "list")}</span><b>{p["n"]}</b><i>{s}</i><small>{t}</small></div>' for p, s, t, c in rows)
    return (f'<div class="tabs"><span class="on">Players</span><span>League</span><span>Replay</span><span>Chat</span></div>'
            f'<span class="sh">At the table · 15</span><div class="plist">{pl}</div>'
            f'<span class="sh">Watching · 2</span><div class="plist"><div class="prow"><span class="av">{th.avatar(P[12], "list")}</span><b>Kunal</b><small>spectator</small></div></div>'
            '<div class="log"><span><b>Riya</b> raises to 120</span><span><b>Ishaan</b> lost connection, seat held 0:42</span><span><b>Tara</b> calls 120</span><span>Turn: <b>K♣</b></span></div>')

def build_lap(th):
    states = lap_states()
    players = order('lap')
    bub = f'<div class="bubble" style="left:calc(50% + 66px);top:18px">{th.bubble}</div>' if th.dealer_name else ''
    body = (f'<div class="tp lap th-{th.key}"><div class="fx" aria-hidden="true">{th.bg("lap")}</div>'
            + topbar(th, 'lap', 'Friday Night Table', 'Hand 23 · blinds 10 / 20 · next level in 4 hands', '<span class="pill">15 playing · 2 watching</span>')
            + f'<div class="arena">{th.arena_deco("lap")}{dealer_block(th, "lap")}{bub}'
            + table_block(th, 'lap', states, players, felt_main('lap', th, '1,780'), dbtn_at=0) + '</div>'
            + '<div class="dock"><section class="hero" aria-label="Your seat">' + hold().replace('66px', '84px')
            + '<div class="hmeta"><span class="hname">Dev · your turn · rebuys left 1 of 2</span><span class="hstack">1,840</span>'
            + '<span class="hhint"><span class="s1">Hold cards or Space to look</span><span class="s2">Two pair, Aces and Kings</span></span></div></section>'
            + '<div class="actions"><div class="rb"><div class="presets"><span>Min</span><span>½ pot</span><span>¾ pot</span><span>Pot</span><span>All-in</span></div><div class="slider"></div></div>'
            + '<button class="act fold">Fold <kbd>F</kbd></button><button class="act call tap">Call 120 <kbd>C</kbd></button><button class="act raise">Raise to 680 <kbd>R</kbd></button></div></div>'
            + f'<aside class="side">{th.side()}</aside></div>')
    return write(f'{th.key}-laptop.dc.html', doc(th, f'{th.name} laptop table', 1440, 900, body, th.board_css('lap')))

# ---------------- menu ----------------
MENU_CSS = '''
.menu .mm{position:absolute;inset:0;display:flex;flex-direction:column;padding:20px 20px 0;gap:14px;z-index:2}
.menu .me{display:flex;align-items:center;gap:12px}
.menu .me .av{--av:52px}
.menu .me b{display:block;font-size:17px}
.menu .me small{font-size:12px;color:var(--mut)}
.menu .lgw{padding:6px 0 0;text-align:center}
.menu .card2{border-radius:var(--r-panel,16px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line));padding:16px;display:grid;gap:12px}
.menu .card2 h2{font:var(--dspw,700) 19px var(--dsp)}
.menu .slots{display:flex;gap:8px}
.menu .slots span{flex:1;height:56px;border-radius:var(--r-btn,12px);display:grid;place-items:center;font:var(--numw,700) 28px var(--num);background:var(--bg);box-shadow:inset 0 0 0 1.5px var(--line);color:var(--tx)}
.menu .slots span.f{box-shadow:inset 0 0 0 1.5px var(--acc)}
.menu .slots span.c::after{content:"";width:2px;height:28px;background:var(--acc);animation:caret 1s steps(1) infinite}
@keyframes caret{50%{opacity:0}}
.menu .bigb{height:54px;border-radius:var(--r-btn,12px);display:grid;place-items:center;font-weight:800;font-size:16px}
.menu .bigb.p{background:var(--b-call);color:var(--b-calltx);box-shadow:var(--b-callsh,none)}
.menu .bigb.s{background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--tx)}
.menu .or{text-align:center;font-size:11px;letter-spacing:.24em;color:var(--mut)}
.menu .crew{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.menu .stk{display:flex}.menu .stk .av{--av:26px;margin-left:-8px}.menu .stk .av:first-child{margin-left:0}
.menu .crew b{flex:1;font-size:14px}.menu .crew b small{display:block;font-size:11px;color:var(--mut);font-weight:500}
.menu .live{font:800 10.5px var(--num);padding:3px 8px;border-radius:99px;background:var(--acc);color:var(--acctx);letter-spacing:.06em}
.menu .rejoin{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--acc)}
.menu .rejoin .dot{width:8px;height:8px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 25%,transparent);animation:caret 1.6s ease-in-out infinite;flex:none}
.menu .rejoin span:nth-child(2){flex:1;display:grid;gap:2px}.menu .rejoin b{font-size:12.5px}.menu .rejoin small{font-size:11px;color:var(--mut)}
.menu .rejoin .rj{font-weight:800;font-size:13px;color:var(--acc)}
.menu .nav{margin-top:auto;display:flex;justify-content:space-around;padding:10px 0 20px;box-shadow:inset 0 1px 0 var(--line);font-size:11px;color:var(--mut)}
.menu .nav span{display:grid;justify-items:center;gap:3px}.menu .nav i{font-style:normal;font-size:17px}.menu .nav .on{color:var(--acc)}
'''
def build_menu(th):
    stk = lambda ps: '<span class="stk">' + ''.join(f'<span class="av">{th.avatar(p, "list")}</span>' for p in ps) + '</span>'
    body = (f'<div class="tp full menu th-{th.key}"><div class="fx" aria-hidden="true">{th.bg("menu")}</div><div class="mm">'
            f'<div class="me"><span class="av">{th.avatar(DEV, "menu")}</span><span><b>Dev</b><small>Tap to change name or picture</small></span>'
            '<span class="sp"></span><span class="ib" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg></span></div>'
            f'<div class="lgw">{th.logo("menu")}</div>'
            '<div class="card2"><h2>Join a table</h2><div class="slots"><span class="f">Q</span><span class="f">K</span><span class="c"></span><span></span></div>'
            '<div class="bigb p">Join</div></div><p class="or">OR</p><div class="bigb s">Host a new table</div>'
            '<span class="sh">Your crews</span>'
            f'<div class="crew">{stk([P[3], P[0], P[7], P[8]])}<b>Friday Night Table<small>13 friends · season 3</small></b><span class="live">LIVE</span></div>'
            '<div class="rejoin"><span class="dot"></span><span><b>You left Friday Night Table 4 min ago</b><small>Your seat and 1,840 chips are held for 6 more minutes</small></span><span class="rj">Rejoin</span></div>'
            f'{th.menu_extra()}'
            '<nav class="nav"><span class="on"><i>♠</i>Play</span><span><i>▤</i>League</span><span><i>↺</i>Replays</span><span><i>◐</i>Theme</span></nav>'
            '</div></div>')
    return write(f'{th.key}-menu.dc.html', doc(th, f'{th.name} main menu', 390, 844, body, MENU_CSS + th.board_css('menu')))

# ---------------- loading ----------------
def build_loading(th):
    cards = ['As', None, 'Kh', None, 'Qd', None, 'Jc', None, 'Ts', None, '9h', None, '8d', None]
    hx = ''.join((card(c, 80).replace('style="', f'style="--i:{k};') if c else back(80).replace('style="', f'style="--i:{k};')) for k, c in enumerate(cards))
    body = (f'<div class="tp full th-{th.key} loading"><div class="fx" aria-hidden="true">{th.bg("loading")}</div>'
            f'<div class="ld" aria-hidden="true"><div class="helix">{hx}</div></div>'
            f'<div class="logo">{th.logo("loading")}</div>{th.loading_extra()}'
            '<div class="ldbar"><i></i></div><p class="ldcap">Shuffling the deck</p><p class="skip">Plays on first open only · tap to skip</p></div>')
    return write(f'{th.key}-loading.dc.html', doc(th, f'{th.name} loading', 390, 844, body, th.board_css('loading')))

# ---------------- tiers ----------------
def build_tiers(th):
    frames, css = '', ''
    for i, ((lab, nm, txt, dur), (h, c)) in enumerate(zip(TIERS, th.tier_set())):
        css += c
        inner = phone_body(th, bubble=False, hero_hint=('Hand over', 'Next hand in 3'), actions='<button class="act ghost">Next hand in 3 · tap when ready</button>')
        frames += (f'<div class="tier"><div class="cap"><em>{lab} · {dur}</em><b>{nm}</b><small>{txt}</small></div>'
                   f'<div class="scr"><div class="tp phone dense th-{th.key} t{i}">{inner}<div class="bn">{h}</div></div></div></div>')
    body = (f'<div class="tp sheet th-{th.key}" style="width:2150px;height:1120px"><div><h1>{th.name}: win animations by tier</h1>'
            '<p class="lede">Every step up is a bigger moment than the last. Tier 1 is a strip over the felt, tier 2 takes the whole screen, tier 3 is a full arcade sequence and tier 4 throws everything the theme has at it. All of it loops here so you can watch it; in the game it plays once.</p></div>'
            f'<div class="tiers">{frames}</div></div>')
    return write(f'{th.key}-tiers.dc.html', doc(th, f'{th.name} win tiers', 2150, 1120, body, css + th.board_css('tiers')))

# ---------------- cards ----------------
DECK_CSS = '''
.bigflip{position:relative;--w:150px;width:150px;height:210px;perspective:700px}
.bigflip>.cd{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.bigflip>.cd:not(.dn){animation:bf 4s ease-in-out infinite}
.bigflip>.cd.dn{animation:bb 4s ease-in-out infinite}
@keyframes bf{0%,35%{transform:rotateY(180deg)}50%,85%{transform:rotateY(0)}100%{transform:rotateY(180deg)}}
@keyframes bb{0%,35%{transform:rotateY(0)}50%,85%{transform:rotateY(-180deg)}100%{transform:rotateY(0)}}
.ladder{display:flex;gap:16px;align-items:flex-end}
.ladder>div{display:grid;justify-items:center;gap:6px;font-size:11px;color:var(--mut);text-align:center}
.chipset{display:flex;gap:12px;align-items:center}
.chipset .chip{width:54px;height:54px}
'''
def build_cards(th):
    big = ''.join(f'<div>{card(c, 118)}<p class="lbl">{l}</p></div>' for c, l in [('Ks', 'King'), ('Qh', 'Queen'), ('Jd', 'Jack'), ('Ac', 'Ace'), ('Th', 'Ten')])
    lad = ''.join(f'<div>{card(c, w)}<span>{w}px<br>{l}</span></div>' for c, w, l in [('Th', 24, 'seat reveal'), ('Qd', 34, 'replay'), ('Ks', 46, 'phone board'), ('Ah', 66, 'your hand'), ('Tc', 74, 'laptop board'), ('7s', 96, 'laptop hand')])
    fours = ''.join(card(c, 54) for c in ['7s', '7h', '7d', '7c'])
    win = ''.join(card(c, 70, cl) for c, cl in [('As', 'win'), ('Ah', 'win'), ('Ks', 'win'), ('Kc', 'win'), ('2d', 'lose')])
    body = (f'<div class="tp sheet th-{th.key}" style="width:1200px;height:960px"><div><h1>{th.name}: the deck</h1>'
            f'<p class="lede">{th.deck_note}</p></div>'
            f'<div class="drow">{big}</div>'
            f'<div class="drow"><div>{back(150)}<p class="lbl">Card back</p></div>'
            f'<div><div class="bigflip">{card("Ah", 150)}{back(150)}</div><p class="lbl"><b>Hold to look: unchanged</b></p></div>'
            f'<div style="display:grid;gap:10px"><div class="ladder">{lad}</div><p class="lbl" style="text-align:left">Size ladder: rank and suit sit in separate zones at every size, so nothing collides</p></div></div>'
            f'<div class="drow"><div><div style="display:flex;gap:10px">{fours}</div><p class="lbl">Four colours, on by default</p></div>'
            f'<div><div class="chipset">{chip("a")}{chip("b")}<span class="dbtn" style="position:static;margin:0;width:42px;height:42px;font-size:18px">D</span></div><p class="lbl">Chips and dealer button</p></div>'
            f'<div><div class="board" style="gap:8px">{win}</div><p class="lbl">Showdown: winning five lift, the rest dim</p></div>{th.deck_extra()}</div></div>')
    return write(f'{th.key}-cards.dc.html', doc(th, f'{th.name} deck', 1200, 960, body, DECK_CSS + th.board_css('cards')))

# ---------------- dealer ----------------
def build_dealer(th):
    ps = ''.join(f'<div class="pose">{svg}<div class="cap"><b>{t}</b><small>{d}</small><q>{q}</q></div></div>' for t, d, svg, q in th.poses())
    body = (f'<div class="tp sheet th-{th.key}" style="width:1100px;height:960px"><div><h1>{th.dealer_title}</h1>'
            f'<p class="lede">{th.dealer_note}</p></div><div class="poses">{ps}</div></div>')
    return write(f'{th.key}-dealer.dc.html', doc(th, f'{th.name} dealer', 1100, 960, body, th.board_css('dealer')))

def build_all(th, dealer=True):
    out = [build_loading(th), build_menu(th), build_phone(th), build_lap(th), build_tiers(th), build_cards(th)]
    if dealer and th.poses(): out.append(build_dealer(th))
    return out
