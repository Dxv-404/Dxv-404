"""Pixel: tier 3 (TREASURE GET: encounter flash, the chest drops, shakes, bursts open, coins arc out, Bram cheers, RPG text box)
and tier 4 (LEGENDARY: night sky over the castle, a crown descends in a beam of light, fireworks, coin rain, ROYAL FLUSH, achievement unlocked).
Everything moves in steps, never smooth tweening."""
from core import *

def spr(f, w, h, cls='', style=''):
    return f'<span class="spr {cls}" style="width:{w}px;height:{h}px;background-image:url(img/{f}.png);{style}"></span>'
def letters(word, cls):
    return ''.join(f'<span class="{cls}" style="--k:{k}">{ch if ch != " " else "&nbsp;"}</span>' for k, ch in enumerate(word))
def fw(x, y, col, d, s=1):
    sh = ','.join(f'{round(math.cos(math.radians(a)) * r)}px {round(math.sin(math.radians(a)) * r)}px 0 {col}' for r in (24, 40) for a in range(0, 360, 30 if r == 24 else 20))
    return f'<i class="fw" style="left:{x}px;top:{y}px;--d:{d}s;--s:{s};box-shadow:{sh}"></i>'

PX_CSS = '.spr{display:block;background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated}'

def t3(th):
    coins = ''.join(f'<span class="cn" style="--dx:{dx}px;--dy:{dy}px;--k:{k}">{spr("px-coin" if k % 3 else "px-gem", 36, 36)}</span>' for k, (dx, dy) in enumerate(
        [(-150, -260), (-110, -330), (-60, -300), (0, -360), (60, -310), (120, -340), (150, -250), (-90, -200), (90, -210), (30, -280)]))
    stars = ''.join(f'<i class="st" style="left:{x}px;top:{y}px;--d:{d}s"></i>' for x, y in [(60, 150), (320, 190), (40, 420), (340, 380), (190, 120), (290, 520)] for d in [((x + y) % 7) / 10])
    h = ('<div class="z3p"><div class="enc"></div><div class="bg"></div><div class="rays"></div>'
         f'{stars}<div class="beam"></div>'
         f'<div class="chest">{spr("px-chest", 144, 120, "cc")}{spr("px-chest-open", 144, 156, "co")}</div>'
         f'<div class="coins">{coins}</div>'
         f'<div class="ttl">{letters("FULL HOUSE!", "lt")}</div><p class="sub">KINGS FULL OF SEVENS</p>'
         f'<div class="bram">{spr("px-bram-big", 288, 144, "bs")}</div>'
         '<div class="box pf"><p><span class="tw">MEERA obtained FULL HOUSE!<br>+2860 GOLD</span><i class="cur">▼</i></p></div></div>')
    T = '4.6s'
    c = PX_CSS + f'''
.t2>.arena,.t2>.hero,.t2>.top{{animation:z3psh {T} steps(1) infinite}}
@keyframes z3psh{{0%,22%,30%,34%,38%,100%{{transform:none}}23%{{transform:translate(-4px,0)}}25%{{transform:translate(4px,0)}}27%{{transform:translate(-4px,0)}}29%{{transform:translate(4px,0)}}35%{{transform:translate(0,6px)}}36%{{transform:translate(0,-4px)}}}}
.z3p{{position:absolute;inset:0;overflow:hidden;animation:z3po {T} steps(1) infinite}}@keyframes z3po{{0%,94%{{opacity:1}}95%{{opacity:.5}}97%,100%{{opacity:0}}}}
.z3p .enc{{position:absolute;inset:0;background:#fff;animation:z3pe {T} steps(1) infinite;z-index:5}}@keyframes z3pe{{0%{{opacity:1}}2%{{opacity:0}}3.5%{{opacity:1}}5%{{opacity:0}}6.5%{{opacity:1}}8%,100%{{opacity:0}}}}
.z3p .bg{{position:absolute;inset:0;background:rgba(26,18,32,.88);animation:z3pb {T} steps(1) infinite}}@keyframes z3pb{{0%,7%{{opacity:0}}8%,100%{{opacity:1}}}}
.z3p .rays{{position:absolute;left:50%;top:400px;width:1100px;height:1100px;margin:-550px 0 0 -550px;background:repeating-conic-gradient(rgba(224,168,58,.18) 0 10deg,transparent 10deg 20deg);animation:z3pr 2s steps(8) infinite;opacity:0}}
.z3p .rays{{animation:z3pr 2s steps(8) infinite,z3pro {T} steps(1) infinite}}@keyframes z3pr{{to{{transform:rotate(45deg)}}}}@keyframes z3pro{{0%,33%{{opacity:0}}34%,100%{{opacity:1}}}}
.z3p .st{{position:absolute;width:6px;height:6px;background:#ffe08a;box-shadow:6px 0 0 #ffe08a,-6px 0 0 #ffe08a,0 6px 0 #ffe08a,0 -6px 0 #ffe08a,0 0 0 2px #1a1220;animation:z3pst .8s steps(2) infinite;animation-delay:var(--d)}}@keyframes z3pst{{50%{{transform:scale(.4)}}}}
.z3p .beam{{position:absolute;left:50%;top:0;width:150px;height:470px;margin-left:-75px;background:linear-gradient(90deg,transparent 0 6%,rgba(255,224,138,.25) 6% 18%,rgba(255,224,138,.45) 18% 82%,rgba(255,224,138,.25) 82% 94%,transparent 94%);animation:z3pbm {T} steps(4) infinite;transform-origin:50% 100%}}
@keyframes z3pbm{{0%,34%{{transform:scaleY(0)}}40%,90%{{transform:scaleY(1)}}100%{{transform:scaleY(0)}}}}
.z3p .chest{{position:absolute;left:50%;top:330px;width:144px;height:156px;margin-left:-72px;animation:z3pc {T} steps(1) infinite}}
@keyframes z3pc{{0%,8%{{transform:translateY(-700px)}}12%{{transform:translateY(-300px)}}15%{{transform:translateY(0)}}17%{{transform:translateY(-36px)}}19%{{transform:translateY(0)}}20%{{transform:translateY(-12px)}}21%,23%{{transform:none}}24%{{transform:rotate(-6deg)}}26%{{transform:rotate(6deg)}}28%{{transform:rotate(-6deg)}}30%{{transform:rotate(6deg)}}32%,100%{{transform:none}}}}
.z3p .cc{{position:absolute;left:0;bottom:0;animation:z3pcc {T} steps(1) infinite}}.z3p .co{{position:absolute;left:0;bottom:0;animation:z3pco {T} steps(1) infinite}}
@keyframes z3pcc{{0%,33%{{opacity:1}}34%,100%{{opacity:0}}}}@keyframes z3pco{{0%,33%{{opacity:0}}34%,100%{{opacity:1}}}}
.z3p .coins{{position:absolute;left:50%;top:380px}}
.z3p .cn{{position:absolute;left:-18px;top:0;opacity:0;animation:z3pcn {T} steps(12) infinite;animation-delay:calc(var(--k) * 40ms)}}
@keyframes z3pcn{{0%,34%{{opacity:0;transform:none}}35%{{opacity:1;transform:none}}48%{{transform:translate(calc(var(--dx) * .7),var(--dy))}}62%{{transform:translate(var(--dx),calc(var(--dy) * .45 + 120px));opacity:1}}66%,100%{{opacity:0;transform:translate(var(--dx),calc(var(--dy) * .45 + 120px))}}}}
.z3p .ttl{{position:absolute;left:0;right:0;top:120px;display:flex;justify-content:center}}
.z3p .lt{{display:block;font:700 44px 'Silkscreen';color:#ffe08a;text-shadow:4px 4px 0 #a8481c,8px 8px 0 #1a1220;animation:z3plt {T} steps(1) infinite,z3plb .6s steps(2) infinite;animation-delay:calc(var(--k) * 50ms),calc(var(--k) * 60ms)}}
@keyframes z3plt{{0%,40%{{opacity:0;transform:translateY(-40px)}}41%{{opacity:1;transform:translateY(-12px)}}43%,100%{{opacity:1;transform:none}}}}@keyframes z3plb{{50%{{translate:0 -6px}}}}
.z3p .sub{{position:absolute;left:0;right:0;top:186px;margin:0;text-align:center;font:400 13px 'Silkscreen';letter-spacing:.06em;color:#f6efe0;text-shadow:2px 2px 0 #1a1220;animation:z3psb {T} steps(1) infinite}}@keyframes z3psb{{0%,46%{{opacity:0}}47%,100%{{opacity:1}}}}
.z3p .bram{{position:absolute;left:-6px;top:500px;width:144px;height:144px;overflow:hidden;animation:z3pbr {T} steps(1) infinite}}@keyframes z3pbr{{0%,36%{{transform:translateX(-160px)}}38%{{transform:translateX(-80px)}}40%,100%{{transform:none}}}}
.z3p .bs{{animation:z3pbs .5s steps(1) infinite}}@keyframes z3pbs{{50%{{transform:translateX(-144px)}}}}
.z3p .box{{position:absolute;left:14px;right:14px;top:660px;height:110px;padding:6px;animation:z3pbx {T} steps(1) infinite}}@keyframes z3pbx{{0%,52%{{opacity:0}}53%,100%{{opacity:1}}}}
.z3p .box p{{margin:0;padding:12px 14px;font:400 16px/1.6 'Silkscreen';color:#f6efe0}}
.z3p .tw{{display:block;white-space:normal;height:52px;width:330px;clip-path:inset(0 100% 0 0);max-width:none;animation:z3ptc {T} steps(26) infinite}}@keyframes z3ptc{{0%,53%{{clip-path:inset(0 100% 52% 0)}}63%{{clip-path:inset(0 0 52% 0)}}64%{{clip-path:inset(0 100% 0 0)}}74%,100%{{clip-path:inset(0 0 0 0)}}}}
.z3p .cur{{position:absolute;right:20px;bottom:14px;font:400 12px 'Silkscreen';color:#ffe08a;font-style:normal;animation:z3pcu .6s steps(1) infinite}}@keyframes z3pcu{{50%{{opacity:0}}}}
'''
    return scoped(h, c, 'enc bg rays st beam chest cc co coins cn ttl lt sub bram bs box tw cur', 'p3')

