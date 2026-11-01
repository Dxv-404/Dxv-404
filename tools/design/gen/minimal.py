from builders import *

# ======================= NOIR =======================
class Noir(Theme):
    key = 'noir'; name = 'Noir'
    hand_title = 'Hand 23'
    deck_note = 'Ivory stock with a hairline gold frame, Cormorant numerals, deep jewel suits. The back is black lacquer with an Art Deco sunburst. Everything moves slowly and never shouts.'
    def chips(self):
        return casino_chip('ch-a', '#141414', '#c8a96a', '#141414', '#c8a96a') + casino_chip('ch-b', '#f4efe6', '#141414', '#f4efe6', '#c8a96a')
    def back_symbol(self):
        rays = ''.join(f'<path d="M25 35 L{25+40*math.cos(math.radians(a)):.1f} {35+40*math.sin(math.radians(a)):.1f}" stroke="#c8a96a" stroke-width=".35" opacity=".55"/>' for a in range(0, 360, 10))
        return (f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="nbc"><rect x="4" y="4" width="42" height="62"/></clipPath><g clip-path="url(#nbc)">{rays}</g>'
                '<rect x="4" y="4" width="42" height="62" fill="none" stroke="#c8a96a" stroke-width=".5"/><rect x="6" y="6" width="38" height="58" fill="none" stroke="#c8a96a" stroke-width=".25"/>'
                '<circle cx="25" cy="35" r="7" fill="#0d0d0e" stroke="#c8a96a" stroke-width=".5"/><text x="25" y="38.2" text-anchor="middle" font-family="Cormorant Garamond" font-style="italic" font-size="9" fill="#c8a96a">T</text></symbol>')
    def faces(self):
        def f(l, word): return (f'<symbol id="f{l}" viewBox="0 0 60 80"><rect x="4" y="4" width="52" height="72" fill="none" stroke="#c8a96a" stroke-width=".8"/>'
                                f'<path d="M30 14 L30 66" stroke="#c8a96a" stroke-width=".4"/><text x="30" y="49" text-anchor="middle" font-family="Cormorant Garamond" font-style="italic" font-weight="500" font-size="34" fill="currentColor">{l}</text>'
                                f'<text x="30" y="70" text-anchor="middle" font-family="Jost" font-size="5" letter-spacing="2" fill="#8c8579">{word}</text></symbol>')
        return f('K', 'ROI') + f('Q', 'REINE') + f('J', 'VALET')
    def avatar(self, p, ctx): return f'<span class="mono{" photo" if p.get("photo") else ""}">{p["i"][0]}{p["i"][1].lower()}</span>'
    def felt_deco(self, kind):
        fan = ''.join(f'<path d="M50 100 L{50+60*math.cos(math.radians(a)):.1f} {100+60*math.sin(math.radians(a)):.1f}" stroke="#c8a96a" stroke-width=".18" opacity=".35"/>' for a in range(200, 341, 10))
        return (f'<div class="deco"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{fan}</svg>'
                '</div>')
    whisper = '<div class="whisper"><small>Riya</small>raises to 120</div>'
    def logo(self, ctx): return '<div class="lg">Train Poker<small>Noir</small></div>'
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<svg class="n1" style="left:{sx-40}px;top:{sy-40}px" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" fill="none" stroke="#c8a96a" stroke-width="1"/></svg><div class="n1p" style="left:{sx}px;top:{sy-58}px">+ 640</div>',
                    '.n1{position:absolute;width:80px;height:80px;transform:rotate(-90deg)}.n1 circle{stroke-dasharray:214;animation:n1 2.6s ease-in-out infinite}@keyframes n1{0%{stroke-dashoffset:214;opacity:1}45%,80%{stroke-dashoffset:0;opacity:1}100%{opacity:0;stroke-dashoffset:0}}'
                    ".n1p{position:absolute;transform:translateX(-50%);font:300 18px 'Jost';letter-spacing:.24em;color:#c8a96a;animation:n1p 2.6s ease infinite}@keyframes n1p{0%,30%{opacity:0;letter-spacing:.6em}55%,82%{opacity:1;letter-spacing:.24em}100%{opacity:0}}")
        if i == 1:
            return ('<div class="n2"><small>Meera</small><b>a Straight</b><i></i></div>',
                    ".n2{position:absolute;left:0;right:0;top:268px;text-align:center;color:#ede6d6;animation:n2 2.8s ease infinite}.n2 small{display:block;font:500 10px 'Jost';letter-spacing:.4em;text-transform:uppercase;color:#c8a96a}.n2 b{display:block;font:italic 500 46px/1.1 'Cormorant Garamond';text-shadow:0 4px 20px #000}"
                    ".n2 i{display:block;height:1px;width:180px;margin:10px auto 0;background:linear-gradient(90deg,transparent,#c8a96a,transparent);animation:n2i 2.8s ease infinite}@keyframes n2{0%{opacity:0;letter-spacing:.3em}25%,78%{opacity:1;letter-spacing:0}100%{opacity:0}}@keyframes n2i{0%,15%{transform:scaleX(0)}40%,100%{transform:scaleX(1)}}")
        if i == 2:
            rays = ''.join(f'<line x1="195" y1="400" x2="{195+600*math.cos(math.radians(a)):.0f}" y2="{400+600*math.sin(math.radians(a)):.0f}"/>' for a in range(0, 360, 8))
            return (f'<div class="n3bg"></div><svg class="n3r" viewBox="0 0 390 844" aria-hidden="true">{rays}</svg><div class="n3"><small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera · 1,480</span></div>',
                    '.n3bg{position:absolute;inset:0;background:#0b0b0c;animation:n3bg 3.4s ease infinite}@keyframes n3bg{0%{opacity:0}10%,88%{opacity:.96}100%{opacity:0}}'
                    '.n3r{position:absolute;inset:0;width:100%;height:100%}.n3r line{stroke:#c8a96a;stroke-width:.6;stroke-dasharray:600;stroke-dashoffset:600;animation:n3r 3.4s cubic-bezier(.3,0,.2,1) infinite;opacity:.5}@keyframes n3r{0%,8%{stroke-dashoffset:600}45%,88%{stroke-dashoffset:0}100%{stroke-dashoffset:0;opacity:0}}'
                    ".n3{position:absolute;left:30px;right:30px;top:330px;padding:28px 0;text-align:center;background:#0b0b0c;box-shadow:0 0 0 1px #c8a96a,0 0 0 6px #0b0b0c,0 0 0 7px rgba(200,169,106,.4);animation:n3 3.4s ease infinite}"
                    ".n3 small{display:block;font:500 9.5px 'Jost';letter-spacing:.36em;text-transform:uppercase;color:#8c8579}.n3 b{display:block;font:italic 500 54px/1.1 'Cormorant Garamond';color:#ede6d6;margin:8px 0}.n3 span{font:500 11px 'Jost';letter-spacing:.3em;text-transform:uppercase;color:#c8a96a}"
                    '@keyframes n3{0%,20%{opacity:0;transform:scale(1.06)}36%,86%{opacity:1;transform:none}100%{opacity:0}}')
        if i == 3:
            bub = ''.join(f'<i style="left:{(k*41)%370+10}px;width:{3+k%4}px;height:{3+k%4}px;animation-delay:{-(k*.37)%4:.2f}s;animation-duration:{3+k%3}s"></i>' for k in range(30))
            return (f'<div class="n4bg"></div><div class="n4b">{bub}</div><div class="n4"><div class="crest"><span>R</span></div><b>Royal Flush</b><small>Meera · the trophy is hers</small></div>',
                    '.n4bg{position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 45%,#1c1710,#0b0b0c 70%);animation:n3bg 5s ease infinite}@keyframes n3bg{0%{opacity:0}10%,88%{opacity:.97}100%{opacity:0}}'
                    '.n4b i{position:absolute;bottom:-10px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(232,212,160,.8);animation:n4b 4s linear infinite}@keyframes n4b{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(-860px) translateX(14px);opacity:0}}'
                    ".n4{position:absolute;left:0;right:0;top:250px;text-align:center;animation:n3 5s ease infinite}@keyframes n3{0%,14%{opacity:0;transform:scale(1.06)}30%,86%{opacity:1;transform:none}100%{opacity:0}}"
                    ".n4 .crest{width:130px;height:130px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px #c8a96a,inset 0 0 0 7px #0b0b0c,inset 0 0 0 8px rgba(200,169,106,.5);position:relative;overflow:hidden}"
                    ".n4 .crest span{font:italic 500 74px/1 'Cormorant Garamond';color:#c8a96a}.n4 .crest::after{content:\"\";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,240,200,.55) 50%,transparent 65%);animation:foil 2.4s ease-in-out infinite}@keyframes foil{from{transform:translateX(-120%)}to{transform:translateX(120%)}}"
                    ".n4 b{display:block;font:italic 500 56px/1 'Cormorant Garamond';color:#ede6d6}.n4 small{display:block;margin-top:14px;font:500 10px 'Jost';letter-spacing:.34em;text-transform:uppercase;color:#c8a96a}")
        bx, by = seat_xy(4)
        return (f'<div class="n5s" style="left:{bx}px;top:{by-20}px"><i></i><i></i><i></i></div><div class="n5"><small>Seat 5</small><b>Arjun leaves the table</b><span>9th of 13 · one rebuy remains</span><div><em>Rebuy</em><em>Watch</em></div></div>',
                ".n5s{position:absolute;width:0;height:0}.n5s i{position:absolute;left:-2px;top:0;width:4px;height:30px;border-radius:50%;background:linear-gradient(transparent,rgba(237,230,214,.35));filter:blur(2px);animation:smoke 3s ease-out infinite}.n5s i:nth-child(2){animation-delay:-1s;left:4px}.n5s i:nth-child(3){animation-delay:-2s;left:-8px}"
                "@keyframes smoke{0%{transform:translateY(0) scaleY(.4);opacity:0}30%{opacity:1}100%{transform:translateY(-50px) translateX(10px) scaleY(1.4) rotate(20deg);opacity:0}}"
                ".n5{position:absolute;left:24px;right:24px;bottom:196px;padding:18px;text-align:center;background:#0b0b0c;box-shadow:inset 0 0 0 1px rgba(200,169,106,.5);animation:n3 3s ease infinite}.n5 small{font:500 9px 'Jost';letter-spacing:.34em;text-transform:uppercase;color:#8c8579}.n5 b{display:block;font:italic 500 26px 'Cormorant Garamond';color:#ede6d6;margin:4px 0}.n5 span{font-size:12px;color:#8c8579}"
                ".n5 div{display:flex;gap:10px;margin-top:12px}.n5 em{flex:1;font:500 11px 'Jost';font-style:normal;letter-spacing:.24em;text-transform:uppercase;padding:10px;box-shadow:inset 0 0 0 1px rgba(237,230,214,.3);color:#ede6d6}.n5 em:first-child{background:#c8a96a;color:#0b0b0c;box-shadow:none}")

