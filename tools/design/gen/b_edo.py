"""Edo: tier 3 (kabuki reveal: clappers, striped curtain, Kitsune strikes a pose, four nines slam down) and
tier 4 (nine tails under a full moon: torii, waves from both sides, cranes, fireworks, gold rain, ROYAL FLUSH)."""
from core import *
from fox import fox, tail
from edo import WAVE

CRANE = ('<svg viewBox="0 0 80 40" aria-hidden="true"><path d="M40 20 Q20 0 0 6 Q22 12 30 22 Q14 30 4 36 Q30 34 40 24 Q50 34 76 36 Q66 30 50 22 Q58 12 80 6 Q60 0 40 20Z" '
         'fill="#f6eedc" stroke="#1e2a4a" stroke-width="1.4"/><circle cx="40" cy="18" r="2.6" fill="#d2422d"/></svg>')
def petals(n, seed=3):
    out = ''
    for k in range(n):
        x = (k * 37 + seed * 11) % 100; d = (k * 0.73) % 4; t = 3.2 + (k % 4) * .6
        out += f'<span class="petal" style="--x:{x}%;--d:-{d:.2f}s;--t:{t:.1f}s"></span>'
    return out

def t3(th):
    quads = ''.join(cardk(c, 66, 'q', k=k) for k, c in enumerate(['9s', '9h', '9d', '9c']))
    stripes = '<i style="background:#1d1a17"></i><i style="background:#c8642c"></i><i style="background:#2f5a3a"></i>' * 3
    rays = ''.join(f'<path d="M195 330 L{195 + 700 * math.cos(math.radians(a)):.0f} {330 + 700 * math.sin(math.radians(a)):.0f}" />' for a in range(0, 360, 10))
    h = ('<div class="z3e"><div class="bg"></div>'
         f'<svg class="rays" viewBox="0 0 390 844" aria-hidden="true">{rays}</svg><div class="sun"></div>'
         f'<div class="fox"><svg viewBox="20 0 160 210" aria-hidden="true">{fox("big")}</svg>'
         '<svg class="kuma" viewBox="20 0 160 210" aria-hidden="true"><path d="M70 64 Q60 56 52 60 M130 64 Q140 56 148 60 M78 78 Q66 84 58 98 M122 78 Q134 84 142 98"/></svg></div>'
         '<div class="nobori"><b>四枚</b><small>FOUR OF A KIND</small></div>'
         '<div class="mie">見得!</div>'
         f'<div class="row">{quads}</div><div class="hanko">四</div>'
         '<p class="wn"><b>Meera</b>four nines · takes 2,860</p>'
         f'{petals(14)}'
         f'<div class="maku">{stripes}</div>'
         '<div class="clap"><i class="cl"></i><i class="cr2"></i><span>カン!</span></div></div>')
    T = '4.6s'
    c = f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3esh {T} linear infinite}}
