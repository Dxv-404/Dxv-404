"""Vex, the Cyber dealer: anime croupier, cel-shaded, deadpan. Built from parts so every pose stays on-model."""
O = '#1a0f22'; SK = '#f4cdb8'; SKS = '#dca592'; HR = '#1d1428'; HR2 = '#33223f'; MG = '#ff2e88'
SH = '#e9e0f7'; SHS = '#bba9d8'; VS = '#1b1222'; VS2 = '#2e2040'; GL = '#17101d'
ST = f'stroke="{O}" stroke-width="1.7" stroke-linejoin="round"'

def chair(): return f'<path d="M34 200 L40 102 Q42 90 54 88 L146 88 Q158 90 160 102 L166 200Z" fill="#2a1435" {ST}/><path d="M48 104 L52 96 L148 96 L152 104" fill="none" stroke="{MG}" stroke-width="1.4" opacity=".8"/>'
def torso():
    return (f'<path d="M26 200 Q28 152 62 138 L86 129 L114 129 L138 138 Q172 152 174 200Z" fill="{SH}" {ST}/>'
            f'<path d="M150 150 Q168 162 172 200 L156 200 Q154 172 146 160Z" fill="{SHS}"/><path d="M50 150 Q34 162 30 200 L44 200Z" fill="{SHS}" opacity=".6"/>'
            f'<path d="M64 200 L69 152 L88 133 L100 152 L112 133 L131 152 L136 200Z" fill="{VS}" {ST}/>'
            f'<path d="M78 150 L76 200 M122 150 L124 200" stroke="{VS2}" stroke-width="2"/><rect x="74" y="160" width="12" height="3" rx="1" fill="{MG}"/>'
            f'<path d="M86 129 L100 147 L93 152 L82 134Z M114 129 L100 147 L107 152 L118 134Z" fill="#fbf7ff" {ST}/>'
            f'<path d="M96 145 L104 145 L106 152 L102 196 L98 196 L94 152Z" fill="#0f0a14" {ST}/>')
def neck(): return f'<path d="M89 110 L89 131 Q100 137 111 131 L111 110Z" fill="{SKS}" {ST}/>'
def hair_back(): return f'<path d="M62 96 Q52 48 92 36 Q134 28 144 66 Q150 92 138 118 L126 98 Q124 70 100 66 Q76 68 74 96 L64 118Z" fill="{HR}" {ST}/><path d="M134 70 Q144 92 136 116 L130 104Z" fill="{MG}"/>'
def face(): return (f'<path d="M72 78 Q71 106 94 120 Q102 124 110 119 Q129 106 128 78 Q127 52 100 50 Q73 52 72 78Z" fill="{SK}" {ST}/>'
                    f'<path d="M73 84 Q100 94 127 84 L127 77 Q100 88 73 77Z" fill="{SKS}" opacity=".55"/>'
                    f'<path d="M68 88 Q64 96 70 104 L74 100Z" fill="{SK}" {ST}/><circle cx="69" cy="104" r="3.2" fill="none" stroke="#cfd3e0" stroke-width="1.3"/>')
def bangs(up=False):
    d = ('M71 80 Q68 44 102 42 Q134 44 131 80 L125 68 L121 84 L115 64 L109 82 L103 62 L97 82 L91 64 L85 84 L79 68Z' if not up else
         'M71 74 Q66 38 102 34 Q136 38 131 74 L126 56 L120 72 L116 48 L108 70 L103 44 L96 70 L90 48 L84 72 L78 56Z')
    return (f'<path d="{d}" fill="{HR}" {ST}/><path d="M88 48 Q96 44 108 46" fill="none" stroke="{HR2}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M117 50 Q129 62 127 86 L123 84 Q123 66 113 54Z" fill="{MG}" {ST.replace("1.7", "1")}/>'
            f'<rect x="78" y="58" width="12" height="3" rx="1.2" fill="{MG}" transform="rotate(-24 84 59)"/><rect x="80" y="63" width="10" height="2.6" rx="1.2" fill="#ff7ab3" transform="rotate(-24 85 64)"/>'
            f'<path d="M101 42 Q96 28 108 24 Q103 33 106 42" fill="{HR}" {ST}/>'
            f'<path d="M73 82 Q66 102 71 122 L78 104Z M128 82 Q135 102 129 124 L122 104Z" fill="{HR}" {ST}/><path d="M129 112 L129 124 L124 112Z" fill="{MG}"/>')
