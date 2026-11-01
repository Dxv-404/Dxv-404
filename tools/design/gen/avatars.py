"""Parametric bust portraits for the avatar list. One geometry, drawn in each theme's own style."""
HAIR_BACK = {
 0: '',
 1: 'M27 50 Q24 15 50 14 Q76 15 73 50 L73 64 Q66 66 64 58 L64 42 L36 42 L36 58 Q34 66 27 64Z',
 2: 'M25 52 Q22 13 50 12 Q78 13 75 52 L78 82 Q64 80 62 68 L38 68 Q36 80 22 82Z',
 3: 'M41 10 a9 8 0 1 1 18 0 a9 8 0 1 1 -18 0Z',
 4: '',
 5: '',
}
HAIR_FRONT = {
 0: 'M30 42 Q28 17 50 16 Q72 17 70 42 Q66 30 56 28 Q46 34 36 31 Q32 35 30 42Z',
 1: 'M30 40 Q31 18 50 17 Q69 18 70 40 Q61 31 50 35 Q39 31 30 40Z',
 2: 'M29 42 Q29 16 52 15 Q71 16 71 38 Q58 22 44 30 Q35 34 29 42Z',
 3: 'M31 37 Q32 19 50 19 Q68 19 69 37 Q60 28 50 28 Q40 28 31 37Z',
 4: 'M29 41 L27 24 L36 28 L37 14 L46 23 L51 9 L56 22 L64 12 L65 26 L73 24 L71 41 Q62 31 50 32 Q38 31 29 41Z',
 5: 'M29 35 Q29 15 50 15 Q71 15 71 35 L71 39 L29 39Z',
}
SKIN = [('#f3d2b8', '#dcb093'), ('#e2b28e', '#c48f6c'), ('#c68e66', '#a6704c'), ('#8d5a3b', '#6f4329')]

def bust(p, st):
    o, ow = st.get('ol', '#1a1a1a'), st.get('olw', 1.6)
    sk, sks = (st['skin'] or SKIN)[p['skin']]
    hair = st['hair'][p['hue'] - 1]
    shirt = st['shirt'][p['hue'] - 1]
    stroke = f'stroke="{o}" stroke-width="{ow}" stroke-linejoin="round"' if ow else ''
    s = ''
    if HAIR_BACK[p['hair']]: s += f'<path d="{HAIR_BACK[p["hair"]]}" fill="{hair}" {stroke}/>'
    s += f'<path d="M10 104 Q14 76 50 71 Q86 76 90 104Z" fill="{shirt}" {stroke}/>'
    if st.get('collar'): s += f'<path d="M40 73 L50 86 L60 73" fill="none" stroke="{st["collar"]}" stroke-width="3"/>'
    s += f'<path d="M43 58 L43 74 Q50 78 57 74 L57 58Z" fill="{sks}"/>'
    s += f'<ellipse cx="50" cy="45" rx="20" ry="23" fill="{sk}" {stroke}/>'
    if st.get('shade'): s += f'<path d="M62 30 Q72 45 62 64 Q66 52 60 40Z" fill="{sks}" opacity=".8"/>'
    s += f'<path d="{HAIR_FRONT[p["hair"]]}" fill="{hair}" {stroke}/>'
    if p['hair'] == 3: s += f'<circle cx="50" cy="12" r="7" fill="{hair}" {stroke}/>'
    if st.get('streak') and p['hue'] in (2, 5, 6): s += f'<path d="M58 20 Q66 26 64 38 L61 37 Q62 28 56 22Z" fill="{st["streak"]}"/>'
    ey = st.get('eyes', 'dot'); ec = st.get('eye', '#1a1a1a')
    if ey == 'anime':
        for x in (42, 58):
            s += f'<path d="M{x-5} 47 Q{x} 43 {x+5} 47 Q{x} 52 {x-5} 47Z" fill="#fff"/><circle cx="{x}" cy="47.6" r="2.6" fill="{st.get("iris", "#7b3cff")}"/><circle cx="{x}" cy="47.8" r="1.1" fill="#120a18"/><circle cx="{x+1}" cy="46.6" r=".7" fill="#fff"/><path d="M{x-5.5} 46.5 Q{x} 42.5 {x+5.5} 46.5" fill="none" stroke="{o}" stroke-width="1.6" stroke-linecap="round"/>'
    elif ey == 'ink':
        s += f'<path d="M37 46 L46 45 M54 45 L63 46" stroke="{ec}" stroke-width="2.6" stroke-linecap="round"/><circle cx="42" cy="48.5" r="1.8" fill="{ec}"/><circle cx="58" cy="48.5" r="1.8" fill="{ec}"/>'
    elif ey == 'wood':
        s += f'<path d="M37 47 Q42 44.5 47 47 M53 47 Q58 44.5 63 47" stroke="{ec}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M38 41 Q42 39 46 41 M54 41 Q58 39 62 41" stroke="{ec}" stroke-width="1.1" fill="none"/>'
    else:
        s += f'<circle cx="43" cy="47" r="2" fill="{ec}"/><circle cx="57" cy="47" r="2" fill="{ec}"/>'
    s += f'<path d="M46 57 Q50 59.5 54 57" fill="none" stroke="{st.get("mouth", o)}" stroke-width="1.5" stroke-linecap="round"/>'
    if st.get('cheek'): s += f'<ellipse cx="38" cy="53" rx="3.2" ry="1.8" fill="{st["cheek"]}"/><ellipse cx="62" cy="53" rx="3.2" ry="1.8" fill="{st["cheek"]}"/>'
    a = p['acc']
    if a == 1: s += f'<g fill="none" stroke="{st.get("acc", o)}" stroke-width="1.5"><rect x="35" y="43" width="12" height="9" rx="3"/><rect x="53" y="43" width="12" height="9" rx="3"/><path d="M47 46 L53 46"/></g>'
    if a == 2: s += f'<circle cx="30" cy="54" r="2.6" fill="none" stroke="{st.get("accc", "#c8a96a")}" stroke-width="1.2"/>'
    if a == 3: s += f'<path d="M28 46 Q28 18 50 17 Q72 18 72 46" fill="none" stroke="{st.get("accc", "#ffd23f")}" stroke-width="3"/><rect x="24" y="40" width="7" height="13" rx="3" fill="{st.get("accc", "#ffd23f")}"/><rect x="69" y="40" width="7" height="13" rx="3" fill="{st.get("accc", "#ffd23f")}"/>'
    if st.get('tone'): s += f'<path d="{HAIR_FRONT[p["hair"]]}" fill="url(#tone)"/>'
    return s

PHOTO = lambda st: (f'<rect width="100" height="100" fill="{st.get("photobg", "#9aa")}"/><circle cx="50" cy="42" r="18" fill="#e6b896"/>'
                    '<path d="M30 40 Q30 18 50 18 Q72 18 70 42 Q66 30 54 30 Q40 32 30 40Z" fill="#2a1d18"/><path d="M14 104 Q18 74 50 68 Q82 74 86 104Z" fill="#c2304a"/>'
                    '<circle cx="43" cy="44" r="1.6" fill="#222"/><circle cx="57" cy="44" r="1.6" fill="#222"/><path d="M45 52 Q50 55 55 52" stroke="#222" stroke-width="1.4" fill="none"/>'
                    '<rect width="100" height="100" fill="url(#photoGrain)" opacity=".25"/>')
