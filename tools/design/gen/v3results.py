"""Who won, with what: the win scene names the winner and shows their hand, then the table turns everyone's cards over."""
import contextlib
from v3kit import *
import responsive
from responsive import frame as rf

RIVER = ['Ks', '7h', '2d', 'Kc', '9h']
BEST = {'Ks': 'win', '7h': 'win', 'Kc': 'win', '2d': 'lose', '9h': 'lose'}

def seats(step):
    """step: 'scene' (nothing shown), 'winner', 'all', 'split', 'fold', 'allin'"""
    F = lambda: dict(cls='fold', stack='960', cards=False)
    s = [dict(stack='1,610'), F(), F(), dict(stack='1,420'), dict(cls='away', cards=False, stack='1,000'),
         dict(stack='2,180'), F(), F(), F()]
    if step in ('winner', 'all', 'scene'):
        s[5].update(cls='win' if step != 'scene' else '', stack='3,480')
        if step != 'scene': s[5].update(shown=['Kh', '7d'], sw=26, tag=('win', 'Full house'))
    if step == 'all':
        s[0].update(shown=['Qh', 'Qd'], sw=24, cls='lose', tag=('', 'Two pair'))
        s[3].update(shown=['Ah', 'Kd'], sw=24, cls='lose', tag=('', 'Three kings'))
    if step == 'split':
        s[5].update(cls='win', shown=['Ah', '9c'], sw=26, tag=('win', 'Kings & nines'), stack='2,830')
        s[3].update(cls='win', shown=['Ad', '9d'], sw=26, tag=('win', 'Kings & nines'), stack='2,070')
        s[0].update(shown=['Qh', 'Qd'], sw=24, cls='lose', tag=('', 'Two pair'))
    if step == 'fold':
        for i in range(9): s[i] = F()
        s[2] = dict(cls='win', stack='1,240', tag=('win', '+240'))
    if step == 'allin':
        s[5].update(shown=['Kh', '7d'], sw=26, tag=('allin', '71%'), stack='0')
        s[8] = dict(shown=['Ah', 'Qh'], sw=26, tag=('allin', '29%'), stack='0')
    return s

def felt(step, cw):
    if step == 'fold':
        b = ''.join(card(c, cw) for c in ['Ks', '7h', '2d']) + slot(cw) + slot(cw)
        return f'<div class="board">{b}</div><div class="wpill fold"><b>Everyone folded</b><span>Kabir wins 240 · cards stay hidden</span></div>'
    if step == 'allin':
        b = ''.join(card(c, cw) for c in ['Ks', '7h', '2d']) + f'<div class="cd dn deal" style="--w:{cw}px"></div>' + slot(cw)
        return f'<div class="board">{b}</div><div class="wpill"><b>All-in · dealing the turn</b><span>Riya 71% · Tara 29%</span></div>'
    cls = (lambda c: BEST.get(c, '')) if step in ('winner', 'all') else (lambda c: 'win' if c in ('Ks', 'Kc', '9h') else 'lose') if step == 'split' else (lambda c: '')
    b = ''.join(card(c, cw, cls(c)) for c in RIVER)
    pill = {'winner': '<div class="wpill"><b>Riya wins 1,300</b><span>Full house, kings full of sevens</span></div>',
            'all': '<div class="wpill"><b>Riya wins 1,300</b><span>Full house, kings full of sevens</span></div>',
            'split': '<div class="wpill"><b>Split pot · 650 each</b><span>Meera and Riya: kings and nines, ace kicker</span></div>',
            'scene': f'<div class="pot">{chip("a")}<strong>1,300</strong>pot</div>'}[step]
    return f'<div class="board">{b}</div>{pill}'

@contextlib.contextmanager
def scene_states(step):
    o1, o2 = responsive.states_for, responsive.felt_for
    responsive.states_for = lambda n: (seats(step), order('lap')[:9])
    responsive.felt_for = lambda th, mode, n, cw: felt(step, cw)
    try: yield
    finally: responsive.states_for, responsive.felt_for = o1, o2

