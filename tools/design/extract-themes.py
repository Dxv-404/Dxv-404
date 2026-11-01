"""Pulls the locked table design (the 9 themes made in the design phase) into the app.

The design pages were generated from one layout engine (now apps/web/src/table/layout.ts) plus per-theme
art. This keeps the art exactly as signed off: for each theme it takes, from that theme's phone and laptop
pages, the SVG sprite, the background, the rail and felt decoration, the dealer, the pot, the side panel
and the 14 avatar styles, and writes them to apps/web/src/table/themes.json. The CSS, fonts and images are
copied as they are.

    python3 tools/design/extract-themes.py <design project folder>
"""
import json, os, re, shutil, sys

SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'apps', 'web', 'src', 'table', 'themes.json')
PUB = os.path.join(ROOT, 'apps', 'web', 'public', 'tp')
THEMES = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo']
NAMES = {'classic': 'Classic', 'noir': 'Noir', 'ivory': 'Ivory', 'velvet': 'Velvet', 'cyber': 'Cyber', 'ink': 'Ink', 'pixel': 'Pixel', 'train': 'Train', 'edo': 'Edo'}

def balanced(s, start):
    """the element starting at s[start] ('<div ...'), with its matching close tag"""
    tag = re.match(r'<(\w+)', s[start:]).group(1)
    depth, i = 0, start
    pat = re.compile(r'<(/?)' + tag + r'\b[^>]*?(/?)>')
    for m in pat.finditer(s, start):
        if m.group(2): continue
        depth += -1 if m.group(1) else 1
        if depth == 0: return s[start:m.end()]
    raise ValueError('unbalanced ' + tag)

def inner(el):
    return el[el.index('>') + 1: el.rindex('<')]

def first(s, marker):
    i = s.find(marker)
    return balanced(s, i) if i >= 0 else ''

out = {}
for t in THEMES:
    ph = open(os.path.join(SRC, f'{t}-phone.dc.html')).read()
    lap = open(os.path.join(SRC, f'{t}-laptop.dc.html')).read()
    defs = re.search(r'<defs>(.*?)</defs>', ph, re.S).group(1)
    tp = first(ph, '<div class="tp ')
    fx = inner(first(tp, '<div class="fx"'))
    arena = first(tp, '<div class="arena"')
    a_in = inner(arena)
    arena_deco = a_in[:a_in.find('<div class="dealer"')] if '<div class="dealer"' in a_in else a_in[:a_in.find('<div class="table"')]
    dealer = first(a_in, '<div class="dealer"')
    table = first(a_in, '<div class="table"')
    t_in = inner(table)
    rail = t_in[:t_in.find('<div class="felt"')]
    felt = inner(first(t_in, '<div class="felt"'))
    felt_deco = felt[:felt.find('<div class="board"')]
    pot = first(felt, '<div class="pot')
    pot = re.sub(r'<strong>[\d,]+</strong>', '<strong>{POT}</strong>', pot, count=1)
    # avatars: the 14 people of the laptop page, in order
    ltp = first(lap, '<div class="tp ')
    avs = {}
    for m in re.finditer(r'<div class="seat[^"]*" style="[^"]*" data-n="([^"]+)">', ltp):
        seat = balanced(ltp, m.start())
        av = first(seat, '<div class="av"')
        av_in = inner(av)
        av_in = re.sub(r'<span class="(?:hotb|status)[^"]*"[^>]*>.*?</span>', '', av_in)
        avs[m.group(1)] = av_in
    lfx = inner(first(ltp, '<div class="fx"'))
    side = first(ltp, '<aside class="side"')
    l_arena = inner(first(ltp, '<div class="arena"'))
    l_deco = l_arena[:l_arena.find('<div class="dealer"')] if '<div class="dealer"' in l_arena else l_arena[:l_arena.find('<div class="table"')]
    l_table = inner(first(l_arena, '<div class="table"'))
    l_rail = l_table[:l_table.find('<div class="felt"')]
    l_felt = inner(first(l_table, '<div class="felt"'))
    l_felt_deco = l_felt[:l_felt.find('<div class="board"')]
    l_pot = re.sub(r'<strong>[\d,]+</strong>', '<strong>{POT}</strong>', first(l_felt, '<div class="pot'), count=1)
    l_dealer = first(l_arena, '<div class="dealer"')
    out[t] = dict(name=NAMES[t], css=f't-{t}.css', sprite=defs,
                  phone=dict(fx=fx, arena=arena_deco, dealer=dealer, rail=rail, felt=felt_deco, pot=pot),
                  lap=dict(fx=lfx, arena=l_deco, dealer=l_dealer, rail=l_rail, felt=l_felt_deco, pot=l_pot),
                  avatars=list(avs.values()))
    print(t, 'sprite', len(defs), 'avatars', len(avs), 'dealer', bool(dealer))

# the app serves the design's files under /tp/ (the pages lived next to them)
text = json.dumps(out).replace('src=\\"img/', 'src=\\"/tp/img/').replace('url(img/', 'url(/tp/img/')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(text)
os.makedirs(PUB, exist_ok=True)
for f in ['base2.css', 'fonts.css'] + [f't-{t}.css' for t in THEMES]:
    css = open(os.path.join(SRC, f)).read().replace('url(img/', 'url(/tp/img/').replace('url(fonts/', 'url(/tp/fonts/')
    open(os.path.join(PUB, f), 'w').write(css)
for d in ['fonts', 'img']:
    shutil.copytree(os.path.join(SRC, d), os.path.join(PUB, d), dirs_exist_ok=True)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
