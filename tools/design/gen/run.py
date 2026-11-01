"""Build everything: python3 run.py [theme ...]  (no args = all themes + system boards + canvas)"""
import sys, importlib
from builders import build_all, build_tiers
import classic, minimal, velvet, cyber, ink, pixel, train, edo
THEMES = {'classic': classic.TH, 'noir': minimal.THEMES[0], 'ivory': minimal.THEMES[1], 'velvet': velvet.TH,
          'cyber': cyber.TH, 'ink': ink.TH, 'pixel': pixel.TH, 'train': train.TH, 'edo': edo.TH}
for k, th in THEMES.items():
    try: m = importlib.import_module('b_' + k)
    except ModuleNotFoundError: continue
    th.t3 = (lambda m, th: (lambda: m.t3(th)))(m, th); th.t4 = (lambda m, th: (lambda: m.t4(th)))(m, th)
def main(args):
    only_tiers = '--tiers' in args; args = [a for a in args if not a.startswith('--')]
    keys = args or list(THEMES)
    for k in keys:
        th = THEMES[k]
        if only_tiers: print(build_tiers(th)); continue
        if '--presence' in sys.argv:
            import presence; print(presence.build(th)); continue
        for f in build_all(th, dealer=k not in ('classic', 'noir', 'ivory', 'velvet')): print(f)
        import presence, motion, picker
        print(presence.build(th)); print(motion.build(th)); print(picker.build(th))
    if not args:
        import sysboards, canvas
        sysboards.main_board(); sysboards.crowd(); sysboards.odds(); sysboards.presence()
        import motion, lab
        motion.sys_board(THEMES['classic'])
        for d in lab.DEVICES: lab.page(THEMES['classic'], d)
        import os
        if os.path.exists(os.path.join(os.path.dirname(__file__), '..', 'prev2', 'lab_all.json')): lab.results(os.path.join(os.path.dirname(__file__), '..', 'prev2', 'lab_all.json'), list(THEMES))
        canvas.build()
if __name__ == '__main__': main(sys.argv[1:])
