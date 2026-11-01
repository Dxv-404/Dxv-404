from builders import *
from avatars import bust
from fox import fox, FOX_CSS, DEFS as FOXDEFS
import json, os
ART = json.load(open(os.path.join(os.path.dirname(__file__), 'v1art.json')))
AV = dict(ol='#2a1d18', olw=1.3, skin=[('#f7ecd9', '#e4d2b4'), ('#f0dcc0', '#dcc29f'), ('#e2c6a0', '#c9a87f'), ('#cfae86', '#b5926a')],
          hair=['#1b1b22', '#1b1b22', '#2a1d18', '#1b1b22', '#1b1b22', '#2a1d18'], shirt=['#22356b', '#d2422d', '#c9a23a', '#2f6b4f', '#7a3b69', '#e9a9b4'],
          eyes='wood', ec='#2a1d18', mouth='#b0331f', collar='#f6eedc', cheek='rgba(233,169,180,.6)', acc='#2a1d18', accc='#c9a23a')
WAVE = 'M0 300 L0 170 Q40 120 90 150 Q120 170 140 130 Q160 70 230 40 Q300 14 340 50 Q300 50 290 80 Q320 70 336 92 Q300 96 300 130 Q360 150 420 120 L470 140 L470 300Z'

class Edo(Theme):
    key = 'edo'; name = 'Edo'; dealer_name = '狐 KITSUNE'
    bubble = 'Riya raises to 120. Your move, Dev.'
    deck_note = 'Washi cards with a gold inner frame. Suits are seasonal crests: spades the wave, hearts cherry blossom, diamonds chrysanthemum, clubs pine. Courts are woodblock figures; the back is vermilion with gold seigaiha.'
    dealer_title = 'Kitsune, your dealer'
    dealer_note = 'Redrawn with far more detail: seigaiha kimono with gold waves, asanoha-patterned collar, gold obi and cord, fur tufts, gold-lined mask markings, a sakura hairpin with a bell. Three tails while dealing, all nine on a big hand.'
    def sprite(self):
        return super().sprite() + FOXDEFS
    def chips(self):
        return (casino_chip('ch-a', '#d2422d', '#f6eedc', '#1e2a4a', '#c9a23a', '<text x="12" y="14.6" text-anchor="middle" font-family="Yuji Syuku" font-size="6.5" fill="#e9c25a">福</text>')
                + casino_chip('ch-b', '#1e2a4a', '#c9a23a', '#f6eedc', '#d2422d', '<text x="12" y="14.6" text-anchor="middle" font-family="Yuji Syuku" font-size="6.5" fill="#d2422d">運</text>'))
    def back_symbol(self):
        rows = ''.join(f'<path d="M{x} {y} a4 4 0 0 1 8 0 M{x+1.5} {y} a2.5 2.5 0 0 1 5 0" fill="none" stroke="#e9c25a" stroke-width=".45" opacity=".85"/>' for y in range(8, 68, 4) for x in range((y // 4) % 2 * 4 - 4, 52, 8))
        return (f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="ebc"><rect x="4" y="4" width="42" height="62" rx="2"/></clipPath><g clip-path="url(#ebc)">{rows}</g>'
                '<circle cx="25" cy="35" r="8" fill="#c23a26" stroke="#e9c25a" stroke-width=".9"/><text x="25" y="38.6" text-anchor="middle" font-family="Yuji Syuku" font-size="10" fill="#e9c25a">博</text></symbol>')
    def faces(self):
        arts = ART['edo_faces']
        f = lambda l, a, k: f'<symbol id="f{l}" viewBox="0 0 60 80"><g transform="translate(0 10)">{a}</g><text x="54" y="12" text-anchor="end" font-family="Yuji Syuku" font-size="9" fill="currentColor">{k}</text></symbol>'
        return f('K', arts[0], '王') + f('Q', arts[1], '姫') + f('J', arts[2], '侍')
    def avatar(self, p, ctx):
        inner = bust(p, AV) if not p.get('photo') else '<rect width="100" height="100" fill="#e9dfcf"/><circle cx="50" cy="44" r="18" fill="#e6c4a2"/><path d="M30 40 Q30 18 50 18 Q72 18 70 42 Q66 30 54 30 Q40 32 30 40Z" fill="#1b1b22"/><path d="M14 104 Q18 74 50 68 Q82 74 86 104Z" fill="#d2422d"/>'
        return f'<span class="kamon h{p["hue"]}"><svg viewBox="14 8 72 72">{inner}</svg></span>'
    def dealer(self, pose='idle', ctx='phone'): return f'<svg class="dv" viewBox="30 20 140 140" aria-hidden="true">{fox("idle")}</svg>'
    def board_css(self, kind): return FOX_CSS
    def bg(self, kind):
        pet = ''.join(f'<span class="petal" style="--x:{x}%;--t:{t}s;--d:-{d}s"></span>' for x, t, d in ((10, 11, 0), (34, 13, 4), (58, 10, 2), (82, 12, 7), (48, 14, 9)))
        if kind in ('phone', 'tiers'):
            return f'<svg style="position:absolute;left:0;top:56px;width:390px;height:150px" viewBox="0 0 390 150"><circle cx="304" cy="44" r="24" fill="#d2422d" opacity=".85"/><path d="M90 150 L170 46 Q195 30 220 46 L300 150Z" fill="#22356b" opacity=".16"/></svg><span class="cloud" style="left:20px;top:116px;width:66px"></span>{pet}'
        if kind == 'lap':
            return f'<svg style="position:absolute;left:0;top:0;width:1100px;height:260px" viewBox="0 0 1100 260"><circle cx="880" cy="104" r="44" fill="#d2422d" opacity=".85"/><path d="M320 260 L500 90 Q550 60 600 90 L780 260Z" fill="#22356b" opacity=".13"/></svg><span class="cloud" style="left:120px;top:150px;width:110px"></span>{pet}'
        if kind == 'menu':
            return f'<svg style="position:absolute;right:-30px;top:60px;width:150px;height:150px" viewBox="0 0 150 150"><circle cx="75" cy="75" r="60" fill="#d2422d" opacity=".85"/></svg><span class="cloud" style="left:-24px;top:74px;width:70px"></span>{pet}'
        return (f'<svg style="position:absolute;left:0;top:250px;width:390px;height:420px" viewBox="0 0 390 420"><circle cx="195" cy="40" r="110" fill="#d2422d"/><path d="M-10 420 L-10 280 L150 90 Q195 60 240 90 L400 280 L400 420Z" fill="#22356b" opacity=".85"/>'
                '<path d="M140 104 Q160 84 172 96 Q182 80 196 94 Q208 82 220 96 Q232 86 250 106 L240 90 Q195 60 150 90Z" fill="#f6eedc"/></svg>' + pet)
    def arena_deco(self, kind):
        return '<div class="lantern" style="left:10px;top:-6px"><i>福</i></div>' if kind == 'phone' else '<div class="lantern" style="left:40px;top:-4px;--cord:18px"><i>福</i></div><div class="lantern" style="right:40px;top:-4px;--cord:30px;animation-delay:-1.6s"><i>運</i></div>'
    def felt_deco(self, kind):
        return '<div class="deco"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="100" cy="60" rx="88" ry="50" fill="none" stroke="#c9a23a" stroke-width=".6" opacity=".7"/><ellipse cx="100" cy="60" rx="85" ry="47" fill="none" stroke="#c9a23a" stroke-width=".3" stroke-dasharray="1 2" opacity=".7"/></svg></div>'
    def logo(self, ctx):
        if ctx == 'menu': return '<div class="lgm">博打列車<small>TRAIN POKER · EDO</small></div>'
        return '<div class="lg"><i>印</i><small>TRAIN POKER</small><span>博打</span><span>列車</span></div>'
    def poses(self):
        P_ = [('Shuffle', 'Hanafuda fanned like a folding fan.', 'idle'), ('Deal', 'Every card leaves with a flick and a wink.', 'deal'), ('Your turn', 'The closed fan points at you; foxfire lights up.', 'turn'),
              ('Big hand', 'All nine tails fan out. Banner cut-in.', 'big'), ('Ship it', 'A grin, an open fan, a shower of coins.', 'ship'), ('Waiting', 'Sips tea, asks if you\'re done yet.', 'wait')]
        q = ['Shall we begin?', 'Hira-ri.', 'Your move, traveller.', 'Nanto!', 'Splendid.', 'Mada?']
        return [(t, d, f'<svg viewBox="0 0 200 200" role="img" aria-label="Kitsune, {t}">{fox("shuffle" if p == "idle" else p)}</svg>', qq) for (t, d, p), qq in zip(P_, q)]
    def deck_extra(self):
        cr = ''.join(f'<span style="width:44px;height:44px;border-radius:50%;background:#f6eedc;box-shadow:0 0 0 1.5px #1e2a4a,0 0 0 4px #c9a23a;display:grid;place-items:center"><svg viewBox="0 0 44 44" style="width:32px;height:32px">{c}</svg></span>' for c in ART['edo_crests'])
        return f'<div><div style="display:flex;gap:14px">{cr}</div><p class="lbl">Suit crests: wave, sakura, chrysanthemum, pine</p></div>'
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<span class="e1p" style="left:{sx+60}px;top:{sy-120}px;--tx:{-60}px;--ty:{110}px"></span><div class="e1s" style="left:{sx+22}px;top:{sy-30}px">勝</div><div class="e1n" style="left:{sx}px;top:{sy-64}px">+640</div>',
                    '.e1p{position:absolute;width:12px;height:9px;border-radius:80% 0 80% 0;background:#e9a9b4;animation:e1p 2.6s ease-in-out infinite}@keyframes e1p{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:1}55%,100%{transform:translate(var(--tx),var(--ty)) rotate(300deg);opacity:1}}'
                    ".e1s{position:absolute;width:30px;height:30px;border-radius:5px;background:#d2422d;color:#fff6e6;display:grid;place-items:center;font:400 18px 'Yuji Syuku';box-shadow:inset 0 0 0 2px #d2422d,inset 0 0 0 3px #fff6e6;animation:e1s 2.6s cubic-bezier(.3,1.6,.5,1) infinite}@keyframes e1s{0%,50%{transform:scale(2) rotate(-20deg);opacity:0}60%,90%{transform:rotate(-8deg);opacity:1}100%{opacity:0}}"
                    ".e1n{position:absolute;transform:translateX(-50%);font:800 18px 'Shippori Mincho';color:#b0331f;text-shadow:0 0 6px #f6eedc,0 0 2px #f6eedc;animation:e1s 2.6s ease infinite}")
        if i == 1:
            ribs = ''.join(f'<path d="M130 140 L{130+120*math.cos(math.radians(a)):.0f} {140+120*math.sin(math.radians(a)):.0f}" stroke="#7a3a22" stroke-width="1.2"/>' for a in range(-170, -9, 16))
            return (f'<div class="e2"><svg viewBox="0 0 260 150" aria-hidden="true"><defs><clipPath id="e2c"><path d="M130 140 L10 140 A120 120 0 0 1 250 140Z"/></clipPath></defs><g clip-path="url(#e2c)"><rect width="260" height="150" fill="#f6eedc"/><path d="{WAVE}" transform="scale(.56) translate(0 -40)" fill="url(#kfSei)" stroke="#1e2a4a" stroke-width="2"/><circle cx="196" cy="62" r="16" fill="#d2422d"/></g>{ribs}<path d="M10 140 A120 120 0 0 1 250 140" fill="none" stroke="#1e2a4a" stroke-width="2.4"/><path d="M60 140 A70 70 0 0 1 200 140" fill="none" stroke="#c9a23a" stroke-width="1.4"/></svg><b>順</b><span>STRAIGHT · MEERA +860</span></div>',
                    '.e2{position:absolute;left:50%;top:230px;width:260px;margin-left:-130px;text-align:center;animation:e2 2.8s ease infinite}.e2 svg{width:260px;height:150px;transform-origin:50% 93%;animation:e2f 2.8s cubic-bezier(.3,1.3,.4,1) infinite}'
                    "@keyframes e2f{0%,8%{transform:scaleX(.02) rotate(-60deg)}26%,86%{transform:none}100%{transform:scaleX(.02)}}.e2 b{position:absolute;left:0;right:0;top:66px;font:400 46px 'Yuji Syuku';color:#1e2a4a;text-shadow:0 0 8px #f6eedc;animation:e2 2.8s ease infinite}"
                    ".e2 span{display:inline-block;margin-top:6px;padding:4px 12px;background:#1e2a4a;color:#efe3c8;font:800 12px 'Shippori Mincho';letter-spacing:.14em}@keyframes e2{0%,18%{opacity:0}30%,86%{opacity:1}100%{opacity:0}}")
        if i == 2:
            return (f'<div class="e3bg"></div><svg class="e3w" viewBox="0 0 470 300" preserveAspectRatio="none" aria-hidden="true"><path d="{WAVE}" fill="url(#kfSei)" stroke="#1e2a4a" stroke-width="3"/></svg>'
                    '<div class="e3s"><div class="pp"><span class="t">一色</span><span class="u">FLUSH · ACE HIGH</span></div><i class="rod a"></i><i class="rod b"></i></div><div class="e3h">色</div>'
                    f'<div class="e3f"><svg viewBox="30 20 140 140" aria-hidden="true">{fox("big")}</svg></div><p class="e3n"><b>Meera</b>takes 1,480</p>',
                    '.e3bg{position:absolute;inset:0;background:radial-gradient(80% 60% at 50% 45%,rgba(20,30,64,.55),rgba(14,20,44,.92));animation:e3bg 3.6s ease infinite}@keyframes e3bg{0%{opacity:0}6%,90%{opacity:1}100%{opacity:0}}'
                    '.e3w{position:absolute;left:-10%;top:30px;width:120%;height:300px;animation:e3w 3.6s cubic-bezier(.5,0,.2,1) infinite}@keyframes e3w{0%{transform:translateX(-100%)}14%,88%{transform:none}100%{transform:translateX(110%)}}'
                    '.e3s{position:absolute;left:50%;top:90px;width:240px;height:360px;margin-left:-120px;animation:e3s 3.6s cubic-bezier(.3,1.1,.4,1) infinite}@keyframes e3s{0%,12%{transform:scaleY(.04);opacity:0}14%{opacity:1}28%,90%{transform:none;opacity:1}100%{opacity:0}}'
                    '.e3s .pp{position:absolute;inset:14px 16px;background:radial-gradient(90% 60% at 50% 40%,#fbf4e4,#efe3c8 70%,#e2d0a8);box-shadow:inset 0 0 0 2px #c9a23a,inset 0 0 0 7px #efe3c8,inset 0 0 0 8px #1e2a4a,0 10px 30px rgba(0,0,0,.45)}'
                    ".e3s .t{position:absolute;left:50%;top:26px;transform:translateX(-50%);writing-mode:vertical-rl;font:400 100px/1 'Yuji Syuku';color:#1e2a4a;animation:brush 3.6s steps(20,end) infinite}@keyframes brush{0%,22%{clip-path:inset(0 0 100% 0)}42%,100%{clip-path:inset(0)}}"
                    ".e3s .u{position:absolute;left:0;right:0;bottom:28px;text-align:center;font:800 12px 'Shippori Mincho';letter-spacing:.16em;color:#b0331f}"
                    '.e3s .rod{position:absolute;left:0;right:0;height:16px;border-radius:8px;background:linear-gradient(#7a3a22,#3a160c)}.e3s .rod.a{top:0}.e3s .rod.b{bottom:0}'
                    ".e3h{position:absolute;right:26px;top:380px;width:66px;height:66px;border-radius:8px;background:#d2422d;color:#fff6e6;display:grid;place-items:center;font:400 40px 'Yuji Syuku';box-shadow:inset 0 0 0 3px #d2422d,inset 0 0 0 5px #fff6e6;animation:e3h 3.6s cubic-bezier(.3,1.6,.5,1) infinite}@keyframes e3h{0%,44%{transform:scale(2.4) rotate(-24deg);opacity:0}50%,90%{transform:rotate(-8deg);opacity:1}100%{opacity:0}}"
                    '.e3f{position:absolute;left:14px;top:470px;width:150px;height:150px;border-radius:50%;overflow:hidden;background:#f6eedc;box-shadow:0 0 0 4px #1e2a4a,0 0 0 8px #c9a23a;animation:e3f 3.6s cubic-bezier(.2,1.3,.4,1) infinite}.e3f svg{width:100%;height:100%}@keyframes e3f{0%,50%{transform:translateX(-220px) rotate(-30deg)}60%,90%{transform:none}100%{opacity:0}}'
                    ".e3n{position:absolute;left:180px;top:520px;color:#efe3c8;font:700 15px 'Shippori Mincho';animation:e3f 3.6s ease infinite}.e3n b{display:block;font:400 30px 'Yuji Syuku';color:#e9c25a}")
        if i == 3:
            crane = '<svg class="e4c" viewBox="0 0 80 40" aria-hidden="true"><path d="M40 20 Q20 0 0 6 Q22 12 30 22 Q14 30 4 36 Q30 34 40 24 Q50 34 76 36 Q66 30 50 22 Q58 12 80 6 Q60 0 40 20Z" fill="#f6eedc" stroke="#1e2a4a" stroke-width="1.4"/><circle cx="40" cy="18" r="2.6" fill="#d2422d"/></svg>'
            return (f'<div class="e4bg"></div><div class="e4sun"></div><svg class="e4w" viewBox="0 0 470 300" preserveAspectRatio="none" aria-hidden="true"><path d="{WAVE}" fill="url(#kfSei)" stroke="#1e2a4a" stroke-width="3"/></svg>{crane}'
                    '<span class="cloud" style="left:30px;top:150px;width:90px"></span><span class="cloud" style="left:240px;top:110px;width:80px;animation-delay:-5s"></span>'
                    '<div class="e4t"><span>天下一</span><b>ROYAL FLUSH</b><small>Meera · once in a season · trophy added</small></div>',
                    '.e4bg{position:absolute;inset:0;background:linear-gradient(#f3d9b0,#efe3c8 50%,#e8d6b0);animation:e4bg 5s ease infinite}@keyframes e4bg{0%{opacity:0}6%,92%{opacity:1}100%{opacity:0}}'
                    '.e4sun{position:absolute;left:50%;top:420px;width:260px;height:260px;margin-left:-130px;border-radius:50%;background:radial-gradient(circle at 40% 38%,#e2553b,#d2422d 65%,#b5341f);animation:e4s 5s cubic-bezier(.3,0,.2,1) infinite}@keyframes e4s{0%,8%{transform:translateY(200px);opacity:0}40%,92%{transform:translateY(-170px);opacity:1}100%{opacity:0}}'
                    '.e4w{position:absolute;left:-10%;bottom:-20px;width:120%;height:380px;animation:e4w 5s cubic-bezier(.5,0,.2,1) infinite}@keyframes e4w{0%{transform:translateY(100%)}20%{transform:none}60%{transform:translateY(-14px)}92%{transform:none;opacity:1}100%{opacity:0}}'
                    '.e4c{position:absolute;width:90px;height:45px;top:160px;animation:e4c 5s linear infinite}@keyframes e4c{0%{transform:translateX(-120px)}100%{transform:translateX(520px) translateY(-60px)}}'
                    ".e4t{position:absolute;left:0;right:0;top:330px;text-align:center;animation:e4t 5s ease infinite}.e4t span{display:block;font:400 74px/1 'Yuji Syuku';color:#1e2a4a;text-shadow:0 0 18px #f6eedc}.e4t b{display:inline-block;font:800 28px 'Shippori Mincho';letter-spacing:.16em;color:#1e2a4a;background:#f6eedc;padding:4px 14px;margin:10px 0 6px;box-shadow:0 0 0 1.5px #1e2a4a}.e4t small{display:block;font:700 13px 'Shippori Mincho';color:#1e2a4a;text-shadow:0 0 6px #f6eedc}"
                    '@keyframes e4t{0%,30%{opacity:0;transform:translateY(20px)}44%,90%{opacity:1;transform:none}100%{opacity:0}}')
        bx, by = seat_xy(4)
        return (f'<div class="lantern e5l" style="left:{bx-14}px;top:{by-110}px;--cord:24px"><i>灯</i></div><div class="e5sm" style="left:{bx}px;top:{by-130}px"><i></i><i></i></div>'
                '<div class="e5"><small>The lantern goes out</small><b>Arjun leaves the den</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy 1,000</em><em>Watch</em></div></div>',
                '.e5l i{animation:e5o 3s ease infinite}@keyframes e5o{0%,30%{filter:none}50%,100%{filter:grayscale(.9) brightness(.55);box-shadow:none}}'
                '.e5sm{position:absolute}.e5sm i{position:absolute;width:4px;height:26px;border-radius:50%;background:linear-gradient(transparent,rgba(30,42,74,.5));filter:blur(2px);animation:e5s 3s ease-out infinite}.e5sm i+i{left:6px;animation-delay:-1s}@keyframes e5s{0%,40%{opacity:0;transform:translateY(0)}60%{opacity:1}100%{opacity:0;transform:translateY(-40px) rotate(20deg)}}'
                ".e5{position:absolute;left:22px;right:22px;bottom:194px;padding:16px;background:#f6eedc;border-radius:4px;box-shadow:0 0 0 1.5px #1e2a4a,4px 4px 0 rgba(30,42,74,.3);color:#1e2a4a;animation:e5 3s ease infinite}"
                ".e5 small{font:700 10px 'Shippori Mincho';letter-spacing:.2em;text-transform:uppercase;color:#b0331f}.e5 b{display:block;font:400 26px 'Yuji Syuku'}.e5 span{font:600 13px 'Shippori Mincho';color:#6b6450}"
                ".e5 div{display:flex;gap:8px;margin-top:10px}.e5 em{flex:1;text-align:center;font:800 13px 'Shippori Mincho';font-style:normal;padding:10px;border-radius:4px;box-shadow:inset 0 0 0 1px #1e2a4a}.e5 em:first-child{background:#d2422d;color:#fff6e6;box-shadow:none}"
                '@keyframes e5{0%,30%{opacity:0;transform:translateY(20px)}44%,92%{opacity:1;transform:none}100%{opacity:0}}')

TH = Edo()
if __name__ == '__main__':
    for f in build_all(TH): print(f)
