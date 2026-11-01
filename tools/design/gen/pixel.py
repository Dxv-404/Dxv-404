from builders import *
from px_assets import suit_svg

def bram(pose, size=96): return f'<span class="bram" style="width:{size}px;height:{size}px;background-image:url(img/px-bram-{pose}.png)"></span>'

class Pixel(Theme):
    key = 'pixel'; name = 'Pixel'; dealer_name = 'BRAM'
    bubble = 'Riya raises 120! Your move, Dev.'
    deck_note = 'Every card is drawn on a real pixel grid: a two-pixel ink border with a bevel, stepped corners, Silkscreen indices and 9×9 hand-placed suit sprites with a highlight. Courts are 20×24 portraits; the back is a 25×35 sprite with a gold gem. Chips are coins and ruby tokens.'
    dealer_title = 'Bram, the innkeeper'
    dealer_note = 'A 48×48 sprite, shaded from a single top-left light with hue-shifted ramps and selective outlining. Each pose is a two-frame animation, played back with stepped timing like a real game sprite.'
    def sprite(self):
        img = lambda id_, f, w, h: f'<symbol id="{id_}" viewBox="0 0 {w} {h}"><image href="img/{f}" width="{w}" height="{h}" style="image-rendering:pixelated"/></symbol>'
        return (''.join(suit_svg(k) for k in 'shdc') + img('ch-a', 'px-coin.png', 12, 12) + img('ch-b', 'px-gem.png', 12, 12)
                + '<symbol id="cb" viewBox="0 0 50 70"></symbol>' + ''.join(f'<symbol id="f{l}" viewBox="0 0 60 80"><image href="img/px-f{l}.png" x="5" y="4" width="50" height="60" style="image-rendering:pixelated"/></symbol>' for l in 'KQJ'))
    def avatar(self, p, ctx):
        f = 'photo' if p.get('photo') else p['i'].lower()
        return f'<span class="pf"><img src="img/px-av-{f}.png" alt=""></span>'
    def dealer(self, pose='idle', ctx='phone'): return bram('shuffle', 128 if ctx == 'lap' else 96)
    def bg(self, kind):
        motes = ''.join(f'<i class="mote" style="left:{x}%;top:{y}%;animation-delay:-{d}s"></i>' for x, y, d in ((20, 40, 0), (70, 55, 3), (40, 70, 6), (85, 35, 2)))
        if kind == 'lap':
            return ('<div class="pxbg"></div><span class="fire" style="left:46px;top:520px"></span><span class="glowf" style="left:-60px;top:400px;width:260px;height:260px"></span>'
                    '<span class="glowf" style="left:150px;top:160px;width:160px;height:160px"></span><span class="glowf" style="left:920px;top:160px;width:160px;height:160px;animation-delay:-.7s"></span>'
                    '<span class="zz" style="left:240px;top:100px">z</span>' + motes)
        dim = '<div style="position:absolute;inset:0;background:linear-gradient(rgba(26,18,32,.2),rgba(26,18,32,.78) 45%)"></div>' if kind in ('menu', 'loading') else ''
        return ('<div class="pxbg"></div>' + dim + '<span class="glowf" style="left:-50px;top:110px;width:160px;height:160px"></span><span class="glowf" style="left:280px;top:110px;width:160px;height:160px;animation-delay:-.7s"></span>'
                '<span class="zz" style="left:118px;top:100px">z</span><span class="zz" style="left:122px;top:100px;animation-delay:-1.5s">z</span>' + motes)
    def logo(self, ctx): return '<div class="lg">TRAIN<br>POKER<small>The Gilded Tankard · est. 2026</small></div>'
    def loading_extra(self): return f'<div style="position:absolute;left:50%;bottom:150px;margin-left:-48px">{bram("shuffle")}</div>'
    def poses(self):
        P_ = [('Shuffle', 'Riffles a fresh deck between hands.', 'shuffle', 'Fresh deck, fresh luck!'), ('Deal', 'Flicks each card with a wink.', 'deal', 'Here ye go.'),
              ('Your turn', 'Points at you; a "!" pops above his head.', 'turn', 'Your turn, friend!'), ('Big hand', 'Tier 3 and up: arms up, jaw drops.', 'big', 'By my beard!'),
              ('Ship it', 'Raises a tankard to the winner.', 'ship', 'Drinks on Meera!'), ('Waiting', 'Polishes a mug while someone thinks.', 'wait', 'Take yer time…')]
        return [(t, d, f'<div class="px" role="img" aria-label="Bram, {t}" style="display:grid;place-items:center">{bram(p, 192)}</div>', q) for t, d, p, q in P_]
    def board_css(self, kind):
        return '.pose{background:#22182a!important;box-shadow:0 0 0 2px #1a1220,inset 2px 2px 0 #4f4558!important}.pose b{font:400 15px Silkscreen}' if kind == 'dealer' else ''
    def deck_extra(self):
        return ('<div><div style="display:flex;gap:12px;align-items:flex-end"><img src="img/px-chest.png" alt="" style="width:72px;image-rendering:pixelated"><img src="img/px-heart.png" alt="" style="width:36px;image-rendering:pixelated">'
                '<span class="fire" style="position:relative;display:block;width:48px;height:48px"></span></div><p class="lbl">Props for the win animations</p></div>')
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            coins = ''.join(f'<img class="p1c" src="img/px-coin.png" alt="" style="left:{sx-12}px;top:{sy-20}px;--dx:{dx}px;animation-delay:{k*.08:.2f}s">' for k, dx in enumerate((-30, -10, 12, 30, 0)))
            return (f'{coins}<div class="p1t" style="left:{sx}px;top:{sy-74}px">+640</div>',
                    '.p1c{position:absolute;width:24px;height:24px;image-rendering:pixelated;animation:p1c 2.4s steps(12) infinite}@keyframes p1c{0%{transform:translate(0,0);opacity:0}10%{opacity:1}35%{transform:translate(var(--dx),-50px)}60%{transform:translate(var(--dx),-10px);opacity:1}80%,100%{transform:translate(var(--dx),-10px);opacity:0}}'
                    ".p1t{position:absolute;transform:translateX(-50%);font:700 20px Silkscreen;color:#ffe08a;text-shadow:2px 2px 0 #a8481c,4px 4px 0 #1a1220;animation:p1t 2.4s steps(8) infinite}@keyframes p1t{0%,20%{opacity:0;transform:translate(-50%,10px)}40%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}")
        if i == 1:
            return ('<div class="p2"><span class="who">MEERA</span><p><span class="tw">found a <b>STRAIGHT</b>! +860 gold</span></p><i>▼</i></div>',
                    ".p2{position:absolute;left:18px;right:18px;top:300px;padding:16px 16px 18px;border:12px solid transparent;border-image:url(img/px-frame.png) 3 fill / 12px;image-rendering:pixelated;animation:p2 3s steps(1) infinite}"
                    ".p2 .who{position:absolute;left:4px;top:-26px;padding:3px 8px;background:#e0a83a;color:#1a1220;font:700 12px Silkscreen;box-shadow:0 0 0 2px #1a1220}"
                    ".p2 p{font:500 17px 'Pixelify Sans';color:#f6efe0;overflow:hidden;white-space:nowrap}.p2 b{color:#ffe08a;font-family:Silkscreen}.p2 .tw{display:inline-block;overflow:hidden;width:0;vertical-align:bottom;animation:tw 3s steps(28) infinite}@keyframes tw{0%,8%{width:0}55%,100%{width:100%}}"
                    ".p2 i{position:absolute;right:6px;bottom:2px;font-style:normal;color:#ffe08a;font-size:12px;animation:blk .5s steps(1) infinite}@keyframes blk{50%{opacity:0}}@keyframes p2{0%,4%{opacity:0}5%,92%{opacity:1}100%{opacity:0}}")
        if i == 2:
            spark = ''.join(f'<i style="left:{x}px;top:{y}px;animation-delay:-{d}s"></i>' for x, y, d in ((60, 200, 0), (320, 240, .3), (90, 520, .6), (300, 560, .9), (190, 160, .45)))
            return (f'<div class="p3bg"></div><div class="p3pil"></div><div class="p3s">{spark}</div><div class="p3t"><small>LEVEL UP!</small><b>ACE<br>FLUSH</b><span>+1,480 GOLD · MEERA</span></div><div class="p3b">{bram("big", 144)}</div>',
                    '.p3bg{position:absolute;inset:0;background:#1a1220;opacity:.85;animation:p3bg 3.4s steps(1) infinite}@keyframes p3bg{0%,4%{opacity:0}5%,92%{opacity:.88}100%{opacity:0}}'
                    '.p3pil{position:absolute;left:50%;top:0;bottom:0;width:120px;margin-left:-60px;background:repeating-linear-gradient(90deg,rgba(255,224,138,.0) 0 8px,rgba(255,224,138,.5) 8px 16px,rgba(255,224,138,.25) 16px 24px);animation:pil 3.4s steps(6) infinite}@keyframes pil{0%,5%{transform:scaleX(0)}20%,90%{transform:scaleX(1)}100%{transform:scaleX(0)}}'
                    '.p3s i{position:absolute;width:12px;height:12px;background:linear-gradient(#ffe08a,#ffe08a) 50% 0/4px 100% no-repeat,linear-gradient(#ffe08a,#ffe08a) 0 50%/100% 4px no-repeat;animation:spk .9s steps(3) infinite}@keyframes spk{0%{transform:scale(0)}50%{transform:scale(1)}100%{transform:scale(0)}}'
                    ".p3t{position:absolute;left:0;right:0;top:250px;text-align:center;animation:p3t 3.4s steps(6) infinite}.p3t small{font:700 14px Silkscreen;color:#5a9a5a;text-shadow:2px 2px 0 #1a1220}.p3t b{display:block;font:700 56px/1 Silkscreen;color:#ffe08a;text-shadow:4px 4px 0 #a8481c,8px 8px 0 #1a1220;margin:10px 0}.p3t span{font:400 13px Silkscreen;color:#f6efe0}"
                    '@keyframes p3t{0%,10%{transform:translateY(-40px);opacity:0}24%,90%{transform:none;opacity:1}100%{opacity:0}}.p3b{position:absolute;left:50%;top:470px;margin-left:-72px;animation:p3t 3.4s steps(4) infinite}')
        if i == 3:
            return ('<div class="p4bg"></div><div class="p4ray"></div><div class="p4c"><img src="img/px-chest.png" alt=""></div><div class="p4t"><small>★ LEGENDARY ★</small><b>ROYAL<br>FLUSH</b><div class="item"><span>10♥ J♥ Q♥ K♥ A♥</span><em>Trophy · held by Meera</em></div></div>',
                    '.p4bg{position:absolute;inset:0;background:#1a1220;animation:p4bg 5s steps(1) infinite}@keyframes p4bg{0%,3%{opacity:0}4%,94%{opacity:.95}100%{opacity:0}}'
                    '.p4ray{position:absolute;left:50%;top:330px;width:900px;height:900px;margin:-450px 0 0 -450px;background:repeating-conic-gradient(#c2303a 0 10deg,#e0a83a 0 20deg,#5a9a5a 0 30deg,#3a5aa8 0 40deg,#9a5aa8 0 50deg,transparent 0 60deg);opacity:.45;-webkit-mask:radial-gradient(circle,#000 20%,transparent 60%);mask:radial-gradient(circle,#000 20%,transparent 60%);animation:p4r 4s steps(24) infinite}@keyframes p4r{to{transform:rotate(60deg)}}'
                    '.p4c{position:absolute;left:50%;top:270px;margin-left:-72px;width:144px;animation:p4c 5s steps(3) infinite}.p4c img{width:144px;image-rendering:pixelated;display:block}@keyframes p4c{0%,10%{transform:translateY(-200px)}20%{transform:translateY(0)}24%{transform:translateY(-12px)}28%,100%{transform:none}}'
                    ".p4t{position:absolute;left:0;right:0;top:430px;text-align:center;animation:p4t 5s steps(1) infinite}@keyframes p4t{0%,30%{opacity:0}31%,94%{opacity:1}100%{opacity:0}}.p4t small{font:700 13px Silkscreen;color:#e0a83a;animation:blk .4s steps(1) infinite}@keyframes blk{50%{opacity:.4}}"
                    ".p4t b{display:block;font:700 52px/1 Silkscreen;color:#ffe08a;text-shadow:4px 4px 0 #c2303a,8px 8px 0 #1a1220;margin:10px 0}.p4t .item{display:inline-grid;gap:4px;padding:10px 14px;border:10px solid transparent;border-image:url(img/px-frame.png) 3 fill / 10px;image-rendering:pixelated}"
                    ".p4t .item span{font:700 14px Silkscreen;color:#ff9a8a}.p4t .item em{font:500 13px 'Pixelify Sans';font-style:normal;color:#f6efe0}")
        return ('<div class="p5bg"></div><div class="p5h"><img src="img/px-heart.png" alt=""><img src="img/px-heart.png" alt=""><img src="img/px-heart.png" alt=""></div><div class="p5t"><b>GAME OVER</b><small>ARJUN · 9TH OF 13</small><p>CONTINUE? <em>9</em></p><div><span>REBUY ×1</span><span>WATCH</span></div></div>',
                '.p5bg{position:absolute;inset:0;background:rgba(26,18,32,.85);animation:p5 3.4s steps(1) infinite}@keyframes p5{0%,4%{opacity:0}5%,94%{opacity:1}100%{opacity:0}}'
                '.p5h{position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center;gap:10px;animation:p5 3.4s steps(1) infinite}.p5h img{width:36px;image-rendering:pixelated}.p5h img:nth-child(3){animation:lose 3.4s steps(1) infinite}.p5h img:nth-child(2){animation:lose 3.4s steps(1) infinite .3s}.p5h img:nth-child(1){animation:lose 3.4s steps(1) infinite .6s}'
                '@keyframes lose{0%,20%{filter:none}24%,100%{filter:grayscale(1) brightness(.4)}}'
                ".p5t{position:absolute;left:0;right:0;top:320px;text-align:center;animation:p5 3.4s steps(1) infinite}.p5t b{display:block;font:700 46px Silkscreen;color:#c2303a;text-shadow:4px 4px 0 #1a1220}.p5t small{font:400 12px Silkscreen;color:#b8a68e}"
                ".p5t p{font:700 18px Silkscreen;color:#f6efe0;margin-top:22px}.p5t em{font-style:normal;color:#ffe08a;animation:blk .5s steps(1) infinite}@keyframes blk{50%{opacity:.3}}"
                ".p5t div{display:flex;gap:12px;justify-content:center;margin-top:14px}.p5t span{font:700 13px Silkscreen;padding:12px 14px;background:#4f4558;color:#f6efe0;box-shadow:0 0 0 2px #1a1220,inset 3px 3px 0 #6a5f73}.p5t span:first-child{background:#e0a83a;color:#1a1220;box-shadow:0 0 0 2px #1a1220,inset 3px 3px 0 #ffe08a}")

TH = Pixel()
if __name__ == '__main__':
    for f in build_all(TH): print(f)
