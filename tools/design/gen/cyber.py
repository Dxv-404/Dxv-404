from builders import *
from avatars import bust
from vex import vex, VEX_CSS

STAR = 'M0 -10 C1 -2 2 -1 10 0 C2 1 1 2 0 10 C-1 2 -2 1 -10 0 C-2 -1 -1 -2 0 -10Z'
AV = dict(ol='#1a0f22', olw=1.4, skin=None, hair=['#2a1d3a', '#1d1428', '#3b2a1a', '#121018', '#40263f', '#1d1428'],
          shirt=['#3a2a55', '#ff2e88', '#e9e0f7', '#2a1d3a', '#5b3a7a', '#7df9ff'], eyes='anime', iris='#ff4f9a', shade=True, streak='#ff2e88', collar='#0f0a14', cheek='rgba(255,122,179,.35)', accc='#ff2e88')

class Cyber(Theme):
    key = 'cyber'; name = 'Cyber'; dealer_name = 'VEX'
    bubble = '<small>VEX // DEALER</small>Riya raised. Your move, Dev.'
    deck_note = 'Pearl-white faces with clipped corners and Chakra Petch indices; magenta hearts, violet diamonds, teal clubs. Courts are angular emblems instead of portraits. The back is the reference look: deep plum, a magenta four-point star, slash marks and a dot grid.'
    dealer_title = 'Vex, your dealer'
    dealer_note = 'A croupier on the late shift: rolled sleeves, black vest and tie, fingerless gloves, magenta streaks. Deadpan, a little bored, secretly impressed by good play. Every reaction has a line, and her eyes and hands change, not just the caption.'
    def chips(self):
        mark = f'<path d="{STAR}" transform="translate(12 12) scale(.32)" fill="#fff"/>'
        return casino_chip('ch-a', '#2a1435', '#ff2e88', '#1b0f24', '#ff2e88', mark) + casino_chip('ch-b', '#f1e9ff', '#6d38ff', '#f1e9ff', '#6d38ff', mark.replace('#fff', '#ff2e88'))
    def back_symbol(self):
        dots = ''.join(f'<circle cx="{x}" cy="{y}" r=".45" fill="#ff2e88" opacity=".6"/>' for x in range(8, 20, 3) for y in range(8, 16, 3)) + ''.join(f'<circle cx="{x}" cy="{y}" r=".45" fill="#ff2e88" opacity=".6"/>' for x in range(31, 43, 3) for y in range(55, 63, 3))
        return (f'<symbol id="cb" viewBox="0 0 50 70"><rect x="3" y="3" width="44" height="64" fill="none" stroke="#ff2e88" stroke-width=".8"/>{dots}'
                '<path d="M36 6 L44 6 L44 14Z M34 8 L42 18 M38 8 L44 16" stroke="#ff2e88" stroke-width="1.4" fill="none"/><path d="M6 56 L6 64 L14 64Z M8 52 L18 62 M6 58 L12 64" stroke="#ff2e88" stroke-width="1.4" fill="none"/>'
                f'<path d="{STAR}" transform="translate(25 35) scale(1.1)" fill="#ff2e88"/><path d="M14 35 L19 35 M31 35 L36 35" stroke="#ff2e88" stroke-width=".5"/></symbol>')
    def faces(self):
        def f(l, art): return f'<symbol id="f{l}" viewBox="0 0 60 80"><path d="M10 6 L50 6 L54 10 L54 70 L50 74 L10 74 L6 70 L6 10Z" fill="none" stroke="currentColor" stroke-width=".8"/>{art}<text x="30" y="68" text-anchor="middle" font-family="Share Tech Mono" font-size="6" fill="currentColor" letter-spacing="1.5">{ {"K":"KING//01","Q":"QUEEN//02","J":"JACK//03"}[l]}</text></symbol>'
        return (f('K', '<path d="M14 44 L18 20 L26 32 L30 14 L34 32 L42 20 L46 44Z" fill="currentColor"/><rect x="14" y="47" width="32" height="4" fill="currentColor"/><path d="M30 22 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4Z" fill="#fff"/>')
                + f('Q', '<path d="M12 36 L30 22 L48 36 L30 50Z" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="30" cy="36" r="6" fill="currentColor"/><circle cx="32" cy="34" r="1.6" fill="#fff"/><path d="M8 36 L14 36 M46 36 L52 36" stroke="currentColor" stroke-width="1.4"/>')
                + f('J', '<path d="M40 14 L22 50 L18 48 L36 12Z" fill="currentColor"/><path d="M16 46 L26 52 M20 52 L16 58" stroke="currentColor" stroke-width="3"/><path d="M38 16 L44 20" stroke="currentColor" stroke-width="1"/>'))
    def avatar(self, p, ctx):
        if p.get('photo'):
            return '<span class="id" style="background:linear-gradient(160deg,#c94f8a,#3b1d52)"><svg viewBox="0 0 100 100"><circle cx="50" cy="44" r="18" fill="#e9b89a"/><path d="M31 42 Q30 20 50 19 Q71 20 69 44 Q64 30 52 31 Q40 33 31 42Z" fill="#1d1428"/><path d="M14 104 Q18 74 50 68 Q82 74 86 104Z" fill="#120a18"/></svg></span>'
        return f'<span class="id"><svg viewBox="16 10 68 68">{bust(p, AV)}</svg></span>'
    def dealer(self, pose='idle', ctx='phone'): return f'<svg class="dv" viewBox="44 26 112 112" aria-hidden="true">{vex(pose)}</svg>'
    def bg(self, kind):
        return ('<div class="slats"></div><span class="hud" style="left:14px;bottom:8px">TBL//QK7P · SECTOR 7 · 23:48</span>' if kind in ('phone', 'lap') else '<div class="slats"></div>')
    def rail_deco(self, kind):
        pos = [(30, 0), (70, 0), (30, 100), (70, 100), (0, 30), (0, 70), (100, 30), (100, 70)]
        out = ''
        for k, (x, y) in enumerate(pos):
            rot = 90 if x in (0, 100) else 0
            if x in (0, 100): rot = 72 if (x == 0) == (y < 50) else -72
            out += f'<span class="led" style="left:calc({x}% - 15px);top:calc({y}% - 2px);transform:translate({ "7px" if x == 0 else "-7px" if x == 100 else "0"},{ "6px" if y == 0 else "-6px" if y == 100 else "0"}) rotate({rot}deg);animation-delay:{-k*.45:.2f}s"></span>'
        return out
    def felt_deco(self, kind):
        return ('<div class="deco"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true"><path d="M30 18 L70 18 L78 26 M170 18 L130 18 L122 26 M30 102 L70 102 L78 94 M170 102 L130 102 L122 94" fill="none" stroke="rgba(255,46,136,.35)" stroke-width=".5"/>'
                '<path d="M60 60 L88 60 M112 60 L140 60" stroke="rgba(255,46,136,.3)" stroke-width=".4"/></svg>'
                f'<svg viewBox="0 0 100 100" style="position:absolute;left:50%;top:76%;width:44px;height:44px;margin:-22px 0 0 -22px" aria-hidden="true"><path class="star" d="{STAR}" transform="translate(50 50) scale(4)" fill="rgba(255,46,136,.45)"/></svg></div>')
    def logo(self, ctx):
        return f'<div class="lg"><svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="{STAR}" fill="#ff2e88"/></svg>Train <br>Poker<em>// CYBER</em></div>'
    def loading_extra(self):
        return '<span class="hud" style="left:20px;top:20px">BOOT//TP-OS 4.2</span><span class="hud" style="right:20px;top:20px">SECURE LINK · LOCAL</span>'
    def board_css(self, kind): return VEX_CSS
    def poses(self):
        P_ = [('Bored', 'Default between actions. Slow blink, hand on cheek.', 'idle', 'Wake me when someone raises.'),
              ('Shuffle', 'Riffle between hands and on the loading screen.', 'shuffle', 'Cut. Shuffle. Keep up.'),
              ('Deal', 'Flicks each card with a wink and a magenta trail.', 'deal', 'Card\'s yours. Don\'t drop it.'),
              ('Your turn', 'Points straight at you; your phone buzzes once.', 'turn', 'Clock\'s running, Dev.'),
              ('Big hand', 'Tier 3 and up. Stands, star eyes, glitch lines.', 'big', '…okay, that\'s actually insane.'),
              ('Ship it', 'Pot pushed. Flips a chip, almost smiles.', 'ship', 'Fine. Take your chips.')]
        return [(t, d, f'<svg viewBox="0 0 200 200" role="img" aria-label="Vex, {t}">{vex(p)}</svg>', q) for t, d, p, q in P_]
    def tier(self, i):
        sx, sy = seat_xy(3)
        if i == 0:
            return (f'<div class="y1" style="left:{sx+36}px;top:{sy-46}px"><span>+640</span><small>POT WON · NO SHOWDOWN</small></div><div class="y1s" style="left:{sx-34}px;top:{sy-34}px"></div>',
                    ".y1{position:absolute;padding:6px 10px;background:rgba(12,6,16,.92);box-shadow:inset 0 0 0 1px #ff2e88;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);animation:y1 2.6s steps(1) infinite}"
                    ".y1 span{display:block;font:400 22px 'Share Tech Mono';color:#fff}.y1 small{font:700 8px 'Chakra Petch';letter-spacing:.16em;color:#ff7ab3}"
                    "@keyframes y1{0%,8%{opacity:0}10%{opacity:1}12%{opacity:.2}14%,82%{opacity:1}100%{opacity:0}}"
                    ".y1s{position:absolute;width:68px;height:68px;background:linear-gradient(transparent 45%,rgba(255,46,136,.6) 50%,transparent 55%) 0 0/100% 200%;animation:y1s 2.6s linear infinite;clip-path:polygon(22% 0,100% 0,100% 78%,78% 100%,0 100%,0 22%)}@keyframes y1s{0%,10%{background-position:0 100%}40%,100%{background-position:0 -100%}}")
        if i == 1:
            return ('<div class="y2"><small>// HAND CLASS 05</small><b>STRAIGHT</b><span>8 · 9 · 10 · J · Q   MEERA +860</span><i></i></div>',
                    ".y2{position:absolute;left:-10px;right:24px;top:262px;padding:12px 20px 14px 34px;background:linear-gradient(90deg,#ff2e88,#c21b6a);clip-path:polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%);color:#fff;animation:y2 2.6s cubic-bezier(.2,1,.3,1) infinite}"
                    ".y2 small{font:400 10px 'Share Tech Mono';letter-spacing:.2em;opacity:.8}.y2 b{display:block;font:700 40px/1 'Chakra Petch';letter-spacing:.14em;margin:2px 0 4px}.y2 span{font:400 12px 'Share Tech Mono';white-space:pre}"
                    ".y2 i{position:absolute;left:34px;bottom:6px;height:2px;background:#fff;animation:y2i 2.6s linear infinite}@keyframes y2i{0%,15%{width:0}70%,100%{width:60%}}"
                    "@keyframes y2{0%{transform:translateX(-110%)}14%{transform:translateX(0)}84%{transform:translateX(0);opacity:1}100%{transform:translateX(30px);opacity:0}}")
        if i == 2:
            return (f'<div class="y3bg"></div><div class="y3sl"></div><div class="y3c"><svg viewBox="40 24 120 140" aria-hidden="true">{vex("big", False)}</svg></div>'
                    '<div class="y3t"><small>// HAND CLASS 06 · ACE-HIGH FLUSH, ALL HEARTS</small><b>ACE<br>FLUSH</b><span>MEERA +1,480</span></div><p class="y3q">"…okay, that\'s actually insane."</p>',
                    '.y3bg{position:absolute;inset:0;background:rgba(10,5,14,.86);animation:y3bg 3.4s ease infinite}@keyframes y3bg{0%{opacity:0}8%,88%{opacity:1}100%{opacity:0}}'
                    '.y3sl{position:absolute;left:-40%;right:-40%;top:300px;height:16px;background:#ff2e88;transform:rotate(-24deg);box-shadow:0 0 30px #ff2e88;animation:y3sl 3.4s cubic-bezier(.6,0,.2,1) infinite}@keyframes y3sl{0%{transform:rotate(-24deg) scaleX(0)}10%{transform:rotate(-24deg) scaleX(1);opacity:1}30%,100%{transform:rotate(-24deg) scaleX(1);opacity:0}}'
                    '.y3c{position:absolute;right:-6px;top:80px;width:250px;height:290px;background:linear-gradient(160deg,#3a1d48,#1b0f24);clip-path:polygon(18% 0,100% 0,100% 100%,0 100%,0 14%);box-shadow:inset 0 0 0 2px #ff2e88;animation:y3c 3.4s cubic-bezier(.2,1.2,.3,1) infinite}.y3c svg{width:100%;height:100%}'
                    '@keyframes y3c{0%,12%{transform:translateX(120%)}26%,86%{transform:none}100%{transform:translateX(120%)}}'
                    ".y3t{position:absolute;left:22px;top:380px;color:#fff;animation:y3t 3.4s steps(1) infinite}.y3t small{font:400 10px 'Share Tech Mono';letter-spacing:.14em;color:#ff7ab3}.y3t b{display:block;font:700 66px/.9 'Chakra Petch';letter-spacing:.06em;margin:8px 0;text-shadow:3px 0 0 #ff2e88}.y3t span{font:400 16px 'Share Tech Mono'}"
                    "@keyframes y3t{0%,20%{opacity:0}22%{opacity:1;transform:translateX(-4px)}24%{transform:none}25%{opacity:.4}27%,88%{opacity:1}100%{opacity:0}}.y3q{position:absolute;left:22px;top:600px;font:500 13px 'Chakra Petch';color:#d9cbe9;animation:y3t 3.4s steps(1) infinite}")
        if i == 3:
            ring = lambda r, d, s: f'<circle cx="195" cy="330" r="{r}" fill="none" stroke="#ff2e88" stroke-width="{s}" stroke-dasharray="{d}" opacity=".7"/>'
            return (f'<div class="y4bg"></div><svg class="y4r" viewBox="0 0 390 844" aria-hidden="true"><g class="a">{ring(120, "6 10", 1.2)}</g><g class="b">{ring(150, "60 20 4 20", 2)}</g><g class="a">{ring(176, "2 6", 1)}</g>'
                    f'<path class="st" d="{STAR}" transform="translate(195 330) scale(8)" fill="#ff2e88"/></svg>'
                    '<div class="y4t"><small>SYSTEM // LEGENDARY HAND</small><b>ROYAL<br>FLUSH</b><span>MEERA · TROPHY UNLOCKED · 1 OF 1 THIS SEASON</span></div>',
                    '.y4bg{position:absolute;inset:0;background:radial-gradient(50% 30% at 50% 39%,rgba(255,46,136,.35),#07030a 70%);animation:y3bg 5s ease infinite}@keyframes y3bg{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}'
                    '.y4r{position:absolute;inset:0;width:100%;height:100%}.y4r .a{transform-origin:195px 330px;animation:spin 8s linear infinite}.y4r .b{transform-origin:195px 330px;animation:spin 12s linear infinite reverse}@keyframes spin{to{transform:rotate(360deg)}}'
                    '.y4r .st{transform-box:fill-box;transform-origin:center;animation:y4s 5s cubic-bezier(.2,1.4,.3,1) infinite;filter:drop-shadow(0 0 20px #ff2e88)}@keyframes y4s{0%,8%{transform:translate(195px,330px) scale(0) rotate(-90deg)}30%,88%{transform:translate(195px,330px) scale(8) rotate(0)}100%{transform:translate(195px,330px) scale(0)}}'
                    ".y4t{position:absolute;left:0;right:0;top:530px;text-align:center;color:#fff;animation:y4t 5s ease infinite}.y4t small{font:400 11px 'Share Tech Mono';letter-spacing:.24em;color:#ff7ab3}.y4t b{display:block;font:700 64px/.92 'Chakra Petch';letter-spacing:.1em;margin:10px 0}.y4t span{font:400 11px 'Share Tech Mono';letter-spacing:.1em;color:#d9cbe9}"
                    "@keyframes y4t{0%,26%{opacity:0;letter-spacing:.6em}40%,88%{opacity:1}100%{opacity:0}}")
        bx, by = seat_xy(4)
        return ('<div class="y5"><svg viewBox="0 0 360 60" aria-hidden="true"><path d="M0 30 L120 30 L132 30 L140 6 L150 54 L160 18 L168 36 L176 30 L360 30" fill="none" stroke="#ff2e88" stroke-width="2.4"/></svg>'
                '<small>SEAT 05 // SIGNAL LOST</small><b>ARJUN · FLATLINED</b><span>9th of 13 · 1 rebuy left</span><div><em>REBUY 1,000</em><em>SPECTATE</em></div></div>',
                ".y5{position:absolute;left:16px;right:16px;bottom:194px;padding:14px 16px;background:rgba(12,6,16,.95);box-shadow:inset 0 0 0 1px #ff2e88;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);animation:y5 3.2s ease infinite;color:#fff}"
                ".y5 svg{width:100%;height:40px;display:block}.y5 path{stroke-dasharray:420;animation:ekg 3.2s linear infinite}@keyframes ekg{0%{stroke-dashoffset:420}60%,100%{stroke-dashoffset:0}}"
                ".y5 small{font:400 10px 'Share Tech Mono';letter-spacing:.18em;color:#ff7ab3}.y5 b{display:block;font:700 22px 'Chakra Petch';letter-spacing:.08em;margin:2px 0}.y5 span{font:400 12px 'Share Tech Mono';color:#9d8bb4}"
                ".y5 div{display:flex;gap:8px;margin-top:10px}.y5 em{flex:1;text-align:center;font:700 12px 'Chakra Petch';letter-spacing:.14em;font-style:normal;padding:10px;background:#22152c;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}.y5 em:first-child{background:#ff2e88}"
                "@keyframes y5{0%,6%{opacity:0;transform:translateY(20px)}16%,92%{opacity:1;transform:none}100%{opacity:0}}")

TH = Cyber()
if __name__ == '__main__':
    for f in build_all(TH): print(f)
