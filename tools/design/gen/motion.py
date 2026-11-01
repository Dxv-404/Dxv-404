"""Table micro-animations. Every move is a transform between anchors the layout engine already knows (the deck, each seat,
each bet spot, the pot), so nothing reflows and nothing can land on top of something else at any screen size.
Themes only change the feel: easing, speed, and for Pixel, stepped frames."""
import re
from builders import *
from responsive import frame as rframe, mode_for

# motion tokens per theme: easing, speed multiplier, one-line description of the feel
FEEL = {
 'classic': ('cubic-bezier(.2,.7,.2,1)', 1.0, 'Plain and quick, like a good dealer: things slide, settle, and stop.'),
 'noir': ('cubic-bezier(.4,0,.2,1)', 1.25, 'A quarter slower than Classic, long soft stops. Nothing bounces.'),
 'ivory': ('cubic-bezier(.3,.8,.3,1)', 1.1, 'Paper-light: a little float at the end of each move, no overshoot.'),
 'velvet': ('cubic-bezier(.4,0,.2,1)', 1.2, 'Unhurried and smooth, like chips pushed across cloth.'),
 'cyber': ('cubic-bezier(.15,.9,.25,1)', .85, 'Fast in, hard stop. Tags appear with a single-frame flicker.'),
 'ink': ('cubic-bezier(.2,1.35,.4,1)', .9, 'Snappy with a small overshoot, like a panel being slapped down.'),
 'pixel': ('steps(6, end)', 1.0, 'Six frames per move and whole-pixel positions, like a real sprite game.'),
 'train': ('cubic-bezier(.3,.6,.3,1)', 1.0, 'Smooth acceleration and a gentle brake, like the carriage doors.'),
 'edo': ('cubic-bezier(.25,.8,.25,1)', 1.1, 'Chips travel in a slight arc and settle softly, like a brush lifting.'),
}

SPEC = [
 ('Shuffle and cut', 'Start of every hand', '0.9 s', 'The deck splits, riffles back together and is cut once. Plays at the dealer spot only.'),
 ('Deal', 'Two cards to each player', '70 ms per card', 'Each card glides from the deck to the seat and settles with a small turn. Yours flip face-down into your hand.'),
 ('Check', 'A player checks', '0.4 s', 'Two quick taps on the seat, then the "Check" tag fades in.'),
 ('Call', 'A player calls', '0.3 s', 'Chips slide from the seat to the bet spot; the amount fades in when they land, the stack ticks down.'),
 ('Raise', 'A player bets or raises', '0.35 s', 'Same slide, a second chip lands on top, the tag pops in with a tiny overshoot.'),
 ('All-in', 'A player goes all-in', '0.5 s', 'The whole stack slides in, one soft glow on the seat. It does not loop.'),
 ('Fold', 'A player folds', '0.28 s', 'The cards slide toward the middle and fade, the seat dims and shrinks a little.'),
 ('Bets to pot', 'End of each betting round', '0.4 s', 'All bets glide into the pot together, 40 ms apart; the pot number rolls to the new total.'),
 ('Pot to winner', 'Hand won', '0.5 s', 'Up to five chips stream to the winner, their stack rolls up, one glow on the plate.'),
 ('Your turn', 'Action reaches you', '0.3 s', 'Your buttons rise in 12 px, 40 ms apart; one short buzz on phones.'),
]

def phone_parts(th, states=None):
    states = states or phone_states()
    players = order('phone')
    g = GEO['phone']
    cx, cy = place('phone', [dict(s) for s in states], players)
    return states, players, cx, cy

def add_vars(html_, cls, values):
    """insert CSS vars into the style of the k-th element whose class starts with cls"""
    out, k = [], 0
    def rep(m):
        nonlocal k
        if k < len(values):
            v = values[k]; k += 1
            return m.group(0).replace('style="', 'style="' + ''.join(f'--{a}:{b};' for a, b in v.items()), 1)
        return m.group(0)
    return re.sub(r'<div class="' + cls + r'[ "][^>]*style="', rep, html_)