HERO_HIDE = 'Hold your cards to look'
def table(th, step, W=390, H=844, overlay='', you='Two pair, aces and kings'):
    with scene_states(step):
        f, mode, u = rf(th, W, H, 10, overlay=overlay)
    big = 70 if mode == 'lap' else (44 if mode == 'land' else 50)
    face = f'<div class="hc open">{card("As", big)}{card("Ah", big)}</div>'
    import re
    if step != 'fold': f = re.sub(r'<div class="hc"[^>]*>.*?<span class="thumb"></span></div>', face, f, count=1, flags=re.S)
    f = f.replace('Dev · your turn', 'Dev · showed').replace('<span class="hstack">1,840</span>', '<span class="hstack">1,610</span>')
    f = re.sub(r'<span class="s1">[^<]*</span><span class="s2">[^<]*</span>', f'<span class="s1">{you}</span><span class="s2">{you}</span>', f)
    f = re.sub(r'<nav class="actions"[^>]*>.*?</nav>', '<nav class="actions"><button class="act ghost nxt">Next hand in 5 · tap to skip<i></i></button></nav>', f, flags=re.S)
    f = re.sub(r'(<div class="actions">)<div class="rb">.*?</div></div>.*?(</div></div>)', r'\1<button class="act ghost nxt" style="flex:1">Next hand in 5 · Space to skip<i></i></button>\2', f, flags=re.S, count=1)
    return f

def strip(th, tierlab):
    return (f'<div class="wstrip"><div class="hrow">{av(th, P[7], 46, "menu")}<div class="txt"><small class="klbl">{tierlab}</small><b>Riya wins 1,300</b>'
            f'<span>Full house, kings full of sevens</span></div><div class="wcards">{card("Kh", 40, "win")}{card("7d", 40, "win")}</div></div>'
            f'<div class="best">{"".join(card(c, 30, "win") for c in ["Kh", "Ks", "Kc", "7d", "7h"])}<small>best five</small></div></div>')

def scene(th, i=2, lab='Tier 3 · big hand'):
    h, c = th.tier_set()[i]
    for a, b in [('Meera', 'Riya'), ('MEERA', 'RIYA'), ('meera', 'riya')]: h = h.replace(a, b)
    inner = phone_body(th, bubble=False, hero_hint=('Hand over', 'Next hand soon'), actions='<button class="act ghost">Tap to skip</button>')
    return (f'<div class="tp phone dense th-{th.key} t{i} scn" style="width:390px;height:844px">{inner}<div class="bn">{h}</div>{strip(th, lab)}</div>', c)

HANDS = [
    ('Royal flush', ['As', 'Ks', 'Qs', 'Js', 'Ts'], [], 4, 'Riya wins 2,400 with a royal flush'),
    ('Straight flush', ['9h', '8h', '7h', '6h', '5h'], [], 4, 'Riya wins 1,900 · straight flush, nine high'),
    ('Four of a kind', ['Qc', 'Qd', 'Qh', 'Qs', '7d'], ['7d'], 3, 'Riya wins 1,600 · four queens'),
    ('Full house', ['Kd', 'Kh', 'Ks', '4c', '4d'], [], 3, 'Riya wins 1,300 · kings full of fours'),
    ('Flush', ['Ad', 'Jd', '8d', '6d', '2d'], [], 2, 'Riya wins 980 · flush, ace high'),
    ('Straight', ['Tc', '9d', '8s', '7h', '6c'], [], 2, 'Riya wins 760 · straight, ten high'),
    ('Three of a kind', ['7s', '7h', '7d', 'Kc', '2s'], ['Kc', '2s'], 2, 'Riya wins 640 · three sevens'),
    ('Two pair', ['Jh', 'Js', '5c', '5d', 'Ah'], ['Ah'], 1, 'Riya wins 420 · jacks and fives'),
    ('One pair', ['Th', 'Tc', 'Ks', '8d', '3c'], ['Ks', '8d', '3c'], 1, 'Riya wins 260 · pair of tens'),
    ('High card', ['Ah', 'Qd', '9c', '6s', '3h'], ['Qd', '9c', '6s', '3h'], 1, 'Riya wins 120 · ace high'),
]
TIER_TIME = {1: '1.5 s', 2: '3 s', 3: '4.5 s', 4: '7 s'}

def hands_grid(th):
    tiles = ''
    for name, cs, kick, t, line in HANDS:
        cc = ''.join(card(c, 44, 'kick' if c in kick else 'win') for c in cs)
        tiles += (f'<div class="htile t{t}"><div class="hrow"><b>{name}</b><span class="sp"></span><span class="chipt {"a" if t >= 3 else "o" if t == 2 else ""}">Tier {t} · {TIER_TIME[t]}</span></div>'
                  f'<div class="hcards">{cc}</div><small>{line}</small></div>')
    return f'<div class="hgrid">{tiles}</div>'