@keyframes z3esh{{0%,10%,15%,46%,51%,100%{{transform:none}}11%{{transform:translate(-6px,3px)}}13%{{transform:translate(5px,-3px)}}47%{{transform:translateY(6px)}}49%{{transform:translateY(-4px)}}}}
.z3e{{position:absolute;inset:0;overflow:hidden;animation:z3eo {T} ease infinite}}@keyframes z3eo{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3e .bg{{position:absolute;inset:0;background:radial-gradient(circle at 50% 100%,transparent 0 16%,rgba(239,227,200,.07) 16% 21%,transparent 21% 36%,rgba(239,227,200,.07) 36% 41%,transparent 41% 56%,rgba(239,227,200,.09) 56% 61%,#1a2954 61% 70%,transparent 70%) 0 0/40px 20px,linear-gradient(#141f45,#1e2a4a);animation:z3eb {T} ease infinite}}
@keyframes z3eb{{0%{{opacity:0}}5%{{opacity:1}}}}
.z3e .rays{{position:absolute;inset:0;width:100%;height:100%;opacity:0;animation:z3er {T} ease infinite}}.z3e .rays path{{stroke:#e9c25a;stroke-width:9;opacity:.22}}
@keyframes z3er{{0%,28%{{opacity:0;transform:scale(.6)}}34%,92%{{opacity:1;transform:none}}}}.z3e .rays{{transform-origin:195px 330px}}
.z3e .sun{{position:absolute;left:50%;top:180px;width:300px;height:300px;margin-left:-150px;border-radius:50%;background:radial-gradient(circle at 42% 38%,#e2553b,#d2422d 62%,#b0331f);box-shadow:0 0 60px rgba(210,66,45,.6);animation:z3es {T} cubic-bezier(.2,1.2,.3,1) infinite}}
@keyframes z3es{{0%,24%{{transform:scale(0)}}32%,100%{{transform:none}}}}
.z3e .fox{{position:absolute;left:50%;top:150px;width:300px;height:394px;margin-left:-150px;animation:z3ef {T} cubic-bezier(.2,1.5,.3,1) infinite}}.z3e .fox svg{{position:absolute;inset:0;width:100%;height:100%}}
@keyframes z3ef{{0%,26%{{transform:translateY(80px) scale(.8);opacity:0}}32%{{transform:none;opacity:1}}36%{{transform:scale(1.14) rotate(-3deg)}}39%,100%{{transform:scale(1.08) rotate(-2deg)}}}}
.z3e .kuma path{{fill:none;stroke:#d2422d;stroke-width:3;stroke-linecap:round;stroke-dasharray:40;stroke-dashoffset:40;animation:z3ek {T} ease infinite}}@keyframes z3ek{{0%,34%{{stroke-dashoffset:40}}40%,100%{{stroke-dashoffset:0}}}}
.z3e .nobori{{position:absolute;left:16px;top:70px;width:74px;height:300px;padding-top:16px;display:flex;flex-direction:column;align-items:center;background:#d2422d;box-shadow:inset 0 0 0 3px #d2422d,inset 0 0 0 5px #e9c25a,6px 6px 0 rgba(0,0,0,.35);animation:z3en {T} cubic-bezier(.3,1.3,.4,1) infinite;transform-origin:50% 0}}
.z3e .nobori::before{{content:"";position:absolute;left:-10px;right:-10px;top:-8px;height:8px;border-radius:4px;background:#3a160c}}
.z3e .nobori b{{writing-mode:vertical-rl;font:400 58px/1 'Yuji Syuku';color:#fff6e6}}.z3e .nobori small{{writing-mode:vertical-rl;margin-top:8px;font:800 10px 'Shippori Mincho';letter-spacing:.16em;color:#e9c25a}}
@keyframes z3en{{0%,38%{{transform:scaleY(0)}}46%,100%{{transform:none}}}}
.z3e .mie{{position:absolute;right:18px;top:96px;font:400 54px 'Yuji Syuku';color:#fff6e6;text-shadow:3px 3px 0 #d2422d;transform:rotate(8deg);animation:z3em {T} cubic-bezier(.2,1.8,.3,1) infinite}}
@keyframes z3em{{0%,34%{{transform:rotate(8deg) scale(0)}}38%,100%{{transform:rotate(8deg)}}}}
.z3e .row{{position:absolute;left:0;right:0;top:560px;display:flex;justify-content:center;gap:10px}}
.z3e .q{{animation:z3eq {T} cubic-bezier(.2,1.6,.3,1) infinite;animation-delay:calc(var(--k) * 140ms)}}@keyframes z3eq{{0%,44%{{transform:translateY(-300px) rotate(-30deg);opacity:0}}48%,100%{{transform:none;opacity:1}}}}
.z3e .hanko{{position:absolute;right:18px;top:520px;width:62px;height:62px;border-radius:8px;display:grid;place-items:center;background:#d2422d;color:#fff6e6;font:400 38px 'Yuji Syuku';box-shadow:inset 0 0 0 3px #d2422d,inset 0 0 0 5px #fff6e6,0 4px 10px rgba(0,0,0,.4);animation:z3eh {T} cubic-bezier(.3,1.6,.5,1) infinite}}
@keyframes z3eh{{0%,58%{{transform:scale(2.6) rotate(-24deg);opacity:0}}63%,100%{{transform:rotate(-8deg);opacity:1}}}}
.z3e .wn{{position:absolute;left:24px;right:24px;top:676px;margin:0;padding:10px;text-align:center;background:#f6eedc;color:#1e2a4a;font:800 14px 'Shippori Mincho';box-shadow:0 0 0 1.5px #1e2a4a,0 0 0 4px #f6eedc,0 0 0 5px #c9a23a;animation:z3ew {T} ease infinite}}
.z3e .wn b{{display:block;font:400 30px 'Yuji Syuku';color:#b0331f}}@keyframes z3ew{{0%,62%{{opacity:0;transform:translateY(14px)}}68%,100%{{opacity:1;transform:none}}}}
.z3e .petal{{top:-20px;animation-duration:var(--t);animation-delay:var(--d)}}
.z3e .maku{{position:absolute;inset:0;display:flex;animation:z3emk {T} cubic-bezier(.6,0,.3,1) infinite}}.z3e .maku i{{flex:1;box-shadow:inset -6px 0 10px rgba(0,0,0,.25)}}
@keyframes z3emk{{0%,6%{{transform:translateX(100%)}}12%,16%{{transform:none}}28%,100%{{transform:translateX(-102%)}}}}
.z3e .clap{{position:absolute;left:0;right:0;top:330px;height:60px;animation:z3ec {T} linear infinite}}@keyframes z3ec{{0%,16%{{opacity:1}}20%,100%{{opacity:0}}}}
.z3e .clap i{{position:absolute;top:10px;width:110px;height:34px;border-radius:4px;background:linear-gradient(#c08048,#7a4a2a);box-shadow:inset 0 2px 0 rgba(255,255,255,.3),0 6px 10px rgba(0,0,0,.4)}}
.z3e .clap .cl{{left:50%;margin-left:-112px;animation:z3cl {T} cubic-bezier(.6,0,.4,1) infinite}}.z3e .clap .cr2{{left:50%;margin-left:2px;animation:z3cr {T} cubic-bezier(.6,0,.4,1) infinite}}
@keyframes z3cl{{0%,4%{{transform:translateX(-300px)}}10%,100%{{transform:none}}}}@keyframes z3cr{{0%,4%{{transform:translateX(300px)}}10%,100%{{transform:none}}}}
.z3e .clap span{{position:absolute;left:0;right:0;top:-70px;text-align:center;font:400 46px 'Yuji Syuku';color:#fff6e6;text-shadow:3px 3px 0 #1e2a4a;animation:z3cs {T} cubic-bezier(.2,1.8,.3,1) infinite}}
@keyframes z3cs{{0%,9%{{transform:scale(0)}}12%,100%{{transform:none}}}}
'''
    return scoped(h, c, 'bg rays sun fox kuma nobori mie row q hanko wn maku clap cl cr2', 'e3')

def t4(th):
    tails = ''.join(f'<g class="tl" style="--k:{k}">{tail(a)}</g>' for k, a in enumerate([-80, -60, -40, -20, 0, 20, 40, 60, 80]))
    wisps = ''.join(f'<i style="--a:{a}deg;--k:{k}"></i>' for k, a in enumerate(range(0, 360, 45)))
    cranes = ''.join(f'<span class="cr" style="top:{y}px;--d:{d}s;--s:{s}">{CRANE}</span>' for y, d, s in [(120, 0, 1), (160, .3, .8), (96, .6, .7), (190, .9, .9), (140, 1.2, .6)])
    def fw(x, y, col, d):
        dots = ''.join(f'<i style="--a:{a}deg"></i>' for a in range(0, 360, 20))
        return f'<span class="fw" style="left:{x}px;top:{y}px;--c:{col};--d:{d}s">{dots}</span>'
    fws = fw(80, 140, '#e9c25a', 0) + fw(300, 110, '#ff7a5c', .35) + fw(200, 70, '#fff6e6', .7) + fw(60, 300, '#ff7a5c', 1.05) + fw(320, 280, '#e9c25a', 1.4)
    gold = ''.join(f'<b class="gd" style="left:{(k * 41) % 390}px;--d:{(k * .37) % 3:.2f}s;--r:{(k * 47) % 360}deg"></b>' for k in range(22))
    fan = ''.join(cardk(c, 58, 'rf', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    stars = ''.join(f'<i style="left:{(k * 53) % 390}px;top:{(k * 89) % 420}px;--d:{(k * .29) % 2:.2f}s"></i>' for k in range(26))
    h = ('<div class="z4e"><div class="sky"></div>'
         f'<div class="stars">{stars}</div><div class="moon"></div>'
         '<svg class="torii" viewBox="0 0 200 160" aria-hidden="true"><path d="M6 18 Q100 4 194 18 L194 30 Q100 18 6 30Z" fill="#d2422d" stroke="#1e2a4a" stroke-width="2"/>'
         '<rect x="20" y="40" width="160" height="10" fill="#d2422d" stroke="#1e2a4a" stroke-width="2"/><rect x="40" y="26" width="14" height="134" fill="#d2422d" stroke="#1e2a4a" stroke-width="2"/>'
         '<rect x="146" y="26" width="14" height="134" fill="#d2422d" stroke="#1e2a4a" stroke-width="2"/><rect x="94" y="28" width="12" height="14" fill="#1e2a4a"/></svg>'
         f'<div class="kit"><svg class="nine" viewBox="0 0 200 220" aria-hidden="true">{tails}</svg>'
         f'<svg class="body" viewBox="20 0 160 210" aria-hidden="true">{fox("big")}</svg><div class="wisp">{wisps}</div></div>'
         f'<svg class="wv wl" viewBox="0 0 470 300" preserveAspectRatio="none" aria-hidden="true"><path d="{WAVE}" fill="url(#kfSei)" stroke="#e9c25a" stroke-width="3"/></svg>'
         f'<svg class="wv wr" viewBox="0 0 470 300" preserveAspectRatio="none" aria-hidden="true"><path d="{WAVE}" fill="url(#kfSei)" stroke="#e9c25a" stroke-width="3"/></svg>'
         f'{cranes}<div class="flash"></div>'
         f'<div class="fin"><div class="fsky"></div>{fws}{gold}'
         '<div class="tt"><span>天下一</span><b>ROYAL FLUSH</b><small>ten to ace of cherry blossom</small></div>'
         f'<div class="fan">{fan}</div><div class="hk">伝説</div>'
         '<p class="wn"><b>Meera</b>once in a season · trophy added to her player card</p></div></div>')
    T = '7s'
    c = f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4esh {T} linear infinite}}
@keyframes z4esh{{0%,40%,47%,100%{{transform:none}}41%{{transform:translate(-7px,4px)}}43%{{transform:translate(6px,-5px)}}45%{{transform:translate(-4px,2px)}}}}
.z4e{{position:absolute;inset:0;overflow:hidden;animation:z4eo {T} ease infinite}}@keyframes z4eo{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4e .sky{{position:absolute;inset:0;background:linear-gradient(#070b22,#14204a 55%,#22356b);animation:z4ef {T} ease infinite}}@keyframes z4ef{{0%{{opacity:0}}6%{{opacity:1}}}}
.z4e .stars i{{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff6e6;animation:z4etw 1.6s ease-in-out infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4etw{{50%{{opacity:.2}}}}
.z4e .moon{{position:absolute;left:50%;top:150px;width:250px;height:250px;margin-left:-125px;border-radius:50%;background:radial-gradient(circle at 40% 36%,#fffaf0,#f3e3bd 60%,#e6cf98);box-shadow:0 0 80px rgba(255,240,200,.55),0 0 0 14px rgba(255,240,200,.06);animation:z4em {T} cubic-bezier(.3,0,.2,1) infinite}}
@keyframes z4em{{0%,4%{{transform:translateY(500px)}}22%,100%{{transform:none}}}}
.z4e .torii{{position:absolute;left:50%;top:420px;width:340px;height:272px;margin-left:-170px;animation:z4et {T} cubic-bezier(.3,1.2,.4,1) infinite}}@keyframes z4et{{0%,10%{{transform:translateY(500px)}}26%,100%{{transform:none}}}}
.z4e .kit{{position:absolute;left:50%;top:210px;width:300px;height:330px;margin-left:-150px;animation:z4ek {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z4ek{{0%,18%{{transform:scale(.3);opacity:0}}26%,100%{{transform:none;opacity:1}}}}
.z4e .kit svg{{position:absolute;inset:0;width:100%;height:100%}}.z4e .nine{{overflow:visible;transform:scale(1.35);transform-origin:50% 76%}}
.z4e .tl{{transform-box:view-box;transform-origin:100px 168px;animation:z4etl {T} cubic-bezier(.2,1.6,.3,1) infinite;animation-delay:calc(var(--k) * 90ms)}}
@keyframes z4etl{{0%,24%{{transform:scale(0) rotate(-40deg)}}34%,100%{{transform:none}}}}
.z4e .wisp{{position:absolute;left:50%;top:44%;width:0;height:0;animation:z4ew 4s linear infinite}}@keyframes z4ew{{to{{transform:rotate(360deg)}}}}
.z4e .wisp i{{position:absolute;width:14px;height:20px;margin:-10px 0 0 -7px;border-radius:50% 50% 50% 50%/65% 65% 35% 35%;background:radial-gradient(circle at 50% 70%,#fff,#9fe6f5 50%,rgba(126,211,232,0));transform:rotate(var(--a)) translateY(-150px);filter:drop-shadow(0 0 6px #7ed3e8);animation:z4ewi {T} ease infinite}}
@keyframes z4ewi{{0%,30%{{opacity:0}}38%,100%{{opacity:1}}}}
.z4e .wv{{position:absolute;bottom:-30px;width:110%;height:330px;animation:z4ev {T} cubic-bezier(.5,0,.2,1) infinite}}.z4e .wv.wl{{left:-60%;--x:-100%}}.z4e .wv.wr{{right:-60%;transform:scaleX(-1);--x:100%}}
@keyframes z4ev{{0%,34%{{translate:var(--x) 0}}42%,100%{{translate:0 0}}}}
.z4e .cr{{position:absolute;left:0;width:calc(90px * var(--s));height:calc(45px * var(--s));animation:z4ec {T} linear infinite;animation-delay:var(--d)}}.z4e .cr svg{{width:100%;height:100%}}
@keyframes z4ec{{0%,42%{{transform:translateX(-140px);opacity:0}}44%{{opacity:1}}62%,100%{{transform:translateX(520px) translateY(-80px);opacity:1}}}}
.z4e .flash{{background:#fff6e6;animation:z4efl {T} linear infinite}}@keyframes z4efl{{0%,55%{{opacity:0}}58%{{opacity:1}}64%,100%{{opacity:0}}}}
.z4e .fin{{position:absolute;inset:0;opacity:0;animation:z4efi {T} ease infinite}}@keyframes z4efi{{0%,57%{{opacity:0}}58%,100%{{opacity:1}}}}
.z4e .fsky{{position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 34%,#2c3f7a,#14204a 70%,#0b1230)}}
.z4e .fw{{position:absolute;width:0;height:0}}.z4e .fw i{{position:absolute;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);transform:rotate(var(--a)) translateY(0);animation:z4efw 2.2s cubic-bezier(.1,.7,.3,1) infinite;animation-delay:var(--d)}}
@keyframes z4efw{{0%{{transform:rotate(var(--a)) translateY(0);opacity:1}}70%{{opacity:1}}100%{{transform:rotate(var(--a)) translateY(-70px);opacity:0}}}}
.z4e .gd{{position:absolute;top:-20px;width:8px;height:8px;background:linear-gradient(135deg,#fff3c4,#e9c25a 50%,#a87512);transform:rotate(var(--r));animation:z4egd 3s linear infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4egd{{to{{transform:translateY(880px) rotate(calc(var(--r) + 540deg))}}}}
.z4e .tt{{position:absolute;left:0;right:0;top:200px;text-align:center;animation:z4ett {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z4ett{{0%,58%{{transform:scale(1.6);opacity:0}}64%,100%{{transform:none;opacity:1}}}}
.z4e .tt span{{display:block;font:400 92px/1 'Yuji Syuku';color:#fff6e6;text-shadow:0 0 30px rgba(233,194,90,.7),4px 4px 0 #d2422d}}
.z4e .tt b{{display:inline-block;margin:14px 0 6px;padding:6px 16px;font:800 26px 'Shippori Mincho';letter-spacing:.16em;color:#1e2a4a;background:linear-gradient(#fff3c4,#e9c25a);box-shadow:0 0 0 2px #1e2a4a,0 0 0 5px #e9c25a}}
.z4e .tt small{{display:block;font:700 13px 'Shippori Mincho';letter-spacing:.1em;color:#e9c25a}}
.z4e .fan{{position:absolute;left:0;right:0;top:470px;display:flex;justify-content:center}}
.z4e .rf{{margin:0 -8px;transform-origin:50% 170%;animation:z4erf {T} cubic-bezier(.3,1.4,.4,1) infinite;animation-delay:calc(var(--k) * 70ms)}}@keyframes z4erf{{0%,64%{{transform:translateY(300px)}}72%,100%{{transform:rotate(calc((var(--k) - 2) * 10deg))}}}}
.z4e .hk{{position:absolute;right:20px;top:590px;width:70px;height:70px;border-radius:8px;display:grid;place-items:center;background:#d2422d;color:#fff6e6;font:400 26px/1 'Yuji Syuku';box-shadow:inset 0 0 0 3px #d2422d,inset 0 0 0 5px #fff6e6;animation:z4ehk {T} cubic-bezier(.3,1.6,.5,1) infinite}}
@keyframes z4ehk{{0%,74%{{transform:scale(2.6) rotate(-24deg);opacity:0}}78%,100%{{transform:rotate(-8deg);opacity:1}}}}
.z4e .wn{{position:absolute;left:24px;right:110px;top:600px;margin:0;color:#efe3c8;font:700 13px/1.4 'Shippori Mincho';animation:z4ewn {T} ease infinite}}.z4e .wn b{{display:block;font:400 32px 'Yuji Syuku';color:#e9c25a}}
@keyframes z4ewn{{0%,76%{{opacity:0}}82%,100%{{opacity:1}}}}
'''
    return scoped(h, c, 'sky stars moon torii kit nine body tl wisp wv wl wr cr fin fsky fw gd tt fan rf hk wn', 'e4')
