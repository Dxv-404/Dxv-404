"""Kitsune v2: a detailed woodblock-style fox spirit. Patterned kimono, layered collars, fur tufts, gold-lined mask markings."""
O = '#2a1d18'; FUR = '#f7efe0'; FUR2 = '#e6d6bb'; VER = '#d2422d'; GOLD = '#c9a23a'; IND = '#22356b'; IND2 = '#18264f'
ST = f'stroke="{O}" stroke-width="1.6" stroke-linejoin="round"'
DEFS = ('<linearGradient id="kfTail" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f7efe0"/><stop offset=".72" stop-color="#f7efe0"/><stop offset=".8" stop-color="#f0b08f"/><stop offset="1" stop-color="#d2422d"/></linearGradient>'
        '<linearGradient id="kfEar" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f0b08f"/><stop offset="1" stop-color="#d2422d"/></linearGradient>'
        '<pattern id="kfSei" width="10" height="5" patternUnits="userSpaceOnUse"><rect width="10" height="5" fill="#22356b"/><path d="M0 5 A5 5 0 0 1 10 5" fill="#22356b" stroke="#c9a23a" stroke-width=".5"/><path d="M2 5 A3 3 0 0 1 8 5 M4 5 A1 1 0 0 1 6 5" fill="none" stroke="#c9a23a" stroke-width=".4"/><path d="M-5 2.5 A5 5 0 0 1 5 2.5 M5 2.5 A5 5 0 0 1 15 2.5" fill="none" stroke="#c9a23a" stroke-width=".4" opacity=".6"/></pattern>'
        '<pattern id="kfAsa" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#d2422d"/><path d="M4 0 L4 8 M0 4 L8 4 M0 0 L8 8 M8 0 L0 8" stroke="#f3c9a0" stroke-width=".35"/></pattern>')

def tail(rot=0, extra=''):
    return (f'<g transform="rotate({rot} 100 168)" {extra}><path d="M100 168 Q60 160 42 124 Q30 96 46 80 Q52 104 70 122 Q86 140 104 152Z" fill="url(#kfTail)" {ST}/>'
            f'<path d="M50 96 Q54 110 66 120 M44 108 Q50 122 62 132" fill="none" stroke="{FUR2}" stroke-width="1.2"/></g>')

def body(tea=False):
    return (f'<path d="M30 200 Q34 150 100 140 Q166 150 170 200Z" fill="url(#kfSei)" {ST}/>'
            f'<path d="M30 200 Q32 168 56 152 L70 200Z M170 200 Q168 168 144 152 L130 200Z" fill="{IND2}" opacity=".55"/>'
            f'<path d="M76 142 L100 182 L124 142" fill="none" stroke="#f7efe0" stroke-width="9"/><path d="M80 142 L100 175 L120 142" fill="none" stroke="url(#kfAsa)" stroke-width="6"/>'
            f'<path d="M72 142 L100 188 L128 142" fill="none" stroke="{O}" stroke-width="1.4"/>'
            f'<rect x="58" y="184" width="84" height="16" fill="{GOLD}" {ST}/><path d="M58 190 H142" stroke="#8a6a1c" stroke-width="1"/><path d="M92 184 L100 200 L108 184" fill="{VER}" {ST.replace("1.6","1.2")}/>'
            f'<path d="M110 186 Q126 196 120 210" fill="none" stroke="{VER}" stroke-width="2"/><circle cx="120" cy="204" r="3" fill="{GOLD}" {ST.replace("1.6","1")}/>')