def timeline():
    rows = [('Everyone folded', [('Winner', 1.2, 'w'), ('Hold', 1.8, 'h')], 'No scene, no cards shown: a short winner line, then the next hand.'),
            ('Tier 1 · small win', [('Scene', 1.5, 's'), ('Winner', 1.2, 'w'), ('Others flip', 1.1, 'f'), ('Hold', 4.2, 'h')], 'High card to two pair.'),
            ('Tier 2 · good hand', [('Scene', 3, 's'), ('Winner', 1.2, 'w'), ('Others flip', 1.1, 'f'), ('Hold', 2.7, 'h')], 'Trips, straight, flush.'),
            ('Tier 3 · big hand', [('Scene', 4.5, 's'), ('Winner', 1.2, 'w'), ('Others flip', 1.1, 'f'), ('Hold', 1.2, 'h')], 'Full house, quads.'),
            ('Tier 4 · legendary', [('Scene', 7, 's'), ('Winner', 1.2, 'w'), ('Others flip', 1.1, 'f'), ('Hold', 1.2, 'h')], 'Straight flush, royal flush.')]
    out = ''
    for lab, segs, txt in rows:
        bar = ''.join(f'<span class="sg {k}" style="flex:{d}"><b>{n}</b><small>{d:g} s</small></span>' for n, d, k in segs)
        tot = sum(d for _, d, _ in segs)
        out += f'<div class="tl"><div class="tll"><b>{lab}</b><small>{txt}</small></div><div class="tlb" style="width:{tot * 64:.0f}px">{bar}</div><span class="tlt">{tot:g} s</span></div>'
    return f'<div class="pnl tlp"><div class="ttl">After a hand: the order and the timing</div>{out}<p class="hint" style="text-align:left;margin:0">Tap anywhere (or Space on a laptop) skips to the next step. If it becomes your turn early, the sequence gives way at once. Motion off: no scene, the reveal still happens, without movement.</p></div>'

CSS = r'''
.wpill{position:absolute;left:50%;top:calc(50% + 34px);transform:translateX(-50%);display:grid;justify-items:center;gap:1px;padding:7px 14px;border-radius:12px;background:color-mix(in srgb,var(--bg) 82%,transparent);box-shadow:0 0 0 1.5px var(--acc),0 8px 20px rgba(0,0,0,.35);white-space:nowrap;z-index:6;animation:wp .5s cubic-bezier(.2,1.3,.4,1) both}
.wpill b{font:var(--dspw,700) 15px var(--dsp);color:var(--acc)}.wpill span{font:600 11px var(--ui);color:var(--tx)}
.wpill.fold{box-shadow:0 0 0 1px var(--line)}
@keyframes wp{from{transform:translateX(-50%) scale(.8);opacity:0}}
.tp.lap .wpill{top:calc(50% + 60px)}.tp.lap .wpill b{font-size:20px}.tp.lap .wpill span{font-size:13px}
.seat .tag.win{background:var(--acc);color:var(--acctx)}
.seat.lose{opacity:.78}.seat.lose .shown .cd{filter:brightness(.82)}
.seat .shown .cd{animation:flipin .45s cubic-bezier(.2,.8,.3,1) both}.seat .shown .cd:nth-child(2){animation-delay:.08s}
.seat.lose .shown .cd{animation-delay:.6s}.seat.lose .shown .cd:nth-child(2){animation-delay:.68s}
@keyframes flipin{from{transform:rotateY(90deg) scale(.8)}}
.seat.win .shown{top:-24px}
.board .cd.win{animation:lift .5s .2s cubic-bezier(.2,1.2,.4,1) both}
@keyframes lift{from{transform:none;box-shadow:none}}
.board .cd.lose{filter:brightness(.55) saturate(.6)}
.hc.open{display:flex;gap:4px;position:relative;flex:none;width:auto!important}.hc.open .cd{transform:rotate(-4deg)}.hc.open .cd+.cd{transform:rotate(4deg)}
.act.nxt{position:relative;overflow:hidden}.act.nxt i{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--acc);transform-origin:left;animation:tmr 5s linear infinite}
@keyframes tmr{to{transform:scaleX(0)}}
.cd.deal{animation:dealc 1.2s ease-in-out infinite}@keyframes dealc{0%{transform:translateY(-60px) rotate(-20deg);opacity:0}60%,100%{transform:none;opacity:1}}
.wstrip{position:absolute;left:10px;right:10px;bottom:84px;z-index:60;padding:12px;border-radius:var(--r-panel,16px);background:color-mix(in srgb,var(--bg) 90%,transparent);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 0 0 1.5px var(--acc),0 18px 40px rgba(0,0,0,.5);display:grid;gap:9px;animation:wsin .6s 1s cubic-bezier(.2,1.1,.3,1) both}
@keyframes wsin{from{transform:translateY(30px);opacity:0}}
.wstrip .txt b{font:var(--dspw,700) 20px var(--dsp)}.wstrip .txt span{font-size:12.5px}
.wcards{display:flex;gap:4px}.best{display:flex;align-items:center;gap:4px}.best small{margin-left:6px;font-size:11px;color:var(--mut)}
.hgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.htile{display:grid;gap:9px;padding:14px;border-radius:var(--r-panel,14px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.htile b{font:var(--dspw,700) 17px var(--dsp)}.htile small{font-size:12px;color:var(--mut)}
.htile.t4{box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),inset 0 0 0 2px var(--acc)}
.hcards{display:flex;gap:4px}.cd.kick{filter:brightness(.6) saturate(.5)}.htile .cd.win{transform:translateY(-4px)}
.tlp{gap:12px}.tl{display:flex;align-items:center;gap:14px}.tll{width:200px;display:grid;gap:1px}.tll b{font:700 13.5px var(--ui)}.tll small{font-size:11px;color:var(--mut)}
.tlb{display:flex;gap:3px;height:38px}.sg{display:grid;align-content:center;padding:0 8px;border-radius:7px;overflow:hidden;white-space:nowrap}.sg b{font:700 11.5px var(--ui)}.sg small{font-size:10px;opacity:.8}
.sg.s{background:var(--acc);color:var(--acctx)}.sg.w{background:color-mix(in srgb,var(--acc) 55%,var(--bg));color:var(--tx)}.sg.f{background:color-mix(in srgb,var(--acc) 30%,var(--bg));color:var(--tx)}.sg.h{background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--mut)}
.tlt{font:var(--numw,700) 14px var(--num);color:var(--mut)}
.scn .bn{z-index:50}
'''

