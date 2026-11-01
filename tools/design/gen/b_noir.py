"""Noir: tier 3 (an Art Deco frame draws itself in gold, a sunburst fan opens, five cards fan out from one point, champagne rises) and
tier 4 (lacquer doors with gold inlay glow at the seam and swing open on a blaze of gold, a spinning medallion, gold starbursts and dust, ROYAL FLUSH in foil)."""
from core import *

G = '#c8a96a'
DECO = ('M20 60 L20 30 L40 30 L40 14 L120 14 L140 4 L160 14 L250 14 L250 30 L270 30 L270 60 M20 580 L20 610 L40 610 L40 626 L120 626 L140 636 L160 626 L250 626 L250 610 L270 610 L270 580 '
        'M20 60 L20 580 M270 60 L270 580 M30 70 L30 570 M260 70 L260 570')

def t3(th):
    fan = ''.join(cardk(c, 76, 'fc', k=k) for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    rays = ''.join(f'<i style="--a:{a}deg"></i>' for a in range(-84, 85, 12))
    bub = ''.join(f'<b class="bb" style="left:{x}px;--d:{d}s;--s:{s}"></b>' for x, d, s in [(40, 0, 1), (80, .7, .6), (300, .3, .8), (340, 1.1, 1), (120, 1.5, .5), (270, 1.9, .7), (60, 2.3, .8), (330, 2.6, .6)])
    h = ('<div class="z3n"><div class="bg"></div>'
         f'<svg class="frm" viewBox="0 0 290 640" aria-hidden="true"><path d="{DECO}"/></svg>'
         f'<div class="sun">{rays}</div>'
         '<div class="ttl"><small>Kings full of sevens</small><b>Full House</b><i></i></div>'
         f'<div class="fan">{fan}</div>{bub}'
         '<div class="who"><span>Meera</span><b>2,860</b></div></div>')
    T = '4.6s'
    c = f'''
.z3n{{position:absolute;inset:0;overflow:hidden;animation:z3no {T} ease infinite}}@keyframes z3no{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3n .bg{{position:absolute;inset:0;background:radial-gradient(60% 45% at 50% 42%,#1a1a1c,#0b0b0c 70%);animation:z3nb {T} ease infinite}}@keyframes z3nb{{0%{{opacity:0}}8%{{opacity:.97}}}}
.z3n .frm{{position:absolute;left:50px;top:110px;width:290px;height:640px}}.z3n .frm path{{fill:none;stroke:{G};stroke-width:1.2;stroke-dasharray:2600;stroke-dashoffset:2600;animation:z3nf {T} cubic-bezier(.5,0,.3,1) infinite}}
@keyframes z3nf{{0%,4%{{stroke-dashoffset:2600}}34%,100%{{stroke-dashoffset:0}}}}
.z3n .sun{{position:absolute;left:50%;top:470px;width:0;height:0}}
.z3n .sun i{{position:absolute;left:-1px;bottom:0;width:2px;height:230px;background:linear-gradient(transparent,{G});transform-origin:50% 100%;transform:rotate(var(--a)) scaleY(0);opacity:.55;animation:z3ns {T} cubic-bezier(.3,1,.4,1) infinite}}
@keyframes z3ns{{0%,18%{{transform:rotate(0) scaleY(0)}}36%,100%{{transform:rotate(var(--a)) scaleY(1)}}}}
.z3n .ttl{{position:absolute;left:0;right:0;top:160px;text-align:center}}
.z3n .ttl small{{display:block;font:500 10px 'Jost';letter-spacing:.42em;text-transform:uppercase;color:#8c8579;animation:z3nt {T} ease infinite}}
.z3n .ttl b{{display:block;margin:8px 0 12px;font:italic 500 64px/1 'Cormorant Garamond';color:#ede6d6;letter-spacing:.01em;animation:z3nt {T} ease infinite;animation-delay:.12s}}
@keyframes z3nt{{0%,20%{{opacity:0;transform:translateY(14px);filter:blur(6px)}}32%,100%{{opacity:1;transform:none;filter:none}}}}
.z3n .ttl i{{display:block;width:180px;height:1px;margin:0 auto;background:{G};transform:scaleX(0);animation:z3nl {T} ease infinite}}@keyframes z3nl{{0%,30%{{transform:scaleX(0)}}42%,100%{{transform:none}}}}
.z3n .fan{{position:absolute;left:50%;top:380px;width:0;height:0}}
.z3n .fc{{position:absolute;left:-38px;top:-10px;transform-origin:50% 240%;box-shadow:0 0 0 1px {G},0 12px 24px rgba(0,0,0,.6)!important;animation:z3nc {T} cubic-bezier(.3,1.2,.4,1) infinite}}
@keyframes z3nc{{0%,36%{{transform:translateY(40px) scale(.6);opacity:0}}42%{{transform:none;opacity:1}}54%,100%{{transform:rotate(calc((var(--k) - 2) * 9deg));opacity:1}}}}
.z3n .bb{{position:absolute;bottom:-20px;width:calc(10px * var(--s));height:calc(10px * var(--s));border-radius:50%;box-shadow:inset 0 0 0 1px rgba(200,169,106,.8);animation:z3nbb 3s ease-in infinite;animation-delay:calc(var(--d) * -1)}}
@keyframes z3nbb{{0%{{transform:translateY(0);opacity:0}}20%{{opacity:1}}100%{{transform:translateY(-700px) translateX(14px);opacity:0}}}}
.z3n .who{{position:absolute;left:0;right:0;top:620px;text-align:center;animation:z3nw {T} ease infinite}}@keyframes z3nw{{0%,56%{{opacity:0}}66%,100%{{opacity:1}}}}
.z3n .who span{{display:block;font:500 11px 'Jost';letter-spacing:.42em;text-transform:uppercase;color:{G}}}.z3n .who b{{font:300 38px 'Jost';letter-spacing:.06em;color:#ede6d6}}
'''
    return scoped(h, c, 'bg frm sun ttl fan fc bb who', 'n3')

def t4(th):
    def door(side):
        lines = ''.join(f'<path d="M{20 + k * 14} 0 L{20 + k * 14} 844" />' for k in range(0))
        return (f'<div class="dr {side}"><svg viewBox="0 0 195 844" preserveAspectRatio="none" aria-hidden="true">'
                '<rect x="14" y="14" width="167" height="816" fill="none"/><rect x="24" y="24" width="147" height="796" fill="none" stroke-width=".6"/>'
                + ''.join(f'<path d="M97 422 L{97 + 200 * math.cos(math.radians(a)):.0f} {422 + 200 * math.sin(math.radians(a)):.0f}" stroke-width=".6"/>' for a in range(0, 360, 15))
                + '<circle cx="97" cy="422" r="40" fill="#0b0b0c"/><circle cx="97" cy="422" r="30" fill="none"/>'
                '<path d="M60 120 L97 80 L134 120 L97 160Z M60 724 L97 684 L134 724 L97 764Z" fill="none"/></svg></div>')
    med = ''.join(f'<circle cx="0" cy="0" r="{r}" stroke-dasharray="{d}"/>' for r, d in [(120, '2 6'), (100, ''), (92, '30 6'), (70, '')]) + ''.join(f'<path d="M0 -70 L0 -120" transform="rotate({a})"/>' for a in range(0, 360, 10))
    bursts = ''.join(f'<svg class="sb" style="left:{x}px;top:{y}px;--d:{d}s" viewBox="-60 -60 120 120" aria-hidden="true">' + ''.join(f'<path d="M0 0 L{55 * math.cos(math.radians(a)):.1f} {55 * math.sin(math.radians(a)):.1f}"/>' for a in range(0, 360, 20)) + '</svg>'
                     for x, y, d in [(20, 90, 0), (250, 60, .5), (150, 20, 1), (260, 300, 1.4), (10, 330, 1.8)])
    dust = ''.join(f'<i class="du" style="left:{(k * 43) % 380}px;--d:{(k * .37) % 3:.2f}s;--w:{1 + k % 3}px"></i>' for k in range(26))
    fan = ''.join(cardk(c, 70, 'fc', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    h = ('<div class="z4n"><div class="bg"></div><div class="blaze"></div>'
         f'<svg class="med" viewBox="-130 -130 260 260" aria-hidden="true"><g>{med}</g></svg>'
         f'{bursts}{dust}'
         '<div class="ttl"><small>Once in 649,740 hands</small><b>Royal Flush</b><i></i><span>Meera</span></div>'
         f'<div class="fan">{fan}</div>'
         f'<div class="doors">{door("dl")}{door("dr2")}<div class="seam"></div></div></div>')
    T = '7s'
    c = f'''
.z4n{{position:absolute;inset:0;overflow:hidden;perspective:1200px;animation:z4no {T} ease infinite}}@keyframes z4no{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4n .bg{{position:absolute;inset:0;background:#0b0b0c}}
.z4n .blaze{{position:absolute;left:50%;top:42%;width:1400px;height:1400px;margin:-700px 0 0 -700px;background:repeating-conic-gradient(from 0deg,rgba(200,169,106,.0) 0 4deg,rgba(200,169,106,.16) 4deg 6deg),radial-gradient(circle,rgba(255,226,160,.55),rgba(200,169,106,.12) 30%,transparent 55%);animation:z4nbz 24s linear infinite,z4nbo {T} ease infinite}}
@keyframes z4nbz{{to{{transform:rotate(360deg)}}}}@keyframes z4nbo{{0%,22%{{opacity:0}}34%,100%{{opacity:1}}}}
.z4n .med{{position:absolute;left:50%;top:200px;width:300px;height:300px;margin-left:-150px;animation:z4nm {T} cubic-bezier(.2,1.1,.3,1) infinite}}.z4n .med g{{animation:z4nbz 20s linear infinite}}
.z4n .med circle,.z4n .med path{{fill:none;stroke:{G};stroke-width:1}}@keyframes z4nm{{0%,26%{{transform:scale(.2) rotate(-90deg);opacity:0}}40%,100%{{transform:none;opacity:.85}}}}
.z4n .sb{{position:absolute;width:120px;height:120px;opacity:0;animation:z4nsb 2.4s ease-out infinite,z4nsbo {T} linear infinite;animation-delay:var(--d),0s}}.z4n .sb path{{stroke:#e8d3a2;stroke-width:1.4;stroke-linecap:round;stroke-dasharray:6 60;stroke-dashoffset:6;animation:z4nsp 2.4s ease-out infinite;animation-delay:var(--d)}}
@keyframes z4nsb{{0%{{transform:scale(.3)}}100%{{transform:scale(1.1)}}}}@keyframes z4nsp{{0%{{stroke-dashoffset:6}}100%{{stroke-dashoffset:-50}}}}@keyframes z4nsbo{{0%,40%{{opacity:0}}44%,100%{{opacity:1}}}}
.z4n .du{{position:absolute;top:-10px;width:var(--w);height:calc(var(--w) * 5);background:linear-gradient(#fff3cf,{G});opacity:0;animation:z4ndu 3.4s linear infinite,z4nsbo {T} linear infinite;animation-delay:calc(var(--d) * -1),0s}}@keyframes z4ndu{{to{{transform:translateY(880px) rotate(200deg)}}}}
.z4n .ttl{{position:absolute;left:-40px;right:-40px;top:200px;padding:50px 0 60px;text-align:center;background:radial-gradient(closest-side,rgba(11,11,12,.92),rgba(11,11,12,.7) 60%,transparent);animation:z4nbo {T} ease infinite}}
.z4n .ttl small{{display:block;font:500 10px 'Jost';letter-spacing:.42em;text-transform:uppercase;color:#8c8579;animation:z4nt {T} ease infinite}}
.z4n .ttl b{{display:block;margin:10px 0 12px;font:italic 500 76px/.95 'Cormorant Garamond';background:linear-gradient(100deg,#a8874a 20%,#fff3cf 42%,#e8d3a2 50%,#a8874a 72%) 0 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:z4nt {T} ease infinite,z4nfo 2.6s linear infinite;animation-delay:.15s,0s}}
@keyframes z4nfo{{from{{background-position:100% 0}}to{{background-position:-160% 0}}}}
@keyframes z4nt{{0%,40%{{opacity:0;transform:translateY(16px);filter:blur(8px)}}52%,100%{{opacity:1;transform:none;filter:none}}}}
.z4n .ttl i{{display:block;width:220px;height:1px;margin:0 auto 14px;background:{G};transform:scaleX(0);animation:z4nl {T} ease infinite}}@keyframes z4nl{{0%,50%{{transform:scaleX(0)}}60%,100%{{transform:none}}}}
.z4n .ttl span{{font:italic 500 30px 'Cormorant Garamond';color:#ede6d6;animation:z4nt {T} ease infinite;animation-delay:.4s}}
.z4n .fan{{position:absolute;left:50%;top:560px;width:0;height:0}}
.z4n .fc{{position:absolute;left:-35px;top:0;transform-origin:50% 240%;box-shadow:0 0 0 1px {G},0 12px 24px rgba(0,0,0,.6)!important;animation:z4nc {T} cubic-bezier(.3,1.2,.4,1) infinite}}
@keyframes z4nc{{0%,56%{{transform:translateY(40px) scale(.6);opacity:0}}62%{{transform:none;opacity:1}}72%,100%{{transform:rotate(calc((var(--k) - 2) * 9deg));opacity:1}}}}
.z4n .doors{{position:absolute;inset:0;transform-style:preserve-3d}}
.z4n .dr{{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(90deg,#0b0b0c,#141416 50%,#0b0b0c);box-shadow:inset 0 0 0 1px rgba(200,169,106,.4);backface-visibility:hidden;animation:z4nd {T} cubic-bezier(.6,0,.3,1) infinite}}
.z4n .dr svg{{width:100%;height:100%}}.z4n .dr rect,.z4n .dr path,.z4n .dr circle{{stroke:{G};stroke-width:1;fill-opacity:1}}.z4n .dr path{{fill:none;opacity:.6}}
.z4n .dr.dl{{left:0;transform-origin:0 50%;--r:-100deg}}.z4n .dr.dr2{{right:0;transform-origin:100% 50%;--r:100deg}}
@keyframes z4nd{{0%{{opacity:0;transform:none}}5%,18%{{opacity:1;transform:none}}32%,100%{{opacity:1;transform:rotateY(var(--r))}}}}
.z4n .seam{{position:absolute;left:50%;top:0;bottom:0;width:4px;margin-left:-2px;background:#fff3cf;box-shadow:0 0 30px 10px rgba(255,226,160,.8);opacity:0;animation:z4nse {T} ease infinite}}@keyframes z4nse{{0%,8%{{opacity:0}}14%,20%{{opacity:1}}26%,100%{{opacity:0}}}}
'''
    return scoped(h, c, 'bg blaze med sb du ttl fan fc doors dr dl dr2 seam', 'n4')