def scene(th, idx, y0):
    """one vignette: a full phone frame with the given move, cropped to a 390 x 440 window starting at y0"""
    st = phone_states()
    for s in st: s.pop('status', None)
    tagfix = {}
    if idx in (0, 1):   # nobody has acted yet
        for s in st: s.pop('bet', None); s['tag'] = ('', '') if 'fold' not in s.get('cls', '') else s['tag']; s['cls'] = s.get('cls', '').replace('fold', '').replace('away', '')
    sts = [dict(s) for s in st]
    players = order('phone')
    cx, cy = place('phone', sts, players)
    deck = (cx, 100)
    potx, poty = cx, cy + 23
    felt = felt_main('phone', th)
    tbl = table_block(th, 'phone', [dict(s) for s in st], players, felt)
    # per-seat vectors: from the deck to the seat, and from the seat to the pot
    sv = [dict(dx=f'{deck[0] - s["x"]:.0f}px', dy=f'{deck[1] - s["y"]:.0f}px', px=f'{potx - s["x"]:.0f}px', py=f'{poty - s["y"]:.0f}px', i=k) for k, s in enumerate(sts)]
    tbl = add_vars(tbl, 'seat', sv)
    bv = [dict(sx=f'{s["x"] - s["bx"]:.0f}px', sy=f'{s["y"] - s["by"]:.0f}px', px=f'{potx - s["bx"]:.0f}px', py=f'{poty - s["by"]:.0f}px', i=k) for k, s in enumerate([s for s in sts if 'bx' in s])]
    tbl = add_vars(tbl, 'bet', bv)
    extra = ''
    if idx == 0:
        half = lambda side: ''.join(f'<span class="mvc" style="--k:{k};--s:{side}">{back(24)}</span>' for k in range(4))
        extra = f'<div class="mv-deck" style="left:{deck[0]}px;top:{deck[1]}px"><span class="mvh l">{half(-1)}</span><span class="mvh r">{half(1)}</span></div>'
    if idx == 8:
        win = sts[3]
        extra = ''.join(f'<span class="mv-fly" style="left:{potx}px;top:{poty}px;--tx:{win["x"] - potx:.0f}px;--ty:{win["y"] - poty:.0f}px;--k:{k}">{chip("a" if k % 2 else "b")}</span>' for k in range(5))
    arena_tag = f' mv{idx}'
    inner = (f'<div class="fx" aria-hidden="true">{th.bg("phone")}</div>' + topbar(th, 'phone', 'Hand 23', 'Blinds 10 / 20 · 10 players')
             + f'<div class="arena{arena_tag}">{th.arena_deco("phone")}{dealer_block(th, "phone")}{tbl}{extra}</div>'
             + f'<section class="hero">{hold()}<div class="hmeta"><span class="hname">Dev · your turn</span><span class="hstack">1,840</span><span class="hhint"><span class="s1">Hold your cards to look</span><span class="s2">Two pair, Aces and Kings</span></span></div><div class="tbank"><span class="rg"><span>18</span></span>sec</div></section>'
             + '<nav class="actions"><button class="act fold">Fold</button><button class="act call">Call<small>120</small></button><button class="act raise">Raise<small>240+</small></button></nav>')
    return f'<div class="mv-tile"><div class="mv-crop" style="margin-top:-{y0}px"><div class="tp phone dense th-{th.key} mvp{idx}">{inner}</div></div></div>'

