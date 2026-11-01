"""Classic: tier 3 (spotlight, Marco cuts in, five cards flip in from the shoe, a chip avalanche and a rolling pot counter) and
tier 4 (jackpot: a brass trophy rises through rays, a coin fountain, the royal cards flip in an arc, ribbon banner, fireworks, confetti)."""
from core import *

MARCO = '<span class="mc"><img src="img/marco.webp" alt=""></span>'
CHIP_C = ['#8a2f27', '#efe6d0', '#0f4a3b', '#c9a15b', '#1b120d']

def t3(th):
    cards = ''.join(f'<span class="dc" style="--k:{k}"><span class="in">{card(c, 60)}{back(60)}</span></span>' for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    chips = ''.join(f'<i class="ch" style="--x:{x}px;--y:{y}px;--k:{k};--c:{CHIP_C[k % 5]}"></i>' for k, (x, y) in enumerate(
        [(-60, 0), (-30, 0), (0, 0), (30, 0), (60, 0), (-45, -8), (-15, -8), (15, -8), (45, -8), (-30, -16), (0, -16), (30, -16), (-15, -24), (15, -24), (0, -32)]))
    h = ('<div class="z3c"><div class="bg"></div><div class="spot"></div>'
         f'<div class="mar">{MARCO}<p>Bellissimo!<br><b>Kings full.</b></p></div>'
         '<div class="ttl"><small>Meera made a</small><b>Full House</b><span>kings full of sevens</span></div>'
         f'<div class="row">{cards}</div>'
         f'<div class="pile">{chips}</div><div class="pot"><small>Pot to Meera</small><b class="cnt"></b></div></div>')
    T = '4.6s'
    c = f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3csh {T} linear infinite}}
