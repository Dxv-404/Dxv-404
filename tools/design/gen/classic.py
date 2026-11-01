from builders import *

class Classic(Theme):
    key = 'classic'; name = 'Classic'; dealer_name = 'Marco'
    bubble = 'Riya raises to 120. Over to you, Dev.'
    deck_note = 'The deck the app uses today: ivory stock, Fraunces numerals, oxblood back with a brass lattice. Only the layout changed: rank top-left and a big suit bottom-right on small cards, a proper corner index and centre pip on big ones.'
    def chips(self):
        return casino_chip('ch-a', '#efe6d0', '#8a2f27', '#efe6d0', '#8a2f27') + casino_chip('ch-b', '#a83c32', '#f6f0e1', '#a83c32', '#f6f0e1')
    def back_symbol(self):
        lat = ''.join(f'<path d="M{x} 0 L{x+70} 70 M{x} 0 L{x-70} 70" stroke="rgba(236,211,155,.38)" stroke-width="1.1"/>' for x in range(-70, 121, 8))
        return f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="cbc"><rect x="4" y="4" width="42" height="62" rx="2.5"/></clipPath><g clip-path="url(#cbc)">{lat}</g><rect x="4" y="4" width="42" height="62" rx="2.5" fill="none" stroke="#c9a15b" stroke-width=".8"/></symbol>'
    def faces(self):
        # engraved court monograms
        def f(l, mark): return f'<symbol id="f{l}" viewBox="0 0 60 80"><ellipse cx="30" cy="40" rx="24" ry="32" fill="none" stroke="currentColor" stroke-width="1.4"/><ellipse cx="30" cy="40" rx="20" ry="28" fill="none" stroke="currentColor" stroke-width=".6"/>{mark}</symbol>'
        crown = '<path d="M16 30 L20 16 L26 26 L30 12 L34 26 L40 16 L44 30Z" fill="currentColor"/><rect x="16" y="32" width="28" height="4" fill="currentColor"/><text x="30" y="62" text-anchor="middle" font-family="Fraunces" font-style="italic" font-weight="600" font-size="22" fill="currentColor">Rex</text>'
        rose = '<circle cx="30" cy="28" r="7" fill="currentColor"/><path d="M30 35 L30 50 M30 42 Q22 38 20 44 M30 46 Q38 42 40 48" stroke="currentColor" stroke-width="2" fill="none"/><text x="30" y="66" text-anchor="middle" font-family="Fraunces" font-style="italic" font-weight="600" font-size="18" fill="currentColor">Regina</text>'
        sword = '<path d="M30 10 L33 14 L33 44 L27 44 L27 14Z" fill="currentColor"/><rect x="21" y="44" width="18" height="3" fill="currentColor"/><rect x="28.5" y="47" width="3" height="8" fill="currentColor"/><text x="30" y="68" text-anchor="middle" font-family="Fraunces" font-style="italic" font-weight="600" font-size="16" fill="currentColor">Valet</text>'
        return f('K', crown) + f('Q', rose) + f('J', sword)
    def avatar(self, p, ctx):
        return f'<span class="ini h{p["hue"]}{" photo" if p.get("photo") else ""}">{p["i"]}</span>'
    def dealer(self, pose='idle', ctx='phone'):
        return '<span class="dv dvw"><img src="img/marco.webp" alt=""></span>'
    def felt_deco(self, kind): return '<div class="deco"><div class="mark">Train Poker</div></div>'
    def logo(self, ctx): return '<div class="lg">Train Poker<small>Hold\'em for the ride</small></div>'
    def bg(self, kind):
        return '' if kind != 'loading' else '<div style="position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 38%,rgba(236,211,155,.12),transparent 70%)"></div>'
    def tier(self, i):
        sx, sy = seat_xy(3); px, py = POT_XY
        if i == 0:
            fly = ''.join(f'<svg class="chip c1fly" viewBox="0 0 24 24" style="left:{px-10}px;top:{py-10}px;--dx:{sx-px}px;--dy:{sy-py}px;animation-delay:{k*.08}s"><use href="#ch-{"ab"[k%2]}"/></svg>' for k in range(4))
            return (f'<div class="c1ring" style="left:{sx}px;top:{sy}px"></div>{fly}<div class="c1plus" style="left:{sx}px;top:{sy-40}px">+640</div>',
                    '.c1fly{position:absolute;width:20px;height:20px;animation:c1f 2.6s cubic-bezier(.5,0,.3,1) infinite}@keyframes c1f{0%,10%{transform:none;opacity:1}55%{transform:translate(var(--dx),var(--dy));opacity:1}62%,100%{transform:translate(var(--dx),var(--dy));opacity:0}}'
                    '.c1ring{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;box-shadow:0 0 0 2px #ecd39b,0 0 30px rgba(236,211,155,.8);animation:c1r 2.6s ease-out infinite}@keyframes c1r{0%,50%{opacity:0;transform:scale(.6)}62%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}'
                    ".c1plus{position:absolute;transform:translateX(-50%);font:600 22px 'Fraunces';color:#ecd39b;text-shadow:0 2px 6px #000;animation:c1p 2.6s ease-out infinite}@keyframes c1p{0%,55%{opacity:0;transform:translate(-50%,10px)}65%,85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-16px)}}")
        if i == 1:
            return ('<div class="c2plq"><small>Meera wins 860</small><b>Straight</b><span>8 · 9 · 10 · J · Q</span></div>',
                    ".c2plq{position:absolute;left:50%;top:250px;width:250px;margin-left:-125px;padding:12px 10px 10px;text-align:center;border-radius:10px;background:linear-gradient(180deg,#f3dda6,#c9a15b 55%,#9c7a3c);box-shadow:inset 0 1px 0 #fff6d8,inset 0 0 0 2px #8a6a33,inset 0 0 0 4px #e8cc8a,0 10px 24px rgba(0,0,0,.6);color:#3a2610;animation:c2 2.4s cubic-bezier(.2,1.2,.4,1) infinite}"
                    ".c2plq small{display:block;font:700 10px 'Figtree';letter-spacing:.2em;text-transform:uppercase;opacity:.75}.c2plq b{display:block;font:italic 600 34px/1.1 'Fraunces';text-shadow:0 1px 0 rgba(255,240,200,.8)}.c2plq span{font:600 13px 'Fraunces';letter-spacing:.1em}"
                    "@keyframes c2{0%{transform:translateY(-30px) scaleY(.2);opacity:0}14%{transform:none;opacity:1}82%{transform:none;opacity:1}100%{transform:translateY(-10px);opacity:0}}")
        if i == 2:
            fold = 'repeating-linear-gradient(90deg,#5a1912 0 6px,#8a2f27 14px,#a83c32 18px,#6e211b 26px)'
            return (f'<div class="c3cur l"></div><div class="c3cur r"></div><div class="c3in"><img src="img/marco.webp" alt="" class="c3m"><small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera takes 1,480</span></div><p class="c3skip">Tap to skip</p>',
                    f".c3cur{{position:absolute;top:0;bottom:0;width:52%;background:{fold};box-shadow:inset 0 -30px 60px rgba(0,0,0,.6);animation:c3c 3.4s cubic-bezier(.5,0,.2,1) infinite}}.c3cur.l{{left:0;transform-origin:0 0;--x:-100%}}.c3cur.r{{right:0;--x:100%}}"
                    "@keyframes c3c{0%{transform:translateX(var(--x))}16%,84%{transform:none}100%{transform:translateX(var(--x))}}"
                    ".c3in{position:absolute;left:0;right:0;top:250px;text-align:center;color:#ecd39b;animation:c3i 3.4s ease-out infinite}.c3in b{display:block;font:italic 600 58px/1 'Fraunces';text-shadow:0 3px 0 #3a1410,0 0 30px rgba(236,211,155,.5)}.c3in small{display:block;font:600 11px 'Figtree';letter-spacing:.24em;text-transform:uppercase;margin:16px 0 8px;color:#f3ead7}.c3in span{display:block;margin-top:14px;font:600 16px 'Fraunces';color:#f3ead7}"
                    ".c3m{width:110px;height:110px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px #ecd39b,0 0 0 6px #6e211b,0 0 0 8px #c9a15b,0 14px 30px rgba(0,0,0,.6)}"
                    "@keyframes c3i{0%,16%{opacity:0;transform:scale(.9)}26%,82%{opacity:1;transform:none}92%,100%{opacity:0}}.c3skip{position:absolute;bottom:200px;left:0;right:0;text-align:center;font-size:12px;color:#b9a88b}")
        if i == 3:
            conf = ''.join(f'<i style="left:{(k*37)%380}px;animation-delay:{-(k*0.23)%3:.2f}s;--r:{(k*53)%360}deg;background:{["#ecd39b","#c9a15b","#fff6d8","#a83c32"][k%4]}"></i>' for k in range(36))
            cards = ''.join(card(c, 56).replace('class="cd', f'style="--k:{k}" class="cd') for k, c in enumerate(['Th', 'Jh', 'Qh', 'Kh', 'Ah']))
            return (f'<div class="c4dark"></div><div class="c4spot"></div><div class="c4conf">{conf}</div><div class="c4fan">{cards}</div>'
                    '<div class="c4plq"><svg viewBox="0 0 240 40" aria-hidden="true"><path d="M20 30 Q8 20 14 6 M28 32 Q14 24 18 10 M220 30 Q232 20 226 6 M212 32 Q226 24 222 10" stroke="#ecd39b" stroke-width="2" fill="none"/></svg><b>Royal Flush</b><span>Meera · trophy added to her player card</span></div>',
                    '.c4dark{position:absolute;inset:0;background:radial-gradient(60% 40% at 50% 42%,rgba(0,0,0,.2),rgba(10,6,4,.92));animation:c4d 5s ease infinite}@keyframes c4d{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}'
                    '.c4spot{position:absolute;left:50%;top:-140px;width:700px;height:1100px;margin-left:-350px;background:conic-gradient(from 168deg at 50% 0,transparent 0 12deg,rgba(255,240,200,.22) 12deg 24deg,transparent 24deg);transform-origin:50% 0;animation:c4s 5s ease-in-out infinite}@keyframes c4s{0%,100%{transform:rotate(-18deg);opacity:0}15%{opacity:1}50%{transform:rotate(18deg)}85%{opacity:1}}'
                    '.c4conf i{position:absolute;top:-20px;width:7px;height:12px;border-radius:1px;animation:c4c 3s linear infinite;transform:rotate(var(--r))}@keyframes c4c{to{transform:translateY(900px) rotate(calc(var(--r) + 540deg))}}'
                    '.c4fan{position:absolute;left:50%;top:190px;width:0;height:0}.c4fan .cd{position:absolute;left:-28px;top:0;transform-origin:50% 140%;animation:c4f 5s cubic-bezier(.2,1.3,.4,1) infinite;box-shadow:var(--winsh)}@keyframes c4f{0%,10%{transform:rotate(0) translateY(40px);opacity:0}24%,90%{transform:rotate(calc((var(--k) - 2) * 14deg));opacity:1}100%{opacity:0}}'
                    ".c4plq{position:absolute;left:30px;right:30px;top:420px;text-align:center;color:#ecd39b;animation:c3i 5s ease-out infinite}.c4plq svg{width:240px;height:40px;display:block;margin:0 auto -34px}.c4plq b{display:block;font:italic 600 50px/1 'Fraunces';text-shadow:0 0 24px rgba(236,211,155,.6)}.c4plq span{display:block;margin-top:12px;font:600 14px 'Figtree';color:#f3ead7}@keyframes c3i{0%,16%{opacity:0;transform:scale(.9)}26%,82%{opacity:1;transform:none}92%,100%{opacity:0}}")
        bx, by = seat_xy(4)
        return (f'<div class="c5x" style="left:{bx}px;top:{by}px"></div><div class="c5t"><b>Arjun is out</b><small>Finishes 9th of 13 · 1 rebuy left</small><div><span class="p">Rebuy 1,000</span><span>Watch instead</span></div></div>',
                ".c5x{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(10,6,4,.55);box-shadow:0 0 0 2px #a83c32;animation:c5x 3s ease infinite}@keyframes c5x{0%,10%{opacity:0;transform:scale(1.4)}25%,90%{opacity:1;transform:none}100%{opacity:0}}"
                ".c5t{position:absolute;left:16px;right:16px;bottom:190px;padding:14px 16px;border-radius:14px;background:rgba(15,9,6,.94);box-shadow:inset 0 0 0 1px rgba(201,161,91,.4),0 12px 30px rgba(0,0,0,.6);display:grid;gap:4px;animation:c5t 3s cubic-bezier(.2,1.2,.4,1) infinite}"
                ".c5t b{font:italic 600 22px 'Fraunces';color:#ecd39b}.c5t small{color:#b9a88b;font-size:12.5px}.c5t div{display:flex;gap:8px;margin-top:6px}.c5t span{flex:1;text-align:center;padding:10px;border-radius:10px;font-weight:700;font-size:13.5px;box-shadow:inset 0 0 0 1px rgba(201,161,91,.45)}.c5t span.p{background:linear-gradient(180deg,#ecd39b,#c9a15b);color:#2a1a0e;box-shadow:none}"
                "@keyframes c5t{0%,15%{transform:translateY(40px);opacity:0}28%,92%{transform:none;opacity:1}100%{opacity:0}}")

TH = Classic()
if __name__ == '__main__':
    for f in build_all(TH, dealer=False): print(f)
