"""Train Poker v3 design kit: crews, devices, raise, rebuys and results, in every theme.

Every component is drawn from the theme's own tokens (t-<theme>.css: --bg, --tx, --mut, --acc, --acctx, --line, --chipbg,
--panel, --panelsh, --r-btn, --r-panel, --dsp, --ui, --num, button colours), so a screen designed once looks native in all
nine themes. Boards are plain HTML pages (.dc.html) like the v2 boards; animations loop on the board so they can be watched.
"""
import hashlib
from builders import *
from motion import FEEL
import core, os
core.OUT = os.environ.get('TP3_OUT', '/tmp/claude-0/-home-claude/3da41667-e307-5a5e-bb8c-464fc3aa5893/scratchpad/tp3/project')

# ---------------------------------------------------------------- people and crews
ME = DEV
FNT = dict(name='Friday Night Table', short='FN', color='#c0392b', color2='#f3c66b', shape='shield', members=13, season=3,
           leader=P[3], code='FNT4Q2', live=True)
HOS = dict(name='Hostel 4B', short='4B', color='#2f6fd6', color2='#bfe0ff', shape='hex', members=7, season=1, leader=ME,
           code='H4B7KX', live=False)
OFF = dict(name='Office Fridays', short='OF', color='#1f8a5b', color2='#c9f2dc', shape='round', members=9, season=2, leader=P[0],
           code='OFR2M9', live=False)

STAND = [  # rank, person, net (bb), games, trend
    (1, P[3], '+412', 11, 'up'), (2, P[0], '+268', 12, 'up'), (3, P[7], '+131', 10, 'down'), (4, ME, '+96', 12, 'up'),
    (5, P[2], '+12', 9, ''), (6, P[8], '−48', 11, 'down'), (7, P[6], '−115', 8, 'up'), (8, P[1], '−202', 12, 'down'),
    (9, P[4], '−241', 7, 'down'), (10, P[9], '−309', 10, ''),
]

# ---------------------------------------------------------------- small art
SHAPES = {
    'shield': 'M24 3 L42 9 V23 C42 34 34 41 24 45 C14 41 6 34 6 23 V9 Z',
    'hex': 'M24 3 L42 13.5 V34.5 L24 45 L6 34.5 V13.5 Z',
    'round': 'M24 3 A21 21 0 1 1 23.99 3 Z',
    'diamond': 'M24 2 L46 24 L24 46 L2 24 Z',
}
def emblem(c, size=44, cls=''):
    """A crew's badge: the shape and colours the crew picked, its two letters in the theme's display font."""
    d = SHAPES[c['shape']]
    return (f'<span class="kemb {cls}" style="--es:{size}px"><svg viewBox="0 0 48 48" aria-hidden="true">'
            f'<path d="{d}" fill="{c["color"]}"/><path d="{d}" fill="none" stroke="{c["color2"]}" stroke-width="2.2" opacity=".85" transform="translate(4.8 4.8) scale(.8)"/></svg>'
            f'<b style="color:{c["color2"]}">{c["short"]}</b></span>')

def av(th, p, size=36, ctx='list', cls=''):
    return f'<span class="av {cls}" style="--av:{size}px">{th.avatar(p, ctx)}</span>'

def stack(th, ps, size=26):
    return '<span class="stk" style="--av:' + str(size) + 'px">' + ''.join(av(th, p, size) for p in ps) + '</span>'

def qr(seed='train-poker', n=25, px=4):
    """A believable QR code (finder squares + deterministic noise); drawn, not scannable."""
    h = hashlib.sha256(seed.encode()).digest() * 40
    cells = []
    def finder(x, y):
        return (f'<rect x="{x}" y="{y}" width="7" height="7" fill="currentColor"/><rect x="{x+1}" y="{y+1}" width="5" height="5" fill="var(--qrbg,#fff)"/>'
                f'<rect x="{x+2}" y="{y+2}" width="3" height="3" fill="currentColor"/>')
    k = 0
    for y in range(n):
        for x in range(n):
            if (x < 8 and y < 8) or (x > n - 9 and y < 8) or (x < 8 and y > n - 9): continue
            if h[k % len(h)] % 2: cells.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')
            k += 1
    return (f'<svg class="qr" viewBox="-2 -2 {n+4} {n+4}" width="{(n+4)*px}" height="{(n+4)*px}" shape-rendering="crispEdges" aria-label="QR code">'
            f'<rect x="-2" y="-2" width="{n+4}" height="{n+4}" fill="var(--qrbg,#fff)"/><g fill="currentColor">{"".join(cells)}</g>'
            f'{finder(0, 0)}{finder(n-7, 0)}{finder(0, n-7)}</svg>')