# which seat each single-seat move uses (index into phone_states order)
SEAT_FOR = {2: 7, 3: 0, 4: 5, 5: 6, 6: 2}
def motion_css(th):
    ease, k, _ = FEEL[th.key]
    T = f'calc(2.8s * {k})'
    E = ease
    c = f'.th-{th.key}{{--m-ease:{E}}}\n'
    c += '''
.mv-tile{width:390px;height:440px;overflow:hidden;position:relative;border-radius:18px;box-shadow:0 0 0 1px var(--line),0 14px 30px rgba(0,0,0,.3)}
.mv-crop{position:relative}
.mv-deck{position:absolute;z-index:7;width:0;height:0}
.mv-deck .mvh{position:absolute;left:-12px;top:-17px}
.mv-deck .mvc{position:absolute;left:0;top:calc(var(--k) * -1.5px)}
.mv-fly{position:absolute;z-index:8;width:20px;height:20px;margin:-10px 0 0 -10px}.mv-fly .chip{width:20px;height:20px}
'''
    def kf(name, body): return f'@keyframes {name}-{th.key}{{{body}}}\n'
    a = lambda name, extra='': f'animation:{name}-{th.key} {T} var(--m-ease) infinite{extra}'
    # 0 shuffle & cut
    c += f'.mvp0 .mvh.l{{{a("mvl")}}}.mvp0 .mvh.r{{{a("mvr")}}}.mvp0 .mvc{{{a("mvri")};animation-delay:calc(var(--k) * 40ms)}}\n'
    c += kf('mvl', '0%,6%{transform:none}22%,46%{transform:translateX(-20px) rotate(-6deg)}60%,100%{transform:none}')
    c += kf('mvr', '0%,6%{transform:none}22%,46%{transform:translateX(20px) rotate(6deg)}60%,68%{transform:none}78%{transform:translate(16px,-18px)}90%,100%{transform:none}')
    c += kf('mvri', '0%,30%{translate:0 0}38%{translate:0 -4px}46%,100%{translate:0 0}')
    # 1 deal: every seat's two backs travel from the deck; the hero's cards too
    c += f'.mvp1 .seat .backs .cd{{{a("mvdeal")};animation-delay:calc(var(--i) * 70ms)}}.mvp1 .seat .backs .cd+.cd{{animation-delay:calc(var(--i) * 70ms + 700ms)}}\n'
    c += kf('mvdeal', '0%{transform:translate(calc(var(--dx) - 10px),calc(var(--dy) + 10px)) rotate(-40deg) scale(.9);opacity:0}2%{opacity:1}14%,88%{transform:none;opacity:1}100%{opacity:0}')
    c += f'.mvp1 .hc .flip{{{a("mvdealh")};animation-delay:1.4s}}\n'
    c += kf('mvdealh', '0%{translate:60px -520px;opacity:0}3%{opacity:1}16%,88%{translate:0 0;opacity:1}100%{opacity:0}')
    # single-seat moves
    def seat_sel(i): return f'.mvp{{n}} .seat:nth-of-type(n)'
    # the seats are emitted after bets/dealer button; select by data-n instead
    names = [p['n'] for p in order('phone')]
    sel = lambda idx: f'.mvp{idx} .seat[data-n="{names[SEAT_FOR[idx]]}"]'
    # 2 check: two taps then the tag
    c += f'{sel(2)} .av{{{a("mvtap")}}}{sel(2)} .tag{{{a("mvtag")}}}\n'
    c += kf('mvtap', '0%,10%{translate:0 0}14%{translate:0 3px}18%{translate:0 0}22%{translate:0 3px}26%,100%{translate:0 0}')
    c += kf('mvtag', '0%,26%{opacity:0;translate:0 -4px}34%,88%{opacity:1;translate:0 0}100%{opacity:0}')
    # 3 call / 4 raise / 5 all-in: the seat's bet travels from the seat
    for idx in (3, 4, 5):
        bsel = f'.mvp{idx} .bet[style*="--i:{[k for k, s in enumerate([s for s in phone_states() if "bet" in s])][[i for i, s in enumerate(phone_states()) if "bet" in s].index(SEAT_FOR[idx])]};"]'
        c += f'{bsel}{{{a("mvbet")}}}{bsel} span{{{a("mvamt")}}}{sel(idx)} .tag{{{a("mvtag2" if idx != 3 else "mvtag")}}}\n'
    c += kf('mvbet', '0%,8%{translate:var(--sx) var(--sy);opacity:0}10%{opacity:1}24%,88%{translate:0 0;opacity:1}100%{opacity:0}')
    c += kf('mvamt', '0%,24%{opacity:0}30%,88%{opacity:1}100%{opacity:0}')
    c += kf('mvtag2', '0%,22%{opacity:0;scale:.8}28%{opacity:1;scale:1.08}32%,88%{opacity:1;scale:1}100%{opacity:0}')
    c += f'.mvp4 .bet[style*="--i:3;"] .chip{{filter:drop-shadow(0 -4px 0 rgba(0,0,0,.25))}}'
    c += f'{sel(5)} .av{{{a("mvglow")}}}\n'
    c += kf('mvglow', '0%,26%{filter:none}34%{filter:drop-shadow(0 0 10px var(--acc))}50%,100%{filter:none}')
    # 6 fold
    c += f'{sel(6)}{{{a("mvfold")}}}{sel(6)} .backs{{{a("mvfoldc")}}}{sel(6)} .tag{{{a("mvtag")}}}\n'
    c += kf('mvfold', '0%,12%{opacity:1;scale:1}26%,88%{opacity:.55;scale:.9}100%{opacity:1;scale:1}')
    c += kf('mvfoldc', '0%,8%{transform:none;opacity:1}22%,88%{transform:translate(calc(var(--px) * .25),calc(var(--py) * .25)) rotate(30deg) scale(.6);opacity:0}100%{opacity:0}')
    # 7 bets to pot
    c += f'.mvp7 .bet{{{a("mvpot")};animation-delay:calc(var(--i) * 40ms)}}.mvp7 .pot strong{{{a("mvroll")}}}\n'
    c += kf('mvpot', '0%,10%{translate:0 0;opacity:1}26%{translate:var(--px) var(--py);opacity:.9}30%,90%{translate:var(--px) var(--py);opacity:0}100%{translate:0 0;opacity:0}')
    c += kf('mvroll', '0%,26%{translate:0 0;opacity:1}29%{translate:0 -6px;opacity:0}31%{translate:0 6px;opacity:0}35%,100%{translate:0 0;opacity:1}')
    # 8 pot to winner
    c += f'.mvp8 .mv-fly{{{a("mvwin")};animation-delay:calc(var(--k) * 50ms)}}.mvp8 .pot{{{a("mvpotout")}}}.mvp8 .seat[data-n="{names[3]}"] .plate{{{a("mvplate")}}}\n'
    c += kf('mvwin', '0%,8%{translate:0 0;opacity:0}10%{opacity:1}30%{translate:calc(var(--tx) * .5) calc(var(--ty) * .5 - 16px)}44%{translate:var(--tx) var(--ty);opacity:1}50%,100%{translate:var(--tx) var(--ty);opacity:0}')
    c += '.mvp8 .bet{display:none}'
    c += kf('mvpotout', '0%,8%{opacity:1}20%,90%{opacity:.35}100%{opacity:1}')
    c += kf('mvplate', '0%,44%{box-shadow:var(--plsh)}52%{box-shadow:var(--plsh),0 0 0 2px var(--acc),0 0 16px var(--acc)}70%,100%{box-shadow:var(--plsh)}')
    # 9 your turn
    c += f'.mvp9 .act{{{a("mvact")}}}.mvp9 .act:nth-child(2){{animation-delay:40ms}}.mvp9 .act:nth-child(3){{animation-delay:80ms}}\n'
    c += kf('mvact', '0%,10%{translate:0 12px;opacity:0}22%,88%{translate:0 0;opacity:1}100%{opacity:0}')
    if th.key == 'cyber':
        c += '.th-cyber[class*=mvp] .tag{animation-timing-function:steps(1)!important}'
    return c

