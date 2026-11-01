"""Ink: tier 3 (comic-page full house, the v1 banner rebuilt) and tier 4 (royal flush: the page tears, four panels slam, Kage's eyes, ROYAL FLUSH)."""
from core import *

EYE = ('<svg viewBox="0 0 120 60" aria-hidden="true"><path d="M2 14 L116 2" stroke="#111" stroke-width="7" stroke-linecap="round"/>'
       '<path d="M8 38 Q50 10 112 28 Q70 54 8 38Z" fill="#fff" stroke="#111" stroke-width="4"/><circle cx="62" cy="33" r="13" fill="{iris}"/>'
       '<circle cx="62" cy="33" r="6" fill="#111"/><circle cx="57" cy="28" r="4" fill="#fff"/><circle cx="66" cy="38" r="2" fill="#fff"/></svg>')
TONE = 'radial-gradient(circle,#bdbdbd 1.1px,transparent 1.5px) 0 0/6px 6px,#fff'
BURST = 'repeating-conic-gradient(from 0deg at 50% 50%,#111 0 2.2deg,#fff 2.2deg 7deg)'

def t3(th):
    fan = ''.join(cardk(c, 64, 'kf', k=k) for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    h = ('<div class="z3k"><div class="bg"></div>'
         f'<div class="p p1"><div class="eyes">{EYE.format(iris="#111")}<span style="transform:scaleX(-1)">{EYE.format(iris="#111")}</span></div>'
         '<svg class="vein" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 8 Q20 18 14 32 M32 8 Q20 18 26 32 M8 20 Q20 14 32 20" stroke="#e8202a" stroke-width="4" fill="none" stroke-linecap="round"/></svg>'
         '<i class="sweat"></i><span class="cap">KAGE: …!!</span></div>'
         '<div class="p p2"><div class="ln"></div><b>FULL<br>HOUSE!!</b><span>KINGS FULL OF SEVENS</span></div>'
         f'<div class="p p3"><div class="fan">{fan}</div><p class="say"><b>Meera</b> wins 2,860!</p><span class="tk">ザワ… ザワ…</span></div>'
         '<div class="sfx">ドン!!</div><div class="frm"></div></div>')
    T = '4.6s'
    c = f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3ksh {T} linear infinite}}