# ======================= IVORY =======================
class Ivory(Theme):
    key = 'ivory'; name = 'Ivory'
    deck_note = 'Heavy cream stock that looks pressed rather than printed, DM Serif numerals, ink-and-rust suits. The back is forest green with a cream guilloche rosette and a saddle-tan keyline.'
    def chips(self):
        return casino_chip('ch-a', '#fffdf8', '#1f4a3a', '#fffdf8', '#1f4a3a') + casino_chip('ch-b', '#b88a5d', '#fffdf8', '#b88a5d', '#fffdf8')
    def back_symbol(self):
        ros = ''.join(f'<ellipse cx="25" cy="35" rx="14" ry="5" fill="none" stroke="#fffdf8" stroke-width=".3" opacity=".7" transform="rotate({a} 25 35)"/>' for a in range(0, 180, 12))
        return f'<symbol id="cb" viewBox="0 0 50 70">{ros}<circle cx="25" cy="35" r="3" fill="#b88a5d"/><rect x="7.5" y="7.5" width="35" height="55" rx="3" fill="none" stroke="#fffdf8" stroke-width=".35" opacity=".6"/></symbol>'
    def faces(self):
        def f(l, path): return f'<symbol id="f{l}" viewBox="0 0 60 80"><circle cx="30" cy="36" r="22" fill="none" stroke="currentColor" stroke-width=".7"/>{path}<text x="30" y="76" text-anchor="middle" font-family="DM Serif Display" font-size="9" fill="currentColor">{ {"K":"King","Q":"Queen","J":"Jack"}[l]}</text></symbol>'
        return (f('K', '<path d="M18 40 L20 24 L26 32 L30 20 L34 32 L40 24 L42 40Z" fill="currentColor"/><rect x="18" y="42" width="24" height="3" fill="currentColor"/>')
                + f('Q', '<path d="M30 18 C24 26 20 30 22 38 C24 46 36 46 38 38 C40 30 36 26 30 18Z" fill="currentColor"/><circle cx="30" cy="34" r="3" fill="#fffdf8"/>')
                + f('J', '<path d="M22 46 L38 22 M36 20 L41 25 M24 42 L20 48" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'))
    def avatar(self, p, ctx): return f'<span class="emb h{p["hue"]}{" photo" if p.get("photo") else ""}">{p["i"][0]}</span>'
    whisper = '<div class="whisper"><small>Riya</small>raises to 120</div>'
    def logo(self, ctx):
        return ('<div class="lg"><svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="25" fill="#1f4a3a"/><circle cx="27" cy="27" r="21" fill="none" stroke="#fffdf8" stroke-width=".8" stroke-dasharray="2 2"/>'
                '<text x="27" y="34" text-anchor="middle" font-family="DM Serif Display" font-size="20" fill="#fffdf8">TP</text></svg>Train Poker<small>Ivory edition</small></div>')
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<div class="i1" style="left:{sx}px;top:{sy+8}px">+640</div>',
                    ".i1{position:absolute;transform:translate(-50%,-50%);padding:6px 12px;border-radius:8px;background:#fffdf8;color:#1f4a3a;font:400 20px 'DM Serif Display';box-shadow:0 0 0 1.5px #1f4a3a;animation:i1 2.6s cubic-bezier(.2,1.4,.4,1) infinite}"
                    "@keyframes i1{0%,25%{transform:translate(-50%,-90%) scale(1.6);opacity:0;box-shadow:0 0 0 1.5px #1f4a3a,0 20px 30px rgba(0,0,0,.3)}40%{transform:translate(-50%,-50%) scale(.94);opacity:1;box-shadow:0 0 0 1.5px #1f4a3a,inset 0 2px 4px rgba(0,0,0,.25)}50%,85%{transform:translate(-50%,-50%);opacity:1}100%{opacity:0}}")
        if i == 1:
            return ('<div class="i2"><small>Meera made a</small><b>Straight</b><span>eight to queen · 860</span></div>',
                    ".i2{position:absolute;left:50%;top:256px;width:240px;margin-left:-120px;padding:16px;text-align:center;background:#fffdf8;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.35);transform-origin:50% 0;animation:i2 2.8s cubic-bezier(.2,1.1,.4,1) infinite}"
                    ".i2::before{content:\"\";position:absolute;inset:6px;border:1px solid rgba(31,74,58,.35);border-radius:3px}.i2 small{font:600 9.5px 'DM Sans';letter-spacing:.24em;text-transform:uppercase;color:#6f6a5e}.i2 b{display:block;font:400 38px/1.1 'DM Serif Display';color:#22261f}.i2 span{font:italic 400 13px 'DM Serif Display';color:#1f4a3a}"
                    "@keyframes i2{0%{transform:translateY(-40px) rotate(-4deg);opacity:0}16%{transform:none;opacity:1}82%{transform:none;opacity:1}100%{transform:translateY(20px);opacity:0}}")
        if i == 2:
            return ('<div class="i3bg"></div><div class="i3"><div class="flap"></div><small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera takes 1,480</span><div class="seal">M</div></div>',
                    '.i3bg{position:absolute;inset:0;background:rgba(34,38,31,.6);animation:i3bg 3.4s ease infinite}@keyframes i3bg{0%{opacity:0}10%,88%{opacity:1}100%{opacity:0}}'
                    ".i3{position:absolute;left:36px;right:36px;top:250px;height:250px;padding:70px 20px 0;text-align:center;background:#fffdf8;border-radius:6px;box-shadow:0 30px 60px rgba(0,0,0,.4);perspective:800px;animation:i3 3.4s ease infinite}"
                    ".i3 .flap{position:absolute;left:0;right:0;top:0;height:120px;background:#f3eee4;border-radius:6px 6px 0 0;transform-origin:50% 0;box-shadow:inset 0 -1px 0 rgba(34,38,31,.1);animation:flap 3.4s cubic-bezier(.5,0,.3,1) infinite;z-index:2}"
                    "@keyframes flap{0%,14%{transform:rotateX(0)}34%,100%{transform:rotateX(-178deg);opacity:.0}}"
                    ".i3 small{font:600 10px 'DM Sans';letter-spacing:.28em;text-transform:uppercase;color:#6f6a5e}.i3 b{display:block;font:400 50px/1.1 'DM Serif Display';color:#22261f;margin:6px 0}.i3 span{font:italic 400 15px 'DM Serif Display';color:#1f4a3a}"
                    ".i3 .seal{position:absolute;left:50%;bottom:-26px;width:56px;height:56px;margin-left:-28px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 40% 35%,#c25a40,#8a2f1f);color:#f3d9c9;font:400 26px 'DM Serif Display';box-shadow:0 0 0 4px #a0452e,0 6px 14px rgba(0,0,0,.35);animation:seal 3.4s cubic-bezier(.3,1.6,.5,1) infinite}"
                    "@keyframes seal{0%,40%{transform:scale(2);opacity:0}50%,88%{transform:none;opacity:1}100%{opacity:0}}@keyframes i3{0%,6%{opacity:0;transform:translateY(30px)}16%,88%{opacity:1;transform:none}100%{opacity:0}}")
        if i == 3:
            return ('<div class="i4bg"></div><svg class="i4st" viewBox="0 0 390 844" aria-hidden="true"><rect x="14" y="14" width="362" height="816" rx="20"/></svg><div class="i4"><div class="crest"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="#1f4a3a"/><circle cx="60" cy="60" r="48" fill="none" stroke="#e9cf8f" stroke-width="1.5" stroke-dasharray="3 3"/><text x="60" y="76" text-anchor="middle" font-family="DM Serif Display" font-size="46" fill="#e9cf8f">R</text></svg><i></i></div><small>A once-a-season hand</small><b>Royal Flush</b><span>Meera · added to her player card</span></div>',
                    '.i4bg{position:absolute;inset:0;background:#f3eee4;animation:i3bg 5s ease infinite}@keyframes i3bg{0%{opacity:0}10%,88%{opacity:.97}100%{opacity:0}}'
                    '.i4st{position:absolute;inset:0;width:100%;height:100%}.i4st rect{fill:none;stroke:#b88a5d;stroke-width:1.6;stroke-dasharray:8 6;stroke-dashoffset:2400;animation:st 5s linear infinite}@keyframes st{0%,8%{stroke-dashoffset:2400}60%,100%{stroke-dashoffset:0}}'
                    ".i4{position:absolute;left:0;right:0;top:220px;text-align:center;animation:i3 5s ease infinite}@keyframes i3{0%,10%{opacity:0;transform:translateY(20px)}24%,88%{opacity:1;transform:none}100%{opacity:0}}"
                    ".i4 .crest{position:relative;width:140px;height:140px;margin:0 auto 22px;border-radius:50%;overflow:hidden;box-shadow:0 14px 30px rgba(31,74,58,.35)}.i4 .crest svg{width:100%;height:100%}.i4 .crest i{position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,238,190,.75) 50%,transparent 65%);animation:foil 2.2s ease-in-out infinite}@keyframes foil{from{transform:translateX(-120%)}to{transform:translateX(120%)}}"
                    ".i4 small{font:600 10px 'DM Sans';letter-spacing:.3em;text-transform:uppercase;color:#6f6a5e}.i4 b{display:block;font:400 54px/1.05 'DM Serif Display';color:#22261f;margin:6px 0 8px}.i4 span{font:italic 400 15px 'DM Serif Display';color:#1f4a3a}")
        bx, by = seat_xy(4)
        return ('<div class="i5"><div class="pm">OUT<br><small>HAND 23</small></div><small>A note from the table</small><b>Arjun is out</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy</em><em>Watch</em></div></div>',
                ".i5{position:absolute;left:24px;right:24px;bottom:196px;padding:18px 18px 16px;background:#fffdf8;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.35);animation:i5 3s cubic-bezier(.2,1.2,.4,1) infinite}"
                ".i5 .pm{position:absolute;right:16px;top:-22px;width:62px;height:62px;border-radius:50%;display:grid;place-items:center;text-align:center;font:700 13px/1 'DM Sans';color:#a0452e;box-shadow:inset 0 0 0 2px #a0452e,inset 0 0 0 5px #fffdf8,inset 0 0 0 6px #a0452e;background:#fffdf8;transform:rotate(-14deg);animation:pm 3s cubic-bezier(.3,1.6,.5,1) infinite}.i5 .pm small{font-size:7px;letter-spacing:.1em}"
                "@keyframes pm{0%,30%{transform:rotate(-14deg) scale(1.8);opacity:0}42%,92%{transform:rotate(-14deg);opacity:1}100%{opacity:0}}"
                ".i5>small{font:600 9.5px 'DM Sans';letter-spacing:.24em;text-transform:uppercase;color:#6f6a5e}.i5 b{display:block;font:400 28px 'DM Serif Display';color:#22261f}.i5 span{font:italic 400 14px 'DM Serif Display';color:#6f6a5e}"
                ".i5 div{display:flex;gap:8px;margin-top:12px}.i5 em{flex:1;text-align:center;font:700 13px 'DM Sans';font-style:normal;padding:10px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(34,38,31,.22);color:#22261f}.i5 em:first-child{background:#1f4a3a;color:#fffdf8;box-shadow:none}"
                "@keyframes i5{0%,10%{transform:translateY(40px) rotate(2deg);opacity:0}24%,92%{transform:none;opacity:1}100%{opacity:0}}")

