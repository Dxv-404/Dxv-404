"""Selectable player avatars: 8 per theme (5 characters + 3 emblems), each in its theme's own art style.
Writes avatars.json (theme -> [{id, name, kind, svg}]) next to this file. Every svg is self-contained, viewBox 0 0 64 64.
Run: python3 tools/design/avatars/gen.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SKIN = {'l': ('#f3d2b8', '#dcb093'), 'm': ('#e2b28e', '#c48f6c'), 't': ('#c68e66', '#a6704c'), 'd': ('#8d5a3b', '#6f4329')}

# ---------- shared bust geometry (64 space) ----------
HEAD = 'M19.5 30 A12.5 14.5 0 1 1 44.5 30 A12.5 14.5 0 1 1 19.5 30Z'
NECK = 'M27 40 L27 49 Q32 52 37 49 L37 40Z'
BODY = 'M5 66 Q7 49 32 46 Q57 49 59 66Z'
HAIR_BACK = {
    'long': 'M17.5 34 Q15 12 32 12 Q49 12 46.5 34 L49 54 Q40 55 39 45 L25 45 Q24 55 15 54Z',
    'bob': 'M17 36 Q15 12 32 12 Q49 12 47 36 Q47 42 43 42 L21 42 Q17 42 17 36Z',
    'bun': 'M26 12 A6 6 0 1 1 38 12 A6 6 0 1 1 26 12Z',
    'knot': 'M28.5 11 A3.5 4 0 1 1 35.5 11 A3.5 4 0 1 1 28.5 11Z',
    'wide': 'M14 30 Q12 9 32 9 Q52 9 50 30 Q53 38 47 40 L17 40 Q11 38 14 30Z',
}
HAIR = {
    'short': 'M19.5 30 Q19 14 32 14 Q45 14 44.6 30 Q42 22 35 21 Q28 25 22 23 Q20.5 26 19.5 30Z',
    'side': 'M19.5 29 Q20 14 33 14 Q45.5 15 44.6 29 Q39 19 26 22.5 Q21 24 19.5 29Z',
    'part': 'M19.4 31 Q20 15 32 15 Q44 15 44.6 31 Q40 21 32 22.5 Q24 21 19.4 31Z',
    'tight': 'M19.8 27 Q21 15.5 32 15.5 Q43 15.5 44.2 27 Q39 20.5 32 20.5 Q25 20.5 19.8 27Z',
    'spiky': 'M20 30 L17 19 L23.5 21 L23 11 L29.5 17.5 L32.5 8 L35.5 17.5 L42 11 L41 21 L47 19 L44 30 Q38 22 32 23 Q26 22 20 30Z',
    'slick': 'M19.6 28 Q19 14 32 14 Q45 14 44.4 28 Q41 18.5 32 18.5 Q23 18.5 19.6 28Z',
    'wavy': 'M18.5 33 Q17 14 32 14 Q47 14 45.5 33 Q44 25 40 22 Q36 26 31 23 Q26 26 22 23 Q19.5 27 18.5 33Z',
    'tufts': 'M19.6 33 Q18.5 25 21.5 22.5 L22.5 34Z M44.4 33 Q45.5 25 42.5 22.5 L41.5 34Z',
    'fringe': 'M19.4 31 Q19 15 32 15 Q45 15 44.6 31 L42 25 L39 27 L37 24 L33 27 L30 24 L27 27 L24 24 L21.5 27Z',
    'none': '',
}
EYES_Y = 31


def P(d, fill, st='', extra=''):
    return f'<path d="{d}" fill="{fill}"{st}{extra}/>' if d else ''


def bust(c, S):
    """c: character spec; S: theme style. Returns svg body (no frame)."""
    ol, olw = S['ol'], S['olw']
    st = f' stroke="{ol}" stroke-width="{olw}" stroke-linejoin="round"' if olw else ''
    sk, sks = S.get('skins', SKIN)[c.get('skin', 'm')]
    hc = c.get('hairc', S.get('hairc', '#2a1d18'))
    s = c.get('pre', '')
    if c.get('back'): s += P(HAIR_BACK[c['back']], hc, st) + c.get('backx', '')
    s += P(BODY, c.get('shirt', '#444'), st)
    s += c.get('torso', '')
    s += P(NECK, sks)
    s += P(HEAD, sk, st)
    if S.get('shade'): s += P('M40 19 Q47 30 40 43 Q43 32 38.5 23Z', sks, extra=' opacity=".85"')
    s += c.get('face_under', '')
    s += P(HAIR[c.get('hair', 'short')], hc, st)
    # eyes
    ey = c.get('eyes', S.get('eyes', 'dot')); ec = S.get('eye', ol)
    if ey == 'dot':
        s += f'<circle cx="27" cy="{EYES_Y}" r="1.7" fill="{ec}"/><circle cx="37" cy="{EYES_Y}" r="1.7" fill="{ec}"/>'
    elif ey == 'line':
        s += f'<path d="M24.5 {EYES_Y} L29.5 {EYES_Y} M34.5 {EYES_Y} L39.5 {EYES_Y}" stroke="{ec}" stroke-width="1.8" stroke-linecap="round"/>'
    elif ey == 'closed':
        s += f'<path d="M24.5 30.5 Q27 33 29.5 30.5 M34.5 30.5 Q37 33 39.5 30.5" stroke="{ec}" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
    elif ey == 'wood':
        s += f'<path d="M24 31.5 Q27 29.5 30 31.5 M34 31.5 Q37 29.5 40 31.5" stroke="{ec}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M24 26.5 Q27 25 30 26.5 M34 26.5 Q37 25 40 26.5" stroke="{ec}" stroke-width="1" fill="none"/>'
    elif ey == 'ink':
        s += f'<path d="M23.5 28.5 L30 29.5 M34 29.5 L40.5 28.5" stroke="{ec}" stroke-width="2.4" stroke-linecap="round"/><circle cx="27" cy="31.6" r="1.6" fill="{ec}"/><circle cx="37" cy="31.6" r="1.6" fill="{ec}"/>'
    elif ey == 'big':
        s += f'<ellipse cx="27" cy="31" rx="2.1" ry="2.6" fill="{ec}"/><ellipse cx="37" cy="31" rx="2.1" ry="2.6" fill="{ec}"/><circle cx="27.7" cy="30.2" r=".75" fill="#fff"/><circle cx="37.7" cy="30.2" r=".75" fill="#fff"/>'
    if c.get('mouth', True):
        mc = c.get('mouthc', S.get('mouth', ol))
        m = c.get('mouthd', 'M29 38.5 Q32 40.5 35 38.5')
        s += f'<path d="{m}" fill="none" stroke="{mc}" stroke-width="1.4" stroke-linecap="round"/>'
    s += c.get('face', '')
    s += c.get('hat', '')
    s += c.get('post', '')
    return s


# ---------- shared accessories (parametrised by colour) ----------
def fedora(col, band, st, brim=True):
    return (P('M8 22.5 Q32 15 56 22.5 Q32 27.5 8 22.5Z', col, st) if brim else '') + P('M19 21.5 Q18.5 7.5 32 8 Q45.5 7.5 45 21.5 Q32 19 19 21.5Z', col, st) + P('M19.3 18 Q32 16 44.7 18 L44.9 21.3 Q32 19 19.1 21.3Z', band) + P('M27 9.5 Q32 13 37 9.5', 'none', f' stroke="{band}" stroke-width="1" opacity=".6"')


def cap_conductor(col, peak, badge, st):
    return P('M17.5 22 L18.5 10.5 Q32 7 45.5 10.5 L46.5 22Z', col, st) + P('M16.5 21.5 Q32 18.5 47.5 21.5 Q45 27 32 25.5 Q19 27 16.5 21.5Z', peak, st) + f'<circle cx="32" cy="15" r="2.6" fill="{badge}"/>' + P('M18 19.5 L46 19.5', 'none', f' stroke="{badge}" stroke-width="1.2"')


def tophat(col, band, st):
    return P('M21 17 L22 1 L42 1 L43 17Z', col, st) + P('M21.4 12 L42.6 12 L42.8 16 L21.2 16Z', band) + P('M12 19 Q32 13.5 52 19 Q32 22.5 12 19Z', col, st)


def glasses(col, w=1.3):
    return f'<g fill="none" stroke="{col}" stroke-width="{w}"><circle cx="27" cy="31" r="3.6"/><circle cx="37" cy="31" r="3.6"/><path d="M30.6 31 L33.4 31 M23.4 30.5 L19.8 29.5 M40.6 30.5 L44.2 29.5"/></g>'


def mustache(col):
    return P('M24.5 37.5 Q28 34.5 32 36.3 Q36 34.5 39.5 37.5 Q36 37 32 37.8 Q28 37 24.5 37.5Z', col)


def beard(col, st=''):
    return P('M20 33 Q21 47 32 49 Q43 47 44 33 Q42 41 37 40 Q32 38 27 40 Q22 41 20 33Z', col, st)


def bowtie(col, st=''):
    return P('M26 47.5 L31 50 L26 52.5Z M38 47.5 L33 50 L38 52.5Z', col, st) + f'<circle cx="32" cy="50" r="1.6" fill="{col}"/>'


def vneck(col):
    return P('M25 47.5 L32 58 L39 47.5 Q32 50 25 47.5Z', col)


def lapels(col, st=''):
    return P('M21 48.5 L32 64 L26 64 L17 51Z M43 48.5 L32 64 L38 64 L47 51Z', col, st)


# ---------- frames ----------
def frame(theme, bg, body, idx, kind):
    cid = f'cl-{theme}-{idx}'
    F = FRAMES[theme]
    clip, under, over = F(bg, kind)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<defs><clipPath id="{cid}">{clip}</clipPath></defs>{under}<g clip-path="url(#{cid})">{bg_fill(clip, bg)}{body}</g>{over}</svg>')


def bg_fill(clip, bg):
    return clip.replace('/>', f' fill="{bg}"/>', 1) if bg else ''


def f_classic(bg, k):
    c = '<circle cx="32" cy="32" r="29.5"/>'
    return c, '<circle cx="32" cy="32" r="32" fill="#2a1a0e"/>', '<circle cx="32" cy="32" r="30" fill="none" stroke="#ecd39b" stroke-width="2.6"/><circle cx="32" cy="32" r="31.4" fill="none" stroke="#7a5426" stroke-width="1"/>'


def f_noir(bg, k):
    c = '<rect x="2" y="2" width="60" height="60"/>'
    blinds = ''.join(f'<path d="M2 {y} L62 {y-26}" stroke="#ede6d6" stroke-opacity=".07" stroke-width="3.2"/>' for y in range(14, 100, 9))
    return c, '<rect width="64" height="64" fill="#0b0b0c"/>', f'<g clip-path="none">{""}</g><rect x="2" y="2" width="60" height="60" fill="none" stroke="#c8a96a" stroke-width="1.6"/>', blinds


def f_ivory(bg, k):
    c = '<circle cx="32" cy="32" r="28.6"/>'
    return c, '<circle cx="32" cy="32" r="32" fill="#fffdf8"/><circle cx="32" cy="32" r="31.2" fill="none" stroke="#1f4a3a" stroke-width="1.2"/>', '<circle cx="32" cy="32" r="29" fill="none" stroke="#1f4a3a" stroke-width="1.6"/>'


def f_velvet(bg, k):
    c = '<ellipse cx="32" cy="32" rx="25.5" ry="29.5"/>'
    return c, '<ellipse cx="32" cy="32" rx="30.5" ry="32" fill="#2a0a12"/><ellipse cx="32" cy="32" rx="29" ry="31" fill="none" stroke="#e6c995" stroke-width="1" stroke-dasharray="1 2.2"/>', '<ellipse cx="32" cy="32" rx="26.3" ry="30.3" fill="none" stroke="#e6c995" stroke-width="2.4"/>'


def f_cyber(bg, k):
    c = '<path d="M2 2 H52 L62 12 V62 H12 L2 52Z"/>'
    grid = ''.join(f'<path d="M2 {y} H62" stroke="#c4a0ff" stroke-opacity=".12" stroke-width=".6"/>' for y in range(8, 64, 8)) + ''.join(f'<path d="M{x} 2 V62" stroke="#c4a0ff" stroke-opacity=".12" stroke-width=".6"/>' for x in range(8, 64, 8))
    return c, '<rect width="64" height="64" fill="#120a18"/>', '<path d="M2 2 H52 L62 12 V62 H12 L2 52Z" fill="none" stroke="#ff2e88" stroke-width="3" stroke-opacity=".35"/><path d="M2 2 H52 L62 12 V62 H12 L2 52Z" fill="none" stroke="#ff2e88" stroke-width="1.4"/>', grid


def f_ink(bg, k):
    c = '<rect x="3" y="3" width="58" height="58"/>'
    return c, '<rect width="64" height="64" fill="#f5f2ea"/>', '<rect x="3" y="3" width="58" height="58" fill="none" stroke="#111" stroke-width="3"/>'


def f_pixel(bg, k):
    c = '<rect x="4" y="4" width="56" height="56"/>'
    return c, '<rect width="64" height="64" fill="#1a1220"/><rect x="0" y="0" width="64" height="64" fill="#7a4a2a"/><rect x="0" y="0" width="64" height="4" fill="#9c6236"/><rect x="0" y="0" width="4" height="64" fill="#9c6236"/><rect x="0" y="60" width="64" height="4" fill="#3a2216"/><rect x="60" y="0" width="4" height="64" fill="#3a2216"/>', ''


def f_train(bg, k):
    c = '<rect x="3" y="3" width="58" height="58" rx="12"/>'
    return c, '<rect width="64" height="64" rx="14" fill="#0a1826"/>', '<rect x="3" y="3" width="58" height="58" rx="12" fill="none" stroke="#c9a15b" stroke-width="2.2"/><rect x="5.5" y="5.5" width="53" height="53" rx="10" fill="none" stroke="#c9a15b" stroke-opacity=".45" stroke-width=".8"/>'


def f_edo(bg, k):
    c = '<circle cx="32" cy="32" r="28.4"/>'
    return c, '<circle cx="32" cy="32" r="32" fill="#1e2a4a"/><circle cx="32" cy="32" r="30.2" fill="#efe3c8"/>', '<circle cx="32" cy="32" r="28.8" fill="none" stroke="#1e2a4a" stroke-width="1.8"/>'


FRAMES = {k: globals()['f_' + k] for k in 'classic noir ivory velvet cyber ink pixel train edo'.split()}


def make(theme, idx, bg, body, kind):
    r = FRAMES[theme](bg, kind)
    clip, under, over = r[0], r[1], r[2]
    deco = r[3] if len(r) > 3 else ''
    cid = f'tpav-{theme}-{idx}'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<defs><clipPath id="{cid}">{clip}</clipPath></defs>{under}'
            f'<g clip-path="url(#{cid})">{bg_fill(clip, bg)}{deco}{body}</g>{over}</svg>')


AV = {}


def add(theme, name, kind, bg, body):
    lst = AV.setdefault(theme, [])
    idx = len(lst)
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower().replace('the ', '')).strip('-')
    lst.append({'id': f'{theme}-{slug}', 'name': name, 'kind': kind, 'svg': make(theme, idx, bg, body, kind)})


# =====================================================================
# CLASSIC — warm card room: felt, mahogany, brass; soft outline, warm shading
# =====================================================================
S = {'ol': '#2a1a0e', 'olw': 1.3, 'shade': True, 'eye': '#2a1a0e'}
st = f' stroke="#2a1a0e" stroke-width="1.3" stroke-linejoin="round"'
visor = P('M15 23 Q32 15.5 49 23 L51 28.5 Q32 21.5 13 28.5Z', '#3f9a5c', st, ' fill-opacity=".92"') + P('M18 20.5 Q32 15 46 20.5', 'none', ' stroke="#2a1a0e" stroke-width="1.6"')
add('classic', 'The Dealer', 'character', '#2f5a3f', bust({'skin': 'm', 'hair': 'side', 'hairc': '#3a2416', 'shirt': '#f3ead7', 'torso': P('M14 52 Q20 48 25 47.5 L32 64 L10 64Z M50 52 Q44 48 39 47.5 L32 64 L54 64Z', '#7a2a24', st) + bowtie('#2a1a0e'), 'hat': visor}, S))
add('classic', 'The Gambler', 'character', '#7a2a24', bust({'skin': 'l', 'hair': 'short', 'hairc': '#5a3a22', 'shirt': '#3a2416', 'torso': vneck('#f3ead7') + P('M30 48 L32 60 L34 48Z', '#a83c32'), 'face': mustache('#5a3a22'), 'hat': fedora('#6b4a2e', '#2a1a0e', st), 'mouth': False}, S))
add('classic', 'Lady Luck', 'character', '#24405a', bust({'skin': 't', 'back': 'long', 'hair': 'wavy', 'hairc': '#2a1610', 'shirt': '#a83c32', 'torso': P('M22 50 Q32 56 42 50', 'none', ' stroke="#ecd39b" stroke-width="1.6" stroke-dasharray="0.1 2.6" stroke-linecap="round"'), 'mouthc': '#a83c32', 'face': '<circle cx="19.6" cy="36" r="1.6" fill="#ecd39b"/><circle cx="44.4" cy="36" r="1.6" fill="#ecd39b"/>', 'post': P('M38 15 L41 9 L44 14 L48 11 L46 17Z', '#ecd39b', st)}, S))
add('classic', 'The Old Hand', 'character', '#5a4022', bust({'skin': 'd', 'hair': 'tufts', 'hairc': '#d9d0c0', 'shirt': '#2f5a3f', 'torso': lapels('#24402f', st) + vneck('#f3ead7'), 'face': beard('#d9d0c0', st) + glasses('#ecd39b', 1.2), 'mouth': False}, S))
add('classic', 'The Rookie', 'character', '#a87a3a', bust({'skin': 'l', 'hair': 'fringe', 'hairc': '#c0702c', 'shirt': '#24405a', 'eyes': 'big', 'mouthd': 'M28.5 38 Q32 42 35.5 38', 'face': '<circle cx="23.5" cy="36" r="2" fill="#e88a7a" opacity=".55"/><circle cx="40.5" cy="36" r="2" fill="#e88a7a" opacity=".55"/>', 'hat': P('M18 22 Q17.5 11 32 10.5 Q46 11 46 20 L54 22.5 Q40 26 18 22Z', '#a83c32', st) + '<circle cx="32" cy="11" r="1.5" fill="#ecd39b"/>'}, S))
# emblems
add('classic', 'Card Fox', 'emblem', '#2f5a3f',
    P('M14 14 L24 24 L40 24 L50 14 L52 32 Q52 48 32 56 Q12 48 12 32Z', '#c0702c', st) +
    P('M18 20 L23 26 L18 27Z M46 20 L41 26 L46 27Z', '#2a1a0e') +
    P('M20 38 Q26 36 32 44 Q38 36 44 38 Q42 50 32 55 Q22 50 20 38Z', '#f3ead7', st) +
    '<path d="M22 33 L28 35 M42 33 L36 35" stroke="#2a1a0e" stroke-width="2.2" stroke-linecap="round"/><path d="M29 46 L35 46 L32 49.5Z" fill="#2a1a0e"/>')
chip = '<circle cx="32" cy="32" r="21" fill="#a83c32" stroke="#2a1a0e" stroke-width="1.3"/>' + ''.join(
    f'<rect x="29" y="11" width="6" height="7" fill="#f3ead7" transform="rotate({a} 32 32)"/>' for a in range(0, 360, 45)) + \
    '<circle cx="32" cy="32" r="13" fill="#f3ead7" stroke="#2a1a0e" stroke-width="1"/><circle cx="32" cy="32" r="11" fill="none" stroke="#a83c32" stroke-width="1" stroke-dasharray="2 1.5"/>' + \
    '<path d="M32 24.5 C36 29 40 30.5 40 34 C40 37 36.5 38 33.5 36 L35 40.5 L29 40.5 L30.5 36 C27.5 38 24 37 24 34 C24 30.5 28 29 32 24.5Z" fill="#2a1a0e"/>'
add('classic', 'Gold Chip', 'emblem', '#1f3b2a', chip)
leaf = 'M32 32 C26 30 20 26 22 20 C24 15 30 16 32 21 C34 16 40 15 42 20 C44 26 38 30 32 32Z'
clover = ''.join(f'<path d="{leaf}" fill="#46854f" stroke="#1a2a20" stroke-width="1.3" transform="rotate({a} 32 32)"/>' for a in (0, 90, 180, 270)) + '<path d="M32 32 Q36 44 44 50" stroke="#1a2a20" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="32" cy="32" r="2.2" fill="#ecd39b"/>'
add('classic', 'Four-Leaf', 'emblem', '#ecd39b', clover)

# =====================================================================
# NOIR — black and ivory with hard key light from the left; gold only as accent
# =====================================================================
IV, BK = '#ede6d6', '#0b0b0c'
S = {'ol': BK, 'olw': 1.1, 'eye': BK, 'skins': {k: (IV, '#cfc6b4') for k in 'lmtd'}}
stn = f' stroke="{BK}" stroke-width="1.1" stroke-linejoin="round"'
SHADOW = '<path d="M32 15 Q47 15 44.6 32 Q43 45 32 44.6 Q38 36 37 28 Q36 20 32 15Z" fill="#0b0b0c" opacity=".92"/>'
add('noir', 'The Detective', 'character', '#1c1c1e', bust({'skin': 'm', 'hair': 'short', 'hairc': BK, 'shirt': '#2a2826', 'torso': P('M14 50 L27 47 L32 60 L24 64 L10 64Z M50 50 L37 47 L32 60 L40 64 L54 64Z', '#4a453e', stn) + vneck(IV) + P('M30.5 49 L32 62 L33.5 49Z', BK), 'face_under': '', 'face': SHADOW + P('M20.5 34 Q26 33 28 35', 'none', f' stroke="{BK}" stroke-width=".8"'), 'mouthd': 'M28 39 L33 38.5', 'hat': fedora(BK, '#c8a96a', stn)}, S))
add('noir', 'The Femme', 'character', '#2a2826', bust({'skin': 'l', 'back': 'bob', 'hair': 'wavy', 'hairc': BK, 'shirt': BK, 'torso': P('M18 52 Q32 60 46 52', 'none', ' stroke="#ede6d6" stroke-width="1.4" stroke-dasharray=".1 2.4" stroke-linecap="round"'), 'eyes': 'closed', 'mouthd': 'M29.5 38.6 Q32 37.2 34.5 38.6 Q32 40.6 29.5 38.6Z', 'mouthc': '#8e1f2b', 'face': SHADOW.replace('.92', '.75') + '<path d="M29.5 38.6 Q32 37.2 34.5 38.6 Q32 40.6 29.5 38.6Z" fill="#8e1f2b"/>', 'hat': P('M16 20 Q24 9 40 10 Q50 12 50 18 Q36 14 16 20Z', BK) + P('M20 20 Q32 17 46 18 L44 34 Q32 30 21 34Z', 'url(#nv)', extra=' opacity="0"') + '<path d="M19 22 L45 18 M18 26 L46 22 M19 30 L45 26 M23 19 L28 34 M30 18 L34 33 M37 17 L40 32" stroke="#0b0b0c" stroke-width=".55" opacity=".7"/>'}, S))
add('noir', 'The Boss', 'character', '#141415', bust({'skin': 't', 'hair': 'slick', 'hairc': BK, 'shirt': '#1c1c1e', 'torso': ''.join(f'<path d="M{x} 50 L{x+1} 64" stroke="#ede6d6" stroke-opacity=".35" stroke-width=".6"/>' for x in (11, 15, 19, 45, 49, 53)) + lapels('#2a2826', stn) + vneck(IV) + P('M29.5 48 L32 52 L34.5 48 L32 64Z', '#8e1f2b') + P('M43 52 L46 51 L46.5 54Z', '#c8a96a'), 'face': SHADOW + '<path d="M22 20.5 Q30 17 38 19" stroke="#ede6d6" stroke-width=".9" fill="none" opacity=".6"/>', 'mouthd': 'M28.5 38.8 L35.5 38.8', 'eyes': 'line'}, S))
add('noir', 'The Informant', 'character', '#2a2826', bust({'skin': 'd', 'hair': 'none', 'shirt': '#4a453e', 'torso': P('M8 64 Q10 50 22 47 L32 54 L42 47 Q54 50 56 64Z', '#4a453e', stn) + P('M22 47 L32 54 L42 47 L40 45 L32 50 L24 45Z', '#2a2826', stn), 'face': SHADOW + '<path d="M35 39 L44 41" stroke="#ede6d6" stroke-width="1.5" stroke-linecap="round"/><circle cx="44.8" cy="41.2" r="1" fill="#c8a96a"/><path d="M45 38 Q48 34 46 30 Q44 26 47 22" stroke="#ede6d6" stroke-width=".9" fill="none" opacity=".55"/>', 'eyes': 'line', 'mouth': False,
                                                                     'hat': P('M18 22 Q17 10 32 10 Q46 10.5 46.5 19 L50 23 Q38 25.5 18 22Z', '#2a2826', stn) + P('M19 19 Q32 15 46 19', 'none', f' stroke="{BK}" stroke-width=".8"')}, S))
add('noir', 'The Torch Singer', 'character', '#1c1c1e', bust({'skin': 'm', 'back': 'long', 'hair': 'part', 'hairc': BK, 'shirt': '#8e1f2b', 'torso': P('M14 52 Q32 46 50 52 L52 64 L12 64Z', '#8e1f2b', stn), 'eyes': 'closed', 'mouthd': 'M30 38 Q32 41.5 34 38 Q32 39 30 38Z', 'mouthc': '#8e1f2b', 'face': SHADOW.replace('.92', '.8'),
                                                                        'post': '<rect x="45" y="36" width="6" height="9" rx="3" fill="#c8a96a" stroke="#0b0b0c" stroke-width="1"/><path d="M46 38.5 H50 M46 41 H50" stroke="#0b0b0c" stroke-width=".6"/><path d="M48 45 L49 64" stroke="#c8a96a" stroke-width="1.6"/><circle cx="25" cy="13" r="3" fill="#ede6d6" stroke="#0b0b0c" stroke-width="1"/><circle cx="25" cy="13" r="1.2" fill="#c8a96a"/>'}, S))
add('noir', 'Black Cat', 'emblem', '#2a2826',
    P('M14 58 Q12 34 18 26 L16 10 L26 20 Q32 18 38 20 L48 10 L46 26 Q52 34 50 58Z', BK, f' stroke="{IV}" stroke-width="1.2"') +
    P('M22 33 Q26 29 30 33 Q26 36 22 33Z M34 33 Q38 29 42 33 Q38 36 34 33Z', '#c8a96a') + P('M25.6 30.6 L26.4 35.4 M37.6 30.6 L38.4 35.4', 'none', ' stroke="#0b0b0c" stroke-width="1.3"') +
    '<path d="M30.5 40 L33.5 40 L32 42Z" fill="#ede6d6"/><path d="M18 41 L27 41.5 M18 44 L27 43 M46 41 L37 41.5 M46 44 L37 43" stroke="#ede6d6" stroke-width=".7"/>')
add('noir', 'The Raven', 'emblem', '#ede6d6',
    P('M10 54 Q14 38 26 34 Q24 22 32 16 Q42 12 46 20 L56 23 L46 26 Q46 34 40 40 Q36 50 22 56Z', BK) +
    P('M22 40 Q30 42 36 38 Q30 48 18 52Z', '#2a2826') + '<circle cx="40" cy="20.5" r="2" fill="#c8a96a"/><circle cx="40.4" cy="20.2" r=".7" fill="#0b0b0c"/>' +
    '<path d="M6 60 L58 60" stroke="#0b0b0c" stroke-width="2.4"/><path d="M28 56 L27 60 M32 55 L32 60" stroke="#0b0b0c" stroke-width="1.6"/>')
add('noir', 'The Keyhole', 'emblem', '#141415',
    '<circle cx="32" cy="32" r="22" fill="#c8a96a"/><circle cx="32" cy="32" r="22" fill="none" stroke="#ede6d6" stroke-width="1"/><circle cx="32" cy="32" r="18.5" fill="none" stroke="#0b0b0c" stroke-width=".8" stroke-dasharray="1 1.6"/>' +
    P('M32 18 A7 7 0 0 1 36.5 30.5 L40 46 L24 46 L27.5 30.5 A7 7 0 0 1 32 18Z', BK) + P('M32 23 A3 3 0 0 1 33 28.5', 'none', ' stroke="#ede6d6" stroke-width="1" opacity=".6"'))

# =====================================================================
# IVORY — light engraved line art: fine green-black ink, hatched shadows, cream ground
# =====================================================================
G = '#1f4a3a'
S = {'ol': G, 'olw': 1.45, 'eye': G, 'mouth': G, 'skins': {k: ('#fffdf8', '#efe6d4') for k in 'lmtd'}}
sti = f' stroke="{G}" stroke-width="1.45" stroke-linejoin="round"'
HATCH = '<g stroke="#1f4a3a" stroke-width=".55" opacity=".85"><path d="M40.5 21 L43.5 24 M40 24.5 L44.3 28.8 M39.8 28 L44.5 32.7 M39.8 31.5 L44 35.7 M39.5 35 L42.8 38.3 M38.5 38.5 L40.8 40.8"/></g>'
def hatch_fill(d, gap=2.2, ang=1):
    # engraved hatch: fill a path with diagonal lines (clip via a mask-free trick: draw lines then paint cream outside is costly) -> use pattern-free stroke lines inside bbox, clipped by path
    return d
def hatched(d, cid, col=G, gap=1.7, w=.75):
    lines = ''.join(f'<path d="M{x} 0 L{x+64} 64"/>' for x in range(-64, 64, 2)) if False else ''.join(f'<path d="M{x/10:.1f} 0 L{x/10+64:.1f} 64"/>' for x in range(-640, 640, int(gap * 10)))
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})" stroke="{col}" stroke-width="{w}">{lines}</g>'
_hc = [0]
def H(d, **k):
    _hc[0] += 1
    return hatched(d, f'tpav-ivh{_hc[0]}', **k)
add('ivory', 'The Duchess', 'character', '#e9e2d0', bust({'skin': 'l', 'back': 'bun', 'hair': 'tight', 'hairc': G, 'shirt': '#fffdf8', 'pre': '',
    'torso': H(BODY) + P('M20 50 Q32 57 44 50', 'none', f' stroke="{G}" stroke-width="2.2" stroke-dasharray=".1 2.8" stroke-linecap="round"'),
    'face': HATCH + H(HAIR['tight'], gap=1.3, col='#fffdf8', w=.55) + H(HAIR_BACK['bun'], gap=1.3, col='#fffdf8', w=.55) + f'<path d="M24 12 L28 5 L32 10 L36 5 L40 12" fill="#fffdf8" stroke="{G}" stroke-width="1.1" stroke-linejoin="round"/><circle cx="32" cy="9" r="1.2" fill="{G}"/>', 'eyes': 'closed'}, S))
add('ivory', 'The Admiral', 'character', '#dfe7df', bust({'skin': 'm', 'hair': 'tufts', 'hairc': G, 'shirt': G,
    'torso': P('M25 47.5 L32 55 L39 47.5', '#fffdf8', sti) + '<circle cx="32" cy="58" r="1" fill="#c9a15b"/><circle cx="32" cy="62" r="1" fill="#c9a15b"/><path d="M8 54 L18 51 M46 51 L56 54" stroke="#c9a15b" stroke-width="2.2"/>',
    'face': HATCH + mustache(G) + P('M20 33 Q22 44 32 45 Q42 44 44 33', 'none', f' stroke="{G}" stroke-width=".8"'), 'mouth': False,
    'hat': P('M15 22 Q14 10 32 9 Q50 10 49 22Z', '#fffdf8', sti) + H('M15 22 Q14 10 32 9 Q50 10 49 22Z', gap=1.3, w=.9) + P('M14 21 Q32 18 50 21 L50 24 Q32 21.5 14 24Z', G, sti) + P('M28 13 L32 10 L36 13 L32 17Z', '#c9a15b', sti)}, S))
add('ivory', 'The Scholar', 'character', '#efe8d8', bust({'skin': 't', 'hair': 'side', 'hairc': G, 'shirt': '#fffdf8',
    'torso': H(BODY, gap=2.4) + P('M25 47.5 L32 54 L39 47.5 Q32 50 25 47.5Z', '#fffdf8', sti) + P('M30 50 L32 64 L34 50Z', G),
    'face': HATCH + H(HAIR['side'], gap=1.2, col='#fffdf8', w=.55) + glasses(G, 1.2), 'mouthd': 'M29.5 38.5 L34.5 38.5'}, S))
add('ivory', 'The Heiress', 'character', '#e6ede6', bust({'skin': 'd', 'back': 'long', 'hair': 'part', 'hairc': G, 'shirt': '#fffdf8',
    'pre': '', 'torso': P('M17 51 Q32 60 47 51', 'none', f' stroke="{G}" stroke-width="1"') + '<circle cx="32" cy="55.8" r="2" fill="#c9a15b" stroke="#1f4a3a" stroke-width=".8"/>',
    'backx': H(HAIR_BACK['long'], gap=1.4, col='#fffdf8', w=.55), 'face': HATCH + H(HAIR['part'], gap=1.2, col='#fffdf8', w=.55) + '<path d="M19.6 34 L19.6 39 M44.4 34 L44.4 39" stroke="#c9a15b" stroke-width="1.4"/>', 'eyes': 'closed', 'mouthd': 'M29.5 38.3 Q32 40.3 34.5 38.3'}, S))
add('ivory', 'The Poet', 'character', '#ece4d4', bust({'skin': 'l', 'hair': 'wavy', 'hairc': G, 'shirt': '#fffdf8',
    'torso': H(BODY, gap=1.8) + P('M24 47 Q20 52 24 56 Q30 54 32 49 Q34 54 40 56 Q44 52 40 47 Q32 51 24 47Z', '#fffdf8', sti),
    'face': HATCH + H(HAIR['wavy'], gap=1.2, col='#fffdf8', w=.55), 'eyes': 'line',
    'post': f'<path d="M50 8 Q40 16 38 30 Q44 22 50 8Z" fill="#fffdf8" stroke="{G}" stroke-width="1"/><path d="M50 8 L38 30" stroke="{G}" stroke-width=".7"/>'}, S))
add('ivory', 'The Swan', 'emblem', '#fffdf8',
    P('M14 46 Q14 36 26 36 Q34 36 38 42 Q38 34 32 26 Q28 20 32 14 Q36 10 40 13 L46 15 L40 17 Q36 18 38 24 Q46 34 46 42 Q50 40 52 34 Q54 46 44 52 Q30 56 14 46Z', '#fffdf8', sti) +
    H('M14 46 Q20 50 30 50 Q40 50 46 42 Q44 52 30 53 Q20 53 14 46Z', gap=1.4) + '<circle cx="38" cy="15" r=".9" fill="#1f4a3a"/>' +
    '<path d="M10 56 Q16 54 22 56 T34 56 T46 56 T58 56" stroke="#1f4a3a" stroke-width=".9" fill="none"/><path d="M14 59.5 Q20 57.5 26 59.5 T38 59.5 T50 59.5" stroke="#1f4a3a" stroke-width=".7" fill="none"/>')
laurel = ''.join(f'<ellipse cx="0" cy="0" rx="2.2" ry="4.6" fill="#fffdf8" stroke="#1f4a3a" stroke-width=".9" transform="translate({32 + side * (18 * __import__("math").sin(a))} {34 - 18 * __import__("math").cos(a) + 4}) rotate({side * (a * 57.3) + side * 30})"/>' for side in (-1, 1) for a in [0.9 + i * 0.36 for i in range(6)])
add('ivory', 'Laurel Crest', 'emblem', '#efe8d8', laurel + '<path d="M32 50 L28 56 M32 50 L36 56" stroke="#1f4a3a" stroke-width="1"/>' +
    f'<path d="M24 18 H40 V32 Q40 42 32 46 Q24 42 24 32Z" fill="#fffdf8" stroke="{G}" stroke-width="1.3"/>' + H('M32 18 H40 V32 Q40 42 32 46Z', gap=1.3) + '<path d="M24 26 H40" stroke="#1f4a3a" stroke-width="1"/><circle cx="28" cy="22" r="1.4" fill="#c9a15b"/>')
add('ivory', 'The Stag', 'emblem', '#e6ede6',
    f'<g fill="none" stroke="{G}" stroke-width="1.5" stroke-linecap="round"><path d="M26 26 Q20 18 22 8 M22 16 L15 13 M21 11 L16 6 M38 26 Q44 18 42 8 M42 16 L49 13 M43 11 L48 6"/></g>' +
    P('M24 26 Q32 23 40 26 L42 30 L48 28 Q46 34 40 34 L37 48 Q32 52 27 48 L24 34 Q18 34 16 28 L22 30Z', '#fffdf8', sti) + H('M32 24 Q36 24 40 26 L42 30 L40 34 L37 48 Q34 51 32 51Z', gap=1.4) +
    '<circle cx="28.5" cy="34" r="1.2" fill="#1f4a3a"/><circle cx="35.5" cy="34" r="1.2" fill="#1f4a3a"/><ellipse cx="32" cy="48" rx="2.6" ry="1.8" fill="#1f4a3a"/>')

# =====================================================================
# VELVET — luxe casino cameo: jewel tones, champagne gold rim, rich gradients
# =====================================================================
GD = '#e6c995'
S = {'ol': '#2a0a12', 'olw': 1.1, 'shade': True, 'eye': '#2a0a12', 'mouth': '#7a1a2e'}
stv = ' stroke="#2a0a12" stroke-width="1.1" stroke-linejoin="round"'
add('velvet', 'The Croupier', 'character', '#5a1424', bust({'skin': 'm', 'hair': 'slick', 'hairc': '#2a160e', 'shirt': '#14080b', 'torso': lapels('#2a0a12', stv) + vneck('#f6e9dc') + bowtie(GD, stv), 'eyes': 'line'}, S))
add('velvet', 'The Countess', 'character', '#2a3a5a', bust({'skin': 'l', 'back': 'bob', 'hair': 'wavy', 'hairc': '#7a1a2e', 'shirt': '#14080b', 'torso': P('M16 52 Q32 62 48 52 L48 64 L16 64Z', '#14080b', stv) + P('M22 51 Q32 58 42 51', 'none', f' stroke="{GD}" stroke-width="1.6"') + '<circle cx="32" cy="55.6" r="2.2" fill="#c8253c" stroke="#e6c995" stroke-width="1"/>', 'eyes': 'closed', 'mouthc': '#c8253c',
                                                                         'post': P('M40 18 Q52 4 58 8 Q50 10 44 20Z', GD, stv) + P('M43 19 Q50 9 55 9', 'none', ' stroke="#2a0a12" stroke-width=".6"') + '<circle cx="41" cy="19" r="2.4" fill="#c8253c" stroke="#e6c995" stroke-width="1"/>'}, S))
add('velvet', 'The High Roller', 'character', '#1f4a3a', bust({'skin': 'd', 'hair': 'short', 'hairc': '#1a0d08', 'shirt': '#f6e9dc', 'torso': lapels('#7a1a2e', stv) + bowtie('#14080b'), 'face': '<g fill="#14080b"><rect x="22" y="28" width="9" height="5.5" rx="2"/><rect x="33" y="28" width="9" height="5.5" rx="2"/></g><path d="M31 30 H33 M22 29.5 L19.8 28.5 M42 29.5 L44.2 28.5" stroke="#14080b" stroke-width="1"/><path d="M24 29.5 L26 29.5" stroke="#e6c995" stroke-width=".9"/>', 'eyes': 'none', 'mouthd': 'M29 38.5 Q33 40 35.5 37.5'}, S))
add('velvet', 'The Showgirl', 'character', '#7a1a2e', bust({'skin': 't', 'hair': 'part', 'back': 'bob', 'hairc': '#14080b', 'shirt': GD, 'torso': ''.join(f'<circle cx="{x}" cy="{y}" r=".9" fill="#fff6e0"/>' for x, y in ((14, 58), (20, 55), (26, 60), (38, 60), (44, 55), (50, 58), (32, 56))), 'eyes': 'big', 'mouthc': '#c8253c',
                                                                     'hat': ''.join(P('M32 18 Q%d 2 %d -2 Q%d 6 32 18Z' % (32 + dx // 2, 32 + dx, 32 + dx), c, stv) for dx, c in ((-18, '#c8253c'), (18, '#c8253c'), (-8, GD), (8, GD), (0, '#f6e9dc'))) + P('M20 20 Q32 15 44 20 L44 22.5 Q32 18 20 22.5Z', GD, stv) + '<circle cx="32" cy="18" r="2.4" fill="#2a8a7a" stroke="#e6c995" stroke-width="1"/>'}, S))
add('velvet', 'The Magnate', 'character', '#3a1a4a', bust({'skin': 'l', 'hair': 'tufts', 'hairc': '#b8b0a4', 'shirt': '#14080b', 'torso': lapels('#2a0a12', stv) + vneck('#f6e9dc') + P('M30.5 48 L32 51 L33.5 48 L32 60Z', GD), 'face': mustache('#b8b0a4') + f'<circle cx="37" cy="31" r="3.8" fill="none" stroke="{GD}" stroke-width="1.3"/><path d="M40.6 32.5 Q44 42 42 50" stroke="{GD}" stroke-width=".7" fill="none"/>', 'mouth': False, 'hat': tophat('#14080b', '#7a1a2e', stv)}, S))
add('velvet', 'The Panther', 'emblem', '#5a1424',
    P('M12 30 Q12 14 22 12 L26 20 Q32 18 38 20 L42 12 Q52 14 52 30 Q54 46 42 54 Q32 58 22 54 Q10 46 12 30Z', '#14080b', f' stroke="{GD}" stroke-width="1.3"') +
    P('M19 32 Q24 27 29 32 Q24 35 19 32Z M35 32 Q40 27 45 32 Q40 35 35 32Z', '#7ad1a8') + '<path d="M24 29 L24 35 M40 29 L40 35" stroke="#14080b" stroke-width="1.5"/>' +
    P('M28 42 L36 42 L32 46Z', '#7a1a2e') + '<path d="M32 46 L32 48 M27 49 Q32 52 37 49" stroke="#e6c995" stroke-width=".9" fill="none"/><path d="M16 15.5 L21 19 M48 15.5 L43 19" stroke="#7a1a2e" stroke-width="1.6"/>')
add('velvet', 'Peacock Plume', 'emblem', '#14080b',
    P('M32 60 Q30 40 32 6 Q34 40 32 60Z', GD) + ''.join(f'<path d="M32 {y} Q{32 + s * 14} {y - 10} {32 + s * 18} {y - 22}" stroke="#e6c995" stroke-width=".7" fill="none" opacity=".7"/>' for y in range(26, 60, 5) for s in (-1, 1)) +
    '<ellipse cx="32" cy="22" rx="13" ry="15" fill="#1f6a5a" stroke="#e6c995" stroke-width="1.1"/><ellipse cx="32" cy="23" rx="8.5" ry="10" fill="#2a8a7a"/><ellipse cx="32" cy="24" rx="5.5" ry="6.5" fill="#d9a838"/><ellipse cx="32" cy="25" rx="3.4" ry="4.2" fill="#1a2a6a"/>')
add('velvet', 'The Diamond', 'emblem', '#2a0a12',
    P('M14 26 L22 14 L42 14 L50 26 L32 52Z', '#f6e9dc', f' stroke="{GD}" stroke-width="1.4"') + P('M14 26 H50 M22 14 L27 26 L32 14 L37 26 L42 14 M27 26 L32 52 L37 26', 'none', ' stroke="#b49284" stroke-width=".9"') +
    P('M22 14 L27 26 L14 26Z M37 26 L50 26 L32 52Z', '#c8253c', extra=' opacity=".55"') + '<path d="M46 8 L47 11 L50 12 L47 13 L46 16 L45 13 L42 12 L45 11Z" fill="#fff6e0"/>')

# =====================================================================
# CYBER — neon on night violet: dark plates, glowing rims, hard angles
# =====================================================================
PK, CY, VI, DK = '#ff2e88', '#7df9ff', '#c4a0ff', '#0f0a14'
S = {'ol': DK, 'olw': 1.3, 'shade': True, 'eye': DK}
stc = f' stroke="{DK}" stroke-width="1.3" stroke-linejoin="round"'
def neon(d, col, w=1.4):
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w * 3}" stroke-opacity=".3" stroke-linejoin="round" stroke-linecap="round"/><path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"/>'
add('cyber', 'The Netrunner', 'character', '#1d1030', bust({'skin': 'm', 'hair': 'side', 'hairc': '#2a1a3a', 'shirt': '#1d1428', 'torso': neon('M10 60 L20 50 M54 60 L44 50', CY, 1) + neon('M26 48 L32 54 L38 48', PK, 1),
    'face': P('M18 27 L46 27 L45 34 L19 34Z', '#0f0a14', stc) + neon('M20 30.5 H44', CY, 1.6) + neon('M18 27 L46 27', PK, .8), 'eyes': 'none', 'mouthd': 'M29.5 39 L34.5 39'}, S))
add('cyber', 'Synth Diva', 'character', '#2a0e2a', bust({'skin': 'd', 'hair': 'none', 'shirt': '#1d1428', 'torso': neon('M18 52 Q32 60 46 52', PK, 1.2),
    'face': P('M27 27 L26.5 4 Q32 2 37.5 4 L37 27 Q32 22 27 27Z', PK, stc) + P('M30 6 L34 6 L33.6 22 L30.4 22Z', '#ff9ac6') + P('M23 32.5 L30 30.5 L30 32.5Z M34 30.5 L41 32.5 L34 32.5Z', CY), 'eyes': 'none', 'mouthc': PK, 'post': neon('M44.6 33 L48 36 L48 40', CY, .9)}, S))
add('cyber', 'Street Ronin', 'character', '#0e1a2a', bust({'skin': 'l', 'back': 'knot', 'hair': 'tight', 'hairc': '#1a1424', 'shirt': '#1d1428', 'torso': neon('M22 48 L14 64 M42 48 L50 64', VI, 1),
    'face': P('M19.6 33.5 Q32 31 44.4 33.5 L43 41 Q32 50 21 41Z', '#1a1424', stc) + neon('M24 37 H40 M24 40.5 H40', PK, .7) + P('M23 29 L30 30 L30 31 L23 31Z M34 30 L41 29 L41 31 L34 31Z', '#ff2e88'), 'eyes': 'none', 'mouth': False}, S))
add('cyber', 'The Android', 'character', '#14142a', bust({'skin': 'l', 'hair': 'slick', 'hairc': '#d8d0e8', 'shirt': '#2a2238', 'torso': neon('M32 50 V64 M26 54 H38', CY, .9),
    'face': P('M32 15.5 Q44.5 15.5 44.5 30 Q44.5 44.5 32 44.5Z', '#b8b0c8', stc) + neon('M32 22 H38 L40 25 M32 36 H37 L39 39 M38 25 V31', CY, .7) + f'<circle cx="37" cy="31" r="2.4" fill="{PK}"/><circle cx="37" cy="31" r="4.2" fill="{PK}" opacity=".25"/><circle cx="27" cy="31" r="1.7" fill="{DK}"/>', 'eyes': 'none', 'mouthd': 'M29 38.5 L32 38.5'}, S))
add('cyber', 'The Fixer', 'character', '#200e28', bust({'skin': 't', 'hair': 'none', 'shirt': '#3a1a4a', 'torso': neon('M24 47 L32 56 L40 47', VI, .9),
    'pre': P('M12 50 Q10 9 32 9 Q54 9 52 50 L46 50 Q48 19 32 18 Q16 19 18 50Z', '#3a1a4a', stc), 'face': P('M21 28 H43 L41.5 33.5 Q37 35 33 32 L31 32 Q27 35 22.5 33.5Z', '#0f0a14') + neon('M22 29.5 L30 29.5 M34 29.5 L42 29.5', CY, .8) + P('M24 36 Q24 42 32 43 Q40 42 40 36 Q36 38.5 32 38.5 Q28 38.5 24 36Z', '#1a1424'), 'eyes': 'none', 'mouth': False,
    'hat': neon('M14 46 Q12 11 32 11 Q52 11 50 46', PK, 1)}, S))
add('cyber', 'Neon Koi', 'emblem', '#120a18',
    P('M18 44 Q12 28 26 20 Q40 14 46 26 Q50 36 40 42 Q32 46 30 54 L24 50 L22 58 L18 48Z', '#3a0e2a') + neon('M18 44 Q12 28 26 20 Q40 14 46 26 Q50 36 40 42 Q32 46 30 54 L24 50 L22 58 L18 48Z', PK, 1.6) + neon('M24 30 Q30 26 36 28', CY, 1) + f'<circle cx="38" cy="25" r="2" fill="{CY}"/>' + neon('M44 34 L52 36 M40 40 L46 46', VI, 1) + neon('M12 16 L16 16 M14 14 V18 M50 52 L54 52 M52 50 V54', CY, .7))
add('cyber', 'Circuit Eye', 'emblem', '#14081e',
    neon('M8 32 Q32 8 56 32 Q32 56 8 32Z', CY, 1.5) + f'<circle cx="32" cy="32" r="10" fill="#2a0e2a"/>' + neon('M32 22 A10 10 0 1 1 31.9 22', PK, 1.6) + f'<circle cx="32" cy="32" r="4" fill="{PK}"/><circle cx="34" cy="30" r="1.3" fill="#fff"/>' + neon('M32 8 V4 M20 12 L16 6 M44 12 L48 6 M32 56 V60 H40', VI, .8))
add('cyber', 'Hex Cat', 'emblem', '#1d1030',
    neon('M32 6 L54 18.5 V45.5 L32 58 L10 45.5 V18.5Z', VI, 1) + P('M18 46 V24 L22 14 L28 22 H36 L42 14 L46 24 V46 Q32 54 18 46Z', '#0f0a14') + neon('M18 46 V24 L22 14 L28 22 H36 L42 14 L46 24 V46 Q32 54 18 46Z', PK, 1.4) +
    neon('M23 32 L29 32 M35 32 L41 32', CY, 1.8) + neon('M30 40 L32 42 L34 40', CY, .9) + neon('M12 38 L22 39 M52 38 L42 39', VI, .6))

# =====================================================================
# INK — brush & ink manga: heavy black strokes, paper white, one red seal
# =====================================================================
S = {'ol': '#111', 'olw': 2.3, 'eye': '#111', 'skins': {k: ('#fff', '#e9e9e9') for k in 'lmtd'}}
stk = ' stroke="#111" stroke-width="2.3" stroke-linejoin="round"'
SEAL = lambda x, y: f'<rect x="{x}" y="{y}" width="7" height="7" rx="1" fill="#e8202a"/><path d="M{x+2} {y+2} H{x+5} M{x+3.5} {y+2} V{y+5} M{x+2} {y+5} H{x+5}" stroke="#fff" stroke-width=".9"/>'
SPEED = ''.join(f'<path d="M32 32 L{32 + 44 * __import__("math").cos(a / 10):.1f} {32 + 44 * __import__("math").sin(a / 10):.1f}" stroke="#111" stroke-width=".5" opacity=".35"/>' for a in range(0, 63, 3))
add('ink', 'The Ronin', 'character', '#fff', SPEED + bust({'skin': 'l', 'back': 'knot', 'hair': 'tight', 'hairc': '#111', 'shirt': '#fff', 'torso': P('M18 48 L32 62 L46 48', 'none', stk) + P('M10 56 L54 64', 'none', ' stroke="#111" stroke-width="4"'),
    'face': '<path d="M38 22 L42 36" stroke="#e8202a" stroke-width="1.6" stroke-linecap="round"/><path d="M20 35 Q22 42 26 43 M44 35 Q42 42 38 43" stroke="#111" stroke-width=".9" fill="none"/>', 'eyes': 'ink', 'mouthd': 'M29.5 39 L34.5 39'}, S) + SEAL(51, 6))
add('ink', 'The Monk', 'character', '#fff', bust({'skin': 'm', 'hair': 'none', 'shirt': '#fff', 'torso': P('M8 64 Q12 50 24 47 L40 64Z', '#111') + ''.join(f'<circle cx="{x}" cy="{y}" r="2" fill="#fff" stroke="#111" stroke-width="1.2"/>' for x, y in ((22, 50), (26, 53), (30, 55), (34, 55), (38, 53), (42, 50))) + '<circle cx="32" cy="58.5" r="2.4" fill="#e8202a"/>',
    'face': '<path d="M24 20 Q28 18 31 20 M33 20 Q36 18 40 20" stroke="#111" stroke-width="1" fill="none" opacity=".5"/><circle cx="32" cy="23" r="1.4" fill="#e8202a"/>', 'eyes': 'closed', 'mouthd': 'M29.5 39 Q32 40.5 34.5 39'}, S))
add('ink', 'The Brawler', 'character', '#fff', SPEED + bust({'skin': 't', 'hair': 'spiky', 'hairc': '#111', 'shirt': '#fff', 'torso': P('M4 64 Q6 48 20 46 L24 64Z M60 64 Q58 48 44 46 L40 64Z', '#111'),
    'face': '<rect x="35" y="35" width="7" height="3" rx=".5" fill="#fff" stroke="#111" stroke-width="1.1" transform="rotate(-20 38 36)"/><path d="M36.5 34.5 L38 38.5 M39.5 33.6 L40.8 37.4" stroke="#111" stroke-width=".7"/>' + P('M17 21 L47 21 L46 25 L18 25Z', '#e8202a', ' stroke="#111" stroke-width="1.4"') + P('M46 22 L54 18 L52 24 L58 26 L46 25Z', '#e8202a', ' stroke="#111" stroke-width="1.2"'), 'eyes': 'ink', 'mouthd': 'M28.5 39.5 L31 38 L33 39.5 L35.5 38'}, S))
add('ink', 'The Sensei', 'character', '#fff', bust({'skin': 'l', 'hair': 'tufts', 'hairc': '#111', 'shirt': '#fff', 'back': 'knot', 'torso': P('M18 48 L32 62 L46 48', 'none', stk),
    'face': P('M22 37 Q22 56 32 62 Q30 52 32 44 Q34 52 32 62 Q42 56 42 37 Q37 41 32 39 Q27 41 22 37Z', '#fff', ' stroke="#111" stroke-width="1.6"') + '<path d="M28 44 Q30 52 31 58 M36 44 Q34 52 33 58" stroke="#111" stroke-width=".7" fill="none"/>' + mustache('#111') + '<path d="M22.5 27 L30 29 M34 29 L41.5 27" stroke="#111" stroke-width="3.2" stroke-linecap="round"/>', 'eyes': 'closed', 'mouth': False}, S) + SEAL(51, 51))
add('ink', 'The Kunoichi', 'character', '#fff', SPEED + bust({'skin': 'd', 'back': 'long', 'hair': 'fringe', 'hairc': '#111', 'shirt': '#111',
    'face': P('M19.6 33 Q32 31 44.4 33 L43.5 40 Q32 49 20.5 40Z', '#111') + '<path d="M44 34 Q52 30 58 34 M44 37 Q52 37 56 41" stroke="#111" stroke-width="2.2" fill="none" stroke-linecap="round"/>' + P('M17 22 L47 22 L46 25.5 L18 25.5Z', '#e8202a', ' stroke="#111" stroke-width="1.3"'), 'eyes': 'ink', 'mouth': False}, S))
add('ink', 'Ink Tiger', 'emblem', '#fff',
    P('M10 30 Q10 12 20 10 L26 18 Q32 16 38 18 L44 10 Q54 12 54 30 Q56 48 44 54 Q32 60 20 54 Q8 48 10 30Z', '#fff', stk) +
    '<g fill="#111"><path d="M30 18 L32 26 L34 18Z M22 22 Q26 24 24 28 Q22 25 20 26Z M42 22 Q38 24 40 28 Q42 25 44 26Z M12 34 Q18 34 20 38 Q16 37 12 38Z M52 34 Q46 34 44 38 Q48 37 52 38Z M14 44 Q19 43 22 46 Q17 46 15 48Z M50 44 Q45 43 42 46 Q47 46 49 48Z"/></g>' +
    P('M18 30 L28 32 L24 35Z M46 30 L36 32 L40 35Z', '#111') + P('M27 41 L37 41 L32 46Z', '#e8202a', ' stroke="#111" stroke-width="1.4"') + '<path d="M32 46 V49 M26 50 Q32 53 38 50" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>')
add('ink', 'The Crane', 'emblem', '#fff',
    '<circle cx="44" cy="20" r="11" fill="#e8202a"/>' +
    P('M6 40 Q18 22 32 30 Q28 18 34 14 Q38 12 40 16 Q36 18 37 26 Q38 36 30 42 Q42 40 58 46 Q40 50 26 48 Q14 48 6 40Z', '#fff', stk) +
    P('M6 40 Q12 36 18 38 Q12 42 10 44Z M58 46 Q50 44 46 46 Q52 49 56 50Z', '#111') + '<circle cx="36.5" cy="14" r="2.4" fill="#e8202a"/><path d="M40 16 L50 22" stroke="#111" stroke-width="1.8" stroke-linecap="round"/><path d="M28 48 L26 62 M32 48 L33 62" stroke="#111" stroke-width="1.6"/>')
add('ink', 'Enso Sun', 'emblem', '#fff',
    '<path d="M48 14 Q60 26 54 42 Q46 58 28 56 Q10 52 9 34 Q9 16 26 10 Q36 7 44 12" fill="none" stroke="#111" stroke-width="7" stroke-linecap="round"/><path d="M44 12 Q47 13 49 16" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M14 46 Q20 54 30 56" fill="none" stroke="#f5f2ea" stroke-width="1" opacity=".8"/>' +
    '<circle cx="32" cy="33" r="10" fill="#e8202a"/>' + SEAL(48, 50))

# =====================================================================
# PIXEL — 16x16 pixel art at 4px per pixel (blocky, crisp), warm tavern palette
# =====================================================================
PXC = {'.': None, 'k': '#1a1220', 'K': '#2b1d2e', 's': '#e8b48a', 'S': '#c08460', 'd': '#8c5a3c', 'D': '#5a3424',
       'g': '#e0a83a', 'G': '#a8741a', 'y': '#ffe08a', 'r': '#c2303a', 'R': '#8a1c2a', 'b': '#3a5aa8', 'B': '#1a2450', 'c': '#6a8ad8',
       'w': '#f6efe0', 'W': '#d8ccb8', 'a': '#8a7f8f', 'A': '#4f4558', 'p': '#9a5aa8', 'P': '#6a3a7a', 'e': '#46854f', 'E': '#2e5a3a',
       'o': '#d9702c', 'O': '#a8481c', 'n': '#6b2d12', 'h': '#3a2216', 'v': '#5a9a5a', 'l': '#ff9a3c', 'L': '#ffd36b'}
def pix(rows, bg):
    rows = [r.ljust(14, '.') for r in rows]
    out = []
    for y, r in enumerate(rows):
        x = 0
        while x < len(r):
            ch = r[x]; n = 1
            while x + n < len(r) and r[x + n] == ch: n += 1
            if PXC.get(ch): out.append(f'<rect x="{4 + x * 4}" y="{4 + y * 4}" width="{n * 4}" height="4" fill="{PXC[ch]}"/>')
            x += n
    return f'<g shape-rendering="crispEdges">{"".join(out)}</g>'
# 14x14 grids inside the 4px wood frame
add('pixel', 'The Knight', 'character', '#3b3346', pix([
    '..............',
    '.....kkkk.....',
    '....kaWWak..r.',
    '...kaWWWWak.r.',
    '...kWWWWWWkrr.',
    '...kAkkkkAk...',
    '...kWkyykWk...',
    '...kAWWWWAk...',
    '....kaWWak....',
    '..kkkkaakkkk..',
    '.kaWWkggkWWak.',
    '.kWWWkggkWWWk.',
    '.kaWWWkkWWWak.',
    '.kaWWWWWWWWak.'], ''))
add('pixel', 'The Wizard', 'character', '#22325a', pix([
    '......kk......',
    '.....kPPk..y..',
    '....kPpPk.....',
    '....kPPPPk....',
    '...kPPyPPPk...',
    '..kkkkkkkkkk..',
    '....ksssssk...',
    '....kkskskk...',
    '....kwssssw...',
    '...kwwwwwwwk..',
    '..kPkwwwwwkPk.',
    '.kPPPkwwwkPPPk',
    '.kPpPPkwkPPpPk',
    '.kPPPPPkPPPPPk'], ''))
add('pixel', 'The Rogue', 'character', '#1f3b2a', pix([
    '..............',
    '....kkkkkk....',
    '...kEEEEEEk...',
    '..kEEeeeeEEk..',
    '..kEkkkkkkEk..',
    '..kEksssssEk..',
    '..kEkkskkkEk..',
    '..kEsssssskk..',
    '..kEEDDDDEEk..',
    '..kEEEDDEEEk..',
    '.kEEEEEEEEEEk.',
    '.kEeEEhhEEeEk.',
    '.kEEEEhgEEEEk.',
    '.kEeEEhhEEeEk.'], ''))
add('pixel', 'The Bard', 'character', '#5a2a1a', pix([
    '.........w....',
    '.....kkkkwk...',
    '....krrrrrk...',
    '...krrrrrrrkk.',
    '..kkkkkkkkkk..',
    '....knsssnk...',
    '....kkskskk...',
    '....ksssssk...',
    '....kssDssk...',
    '...kkssssskkk.',
    '..kbbkkkkkkgGk',
    '.kbbbbbbbkgyGk',
    '.kbcbbbbbkkgk.',
    '.kbbbbbbbbkk..'], ''))
add('pixel', 'The Innkeeper', 'character', '#4a3020', pix([
    '..............',
    '....kkkkkk....',
    '...kWWWWWWk...',
    '...kWkddkWk...',
    '...kdddddddk..',
    '...kdkdddkdk..',
    '...kdddddddk..',
    '...kOOOOOOOk..',
    '...kkOOOOOkk..',
    '..kkkkOOOkkkk.',
    '.kwwwwkkkwwwwk',
    '.kwwwwWWWwwwwk',
    '.kWwwwwwwwwwWk',
    '.kwwwwwwwwwwwk'], ''))
add('pixel', 'Tavern Cat', 'emblem', '#3a5a8a', pix([
    '..............',
    '..k.......k...',
    '.kok.....kok..',
    '.kook...kook..',
    '.koookkkooook.',
    '.kooooooooook.',
    '.koykoooykook.',
    '.kokkoooKkook.',
    '.kooowwwooook.',
    '.kowwwrwwwok..',
    '..kowwwwwok...',
    '...kkoooKk....',
    '....kooook....',
    '....kkkkkk....'], ''))
add('pixel', 'Little Dragon', 'emblem', '#2a2433', pix([
    '..............',
    '..k......k....',
    '.kek....kek...',
    '.kvekkkkeek...',
    '.kvveeeeeeek..',
    '.kvekyeeekyk..',
    '.kveekkeeekk..',
    '..keeeeeeeeek.',
    '..kevvkkkkkk..',
    '.kkevvvk.lll..',
    'kEkkevvk.lLLl.',
    'kEEkkeek.lll..',
    '.kEEkkkk......',
    '..kk..........'], ''))
add('pixel', 'Treasure Chest', 'emblem', '#141d38', pix([
    '..............',
    '..............',
    '...kkkkkkkk...',
    '..kOooooooOk..',
    '.kOooooooooOk.',
    '.kggggggggggk.',
    '.kOooogkoooOk.',
    '.kkkkkgykkkkk.',
    '.kOoookkooooOk',
    '.kOooooooooOk.',
    '.kgoooooooogk.',
    '.kOooooooooOk.',
    '.kkkkkkkkkkkk.',
    '..............'], ''))

# =====================================================================
# TRAIN — night-train art deco poster: window frame, sunburst, flat lamp-lit shapes, no outlines
# =====================================================================
S = {'ol': '#0d1a12', 'olw': 0, 'shade': True, 'eye': '#14202c', 'mouth': '#7a3a2a'}
def deco(bg, col='#ffd36b', op=.16):
    rays = ''.join(f'<path d="M32 70 L{32 + 80 * __import__("math").cos(-a):.1f} {70 + 80 * __import__("math").sin(-a):.1f}" stroke="{col}" stroke-width="2.4" stroke-opacity="{op}"/>' for a in [i * 0.157 + 0.4 for i in range(15)])
    return rays
def stars():
    return ''.join(f'<circle cx="{x}" cy="{y}" r=".7" fill="#eaf2f0" opacity=".8"/>' for x, y in ((10, 12), (52, 9), (56, 30), (8, 34), (46, 16)))
add('train', 'The Conductor', 'character', '#1d3a56', deco(0) + bust({'skin': 'm', 'hair': 'tufts', 'hairc': '#3a2a20', 'shirt': '#1f4a6a', 'torso': lapels('#16304a') + '<circle cx="32" cy="56" r="1.3" fill="#ffd36b"/><circle cx="32" cy="61" r="1.3" fill="#ffd36b"/><path d="M38 58 Q44 60 46 56" stroke="#ffd36b" stroke-width="1" fill="none"/><circle cx="46" cy="56" r="1.6" fill="#ffd36b"/>',
    'face': mustache('#3a2a20'), 'mouth': False, 'hat': cap_conductor('#16304a', '#0a1826', '#ffd36b', '')}, S))
add('train', 'The Stoker', 'character', '#5a2a1a', deco(0, '#ff7a3d', .22) + bust({'skin': 'd', 'hair': 'short', 'hairc': '#1a1410', 'shirt': '#3a4a5a', 'torso': P('M18 49 L22 64 M46 49 L42 64', 'none', ' stroke="#a9bec0" stroke-width="2"') + P('M24 47 Q32 52 40 47 L40 50 Q32 55 24 50Z', '#ff7a3d'),
    'face': '<g><rect x="20" y="19" width="24" height="3" fill="#2a2420"/><circle cx="26" cy="20.5" r="4" fill="#ffb23e" stroke="#2a2420" stroke-width="1.6"/><circle cx="38" cy="20.5" r="4" fill="#ffb23e" stroke="#2a2420" stroke-width="1.6"/><path d="M24.5 19 L26 18" stroke="#fff" stroke-width="1"/></g><path d="M24 37 Q26 38 25 40 M40 35 Q38 37 40 38" stroke="#1a1410" stroke-width="1" opacity=".5" fill="none"/>', 'eyes': 'dot'}, S))
add('train', 'The Traveller', 'character', '#2a4a3a', deco(0, '#8fc93a', .16) + bust({'skin': 'l', 'back': 'bob', 'hair': 'part', 'hairc': '#7a3a1a', 'shirt': '#c9a15b', 'torso': P('M22 47 L18 64 L26 64 L32 52Z', '#8fc93a') + '<circle cx="34" cy="55" r="1" fill="#14202c"/><circle cx="34" cy="60" r="1" fill="#14202c"/>', 'eyes': 'closed', 'mouthc': '#c2303a',
    'hat': P('M16 30 Q14 10 32 10 Q50 10 48 30 Q42 22 32 22 Q22 22 16 30Z', '#14202c') + P('M17 25 Q32 18 47 25 L47.6 28 Q32 21 16.4 28Z', '#8fc93a') + P('M40 20 Q48 14 50 18 Q46 19 44 23Z', '#ff7a3d')}, S))
add('train', 'The Porter', 'character', '#3a1a2a', deco(0) + bust({'skin': 't', 'hair': 'short', 'hairc': '#1a1410', 'shirt': '#7a1a2e', 'torso': ''.join(f'<circle cx="38" cy="{y}" r="1.1" fill="#ffd36b"/>' for y in (52, 56, 60)) + P('M24 47 L32 50 L40 47 L40 49 L32 52 L24 49Z', '#ffd36b'), 'mouthd': 'M28.5 38 Q32 41 35.5 38',
    'hat': P('M21 21 L22 10 L42 10 L43 21Z', '#7a1a2e') + P('M21 18 H43 V21 H21Z', '#ffd36b') + P('M22 10 H42 V11.5 H22Z', '#ffd36b')}, S))
add('train', 'The Stationmaster', 'character', '#14202c', deco(0, '#c9a15b', .2) + bust({'skin': 'l', 'hair': 'tufts', 'hairc': '#d8d0c0', 'shirt': '#0a1826', 'torso': lapels('#1d3a56') + vneck('#eaf2f0') + P('M29 48 L32 51 L35 48 L32 58Z', '#ff7a3d') + '<path d="M44 52 L46 50 L48 52 L46 54Z" fill="#ffd36b"/>',
    'face': beard('#d8d0c0') + mustache('#ece4d4') + glasses('#ffd36b', 1), 'mouth': False, 'hat': tophat('#0a1826', '#ff7a3d', '')}, S))
add('train', 'Night Owl', 'emblem', '#12263a', stars() + '<circle cx="50" cy="13" r="6" fill="#ffd36b"/><circle cx="53" cy="11" r="5.4" fill="#12263a"/>' +
    P('M16 56 Q12 36 18 24 L16 14 L24 20 Q32 17 40 20 L48 14 L46 24 Q52 36 48 56Z', '#5a4030') + P('M20 44 Q32 34 44 44 Q44 56 32 58 Q20 56 20 44Z', '#c9a15b') + ''.join(f'<path d="M{x} {y} q2 2 4 0" stroke="#5a4030" stroke-width="1" fill="none"/>' for x, y in ((24, 46), (30, 44), (36, 46), (27, 51), (33, 51))) +
    '<circle cx="25.5" cy="31" r="6.5" fill="#eaf2f0"/><circle cx="38.5" cy="31" r="6.5" fill="#eaf2f0"/><circle cx="25.5" cy="31" r="3.4" fill="#ffb23e"/><circle cx="38.5" cy="31" r="3.4" fill="#ffb23e"/><circle cx="25.5" cy="31" r="1.7" fill="#0a1826"/><circle cx="38.5" cy="31" r="1.7" fill="#0a1826"/>' +
    P('M30 37 L34 37 L32 41Z', '#ff7a3d') + '<path d="M4 60 H60" stroke="#3a2a20" stroke-width="3"/>')
add('train', 'Night Express', 'emblem', '#1d3a56', deco(0, '#ffd36b', .22) +
    P('M14 58 L14 24 Q14 12 32 12 Q50 12 50 24 L50 58Z', '#0a1826') + P('M18 26 Q18 16 32 16 Q46 16 46 26 L46 34 L18 34Z', '#2a4a6a') + P('M20 26 Q20 18 32 18 Q44 18 44 26 L44 32 L20 32Z', '#ffd36b', extra=' opacity=".85"') +
    '<circle cx="32" cy="44" r="5.5" fill="#fff6d0"/><circle cx="32" cy="44" r="8.5" fill="#ffd36b" opacity=".25"/><rect x="18" y="52" width="28" height="3" fill="#c9a15b"/><path d="M14 58 L4 64 M50 58 L60 64 M22 58 L19 64 M42 58 L45 64" stroke="#a9bec0" stroke-width="1.6"/>' +
    P('M14 38 H18 M46 38 H50', 'none', ' stroke="#c9a15b" stroke-width="1.4"'))
add('train', 'Moonline', 'emblem', '#0a1826', stars() +
    '<circle cx="32" cy="26" r="15" fill="#ffd36b"/><circle cx="38" cy="22" r="13" fill="#0a1826"/>' +
    P('M2 50 Q20 44 32 46 Q46 48 62 42 L62 64 L2 64Z', '#16304a') + '<path d="M2 54 Q24 48 62 50" stroke="#c9a15b" stroke-width="1.4" fill="none"/><path d="M2 58 Q24 52 62 54" stroke="#c9a15b" stroke-width="1.4" fill="none"/>' +
    ''.join(f'<path d="M{x} {52.5 - (x - 2) * .03} L{x - 1} {58 - (x - 2) * .06}" stroke="#a9bec0" stroke-width="1.2"/>' for x in range(6, 62, 6)) +
    '<rect x="12" y="41" width="22" height="6" rx="2" fill="#8fc93a"/><rect x="14" y="42.5" width="3" height="2" fill="#ffd36b"/><rect x="19" y="42.5" width="3" height="2" fill="#ffd36b"/><rect x="24" y="42.5" width="3" height="2" fill="#ffd36b"/><rect x="29" y="42.5" width="3" height="2" fill="#ffd36b"/>')

# =====================================================================
# EDO — woodblock (ukiyo-e): keyline in sumi, flat indigo/vermilion/ochre, bokashi sky band, kamon ring
# =====================================================================
SU, IN, VR, OC = '#2a1d18', '#22356b', '#d2422d', '#c9a23a'
S = {'ol': SU, 'olw': 1.3, 'eye': SU, 'eyes': 'wood', 'mouth': VR, 'skins': {'l': ('#f6e6cc', '#e6cfae'), 'm': ('#f0dcc0', '#dcc29f'), 't': ('#e2bf98', '#c9a27a'), 'd': ('#c9966a', '#a87a50')}}
ste = f' stroke="{SU}" stroke-width="1.3" stroke-linejoin="round"'
BOK = lambda c: f'<rect x="0" y="0" width="64" height="16" fill="{c}" opacity=".55"/><rect x="0" y="16" width="64" height="5" fill="{c}" opacity=".25"/>'
STRANDS = '<path d="M24 19 Q30 16 36 17 M22 23 Q28 19 34 20" stroke="#5a4a40" stroke-width=".6" fill="none"/>'
KIMONO = lambda a, b: P('M5 66 Q7 49 32 46 Q57 49 59 66Z', a, ste) + P('M24 46.5 L32 60 L40 46.5 L37 46 L32 54 L27 46Z', b, ste)
add('edo', 'The Samurai', 'character', '#efe3c8', BOK(IN) + bust({'skin': 'm', 'back': 'knot', 'hair': 'tight', 'hairc': SU, 'shirt': IN, 'torso': KIMONO(IN, '#efe3c8') + P('M6 52 L20 47 L22 54 L8 60Z M58 52 L44 47 L42 54 L56 60Z', '#3a4a7a', ste) + '<circle cx="14" cy="54" r="2" fill="none" stroke="#efe3c8" stroke-width=".8"/>',
    'face': STRANDS + P('M29 7 L32 3 L35 7 L33 13 L31 13Z', SU), 'mouthd': 'M29.5 39 L34.5 39'}, S))
add('edo', 'The Maiko', 'character', '#f2d6c8', BOK(VR) + bust({'skin': 'l', 'back': 'wide', 'hair': 'part', 'hairc': SU, 'shirt': VR, 'torso': KIMONO(VR, OC) + ''.join(f'<circle cx="{x}" cy="{y}" r="1.4" fill="#efe3c8" opacity=".8"/>' for x, y in ((12, 56), (18, 60), (48, 58), (52, 54))),
    'face': '<path d="M29 39 Q32 37.5 35 39 Q32 41 29 39Z" fill="#d2422d"/>' + P('M42 13 L50 7', 'none', f' stroke="{OC}" stroke-width="1.4"') + f'<circle cx="50.5" cy="6.5" r="2.4" fill="{VR}" stroke="{SU}" stroke-width="1"/>' + P('M16 22 L10 18', 'none', f' stroke="{OC}" stroke-width="1.4"') + f'<circle cx="21" cy="14" r="3" fill="#e9a9b4" stroke="{SU}" stroke-width="1"/>', 'eyes': 'closed', 'mouth': False}, S))
add('edo', 'Kabuki Star', 'character', '#efe3c8', BOK(OC) + bust({'skin': 'l', 'hair': 'slick', 'hairc': SU, 'shirt': OC, 'torso': KIMONO('#3a7a5a', OC) + P('M10 56 L18 50 L22 58 L14 62Z M54 56 L46 50 L42 58 L50 62Z', OC, ste),
    'face': '<g fill="none" stroke="#d2422d" stroke-width="1.6" stroke-linecap="round"><path d="M23 26 Q20 22 21 18 M41 26 Q44 22 43 18 M24 34 Q22 38 24 42 M40 34 Q42 38 40 42 M29 41 Q32 44 35 41"/></g><path d="M23 28.5 L30 30 M34 30 L41 28.5" stroke="#2a1d18" stroke-width="2.2" stroke-linecap="round"/>', 'eyes': 'dot', 'mouthd': 'M29 38.5 Q32 37 35 38.5'}, S))
add('edo', 'The Fisherman', 'character', '#dfe6e8', BOK('#5a8aa8') + bust({'skin': 'd', 'hair': 'short', 'hairc': SU, 'shirt': '#5a8aa8', 'torso': KIMONO('#5a8aa8', '#efe3c8') + ''.join(f'<path d="M{x} 52 q3 -3 6 0" stroke="#efe3c8" stroke-width="1" fill="none"/>' for x in (10, 44, 16, 50)),
    'face': P('M19 22 L45 22 L44.6 26 L19.4 26Z', '#efe3c8', ste) + P('M43 22 L50 18 L49 24 L52 28 L44 25Z', '#efe3c8', ste) + '<path d="M22 24 H42" stroke="#22356b" stroke-width=".8"/>', 'mouthd': 'M28.5 38 Q32 41 35.5 38'}, S))
add('edo', 'The Merchant', 'character', '#efe3c8', BOK('#3a7a5a') + bust({'skin': 't', 'hair': 'tufts', 'hairc': SU, 'shirt': '#6b4a2e', 'torso': KIMONO('#6b4a2e', '#3a7a5a') + '<circle cx="48" cy="56" r="5" fill="#c9a23a" stroke="#2a1d18" stroke-width="1.2"/><rect x="46.6" y="54.6" width="2.8" height="2.8" fill="#efe3c8" stroke="#2a1d18" stroke-width=".7"/>',
    'face': P('M26 17 Q32 14 38 17 L38 19 Q32 17 26 19Z', SU) + '<path d="M26 37 Q24 39 25 41 M38 37 Q40 39 39 41" stroke="#2a1d18" stroke-width=".7" fill="none"/>', 'eyes': 'closed', 'mouthd': 'M28 38 Q32 42 36 38'}, S))
add('edo', 'Wave Crest', 'emblem', '#efe3c8', BOK(IN) +
    P('M2 64 L2 44 Q8 26 26 22 Q42 20 46 32 Q40 26 34 30 Q30 34 36 38 Q30 40 28 34 Q24 42 32 48 Q44 52 62 44 L62 64Z', IN, ste) +
    P('M26 22 Q34 18 42 22 L40 25 L44 26 L41 29 Q38 25 34 26Z', '#efe3c8', ste) + '<path d="M8 50 Q16 40 26 38 M10 56 Q20 48 30 50 M40 56 Q50 54 58 50" stroke="#efe3c8" stroke-width="1.2" fill="none"/>' +
    '<circle cx="48" cy="14" r="6" fill="#d2422d"/>' + ''.join(f'<circle cx="{x}" cy="{y}" r="1.2" fill="#efe3c8" stroke="{SU}" stroke-width=".6"/>' for x, y in ((44, 24), (47, 28), (42, 20))))
add('edo', 'Lucky Koi', 'emblem', '#dfe6e8',
    ''.join(f'<path d="M{x} {y} q4 -3 8 0" stroke="#5a8aa8" stroke-width="1" fill="none"/>' for x, y in ((6, 14), (44, 52), (10, 50), (48, 12))) +
    P('M14 40 Q14 22 32 18 Q46 16 52 28 Q46 30 44 36 Q40 46 26 48 L18 56 L16 46 L8 46Z', '#efe3c8', ste) +
    P('M24 22 Q32 20 36 24 Q34 30 26 30Z M38 34 Q44 34 42 40 Q36 42 34 38Z', VR, ste.replace('1.3', '.8')) + P('M32 18 Q40 14 48 22', 'none', f' stroke="{SU}" stroke-width=".8"') +
    f'<circle cx="46" cy="25" r="1.6" fill="{SU}"/>' + P('M20 36 L14 38 L18 32Z', OC, ste.replace('1.3', '.8')) + '<path d="M26 34 q2 2 4 0 M30 38 q2 2 4 0 M24 40 q2 2 4 0" stroke="#2a1d18" stroke-width=".6" fill="none"/>')
add('edo', 'Beckoning Cat', 'emblem', '#f2d6c8', BOK(VR) +
    P('M16 62 L16 40 Q14 28 18 22 L18 12 L25 18 Q32 16 39 18 L46 12 L46 22 Q50 28 48 40 L48 62Z', '#fbf4e4', ste) +
    P('M46 40 L46 24 Q48 18 52 20 Q56 22 54 28 L52 40Z', '#fbf4e4', ste) + P('M20 16 L24 19 L20 21Z M44 16 L40 19 L44 21Z', VR) +
    '<path d="M23 30 Q26 28 29 30 M35 30 Q38 28 41 30" stroke="#2a1d18" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M30.5 34 L33.5 34 L32 35.6Z" fill="#d2422d"/><path d="M28 37 Q32 39.5 36 37" stroke="#2a1d18" stroke-width="1" fill="none"/>' +
    P('M16 42 Q32 46 48 42 L48 45 Q32 49 16 45Z', VR, ste) + f'<circle cx="32" cy="48.5" r="3" fill="{OC}" stroke="{SU}" stroke-width="1"/>' + f'<ellipse cx="26" cy="22" rx="3" ry="1.6" fill="{OC}" opacity=".0"/><circle cx="44" cy="22" r="0" />' + '<path d="M18 52 Q22 50 24 54 M40 54 Q42 50 46 52" stroke="#2a1d18" stroke-width=".7" fill="none"/><ellipse cx="38" cy="22" rx="3.4" ry="2.2" fill="#2a1d18" opacity=".85"/>')


def main():
    order = 'classic noir ivory velvet cyber ink pixel train edo'.split()
    data = {k: AV[k] for k in order}
    for k, v in data.items():
        assert len(v) == 8, (k, len(v))
        assert sum(a['kind'] == 'character' for a in v) == 5, k
    with open(os.path.join(HERE, 'avatars.json'), 'w') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print('wrote', sum(len(v) for v in data.values()), 'avatars')


if __name__ == '__main__':
    main()
