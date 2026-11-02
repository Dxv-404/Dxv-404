"""Build the v3 design (crews, devices, raising, rebuys, results, motion) for every theme, and its canvas.

    cd tools/design/gen && TP3_OUT=<project dir> python3 v3run.py [theme ...]
"""
import json, os, re, sys
import run, core
import v3crews, v3crew, v3sizes, v3devices, v3raise, v3rebuys, v3results, v3motion, v3sys

ROWS = [('classic', 'Classic'), ('noir', 'Noir'), ('ivory', 'Ivory'), ('velvet', 'Velvet'), ('cyber', 'Cyber'), ('ink', 'Ink'), ('pixel', 'Pixel'), ('train', 'Night Train'), ('edo', 'Edo')]
KINDS = [('crews', v3crews, 'Crews tab'), ('crew', v3crew, 'Crew page: member and leader'), ('crewsizes', v3sizes, 'Crews on every screen'),
         ('devices', v3devices, 'Your account on every device'), ('raise', v3raise, 'Raising'), ('rebuys', v3rebuys, 'Rebuys'),
         ('results', v3results, 'Who won, and with what'), ('motion3', v3motion, 'Animations')]

def size(f):
    t = open(os.path.join(core.OUT, f)).read()
    return tuple(map(int, re.search(r'"width":(\d+),"height":(\d+)', t).groups()))

def canvas():
    boards, order, notes = {}, [], {}
    f = 'Main.dc.html'; w, h = size(f)
    boards[f] = dict(x=0, y=0, w=w, h=h, title='The map and the rules'); order.append(f)
    notes['top'] = dict(x=0, y=-300, text='Train Poker v3: crews, devices, raising, rebuys and results', kind='title1', maxW=20000)
    y = h + 700
    for r, (k, nm) in enumerate(ROWS):
        x, rowh = 0, 0
        for kind, _, title in KINDS:
            f = f'{k}-{kind}.dc.html'
            if not os.path.exists(os.path.join(core.OUT, f)): continue
            w, h = size(f)
            boards[f] = dict(x=x, y=y, w=w, h=h, title=f'{nm} · {title}'); order.append(f)
            x += w + 140; rowh = max(rowh, h)
        notes[f'r{r}'] = dict(x=0, y=y - 300, text=f'{r + 1}. {nm}', kind='title1', maxW=20000)
        y += rowh + 700
    c = {'v': 3, 'createdOnFiles': {'v': 1, 'at': '2026-11-02T18:00:00Z'}, 'title': 'Train Poker v3: crews, devices, raising, rebuys, results',
         'launch': {'view': 'canvas'}, 'pages': [], 'boards': boards, 'order': order, 'notes': notes, 'noteOrder': list(notes), 'designSystems': []}
    json.dump(c, open(os.path.join(core.OUT, 'canvas.json'), 'w'), indent=1, ensure_ascii=False)
    return order

if __name__ == '__main__':
    keys = sys.argv[1:] or [k for k, _ in ROWS]
    for k in keys:
        th = run.THEMES[k]
        for kind, mod, _ in KINDS: print(mod.build(th))
    print(v3sys.build(run.THEMES['classic']))
    print(len(canvas()), 'boards on the canvas')
