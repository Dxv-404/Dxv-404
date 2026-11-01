"""Self-hosted, subset fonts: Latin + every character actually used in the boards. No network at runtime."""
import os, re, glob, html
from fontTools import subset
S = os.path.dirname(os.path.abspath(__file__)) + '/..'
TTF, OUT = S + '/ttf', S + '/tp2/project/fonts'
FONTS = [  # family, file, weight, style
 ('Cormorant Garamond', 'CormorantGaramond', '300 700', 'normal'), ('Cormorant Garamond', 'CormorantGaramond-Italic', '300 700', 'italic'),
 ('Jost', 'Jost', '100 900', 'normal'),
 ('DM Serif Display', 'DMSerifDisplay-Regular', '400', 'normal'), ('DM Serif Display', 'DMSerifDisplay-Italic', '400', 'italic'),
 ('DM Sans', 'DMSans', '100 1000', 'normal'), ('Manrope', 'Manrope', '200 800', 'normal'),
 ('Chakra Petch', 'ChakraPetch-Medium', '500', 'normal'), ('Chakra Petch', 'ChakraPetch-Bold', '700', 'normal'),
 ('Share Tech Mono', 'ShareTechMono-Regular', '400', 'normal'),
 ('Reggae One', 'ReggaeOne-Regular', '400', 'normal'),
 ('M PLUS 1p', 'MPLUS1p-Regular', '400', 'normal'), ('M PLUS 1p', 'MPLUS1p-Bold', '700', 'normal'), ('M PLUS 1p', 'MPLUS1p-ExtraBold', '800', 'normal'),
 ('Silkscreen', 'Silkscreen-Regular', '400', 'normal'), ('Silkscreen', 'Silkscreen-Bold', '700', 'normal'),
 ('Pixelify Sans', 'PixelifySans', '400 700', 'normal'),
 ('Zen Kaku Gothic New', 'ZenKakuGothicNew-Regular', '400', 'normal'), ('Zen Kaku Gothic New', 'ZenKakuGothicNew-Bold', '700', 'normal'), ('Zen Kaku Gothic New', 'ZenKakuGothicNew-Black', '900', 'normal'),
 ('VT323', 'VT323-Regular', '400', 'normal'),
 ('Yuji Syuku', 'YujiSyuku-Regular', '400', 'normal'),
 ('Bodoni Moda', 'BodoniModa', '400 900', 'normal'), ('Bodoni Moda', 'BodoniModa-Italic', '400 900', 'italic'),
 ('Shippori Mincho', 'ShipporiMincho-Regular', '400', 'normal'), ('Shippori Mincho', 'ShipporiMincho-SemiBold', '600', 'normal'), ('Shippori Mincho', 'ShipporiMincho-ExtraBold', '800', 'normal'),
]
def used_text():
    t = ''
    for f in glob.glob(S + '/tp2/project/*.html') + glob.glob(S + '/tp2/project/*.css') + glob.glob(S + '/gen/*.py'):
        t += html.unescape(re.sub(r'<[^>]+>', ' ', open(f).read()))
    return t
def main():
    chars = set(used_text()) | set(chr(c) for c in range(0x20, 0x7f)) | set('–—‘’“”…•·×½¾°₹€£©®™←→↑↓✓✕')
    text = ''.join(sorted(c for c in chars if c.isprintable()))
    css = ["@font-face{font-family:'Fraunces';src:url(fonts/fraunces.woff2) format('woff2');font-weight:100 900;font-display:block}",
           "@font-face{font-family:'Fraunces';src:url(fonts/fraunces-italic.woff2) format('woff2');font-weight:100 900;font-style:italic;font-display:block}"]
    css += [f"@font-face{{font-family:'Figtree';src:url(fonts/figtree-{w}.woff2) format('woff2');font-weight:{w};font-display:block}}" for w in (400, 500, 600, 700)]
    total = 0
    for fam, fn, wt, sty in FONTS:
        o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['*']; o.name_IDs = ['*']; o.notdef_outline = True
        font = subset.load_font(f'{TTF}/{fn}.ttf', o)
        s = subset.Subsetter(o); s.populate(text=text); s.subset(font)
        out = f'{OUT}/{fn.lower()}.woff2'; subset.save_font(font, out, o)
        total += os.path.getsize(out)
        css.append(f"@font-face{{font-family:'{fam}';src:url(fonts/{fn.lower()}.woff2) format('woff2');font-weight:{wt};font-style:{sty};font-display:block}}")
    open(S + '/tp2/project/fonts.css', 'w').write('/* all fonts self-hosted and subset; nothing loads from the network */\n' + '\n'.join(css) + '\n')
    print('fonts ok', len(text), 'chars', total // 1024, 'KB')
if __name__ == '__main__': main()