# ======================= GLASS =======================
class Glass(Theme):
    key = 'glass'; name = 'Glass'
    deck_note = 'Bright white cards with soft rounded corners and heavy Manrope numerals that read from across the room. The back is a pale prism gradient. Pure, quiet, and it looks right on any wallpaper.'
    def chips(self):
        return ('<symbol id="ch-a" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.88)"/><circle cx="12" cy="12" r="8" fill="none" stroke="#6366f1" stroke-width="1.6" stroke-dasharray="2.6 2"/><circle cx="12" cy="12" r="5.2" fill="#6366f1"/></symbol>'
                '<symbol id="ch-b" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(255,255,255,.88)"/><circle cx="12" cy="12" r="8" fill="none" stroke="#e11d48" stroke-width="1.6" stroke-dasharray="2.6 2"/><circle cx="12" cy="12" r="5.2" fill="#e11d48"/></symbol>')
    def back_symbol(self):
        return ('<symbol id="cb" viewBox="0 0 50 70"><circle cx="25" cy="35" r="11" fill="rgba(255,255,255,.55)"/><circle cx="25" cy="35" r="11" fill="none" stroke="#fff" stroke-width=".6"/>'
                '<path d="M25 28 L25 42 M18 35 L32 35" stroke="#6366f1" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></symbol>')
    def faces(self):
        def f(l, c): return f'<symbol id="f{l}" viewBox="0 0 60 80"><rect x="6" y="10" width="48" height="60" rx="10" fill="{c}" opacity=".14"/><text x="30" y="58" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="40" fill="currentColor">{l}</text></symbol>'
        return f('K', 'currentColor') + f('Q', 'currentColor') + f('J', 'currentColor')
    def avatar(self, p, ctx): return f'<span class="gav h{p["hue"]}{" photo" if p.get("photo") else ""}">{p["i"]}</span>'
    def bg(self, kind): return '<div class="orbs"><i></i><i></i><i></i></div>'
    whisper = '<div class="whisper">Riya raised to 120</div>'
    def logo(self, ctx): return '<div class="lg"><i></i>Train Poker<small>Glass</small></div>'
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<div class="g1" style="left:{sx}px;top:{sy-10}px"></div><div class="g1" style="left:{sx}px;top:{sy-10}px;animation-delay:.4s"></div><div class="g1p" style="left:{sx}px;top:{sy-62}px">+640</div>',
                    '.g1{position:absolute;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.8);animation:g1 2.4s ease-out infinite}@keyframes g1{0%{transform:scale(.6);opacity:0}20%{opacity:1}100%{transform:scale(2.2);opacity:0}}'
                    ".g1p{position:absolute;transform:translateX(-50%);font:800 20px 'Manrope';color:#fff;animation:g1p 2.4s ease infinite}@keyframes g1p{0%{filter:blur(8px);opacity:0}30%,80%{filter:none;opacity:1}100%{opacity:0;transform:translate(-50%,-14px)}}")
        if i == 1:
            return ('<div class="g2"><b>Straight</b><span>Meera · +860</span></div>',
                    ".g2{position:absolute;left:50%;top:280px;height:64px;padding:0 28px;transform:translateX(-50%);border-radius:32px;display:flex;align-items:center;gap:14px;white-space:nowrap;background:rgba(255,255,255,.18);backdrop-filter:blur(20px);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 1px rgba(255,255,255,.25),0 20px 40px rgba(0,0,0,.35);animation:g2 2.6s cubic-bezier(.3,1.5,.4,1) infinite}"
                    ".g2 b{font:800 26px 'Manrope';letter-spacing:-.03em;color:#fff}.g2 span{font:600 13px 'Manrope';color:rgba(255,255,255,.75)}@keyframes g2{0%{width:64px;opacity:0;transform:translateX(-50%) scale(.6)}18%{opacity:1;transform:translateX(-50%) scale(1)}84%{opacity:1}100%{opacity:0}}")
        if i == 2:
            return ('<div class="g3"><i></i><i></i><i></i></div><div class="g3t"><small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera takes 1,480</span></div>',
                    '.g3{position:absolute;inset:0;background:rgba(10,12,18,.55);backdrop-filter:blur(14px);animation:g3 3.4s ease infinite}.g3 i{position:absolute;border-radius:50%;filter:blur(40px);animation:g3i 3.4s ease-in-out infinite}'
                    '.g3 i:nth-child(1){left:20%;top:30%;width:220px;height:220px;background:#6366f1}.g3 i:nth-child(2){left:40%;top:40%;width:180px;height:180px;background:#ec4899;animation-delay:-.6s}.g3 i:nth-child(3){left:10%;top:46%;width:200px;height:200px;background:#06b6d4;animation-delay:-1.2s}'
                    '@keyframes g3{0%{opacity:0}10%,88%{opacity:1}100%{opacity:0}}@keyframes g3i{0%{transform:scale(.2)}50%{transform:scale(1.3) translate(20px,-30px)}100%{transform:scale(1)}}'
                    ".g3t{position:absolute;left:0;right:0;top:330px;text-align:center;color:#fff;animation:g3t 3.4s cubic-bezier(.3,1.4,.4,1) infinite}.g3t small{font:700 11px 'Manrope';letter-spacing:.24em;text-transform:uppercase;opacity:.7}.g3t b{display:block;font:800 60px/1 'Manrope';letter-spacing:-.05em;margin:10px 0}.g3t span{font:600 15px 'Manrope';opacity:.85}"
                    '@keyframes g3t{0%,14%{opacity:0;transform:scale(.8);filter:blur(10px)}28%,86%{opacity:1;transform:none;filter:none}100%{opacity:0}}')
        if i == 3:
            return ('<div class="g4"><i></i><i></i><i></i></div><svg class="g4p" viewBox="0 0 390 844" aria-hidden="true"><path d="M-20 300 L410 520 M-20 340 L410 560 M-20 380 L410 600"/></svg><div class="g3t" style="top:300px"><small>Legendary</small><b>Royal<br>Flush</b><span>Meera · trophy unlocked</span></div>',
                    '.g4{position:absolute;inset:0;background:#05060a;animation:g3 5s ease infinite}@keyframes g3{0%{opacity:0}10%,88%{opacity:.96}100%{opacity:0}}.g4 i{position:absolute;left:-40%;width:180%;height:120px;filter:blur(30px);opacity:.8;border-radius:50%;animation:aur 6s ease-in-out infinite}'
                    '.g4 i:nth-child(1){top:120px;background:linear-gradient(90deg,#22d3ee,#a855f7,#22c55e)}.g4 i:nth-child(2){top:220px;background:linear-gradient(90deg,#a855f7,#06b6d4,#f472b6);animation-delay:-2s}.g4 i:nth-child(3){top:600px;background:linear-gradient(90deg,#6366f1,#22d3ee);animation-delay:-4s}'
                    '@keyframes aur{0%,100%{transform:translateX(-10%) skewY(-6deg)}50%{transform:translateX(10%) skewY(6deg)}}'
                    '.g4p{position:absolute;inset:0;width:100%;height:100%}.g4p path{stroke:rgba(255,255,255,.35);stroke-width:1;animation:g4p 5s ease infinite}@keyframes g4p{0%,20%{opacity:0}40%,80%{opacity:1}100%{opacity:0}}'
                    ".g3t{position:absolute;left:0;right:0;text-align:center;color:#fff;animation:g3t 5s cubic-bezier(.3,1.4,.4,1) infinite}.g3t small{font:700 11px 'Manrope';letter-spacing:.24em;text-transform:uppercase;opacity:.7}.g3t b{display:block;font:800 66px/.95 'Manrope';letter-spacing:-.05em;margin:12px 0;background:linear-gradient(90deg,#fff,#c7d2fe,#fbcfe8,#fff);-webkit-background-clip:text;background-clip:text;color:transparent}.g3t span{font:600 15px 'Manrope';opacity:.85}"
                    '@keyframes g3t{0%,14%{opacity:0;transform:scale(.8);filter:blur(10px)}28%,86%{opacity:1;transform:none;filter:none}100%{opacity:0}}')
        bx, by = seat_xy(4)
        return (f'<div class="g5x" style="left:{bx}px;top:{by-8}px"></div><div class="g5"><b>Arjun is out</b><span>9th of 13 · 1 rebuy left</span><div><em>Rebuy 1,000</em><em>Watch</em></div></div>',
                '.g5x{position:absolute;width:80px;height:80px;margin:-40px 0 0 -40px;border-radius:50%;backdrop-filter:blur(8px);background:rgba(255,255,255,.04);animation:g5x 3s ease infinite}@keyframes g5x{0%,10%{opacity:0;transform:scale(.6)}30%,92%{opacity:1;transform:none}100%{opacity:0}}'
                ".g5{position:absolute;left:20px;right:20px;bottom:196px;padding:18px;border-radius:24px;background:rgba(255,255,255,.12);backdrop-filter:blur(24px);box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 0 0 1px rgba(255,255,255,.18),0 20px 40px rgba(0,0,0,.3);color:#fff;animation:g5 3s cubic-bezier(.3,1.4,.4,1) infinite}"
                ".g5 b{display:block;font:800 22px 'Manrope'}.g5 span{font:600 13px 'Manrope';opacity:.7}.g5 div{display:flex;gap:8px;margin-top:12px}.g5 em{flex:1;font:700 13.5px 'Manrope';font-style:normal;text-align:center;padding:11px;border-radius:16px;background:rgba(255,255,255,.1)}.g5 em:first-child{background:#fff;color:#0e1118}"
                "@keyframes g5{0%,10%{opacity:0;transform:translateY(30px) scale(.96)}24%,92%{opacity:1;transform:none}100%{opacity:0}}")

THEMES = [Noir(), Ivory(), Glass()]
if __name__ == '__main__':
    for t in THEMES:
        for f in build_all(t, dealer=False): print(f)