def eyes(kind='half'):
    s = ''
    for x, side in ((88, -1), (113, 1)):
        if kind == 'closed':
            s += f'<path d="M{x-7} 87 Q{x} 91 {x+7} 87" fill="none" stroke="{O}" stroke-width="2.2" stroke-linecap="round"/>'; continue
        if kind == 'wink' and side == 1:
            s += f'<path d="M{x-7} 86 Q{x} 82 {x+7} 86" fill="none" stroke="{O}" stroke-width="2.4" stroke-linecap="round"/>'; continue
        wide = kind in ('wide', 'star')
        top = 80 if wide else 84
        s += f'<path d="M{x-7.5} 87 Q{x} {top-2} {x+7.5} 87 Q{x} 92.5 {x-7.5} 87Z" fill="#fff"/>'
        s += f'<ellipse cx="{x+.5}" cy="87.4" rx="4.2" ry="{5 if wide else 4.2}" fill="#ff4f9a"/><ellipse cx="{x+.5}" cy="88.6" rx="2.6" ry="2.4" fill="#b8185e"/><circle cx="{x+.5}" cy="87.8" r="1.6" fill="#3a0820"/>'
        s += f'<circle cx="{x+2}" cy="85.6" r="1.2" fill="#fff"/><circle cx="{x-1.2}" cy="89.6" r=".6" fill="#fff"/>'
        if kind == 'star': s += f'<path d="M{x+.5} 83 l1.2 3.2 3.2 1.2 -3.2 1.2 -1.2 3.2 -1.2 -3.2 -3.2 -1.2 3.2 -1.2Z" fill="#fff"/>'
        if not wide: s += f'<path d="M{x-8} 82 L{x+8} 82 L{x+8} 86 Q{x} 82.6 {x-8} 86Z" fill="{SK}"/>'
        s += f'<path d="M{x-8} {86 if not wide else 85} Q{x} {top - (1 if not wide else 3)} {x+8} {86 if not wide else 85}" fill="none" stroke="{O}" stroke-width="2.6" stroke-linecap="round"/>'
        s += f'<path d="M{x+6.5} {85 if not wide else 83} l3 -1.6" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/>' if side == 1 else f'<path d="M{x-6.5} {85 if not wide else 83} l-3 -1.6" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/>'
    return s
def brows(kind='flat'):
    if kind == 'up': return f'<path d="M80 74 Q88 70 95 73 M106 73 Q113 70 121 74" stroke="{HR}" stroke-width="2" fill="none" stroke-linecap="round"/>'
    if kind == 'raise': return f'<path d="M80 78 L95 78 M106 75 Q113 71 121 74" stroke="{HR}" stroke-width="2" fill="none" stroke-linecap="round"/>'
    return f'<path d="M81 78 L95 79 M106 79 L120 78" stroke="{HR}" stroke-width="2" stroke-linecap="round"/>'
def mouth(kind='flat'):
    m = {'flat': 'M96 106 Q100 105 105 106', 'smirk': 'M95 105 Q101 108 107 103', 'open': 'M95 104 Q101 101 107 104 Q106 112 101 112 Q96 112 95 104Z', 'smile': 'M94 104 Q101 110 108 104'}[kind]
    fill = '#7a1f3d' if kind == 'open' else 'none'
    return f'<path d="M101 93 L100 98" stroke="{SKS}" stroke-width="1.4" stroke-linecap="round"/><path d="{m}" fill="{fill}" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="82" cy="99" rx="4" ry="2" fill="#ff7ab3" opacity=".35"/><ellipse cx="119" cy="99" rx="4" ry="2" fill="#ff7ab3" opacity=".35"/>'
