"""Exports the signed-off presence states (signal drop, coming back, host gone) of every theme into the app.

    cd tools/design/gen && python3 export_presence.py

Writes apps/web/src/table/presence.json: the shared CSS, each theme's CSS and its copy (titles, kicker, the
dealer's line and the little touch on an away seat). The live table fills them with real numbers."""
import json, os, re
import presence

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
OUT = os.path.join(ROOT, 'apps', 'web', 'src', 'table', 'presence.json')

def scope(css):
    # the design boards put .pz-* anywhere on the page; in the app they live inside the table (.tp.live)
    css = re.sub(r'url\(img/', 'url(/tp/img/', css)
    return css

out = {'css': scope(presence.CSS), 'themes': {}}
for key, c in presence.COPY.items():
    bt, bs, tt, tk, pt, sh, dline, seatfx = c
    out['themes'][key] = {'css': scope(presence.THEME_CSS.get(key, '')), 'banner': bt, 'bannerSub': bs, 'back': tt, 'backKicker': tk,
                          'pause': pt, 'away': sh, 'dealer': dline, 'seatFx': seatfx}
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(OUT, os.path.getsize(OUT))