def build(th):
    ease, k, feel = FEEL[th.key]
    tiles = ''
    y0s = [40, 40, 140, 140, 140, 140, 140, 140, 140, 404]
    for i, (name, when, dur, how) in enumerate(SPEC):
        tiles += f'<div class="mv-col"><div class="cap"><em>{when} · {dur}</em><b>{name}</b><small>{how}</small></div>{scene(th, i, y0s[i])}</div>'
    css = motion_css(th) + '.mv-grid{display:grid;grid-template-columns:repeat(5,390px);gap:30px 28px}.mv-col{display:grid;gap:10px;align-content:start}.mv-col .cap{display:grid;gap:3px;min-height:92px;align-content:start}.mv-col .cap b{font:var(--dspw,700) 19px var(--dsp)}.mv-col .cap small{font-size:12.5px;color:var(--mut);line-height:1.4}.mv-col .cap em{font-style:normal;font:700 10.5px var(--num);letter-spacing:.1em;color:var(--acc);text-transform:uppercase}'
    body = (f'<div class="tp sheet th-{th.key}" style="width:2150px;height:1330px"><div><h1>{th.name}: table micro-animations</h1>'
            f'<p class="lede">{feel} Every move goes between points the layout engine already knows, so it looks the same and stays clear of everything at any screen size. Each one loops here; in the game it plays once.</p></div>'
            f'<div class="mv-grid">{tiles}</div></div>')
    return write(f'{th.key}-motion.dc.html', doc(th, f'{th.name} micro-animations', 2150, 1330, body, css + th.board_css('motion')))


