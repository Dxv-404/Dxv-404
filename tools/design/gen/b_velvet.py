"""Velvet: tier 3 (curtain call: velvet drapes part, a spotlight finds the stage, the cards rise on a lift, rose petals fall) and
tier 4 (the chandelier: it lowers and lights candle by candle, two spotlights sweep, glitter and petals, a crown monogram, an invitation card turns in 3D)."""
from core import *

CH, OX, CR = '#e6c995', '#4a0f1c', '#f6e9dc'
def petals(n, seed=1):
    return ''.join(f'<i class="pt" style="left:{(k * 47 + seed * 13) % 380}px;--d:{(k * .41) % 3:.2f}s;--t:{3 + (k % 3) * .7:.1f}s;--r:{(k * 67) % 360}deg;--c:{["#9a1b2e", "#c4475a", "#f2a7a0"][k % 3]}"></i>' for k in range(n))
def glints(pts):
    return ''.join(f'<svg class="gl" style="left:{x}px;top:{y}px;--d:{d}s" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -10 C1 -2 2 -1 10 0 C2 1 1 2 0 10 C-1 2 -2 1 -10 0 C-2 -1 -1 -2 0 -10Z"/></svg>' for x, y, d in pts)
CURT = 'repeating-linear-gradient(90deg,#3a0b15 0 6px,#6e1a2a 14px,#8a2436 20px,#5a1422 28px,#3a0b15 36px)'