ICON = {
    'phone': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></svg>',
    'laptop': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.6"/><path d="M2 19h20"/></svg>',
    'tablet': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
    'gear': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    'share': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    'copy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    'more': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    'plus': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    'minus': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    'check': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    'trophy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6"/></svg>',
    'whatsapp': '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 13.9c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.2 1.3z"/></svg>',
    'qr': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/></svg>',
    'link': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    'up': '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2l4 6H2z" fill="currentColor"/></svg>',
    'down': '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10L2 4h8z" fill="currentColor"/></svg>',
    'lock': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    'cards': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="11" height="15" rx="2" transform="rotate(-8 8 12)"/><rect x="10" y="4" width="11" height="15" rx="2" transform="rotate(8 15 11)"/></svg>',
}
def ic(name, cls='ico'): return f'<i class="{cls}">{ICON[name]}</i>'

def nav(on='crews', badge=''):
    items = [('play', '♠', 'Play'), ('crews', '⬢', 'Crews'), ('replays', '↺', 'Replays'), ('theme', '◐', 'Theme')]
    out = ''.join(f'<span class="{"on" if k == on else ""}"><i>{i}</i>{t}{badge if k == "crews" and badge else ""}</span>' for k, i, t in items)
    return f'<nav class="v3nav">{out}</nav>'

def head(title, sub='', right='', back=True):
    b = '<span class="ib">‹</span>' if back else ''
    s = f'<small>{sub}</small>' if sub else ''
    return f'<header class="v3h">{b}<div><b>{title}</b>{s}</div><span class="sp"></span>{right}</header>'

def screen(th, inner, cls='', bg='menu', w=390, h=844, overlay=''):
    """One phone screen in the theme: its background art, its tokens, our content on top."""
    return (f'<div class="tp v3s th-{th.key} {cls}" style="width:{w}px;height:{h}px"><div class="fx" aria-hidden="true">{th.bg(bg)}</div>'
            f'<div class="v3b">{inner}</div>{overlay}</div>')

def scaled(inner, w, h, s):
    """A big screen (laptop, desktop) drawn at its real size and shown smaller on the board."""
    return f'<div class="v3sc" style="width:{w*s:.0f}px;height:{h*s:.0f}px"><div style="width:{w}px;height:{h}px;transform:scale({s})">{inner}</div></div>'

def col(label, title, text, body, w=390):
    return (f'<div class="v3col" style="width:{w}px"><div class="cap"><em>{label}</em><b>{title}</b><small>{text}</small></div>{body}</div>')

def board(th, name, title, lede, body, w, h, css=''):
    page = (f'<div class="tp sheet v3sheet th-{th.key}" style="width:{w}px;height:{h}px"><div class="v3top"><h1>{title}</h1><p class="lede">{lede}</p></div>{body}</div>')
    return write(name, doc(th, title, w, h, page, KIT_CSS + css + th.board_css('menu')))

def note(*rows):
    return '<div class="v3notes">' + ''.join(f'<div><b>{a}</b><span>{b}</span></div>' for a, b in rows) + '</div>'

