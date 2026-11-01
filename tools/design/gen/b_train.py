"""Night Train: tier 3 (the train pulls into the platform, the doors open on Hoshi, the station sign swings down with the hand's name,
your ticket gets punched) and tier 4 (through the tunnel at full speed, headlight bloom, the whole line map draws itself into the
roundel, then ROYAL FLUSH on the departure board, a spinning golden ticket and fireworks over the city)."""
from core import *
from train import ART, LINES

def t3(th):
    hoshi = ART['hoshi'][3].replace('viewBox="0 0 120 130"', 'viewBox="0 0 120 130" class="hs"')
    tk_cards = ''.join(card(c, 30) for c in ['Ks', 'Kh', 'Kd', '7c', '7s'])
    chad = ''.join(f'<i style="--dx:{dx}px;--dy:{dy}px"></i>' for dx, dy in [(-30, -40), (20, -50), (40, -10), (-40, 10), (10, 30)])
    h = ('<div class="z3r"><div class="bg"></div><div class="tiles"></div><div class="edge"></div>'
         '<div class="car"><div class="roof"></div><i class="w w1"></i><i class="w w2"></i>'
         f'<div class="door">{hoshi}<i class="dl"></i><i class="dr"></i></div><div class="stripe"></div><span class="no">4</span></div>'
         '<div class="spark"><i></i><i></i><i></i><i></i></div>'
         '<div class="say">Well, I never!<br><b>Kings full!</b></div>'
         '<div class="sign"><i class="ch a"></i><i class="ch b"></i><div class="pl"><small>KINGS FULL OF SEVENS</small><b>FULL HOUSE</b><div class="ln"><span>← FLUSH</span><span>FOUR OF A KIND →</span></div></div></div>'
         f'<div class="tk"><div class="hd"><b>ADMIT ONE</b><span>FRIDAY NIGHT TABLE · HAND 23</span></div><div class="cs">{tk_cards}</div>'
         f'<div class="ft"><b>MEERA</b><em>+2,860</em></div><i class="hole"></i><div class="chad">{chad}</div><span class="clk">CLICK!</span></div></div>')
    T = '4.6s'
    c = ART['hoshi_css'] + f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3rsh {T} linear infinite}}