def build(th):
    sc, scss = scene(th)
    r1 = ''.join([
        col('Step 1 · the scene', 'The win scene names the winner', 'The theme’s scene plays as designed, now with a winner card that rises in after a beat: who, how much, the hand in words, their two cards and the best five.', sc),
        col('Step 2 · the winner', 'Back at the table', 'The scene clears. The winner’s seat glows and their cards flip face up; the board cards that made the hand lift, the rest dim. The pot line names it.', table(th, 'winner')),
        col('Step 3 · everyone else', 'Everyone at the showdown turns over', 'Then every other player who reached the showdown flips, one after another, each with their hand named. Folded hands are never shown.', table(th, 'all')),
        col('Split pot', 'Two winners', 'Both seats glow and both lines show; the pill says how the pot was split and why.', table(th, 'split', you='Two pair, aces and kings')),
        col('Everyone folded', 'No showdown', 'No scene and no cards: a short line names the winner and the amount. The next hand comes sooner.', table(th, 'fold', you='You folded this hand')),
    ])
    r2 = ''.join([
        col('All-in', 'All-in before the river', 'All-in hands turn over straight away with their chances; the rest of the board is dealt slowly, then the normal sequence follows.', table(th, 'allin'), 390),
        col('Phone sideways · 844 × 390', 'Sideways', 'The same reveal; the winner line sits on the felt and the thumb column shows your own hand.', table(th, 'all', 844, 390), 844),
        col('Laptop · 1440 × 900', 'Laptop', 'Bigger cards on every seat; the side panel log writes out each hand that was shown.', scaled(table(th, 'all', 1440, 900), 1440, 900, .62), 893),
    ])
    hand_sec = f'<div class="v3top"><h2 style="font:var(--dspw,700) 26px var(--dsp);margin:0">Every hand, and the moment it gets</h2><p class="lede">The best five cards are lifted, the cards that did not count are dimmed. The tier sets how big the scene is and how long it plays.</p></div>{hands_grid(th)}'
    body = (f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div>{hand_sec}{timeline()}' + note(
        ('Always shown', 'At a showdown every player still in the hand shows. Folded hands never do. If everyone folds, the winner may still tap Show to show theirs.'),
        ('Slower', 'From the end of the hand to the next deal: about 8 seconds after a showdown, 3 seconds when everyone folded. The server waits for it.'),
        ('Your hand', 'Your own cards turn face up in the hand area with “You had two pair, aces and kings”, even if you lost.'),
        ('Motion', 'Winner card rises at 1 s; cards flip 0.45 s; the best five lift with the theme’s easing; losers flip 0.6 s later, 80 ms apart; the next-hand bar drains to the deal.')))
    return board(th, f'{th.key}-results.dc.html', f'{th.name}: who won, and with what', 'The win scene now says who won and shows their hand; then the table turns over every hand that reached the showdown, with each one named. On every screen, for every hand.', body, 2300, 3060, CSS + scss)
