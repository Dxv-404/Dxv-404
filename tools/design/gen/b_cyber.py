"""Cyber: tier 3 (BREACH: glitch, hazard bands, Vex cut-in, the hand name decodes itself, holo cards) and
tier 4 (OVERRIDE: CRT blackout, the city rises, a 3D card carousel, Vex locks on, data rain, ROYAL FLUSH plate)."""
from core import *
from vex import vex

MG, CY, AM = '#ff2e88', '#7df9ff', '#ffd166'
CH = lambda n: f'clip-path:polygon({n}px 0,100% 0,100% calc(100% - {n}px),calc(100% - {n}px) 100%,0 100%,0 {n}px)'

def t3(th):
    bars = ''.join(f'<i style="top:{t}px;height:{hh}px;background:{c};--d:{d}"></i>' for t, hh, c, d in [(120, 14, MG, 0), (260, 6, CY, 1), (330, 22, MG, 2), (470, 8, CY, 0), (560, 18, MG, 1), (700, 5, CY, 2)])
    cards = ''.join(f'<span class="hc" style="--k:{k}">{card(c, 58)}</span>' for k, c in enumerate(['Ks', 'Kh', 'Kd', '7c', '7s']))
    hexes = ''.join(f'<path d="M{x} {y} l13 -7.5 13 7.5 v15 l-13 7.5 -13 -7.5Z"/>' for y in range(0, 700, 45) for x in range(-26 + (y // 45 % 2) * 13, 420, 26))
    h = ('<div class="z3y"><div class="bg"></div>'
         f'<svg class="hex" viewBox="0 0 390 700" aria-hidden="true">{hexes}</svg>'
         f'<div class="bars">{bars}</div>'
         '<div class="haz ht"><span>// ICE BREACH // HAND CLASS 07 // KINGS FULL OF SEVENS // ICE BREACH // HAND CLASS 07 //</span></div>'
         f'<div class="vx"><svg viewBox="40 24 120 140" aria-hidden="true">{vex("big", False)}</svg><span class="tag">VEX // DEALER</span></div>'
         '<div class="say">Kings full. I\'m logging this one.</div>'
         '<div class="ttl"><small>DECRYPTING HAND…</small><b class="dc"></b><b class="dc2"></b></div>'
         f'<div class="row">{cards}</div>'
         '<div class="cr"><span>MEERA</span><b>+2,860 CR</b><i></i></div>'
         '<div class="haz hb"><span>// PAYOUT CONFIRMED // MEERA // PAYOUT CONFIRMED // MEERA // PAYOUT CONFIRMED //</span></div>'
         '<div class="scan"></div></div>')
    T = '4.6s'
    c = f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3ysh {T} steps(1) infinite}}
@keyframes z3ysh{{0%,22%,26%,40%,44%,100%{{transform:none}}23%{{transform:translate(-8px,0)}}24%{{transform:translate(6px,3px)}}25%{{transform:translate(-3px,-2px)}}41%{{transform:translate(5px,-3px)}}42%{{transform:translate(-5px,2px)}}}}
.z3y{{position:absolute;inset:0;overflow:hidden;animation:z3yo {T} steps(1) infinite}}@keyframes z3yo{{0%,93%{{opacity:1}}94%{{opacity:.3}}95%{{opacity:1}}97%,100%{{opacity:0}}}}
.z3y .bg{{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px),radial-gradient(70% 50% at 50% 40%,#2a1435,#0a0510 75%);animation:z3yb {T} ease infinite}}@keyframes z3yb{{0%{{opacity:0}}4%{{opacity:1}}}}
.z3y .hex{{position:absolute;left:0;top:60px;width:100%;height:700px;opacity:0;-webkit-mask:radial-gradient(circle at 50% 50%,#000 0 30%,transparent 62%);mask:radial-gradient(circle at 50% 50%,#000 0 30%,transparent 62%);animation:z3yh {T} ease-out infinite}}
.z3y .hex path{{fill:none;stroke:{MG};stroke-width:1;opacity:.45}}@keyframes z3yh{{0%,40%{{opacity:0;transform:scale(.4)}}46%{{opacity:1}}70%,100%{{opacity:.35;transform:scale(1.2)}}}}
.z3y .bars i{{position:absolute;left:0;right:0;opacity:0;mix-blend-mode:screen;animation:z3ybr {T} steps(1) infinite}}
@keyframes z3ybr{{0%,1%{{opacity:0}}2%{{opacity:.9;transform:translateX(-30px)}}4%{{opacity:0}}6%{{opacity:.7;transform:translateX(40px)}}8%,22%{{opacity:0}}23%{{opacity:.8;transform:translateX(-20px)}}25%,100%{{opacity:0}}}}
.z3y .haz{{position:absolute;left:-10px;right:-10px;height:30px;overflow:hidden;background:repeating-linear-gradient(-45deg,{AM} 0 12px,#120a18 12px 24px);box-shadow:0 0 0 2px #120a18;animation:z3yz {T} cubic-bezier(.2,1,.3,1) infinite}}
.z3y .haz span{{position:absolute;left:0;top:5px;white-space:nowrap;padding:1px 10px;background:#120a18;color:{AM};font:400 13px 'Share Tech Mono';letter-spacing:.14em;animation:z3yt 6s linear infinite}}@keyframes z3yt{{to{{transform:translateX(-50%)}}}}
.z3y .haz.ht{{top:70px;transform:rotate(-3deg);--x:-110%}}.z3y .haz.hb{{top:772px;transform:rotate(2deg);--x:110%}}
@keyframes z3yz{{0%,5%{{translate:var(--x) 0}}11%,100%{{translate:0 0}}}}
.z3y .vx{{position:absolute;left:-4px;top:112px;width:230px;height:270px;background:linear-gradient(160deg,#3a1d48,#1b0f24);{CH(22)};box-shadow:inset 0 0 0 2px {MG};animation:z3yv {T} cubic-bezier(.2,1.2,.3,1) infinite}}.z3y .vx svg{{width:100%;height:100%}}
.z3y .vx .tag{{position:absolute;left:14px;bottom:10px;padding:2px 6px;background:{MG};color:#fff;font:700 10px 'Chakra Petch';letter-spacing:.16em}}
@keyframes z3yv{{0%,12%{{transform:translateX(-110%)}}20%{{transform:translateX(8px)}}22%,100%{{transform:none}}}}
.z3y .say{{position:absolute;left:206px;right:14px;top:200px;padding:10px 12px;background:rgba(12,6,16,.95);box-shadow:inset 0 0 0 1px {CY};{CH(10)};color:#f1e9ff;font:500 13.5px/1.35 'Chakra Petch';animation:z3ys {T} steps(1) infinite}}
@keyframes z3ys{{0%,24%{{opacity:0}}25%{{opacity:1}}26%{{opacity:.3}}27%,100%{{opacity:1}}}}
.z3y .ttl{{position:absolute;left:20px;right:20px;top:400px}}
.z3y .ttl small{{font:400 11px 'Share Tech Mono';letter-spacing:.2em;color:{CY};animation:z3ys {T} steps(1) infinite}}
.z3y .ttl b{{position:absolute;left:0;top:18px;font:700 50px/1 'Chakra Petch';letter-spacing:.04em;white-space:nowrap;color:#fff}}
.z3y .ttl .dc::after{{content:"";animation:z3yd {T} steps(1) infinite}}.z3y .ttl .dc2{{color:{MG};mix-blend-mode:screen;transform:translate(4px,2px);opacity:.8}}.z3y .ttl .dc2::after{{content:"";animation:z3yd {T} steps(1) infinite}}
@keyframes z3yd{{0%,27%{{content:""}}28%{{content:"#$%&*/@!=?"}}30%{{content:"F#%L ?0U$E"}}32%{{content:"FU@L H0#SE"}}34%{{content:"FULL H0US3"}}36%,100%{{content:"FULL HOUSE"}}}}
.z3y .row{{position:absolute;left:0;right:0;top:500px;display:flex;justify-content:center;gap:8px}}
.z3y .hc{{position:relative;display:block;animation:z3yc {T} cubic-bezier(.2,1.3,.3,1) infinite;animation-delay:calc(var(--k) * 80ms)}}
.z3y .hc::after{{content:"";position:absolute;inset:0;background:linear-gradient(transparent 40%,rgba(125,249,255,.65) 50%,transparent 60%) 0 0/100% 300%;mix-blend-mode:screen;animation:z3ysc 1.4s linear infinite}}@keyframes z3ysc{{from{{background-position:0 100%}}to{{background-position:0 -200%}}}}
.z3y .hc .cd{{box-shadow:0 0 0 1.5px {CY},0 0 16px rgba(125,249,255,.55)!important}}
@keyframes z3yc{{0%,44%{{transform:translateX(420px) skewX(-20deg);opacity:0}}52%,100%{{transform:none;opacity:1}}}}
.z3y .cr{{position:absolute;left:20px;right:20px;top:612px;padding:12px 14px 16px;background:rgba(12,6,16,.92);box-shadow:inset 0 0 0 1px rgba(196,160,255,.3);{CH(12)};display:flex;align-items:baseline;justify-content:space-between;animation:z3yr {T} ease infinite}}
.z3y .cr span{{font:700 14px 'Chakra Petch';letter-spacing:.2em;color:#d9cbe9}}.z3y .cr b{{font:400 30px 'Share Tech Mono';color:{MG};text-shadow:0 0 12px rgba(255,46,136,.7)}}
.z3y .cr i{{position:absolute;left:14px;bottom:7px;height:3px;background:linear-gradient(90deg,{MG},{CY});animation:z3yi {T} ease infinite}}@keyframes z3yi{{0%,60%{{width:0}}80%,100%{{width:calc(100% - 28px)}}}}
@keyframes z3yr{{0%,56%{{opacity:0;transform:translateY(16px)}}62%,100%{{opacity:1;transform:none}}}}
.z3y .scan{{position:absolute;left:0;right:0;height:120px;background:linear-gradient(transparent,rgba(255,46,136,.12),transparent);animation:z3ysn 2.3s linear infinite}}@keyframes z3ysn{{from{{top:-120px}}to{{top:844px}}}}
'''
    return scoped(h, c, 'bg hex bars haz ht hb vx tag say ttl dc dc2 row hc cr scan', 'y3')

def t4(th):
    bld = ''
    x = 0
    for k, (w, hh) in enumerate([(34, 150), (26, 220), (40, 120), (30, 260), (22, 180), (44, 300), (28, 160), (36, 230), (24, 140), (40, 200), (30, 270), (36, 170)]):
        win = ''.join(f'<rect x="{x + 4 + (j % 3) * (w - 8) / 3:.0f}" y="{400 - hh + 10 + (j // 3) * 14}" width="4" height="6" fill="{[MG, CY, AM][(j + k) % 3]}" opacity=".7"/>' for j in range(0, min(18, hh // 14 * 3)) if (j * 7 + k) % 4)
        bld += f'<rect x="{x}" y="{400 - hh}" width="{w}" height="{hh}" fill="#1a0f22" stroke="#3a1d48" stroke-width="1"/>{win}'
        x += w - 2
    cards = ''.join(f'<span class="cc" style="--k:{k}">{card(c, 104)}</span>' for k, c in enumerate(['Ah', 'Kh', 'Qh', 'Jh', 'Th']))
    rain = ''.join(f'<span class="rn" style="left:{(k * 31) % 380}px;--d:{(k * .41) % 2:.2f}s;--t:{1.6 + (k % 3) * .5:.1f}s">{"".join("0123456789ABCDEF"[(k * 7 + j * 5) % 16] for j in range(14))}</span>' for k, _ in enumerate(range(13)))
    fan = ''.join(cardk(c, 52, 'rf', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    h = ('<div class="z4y"><div class="bg"></div>'
         f'<svg class="city" viewBox="0 0 390 400" preserveAspectRatio="none" aria-hidden="true">{bld}</svg><div class="floor"></div>'
         '<svg class="rings" viewBox="0 0 390 844" aria-hidden="true"><g class="ga"><circle cx="195" cy="310" r="150" stroke-dasharray="6 10"/></g><g class="gb"><circle cx="195" cy="310" r="176" stroke-dasharray="60 20 4 20" stroke-width="2"/></g></svg>'
         f'<div class="caro">{cards}</div>'
         f'<div class="lock"><svg class="face" viewBox="70 62 60 60" aria-hidden="true">{vex("big", False)}</svg>'
         '<i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><span class="lt">TARGET LOCK // MEERA</span><span class="lb">P(ROYAL) = 0.000154%</span></div>'
         f'<div class="rain">{rain}</div>'
         '<div class="crt"></div><div class="flash"></div>'
         '<div class="fin"><div class="plate"><small>SYSTEM // LEGENDARY HAND</small><b data-t="ROYAL FLUSH">ROYAL FLUSH</b></div>'
         f'<div class="fan">{fan}</div>'
         f'<div class="mini"><svg viewBox="40 24 120 140" aria-hidden="true">{vex("ship", False)}</svg></div><p class="vq">Run it back. Slowly.<br>I want to watch.</p>'
         '<div class="led"><span>LEGENDARY // 1 IN 649,740 // MEERA // TROPHY ACQUIRED // SEASON 3 // LEGENDARY // 1 IN 649,740 // MEERA // TROPHY ACQUIRED // SEASON 3 //</span></div></div></div>')
    T = '7s'
    c = f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4ysh {T} steps(1) infinite}}
@keyframes z4ysh{{0%,57%,62%,100%{{transform:none}}58%{{transform:translate(-9px,4px)}}59%{{transform:translate(8px,-4px)}}60%{{transform:translate(-4px,-2px)}}61%{{transform:translate(3px,2px)}}}}
.z4y{{position:absolute;inset:0;overflow:hidden;animation:z4yo {T} ease infinite}}@keyframes z4yo{{0%,94%{{opacity:1}}100%{{opacity:0}}}}
.z4y .bg{{position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 36%,#3a1d48,#120a18 60%,#07030a);animation:z4yb {T} steps(1) infinite}}@keyframes z4yb{{0%,6%{{opacity:0}}7%,100%{{opacity:1}}}}
.z4y .crt{{position:absolute;inset:0;background:#000;animation:z4yc {T} linear infinite}}.z4y .crt::after{{content:"";position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 20px #fff,0 0 40px {MG};animation:z4yl {T} linear infinite}}
@keyframes z4yc{{0%{{opacity:0}}1%,7%{{opacity:1}}9%,100%{{opacity:0}}}}@keyframes z4yl{{0%,2%{{transform:scaleX(1)}}4%{{transform:scaleX(.02)}}5.5%{{transform:scaleX(1);opacity:1}}7%,100%{{transform:scaleY(400);opacity:0}}}}
.z4y .city{{position:absolute;left:0;bottom:200px;width:100%;height:400px;animation:z4yci {T} cubic-bezier(.2,1,.3,1) infinite}}@keyframes z4yci{{0%,7%{{transform:translateY(420px)}}18%,100%{{transform:none}}}}
.z4y .floor{{position:absolute;left:-50%;right:-50%;bottom:0;height:260px;background:linear-gradient(#120a18,transparent 40%),repeating-linear-gradient(90deg,rgba(255,46,136,.35) 0 1px,transparent 1px 40px),repeating-linear-gradient(0deg,rgba(255,46,136,.35) 0 1px,transparent 1px 30px);transform:perspective(300px) rotateX(58deg);transform-origin:50% 0;animation:z4yf .8s linear infinite}}
@keyframes z4yf{{to{{background-position:0 0,0 0,0 30px}}}}
.z4y .rings{{position:absolute;inset:0;width:100%;height:100%}}.z4y .rings circle{{fill:none;stroke:{MG};opacity:.6}}.z4y .ga{{transform-origin:195px 310px;animation:z4ysp 8s linear infinite}}.z4y .gb{{transform-origin:195px 310px;animation:z4ysp 12s linear infinite reverse}}@keyframes z4ysp{{to{{transform:rotate(360deg)}}}}
.z4y .caro{{position:absolute;left:50%;top:236px;width:0;height:0;transform-style:preserve-3d;perspective:900px;animation:z4yca {T} ease infinite}}
@keyframes z4yca{{0%,14%{{opacity:0;transform:scale(.4)}}22%,44%{{opacity:1;transform:none}}48%,100%{{opacity:0;transform:scale(1.6)}}}}
.z4y .cc{{position:absolute;left:-52px;top:0;transform-style:preserve-3d;animation:z4yro 3s linear infinite;animation-delay:calc(var(--k) * -.6s)}}
.z4y .cc .cd{{box-shadow:0 0 0 1.5px {CY},0 0 26px rgba(125,249,255,.5)!important}}
@keyframes z4yro{{from{{transform:rotateY(0) translateZ(150px)}}to{{transform:rotateY(360deg) translateZ(150px)}}}}
.z4y .lock{{position:absolute;inset:0;opacity:0;animation:z4ylk {T} steps(1) infinite}}@keyframes z4ylk{{0%,44%{{opacity:0}}45%,57%{{opacity:1}}58%,100%{{opacity:0}}}}
.z4y .face{{position:absolute;left:-40px;top:150px;width:470px;height:470px;filter:contrast(1.1);animation:z4yfa {T} ease-out infinite}}@keyframes z4yfa{{0%,45%{{transform:scale(1.15)}}57%,100%{{transform:scale(1)}}}}
.z4y .lock i{{position:absolute;width:56px;height:56px;border:3px solid {CY};animation:z4ybk {T} cubic-bezier(.2,1.4,.3,1) infinite}}
.z4y .lock .b1{{left:var(--p);top:var(--p);border-right:0;border-bottom:0}}.z4y .lock .b2{{right:var(--p);top:var(--p);border-left:0;border-bottom:0}}.z4y .lock .b3{{left:var(--p);bottom:calc(var(--p) + 250px);border-right:0;border-top:0}}.z4y .lock .b4{{right:var(--p);bottom:calc(var(--p) + 250px);border-left:0;border-top:0}}
@keyframes z4ybk{{0%,45%{{--p:10px}}52%,100%{{--p:90px}}}}@property --p{{syntax:'<length>';inherits:true;initial-value:10px}}
.z4y .lt,.z4y .lb{{position:absolute;left:0;right:0;text-align:center;font:400 14px 'Share Tech Mono';letter-spacing:.18em;color:{CY};text-shadow:0 0 10px {CY}}}.z4y .lt{{top:150px}}.z4y .lb{{top:560px;color:{MG};text-shadow:0 0 10px {MG}}}
.z4y .rain{{position:absolute;inset:0;opacity:0;animation:z4yr {T} ease infinite}}@keyframes z4yr{{0%,38%{{opacity:0}}44%,90%{{opacity:.55}}100%{{opacity:0}}}}
.z4y .rn{{position:absolute;top:-300px;writing-mode:vertical-rl;font:400 15px/1 'Share Tech Mono';letter-spacing:.2em;color:{MG};text-shadow:0 0 6px {MG};animation:z4yrn var(--t) linear infinite;animation-delay:calc(var(--d) * -1)}}.z4y .rn:nth-child(3n){{color:{CY};text-shadow:0 0 6px {CY}}}
@keyframes z4yrn{{to{{transform:translateY(1200px)}}}}
.z4y .flash{{background:{MG};mix-blend-mode:screen;animation:z4yfl {T} linear infinite}}@keyframes z4yfl{{0%,56%{{opacity:0}}58%{{opacity:.9}}63%,100%{{opacity:0}}}}
.z4y .fin{{position:absolute;inset:0;opacity:0;animation:z4yfi {T} steps(1) infinite}}@keyframes z4yfi{{0%,57%{{opacity:0}}58%,100%{{opacity:1}}}}
.z4y .plate{{position:absolute;left:14px;right:14px;top:150px;padding:16px 16px 20px;text-align:center;background:linear-gradient(90deg,#c21b6a,{MG} 50%,#c21b6a);{CH(18)};animation:z4ypl {T} cubic-bezier(.2,1.3,.3,1) infinite}}
.z4y .plate small{{font:400 12px 'Share Tech Mono';letter-spacing:.24em;color:#fff;opacity:.85}}
.z4y .plate b{{position:relative;display:block;margin-top:6px;font:700 58px/.95 'Chakra Petch';letter-spacing:.06em;color:#fff}}
.z4y .plate b::before,.z4y .plate b::after{{content:attr(data-t);position:absolute;left:0;right:0;top:0;mix-blend-mode:screen}}.z4y .plate b::before{{color:{CY};animation:z4ygl 1.1s steps(2) infinite}}.z4y .plate b::after{{color:{AM};animation:z4ygl 1.1s steps(2) infinite reverse}}
@keyframes z4ygl{{0%{{transform:translate(-3px,0)}}50%{{transform:translate(3px,1px)}}100%{{transform:translate(-1px,-1px)}}}}
@keyframes z4ypl{{0%,58%{{transform:scaleX(0)}}64%,100%{{transform:none}}}}
.z4y .fan{{position:absolute;left:0;right:0;top:350px;display:flex;justify-content:center;gap:6px}}.z4y .rf{{box-shadow:0 0 0 1.5px {CY},0 0 14px rgba(125,249,255,.6)!important;animation:z4yrf {T} cubic-bezier(.2,1.3,.3,1) infinite;animation-delay:calc(var(--k) * 70ms)}}
@keyframes z4yrf{{0%,64%{{transform:translateY(-40px) scale(1.4);opacity:0}}70%,100%{{transform:none;opacity:1}}}}
.z4y .mini{{position:absolute;left:14px;top:470px;width:150px;height:170px;background:linear-gradient(160deg,#3a1d48,#1b0f24);{CH(16)};box-shadow:inset 0 0 0 2px {MG};animation:z4ymi {T} cubic-bezier(.2,1.2,.3,1) infinite}}.z4y .mini svg{{width:100%;height:100%}}
@keyframes z4ymi{{0%,70%{{transform:translateX(-120%)}}76%,100%{{transform:none}}}}
.z4y .vq{{position:absolute;left:178px;right:14px;top:520px;margin:0;font:500 15px/1.4 'Chakra Petch';color:#f1e9ff;animation:z4yvq {T} steps(1) infinite}}@keyframes z4yvq{{0%,76%{{opacity:0}}77%,100%{{opacity:1}}}}
.z4y .led{{position:absolute;left:0;right:0;top:672px;height:34px;overflow:hidden;background:#07030a;box-shadow:inset 0 1px 0 {MG},inset 0 -1px 0 {MG}}}
.z4y .led span{{position:absolute;top:6px;white-space:nowrap;font:400 18px 'Share Tech Mono';letter-spacing:.16em;color:{AM};text-shadow:0 0 8px {AM};animation:z4yled 7s linear infinite}}@keyframes z4yled{{from{{transform:translateX(0)}}to{{transform:translateX(-50%)}}}}
'''
    return scoped(h, c, 'bg city floor rings ga gb caro cc lock face b1 b2 b3 b4 lt lb rain rn crt fin plate fan rf mini vq led', 'y4')
