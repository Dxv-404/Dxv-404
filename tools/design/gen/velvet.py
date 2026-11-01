from builders import *

CREST = ('<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#4a0f1c" stroke="#e6c995" stroke-width="1.2"/><circle cx="32" cy="32" r="26" fill="none" stroke="#e6c995" stroke-width=".5" stroke-dasharray="1.5 2"/>'
         '<path d="M32 12 C26 22 20 26 22 34 C24 42 40 42 42 34 C44 26 38 22 32 12Z" fill="none" stroke="#e6c995" stroke-width="1.2"/><text x="32" y="44" text-anchor="middle" font-family="Bodoni Moda" font-style="italic" font-size="18" fill="#f6e9dc">V</text></svg>')

class Velvet(Theme):
    key = 'velvet'; name = 'Velvet'
    deck_note = 'Blush-cream stock with Bodoni Moda numerals and a hairline champagne frame. Suits in claret, sapphire and bottle green. The back is tufted oxblood velvet: a diamond quilt with a champagne button at every crossing.'
    def chips(self):
        return casino_chip('ch-a', '#4a0f1c', '#e6c995', '#4a0f1c', '#e6c995') + casino_chip('ch-b', '#f6e9dc', '#9a1b2e', '#f6e9dc', '#e6c995')
    def back_symbol(self):
        q = ''.join(f'<path d="M{x} 0 L{x+70} 70 M{x} 0 L{x-70} 70" stroke="rgba(0,0,0,.35)" stroke-width="1.1"/><path d="M{x+.6} 0 L{x+70.6} 70 M{x+.6} 0 L{x-69.4} 70" stroke="rgba(255,190,190,.10)" stroke-width=".5"/>' for x in range(-70, 121, 10))
        btn = ''.join(f'<circle cx="{x}" cy="{y}" r="1.1" fill="#e6c995"/><circle cx="{x-.3}" cy="{y-.3}" r=".4" fill="#fff6e0"/>' for y in range(5, 70, 10) for x in range(5 if (y // 10) % 2 == 0 else 0, 51, 10))
        return (f'<symbol id="cb" viewBox="0 0 50 70"><clipPath id="vbc"><rect x="4" y="4" width="42" height="62" rx="2"/></clipPath><g clip-path="url(#vbc)"><rect width="50" height="70" fill="url(#vsheen)"/>{q}{btn}</g>'
                '<rect x="4" y="4" width="42" height="62" rx="2" fill="none" stroke="#e6c995" stroke-width=".6"/><circle cx="25" cy="35" r="7" fill="#2a0710" stroke="#e6c995" stroke-width=".6"/>'
                '<text x="25" y="38.4" text-anchor="middle" font-family="Bodoni Moda" font-style="italic" font-size="9" fill="#e6c995">V</text></symbol>'
                '<radialGradient id="vsheen" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#7a2234"/><stop offset=".6" stop-color="#4a0f1c"/><stop offset="1" stop-color="#2a0710"/></radialGradient>')
    def faces(self):
        def f(l, art, w): return (f'<symbol id="f{l}" viewBox="0 0 60 80"><rect x="6" y="6" width="48" height="66" rx="2" fill="none" stroke="#cfa96a" stroke-width=".7"/><rect x="8.5" y="8.5" width="43" height="61" rx="1" fill="none" stroke="#cfa96a" stroke-width=".3"/>'
                                  f'{art}<text x="30" y="66" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="4.6" letter-spacing="1.6" fill="#8a6a60">{w}</text></symbol>')
        return (f('K', '<path d="M18 36 L20 20 L26 28 L30 16 L34 28 L40 20 L42 36Z" fill="currentColor"/><rect x="18" y="38" width="24" height="2.6" fill="currentColor"/><text x="30" y="58" text-anchor="middle" font-family="Bodoni Moda" font-style="italic" font-size="15" fill="currentColor">Roi</text>', 'KING')
                + f('Q', '<path d="M30 14 C24 22 21 25 22 32 C23 40 37 40 38 32 C39 25 36 22 30 14Z" fill="currentColor"/><path d="M30 39 L30 46 M26 43 Q30 40 34 43" stroke="currentColor" stroke-width="1.2" fill="none"/><text x="30" y="58" text-anchor="middle" font-family="Bodoni Moda" font-style="italic" font-size="13" fill="currentColor">Reine</text>', 'QUEEN')
                + f('J', '<path d="M22 44 L38 18 M36 16 L41 21 M24 40 L19 46" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><text x="30" y="58" text-anchor="middle" font-family="Bodoni Moda" font-style="italic" font-size="13" fill="currentColor">Valet</text>', 'JACK'))
    def avatar(self, p, ctx): return f'<span class="cam h{p["hue"]}{" photo" if p.get("photo") else ""}">{p["i"][0]}</span>'
    whisper = '<div class="whisper"><small>Riya</small>raises to 120</div>'
    def bg(self, kind): return '<div class="lamp"></div>'
    def felt_deco(self, kind):
        return ('<div class="deco"><svg viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">'
                '<path d="M100 104 c-6 -4 -10 -2 -10 2 c0 4 6 4 10 0 c4 4 10 4 10 0 c0 -4 -4 -6 -10 -2Z" fill="none" stroke="rgba(230,201,149,.35)" stroke-width=".5"/></svg></div>')
    def logo(self, ctx): return f'<div class="lg">{CREST}Train Poker<small>Velvet room</small></div>'
    def tier(self, i):
        if i == 1:
            return ('<div class="v2"><i></i><small>Meera made a</small><b>Straight</b><span>eight to queen · +860</span></div>',
                    ".v2{position:absolute;left:28px;right:28px;top:258px;padding:18px 16px 16px;text-align:center;border-radius:20px;background:linear-gradient(180deg,#2a0b13,#1a080d);box-shadow:inset 0 0 0 1px rgba(230,201,149,.5),0 24px 50px rgba(0,0,0,.55);overflow:hidden;animation:v2 2.8s cubic-bezier(.2,1.1,.3,1) infinite}"
                    ".v2 i{position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,228,180,.22) 48%,transparent 62%);animation:v2i 2.8s ease infinite}@keyframes v2i{0%,20%{transform:translateX(-110%)}60%,100%{transform:translateX(110%)}}"
                    ".v2 small{font:700 9.5px 'Manrope';letter-spacing:.3em;text-transform:uppercase;color:#b49284}.v2 b{display:block;font:italic 500 46px/1.05 'Bodoni Moda';color:#f6e9dc;margin:4px 0}.v2 span{font:600 13px 'Manrope';color:#e6c995}"
                    "@keyframes v2{0%{transform:translateY(-24px) scale(.96);opacity:0}16%,84%{transform:none;opacity:1}100%{transform:translateY(12px);opacity:0}}")
        if i == 2:
            cards = ''.join(card(c, 62, 'v3c').replace('style="', f'style="--k:{k};', 1) for k, c in enumerate(['Ah', 'Jh', '8h', '5h', '2h']))
            return (f'<div class="v3bg"></div><div class="v3sp"></div><div class="v3"><small>Ace-high flush, all hearts</small><b>Flush</b><div class="fan">{cards}</div><span>Meera takes <em>1,480</em></span></div>',
                    '.v3bg{position:absolute;inset:0;background:radial-gradient(70% 50% at 50% 42%,rgba(74,15,28,.85),rgba(18,4,8,.96));animation:v3bg 3.6s ease infinite}@keyframes v3bg{0%{opacity:0}8%,90%{opacity:1}100%{opacity:0}}'
                    '.v3sp{position:absolute;left:50%;top:-60px;width:360px;height:640px;margin-left:-180px;background:conic-gradient(from 160deg at 50% 0,transparent,rgba(255,228,190,.2) 16deg,transparent 40deg);animation:v3bg 3.6s ease infinite}'
                    ".v3{position:absolute;left:0;right:0;top:250px;text-align:center;animation:v3 3.6s ease infinite}@keyframes v3{0%,10%{opacity:0;transform:translateY(16px)}24%,90%{opacity:1;transform:none}100%{opacity:0}}"
                    ".v3 small{font:700 10px 'Manrope';letter-spacing:.32em;text-transform:uppercase;color:#e6c995}.v3 b{display:block;font:italic 500 60px/1.05 'Bodoni Moda';color:#f6e9dc;margin:8px 0 22px}"
                    ".v3 .fan{display:flex;justify-content:center;height:110px}.v3c{margin:0 -9px;transform-origin:50% 140%;animation:v3c 3.6s cubic-bezier(.3,1.3,.4,1) infinite}@keyframes v3c{0%,22%{transform:translateY(60px) rotate(0);opacity:0}36%,90%{transform:rotate(calc((var(--k) - 2)*9deg));opacity:1}100%{opacity:0}}"
                    ".v3 span{font:600 15px 'Manrope';color:#b49284}.v3 em{font:italic 500 24px 'Bodoni Moda';color:#e6c995;font-style:italic}")
        if i == 4:
            return ('<div class="v5"><small>A note from the room</small><b>Arjun has left the table</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy 1,000</em><em>Watch</em></div></div>',
                    ".v5{position:absolute;left:20px;right:20px;bottom:196px;padding:20px 18px 16px;border-radius:20px;background:#22090f;box-shadow:inset 0 0 0 1px rgba(230,201,149,.4),0 20px 40px rgba(0,0,0,.5);animation:v5 3s cubic-bezier(.2,1.2,.4,1) infinite}"
                    ".v5 small{font:700 9.5px 'Manrope';letter-spacing:.28em;text-transform:uppercase;color:#b49284}.v5 b{display:block;font:italic 500 26px 'Bodoni Moda';color:#f6e9dc;margin:4px 0}.v5 span{font:600 13px 'Manrope';color:#b49284}"
                    ".v5 div{display:flex;gap:8px;margin-top:12px}.v5 em{flex:1;text-align:center;font:700 13.5px 'Manrope';font-style:normal;padding:11px;border-radius:24px;box-shadow:inset 0 0 0 1px rgba(246,233,220,.3);color:#f6e9dc}.v5 em:first-child{background:linear-gradient(180deg,#f0d9ad,#cfa96a);color:#2a0a12;box-shadow:none}"
                    "@keyframes v5{0%,10%{transform:translateY(30px);opacity:0}24%,92%{transform:none;opacity:1}100%{opacity:0}}")
        return ('', '')

TH = Velvet()
if __name__ == '__main__':
    for f in build_all(TH, dealer=False): print(f)