# ---------------------------------------------------------------- the kit
KIT_CSS = r'''
.v3sheet{gap:26px}.v3top{display:grid;gap:8px}
.v3row{display:flex;gap:34px;align-items:flex-start;flex-wrap:nowrap}
.v3col{display:grid;gap:12px;align-content:start}
.v3col .cap{display:grid;gap:4px;min-height:104px;align-content:start}
.v3col .cap em{font:800 10.5px var(--ui);font-style:normal;letter-spacing:.2em;text-transform:uppercase;color:var(--acc)}
.v3col .cap b{font:var(--dspw,700) 21px/1.15 var(--dsp)}
.v3col .cap small{font-size:13px;color:var(--mut);line-height:1.45}
.v3col>.tp,.v3col>.v3sc{border-radius:30px;overflow:hidden;box-shadow:0 0 0 1px var(--line),0 22px 50px rgba(0,0,0,.4)}
.v3col>.v3sc.lap{border-radius:14px}
.v3sc{position:relative;overflow:hidden;flex:none}.v3sc>div{position:absolute;left:0;top:0;transform-origin:0 0}
.v3sc>div>.tp{position:relative}
.v3s{position:relative}.v3s>.fx{position:absolute;inset:0;z-index:0}
.v3b{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;gap:14px;padding:18px 18px 0;overflow:hidden}
.v3b.np{padding-bottom:0}
.v3b{text-shadow:0 0 5px var(--bg),0 0 2px var(--bg)}
.v3b .bb,.v3b .chipt,.v3b .klive,.v3b .seg span.on,.v3b .kslots span,.v3b .digits span,.toast,.v3nav{text-shadow:none}
.pnl,.stat,.row,.ccard,.seg,.grow,.lrow,.inp,.troph span,.pick span{background-image:linear-gradient(var(--panel,var(--chipbg)),var(--panel,var(--chipbg)))!important;background-color:var(--bg)!important}
.row,.stat,.grow,.lrow,.seg,.troph span,.pick span{background-image:linear-gradient(var(--chipbg),var(--chipbg))!important}
.inp{background-image:none!important}

/* header */
.v3h{display:flex;align-items:center;gap:12px;min-height:42px}
.v3h>div{display:grid;gap:1px;min-width:0}.v3h b{font:var(--dspw,700) 23px/1.1 var(--dsp);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v3h small{font-size:12px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.txt{flex:1;display:grid;gap:2px;min-width:0}
.sp{flex:1}
/* bottom bar */
.v3nav{margin:auto -18px 0;display:flex;justify-content:space-around;padding:10px 0 22px;box-shadow:inset 0 1px 0 var(--line);font:600 11px var(--ui);color:var(--mut);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px)}
.v3nav span{display:grid;justify-items:center;gap:3px;position:relative;min-width:60px}.v3nav i{font-style:normal;font-size:17px;line-height:1}
.v3nav .on{color:var(--acc)}.v3nav .on::after{content:"";position:absolute;bottom:-9px;width:22px;height:3px;border-radius:2px;background:var(--acc);animation:navin .5s both}
.v3nav .bdg{position:absolute;top:-4px;right:12px;min-width:16px;height:16px;border-radius:8px;background:var(--red,#d33);color:#fff;font:800 9.5px/16px var(--num);text-align:center;padding:0 4px}
@keyframes navin{from{width:0;opacity:0}}
.v3b:has(> .v3nav){padding-bottom:78px}
.v3b > .v3nav{position:absolute;left:0;right:0;bottom:0;margin:0;z-index:5}

/* panels, lists, buttons */
.pnl{border-radius:var(--r-panel,16px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line));padding:15px;display:grid;gap:11px;position:relative}
.pnl>h3,.pnl .ttl{font:var(--dspw,700) 17px var(--dsp);margin:0;display:flex;align-items:center;gap:8px}
.klbl{font:800 10.5px var(--ui);letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
.mut{color:var(--mut)}.acc{color:var(--acc)}
.bb{height:52px;border-radius:var(--r-btn,12px);display:flex;align-items:center;justify-content:center;gap:8px;font:800 15.5px var(--ui);padding:0 16px;flex-direction:column;line-height:1.1}
.bb small{font:600 11.5px var(--ui);opacity:.8}
.bb.p{background:var(--b-call);color:var(--b-calltx);box-shadow:var(--b-callsh,none)}
.bb.r{background:var(--b-raise);color:var(--b-raisetx);box-shadow:var(--b-raisesh,none)}
.bb.s{background:var(--chipbg);color:var(--tx);box-shadow:inset 0 0 0 1px var(--line)}
.bb.g{background:transparent;color:var(--tx);box-shadow:inset 0 0 0 1.5px var(--line)}
.bb.d{background:var(--b-fold);color:var(--b-foldtx);box-shadow:var(--b-foldsh,none)}
.bb.sm{height:38px;font-size:13px;padding:0 13px;flex-direction:row}
.bb.hz{flex-direction:row}
.bb .ico,.ico{display:inline-grid;width:18px;height:18px;flex:none}.ico svg{width:100%;height:100%}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.hrow{display:flex;align-items:center;gap:10px}
.chipt{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:99px;font:800 10.5px var(--ui);letter-spacing:.05em;background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--tx);white-space:nowrap}
.chipt.a{background:var(--acc);color:var(--acctx);box-shadow:none}
.chipt.o{box-shadow:inset 0 0 0 1.5px var(--acc);color:var(--acc);background:transparent}
.klive{display:inline-flex;align-items:center;gap:6px;font:800 10.5px var(--num);padding:3px 9px 3px 7px;border-radius:99px;background:var(--acc);color:var(--acctx);letter-spacing:.08em}
.klive::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;animation:livep 1.4s ease-in-out infinite}
@keyframes livep{50%{opacity:.25;transform:scale(.7)}}
.stk{display:flex}.stk .av{margin-left:calc(var(--av) * -.3);box-shadow:0 0 0 2px var(--bg);border-radius:50%}.stk .av:first-child{margin-left:0}
.v3s .av{filter:none;opacity:1;animation:none}
.kemb{position:relative;width:var(--es);height:var(--es);display:inline-grid;place-items:center;flex:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.3))}
.kemb svg{position:absolute;inset:0;width:100%;height:100%}.kemb b{position:relative;font:var(--dspw,800) calc(var(--es) * .34) var(--dsp);letter-spacing:.02em;margin-top:calc(var(--es) * -.04)}
.row{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);min-height:50px}
.row .txt{flex:1;display:grid;gap:2px;min-width:0}.row .txt b{font:700 14px var(--ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row .txt small{font-size:11.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row.on{box-shadow:inset 0 0 0 1.5px var(--acc)}
.row .go{color:var(--mut);font-size:20px}
.fld{display:grid;gap:6px}.fld>span{font:600 12px var(--ui);color:var(--mut)}
.inp{height:50px;border-radius:var(--r-btn,12px);background:var(--bg);box-shadow:inset 0 0 0 1.5px var(--line);display:flex;align-items:center;padding:0 14px;font:600 15px var(--ui);color:var(--tx);gap:8px}
.inp.f{box-shadow:inset 0 0 0 1.5px var(--acc)}.inp .ph{color:var(--mut);opacity:.7}
.inp .caret{width:2px;height:22px;background:var(--acc);animation:caret 1s steps(1) infinite}
@keyframes caret{50%{opacity:0}}
.kslots{display:flex;gap:7px}.kslots span{flex:1;height:54px;border-radius:var(--r-btn,12px);display:grid;place-items:center;font:var(--numw,700) 26px var(--num);background:var(--bg);box-shadow:inset 0 0 0 1.5px var(--line);color:var(--tx)}
.kslots span.f{box-shadow:inset 0 0 0 1.5px var(--acc)}.kslots span.c::after{content:"";width:2px;height:26px;background:var(--acc);animation:caret 1s steps(1) infinite}
.kslots .dash{flex:0 0 10px;box-shadow:none;background:none;color:var(--mut);font-size:20px}
.kslots.err span:not(.dash){box-shadow:inset 0 0 0 1.5px var(--red,#d33);animation:shake .42s both}
@keyframes shake{20%{transform:translateX(-6px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
.seg{display:flex;gap:3px;padding:3px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line)}
.seg span{flex:1;text-align:center;padding:9px 2px;border-radius:calc(var(--r-btn,12px) * .8);font:700 12.5px var(--ui);color:var(--mut);white-space:nowrap}
.seg span.on{background:var(--acc);color:var(--acctx)}
.sw{width:46px;height:28px;border-radius:99px;background:var(--bg);box-shadow:inset 0 0 0 1.5px var(--line);position:relative;flex:none}
.sw::after{content:"";position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:var(--mut)}
.sw.on{background:var(--acc);box-shadow:none}.sw.on::after{left:22px;background:var(--acctx)}
.swrow{display:flex;align-items:center;gap:12px}.swrow>span:not(.sw){flex:1;display:grid;gap:2px;font:600 14.5px var(--ui)}.swrow small{font:500 11.5px var(--ui);color:var(--mut)}
.ktabs{display:flex;gap:4px;box-shadow:inset 0 -1px 0 var(--line);margin:0 -2px}
.ktabs span{padding:10px 10px 11px;font:700 13px var(--ui);color:var(--mut);position:relative;white-space:nowrap}
.ktabs span.on{color:var(--tx)}.ktabs span.on::after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:3px;border-radius:2px;background:var(--acc);animation:tabin .45s both}
@keyframes tabin{from{left:50%;right:50%}}
.kdim{position:absolute;inset:0;z-index:20;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);animation:fadein .3s both}
@keyframes fadein{from{opacity:0}}
.bsheet{position:absolute;left:0;right:0;bottom:0;z-index:21;padding:10px 18px 26px;border-radius:var(--r-panel,20px) var(--r-panel,20px) 0 0;background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 -20px 50px rgba(0,0,0,.45);display:grid;gap:12px;animation:rise .45s cubic-bezier(.2,.8,.25,1) both}
.bsheet .grip{width:40px;height:4px;border-radius:2px;background:var(--line);justify-self:center}
@keyframes rise{from{transform:translateY(40%);opacity:0}}
.askb{position:absolute;left:22px;right:22px;top:50%;z-index:22;transform:translateY(-50%);padding:20px;border-radius:var(--r-panel,18px);background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 24px 60px rgba(0,0,0,.5);display:grid;gap:14px;animation:pop .35s cubic-bezier(.2,.9,.3,1.2) both}
.askb p{margin:0;font:600 15.5px/1.4 var(--ui)}.askb small{color:var(--mut);font-size:12.5px;line-height:1.45}
@keyframes pop{from{transform:translateY(-46%) scale(.94);opacity:0}}
.toast{position:absolute;left:18px;right:18px;z-index:23;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:var(--r-btn,14px);background:var(--tx);color:var(--bg);font:700 13.5px var(--ui);box-shadow:0 14px 30px rgba(0,0,0,.4);animation:toast 4s cubic-bezier(.2,.8,.25,1) infinite}
.toast .ico{color:var(--acc)}
@keyframes toast{0%{transform:translateY(20px);opacity:0}10%,85%{transform:none;opacity:1}100%{opacity:0}}
.hint{font-size:12px;color:var(--mut);line-height:1.45;text-align:center}
.big{font:var(--numw,700) 40px var(--num);letter-spacing:.08em}
.kbd{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:6px;font:700 11px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25),inset 0 0 0 1px var(--line);background:var(--chipbg);color:var(--tx)}
.qr{color:#111;border-radius:10px;display:block}
.v3notes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.v3notes div{display:grid;gap:4px;padding:14px 16px;border-radius:var(--r-panel,14px);background:var(--panel,var(--chipbg));box-shadow:var(--panelsh,inset 0 0 0 1px var(--line))}
.v3notes b{font:var(--dspw,700) 15px var(--dsp)}.v3notes span{font-size:12.5px;color:var(--mut);line-height:1.5}
.arrow{font-size:28px;color:var(--acc);align-self:center;margin-top:120px}
.conf i{position:absolute;width:7px;height:12px;border-radius:2px;top:-14px;animation:conf 2.6s linear infinite}
@keyframes conf{to{transform:translateY(860px) rotate(720deg)}}
.stamp{animation:stamp .7s cubic-bezier(.2,1.4,.4,1) both}
@keyframes stamp{0%{transform:scale(2.2) rotate(-14deg);opacity:0}60%{opacity:1}100%{transform:none}}
.ring{--p:.8;width:var(--rs,120px);height:var(--rs,120px);border-radius:50%;background:conic-gradient(var(--acc) calc(var(--p) * 360deg),color-mix(in srgb,var(--tx) 12%,transparent) 0);display:grid;place-items:center;position:relative;animation:ringd 300s linear infinite}
.ring::before{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--bg)}.ring>*{position:relative}
@keyframes ringd{to{--p:0}}
@property --p{syntax:'<number>';inherits:false;initial-value:.8}
.digits{display:flex;gap:6px;justify-content:center}.digits span{width:42px;height:58px;border-radius:var(--r-btn,10px);display:grid;place-items:center;font:var(--numw,700) 30px var(--num);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);animation:dig .5s cubic-bezier(.2,1.3,.4,1) both}
.digits span:nth-child(2){animation-delay:.06s}.digits span:nth-child(3){animation-delay:.12s}.digits i{width:10px}.digits span:nth-child(5){animation-delay:.18s}.digits span:nth-child(6){animation-delay:.24s}.digits span:nth-child(7){animation-delay:.3s}
@keyframes dig{from{transform:rotateX(90deg);opacity:0}}
.dev{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--acc)}.dev .ico{width:22px;height:22px}
.stat{display:grid;gap:2px;padding:10px 8px;border-radius:var(--r-btn,12px);background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);text-align:center}
.stat b{font:var(--numw,700) 19px var(--num)}.stat small{font-size:10.5px;color:var(--mut)}
.tu{color:#3fbf7f}.td{color:var(--red,#e0524a)}
.trend{display:inline-grid;width:10px;height:10px}.trend svg{width:10px;height:10px}
'''