def t4(th):
    rain = ''.join(f'<span class="rn" style="left:{(k * 47) % 370}px;--d:{(k * .23) % 1.4:.2f}s;--t:{1.2 + (k % 4) * .2:.1f}s">{spr("px-coinspin", 30, 30, "sp4")}</span>' for k in range(16))
    fws = fw(70, 150, '#ffe08a', 0) + fw(310, 120, '#ff9a8a', .4) + fw(200, 90, '#9fe6f5', .8) + fw(60, 340, '#9fe6f5', 1.1) + fw(330, 330, '#ffe08a', 1.5)
    fan = ''.join(cardk(c, 54, 'rf', k=k) for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
    h = ('<div class="z4p"><div class="fl"></div>'
         '<div class="sky"></div><div class="beam"></div>'
         f'<div class="crown">{spr("px-crown", 192, 144)}</div>'
         f'<div class="leg">{letters("LEGENDARY", "lg")}</div>'
         f'<div class="fws">{fws}</div><div class="rain">{rain}</div>'
         '<div class="flash"></div>'
         '<div class="fin"><div class="sky2"></div>'
         f'<div class="ttl"><div>{letters("ROYAL", "rl")}</div><div>{letters("FLUSH", "rl")}</div></div>'
         f'<div class="fan">{fan}</div>'
         f'<div class="tro">{spr("px-trophy", 96, 112)}</div>'
         f'<div class="bram">{spr("px-bram-ship", 288, 144, "bs")}</div>'
         '<div class="ach pf"><span class="ic"></span><p><b>ACHIEVEMENT UNLOCKED</b>Royal Flush · Meera</p></div>'
         '<div class="stat pf"><p>LUCK <i></i> MAX</p><p>GOLD <em>+4,120</em></p></div></div></div>')
    T = '7s'
    c = PX_CSS + f'''
.t3>.arena,.t3>.hero,.t3>.top{{animation:z4psh {T} steps(1) infinite}}
@keyframes z4psh{{0%,55%,60%,100%{{transform:none}}56%{{transform:translate(0,8px)}}57%{{transform:translate(0,-6px)}}58%{{transform:translate(0,4px)}}59%{{transform:translate(0,-2px)}}}}
.z4p{{position:absolute;inset:0;overflow:hidden;animation:z4po {T} steps(1) infinite}}@keyframes z4po{{0%,95%{{opacity:1}}96%{{opacity:.5}}98%,100%{{opacity:0}}}}
.z4p .fl{{position:absolute;inset:0;z-index:5;animation:z4pfl {T} steps(1) infinite}}@keyframes z4pfl{{0%{{background:#fff}}1.5%{{background:#1a1220}}3%{{background:#fff}}4.5%{{background:#1a1220}}6%{{background:#fff}}7%,100%{{background:transparent}}}}
.z4p .sky,.z4p .sky2{{position:absolute;inset:0;background:url(img/px-sky.png) 0 0/100% 100%;image-rendering:pixelated}}
.z4p .sky{{animation:z4psk {T} steps(10) infinite}}@keyframes z4psk{{0%,6%{{transform:translateY(844px)}}18%,100%{{transform:none}}}}
.z4p .beam{{position:absolute;left:50%;top:0;width:210px;height:560px;margin-left:-105px;background:linear-gradient(90deg,transparent 0 5%,rgba(255,224,138,.22) 5% 15%,rgba(255,244,194,.5) 15% 85%,rgba(255,224,138,.22) 85% 95%,transparent 95%);animation:z4pbm {T} steps(6) infinite;transform-origin:50% 0}}
@keyframes z4pbm{{0%,16%{{transform:scaleY(0)}}24%,52%{{transform:scaleY(1)}}56%,100%{{transform:scaleY(0)}}}}
.z4p .crown{{position:absolute;left:50%;top:150px;margin-left:-96px;animation:z4pcr {T} steps(1) infinite}}
@keyframes z4pcr{{0%,20%{{transform:translateY(-400px)}}22%{{transform:translateY(-280px)}}24%{{transform:translateY(-180px)}}26%{{transform:translateY(-100px)}}28%{{transform:translateY(-40px)}}30%,34%,38%,42%,46%,50%{{transform:none}}32%,36%,40%,44%,48%{{transform:translateY(-8px)}}52%,100%{{transform:translateY(-900px)}}}}
.z4p .leg{{position:absolute;left:0;right:0;top:340px;display:flex;justify-content:center}}
.z4p .lg{{display:block;font:700 40px 'Silkscreen';text-shadow:4px 4px 0 #1a1220;animation:z4plg {T} steps(1) infinite,z4prb .8s steps(1) infinite;animation-delay:calc(var(--k) * 70ms),calc(var(--k) * -90ms)}}
@keyframes z4plg{{0%,30%{{opacity:0;transform:translateY(-60px)}}31%{{opacity:1;transform:translateY(-20px)}}33%,52%{{opacity:1;transform:none}}53%,100%{{opacity:0}}}}
@keyframes z4prb{{0%{{color:#ff9a8a}}16%{{color:#ffe08a}}33%{{color:#5a9a5a}}50%{{color:#9fe6f5}}66%{{color:#6a8ad8}}83%{{color:#9a5aa8}}}}
.z4p .fws,.z4p .rain{{position:absolute;inset:0;animation:z4pfs {T} steps(1) infinite}}@keyframes z4pfs{{0%,32%{{opacity:0}}33%,100%{{opacity:1}}}}
.z4p .fw{{position:absolute;width:6px;height:6px;background:#fff;animation:z4pfw 1.6s steps(6) infinite;animation-delay:var(--d)}}@keyframes z4pfw{{0%{{transform:scale(.1);opacity:1}}70%{{opacity:1}}100%{{transform:scale(1.5);opacity:0}}}}
.z4p .rn{{position:absolute;top:-40px;animation:z4prn var(--t) steps(14) infinite;animation-delay:calc(var(--d) * -1)}}@keyframes z4prn{{to{{transform:translateY(900px)}}}}
.z4p .sp4{{background-size:400% 100%;animation:z4pspin .5s steps(1) infinite}}@keyframes z4pspin{{0%{{background-position:0 0}}25%{{background-position:33.33% 0}}50%{{background-position:66.66% 0}}75%{{background-position:100% 0}}}}
.z4p .flash{{animation:z4pfa {T} steps(1) infinite}}@keyframes z4pfa{{0%,53%{{opacity:0}}54%{{opacity:1}}55%{{opacity:0}}56%{{opacity:1}}57%,100%{{opacity:0}}}}
.z4p .fin{{position:absolute;inset:0;opacity:0;animation:z4pfi {T} steps(1) infinite}}@keyframes z4pfi{{0%,55%{{opacity:0}}56%,100%{{opacity:1}}}}
.z4p .sky2{{filter:brightness(.7)}}
.z4p .ttl{{position:absolute;left:0;right:0;top:96px;display:grid;justify-items:center;gap:2px}}.z4p .ttl div{{display:flex}}
.z4p .rl{{display:block;font:700 64px/1 'Silkscreen';text-shadow:5px 5px 0 #1a1220,0 -3px 0 #1a1220;animation:z4prb .8s steps(1) infinite,z4prj .5s steps(2) infinite;animation-delay:calc(var(--k) * -110ms),calc(var(--k) * -80ms)}}
@keyframes z4prj{{50%{{translate:0 -6px}}}}
.z4p .fan{{position:absolute;left:0;right:0;top:268px;display:flex;justify-content:center;gap:6px}}
.z4p .rf{{animation:z4prf {T} steps(1) infinite;animation-delay:calc(var(--k) * 90ms)}}@keyframes z4prf{{0%,58%{{transform:translateY(-500px)}}59%{{transform:translateY(-120px)}}60%,100%{{transform:none}}}}
.z4p .tro{{position:absolute;left:50%;top:372px;margin-left:-48px;animation:z4ptr {T} steps(1) infinite,z4pbob 1s steps(2) infinite}}@keyframes z4ptr{{0%,62%{{opacity:0}}63%,100%{{opacity:1}}}}@keyframes z4pbob{{50%{{translate:0 -6px}}}}
.z4p .bram{{position:absolute;right:-6px;top:440px;width:144px;height:144px;overflow:hidden;animation:z4ptr {T} steps(1) infinite}}.z4p .bs{{animation:z4pbs .5s steps(1) infinite}}@keyframes z4pbs{{50%{{transform:translateX(-144px)}}}}
.z4p .ach{{position:absolute;left:14px;right:14px;top:20px;height:64px;padding:6px;display:flex;align-items:center;gap:10px;animation:z4pac {T} steps(1) infinite}}
@keyframes z4pac{{0%,64%{{transform:translateY(-120px)}}65%{{transform:translateY(-60px)}}66%,100%{{transform:none}}}}
.z4p .ach .ic{{width:40px;height:40px;flex:none;background:url(img/px-trophy.png) 0 0/100% 100%;image-rendering:pixelated}}.z4p .ach p{{margin:0;font:400 13px 'Pixelify Sans';color:#f6efe0}}.z4p .ach b{{display:block;font:400 12px 'Silkscreen';color:#ffe08a}}
.z4p .stat{{position:absolute;left:14px;width:220px;top:600px;padding:6px;animation:z4pst {T} steps(1) infinite}}@keyframes z4pst{{0%,68%{{opacity:0}}69%,100%{{opacity:1}}}}
.z4p .stat p{{margin:0;padding:6px 10px;font:400 14px 'Silkscreen';color:#f6efe0;display:flex;align-items:center;gap:8px}}.z4p .stat em{{font-style:normal;color:#ffe08a}}
.z4p .stat i{{display:block;height:12px;flex:1;background:#1a1220;box-shadow:0 0 0 2px #f6efe0;position:relative}}.z4p .stat i::after{{content:"";position:absolute;left:0;top:0;bottom:0;background:repeating-linear-gradient(90deg,#5a9a5a 0 8px,#3f7a4a 8px 10px);animation:z4pbar {T} steps(10) infinite}}
@keyframes z4pbar{{0%,69%{{width:0}}80%,100%{{width:100%}}}}
'''
    return scoped(h, c, 'fl sky sky2 beam crown leg lg fws fw rain rn sp4 fin ttl rl fan rf tro bram bs ach ic stat', 'p4')
