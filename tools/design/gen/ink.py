from builders import *
from avatars import bust
import json, os
ART = json.load(open(os.path.join(os.path.dirname(__file__), 'v1art.json')))
AV = dict(ol='#111', olw=2.2, skin=[('#fff', '#e9e9e9')] * 4, hair=['#111', '#111', '#333', '#111', '#111', '#222'], shirt=['#fff', '#111', '#fff', '#e8202a', '#111', '#fff'],
          eyes='ink', ec='#111', mouth='#111', collar='#111', tone=True, acc='#111', accc='#111')

class Ink(Theme):
    key = 'ink'; name = 'Ink'; dealer_name = 'KAGE'
    bubble = 'Riya raises 120! Your move, Dev.'
    deck_note = 'Printed-page cards: bold ink keyline, hard drop shadow, Reggae One numerals. Four inks: black, red, blue, green. Courts are tiny ink panels, the back is a speed-line burst. The rank and suit now sit in separate zones, so nothing overlaps at any size.'
    dealer_title = 'Kage, your dealer'
    dealer_note = 'Unchanged from v1 because it worked: brush-ink croupier, one red accent (the tie), and a sound effect for every reaction.'
    def sprite(self):
        return (super().sprite() + '<pattern id="tone" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#fff" opacity=".55"/></pattern>')
    def chips(self):
        hatch = '<path d="M5 8 l3 -2 M4 12 l3 -2 M16 6 l3 2 M17 10 l3 2 M8 19 l2 -3 M14 19 l-2 -3" stroke="#111" stroke-width=".8"/>'
        return (casino_chip('ch-a', '#fff', '#e8202a', '#fff', '#111', hatch + '<text x="12" y="14.6" text-anchor="middle" font-family="Reggae One" font-size="6.5" fill="#111">勝</text>').replace('fill="rgba(255,255,255,.18)"', 'fill="none"').replace('stroke="rgba(0,0,0,.35)" stroke-width=".6"', 'stroke="#111" stroke-width="1.4"')
                + casino_chip('ch-b', '#111', '#fff', '#e8202a', '#fff', '<text x="12" y="14.6" text-anchor="middle" font-family="Reggae One" font-size="6.5" fill="#fff">賭</text>').replace('stroke="rgba(0,0,0,.35)" stroke-width=".6"', 'stroke="#111" stroke-width="1.4"'))
    def back_symbol(self):
        rays = ''.join(f'<path d="M25 35 L{25+50*math.cos(math.radians(a)):.1f} {35+50*math.sin(math.radians(a)):.1f}" stroke="#111" stroke-width="{1.4 if k%3 else .6}"/>' for k, a in enumerate(range(0, 360, 9)))
        return (f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="ibc"><rect x="4" y="4" width="42" height="62"/></clipPath><g clip-path="url(#ibc)"><rect width="50" height="70" fill="#e8202a"/>{rays}</g>'
                '<circle cx="25" cy="35" r="9" fill="#fff" stroke="#111" stroke-width="1.6"/><text x="25" y="39.5" text-anchor="middle" font-family="Reggae One" font-size="12" fill="#111">賭</text><rect x="4" y="4" width="42" height="62" fill="none" stroke="#111" stroke-width="1.6"/></symbol>')
    def faces(self):
        def f(l, art, sfx): return f'<symbol id="f{l}" viewBox="0 0 60 80"><rect x="4" y="6" width="52" height="68" fill="#fff" stroke="#111" stroke-width="2.4"/>{art}<text x="50" y="18" text-anchor="end" font-family="Reggae One" font-size="9" fill="#e8202a">{sfx}</text></symbol>'
        return (f('K', '<path d="M12 44 L16 22 L24 34 L30 16 L36 34 L44 22 L48 44Z" fill="#fff" stroke="#111" stroke-width="2.4" stroke-linejoin="round"/><rect x="12" y="46" width="36" height="6" fill="#111"/><path d="M16 38 l5 5 M24 32 l6 7 M36 32 l6 7" stroke="#111" stroke-width="1"/><text x="30" y="68" text-anchor="middle" font-family="Reggae One" font-size="10" fill="#111">王</text>', 'ゴゴ')
                + f('Q', '<path d="M8 40 Q30 18 52 40 Q30 58 8 40Z" fill="#fff" stroke="#111" stroke-width="2.4"/><circle cx="30" cy="39" r="9" fill="currentColor" stroke="#111" stroke-width="2"/><circle cx="30" cy="39" r="3.6" fill="#111"/><circle cx="27" cy="35" r="2.2" fill="#fff"/><path d="M12 30 L8 22 M20 24 L17 15 M30 22 L30 12" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>', 'キラ')
                + f('J', '<path d="M44 16 L18 54" stroke="#111" stroke-width="5" stroke-linecap="round"/><path d="M44 16 L18 54" stroke="#fff" stroke-width="2"/><path d="M14 48 L26 58" stroke="#111" stroke-width="4" stroke-linecap="round"/><path d="M18 54 L10 66" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M30 24 l10 -3 M24 34 l12 -2" stroke="#111" stroke-width="1"/>', 'シャキン'))
    def avatar(self, p, ctx):
        tilt = [-4, 3, -2, 4, -3, 2][p.get('k', 0) % 6] if ctx != 'menu' else -3
        if p.get('photo'):
            return f'<span class="panel photo" style="--tilt:{tilt}deg"><svg viewBox="16 10 68 68"><rect x="0" y="0" width="100" height="100" fill="#cfcfcf"/><circle cx="50" cy="44" r="18" fill="#efe2d8"/><path d="M31 42 Q30 20 50 19 Q71 20 69 44 Q64 30 52 31 Q40 33 31 42Z" fill="#222"/><path d="M14 104 Q18 74 50 68 Q82 74 86 104Z" fill="#555"/><rect width="100" height="100" fill="url(#tone)" opacity=".5"/></svg></span>'
        return f'<span class="panel" style="--tilt:{tilt}deg"><svg viewBox="16 10 68 68">{bust(p, AV)}</svg></span>'
    def dealer(self, pose='idle', ctx='phone'):
        return ART['kage_table'].replace('<svg ', '<svg class="dv" ', 1)
    def bg(self, kind): return '' if kind not in ('loading', 'menu') else '<div class="speedbg"></div>'
    def felt_deco(self, kind):
        return ('<div class="deco"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">'
                '<ellipse cx="100" cy="60" rx="88" ry="50" fill="none" stroke="#111" stroke-width=".7"/><ellipse cx="100" cy="60" rx="85" ry="47" fill="none" stroke="#111" stroke-width=".3" stroke-dasharray="1.5 2"/>'
                + ''.join(f'<path d="M{60+k*6} {108-abs(k-7)*.6} l3 -5" stroke="#111" stroke-width=".5" opacity=".5"/>' for k in range(15))
                + '<path d="M14 30 L40 36 M10 44 L38 46 M186 30 L160 36 M190 44 L162 46 M14 90 L40 84 M186 90 L160 84" stroke="#111" stroke-width=".6" opacity=".35"/></svg>'
                '<span class="sfx" style="left:12%;top:70%">ザワ</span><span class="sfx" style="right:12%;top:22%;transform:rotate(10deg)">ザワ</span></div>')
    def logo(self, ctx): return '<div class="lg">トランプ<br>TRAIN POKER<small>INK EDITION</small></div>' if ctx == 'loading' else '<div class="lg" style="font-size:40px">TRAIN POKER<br><small>INK EDITION</small></div>'
    def board_css(self, kind): return ART['kage_css'] if kind == 'dealer' else ''
    def poses(self):
        meta = [('Shuffle', 'Between hands and on loading.', 'Cards. Now.'), ('Deal', 'Every card that leaves the deck.', 'シュッ'), ('Your turn', 'Points straight at you.', 'Well?'),
                ('Big hand', 'Tier 3 and up, and every cut-in.', 'ガーン!'), ('Ship it', 'Big pot won or a bluff shown.', 'Hahaha!'), ('Waiting', 'Ready check, someone away.', '…')]
        return [(t, d, svg, q) for (t, d, q), svg in zip(meta, ART['kage'])]
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<div class="k1" style="left:{sx+30}px;top:{sy-70}px">チャリン</div><div class="k1b" style="left:{sx}px;top:{sy}px"></div>',
                    ".k1{position:absolute;font:400 22px 'Reggae One';color:#111;-webkit-text-stroke:0;text-shadow:2px 2px 0 #fff,-2px -2px 0 #fff,2px -2px 0 #fff,-2px 2px 0 #fff;transform:rotate(-10deg);animation:k1 2.4s cubic-bezier(.2,1.6,.3,1) infinite}"
                    "@keyframes k1{0%,30%{transform:rotate(-10deg) scale(.3);opacity:0}42%,82%{transform:rotate(-10deg) scale(1);opacity:1}100%{opacity:0}}"
                    ".k1b{position:absolute;width:90px;height:90px;margin:-45px 0 0 -45px;background:repeating-conic-gradient(#111 0 4deg,transparent 4deg 16deg);-webkit-mask:radial-gradient(circle,transparent 40%,#000 41% 70%,transparent 71%);mask:radial-gradient(circle,transparent 40%,#000 41% 70%,transparent 71%);animation:k1 2.4s ease-out infinite}")
        if i == 1:
            return ('<div class="k2"><div class="sp"></div><b>ストレート!</b><span>STRAIGHT · MEERA +860</span></div>',
                    ".k2{position:absolute;left:-20px;right:-20px;top:240px;height:150px;background:#fff;box-shadow:0 0 0 4px #111,6px 6px 0 #111;transform:rotate(-6deg);overflow:hidden;display:grid;place-content:center;text-align:center;animation:k2 2.6s cubic-bezier(.2,1.3,.3,1) infinite}"
                    ".k2 .sp{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 10px,rgba(0,0,0,.12) 10px 11px,transparent 11px 26px)}"
                    ".k2 b{position:relative;font:400 46px 'Reggae One';color:#111;text-shadow:4px 4px 0 #e8202a}.k2 span{position:relative;font:800 13px 'M PLUS 1p';letter-spacing:.14em}"
                    "@keyframes k2{0%{transform:rotate(-6deg) translateX(-120%)}14%{transform:rotate(-6deg)}84%{transform:rotate(-6deg);opacity:1}100%{transform:rotate(-6deg) translateX(120%);opacity:1}}")
        if i == 2:
            kage = ART['kage'][3]
            return (f'<div class="k3bg"></div><div class="k3p a"><div class="sp"></div><b>フラッシュ</b></div><div class="k3p b">{kage}</div><div class="k3p c"><small>ACE-HIGH FLUSH, ALL HEARTS</small><b>FLUSH!!</b><span>Meera takes 1,480</span></div><div class="k3don">ドン!!</div>',
                    '.k3bg{position:absolute;inset:0;background:#f5f2ea;animation:k3bg 3.4s ease infinite}@keyframes k3bg{0%{opacity:0}6%,90%{opacity:1}100%{opacity:0}}'
                    '.k3p{position:absolute;background:#fff;box-shadow:0 0 0 4px #111;overflow:hidden;animation:k3p 3.4s cubic-bezier(.2,1.2,.3,1) infinite}.k3p .sp{position:absolute;inset:-40%;background:repeating-conic-gradient(from 0deg,rgba(0,0,0,.18) 0 1.4deg,transparent 1.4deg 6deg)}'
                    ".k3p.a{left:14px;right:14px;top:70px;height:200px;clip-path:polygon(0 0,100% 0,100% 82%,0 100%);display:grid;place-items:center}.k3p.a b{position:relative;font:400 54px 'Reggae One';color:#111;text-shadow:4px 4px 0 #e8202a}"
                    '.k3p.b{left:14px;width:170px;top:290px;height:260px;clip-path:polygon(0 8%,100% 0,90% 100%,0 100%);animation-delay:.15s}.k3p.b svg{width:100%;height:100%}'
                    ".k3p.c{left:196px;right:14px;top:290px;height:260px;clip-path:polygon(12% 0,100% 0,100% 100%,0 100%);animation-delay:.3s;display:grid;align-content:center;padding:0 10px 0 26px;gap:4px}.k3p.c b{font:400 28px/1 'Reggae One';color:#e8202a}.k3p.c small{font:800 9px 'M PLUS 1p';letter-spacing:.14em}.k3p.c span{font:800 12px 'M PLUS 1p'}"
                    '@keyframes k3p{0%,6%{transform:scale(1.4);opacity:0}16%,88%{transform:none;opacity:1}100%{opacity:0}}'
                    ".k3don{position:absolute;left:0;right:0;top:570px;text-align:center;font:400 64px 'Reggae One';color:#e8202a;-webkit-text-stroke:3px #111;transform:rotate(-6deg);animation:k3d 3.4s cubic-bezier(.2,1.8,.3,1) infinite}@keyframes k3d{0%,40%{transform:rotate(-6deg) scale(2.6);opacity:0}50%,88%{transform:rotate(-6deg) scale(1);opacity:1}100%{opacity:0}}")
        if i == 3:
            spark = ''.join(f'<i style="left:{(k*53)%360+10}px;top:{(k*97)%700+60}px;animation-delay:{-(k*.17)%1.6:.2f}s"></i>' for k in range(18))
            return (f'<div class="k4bg"></div><div class="k4sp"></div><div class="k4s">{spark}</div><div class="k4t"><small>LEGENDARY HAND</small><b>ロイヤル<br>ストレート<br>フラッシュ</b><span>ROYAL FLUSH · MEERA</span></div>'
                    '<div class="k4c">' + ''.join(card(c, 48) for c in ['Th', 'Jh', 'Qh', 'Kh', 'Ah']) + '</div>',
                    '.k4bg{position:absolute;inset:0;background:#fff;animation:k4bg 5s ease infinite}@keyframes k4bg{0%{opacity:0}4%{opacity:1;background:#111}8%,90%{opacity:1;background:#fff}100%{opacity:0}}'
                    '.k4sp{position:absolute;inset:-60%;background:repeating-conic-gradient(from 0deg at 50% 45%,#111 0 1.6deg,transparent 1.6deg 5deg);mask-image:radial-gradient(circle at 50% 45%,transparent 18%,#000 40%);animation:k4sp 5s ease infinite}@keyframes k4sp{0%,6%{opacity:0;transform:scale(1.4)}16%,88%{opacity:1;transform:none}100%{opacity:0}}'
                    '.k4s i{position:absolute;width:18px;height:18px;background:#e8202a;clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%);animation:k4i 1.6s ease-in-out infinite}@keyframes k4i{0%,100%{transform:scale(0)}50%{transform:scale(1.2) rotate(45deg)}}'
                    ".k4t{position:absolute;left:0;right:0;top:220px;text-align:center;animation:k4t 5s cubic-bezier(.2,1.5,.3,1) infinite}.k4t small{display:inline-block;font:800 12px 'M PLUS 1p';letter-spacing:.3em;background:#111;color:#fff;padding:4px 12px}.k4t b{display:block;font:400 50px/1.05 'Reggae One';color:#111;text-shadow:5px 5px 0 #e8202a;margin:14px 0}.k4t span{font:800 14px 'M PLUS 1p';letter-spacing:.18em;background:#fff;padding:2px 8px}"
                    '@keyframes k4t{0%,10%{transform:scale(3);opacity:0}22%,88%{transform:none;opacity:1}100%{opacity:0}}.k4c{position:absolute;left:0;right:0;top:560px;display:flex;justify-content:center;gap:6px;animation:k4t 5s ease infinite}')
        bx, by = seat_xy(4)
        return (f'<div class="k5g" style="left:{bx-50}px;top:{by-70}px"></div><div class="k5t" style="left:{bx-10}px;top:{by-88}px">ガーン</div>'
                '<div class="k5"><b>ARJUN IS OUT…</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy!</em><em>Watch</em></div></div>',
                '.k5g{position:absolute;width:100px;height:110px;background:repeating-linear-gradient(90deg,#111 0 1.5px,transparent 1.5px 6px);mask-image:linear-gradient(#000,transparent);animation:k5 3s ease infinite}'
                ".k5t{position:absolute;font:400 26px 'Reggae One';color:#111;transform:rotate(8deg);text-shadow:2px 2px 0 #fff;animation:k5 3s ease infinite}"
                ".k5{position:absolute;left:18px;right:18px;bottom:196px;padding:16px;background:#fff;box-shadow:0 0 0 3.5px #111,6px 6px 0 #111;transform:rotate(-1.5deg);animation:k5 3s cubic-bezier(.2,1.4,.3,1) infinite}"
                ".k5 b{display:block;font:400 26px 'Reggae One'}.k5 span{font:800 12.5px 'M PLUS 1p';color:#555}.k5 div{display:flex;gap:10px;margin-top:10px}.k5 em{flex:1;text-align:center;font:800 14px 'M PLUS 1p';font-style:normal;padding:10px;box-shadow:0 0 0 2.5px #111}.k5 em:first-child{background:#e8202a;color:#fff}"
                '@keyframes k5{0%,10%{opacity:0;transform:translateY(16px)}24%,92%{opacity:1;transform:none}100%{opacity:0}}')

TH = Ink()
if __name__ == '__main__':
    for f in build_all(TH): print(f)
