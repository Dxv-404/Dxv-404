"""Exports the signed-off menu, loading screen and theme picker of every theme into the app.

    cd tools/design/gen && python3 export_screens.py

Writes apps/web/src/ui/screens.json: for each theme its background and logo for the loading screen and the
menu, the loading screen's extra art, and the board CSS each theme adds; plus the shared menu and picker CSS
and the picker's swatch colours. The app builds the real screens from these pieces with live data (your name,
your crews, the table you left), so they look exactly like the design boards.
"""
import json, os, re
import run, builders, picker
from sysboards import THEME_INFO

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
OUT = os.path.join(ROOT, 'apps', 'web', 'src', 'ui', 'screens.json')
ORDER = ['classic', 'noir', 'ivory', 'velvet', 'cyber', 'ink', 'pixel', 'train', 'edo']

def assets(s):
    # the design pages load images relative to the project folder; the app serves them under /tp/
    return re.sub(r'(["(\'])img/', r'\1/tp/img/', s)

out = {'menuCss': builders.MENU_CSS, 'pickerCss': picker.CSS, 'themes': {}}
info = {t[0]: t for t in THEME_INFO}
for key in ORDER:
    th = run.THEMES[key]
    n = th.name
    i = info[n]
    out['themes'][key] = {
        'name': n,
        'tagline': i[1],
        'swatch': {'bg': i[4], 'felt': i[5], 'rim': i[6], 'acc': i[7], 'tx': i[8]},
        'loading': {'bg': assets(th.bg('loading')), 'logo': assets(th.logo('loading')), 'extra': assets(th.loading_extra()), 'css': assets(th.board_css('loading'))},
        'menu': {'bg': assets(th.bg('menu')), 'logo': assets(th.logo('menu')), 'extra': assets(th.menu_extra()), 'css': assets(th.board_css('menu'))},
        'lapBg': assets(th.bg('lap')),
    }
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(OUT, os.path.getsize(OUT))