# ---------- one hand in motion, on three different screens (proof that the anchors move with the layout) ----------
def seq_post(tbl, key, states, cw):
    g = GEO[key]; cx, cy = g['tl'] + g['tw'] / 2, g['tt'] + g['th'] / 2
    deck = (cx, g['tt'] - 4)
    potx, poty = cx, cy - (cw * 1.4 + 61) / 2 + cw * 1.4 + 21
    sv = [dict(dx=f'{deck[0] - s["x"]:.0f}px', dy=f'{deck[1] - s["y"]:.0f}px', i=k) for k, s in enumerate(states)]
    tbl = add_vars(tbl, 'seat', sv)
    bets = [s for s in states if 'bx' in s]
    tbl = add_vars(tbl, 'bet', [dict(sx=f'{s["x"] - s["bx"]:.0f}px', sy=f'{s["y"] - s["by"]:.0f}px', px=f'{potx - s["bx"]:.0f}px', py=f'{poty - s["by"]:.0f}px', i=k) for k, s in enumerate(bets)])
    full = [s for s in states if 'mini' not in s.get('cls', '') and 'fold' not in s.get('cls', '')]
    win = full[len(full) // 2]
    tbl += ''.join(f'<span class="mv-fly sq" style="left:{potx:.0f}px;top:{poty:.0f}px;--tx:{win["x"] - potx:.0f}px;--ty:{win["y"] - poty:.0f}px;--k:{k}">{chip("a" if k % 2 else "b")}</span>' for k in range(5))
    return tbl

SEQ_CSS = """
.sq-run .seat .backs .cd{animation:sqdeal 6s var(--m-ease) infinite;animation-delay:calc(var(--i) * 50ms)}
@keyframes sqdeal{0%{transform:translate(var(--dx),var(--dy)) rotate(-40deg);opacity:0}2%{opacity:1}12%,94%{transform:none;opacity:1}100%{opacity:0}}
.sq-run .bet{animation:sqbet 6s var(--m-ease) infinite;animation-delay:calc(var(--i) * 60ms)}
@keyframes sqbet{0%,22%{translate:var(--sx) var(--sy);opacity:0}24%{opacity:1}32%,52%{translate:0 0;opacity:1}62%{translate:var(--px) var(--py);opacity:.9}64%,100%{translate:var(--px) var(--py);opacity:0}}
.sq-run .mv-fly{position:absolute;z-index:8;width:18px;height:18px;margin:-9px 0 0 -9px;opacity:0;animation:sqwin 6s var(--m-ease) infinite;animation-delay:calc(var(--k) * 50ms)}
.sq-run .mv-fly .chip{width:18px;height:18px}
@keyframes sqwin{0%,74%{translate:0 0;opacity:0}76%{opacity:1}84%{translate:calc(var(--tx) * .5) calc(var(--ty) * .5 - 14px)}90%{translate:var(--tx) var(--ty);opacity:1}93%,100%{translate:var(--tx) var(--ty);opacity:0}}
.mvs-row{display:flex;gap:36px;align-items:flex-start}.mvs-c{display:grid;gap:10px}.mvs-c b{font:600 18px Fraunces}.mvs-c small{font-size:12.5px;color:#b9a88b}
.mvs-f{position:relative;overflow:hidden;border-radius:18px;box-shadow:0 0 0 1px rgba(201,161,91,.3),0 16px 36px rgba(0,0,0,.4)}.mvs-in{position:absolute;left:0;top:0;transform-origin:0 0}
.mv-spec{display:grid;grid-template-columns:150px 170px 100px 1fr;gap:0;font-size:13px;line-height:1.4;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(201,161,91,.25)}
.mv-spec>span{padding:9px 12px;border-bottom:1px solid rgba(201,161,91,.12)}.mv-spec>span.h{font-weight:800;color:#ecd39b;background:rgba(246,240,225,.05)}
.mv-feel{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mv-feel div{padding:10px 12px;border-radius:12px;background:rgba(246,240,225,.05);font-size:12.5px;line-height:1.4;color:#d8cbb2}.mv-feel b{display:block;color:#ecd39b;font-size:13px}
"""

def sys_board(th):
    from responsive import frame as rf
    cols = ''
    for name, W, H, n in [('Small phone, 12 players', 360, 740, 12), ('Phone sideways, 8 players', 844, 390, 8), ('Laptop, 10 players', 1440, 900, 10)]:
        s = min(560 / H, 640 / W)
        f, mode, u = rf(th, W, H, n, cls='sq-run', post=seq_post)
        cols += f'<div class="mvs-c"><b>{name}</b><small>{W} × {H}: deal, bets in, bets to the pot, pot to the winner</small><div class="mvs-f" style="width:{W * s:.0f}px;height:{H * s:.0f}px"><div class="mvs-in" style="transform:scale({s:.4f})">{f}</div></div></div>'
    spec = '<span class="h">Move</span><span class="h">When</span><span class="h">Length</span><span class="h">What happens</span>' + ''.join(f'<span><b>{a}</b></span><span>{b}</span><span>{c}</span><span>{d}</span>' for a, b, c, d in SPEC)
    feel = ''.join(f'<div><b>{k.title() if k != "train" else "Night Train"}</b>{v[2]}</div>' for k, v in FEEL.items())
    rules = ('<div class="rules">'
             '<div><b>Only transform and opacity.</b> No move changes layout, so nothing can be pushed into anything else, and it stays smooth on cheap phones.</div>'
             '<div><b>Anchors come from the layout engine.</b> The deck, every seat, every bet spot and the pot are worked out for the current screen, so the same move lands correctly on a 360 px phone and a 1920 px monitor.</div>'
             '<div><b>Never queued.</b> If the next action arrives while a move is still playing, the move jumps to its end. The table never falls behind the game.</div>'
             '<div><b>Calm by default.</b> Only the turn timer ever loops. At most five chips fly at once. Numbers roll in a fixed-width slot so nothing shifts sideways.</div>'
             '<div><b>Reduce motion.</b> Settings → Motion → Off (or the phone\'s own setting) turns every travel into a 120 ms fade.</div></div>')
    body = ('<div class="tp sheet th-classic" style="width:2240px;height:1440px"><div><h1>Table micro-animations: the rules for every theme</h1>'
            '<p class="lede">Small, quick and quiet. Each theme only changes the feel (easing and speed); the moves themselves are the same everywhere. Below, one hand plays on three very different screens using the anchors from the layout engine.</p></div>'
            f'<div class="mvs-row">{cols}</div>'
            f'<div style="display:grid;grid-template-columns:1.25fr 1fr;gap:36px"><div class="mv-spec">{spec}</div><div style="display:grid;gap:14px;align-content:start">{rules}<div class="mv-feel">{feel}</div></div></div></div>')
    from sysboards import SYS_CSS
    return write('sys-motion.dc.html', doc(th, "Micro-animation rules", 2240, 1440, body, SYS_CSS + SEQ_CSS + f'.th-classic{{--m-ease:{FEEL["classic"][0]}}}'))