@keyframes z3ksh{{0%,23%,34%,100%{{transform:none}}25%{{transform:translate(-8px,5px)}}27%{{transform:translate(7px,-6px)}}29%{{transform:translate(-5px,-3px)}}31%{{transform:translate(4px,4px)}}}}
.z3k{{position:absolute;inset:0;animation:z3kout {T} ease infinite}}@keyframes z3kout{{0%,92%{{opacity:1}}100%{{opacity:0}}}}
.z3k .bg{{position:absolute;inset:0;background:#111;animation:z3kbg {T} ease infinite}}@keyframes z3kbg{{0%{{opacity:0}}4%{{opacity:1}}}}
.z3k .p{{position:absolute;overflow:hidden;box-shadow:0 0 0 4px #111}}
.z3k .p1{{left:12px;right:12px;top:58px;height:218px;background:{TONE};clip-path:polygon(0 0,100% 0,100% 84%,0 100%);animation:z3kp1 {T} cubic-bezier(.2,1.3,.3,1) infinite}}
@keyframes z3kp1{{0%,4%{{transform:translateY(-120%) rotate(-4deg)}}12%,100%{{transform:none}}}}
.z3k .eyes{{position:absolute;left:24px;right:24px;top:58px;display:flex;justify-content:space-between}}.z3k .eyes svg{{width:136px;height:68px;display:block}}.z3k .eyes span{{display:block}}
.z3k .vein{{position:absolute;right:30px;top:12px;width:40px;height:40px;animation:z3kv .5s steps(2) infinite}}@keyframes z3kv{{50%{{transform:scale(1.15)}}}}
.z3k .sweat{{position:absolute;left:36px;top:26px;width:12px;height:18px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#fff;box-shadow:0 0 0 2.5px #111;animation:z3kd {T} ease-in infinite}}@keyframes z3kd{{0%,10%{{transform:translateY(0);opacity:0}}14%{{opacity:1}}30%,100%{{transform:translateY(30px);opacity:0}}}}
.z3k .cap{{position:absolute;left:12px;top:12px;padding:4px 8px;background:#111;color:#fff;font:800 12px 'M PLUS 1p';letter-spacing:.1em}}
.z3k .p2{{left:-24px;right:-24px;top:270px;height:206px;background:#111;transform:rotate(-5deg);display:grid;place-content:center;text-align:center;animation:z3kp2 {T} cubic-bezier(.2,1.5,.3,1) infinite;z-index:2}}
@keyframes z3kp2{{0%,18%{{transform:rotate(-20deg) scale(2.6);opacity:0}}24%,100%{{transform:rotate(-5deg);opacity:1}}}}
.z3k .p2 .ln{{position:absolute;inset:-60px;background:repeating-linear-gradient(90deg,transparent 0 14px,rgba(255,255,255,.14) 14px 16px,transparent 16px 34px);animation:z3kln .3s linear infinite}}@keyframes z3kln{{to{{transform:translateX(-34px)}}}}
.z3k .p2 b{{position:relative;font:400 76px/.92 'Reggae One';color:#fff;letter-spacing:-.01em;text-shadow:5px 5px 0 #e8202a,-2px -2px 0 #111,2px -2px 0 #111}}
.z3k .p2 span{{position:relative;justify-self:center;margin-top:12px;padding:5px 14px;background:#fff;color:#111;font:800 13px 'M PLUS 1p';letter-spacing:.16em}}
.z3k .p3{{left:12px;right:12px;top:470px;height:300px;background:{TONE};clip-path:polygon(0 12%,100% 0,100% 100%,0 100%);animation:z3kp3 {T} cubic-bezier(.2,1.2,.3,1) infinite}}
@keyframes z3kp3{{0%,36%{{transform:translateY(120%)}}46%,100%{{transform:none}}}}
.z3k .fan{{position:absolute;right:24px;top:70px;display:flex}}
.z3k .kf{{margin-left:-28px;transform-origin:50% 160%;animation:z3kf {T} cubic-bezier(.3,1.5,.4,1) infinite;animation-delay:calc(var(--k) * 70ms)}}
@keyframes z3kf{{0%,44%{{transform:translateY(160px) rotate(0)}}54%,100%{{transform:rotate(calc((var(--k) - 2) * 9deg))}}}}
.z3k .say{{position:absolute;left:16px;bottom:44px;margin:0;padding:10px 16px;background:#fff;box-shadow:0 0 0 3px #111,5px 5px 0 #111;font:800 21px 'M PLUS 1p';color:#111;transform:rotate(-3deg);animation:z3ks {T} cubic-bezier(.2,1.6,.3,1) infinite}}
.z3k .say b{{color:#e8202a}}@keyframes z3ks{{0%,56%{{transform:rotate(-3deg) scale(0)}}62%,100%{{transform:rotate(-3deg)}}}}
.z3k .tk{{position:absolute;left:24px;top:76px;font:400 20px 'Reggae One';color:#111;opacity:.6;animation:z3kt 1s steps(2) infinite}}@keyframes z3kt{{50%{{transform:translate(2px,-2px)}}}}
.z3k .sfx{{position:absolute;right:4px;top:176px;z-index:3;font:400 66px 'Reggae One';color:#e8202a;-webkit-text-stroke:3px #111;paint-order:stroke fill;transform:rotate(12deg);animation:z3kx {T} cubic-bezier(.2,1.8,.3,1) infinite}}
@keyframes z3kx{{0%,24%{{transform:rotate(12deg) scale(0)}}30%{{transform:rotate(12deg) scale(1.25)}}33%,100%{{transform:rotate(12deg)}}}}
.z3k .frm{{position:absolute;inset:0;box-shadow:inset 0 0 0 10px #111;pointer-events:none}}
'''
    return scoped(h, c, 'bg p p1 p2 p3 eyes vein sweat cap ln fan say tk sfx frm', 'k3')

def t4(th):
    royal = [('Ah', 'ドン'), ('Kh', 'ゴゴ'), ('Qh', 'バン'), ('Jh', 'ズドン')]
    pans = ''.join(f'<div class="pn n{k}" style="--k:{k}"><div class="sp"></div>{card(c, 100)}<span class="fx">{s}</span></div>' for k, (c, s) in enumerate(royal))
    fan = ''.join(cardk(c, 60, 'rf', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    splat = ''.join(f'<circle cx="{195 + r * math.cos(math.radians(a)):.0f}" cy="{330 + r * .9 * math.sin(math.radians(a)):.0f}" r="{s}" />' for a, r, s in
                    [(10, 170, 14), (40, 150, 8), (75, 190, 10), (110, 160, 18), (150, 180, 9), (190, 165, 15), (220, 150, 7), (250, 190, 12), (290, 160, 16), (330, 185, 9), (355, 140, 6)])
    gogo = '<span>ゴ</span>' * 6
    h = ('<div class="z4k"><div class="burst"></div>'
         '<div class="half ha"></div><div class="half hb"></div>'
         '<svg class="crack" viewBox="0 0 390 844" aria-hidden="true"><path d="M-10 420 L60 400 L90 432 L150 396 L196 440 L240 404 L300 446 L340 410 L400 430" /></svg>'
         f'<div class="grid">{pans}</div>'
         f'<div class="glare"><div class="tn"></div><div class="eyes">{EYE.format(iris="#e8202a")}<span style="transform:scaleX(-1)">{EYE.format(iris="#e8202a")}</span></div>'
         f'<div class="gg gl">{gogo}</div><div class="gg gr">{gogo}</div><b class="kq">…ありえない。</b></div>'
         '<div class="flash"></div>'
         f'<div class="fin"><div class="sl"></div><svg class="splat" viewBox="0 0 390 844" aria-hidden="true">{splat}</svg>'
         '<div class="ttl"><b>ROYAL</b><b>FLUSH</b></div>'
         f'<div class="fan">{fan}</div><div class="stamp">伝説<small>LEGEND</small></div>'
         '<p class="wn"><b>MEERA</b> · ten to ace of hearts · trophy unlocked</p></div>'
         '<div class="frm"></div></div>')
    T = '7s'
    slam = ''.join(f'{p}%{{transform:translate(-7px,5px)}}{p + .6:.1f}%{{transform:translate(6px,-5px)}}{p + 1.2:.1f}%{{transform:none}}' for p in (17, 22, 27, 32, 59))
    c = f'''
.t3>.arena,.t3>.hero,.t3>.top,.t3>.actions{{animation:z4ksh {T} linear infinite}}
@keyframes z4ksh{{0%,100%{{transform:none}}{slam}}}
.z4k{{position:absolute;inset:0;animation:z4kout {T} ease infinite}}@keyframes z4kout{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4k .burst{{position:absolute;left:50%;top:50%;width:1300px;height:1300px;margin:-650px 0 0 -650px;background:repeating-conic-gradient(#e8202a 0 3deg,#fff 3deg 9deg);animation:z4kb {T} linear infinite}}
@keyframes z4kb{{0%{{transform:rotate(0)}}100%{{transform:rotate(60deg)}}}}
.z4k .half{{position:absolute;left:0;right:0;background:#111;animation:z4kh {T} cubic-bezier(.7,0,.2,1) infinite}}
.z4k .half.ha{{top:0;height:446px;clip-path:polygon(0 0,100% 0,100% 100%,0 96%);--d:-110%}}.z4k .half.hb{{top:396px;bottom:0;--d:110%}}
@keyframes z4kh{{0%{{opacity:0;transform:none}}3%,10%{{opacity:1;transform:none}}16%,100%{{transform:translateY(var(--d))}}}}
.z4k .crack{{position:absolute;inset:0;width:100%;height:100%}}.z4k .crack path{{fill:none;stroke:#fff;stroke-width:4;stroke-dasharray:520;animation:z4kc {T} linear infinite}}
@keyframes z4kc{{0%,4%{{stroke-dashoffset:520;opacity:1}}10%{{stroke-dashoffset:0;opacity:1}}12%,100%{{opacity:0}}}}
.z4k .grid{{position:absolute;left:14px;right:14px;top:84px;height:540px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:12px}}
.z4k .pn{{position:relative;overflow:hidden;background:#fff;box-shadow:0 0 0 4px #111,8px 8px 0 #111;display:grid;place-items:center;opacity:0;animation:z4kp {T} cubic-bezier(.2,1.4,.3,1) infinite;animation-delay:calc(var(--k) * .35s)}}
.z4k .pn:nth-child(1){{transform-origin:0 0}}.z4k .pn:nth-child(2){{transform-origin:100% 0}}.z4k .pn:nth-child(3){{transform-origin:0 100%}}.z4k .pn:nth-child(4){{transform-origin:100% 100%}}
@keyframes z4kp{{0%,16%{{opacity:0;transform:scale(1.8) rotate(-8deg)}}18.5%,38%{{opacity:1;transform:none}}44%,100%{{opacity:0;transform:translate(calc((var(--k) - 1.5) * 160px),calc((var(--k) - 1.5) * -120px)) rotate(calc((var(--k) - 1.5) * 40deg)) scale(.6)}}}}
.z4k .pn .sp{{position:absolute;inset:-40px;background:{BURST};opacity:.18}}
.z4k .pn .cd{{position:relative;transform:rotate(-6deg)}}
.z4k .pn .fx{{position:absolute;right:8px;top:6px;font:400 28px 'Reggae One';color:#e8202a;-webkit-text-stroke:2px #111;paint-order:stroke fill;transform:rotate(10deg)}}
.z4k .glare{{position:absolute;inset:0;opacity:0;animation:z4kg {T} ease infinite}}@keyframes z4kg{{0%,42%{{opacity:0}}46%,58%{{opacity:1}}60%,100%{{opacity:0}}}}
.z4k .glare .tn{{position:absolute;inset:0;background:radial-gradient(circle,#555 1.4px,transparent 1.9px) 0 0/7px 7px,#141414}}
.z4k .glare .eyes{{position:absolute;left:-30px;right:-30px;top:300px;display:flex;justify-content:space-between;animation:z4ke {T} ease-out infinite}}
.z4k .glare .eyes svg{{width:220px;height:110px;display:block;filter:drop-shadow(0 0 18px rgba(232,32,42,.9))}}.z4k .glare .eyes span{{display:block}}
@keyframes z4ke{{0%,44%{{transform:scale(.7)}}58%,100%{{transform:scale(1.12)}}}}
.z4k .gg{{position:absolute;top:70px;display:grid;gap:4px}}.z4k .gg.gl{{left:12px}}.z4k .gg.gr{{right:12px}}
.z4k .gg span{{font:400 40px/1 'Reggae One';color:#fff;-webkit-text-stroke:2px #e8202a;paint-order:stroke fill;animation:z4kgg .24s steps(2) infinite}}.z4k .gg span:nth-child(odd){{animation-delay:-.12s}}
@keyframes z4kgg{{50%{{transform:translate(3px,-2px) rotate(4deg)}}}}
.z4k .kq{{position:absolute;left:0;right:0;top:560px;text-align:center;font:400 30px 'Reggae One';color:#fff}}
.z4k .flash{{animation:z4kfl {T} linear infinite}}@keyframes z4kfl{{0%,57%{{opacity:0}}59%{{opacity:1}}64%,100%{{opacity:0}}}}
.z4k .fin{{position:absolute;inset:0;opacity:0;animation:z4kfi {T} ease infinite}}@keyframes z4kfi{{0%,58%{{opacity:0}}59%,100%{{opacity:1}}}}
.z4k .fin .sl{{position:absolute;inset:0;background:#fff}}.z4k .fin .sl::before{{content:"";position:absolute;left:50%;top:40%;width:1200px;height:1200px;margin:-600px 0 0 -600px;background:{BURST};-webkit-mask:radial-gradient(circle,transparent 0 22%,#000 40%);mask:radial-gradient(circle,transparent 0 22%,#000 40%);animation:z4kb 3s linear infinite}}
.z4k .splat{{position:absolute;inset:0;width:100%;height:100%}}.z4k .splat circle{{fill:#111;transform-box:fill-box;transform-origin:center;animation:z4ksp {T} cubic-bezier(.2,1.6,.3,1) infinite}}
@keyframes z4ksp{{0%,59%{{transform:scale(0)}}63%,100%{{transform:scale(1)}}}}
.z4k .ttl{{position:absolute;left:0;right:0;top:170px;display:grid;justify-items:center;line-height:.86}}
.z4k .ttl b{{font:400 86px 'Reggae One';color:#fff;-webkit-text-stroke:6px #111;paint-order:stroke fill;text-shadow:8px 8px 0 #e8202a;animation:z4kt {T} cubic-bezier(.2,1.6,.3,1) infinite}}
.z4k .ttl b+b{{animation-name:z4kt2;color:#e8202a;text-shadow:8px 8px 0 #111}}
@keyframes z4kt{{0%,60%{{transform:translateX(-140%) skewX(-20deg)}}64%,100%{{transform:none}}}}@keyframes z4kt2{{0%,62%{{transform:translateX(140%) skewX(20deg)}}66%,100%{{transform:none}}}}
.z4k .fan{{position:absolute;left:0;right:0;top:440px;display:flex;justify-content:center}}
.z4k .rf{{margin:0 -10px;transform-origin:50% 180%;box-shadow:0 0 0 2.5px #111,4px 4px 0 #111!important;animation:z4kr {T} cubic-bezier(.3,1.4,.4,1) infinite;animation-delay:calc(var(--k) * 60ms)}}
@keyframes z4kr{{0%,66%{{transform:translateY(300px)}}74%,100%{{transform:rotate(calc((var(--k) - 2) * 11deg))}}}}
.z4k .stamp{{position:absolute;right:26px;top:600px;width:96px;height:96px;display:grid;place-content:center;text-align:center;background:#e8202a;color:#fff;font:400 34px/1 'Reggae One';box-shadow:0 0 0 4px #111,inset 0 0 0 4px #e8202a,inset 0 0 0 6px #fff;transform:rotate(-12deg);animation:z4ks {T} cubic-bezier(.2,1.8,.3,1) infinite}}
.z4k .stamp small{{font:800 11px 'M PLUS 1p';letter-spacing:.2em;margin-top:4px}}@keyframes z4ks{{0%,72%{{transform:rotate(-12deg) scale(3);opacity:0}}75%,100%{{transform:rotate(-12deg);opacity:1}}}}
.z4k .wn{{position:absolute;left:20px;right:130px;top:624px;margin:0;padding:10px 12px;background:#fff;box-shadow:0 0 0 3px #111,5px 5px 0 #111;font:800 13px/1.35 'M PLUS 1p';color:#111;animation:z4kw {T} ease infinite}}.z4k .wn b{{color:#e8202a;font-size:18px}}
@keyframes z4kw{{0%,76%{{opacity:0;transform:translateY(20px)}}80%,100%{{opacity:1;transform:none}}}}
.z4k .frm{{position:absolute;inset:0;box-shadow:inset 0 0 0 10px #111;pointer-events:none}}
'''
    return scoped(h, c, 'burst half ha hb crack grid pn n0 n1 n2 n3 sp fx glare tn eyes gg gl gr kq fin sl splat ttl fan stamp wn frm', 'k4')