def glove(x, y, r=0, s=1): return f'<g transform="translate({x} {y}) rotate({r}) scale({s})"><rect x="-10" y="-9" width="20" height="19" rx="7" fill="{GL}" {ST}/><path d="M-6 -2 L6 -2 M-6 3 L6 3" stroke="#3a2a48" stroke-width="1.2"/><rect x="-10" y="6" width="20" height="5" rx="2" fill="{SK}" {ST.replace("1.7", "1.2")}/></g>'
def sleeve(path): return f'<path d="{path}" fill="{SH}" {ST}/>'

def vex(pose='idle', idle=True):
    head_t = {'idle': 'rotate(-7 100 90)', 'shuffle': 'rotate(3 100 90)', 'deal': 'rotate(-3 100 90)', 'turn': 'translate(0 -2) rotate(4 100 90)', 'big': 'translate(0 -6)', 'ship': 'rotate(-5 100 90)', 'wait': 'rotate(-9 100 90)'}[pose]
    ex = {'idle': ('half', 'flat', 'flat'), 'shuffle': ('half', 'flat', 'smirk'), 'deal': ('wink', 'raise', 'smirk'), 'turn': ('half', 'raise', 'flat'),
          'big': ('star', 'up', 'open'), 'ship': ('closed', 'flat', 'smile'), 'wait': ('half', 'flat', 'flat')}[pose]
    arms = ''; fx = ''
    if pose in ('idle', 'wait'):
        arms = sleeve('M128 200 L152 200 L140 126 L121 126Z') + glove(130, 112, -10) + sleeve('M36 200 Q54 176 94 178 L98 194 Q66 198 50 200Z') + glove(100, 186, 80)
    if pose == 'shuffle':
        arms = sleeve('M30 200 Q46 172 78 170 L82 186 Q56 192 48 200Z') + sleeve('M170 200 Q154 172 122 170 L118 186 Q144 192 152 200Z') + glove(84, 178, 70) + glove(116, 178, -70)
        fx = ''.join(f'<rect x="94" y="160" width="13" height="18" rx="2" fill="{c}" {ST.replace("1.7","1.2")} class="vx-rf {k}"/>' for c, k in (('#f1e9ff', ''), ('#2a1435', 'b'), ('#f1e9ff', 'c')))
    if pose == 'deal':
        arms = sleeve('M36 200 Q54 176 94 178 L98 194 Q66 198 50 200Z') + glove(100, 186, 80) + sleeve('M150 200 Q160 160 182 140 L192 152 Q172 170 168 200Z') + glove(186, 140, -40)
        fx = f'<g class="vx-fly"><rect x="186" y="116" width="14" height="19" rx="2" fill="#2a1435" {ST.replace("1.7","1.2")}/><path d="M193 121 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4Z" fill="{MG}"/></g><path d="M150 128 L176 120 M154 136 L178 130" stroke="{MG}" stroke-width="1.4" opacity=".7" class="vx-trail"/>'
    if pose == 'turn':
        arms = sleeve('M36 200 Q54 176 94 178 L98 194 Q66 198 50 200Z') + glove(100, 186, 80) + sleeve('M140 200 L160 200 L162 150 L146 146Z') + f'<g transform="translate(156 138) rotate(-14)"><rect x="-9" y="-8" width="18" height="17" rx="6" fill="{GL}" {ST}/><rect x="-3" y="-26" width="6" height="20" rx="3" fill="{GL}" {ST}/></g>'
        fx = f'<text x="150" y="60" font-family="Chakra Petch" font-weight="700" font-size="13" fill="{MG}" class="vx-pop">YOUR MOVE</text>'
    if pose == 'big':
        arms = sleeve('M30 200 Q30 170 50 160 L62 176 Q46 186 48 200Z') + sleeve('M170 200 Q170 170 150 160 L138 176 Q154 186 152 200Z') + glove(52, 158, -20) + glove(148, 158, 20)
        fx = (f'<path d="M30 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" fill="{MG}" class="vx-sp"/><path d="M168 30 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4Z" fill="#fff" class="vx-sp b"/>'
              f'<text x="2" y="26" font-family="Chakra Petch" font-weight="700" font-size="16" fill="#fff">WAIT. WHAT.</text><g class="vx-gl"><rect x="0" y="96" width="200" height="3" fill="{MG}" opacity=".5"/><rect x="0" y="140" width="200" height="2" fill="#7df9ff" opacity=".4"/></g>')
    if pose == 'ship':
        arms = sleeve('M36 200 Q54 176 94 178 L98 194 Q66 198 50 200Z') + glove(100, 186, 80) + sleeve('M146 200 L166 200 L168 156 L150 150Z') + glove(160, 146, -6)
        fx = f'<g class="vx-coin"><ellipse cx="160" cy="112" rx="7" ry="7" fill="{MG}" {ST.replace("1.7","1.2")}/><ellipse cx="160" cy="112" rx="4" ry="4" fill="none" stroke="#fff" stroke-width="1"/></g>'
    if pose == 'wait':
        fx = f'<g class="vx-pop"><path d="M140 30 h46 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-30 l-8 8 v-8 h-8 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6Z" fill="#120a18" stroke="{MG}" stroke-width="1.4"/><text x="150" y="48" font-family="Share Tech Mono" font-size="13" fill="#f1e9ff">0:18…</text></g>'
    head = (hair_back() + neck() + face() + f'<g class="blink">{eyes(ex[0])}</g>' + brows(ex[1]) + mouth(ex[2]) + bangs(pose == 'big'))
    body = chair() + torso() + f'<g transform="{head_t}">{head}</g>' + arms + fx
    return f'<g class="{"idle" if idle else ""}">{body}</g>'