def head(eyes='sly', mouth='smile', tilt=0):
    e = {'sly': ('M78 98 Q86 92 94 99 Q86 101 78 98Z', 'M122 98 Q114 92 106 99 Q114 101 122 98Z'),
         'open': ('M78 97 Q86 90 94 97 Q86 103 78 97Z', 'M122 97 Q114 90 106 97 Q114 103 122 97Z')}
    s = (f'<g transform="rotate({tilt} 100 100)">'
         f'<path d="M66 82 L58 30 L92 64Z" fill="{FUR}" {ST}/><path d="M68 74 L63 42 L86 64Z" fill="url(#kfEar)"/>'
         f'<path d="M134 82 L142 30 L108 64Z" fill="{FUR}" {ST}/><path d="M132 74 L137 42 L114 64Z" fill="url(#kfEar)"/>'
         f'<path d="M58 90 Q62 62 100 60 Q138 62 142 90 L150 98 L140 102 L146 112 L134 112 Q124 126 112 132 L100 146 L88 132 Q76 126 66 112 L54 112 L60 102 L50 98Z" fill="{FUR}" {ST}/>'
         f'<path d="M66 112 Q76 126 88 132 L100 146 L112 132 Q124 126 134 112 Q118 122 100 120 Q82 122 66 112Z" fill="{FUR2}" opacity=".6"/>'
         f'<path d="M100 64 Q92 74 100 86 Q108 74 100 64Z" fill="{VER}" stroke="{GOLD}" stroke-width=".9"/><circle cx="100" cy="78" r="1.8" fill="{GOLD}"/>'
         f'<path d="M70 90 Q84 76 96 92" fill="none" stroke="{VER}" stroke-width="3.4" stroke-linecap="round"/><path d="M130 90 Q116 76 104 92" fill="none" stroke="{VER}" stroke-width="3.4" stroke-linecap="round"/>'
         f'<path d="M70 92 Q84 79 96 94 M130 92 Q116 79 104 94" fill="none" stroke="{GOLD}" stroke-width=".8"/>'
         f'<path d="M68 108 L80 104 M132 108 L120 104" stroke="{VER}" stroke-width="2" stroke-linecap="round"/>')
    if eyes in ('sly', 'open'):
        s += f'<g class="blink"><path d="{e[eyes][0]}" fill="{O}"/><path d="{e[eyes][1]}" fill="{O}"/><circle cx="87" cy="96.5" r="1.8" fill="{GOLD}"/><circle cx="113" cy="96.5" r="1.8" fill="{GOLD}"/>'
        s += f'<path d="M76 97 L72 95 M124 97 L128 95" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/></g>'
    elif eyes == 'closed':
        s += f'<path d="M78 98 Q86 92 94 98 M106 98 Q114 92 122 98" fill="none" stroke="{O}" stroke-width="2.4" stroke-linecap="round"/>'
    elif eyes == 'wide':
        s += f'<circle cx="86" cy="97" r="7" fill="#fff" {ST}/><circle cx="114" cy="97" r="7" fill="#fff" {ST}/><circle cx="86" cy="97" r="3.2" fill="{GOLD}"/><circle cx="114" cy="97" r="3.2" fill="{GOLD}"/><circle cx="86" cy="97" r="1.4" fill="{O}"/><circle cx="114" cy="97" r="1.4" fill="{O}"/>'
    elif eyes == 'wink':
        s += f'<path d="{e["sly"][0]}" fill="{O}"/><circle cx="87" cy="96.5" r="1.8" fill="{GOLD}"/><path d="M106 97 Q114 94 122 97" fill="none" stroke="{O}" stroke-width="2.4" stroke-linecap="round"/>'
    s += f'<ellipse cx="100" cy="134" rx="4.4" ry="3.2" fill="{O}"/>'
    s += {'smile': f'<path d="M92 122 Q100 128 108 122" fill="none" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/>',
          'flat': f'<path d="M94 124 L106 124" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/>',
          'open': f'<path d="M92 120 Q100 132 108 120Z" fill="{O}"/><path d="M95 124 Q100 128 105 124" fill="{VER}"/>',
          'grin': f'<path d="M90 120 Q100 132 110 120Z" fill="{O}"/><path d="M93 121 L107 121 L105 124 L95 124Z" fill="#fff"/>'}[mouth]
    s += (f'<path d="M126 58 L146 40" stroke="{GOLD}" stroke-width="2"/><circle cx="148" cy="38" r="4" fill="{GOLD}" {ST.replace("1.6","1")}/><path d="M146 40 Q152 50 148 58" fill="none" stroke="{VER}" stroke-width="1.6"/>'
          f'<g fill="#e9a9b4" stroke="{VER}" stroke-width=".6"><circle cx="132" cy="56" r="3"/><circle cx="128" cy="52" r="2.6"/><circle cx="136" cy="51" r="2.4"/></g></g>')
    return s

def hand(x, y): return f'<circle cx="{x}" cy="{y}" r="7" fill="{FUR}" {ST}/><path d="M{x-4} {y-3} l2 2 M{x} {y-5} l1 2.4 M{x+4} {y-3} l-1 2" stroke="{FUR2}" stroke-width="1"/>'
def sleeve(d): return f'<path d="{d}" fill="url(#kfSei)" {ST}/>'
def card_(x, y, r=0, back=False, cls=''):
    fill = f'fill="{VER}"' if back else 'fill="#f6eedc"'
    mark = f'<rect x="2" y="2" width="8" height="12" fill="none" stroke="{GOLD}" stroke-width=".8"/>' if back else f'<circle cx="6" cy="8" r="3" fill="{VER}"/>'
    return f'<g transform="translate({x} {y}) rotate({r})"><g class="{cls}"><rect width="12" height="16" rx="1.4" {fill} {ST.replace("1.6","1.2")}/>{mark}</g></g>'