@keyframes z3csh{{0%,58%,64%,100%{{transform:none}}59%{{transform:translateY(4px)}}61%{{transform:translateY(-3px)}}63%{{transform:translateY(1px)}}}}
.z3c{{position:absolute;inset:0;overflow:hidden;animation:z3co {T} ease infinite}}@keyframes z3co{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3c .bg{{position:absolute;inset:0;background:radial-gradient(70% 50% at 50% 40%,rgba(15,74,59,.92),rgba(14,9,6,.97) 80%);animation:z3cb {T} ease infinite}}@keyframes z3cb{{0%{{opacity:0}}6%{{opacity:1}}}}
.z3c .spot{{position:absolute;left:50%;top:-40px;width:420px;height:760px;margin-left:-210px;background:conic-gradient(from 165deg at 50% 0,transparent,rgba(236,211,155,.22) 12deg,rgba(236,211,155,.3) 15deg,rgba(236,211,155,.22) 18deg,transparent 30deg);animation:z3csp {T} ease infinite}}
@keyframes z3csp{{0%,4%{{opacity:0;transform:rotate(-14deg)}}14%,100%{{opacity:1;transform:none}}}}.z3c .spot{{transform-origin:50% 0}}
.z3c .mar{{position:absolute;left:18px;top:74px;display:flex;align-items:center;gap:12px;animation:z3cm {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z3cm{{0%,8%{{transform:translateX(-360px)}}16%,100%{{transform:none}}}}
.z3c .mc{{display:block;width:84px;height:84px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px #1b120d,0 0 0 5px #c9a15b,0 10px 24px rgba(0,0,0,.6)}}.z3c .mc img{{width:100%;height:100%;object-fit:cover;display:block}}
.z3c .mar p{{margin:0;padding:10px 14px;border-radius:14px;background:#f3ead7;color:#2a1a0e;font:500 14px/1.35 'Figtree';box-shadow:0 8px 20px rgba(0,0,0,.4)}}.z3c .mar b{{font:italic 600 19px 'Fraunces';color:#8a2f27}}
.z3c .ttl{{position:absolute;left:0;right:0;top:200px;text-align:center;animation:z3ct {T} cubic-bezier(.2,1.2,.3,1) infinite}}@keyframes z3ct{{0%,14%{{opacity:0;transform:scale(.8)}}24%,100%{{opacity:1;transform:none}}}}
.z3c .ttl small{{font:700 11px 'Figtree';letter-spacing:.3em;text-transform:uppercase;color:#b9a88b}}
.z3c .ttl b{{position:relative;display:block;margin:4px 0;font:italic 600 66px/1.05 'Fraunces';background:linear-gradient(100deg,#c9a15b 20%,#fff3cf 40%,#ecd39b 50%,#c9a15b 70%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:z3cg 2.4s linear infinite}}
@keyframes z3cg{{from{{background-position:100% 0}}to{{background-position:-150% 0}}}}.z3c .ttl span{{font:italic 400 17px 'Fraunces';color:#f3ead7}}
.z3c .row{{position:absolute;left:0;right:0;top:360px;display:flex;justify-content:center;gap:8px;perspective:600px}}
.z3c .dc{{display:block;width:60px;height:84px;animation:z3cd {T} cubic-bezier(.3,1,.4,1) infinite;animation-delay:calc(var(--k) * 90ms)}}
@keyframes z3cd{{0%,22%{{transform:translate(calc(260px - var(--k) * 68px),-340px) rotate(30deg)}}34%,100%{{transform:none}}}}
.z3c .in{{position:relative;display:block;width:60px;height:84px;transform-style:preserve-3d;animation:z3cf {T} ease infinite;animation-delay:calc(var(--k) * 90ms)}}
.z3c .in>.cd{{position:absolute;inset:0;backface-visibility:hidden}}.z3c .in>.cd.dn{{transform:rotateY(180deg)}}
@keyframes z3cf{{0%,34%{{transform:rotateY(180deg)}}42%,100%{{transform:none}}}}
.z3c .pile{{position:absolute;left:50%;top:620px;width:0;height:0}}
.z3c .ch{{position:absolute;left:calc(var(--x) - 15px);top:calc(var(--y) - 15px);width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,var(--c) 0 40%,transparent 41%),repeating-conic-gradient(var(--c) 0 20deg,#f6f0e1 20deg 40deg);box-shadow:inset 0 0 0 2px rgba(0,0,0,.25),0 4px 6px rgba(0,0,0,.5);animation:z3cch {T} cubic-bezier(.5,0,.8,.6) infinite;animation-delay:calc(var(--k) * 45ms)}}
@keyframes z3cch{{0%,44%{{transform:translateY(-760px) rotate(0);opacity:1}}58%{{transform:translateY(0) rotate(400deg)}}61%{{transform:translateY(-10px) rotate(400deg)}}63%,100%{{transform:rotate(400deg)}}}}
.z3c .pot{{position:absolute;left:0;right:0;top:668px;text-align:center;animation:z3cpo {T} ease infinite}}@keyframes z3cpo{{0%,56%{{opacity:0}}60%,100%{{opacity:1}}}}
.z3c .pot small{{display:block;font:700 10px 'Figtree';letter-spacing:.3em;text-transform:uppercase;color:#b9a88b}}
.z3c .cnt{{font:600 44px 'Fraunces';color:#ecd39b}}.z3c .cnt::after{{content:"0";animation:z3cn {T} steps(1) infinite}}
@keyframes z3cn{{0%,60%{{content:"0"}}62%{{content:"420"}}64%{{content:"980"}}66%{{content:"1,540"}}68%{{content:"2,120"}}70%{{content:"2,640"}}72%,100%{{content:"2,860"}}}}
'''
    return scoped(h, c, 'bg spot mar mc ttl row dc in pile ch pot cnt', 'c3')

def t4(th):
    rays = ''.join(f'<path d="M195 330 L{195 + 600 * math.cos(math.radians(a)):.0f} {330 + 600 * math.sin(math.radians(a)):.0f} L{195 + 600 * math.cos(math.radians(a + 6)):.0f} {330 + 600 * math.sin(math.radians(a + 6)):.0f}Z"/>' for a in range(0, 360, 15))
    coins = ''.join(f'<i class="co" style="--dx:{dx}px;--h:{hh}px;--k:{k}"></i>' for k, (dx, hh) in enumerate([(-150, 420), (-110, 520), (-70, 600), (-30, 640), (10, 620), (50, 580), (90, 520), (130, 460), (-120, 380), (120, 400), (-50, 560), (70, 600)]))
    arc = ''.join(f'<span class="ac" style="--k:{k}"><span class="in">{card(c, 56)}{back(56)}</span></span>' for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    fws = ''.join(f'<span class="fw" style="left:{x}px;top:{y}px;--c:{c};--d:{d}s">' + ''.join(f'<i style="--a:{a}deg"></i>' for a in range(0, 360, 24)) + '</span>'
                  for x, y, c, d in [(70, 130, '#ecd39b', 0), (320, 110, '#e0675a', .45), (200, 70, '#f3ead7', .9), (60, 330, '#e0675a', 1.3), (330, 320, '#ecd39b', 1.7)])
    conf = ''.join(f'<b class="cf" style="left:{(k * 41) % 380}px;background:{["#ecd39b", "#8a2f27", "#f3ead7", "#c9a15b"][k % 4]};--d:{(k * .27) % 2.4:.2f}s;--r:{(k * 61) % 360}deg"></b>' for k in range(24))
    cup = ('<svg viewBox="0 0 120 150" aria-hidden="true"><defs><linearGradient id="ccg" x1="0" x2="1"><stop offset="0" stop-color="#8a6a2e"/><stop offset=".35" stop-color="#fff3cf"/><stop offset=".55" stop-color="#ecd39b"/><stop offset="1" stop-color="#8a6a2e"/></linearGradient></defs>'
           '<path d="M24 14 H96 V40 Q96 82 60 92 Q24 82 24 40Z" fill="url(#ccg)" stroke="#5a3d14" stroke-width="2"/><path d="M24 24 Q4 24 6 44 Q8 62 30 66" fill="none" stroke="url(#ccg)" stroke-width="7"/><path d="M96 24 Q116 24 114 44 Q112 62 90 66" fill="none" stroke="url(#ccg)" stroke-width="7"/>'
           '<rect x="52" y="90" width="16" height="22" fill="url(#ccg)"/><path d="M34 112 H86 L92 124 H28Z" fill="url(#ccg)" stroke="#5a3d14" stroke-width="1.5"/><rect x="22" y="124" width="76" height="20" rx="3" fill="#2a1a0e" stroke="#c9a15b" stroke-width="2"/>'
           '<text x="60" y="138" text-anchor="middle" font-family="Fraunces" font-style="italic" font-weight="600" font-size="11" fill="#ecd39b">Meera · S3</text><text x="60" y="58" text-anchor="middle" font-family="Fraunces" font-style="italic" font-weight="600" font-size="24" fill="#5a3d14">TP</text></svg>')
    h = ('<div class="z4c"><div class="bg"></div>'
         f'<svg class="rays" viewBox="0 0 390 844" aria-hidden="true">{rays}</svg>'
         f'<div class="cup">{cup}</div><div class="foun">{coins}</div>'
         f'<div class="arc">{arc}</div><div class="flash"></div>'
         f'<div class="fin"><div class="bg2"></div>{fws}'
         '<div class="rib"><svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 L40 30 L30 52 L40 74 L0 74 L14 52Z M320 30 L360 30 L346 52 L360 74 L320 74 L330 52Z" fill="#5e1f1a"/><path d="M30 16 H330 V62 H30Z" fill="#8a2f27" stroke="#ecd39b" stroke-width="2"/></svg><b>Royal Flush</b></div>'
         '<p class="sub">ten to ace of hearts · once in a lifetime</p>'
         f'<div class="cup2">{cup}</div>'
         f'<div class="mar">{MARCO}<p>Bravissimo, Meera!<br><b>Drinks are on me.</b></p></div>{conf}</div></div>')
    T = '7s'
    c = f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4csh {T} linear infinite}}
@keyframes z4csh{{0%,55%,61%,100%{{transform:none}}56%{{transform:translate(-5px,3px)}}58%{{transform:translate(4px,-3px)}}60%{{transform:translate(-2px,1px)}}}}
.z4c{{position:absolute;inset:0;overflow:hidden;animation:z4co {T} ease infinite}}@keyframes z4co{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4c .bg,.z4c .bg2{{position:absolute;inset:0;background:radial-gradient(70% 50% at 50% 40%,#2a1a0e,#0e0906 80%)}}.z4c .bg{{animation:z4cb {T} ease infinite}}@keyframes z4cb{{0%{{opacity:0}}6%{{opacity:1}}}}
.z4c .rays{{position:absolute;inset:0;width:100%;height:100%;transform-origin:195px 330px;animation:z4cr 14s linear infinite,z4cro {T} ease infinite}}.z4c .rays path{{fill:rgba(236,211,155,.12)}}
@keyframes z4cr{{to{{transform:rotate(360deg)}}}}@keyframes z4cro{{0%,8%{{opacity:0}}20%,100%{{opacity:1}}}}
.z4c .cup{{position:absolute;left:50%;top:250px;width:160px;height:200px;margin-left:-80px;filter:drop-shadow(0 0 30px rgba(236,211,155,.5));animation:z4ccu {T} cubic-bezier(.2,1.2,.3,1) infinite}}.z4c .cup svg,.z4c .cup2 svg{{width:100%;height:100%}}
@keyframes z4ccu{{0%,8%{{transform:translateY(600px)}}22%,52%{{transform:none;opacity:1}}55%,100%{{transform:none;opacity:0}}}}
.z4c .foun{{position:absolute;left:50%;top:760px;width:0;height:0}}
.z4c .co{{position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3cf,#ecd39b 40%,#a87d3a);box-shadow:inset 0 0 0 2px #8a6a2e;opacity:0;animation:z4cc 1.8s cubic-bezier(.2,.6,.5,1) infinite,z4cco {T} linear infinite;animation-delay:calc(var(--k) * 140ms),0s}}
@keyframes z4cc{{0%{{transform:translate(0,0) scaleX(1)}}25%{{transform:translate(calc(var(--dx) * .5),calc(var(--h) * -1)) scaleX(.2)}}50%{{transform:translate(calc(var(--dx) * .8),calc(var(--h) * -.8)) scaleX(1)}}100%{{transform:translate(var(--dx),40px) scaleX(.3)}}}}
@keyframes z4cco{{0%,18%{{opacity:0}}20%,54%{{opacity:1}}56%,100%{{opacity:0}}}}
.z4c .arc{{position:absolute;left:50%;top:150px;width:0;height:0}}
.z4c .ac{{position:absolute;left:-28px;top:-40px;width:56px;height:78px;transform:rotate(calc((var(--k) - 2) * 24deg)) translateY(-90px) rotate(calc((var(--k) - 2) * -12deg));opacity:0;animation:z4cac {T} ease infinite}}
@keyframes z4cac{{0%,26%,56%,100%{{opacity:0}}28%,54%{{opacity:1}}}}
.z4c .in{{position:relative;display:block;width:56px;height:78px;transform-style:preserve-3d;animation:z4cf {T} ease infinite;animation-delay:calc(var(--k) * 150ms)}}
.z4c .in>.cd{{position:absolute;inset:0;backface-visibility:hidden}}.z4c .in>.cd.dn{{transform:rotateY(180deg)}}@keyframes z4cf{{0%,30%{{transform:rotateY(180deg)}}36%,100%{{transform:none}}}}
.z4c .flash{{background:#fff3cf;animation:z4cfl {T} linear infinite}}@keyframes z4cfl{{0%,54%{{opacity:0}}56%{{opacity:1}}62%,100%{{opacity:0}}}}
.z4c .fin{{position:absolute;inset:0;opacity:0;animation:z4cfi {T} ease infinite}}@keyframes z4cfi{{0%,55%{{opacity:0}}56%,100%{{opacity:1}}}}
.z4c .fw{{position:absolute;width:0;height:0}}.z4c .fw i{{position:absolute;left:-2px;top:-2px;width:4px;height:14px;border-radius:2px;background:var(--c);box-shadow:0 0 6px var(--c);transform:rotate(var(--a)) translateY(0);animation:z4cfw 2s cubic-bezier(.1,.7,.3,1) infinite;animation-delay:var(--d)}}
@keyframes z4cfw{{0%{{transform:rotate(var(--a)) translateY(0);opacity:1}}75%{{opacity:1}}100%{{transform:rotate(var(--a)) translateY(-64px);opacity:0}}}}
.z4c .rib{{position:absolute;left:14px;right:14px;top:200px;height:96px;display:grid;place-items:center;animation:z4crb {T} cubic-bezier(.2,1.2,.3,1) infinite}}.z4c .rib svg{{position:absolute;inset:0;width:100%;height:100%}}
.z4c .rib b{{position:relative;margin-top:-8px;font:italic 600 46px 'Fraunces';color:#ecd39b;text-shadow:0 2px 0 #5e1f1a}}@keyframes z4crb{{0%,57%{{transform:scaleX(0)}}63%,100%{{transform:none}}}}
.z4c .sub{{position:absolute;left:0;right:0;top:300px;margin:0;text-align:center;font:italic 400 17px 'Fraunces';color:#f3ead7;animation:z4csu {T} ease infinite}}@keyframes z4csu{{0%,62%{{opacity:0}}66%,100%{{opacity:1}}}}
.z4c .cup2{{position:absolute;left:50%;top:350px;width:150px;height:188px;margin-left:-75px;filter:drop-shadow(0 0 30px rgba(236,211,155,.55));animation:z4cc2 {T} cubic-bezier(.2,1.4,.3,1) infinite}}@keyframes z4cc2{{0%,58%{{transform:scale(.4);opacity:0}}64%,100%{{transform:none;opacity:1}}}}
.z4c .mar{{position:absolute;left:18px;right:18px;top:580px;display:flex;align-items:center;gap:12px;animation:z4cm {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z4cm{{0%,68%{{transform:translateX(-420px)}}74%,100%{{transform:none}}}}
.z4c .mc{{display:block;width:84px;height:84px;flex:none;border-radius:50%;overflow:hidden;box-shadow:0 0 0 3px #1b120d,0 0 0 5px #c9a15b}}.z4c .mc img{{width:100%;height:100%;object-fit:cover;display:block}}
.z4c .mar p{{margin:0;padding:10px 14px;border-radius:14px;background:#f3ead7;color:#2a1a0e;font:500 14px/1.35 'Figtree'}}.z4c .mar b{{font:italic 600 18px 'Fraunces';color:#8a2f27}}
.z4c .cf{{position:absolute;top:-20px;width:8px;height:12px;transform:rotate(var(--r));animation:z4ccf 2.8s linear infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4ccf{{to{{transform:translateY(880px) rotate(calc(var(--r) + 720deg))}}}}
'''
    return scoped(h, c, 'bg bg2 rays cup cup2 foun co arc ac in fin fw rib sub mar mc cf', 'c4')