def t3(th):
    cards = ''.join(f'<span class="lc" style="--k:{k}">{card(c, 62)}</span>' for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    title = ''.join(f'<span style="--k:{k}">{ch if ch != " " else "&nbsp;"}</span>' for k, ch in enumerate('Full House'))
    h = ('<div class="z3v"><div class="stage"></div><div class="cone"></div><div class="pool"></div>'
         f'{glints([(60, 180, 0), (320, 240, .5), (90, 520, 1), (300, 600, 1.4)])}'
         f'<div class="ttl"><small>Kings full of sevens</small><b>{title}</b></div>'
         f'<div class="lift">{cards}</div>'
         '<div class="plate"><small>To Meera</small><b>2,860</b></div>'
         f'{petals(16)}'
         '<div class="cur cl"><i class="fr"></i></div><div class="cur cr"><i class="fr"></i></div><div class="val"></div></div>')
    T = '4.6s'
    c = f'''
.z3v{{position:absolute;inset:0;overflow:hidden;animation:z3vo {T} ease infinite}}@keyframes z3vo{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3v .stage{{position:absolute;inset:0;background:radial-gradient(70% 40% at 50% 92%,#2a0a12,#12040a 70%)}}
.z3v .cone{{position:absolute;left:50%;top:-20px;width:440px;height:760px;margin-left:-220px;background:conic-gradient(from 166deg at 50% 0,transparent,rgba(255,226,190,.2) 10deg,rgba(255,236,206,.28) 14deg,rgba(255,226,190,.2) 18deg,transparent 28deg);animation:z3vc {T} ease infinite}}
@keyframes z3vc{{0%,22%{{opacity:0}}30%,100%{{opacity:1}}}}
.z3v .pool{{position:absolute;left:50%;top:600px;width:340px;height:90px;margin-left:-170px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,226,190,.35),transparent);animation:z3vc {T} ease infinite}}
.z3v .ttl{{position:absolute;left:0;right:0;top:200px;text-align:center}}
.z3v .ttl small{{display:block;font:700 10px 'Manrope';letter-spacing:.34em;text-transform:uppercase;color:#b49284;animation:z3vs {T} ease infinite}}@keyframes z3vs{{0%,30%{{opacity:0}}36%,100%{{opacity:1}}}}
.z3v .ttl b{{display:flex;justify-content:center;margin-top:8px;font:italic 500 64px/1.05 'Bodoni Moda'}}
.z3v .ttl b span{{display:block;background:linear-gradient(180deg,#fff6e6,{CH} 60%,#b8955a);-webkit-background-clip:text;background-clip:text;color:transparent;animation:z3vt {T} cubic-bezier(.2,1,.3,1) infinite;animation-delay:calc(var(--k) * 45ms)}}
@keyframes z3vt{{0%,32%{{opacity:0;transform:translateY(18px)}}42%,100%{{opacity:1;transform:none}}}}
.z3v .lift{{position:absolute;left:0;right:0;top:420px;display:flex;justify-content:center;gap:8px}}
.z3v .lc{{display:block;animation:z3vl {T} cubic-bezier(.2,1.1,.3,1) infinite;animation-delay:calc(var(--k) * 90ms)}}@keyframes z3vl{{0%,28%{{transform:translateY(420px)}}40%,100%{{transform:none}}}}
.z3v .lc .cd{{box-shadow:0 0 0 1px {CH},0 14px 26px rgba(0,0,0,.6)!important}}
.z3v .plate{{position:absolute;left:50%;top:560px;width:200px;margin-left:-100px;padding:12px;border-radius:30px;text-align:center;background:#22090f;box-shadow:inset 0 0 0 1px rgba(230,201,149,.5),0 12px 24px rgba(0,0,0,.5);animation:z3vp {T} ease infinite}}
.z3v .plate small{{display:block;font:700 9.5px 'Manrope';letter-spacing:.3em;text-transform:uppercase;color:#b49284}}.z3v .plate b{{font:500 32px 'Bodoni Moda';color:{CH}}}@keyframes z3vp{{0%,50%{{opacity:0;transform:translateY(16px)}}58%,100%{{opacity:1;transform:none}}}}
.z3v .gl{{position:absolute;width:20px;height:20px;animation:z3vg 1.6s ease-in-out infinite;animation-delay:var(--d)}}.z3v .gl path{{fill:#fff6e6}}@keyframes z3vg{{0%,100%{{transform:scale(0) rotate(0)}}50%{{transform:scale(1) rotate(90deg)}}}}
.z3v .pt{{position:absolute;top:-20px;width:12px;height:9px;border-radius:80% 0 80% 0;background:var(--c);transform:rotate(var(--r));animation:z3vpt var(--t) linear infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z3vpt{{0%{{transform:translate(0,0) rotate(var(--r))}}50%{{transform:translate(24px,440px) rotate(calc(var(--r) + 220deg))}}100%{{transform:translate(-8px,880px) rotate(calc(var(--r) + 460deg))}}}}
.z3v .cur{{position:absolute;top:0;bottom:0;width:52%;background:{CURT};box-shadow:inset 0 -40px 60px rgba(0,0,0,.4),0 0 30px rgba(0,0,0,.6);animation:z3vcu {T} cubic-bezier(.6,0,.2,1) infinite}}
.z3v .cur.cl{{left:0;--x:-88%;transform-origin:0 0}}.z3v .cur.cr{{right:0;--x:88%;transform-origin:100% 0}}
.z3v .fr{{position:absolute;left:0;right:0;bottom:0;height:22px;background:repeating-linear-gradient(90deg,{CH} 0 2px,transparent 2px 5px);-webkit-mask:linear-gradient(#000,transparent);mask:linear-gradient(#000,transparent)}}
@keyframes z3vcu{{0%{{transform:translateX(var(--x))}}8%,12%{{transform:none}}28%,100%{{transform:translateX(var(--x)) scaleX(.9)}}}}
.z3v .val{{position:absolute;left:-10px;right:-10px;top:0;height:70px;background:{CURT};border-radius:0 0 50% 50%/0 0 30px 30px;box-shadow:inset 0 -6px 0 {CH},0 10px 20px rgba(0,0,0,.5)}}
'''
    return scoped(h, c, 'stage cone pool ttl lift lc plate gl pt cur cl cr fr val', 'vv3')

def t4(th):
    arms = ''
    for k, x in enumerate([-110, -66, -22, 22, 66, 110]):
        arms += (f'<path d="M0 40 Q{x * .5:.0f} {70 + abs(x) * .1:.0f} {x} 60" fill="none" stroke="{CH}" stroke-width="2.4"/>'
                 f'<rect x="{x - 3}" y="40" width="6" height="20" fill="{CR}"/><path class="fl" style="--k:{k}" d="M{x} 30 Q{x - 4} 37 {x} 41 Q{x + 4} 37 {x} 30Z" fill="#ffd27a"/>'
                 f'<circle class="glo" style="--k:{k}" cx="{x}" cy="34" r="16" fill="url(#vglo)"/>'
                 + ''.join(f'<path d="M{x} {64 + j * 10} l-3 5 3 5 3 -5Z" class="dr" style="--k:{k + j}" fill="#fff6e6" opacity=".85"/>' for j in range(3)))
    chand = (f'<svg viewBox="-140 -40 280 200" aria-hidden="true"><defs><radialGradient id="vglo"><stop offset="0" stop-color="#ffe2a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></radialGradient></defs>'
             f'<path d="M0 -40 V20" stroke="{CH}" stroke-width="2"/><ellipse cx="0" cy="30" rx="20" ry="12" fill="{OX}" stroke="{CH}" stroke-width="2"/>{arms}'
             + ''.join(f'<path d="M{x} 100 l-4 7 4 9 4 -9Z" class="dr" style="--k:{k}" fill="#fff6e6"/>' for k, x in enumerate([-40, -20, 0, 20, 40])) + '<circle cx="0" cy="130" r="6" fill="#fff6e6"/></svg>')
    glit = ''.join(f'<i class="gt" style="left:{(k * 29) % 386}px;--d:{(k * .23) % 2.4:.2f}s"></i>' for k in range(30))
    fan = ''.join(cardk(c, 62, 'fc', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    crown = ('<svg class="cw" viewBox="0 0 120 80" aria-hidden="true"><path d="M14 62 L8 20 L34 40 L60 8 L86 40 L112 20 L106 62Z" fill="none" stroke="#e6c995" stroke-width="2"/><path d="M14 70 H106" stroke="#e6c995" stroke-width="2"/>'
             '<circle cx="8" cy="18" r="4" fill="#e6c995"/><circle cx="60" cy="6" r="4" fill="#e6c995"/><circle cx="112" cy="18" r="4" fill="#e6c995"/></svg>')
    h = ('<div class="z4v"><div class="bg"></div>'
         '<div class="sp sa"></div><div class="sp sb"></div>'
         f'<div class="ch">{chand}</div>{glit}{petals(14, 4)}'
         '<div class="flash"></div>'
         f'<div class="fin"><div class="halo"></div>{crown}'
         '<div class="ttl"><small>The Velvet Room presents</small><b>Royal Flush</b></div>'
         f'<div class="fan">{fan}</div>'
         '<div class="inv"><div class="ii"><small>You are invited to</small><b>The Royal Table</b><span>Meera · Season 3 · member no. 1</span></div></div></div></div>')
    T = '7s'
    c = f'''
.z4v{{position:absolute;inset:0;overflow:hidden;animation:z4vo {T} ease infinite}}@keyframes z4vo{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4v .bg{{position:absolute;inset:0;background:radial-gradient(70% 50% at 50% 30%,#3a0f19,#12040a 75%);animation:z4vb {T} ease infinite}}@keyframes z4vb{{0%{{opacity:0}}5%{{opacity:1}}}}
.z4v .ch{{position:absolute;left:50%;top:50px;width:320px;height:229px;margin-left:-160px;transform-origin:50% 0;animation:z4vch {T} cubic-bezier(.3,1.2,.4,1) infinite}}.z4v .ch svg{{width:100%;height:100%;overflow:visible}}
@keyframes z4vch{{0%,4%{{transform:translateY(-330px)}}20%{{transform:rotate(2deg)}}26%{{transform:rotate(-1.4deg)}}32%,52%{{transform:none}}57%,100%{{transform:translateY(-40px) scale(.8)}}}}
.z4v .fl{{opacity:0;transform-box:fill-box;transform-origin:50% 100%;animation:z4vfl {T} steps(1) infinite,z4vfk .4s ease-in-out infinite;animation-delay:calc(var(--k) * 140ms),0s}}
.z4v .glo{{opacity:0;animation:z4vfl {T} steps(1) infinite;animation-delay:calc(var(--k) * 140ms)}}@keyframes z4vfl{{0%,20%{{opacity:0}}21%,100%{{opacity:1}}}}@keyframes z4vfk{{50%{{transform:scaleY(.8) scaleX(1.1)}}}}
.z4v .dr{{animation:z4vdr 1.6s ease-in-out infinite;animation-delay:calc(var(--k) * -230ms)}}@keyframes z4vdr{{0%,100%{{opacity:.5}}50%{{opacity:1}}}}
.z4v .sp{{position:absolute;top:-40px;width:500px;height:900px;background:conic-gradient(from 168deg at 50% 0,transparent,rgba(255,236,206,.18) 8deg,rgba(255,236,206,.24) 12deg,rgba(255,236,206,.18) 16deg,transparent 24deg);transform-origin:50% 0;opacity:0;animation:z4vsp 2.8s ease-in-out infinite alternate,z4vspo {T} ease infinite}}
.z4v .sa{{left:-230px;--a:-22deg;--b:24deg}}.z4v .sb{{right:-230px;--a:22deg;--b:-24deg;animation-delay:-1.4s,0s}}
@keyframes z4vsp{{from{{transform:rotate(var(--a))}}to{{transform:rotate(var(--b))}}}}@keyframes z4vspo{{0%,24%{{opacity:0}}30%,100%{{opacity:1}}}}
.z4v .gt{{position:absolute;top:-10px;width:3px;height:3px;border-radius:50%;background:#fff3cf;box-shadow:0 0 6px #ffe2a8;opacity:0;animation:z4vgt 2.6s linear infinite,z4vspo {T} ease infinite;animation-delay:calc(var(--d) * -1),0s}}@keyframes z4vgt{{to{{transform:translateY(860px) translateX(20px)}}}}
.z4v .pt{{position:absolute;top:-20px;width:12px;height:9px;border-radius:80% 0 80% 0;background:var(--c);transform:rotate(var(--r));opacity:0;animation:z4vpt var(--t) linear infinite,z4vspo {T} ease infinite;animation-delay:calc(var(--d) * -1),0s}}
@keyframes z4vpt{{0%{{transform:translate(0,0) rotate(var(--r))}}50%{{transform:translate(24px,440px) rotate(calc(var(--r) + 220deg))}}100%{{transform:translate(-8px,880px) rotate(calc(var(--r) + 460deg))}}}}
.z4v .flash{{background:#fff3e0;animation:z4vfa {T} linear infinite}}@keyframes z4vfa{{0%,53%{{opacity:0}}56%{{opacity:.9}}61%,100%{{opacity:0}}}}
.z4v .fin{{position:absolute;inset:0;opacity:0;animation:z4vfi {T} ease infinite}}@keyframes z4vfi{{0%,55%{{opacity:0}}56%,100%{{opacity:1}}}}
.z4v .halo{{position:absolute;left:50%;top:330px;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;background:radial-gradient(closest-side,rgba(18,4,10,.85),rgba(18,4,10,.5) 70%,transparent)}}
.z4v .cw{{position:absolute;left:50%;top:210px;width:96px;height:64px;margin-left:-48px;animation:z4vcw {T} cubic-bezier(.2,1.5,.3,1) infinite}}@keyframes z4vcw{{0%,56%{{transform:scale(0)}}62%,100%{{transform:none}}}}
.z4v .ttl{{position:absolute;left:0;right:0;top:284px;text-align:center}}.z4v .ttl small{{display:block;font:700 10px 'Manrope';letter-spacing:.34em;text-transform:uppercase;color:#b49284}}
.z4v .ttl b{{display:block;margin-top:6px;font:italic 500 66px/1 'Bodoni Moda';background:linear-gradient(100deg,#b8955a 20%,#fff6e6 42%,{CH} 52%,#b8955a 72%) 0 0/260% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:z4vft 2.6s linear infinite}}@keyframes z4vft{{from{{background-position:100% 0}}to{{background-position:-160% 0}}}}
.z4v .fan{{position:absolute;left:50%;top:400px;width:0;height:0}}.z4v .fc{{position:absolute;left:-31px;top:0;transform-origin:50% 240%;box-shadow:0 0 0 1px {CH},0 12px 24px rgba(0,0,0,.6)!important;animation:z4vfc {T} cubic-bezier(.3,1.2,.4,1) infinite}}
@keyframes z4vfc{{0%,60%{{transform:translateY(60px);opacity:0}}66%{{transform:none;opacity:1}}74%,100%{{transform:rotate(calc((var(--k) - 2) * 9deg));opacity:1}}}}
.z4v .inv{{position:absolute;left:50%;top:560px;width:280px;height:150px;margin-left:-140px;perspective:800px;animation:z4vin {T} cubic-bezier(.2,1.2,.3,1) infinite}}@keyframes z4vin{{0%,70%{{transform:translateY(300px)}}76%,100%{{transform:none}}}}
.z4v .ii{{position:absolute;inset:0;padding:22px 16px;border-radius:6px;text-align:center;background:linear-gradient(180deg,#fffaf3,#f3e3cc);box-shadow:inset 0 0 0 1px {CH},inset 0 0 0 6px #fffaf3,inset 0 0 0 7px rgba(184,149,90,.6),0 20px 40px rgba(0,0,0,.6);color:#2a0a12;animation:z4vii 4s ease-in-out infinite}}
@keyframes z4vii{{0%,100%{{transform:rotateY(-14deg) rotateX(6deg)}}50%{{transform:rotateY(14deg) rotateX(-4deg)}}}}
.z4v .ii small{{font:700 9.5px 'Manrope';letter-spacing:.3em;text-transform:uppercase;color:#8a6a60}}.z4v .ii b{{display:block;margin:6px 0;font:italic 500 32px 'Bodoni Moda';color:{OX}}}.z4v .ii span{{font:600 12px 'Manrope';color:#8a6a60}}
'''
    return scoped(h, c, 'bg sp sa sb ch fl glo dr gt pt fin halo cw ttl fan fc inv ii', 'vv4')