def fox(pose='idle'):
    tails, arms, fx = '', '', ''
    base_tails = tail(-28) + tail(28, '') .replace('rotate(28 100 168)', 'translate(200 0) scale(-1 1) rotate(-28 100 168)') + tail(0)
    eyes, mouth, tilt = 'sly', 'smile', 0
    if pose in ('idle', 'shuffle'):
        tails = f'<g class="kt">{base_tails}</g>'
        arms = sleeve('M40 200 Q56 172 90 172 L92 188 Q64 192 56 200Z') + sleeve('M160 200 Q144 172 110 172 L108 188 Q136 192 144 200Z') + hand(92, 180) + hand(108, 180)
        fx = card_(94, 156, 0, False, 'kf1') + card_(94, 156, 0, True, 'kf2') + card_(94, 156, 0, False, 'kf3') if pose == 'shuffle' else ''
    if pose == 'deal':
        tails = f'<g class="kt">{base_tails}</g>'; eyes = 'wink'
        arms = sleeve('M40 200 Q56 172 90 172 L92 188 Q64 192 56 200Z') + hand(92, 180) + sleeve('M150 200 Q160 166 184 150 L192 162 Q172 176 168 200Z') + hand(188, 154)
        fx = card_(182, 128, 20, True, 'kfly') + f'<text x="140" y="118" font-family="Yuji Syuku" font-size="14" fill="{VER}" class="kpop">ひらり</text>'
    if pose == 'turn':
        tails = f'<g class="kt">{base_tails}</g>'; eyes = 'open'; mouth = 'flat'
        arms = sleeve('M40 200 Q56 172 90 172 L92 188 Q64 192 56 200Z') + hand(92, 180) + sleeve('M146 200 L166 200 L172 160 L152 156Z') + hand(164, 152)
        fx = (f'<path d="M164 152 L136 112" stroke="{O}" stroke-width="7" stroke-linecap="round"/><path d="M164 152 L136 112" stroke="{VER}" stroke-width="4" stroke-linecap="round"/>'
              '<g class="kfire"><path d="M24 70 Q16 56 24 42 Q26 52 32 48 Q38 62 24 70Z" fill="#7ed3e8"/></g><g class="kfire b"><path d="M176 64 Q168 50 176 36 Q178 46 184 42 Q190 56 176 64Z" fill="#7ed3e8"/></g>')
    if pose == 'big':
        eyes = 'wide'; mouth = 'open'
        half = ''.join(tail(a) for a in (-50, -30, -10, 12))
        tails = '<g class="knine">' + half + f'<g transform="translate(200 0) scale(-1 1)">{half}</g>' + tail(40) + '</g>'
        arms = sleeve('M34 200 Q30 170 46 156 L60 170 Q46 182 50 200Z') + sleeve('M166 200 Q170 170 154 156 L140 170 Q154 182 150 200Z') + hand(48, 152) + hand(152, 152)
        fx = (f'<text x="56" y="22" font-family="Yuji Syuku" font-size="20" fill="{VER}">なんと!</text>'
              + ''.join(f'<path d="M{x} {y} q4 -8 8 0 q-4 6 -8 0Z" fill="#7ed3e8" class="kfire" style="animation-delay:{-d}s"/>' for x, y, d in ((20, 60, 0), (170, 50, .4), (30, 30, .8), (160, 20, 1.2))))
    if pose == 'ship':
        eyes = 'closed'; mouth = 'grin'; tilt = -6
        tails = f'<g class="kt">{base_tails}</g>'
        arms = sleeve('M40 200 Q56 172 90 172 L92 188 Q64 192 56 200Z') + hand(92, 180) + sleeve('M150 200 L170 200 L172 156 L154 152Z') + hand(164, 148)
        fx = (f'<path d="M164 148 L134 108 A44 44 0 0 1 188 104Z" fill="{VER}" {ST}/>' + ''.join(f'<path d="M164 148 L{164+44*__import__("math").cos(__import__("math").radians(a)):.0f} {148+44*__import__("math").sin(__import__("math").radians(a)):.0f}" stroke="{GOLD}" stroke-width="1"/>' for a in range(-126, -40, 14))
              + f'<circle cx="156" cy="116" r="7" fill="#f6eedc"/>' + ''.join(f'<circle cx="{x}" cy="20" r="6" fill="{GOLD}" stroke="#8a6a1c" stroke-width="1.2" class="kcoin" style="animation-delay:{d}s"/>' for x, d in ((30, 0), (58, -.5), (150, -1)))
              )
    if pose == 'wait':
        eyes = 'closed'; mouth = 'flat'
        tails = f'<g class="kt">{base_tails}</g>'
        arms = sleeve('M40 200 Q56 176 88 176 L90 192 Q64 194 56 200Z') + sleeve('M160 200 Q144 176 112 176 L110 192 Q136 194 144 200Z')
        fx = (f'<path d="M86 160 L114 160 L111 182 Q100 188 89 182Z" fill="#2f6b4f" {ST}/><path d="M88 166 L112 166" stroke="{GOLD}" stroke-width="1.4"/>' + hand(88, 176) + hand(112, 176)
              + f'<path d="M96 154 q-4 -6 0 -12" fill="none" stroke="#9aa0b4" stroke-width="2" class="ksteam"/><path d="M104 154 q4 -6 0 -12" fill="none" stroke="#9aa0b4" stroke-width="2" class="ksteam b"/>'
              f'<g class="kpop"><path d="M134 22 h48 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-28 l-8 8 v-8 h-12 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6Z" fill="#f6eedc" stroke="{IND}" stroke-width="1.4"/><text x="142" y="40" font-family="Yuji Syuku" font-size="14" fill="{IND}">まだ?</text></g>')
    return f'{tails}<g class="{"kshake" if pose == "big" else "idle"}">{body()}{head(eyes, mouth, tilt)}{arms}</g>{fx}'

