import json, os, sys
OUT = os.path.join(os.path.dirname(__file__), '..', 'tp2', 'project')
ROWS = [('classic', 'Classic'), ('noir', 'Noir'), ('ivory', 'Ivory'), ('velvet', 'Velvet'), ('cyber', 'Cyber'), ('ink', 'Ink'), ('pixel', 'Pixel'), ('train', 'Night Train'), ('edo', 'Edo')]
KINDS = [('loading', 0, 390, 844, 'Loading'), ('menu', 470, 390, 844, 'Main menu'), ('phone', 940, 390, 844, 'Phone · 10 players'),
         ('laptop', 1410, 1440, 900, 'Laptop · 15 players'), ('tiers', 2930, 2150, 1120, 'Win animations by tier'), ('presence', 5160, 1730, 1120, 'Leaving and coming back'), ('motion', 6970, 2150, 1330, 'Micro-animations'), ('sizes', 9200, 1990, 1100, 'Theme picker: every screen'), ('cards', 11270, 1200, 960, 'Deck'), ('dealer', 12550, 1100, 960, 'Dealer')]
SYS = [('Main.dc.html', 0, 1440, 960, 'Nine themes + settings'), ('sys-crowd.dc.html', 1520, 2260, 1200, 'Crowded tables: 6, 10, 15 players'),
       ('sys-odds.dc.html', 3860, 1460, 1200, 'All-in odds at any size'), ('sys-presence.dc.html', 5400, 1780, 1200, 'Dropping out and coming back: the rules'), ('sys-motion.dc.html', 7260, 2240, 1440, 'Micro-animations: the rules'), ('sys-lab.dc.html', 9580, 2240, 820, 'Layout lab results')]
LAB_Y = 1700 + 700
def build():
    boards, order, notes = {}, [], {'top': dict(x=0, y=-280, text='Shared rules for every theme', kind='title1', maxW=13700)}
    for f, x, w, h, t in SYS:
        if os.path.exists(f'{OUT}/{f}'): boards[f] = dict(x=x, y=0, w=w, h=h, title=t); order.append(f)
    import re as _re
    notes['lab'] = dict(x=0, y=1900 - 270, text="Layout lab: Classic on every screen, 2 to 15 players", kind='title1', maxW=13700)
    x = 0
    from responsive import DEVICES
    for name, W, H in DEVICES:
        f = f'lab-classic-{W}x{H}.dc.html'
        if os.path.exists(f'{OUT}/{f}'):
            t = open(f'{OUT}/{f}').read(); w, h = map(int, _re.search(r'"width":(\d+),"height":(\d+)', t).groups())
            boards[f] = dict(x=x, y=1900, w=w, h=h, title=f'Layout lab · {name} {W}×{H}'); order.append(f); x += w + 80
    for r, (k, nm) in enumerate(ROWS):
        y = 2950 + r * 1700; added = False
        for kind, x, w, h, t in KINDS:
            f = f'{k}-{kind}.dc.html'
            if os.path.exists(f'{OUT}/{f}'): boards[f] = dict(x=x, y=y, w=w, h=h, title=f'{nm} · {t}'); order.append(f); added = True
        if added: notes[f'r{r}'] = dict(x=0, y=y - 270, text=f'{r + 1}. {nm}', kind='title1', maxW=13700)
    c = {'v': 3, 'createdOnFiles': {'v': 1, 'at': '2026-11-01T03:40:00Z'}, 'title': 'Train Poker Themes v2', 'launch': {'view': 'canvas'}, 'pages': [],
         'boards': boards, 'order': order, 'notes': notes, 'noteOrder': list(notes), 'designSystems': []}
    json.dump(c, open(f'{OUT}/canvas.json', 'w'), indent=1, ensure_ascii=False)
    return order
if __name__ == '__main__':
    print(json.dumps({f'project/{f}': f'project/{f}' for f in build()}))