VEX_CSS = '''
.vx-rf{transform-box:fill-box;transform-origin:50% 100%;animation:vxrf 1.1s ease-in-out infinite}.vx-rf.b{animation-delay:-.35s}.vx-rf.c{animation-delay:-.7s}
@keyframes vxrf{0%,100%{transform:rotate(-24deg) translateX(-6px)}50%{transform:rotate(24deg) translateX(6px)}}
.vx-fly{transform-box:fill-box;animation:vxfly 1.3s cubic-bezier(.5,0,.5,1) infinite}@keyframes vxfly{0%,20%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(40px,-30px) rotate(200deg);opacity:0}}
.vx-trail{animation:vxtr 1.3s linear infinite}@keyframes vxtr{0%,25%{opacity:0}40%{opacity:.8}100%{opacity:0}}
.vx-pop{transform-box:fill-box;transform-origin:center;animation:vxpop 2.4s cubic-bezier(.2,1.5,.3,1) infinite}@keyframes vxpop{0%,10%{transform:scale(.5);opacity:0}24%,80%{transform:none;opacity:1}100%{opacity:0}}
.vx-sp{transform-box:fill-box;transform-origin:center;animation:vxsp 1.2s ease-in-out infinite}.vx-sp.b{animation-delay:-.6s}@keyframes vxsp{0%,100%{transform:scale(0) rotate(0)}50%{transform:scale(1) rotate(90deg)}}
.vx-gl{animation:vxgl .9s steps(3) infinite}@keyframes vxgl{0%{transform:translate(0,0)}33%{transform:translate(-6px,30px)}66%{transform:translate(4px,-40px)}}
.vx-coin{transform-box:fill-box;transform-origin:center;animation:vxcoin 1.4s cubic-bezier(.3,0,.6,1) infinite}@keyframes vxcoin{0%{transform:translateY(0) scaleX(1)}25%{transform:translateY(-34px) scaleX(.1)}50%{transform:translateY(-46px) scaleX(1)}75%{transform:translateY(-34px) scaleX(.1)}100%{transform:translateY(0) scaleX(1)}}
'''