@keyframes z3rsh{{0%,18%,24%,100%{{transform:none}}19%{{transform:translateX(-6px)}}20.5%{{transform:translateX(4px)}}22%{{transform:translateX(-2px)}}}}
.z3r{{position:absolute;inset:0;overflow:hidden;animation:z3ro {T} ease infinite}}@keyframes z3ro{{0%,93%{{opacity:1}}100%{{opacity:0}}}}
.z3r .bg{{position:absolute;inset:0;background:#0b1620;animation:z3rb {T} ease infinite}}@keyframes z3rb{{0%{{opacity:0}}5%{{opacity:1}}}}
.z3r .tiles{{position:absolute;left:0;right:0;top:56px;height:440px;background:linear-gradient(rgba(11,22,32,.0),rgba(11,22,32,.55)),repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 1px,transparent 1px 22px),repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 11px),#cfd9d6;animation:z3rb {T} ease infinite}}
.z3r .edge{{position:absolute;left:0;right:0;top:470px;height:36px;background:repeating-linear-gradient(90deg,#ffd23e 0 18px,#e6b800 18px 20px);box-shadow:0 -4px 0 #6d7c80,0 8px 0 #1d2b33;animation:z3rb {T} ease infinite}}
.z3r .car{{position:absolute;left:-30px;right:-30px;top:120px;height:330px;border-radius:30px 30px 8px 8px;background:linear-gradient(#e2eaec,#9fb0b2 70%,#7d8f91);box-shadow:inset 0 0 0 3px #0b1620,0 18px 30px rgba(0,0,0,.5);animation:z3rc {T} cubic-bezier(.15,.6,.25,1) infinite}}
@keyframes z3rc{{0%,4%{{transform:translateX(900px)}}19%{{transform:translateX(-10px)}}22%,100%{{transform:none}}}}
.z3r .roof{{position:absolute;left:30px;right:30px;top:10px;height:10px;border-radius:5px;background:#6d7c80}}
.z3r .w{{position:absolute;top:44px;width:78px;height:96px;border-radius:10px;background:linear-gradient(160deg,#ffe6a8,#ffb23e);box-shadow:inset 0 0 0 4px #4a5a5e}}.z3r .w1{{left:44px}}.z3r .w2{{right:44px}}
.z3r .door{{position:absolute;left:50%;top:30px;width:150px;height:280px;margin-left:-75px;overflow:hidden;background:radial-gradient(70% 50% at 50% 40%,#ffe6a8,#ffb23e 70%,#c47a1a);box-shadow:inset 0 0 0 4px #4a5a5e}}
.z3r .hs{{position:absolute;left:-5px;top:40px;width:160px;height:174px;animation:z3rh {T} cubic-bezier(.2,1.5,.3,1) infinite}}@keyframes z3rh{{0%,26%{{transform:translateY(40px) scale(.8)}}32%,100%{{transform:none}}}}
.z3r .dl,.z3r .dr{{position:absolute;top:0;bottom:0;width:50%;background:linear-gradient(90deg,#c9d6d8,#93a6a8);box-shadow:inset 0 0 0 3px #4a5a5e;animation:z3rd {T} cubic-bezier(.6,0,.3,1) infinite}}
.z3r .dl{{left:0;--x:-100%}}.z3r .dr{{right:0;--x:100%}}.z3r .dl::after,.z3r .dr::after{{content:"";position:absolute;left:20%;right:20%;top:14%;height:34%;border-radius:6px;background:#2b3a44;box-shadow:inset 0 0 0 3px #4a5a5e}}
@keyframes z3rd{{0%,23%{{transform:none}}30%,100%{{transform:translateX(var(--x))}}}}
.z3r .stripe{{position:absolute;left:0;right:0;top:262px;height:16px;background:#8fc93a;box-shadow:0 4px 0 #2f5d50}}
.z3r .no{{position:absolute;left:52px;top:170px;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#0f2134;color:#ffb23e;font:900 18px 'Zen Kaku Gothic New';box-shadow:0 0 0 3px #ffb23e}}
.z3r .spark{{position:absolute;left:60px;top:450px}}.z3r .spark i{{position:absolute;width:4px;height:4px;background:#ffd890;box-shadow:0 0 6px #ffb23e;animation:z3rsp {T} linear infinite}}
.z3r .spark i:nth-child(2){{left:260px;--dx:30px}}.z3r .spark i:nth-child(3){{left:20px;--dy:-30px}}.z3r .spark i:nth-child(4){{left:240px}}
@keyframes z3rsp{{0%,12%{{opacity:0;transform:none}}14%{{opacity:1}}20%{{opacity:0;transform:translate(calc(-40px + var(--dx,0px)),calc(-24px + var(--dy,0px)))}}100%{{opacity:0}}}}
.z3r .say{{position:absolute;right:14px;top:70px;padding:8px 12px;border-radius:10px;background:#0a0f14;color:#ffb23e;font:700 13px/1.35 'Zen Kaku Gothic New';box-shadow:0 0 0 2px #ffb23e;animation:z3rs {T} cubic-bezier(.2,1.6,.3,1) infinite}}.z3r .say b{{font:900 17px 'Zen Kaku Gothic New';color:#fff}}
@keyframes z3rs{{0%,32%{{transform:scale(0)}}36%,100%{{transform:none}}}}
.z3r .sign{{position:absolute;left:24px;right:24px;top:500px;transform-origin:50% -60px;animation:z3rg {T} cubic-bezier(.3,1.4,.4,1) infinite}}
@keyframes z3rg{{0%,38%{{transform:translateY(-760px)}}44%{{transform:rotate(4deg)}}48%{{transform:rotate(-3deg)}}52%{{transform:rotate(1.5deg)}}56%,100%{{transform:none}}}}
.z3r .ch{{position:absolute;top:-60px;width:3px;height:60px;background:repeating-linear-gradient(#6d7c80 0 4px,#a9bec0 4px 6px)}}.z3r .ch.a{{left:40px}}.z3r .ch.b{{right:40px}}
.z3r .pl{{background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 0 0 3px #2b3a44,0 14px 30px rgba(0,0,0,.5);text-align:center;padding-top:10px}}
.z3r .pl small{{font:900 10px 'Zen Kaku Gothic New';letter-spacing:.2em;color:#2f5d50}}.z3r .pl b{{display:block;font:900 44px/1.1 'Zen Kaku Gothic New';color:#12263a}}
.z3r .pl .ln{{display:flex;justify-content:space-between;margin-top:6px;padding:6px 10px;background:#8fc93a;font:900 11px 'Zen Kaku Gothic New';color:#0d1a12}}
.z3r .tk{{position:absolute;left:44px;right:44px;top:650px;padding:10px 12px;border-radius:8px;background:repeating-linear-gradient(45deg,rgba(47,93,80,.06) 0 2px,transparent 2px 6px),linear-gradient(#eef6e9,#dde9d4);box-shadow:0 10px 20px rgba(0,0,0,.5);color:#1d2b26;animation:z3rt {T} cubic-bezier(.2,1.2,.3,1) infinite}}
@keyframes z3rt{{0%,50%{{transform:translateY(260px) rotate(6deg)}}58%,100%{{transform:rotate(-2deg)}}}}
.z3r .tk .hd{{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dashed rgba(29,43,38,.4);padding-bottom:4px}}.z3r .tk .hd b{{font:900 13px 'Zen Kaku Gothic New';letter-spacing:.14em}}.z3r .tk .hd span{{font:400 13px 'VT323'}}
.z3r .tk .cs{{display:flex;gap:4px;margin:8px 0}}.z3r .tk .ft{{display:flex;justify-content:space-between;align-items:baseline}}.z3r .tk .ft b{{font:900 15px 'Zen Kaku Gothic New'}}.z3r .tk .ft em{{font:400 26px 'VT323';font-style:normal;color:#2f5d50}}
.z3r .hole{{position:absolute;right:26px;top:44px;width:16px;height:16px;border-radius:50%;background:#0b1620;transform:scale(0);animation:z3rho {T} steps(1) infinite}}@keyframes z3rho{{0%,64%{{transform:scale(0)}}65%,100%{{transform:none}}}}
.z3r .chad{{position:absolute;right:34px;top:52px}}.z3r .chad i{{position:absolute;width:6px;height:6px;border-radius:50%;background:#dde9d4;box-shadow:0 0 0 1px rgba(0,0,0,.3);opacity:0;animation:z3rch {T} ease-out infinite}}
@keyframes z3rch{{0%,64%{{opacity:0;transform:none}}65%{{opacity:1}}78%,100%{{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(200deg)}}}}
.z3r .clk{{position:absolute;right:-12px;top:-22px;font:900 16px 'Zen Kaku Gothic New';color:#ff7a3d;transform:rotate(12deg);animation:z3rk {T} cubic-bezier(.2,1.8,.3,1) infinite}}@keyframes z3rk{{0%,64%{{transform:rotate(12deg) scale(0)}}67%,90%{{transform:rotate(12deg)}}100%{{transform:rotate(12deg) scale(0)}}}}
'''
    return scoped(h, c, 'bg tiles edge car roof w w1 w2 door hs dl dr stripe no spark say sign ch a b pl ln tk hd cs ft hole chad clk'.replace(' a b ', ' '), 'r3')

def t4(th):
    rings = ''.join(f'<i style="--k:{k}"></i>' for k in range(8))
    lines = ''.join(f'<path d="{d}" stroke="{c}" style="--k:{k}"/>' for k, (c, d) in enumerate([
        ('#8fc93a', 'M-20 120 L120 120 L170 170 L170 300 L195 330'), ('#ffb23e', 'M410 90 L300 90 L250 140 L250 290 L195 330'),
        ('#1f6fb8', 'M-20 560 L80 560 L140 500 L140 380 L195 330'), ('#c9302c', 'M410 600 L320 600 L260 540 L260 390 L195 330')]))
    stations = ''.join(f'<circle cx="{x}" cy="{y}" r="7"/>' for x, y in [(120, 120), (170, 220), (300, 90), (250, 220), (80, 560), (140, 440), (320, 600), (260, 460)])
    fws = ''.join(f'<span class="fw" style="left:{x}px;top:{y}px;--c:{c};--d:{d}s"></span>' for x, y, c, d in [(70, 140, '#ffb23e', 0), (310, 110, '#8fc93a', .5), (200, 80, '#f07fb4', 1), (330, 250, '#cfe3ff', 1.4), (60, 270, '#ffb23e', 1.8)])
    conf = ''.join(f'<b class="cf" style="left:{(k * 37) % 380}px;background:{["#8fc93a", "#ffb23e", "#1f6fb8", "#c9302c", "#eef6e9"][k % 5]};--d:{(k * .31) % 2.6:.2f}s;--r:{(k * 53) % 360}deg"></b>' for k in range(24))
    flaps = ''.join(f'<span style="--k:{k}">{ch}</span>' for k, ch in enumerate('ROYAL FLUSH'))
    hoshi = ART['hoshi'][4].replace('viewBox="0 0 120 130"', 'viewBox="0 0 120 130" class="hs"')
    fan = ''.join(cardk(c, 50, 'rf', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    h = ('<div class="z4r"><div class="tun"><div class="rg">' + rings + '</div><div class="streak"></div></div>'
         '<div class="bloom"></div>'
         f'<div class="map"><svg viewBox="0 0 390 700" aria-hidden="true"><g class="ls">{lines}</g><g class="st">{stations}</g></svg>'
         '<div class="rd"><i></i><b>ROYAL FLUSH</b></div></div>'
         '<div class="flash"></div>'
         f'<div class="fin"><div class="sky"></div>{fws}<div class="cty"></div>'
         f'<div class="brd"><small>DEPARTING · PLATFORM 4 · LEGENDARY</small><div class="fl">{flaps}</div><em>MEERA · TEN TO ACE OF HEARTS</em></div>'
         '<div class="gt"><div class="gti"><small>GOLDEN TICKET</small><b>MEERA</b><span>SEASON 3 · ROYAL FLUSH · NO. 001</span><i></i></div></div>'
         f'{hoshi}<div class="fan">{fan}</div>{conf}</div></div>')
    T = '7s'
    c = ART['hoshi_css'] + f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4rsh {T} linear infinite}}
@keyframes z4rsh{{0%,100%{{transform:none}}4%,20%{{transform:translate(1px,1px)}}5%,7%,9%,11%,13%,15%,17%,19%{{transform:translate(-1px,-1px)}}6%,8%,10%,12%,14%,16%,18%{{transform:translate(1px,1px)}}21%{{transform:none}}}}
.z4r{{position:absolute;inset:0;overflow:hidden;background:#05080f;animation:z4ro {T} ease infinite}}@keyframes z4ro{{0%{{opacity:0}}3%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4r .tun{{position:absolute;inset:0;animation:z4rtu {T} linear infinite}}@keyframes z4rtu{{0%,24%{{opacity:1}}26%,100%{{opacity:0}}}}
.z4r .rg{{position:absolute;left:50%;top:42%;width:0;height:0}}
.z4r .rg i{{position:absolute;left:-60px;top:-80px;width:120px;height:160px;border-radius:50px 50px 14px 14px;box-shadow:0 0 0 3px #2b3a44,inset 0 0 0 2px #12263a;background:radial-gradient(circle at 20% 70%,#ffb23e 0 3px,transparent 4px),radial-gradient(circle at 80% 70%,#ffb23e 0 3px,transparent 4px);animation:z4rr .7s linear infinite;animation-delay:calc(var(--k) * -87ms)}}
@keyframes z4rr{{from{{transform:scale(.05);opacity:0}}20%{{opacity:1}}to{{transform:scale(6);opacity:1}}}}
.z4r .streak{{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 42%,transparent 0 6deg,rgba(255,216,144,.12) 6deg 7deg);animation:z4rst .3s steps(2) infinite}}@keyframes z4rst{{50%{{transform:rotate(3deg)}}}}
.z4r .bloom{{position:absolute;left:50%;top:42%;width:40px;height:40px;margin:-20px;border-radius:50%;background:#fff;box-shadow:0 0 60px 30px #fff,0 0 160px 80px #ffd890;animation:z4rbl {T} ease-in infinite}}
@keyframes z4rbl{{0%,16%{{transform:scale(0);opacity:0}}24%{{transform:scale(1);opacity:1}}28%{{transform:scale(30);opacity:1}}34%,100%{{transform:scale(30);opacity:0}}}}
.z4r .map{{position:absolute;left:0;right:0;top:70px;height:700px;opacity:0;animation:z4rm {T} ease infinite}}@keyframes z4rm{{0%,27%{{opacity:0}}29%,56%{{opacity:1}}58%,100%{{opacity:0}}}}
.z4r .map svg{{width:100%;height:100%}}.z4r .ls path{{fill:none;stroke-width:12;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:520;stroke-dashoffset:520;animation:z4rl {T} ease-out infinite;animation-delay:calc(var(--k) * 120ms)}}
@keyframes z4rl{{0%,28%{{stroke-dashoffset:520}}42%,100%{{stroke-dashoffset:0}}}}
.z4r .st circle{{fill:#fff;stroke:#0f2134;stroke-width:3;transform-box:fill-box;transform-origin:center;animation:z4rsc {T} cubic-bezier(.2,1.8,.3,1) infinite}}@keyframes z4rsc{{0%,36%{{transform:scale(0)}}40%,100%{{transform:none}}}}
.z4r .rd{{position:absolute;left:50%;top:260px;width:0;height:0;animation:z4rrd {T} cubic-bezier(.2,1.5,.3,1) infinite}}@keyframes z4rrd{{0%,42%{{transform:scale(0) rotate(-90deg)}}48%,100%{{transform:none}}}}
.z4r .rd i{{position:absolute;left:-96px;top:-96px;width:192px;height:192px;border-radius:50%;box-shadow:inset 0 0 0 26px #ffb23e,0 0 40px rgba(255,178,62,.6);background:#0f2134}}
.z4r .rd b{{position:absolute;left:-150px;width:300px;top:-26px;height:52px;display:grid;place-items:center;background:#0f2134;color:#fff;font:900 30px 'Zen Kaku Gothic New';letter-spacing:.08em;box-shadow:inset 0 0 0 4px #ffb23e}}
.z4r .flash{{background:#fff;animation:z4rf {T} linear infinite}}@keyframes z4rf{{0%,55%{{opacity:0}}57%{{opacity:1}}62%,100%{{opacity:0}}}}
.z4r .fin{{position:absolute;inset:0;opacity:0;animation:z4rfi {T} ease infinite}}@keyframes z4rfi{{0%,56%{{opacity:0}}57%,100%{{opacity:1}}}}
.z4r .sky{{position:absolute;inset:0;background:linear-gradient(#050913,#12263a 60%,#1d2a40)}}
.z4r .cty{{position:absolute;left:0;right:0;top:300px;height:140px;background:linear-gradient(transparent 60%,#0b1628),repeating-linear-gradient(90deg,#0b1628 0 30px,transparent 30px 44px,#0d1a2e 44px 72px,transparent 72px 80px);-webkit-mask:linear-gradient(transparent 0 20%,#000 40%);mask:linear-gradient(transparent 0 20%,#000 40%)}}
.z4r .fw{{position:absolute;width:6px;height:6px;border-radius:50%;box-shadow:0 -46px 0 var(--c),32px -32px 0 var(--c),46px 0 0 var(--c),32px 32px 0 var(--c),0 46px 0 var(--c),-32px 32px 0 var(--c),-46px 0 0 var(--c),-32px -32px 0 var(--c);animation:z4rfw 2.2s ease-out infinite;animation-delay:var(--d)}}
@keyframes z4rfw{{0%{{transform:scale(.1);opacity:1}}80%{{opacity:1}}100%{{transform:scale(1.4);opacity:0}}}}
.z4r .brd{{position:absolute;left:14px;right:14px;top:70px;padding:14px 8px;background:#0a0f14;border-radius:10px;box-shadow:0 0 0 3px #2b3a44,0 0 40px rgba(255,178,62,.25);text-align:center;animation:z4rbd {T} cubic-bezier(.2,1.2,.3,1) infinite}}@keyframes z4rbd{{0%,57%{{transform:translateY(-300px)}}62%,100%{{transform:none}}}}
.z4r .brd small{{font:900 10px 'Zen Kaku Gothic New';letter-spacing:.18em;color:#8fc93a}}.z4r .brd em{{display:block;font:400 20px 'VT323';font-style:normal;color:#ffb23e}}
.z4r .fl{{display:flex;justify-content:center;gap:3px;margin:10px 0}}.z4r .fl span{{width:28px;height:44px;border-radius:4px;background:linear-gradient(#1d2a33 50%,#141e25 50%);box-shadow:inset 0 -1px 0 #000;font:900 28px/44px 'Zen Kaku Gothic New';color:#ffb23e;animation:z4rfp {T} steps(1) infinite;animation-delay:calc(var(--k) * 70ms)}}
@keyframes z4rfp{{0%,60%{{color:transparent}}61%{{color:#8fc93a;transform:scaleY(.1)}}62%{{color:transparent;transform:scaleY(.6)}}63%{{color:#ffb23e;transform:scaleY(.2)}}64%,100%{{color:#ffb23e;transform:none}}}}
.z4r .gt{{position:absolute;left:50%;top:276px;width:260px;height:150px;margin-left:-130px;perspective:700px;animation:z4rgt {T} cubic-bezier(.2,1.3,.3,1) infinite}}@keyframes z4rgt{{0%,64%{{transform:scale(0)}}70%,100%{{transform:none}}}}
.z4r .gti{{position:absolute;inset:0;padding:16px;border-radius:12px;overflow:hidden;background:linear-gradient(135deg,#ffe6a8,#ffb23e 45%,#d68a1a 70%,#ffd890);box-shadow:0 0 0 3px #7a4a10,0 0 40px rgba(255,178,62,.7);color:#2a1a05;text-align:center;animation:z4rsp 3s ease-in-out infinite}}
@keyframes z4rsp{{0%,100%{{transform:rotateY(-24deg) rotateX(8deg)}}50%{{transform:rotateY(24deg) rotateX(-6deg)}}}}
.z4r .gti small{{font:900 11px 'Zen Kaku Gothic New';letter-spacing:.3em}}.z4r .gti b{{display:block;font:900 44px/1.1 'Zen Kaku Gothic New'}}.z4r .gti span{{font:400 16px 'VT323'}}
.z4r .gti i{{position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.7) 46%,transparent 60%);animation:z4rsh2 2s ease-in-out infinite}}@keyframes z4rsh2{{from{{transform:translateX(-120%)}}to{{transform:translateX(120%)}}}}
.z4r .hs{{position:absolute;left:95px;top:452px;width:200px;height:218px;animation:z4rhs {T} cubic-bezier(.2,1.4,.3,1) infinite}}@keyframes z4rhs{{0%,70%{{transform:translateY(300px)}}76%,100%{{transform:none}}}}
.z4r .fan{{position:absolute;left:0;right:0;top:676px;display:flex;justify-content:center;gap:6px}}.z4r .rf{{animation:z4rrf {T} cubic-bezier(.2,1.4,.3,1) infinite;animation-delay:calc(var(--k) * 80ms)}}@keyframes z4rrf{{0%,76%{{transform:translateY(200px)}}82%,100%{{transform:none}}}}
.z4r .cf{{position:absolute;top:-20px;width:7px;height:12px;transform:rotate(var(--r));animation:z4rcf 2.8s linear infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4rcf{{to{{transform:translateY(880px) rotate(calc(var(--r) + 720deg))}}}}
'''
    return scoped(h, c, 'tun rg streak bloom map ls st rd fin sky cty fw brd fl gt gti hs cf fan rf', 'r4')
