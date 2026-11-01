"""Ivory: tier 3 (a letterpress platen slams onto the page, lifts to show FULL HOUSE debossed, gold foil floods in, the five cards print
onto an uncut sheet, a stitched leather tag swings in) and tier 4 (a guilloche rosette engraves itself, laurels grow round the crest,
cream flash, ribbon banner, paper confetti, wax seal)."""
from core import *

GR, TAN, CR = '#1f4a3a', '#b88a5d', '#fffdf8'

def t3(th):
    cards = ''.join(f'<span class="pc" style="--k:{k}">{card(c, 58)}</span>' for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    reg = ''.join(f'<svg class="rg" style="left:{x}px;top:{y}px" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5"/><path d="M10 0 V20 M0 10 H20"/></svg>' for x, y in [(20, 170), (350, 170), (20, 640), (350, 640)])
    h = ('<div class="z3i"><div class="pap"></div>' + reg +
         '<div class="deb"><small>Kings full of sevens</small><b data-t="Full House">Full House</b><b class="foil">Full House</b></div>'
         f'<div class="sheet"><div class="crop"></div>{cards}</div>'
         '<div class="plat"><i></i><span>TRAIN POKER · PRESS NO. 23</span></div>'
         '<div class="tag"><i class="str"></i><div><small>Pot to</small><b>Meera</b><em>2,860</em></div></div>'
         '<p class="proof">Proof 1 of 1 · pressed at the Friday Night Table</p></div>')
    T = '4.6s'
    c = f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3ish {T} linear infinite}}@keyframes z3ish{{0%,17%,23%,100%{{transform:none}}18%{{transform:translateY(6px)}}20%{{transform:translateY(-3px)}}22%{{transform:translateY(1px)}}}}