FOX_CSS = '''
.kt{transform-box:view-box;transform-origin:100px 168px;animation:kt 2.6s ease-in-out infinite}@keyframes kt{50%{transform:rotate(4deg)}}
.knine{transform-box:view-box;transform-origin:100px 168px;animation:knine 2s cubic-bezier(.3,1.5,.5,1) infinite}@keyframes knine{0%,100%{transform:scale(.7);opacity:.6}35%,80%{transform:scale(1);opacity:1}}
.kshake{transform-box:fill-box;transform-origin:50% 100%;animation:ksh .3s steps(2) infinite}@keyframes ksh{50%{transform:translate(2px,-1px) rotate(-1deg)}}
.kf1,.kf2,.kf3{transform-box:fill-box;transform-origin:50% 100%}.kf1{animation:kfan 1.2s ease-in-out infinite}.kf2{animation:kfan 1.2s ease-in-out infinite -.4s}.kf3{animation:kfan 1.2s ease-in-out infinite -.8s}
@keyframes kfan{0%,100%{transform:rotate(-26deg)}50%{transform:rotate(26deg)}}
.kfly{transform-box:fill-box;animation:kfly 1.4s ease-in infinite}@keyframes kfly{0%,15%{transform:translate(0,0);opacity:1}100%{transform:translate(30px,-40px) rotate(300deg);opacity:0}}
.kpop{transform-box:fill-box;transform-origin:center;animation:kpop 1.6s cubic-bezier(.2,1.6,.3,1) infinite}@keyframes kpop{0%,10%{transform:scale(.4);opacity:0}25%,80%{transform:none;opacity:1}100%{opacity:0}}
.kfire{transform-box:fill-box;transform-origin:50% 100%;animation:kfire 1.6s ease-in-out infinite}.kfire.b{animation-delay:-.6s}@keyframes kfire{0%,100%{transform:translateY(0) scale(1);opacity:.85}50%{transform:translateY(-8px) scale(1.15);opacity:1}}
.kcoin{animation:kcoin 1.6s ease-in infinite}@keyframes kcoin{0%{transform:translateY(-20px);opacity:0}20%{opacity:1}100%{transform:translateY(70px);opacity:0}}
.ksteam{transform-box:fill-box;transform-origin:50% 100%;animation:kst 2.4s ease-out infinite}.ksteam.b{animation-delay:-1.2s}@keyframes kst{0%{transform:translateY(4px) scaleY(.6);opacity:0}30%{opacity:.8}100%{transform:translateY(-14px) scaleY(1.2);opacity:0}}
'''
