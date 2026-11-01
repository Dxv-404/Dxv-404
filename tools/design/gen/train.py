from builders import *
from avatars import bust
import json, os, re
ART = json.load(open(os.path.join(os.path.dirname(__file__), 'v1art.json')))
HDEFS = re.search(r'<defs>(.*)</defs>', ART['hoshi_defs'], re.S).group(1)
AV = dict(ol='', olw=0, skin=None, hair=['#2a2018', '#3a2a20', '#1d1d24', '#4a3020', '#1d1d24', '#2a2018'],
          shirt=['#8fc93a', '#c9302c', '#ffb23e', '#1f6fb8', '#b07ce8', '#f07fb4'], eyes='dot', ec='#2a2018', mouth='#7a4a3a', collar='rgba(255,255,255,.6)', shade=True, accc='#ffb23e', acc='#2a2018')
LINES = [('#8fc93a', 'M-5 20 L18 20 L32 34 L55 34'), ('#ffb23e', 'M-5 50 L14 50 L28 36 L28 -5'), ('#1f6fb8', 'M20 75 L20 58 L36 42 L55 42'), ('#c9302c', 'M-5 62 L40 62 L40 75')]

class Train(Theme):
    key = 'train'; name = 'Night Train'; dealer_name = 'HOSHI'
    bubble = 'Riya raises to 120. Your stop, Dev.'
    deck_note = 'Pale-green commuter tickets with a guilloche print, a punched hole and a magnetic stripe; ranks in the station-sign face. New back: the line map of the night network, four coloured lines meeting at the Train Poker roundel.'
    dealer_title = 'Hoshi, your conductor'
    dealer_note = 'Kept from v1: a tanuki conductor in a navy coat and gold-banded cap, with a ticket punch and a tail that never stops.'
    def sprite(self): return super().sprite() + HDEFS
    def chips(self):
        return (casino_chip('ch-a', '#eaf2f0', '#ffb23e', '#0a0f14', '#ffb23e', '<text x="12" y="14" text-anchor="middle" font-family="VT323" font-size="7" fill="#ffb23e">100</text>')
                + casino_chip('ch-b', '#8fc93a', '#eaf2f0', '#0a0f14', '#8fc93a', '<text x="12" y="14" text-anchor="middle" font-family="VT323" font-size="7" fill="#8fc93a">500</text>'))
    def back_symbol(self):
        lines = ''.join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2.6" stroke-linejoin="round"/>' for c, d in LINES)
        st = ''.join(f'<circle cx="{x}" cy="{y}" r="1.5" fill="#fff" stroke="#0f2134" stroke-width=".7"/>' for x, y in [(18, 20), (14, 50), (20, 58), (40, 62), (28, 20), (36, 42), (46, 34)])
        return (f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="tbc"><rect x="3" y="3" width="44" height="64" rx="3"/></clipPath><g clip-path="url(#tbc)">'
                + ''.join(f'<path d="M3 {y} H47" stroke="rgba(255,255,255,.04)" stroke-width=".5"/>' for y in range(6, 70, 4)) + f'{lines}{st}</g>'
                '<circle cx="31" cy="38" r="7.5" fill="#0f2134" stroke="#ffb23e" stroke-width="2.4"/><rect x="21" y="35.4" width="20" height="5.2" fill="#ffb23e"/><text x="31" y="39.6" text-anchor="middle" font-family="Zen Kaku Gothic New" font-weight="900" font-size="4.6" fill="#0f2134">TP</text></symbol>')
    def faces(self):
        def f(l, art, stn): return f'<symbol id="f{l}" viewBox="0 0 60 80">{art}<rect x="4" y="66" width="52" height="5" fill="#3a4b57" opacity=".5"/><text x="30" y="62" text-anchor="middle" font-family="VT323" font-size="8" fill="#2f5d50">{stn}</text></symbol>'
        return (f('K', '<path d="M10 34 Q30 4 50 34Z" fill="#1d2f4a"/><rect x="10" y="32" width="40" height="6" fill="#ffb23e"/><path d="M6 40 Q30 50 54 40" fill="none" stroke="#1d2b26" stroke-width="4" stroke-linecap="round"/><circle cx="30" cy="22" r="4" fill="#ffb23e"/>', 'CONDUCTOR')
                + f('Q', '<path d="M30 4 L30 22" stroke="#1d2b26" stroke-width="2.4"/><path d="M14 22 L46 22 L42 28 L18 28Z" fill="#c9d6d8" stroke="#1d2b26" stroke-width="2"/><path d="M20 28 Q20 48 30 50 Q40 48 40 28" fill="#fff" stroke="#1d2b26" stroke-width="2.4"/><path d="M30 42 l-4 -3 a2.4 2.4 0 0 1 4 -2 a2.4 2.4 0 0 1 4 2Z" fill="currentColor"/>', 'HANGING STRAP')
                + f('J', '<rect x="8" y="16" width="44" height="26" rx="8" fill="currentColor" stroke="#1d2b26" stroke-width="2.4"/><rect x="14" y="20" width="14" height="10" rx="2" fill="#cfe3ff"/><rect x="32" y="20" width="14" height="10" rx="2" fill="#cfe3ff"/><rect x="8" y="34" width="44" height="3" fill="#ffb23e"/><circle cx="18" cy="45" r="4" fill="#1d2b26"/><circle cx="42" cy="45" r="4" fill="#1d2b26"/><path d="M2 52 L58 52" stroke="#1d2b26" stroke-width="2"/>', 'NIGHT EXPRESS'))
    def avatar(self, p, ctx):
        inner = bust(p, AV) if not p.get('photo') else '<circle cx="50" cy="44" r="18" fill="#e6b896"/><path d="M30 40 Q30 18 50 18 Q72 18 70 42 Q66 30 54 30 Q40 32 30 40Z" fill="#2a1d18"/><path d="M14 104 Q18 74 50 68 Q82 74 86 104Z" fill="#c2304a"/><circle cx="43" cy="44" r="1.6" fill="#222"/><circle cx="57" cy="44" r="1.6" fill="#222"/>'
        return f'<span class="pwin"><svg viewBox="12 8 76 76">{inner}</svg></span>'
    def dealer(self, pose='idle', ctx='phone'):
        return ART['hoshi'][0].replace('<svg ', '<svg class="dv" ', 1).replace('viewBox="0 0 120 130"', 'viewBox="4 4 112 122"')
    def bg(self, kind):
        if kind == 'phone': return '<div class="t-win" style="top:56px;height:100px"><div class="t-city"></div><div class="t-pole"></div><div class="t-mull" style="left:33%"></div><div class="t-mull" style="left:66%"></div></div><span class="strap" style="left:10%;top:156px"></span><span class="strap" style="left:90%;top:156px;animation-delay:-1.2s"></span>'
        if kind == 'lap': return '<div class="t-win" style="top:64px;height:110px;right:340px"><div class="t-city"></div><div class="t-pole"></div><div class="t-mull" style="left:25%"></div><div class="t-mull" style="left:50%"></div><div class="t-mull" style="left:75%"></div></div>'
        return '<div class="t-win" style="top:0;height:100%"><div class="t-city" style="height:40%;bottom:30%"></div><div class="t-pole"></div></div>'
    def felt_deco(self, kind):
        stations = ''.join(f'<circle cx="{100+82*math.cos(math.radians(a)):.1f}" cy="{60+46*math.sin(math.radians(a)):.1f}" r="1.6" fill="#2c5a4d" stroke="#ffb23e" stroke-width=".7"/>' for a in range(0, 360, 30))
        return (f'<div class="deco"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="100" cy="60" rx="82" ry="46" fill="none" stroke="#ffb23e" stroke-width="1.2" opacity=".5"/>{stations}'
                '<circle cx="100" cy="100" r="6" fill="none" stroke="rgba(221,233,212,.25)" stroke-width="1.6"/><rect x="90" y="98.6" width="20" height="2.8" fill="rgba(221,233,212,.25)"/></svg></div>')
    def pot_html(self, kind, pot): return f'<div class="led"><span>POT {pot} · NEXT: THE TURN · RIYA RAISED TO 120 · </span></div>'
    def logo(self, ctx): return '<div class="lg"><b>TRAIN<br>POKER</b><small>THE LAST TRAIN HOME</small><i>Friday Night Table · platform 4</i></div>'
    def board_css(self, kind): return ART['hoshi_css'] if kind == 'dealer' else ''
    def poses(self):
        meta = [('Shuffle', 'Between hands, while the next stop loads.', 'Mind the gap.'), ('Deal and punch', 'Deals each card, punches the winner\'s ticket.', 'Tickets, please.'), ('Your turn', 'One whistle, a soft buzz on your phone.', 'Your stop, Dev.'),
                ('Big hand', 'Tier 3 and up: the cap flies off.', 'Well, I never!'), ('Ship it', 'Big pot won: a salute and a lucky leaf.', 'Express service!'), ('Waiting', 'Ready check, timer, someone away.', 'Doors closing soon.')]
        return [(t, d, svg.replace('viewBox="0 0 120 130"', 'viewBox="0 0 120 130" style="overflow:visible"'), q) for (t, d, q), svg in zip(meta, ART['hoshi'])]
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<div class="r1" style="left:{sx+18}px;top:{sy-74}px"><b>+640</b><small>FARE COLLECTED</small><i></i></div>',
                    ".r1{position:absolute;width:96px;padding:8px 10px;background:linear-gradient(#eef6e9,#dde9d4);border-radius:5px;box-shadow:0 6px 14px rgba(0,0,0,.5);color:#1d2b26;animation:r1 2.6s cubic-bezier(.2,1.4,.3,1) infinite}"
                    ".r1 b{display:block;font:400 26px/1 'VT323';color:#2f5d50}.r1 small{font:900 7.5px 'Zen Kaku Gothic New';letter-spacing:.1em}.r1 i{position:absolute;right:8px;top:8px;width:10px;height:10px;border-radius:50%;background:#12263a;transform:scale(0);animation:r1p 2.6s steps(1) infinite}"
                    "@keyframes r1{0%,10%{transform:translateY(16px) rotate(-8deg);opacity:0}24%,84%{transform:rotate(-4deg);opacity:1}100%{opacity:0}}@keyframes r1p{0%,46%{transform:scale(0)}48%,100%{transform:scale(1)}}")
        if i == 1:
            return ('<div class="r2"><div class="nx">NEXT ・ 次は</div><b>STRAIGHT</b><span>← THREE OF A KIND · FLUSH →</span><em>MEERA +860</em></div>',
                    ".r2{position:absolute;left:24px;right:24px;top:250px;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 14px 30px rgba(0,0,0,.55);text-align:center;animation:r2 2.8s cubic-bezier(.2,1.2,.3,1) infinite}"
                    ".r2 .nx{background:#12263a;color:#8fc93a;font:900 11px 'Zen Kaku Gothic New';letter-spacing:.3em;padding:6px}.r2 b{display:block;font:900 40px/1.2 'Zen Kaku Gothic New';color:#12263a;padding-top:6px}"
                    ".r2 span{display:block;background:#8fc93a;color:#0d1a12;font:900 10px 'Zen Kaku Gothic New';padding:5px;letter-spacing:.06em}.r2 em{display:block;font:400 20px 'VT323';font-style:normal;color:#2f5d50;padding:4px}"
                    "@keyframes r2{0%{transform:translateX(-120%)}14%,84%{transform:none}100%{transform:translateX(120%)}}")
        if i == 2:
            cars = ''.join(f'<div class="car" style="left:{k*260}px"><i></i><i></i><i></i><i></i><i></i></div>' for k in range(4))
            flaps = ''.join(f'<span style="--d:{k*.05:.2f}s">{ch}</span>' for k, ch in enumerate('FLUSH'))
            return (f'<div class="r3bg"></div><div class="r3tr">{cars}</div><div class="r3b"><small>EXPRESS · ACE-HIGH FLUSH, ALL HEARTS</small><div class="fl">{flaps}</div><em>MEERA · 1,480 · ON TIME</em></div>',
                    '.r3bg{position:absolute;inset:0;background:rgba(6,11,20,.88);animation:r3bg 3.4s ease infinite}@keyframes r3bg{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}'
                    '.r3tr{position:absolute;left:0;top:180px;height:90px;width:1040px;animation:r3t 3.4s cubic-bezier(.6,0,.2,1) infinite}@keyframes r3t{0%{transform:translateX(420px)}35%{transform:translateX(-1100px)}100%{transform:translateX(-1100px)}}'
                    '.car{position:absolute;top:0;width:250px;height:90px;border-radius:18px 18px 6px 6px;background:linear-gradient(#d5dfe1,#93a6a8);box-shadow:inset 0 -14px 0 #8fc93a;display:flex;gap:10px;padding:16px 18px}.car i{flex:1;height:32px;border-radius:5px;background:#ffd890;box-shadow:0 0 14px rgba(255,216,144,.8)}'
                    ".r3b{position:absolute;left:18px;right:18px;top:320px;padding:16px;background:#0a0f14;border-radius:10px;box-shadow:0 0 0 3px #2b3a44;text-align:center;animation:r3bg 3.4s ease infinite}.r3b small{font:900 10px 'Zen Kaku Gothic New';letter-spacing:.2em;color:#8fc93a}"
                    ".fl{display:flex;justify-content:center;gap:3px;margin:12px 0}.fl span{width:30px;height:46px;border-radius:4px;background:linear-gradient(#1d2a33 50%,#141e25 50%);font:900 30px/46px 'Zen Kaku Gothic New';color:#ffb23e;animation:flap 3.4s steps(1) infinite;animation-delay:var(--d)}"
                    "@keyframes flap{0%,30%{color:transparent}32%{color:#ffb23e;transform:scaleY(.2)}34%,100%{transform:none;color:#ffb23e}}.r3b em{font:400 22px 'VT323';font-style:normal;color:#ffb23e}")
        if i == 3:
            fw = ''.join(f'<div class="fw" style="left:{x}px;top:{y}px;animation-delay:{d}s;--c:{c}"></div>' for x, y, d, c in [(80, 150, 0, '#ffb23e'), (290, 120, .6, '#8fc93a'), (190, 90, 1.1, '#f07fb4'), (320, 230, 1.6, '#ffb23e'), (60, 260, 2.0, '#cfe3ff')])
            hoshi = ART['hoshi'][4].replace('viewBox="0 0 120 130"', 'viewBox="0 0 120 130" class="r4h"')
            return (f'<div class="r4bg"></div>{fw}<div class="r4sky"></div>{hoshi}<div class="r4t"><b>ROYAL FLUSH</b><small>LINE OF THE SEASON · MEERA</small><span>Golden ticket added to her player card</span></div>',
                    '.r4bg{position:absolute;inset:0;background:linear-gradient(#050913,#12263a 60%,#1d2a40);animation:r3bg 5s ease infinite}@keyframes r3bg{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}'
                    '.fw{position:absolute;width:6px;height:6px;border-radius:50%;box-shadow:0 -40px 0 var(--c),28px -28px 0 var(--c),40px 0 0 var(--c),28px 28px 0 var(--c),0 40px 0 var(--c),-28px 28px 0 var(--c),-40px 0 0 var(--c),-28px -28px 0 var(--c);animation:fw 2.4s ease-out infinite}@keyframes fw{0%{transform:scale(0);opacity:1}70%{opacity:1}100%{transform:scale(1.4);opacity:0}}'
                    '.r4sky{position:absolute;left:0;right:0;top:330px;height:120px;background:repeating-linear-gradient(90deg,#0b1628 0 34px,transparent 34px 46px,#0d1a2e 46px 70px,transparent 70px 84px);opacity:.9}'
                    '.r4h{position:absolute;left:115px;top:380px;width:160px;height:174px;animation:r3bg 5s ease infinite}'
                    ".r4t{position:absolute;left:24px;right:24px;top:570px;padding:14px;border-radius:10px;background:linear-gradient(135deg,#ffd890,#ffb23e);color:#2a1a05;text-align:center;box-shadow:0 0 30px rgba(255,178,62,.6);animation:r4t 5s cubic-bezier(.2,1.4,.3,1) infinite}"
                    ".r4t b{display:block;font:900 38px/1 'Zen Kaku Gothic New'}.r4t small{font:900 10px 'Zen Kaku Gothic New';letter-spacing:.2em}.r4t span{display:block;font:700 12px 'Zen Kaku Gothic New';margin-top:4px}@keyframes r4t{0%,20%{transform:translateY(40px);opacity:0}32%,88%{transform:none;opacity:1}100%{opacity:0}}")
        return ('<div class="r5d l"></div><div class="r5d r"></div><div class="r5"><small>END OF THE LINE</small><b>Arjun gets off here</b><span>9th of 13 · 1 rebuy left</span><div><em>Catch the next train · 1,000</em><em>Ride along and watch</em></div></div>',
                '.r5d{position:absolute;top:56px;bottom:178px;width:50%;background:linear-gradient(90deg,#c9d6d8,#93a6a8);box-shadow:inset 0 0 0 3px #0b1620;animation:r5d 3.2s cubic-bezier(.6,0,.3,1) infinite}.r5d::after{content:"";position:absolute;left:20%;right:20%;top:12%;height:30%;border-radius:8px;background:#0b1626;box-shadow:inset 0 0 0 3px #0b1620}'
                '.r5d.l{left:0;--x:-100%}.r5d.r{right:0;--x:100%}@keyframes r5d{0%,10%{transform:translateX(var(--x))}30%,88%{transform:none}100%{transform:translateX(var(--x))}}'
                ".r5{position:absolute;left:30px;right:30px;top:420px;padding:16px;background:#0a0f14;border-radius:10px;box-shadow:0 0 0 2px #ff7a3d;color:#eaf2f0;text-align:center;animation:r5 3.2s ease infinite}.r5 small{font:900 10px 'Zen Kaku Gothic New';letter-spacing:.24em;color:#ff7a3d}.r5 b{display:block;font:900 22px 'Zen Kaku Gothic New';margin:4px 0}.r5 span{font:400 18px 'VT323';color:#ffb23e}"
                ".r5 div{display:grid;gap:8px;margin-top:10px}.r5 em{font:900 12.5px 'Zen Kaku Gothic New';font-style:normal;padding:10px;border-radius:8px;background:#2d3e4a}.r5 em:first-child{background:#8fc93a;color:#0d1a12}@keyframes r5{0%,26%{opacity:0;transform:scale(.9)}36%,88%{opacity:1;transform:none}100%{opacity:0}}")

TH = Train()
if __name__ == '__main__':
    for f in build_all(TH): print(f)