.z3i{{position:absolute;inset:0;overflow:hidden;animation:z3io {T} ease infinite}}@keyframes z3io{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3i .pap{{position:absolute;inset:0;background:repeating-linear-gradient(97deg,rgba(120,100,70,.035) 0 1px,transparent 1px 7px),radial-gradient(90% 60% at 50% 30%,#fbf8f1,#f3eee4 70%,#e9e1d1);animation:z3ip {T} ease infinite}}@keyframes z3ip{{0%{{opacity:0}}6%{{opacity:1}}}}
.z3i .rg{{position:absolute;width:20px;height:20px;animation:z3ip {T} ease infinite}}.z3i .rg circle,.z3i .rg path{{fill:none;stroke:{TAN};stroke-width:.8}}
.z3i .deb{{position:absolute;left:0;right:0;top:250px;text-align:center}}
.z3i .deb small{{display:block;font:600 10px 'DM Sans';letter-spacing:.3em;text-transform:uppercase;color:#6f6a5e;animation:z3iv {T} ease infinite}}@keyframes z3iv{{0%,26%{{opacity:0}}30%,100%{{opacity:1}}}}
.z3i .deb b{{display:block;margin-top:6px;font:400 68px/1 'DM Serif Display';color:#ece5d6;text-shadow:1px 1px 0 #fff,-1px -1px 0 rgba(60,45,25,.28);animation:z3iv {T} ease infinite}}
.z3i .deb .foil{{position:absolute;left:0;right:0;top:20px;margin:0;color:transparent;text-shadow:none;background:linear-gradient(100deg,#8a6a3a 20%,#f7e3b0 42%,#e2c286 52%,#8a6a3a 72%) 0 0/260% 100%;-webkit-background-clip:text;background-clip:text;clip-path:inset(0 100% 0 0);animation:z3if {T} ease infinite,z3ifs 2.4s linear infinite}}
@keyframes z3if{{0%,32%{{clip-path:inset(0 100% 0 0)}}44%,100%{{clip-path:inset(0 0 0 0)}}}}@keyframes z3ifs{{from{{background-position:100% 0}}to{{background-position:-160% 0}}}}
.z3i .plat{{position:absolute;left:-10px;right:-10px;top:-20px;height:390px;background:linear-gradient(180deg,#163a2d,{GR});box-shadow:0 0 0 2px #0f2a20,0 20px 40px rgba(0,0,0,.45),inset 0 -6px 0 {TAN};animation:z3ipl {T} cubic-bezier(.7,0,.3,1) infinite}}
.z3i .plat i{{position:absolute;left:30px;right:30px;bottom:30px;height:60px;border-radius:6px;background:repeating-linear-gradient(90deg,rgba(255,253,248,.08) 0 2px,transparent 2px 8px);box-shadow:inset 0 0 0 1px rgba(255,253,248,.15)}}
.z3i .plat span{{position:absolute;left:0;right:0;bottom:44px;text-align:center;font:600 10px 'DM Sans';letter-spacing:.3em;color:rgba(255,253,248,.55)}}
@keyframes z3ipl{{0%,6%{{transform:translateY(-430px)}}17%,24%{{transform:none}}32%,100%{{transform:translateY(-450px)}}}}
.z3i .sheet{{position:absolute;left:24px;right:24px;top:400px;height:130px;display:flex;justify-content:center;align-items:center;gap:8px;background:{CR};box-shadow:0 8px 20px rgba(60,45,25,.18),inset 0 0 0 1px rgba(34,38,31,.08);animation:z3is {T} cubic-bezier(.2,1.2,.3,1) infinite}}
@keyframes z3is{{0%,36%{{transform:translateY(40px);opacity:0}}42%,100%{{transform:none;opacity:1}}}}
.z3i .crop{{position:absolute;inset:8px;border:1px dashed rgba(184,138,93,.6)}}
.z3i .pc{{display:block;clip-path:inset(0 0 100% 0);animation:z3ipc {T} steps(6) infinite;animation-delay:calc(var(--k) * 110ms)}}@keyframes z3ipc{{0%,44%{{clip-path:inset(0 0 100% 0)}}52%,100%{{clip-path:inset(0)}}}}
.z3i .tag{{position:absolute;right:30px;top:580px;width:150px;transform-origin:50% -40px;animation:z3it {T} cubic-bezier(.3,1.4,.4,1) infinite}}
.z3i .tag .str{{position:absolute;left:50%;top:-40px;width:1.5px;height:44px;background:#6e4a2b}}
.z3i .tag div{{position:relative;padding:14px 12px 12px;border-radius:10px 10px 30px 30px;text-align:center;background:linear-gradient(180deg,#c49668,#a87a4c);box-shadow:inset 0 0 0 4px #a87a4c,inset 0 0 0 5px #fff1d8,0 12px 24px rgba(60,45,25,.35);color:#fffdf8}}
.z3i .tag div::before{{content:"";position:absolute;inset:8px;border-radius:6px 6px 24px 24px;border:1.5px dashed rgba(255,241,216,.75)}}
.z3i .tag small{{font:600 9px 'DM Sans';letter-spacing:.3em;text-transform:uppercase}}.z3i .tag b{{display:block;font:400 30px/1.1 'DM Serif Display'}}.z3i .tag em{{font:italic 400 18px 'DM Serif Display'}}
@keyframes z3it{{0%,54%{{transform:translateY(-760px)}}60%{{transform:rotate(8deg)}}64%{{transform:rotate(-5deg)}}68%{{transform:rotate(2deg)}}72%,100%{{transform:none}}}}
.z3i .proof{{position:absolute;left:24px;top:600px;width:160px;margin:0;font:italic 400 14px/1.4 'DM Serif Display';color:#6f6a5e;animation:z3ipr {T} ease infinite}}@keyframes z3ipr{{0%,60%{{opacity:0}}66%,100%{{opacity:1}}}}
'''
    return scoped(h, c, 'pap rg deb foil sheet crop pc plat tag str proof', 'iv3')

def t4(th):
    ell = ''.join(f'<ellipse cx="0" cy="0" rx="120" ry="44" transform="rotate({a})" style="--k:{k}"/>' for k, a in enumerate(range(0, 180, 9)))
    ell2 = ''.join(f'<ellipse cx="0" cy="0" rx="70" ry="22" transform="rotate({a})" style="--k:{k}"/>' for k, a in enumerate(range(5, 180, 12)))
    def branch(side):
        leaves = ''
        for k, a in enumerate(range(118, 250, 14)):
            r = math.radians(a); x, y = 150 * math.cos(r) * side * -1, 150 * math.sin(r)
            rot = (a + 90 + 28) * (1 if side < 0 else -1) + (0 if side < 0 else 180)
            leaves += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="13" ry="5" transform="rotate({rot:.0f} {x:.1f} {y:.1f})"/>'
        return leaves
    conf = ''.join(f'<b class="cf" style="left:{(k * 37) % 380}px;background:{[CR, GR, TAN, "#e9cf8f"][k % 4]};--d:{(k * .29) % 2.6:.2f}s;--r:{(k * 57) % 360}deg"></b>' for k in range(24))
    fan = ''.join(cardk(c, 62, 'fc', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    h = ('<div class="z4i"><div class="pap"></div>'
         f'<svg class="ros" viewBox="-160 -160 320 320" aria-hidden="true"><g class="o">{ell}</g><g class="n">{ell2}</g><circle class="ring" r="132"/><circle class="ring" r="138" stroke-dasharray="2 3"/>'
         f'<g class="lf">{branch(-1)}{branch(1)}</g>'
         f'<circle class="crest" r="44"/><text class="cl" y="16" text-anchor="middle">R</text></svg><div class="foilx"></div>'
         '<div class="flash"></div>'
         f'<div class="fin">{conf}'
         '<div class="rib"><svg viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 30 L40 30 L30 52 L40 74 L0 74 L14 52Z M320 30 L360 30 L346 52 L360 74 L320 74 L330 52Z" fill="#163a2d"/><path d="M30 16 H330 V62 H30Z" fill="#1f4a3a" stroke="#e9cf8f" stroke-width="1.5"/></svg><b>Royal Flush</b></div>'
         '<p class="sub"><small>A once-a-season hand</small>ten to ace of hearts · Meera</p>'
         f'<div class="fan">{fan}</div><div class="seal">M</div></div></div>')
    T = '7s'
    c = f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4ish {T} linear infinite}}@keyframes z4ish{{0%,79%,85%,100%{{transform:none}}80%{{transform:translateY(5px)}}82%{{transform:translateY(-3px)}}84%{{transform:translateY(1px)}}}}
.z4i{{position:absolute;inset:0;overflow:hidden;animation:z4io {T} ease infinite}}@keyframes z4io{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4i .pap{{position:absolute;inset:0;background:repeating-linear-gradient(97deg,rgba(120,100,70,.035) 0 1px,transparent 1px 7px),radial-gradient(80% 50% at 50% 36%,#fbf8f1,#f0e9da 70%,#e4dac6);animation:z4ip {T} ease infinite}}@keyframes z4ip{{0%{{opacity:0}}5%{{opacity:1}}}}
.z4i .ros{{position:absolute;left:50%;top:150px;width:340px;height:340px;margin-left:-170px;animation:z4ir {T} ease infinite}}@keyframes z4ir{{0%,54%{{transform:none;opacity:1}}58%,100%{{transform:translateY(-70px) scale(.62);opacity:1}}}}
.z4i .ros ellipse{{fill:none;stroke-dasharray:560;stroke-dashoffset:560;animation:z4id {T} ease-out infinite;animation-delay:calc(var(--k) * 60ms)}}
.z4i .o ellipse{{stroke:{GR};stroke-width:.7}}.z4i .n ellipse{{stroke:{TAN};stroke-width:.8}}
@keyframes z4id{{0%,6%{{stroke-dashoffset:560}}30%,100%{{stroke-dashoffset:0}}}}
.z4i .ros .o{{animation:z4isp 30s linear infinite}}@keyframes z4isp{{to{{transform:rotate(360deg)}}}}
.z4i .ring{{fill:none;stroke:{GR};stroke-width:1.2;opacity:0;animation:z4iri {T} ease infinite}}@keyframes z4iri{{0%,28%{{opacity:0}}34%,100%{{opacity:1}}}}
.z4i .lf ellipse{{fill:{GR};stroke:none;stroke-dasharray:none;animation:none}}.z4i .lf{{animation:z4il {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z4il{{0%,30%{{opacity:0;transform:rotate(-30deg) scale(.7)}}40%,100%{{opacity:1;transform:none}}}}
.z4i .crest{{fill:{GR};stroke:#e9cf8f;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:z4ic {T} cubic-bezier(.2,1.5,.3,1) infinite}}.z4i .cl{{font:400 50px 'DM Serif Display';fill:#e9cf8f;transform-box:fill-box;transform-origin:center;animation:z4ic {T} cubic-bezier(.2,1.5,.3,1) infinite}}
@keyframes z4ic{{0%,40%{{scale:0}}46%,100%{{scale:1}}}}
.z4i .foilx{{position:absolute;left:0;right:0;top:150px;height:340px;background:linear-gradient(105deg,transparent 35%,rgba(255,238,190,.75) 50%,transparent 65%);mix-blend-mode:screen;-webkit-mask:radial-gradient(circle at 50% 50%,#000 0 49%,transparent 50%);mask:radial-gradient(circle at 50% 50%,#000 0 49%,transparent 50%);animation:z4if {T} ease-in-out infinite}}
@keyframes z4if{{0%,44%{{transform:translateX(-110%)}}54%,100%{{transform:translateX(110%)}}}}
.z4i .flash{{background:{CR};animation:z4ifl {T} linear infinite}}@keyframes z4ifl{{0%,53%{{opacity:0}}56%{{opacity:1}}60%,100%{{opacity:0}}}}
.z4i .fin{{position:absolute;inset:0;opacity:0;animation:z4ifi {T} ease infinite}}@keyframes z4ifi{{0%,55%{{opacity:0}}56%,100%{{opacity:1}}}}
.z4i .rib{{position:absolute;left:14px;right:14px;top:330px;height:96px;display:grid;place-items:center;animation:z4irb {T} cubic-bezier(.2,1.2,.3,1) infinite}}.z4i .rib svg{{position:absolute;inset:0;width:100%;height:100%}}
.z4i .rib b{{position:relative;margin-top:-8px;font:400 44px 'DM Serif Display';color:#fffdf8}}@keyframes z4irb{{0%,58%{{transform:scaleX(0)}}64%,100%{{transform:none}}}}
.z4i .sub{{position:absolute;left:0;right:0;top:432px;margin:0;text-align:center;font:italic 400 17px 'DM Serif Display';color:{GR};animation:z4isu {T} ease infinite}}.z4i .sub small{{display:block;font:600 10px 'DM Sans';font-style:normal;letter-spacing:.3em;text-transform:uppercase;color:#6f6a5e;margin-bottom:4px}}
@keyframes z4isu{{0%,62%{{opacity:0}}66%,100%{{opacity:1}}}}
.z4i .fan{{position:absolute;left:50%;top:520px;width:0;height:0}}.z4i .fc{{position:absolute;left:-31px;top:0;transform-origin:50% 240%;animation:z4ifc {T} cubic-bezier(.3,1.2,.4,1) infinite}}
@keyframes z4ifc{{0%,64%{{transform:translateY(60px);opacity:0}}70%{{transform:none;opacity:1}}78%,100%{{transform:rotate(calc((var(--k) - 2) * 9deg));opacity:1}}}}
.z4i .seal{{position:absolute;right:34px;top:640px;width:66px;height:66px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,#c25a40,#8a2f1f);color:#f3d9c9;font:400 30px 'DM Serif Display';box-shadow:0 0 0 5px #a0452e,0 6px 14px rgba(0,0,0,.35);animation:z4ise {T} cubic-bezier(.3,1.6,.5,1) infinite}}
@keyframes z4ise{{0%,78%{{transform:scale(2.4);opacity:0}}81%,100%{{transform:rotate(-10deg);opacity:1}}}}
.z4i .cf{{position:absolute;top:-20px;width:9px;height:13px;box-shadow:0 1px 2px rgba(60,45,25,.25);transform:rotate(var(--r));animation:z4icf 3s linear infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4icf{{to{{transform:translateY(880px) rotate(calc(var(--r) + 540deg))}}}}
'''
    return scoped(h, c, 'pap ros o n ring lf crest cl foilx fin rib sub fan fc seal cf', 'iv4')
