"""Review board for the selectable avatars + the "Choose your avatar" picker mockups.
Reads avatars.json (same folder); writes one self-contained HTML page to the path given as argv[1].
"""
import json, os, sys, html

HERE = os.path.dirname(os.path.abspath(__file__))
AV = json.load(open(os.path.join(HERE, 'avatars.json')))
OUT = sys.argv[1]

T = {  # bg, tx, mut, acc, acctx, line, panel, display font stack, label, art style line
 'classic': ('#1b120d', '#f3ead7', '#b9a88b', '#ecd39b', '#2a1a0e', 'rgba(201,161,91,.28)', 'rgba(246,240,225,.06)', "Georgia,'Times New Roman',serif", 'Classic', 'Warm card room: felt, brass and mahogany; brass-ringed medallions.'),
 'noir': ('#0b0b0c', '#ede6d6', '#8c8579', '#c8a96a', '#0b0b0c', 'rgba(200,169,106,.26)', 'rgba(237,230,214,.035)', "Didot,'Bodoni 72',Georgia,serif", 'Noir', 'Film noir: one hard key light, venetian-blind shadow, gold only as accent.'),
 'ivory': ('#f3eee4', '#22261f', '#6f6a5e', '#1f4a3a', '#fffdf8', 'rgba(34,38,31,.16)', '#fffdf8', "Georgia,'Times New Roman',serif", 'Ivory', 'Light and elegant: engraved line work with hatched shadows on cream.'),
 'velvet': ('#1a080d', '#f6e9dc', '#b49284', '#e6c995', '#2a0a12', 'rgba(230,201,149,.24)', '#22090f', "Didot,'Bodoni 72',Georgia,serif", 'Velvet', 'Luxe casino cameos: jewel tones in a champagne-gold oval.'),
 'cyber': ('#120a18', '#f1e9ff', '#9d8bb4', '#ff2e88', '#fff', 'rgba(196,160,255,.18)', 'rgba(241,233,255,.035)', "ui-monospace,'SF Mono',Menlo,Consolas,monospace", 'Cyber', 'Neon: dark plates, glowing magenta and cyan rims, clipped corners.'),
 'ink': ('#f5f2ea', '#111', '#555', '#e8202a', '#fff', '#111', '#fff', "'Arial Black','Helvetica Neue',Impact,sans-serif", 'Ink', 'Brush and ink manga panels: heavy black line, paper white, one red seal.'),
 'pixel': ('#1a1220', '#f6efe0', '#b8a68e', '#e0a83a', '#1a1220', '#4f4558', '#2b1d2e', "ui-monospace,'Courier New',monospace", 'Pixel', 'Blocky 14 x 14 pixel art in a wooden tavern frame.'),
 'train': ('#12263a', '#eaf2f0', '#a9bec0', '#8fc93a', '#0d1a12', 'rgba(200,225,230,.2)', 'rgba(255,255,255,.05)', "'Avenir Next','Futura','Helvetica Neue',Arial,sans-serif", 'Night Train', 'Art deco travel poster: flat lamp-lit shapes in a brass carriage window.'),
 'edo': ('#efe3c8', '#1e2a4a', '#6b6450', '#d2422d', '#fff6e6', 'rgba(34,53,107,.22)', '#f6eedc', "'Hiragino Mincho ProN','Yu Mincho',Georgia,serif", 'Edo', 'Woodblock ukiyo-e: sumi keyline, flat indigo and vermilion, a bokashi sky band.'),
}
ORDER = list(AV.keys())
BYID = {a['id']: (k, a) for k in AV for a in AV[k]}
e = html.escape


def av(aid):
    return BYID[aid][1]['svg']


def tokens(k):
    b = T[k]
    return f'--bg:{b[0]};--tx:{b[1]};--mut:{b[2]};--acc:{b[3]};--acctx:{b[4]};--line:{b[5]};--panel:{b[6]};--dsp:{b[7]}'


# ---------------- theme sections ----------------
def section(k):
    b = T[k]
    cards = ''
    for a in AV[k]:
        cards += f'''<figure class="card">
  <div class="big">{a["svg"]}</div>
  <figcaption><b>{e(a["name"])}</b><span class="kind">{"Character" if a["kind"] == "character" else "Emblem"}</span></figcaption>
  <div class="small"><span class="seat"><i>{a["svg"]}</i><span>22 px</span></span><span class="row"><i>{a["svg"]}</i><span class="nm">Dev</span><span class="pl">+96</span></span></div>
</figure>'''
    return f'''<section class="theme th-{k}" style="{tokens(k)}" id="t-{k}">
<div class="wrap"><header class="th-head"><span class="eyebrow">{ORDER.index(k) + 1:02d} / 09</span><h2>{e(b[8])}</h2><p>{e(b[9])}</p></header>
<div class="grid">{cards}</div></div></section>'''


# ---------------- picker ----------------
TAB_LABEL = {k: T[k][8] for k in T}


def picker(skin, tab, sel, layout):
    """layout: phone | tablet | laptop"""
    sk, sa = BYID[sel]
    tabs = ''.join(f'<button class="tab{" on" if k == tab else ""}"><span class="sw" style="background:{T[k][0]};box-shadow:inset 0 0 0 2px {T[k][3]}"></span>{e(TAB_LABEL[k])}</button>' for k in ORDER)
    tiles = ''
    for a in AV[tab]:
        on = a['id'] == sel
        tiles += f'<button class="tile{" on" if on else ""}" style="--tbg:{T[tab][0]}"><span class="art">{a["svg"]}</span><span class="tn">{e(a["name"])}</span>{"<span class=chk>&#10003;</span>" if on else ""}</button>'
    ini = '<button class="ini-opt"><span class="ini">DV</span><span class="it"><b>Initials</b><span>Plain letters in the table\'s own style</span></span><span class="radio"></span></button>'
    seat = f'''<div class="pv-seat"><div class="felt"><div class="seatbox"><span class="sav">{sa["svg"]}</span><span class="snm">Dev</span><span class="sst">1,240</span></div></div><span class="cap">At a table seat</span></div>'''
    crew = f'''<div class="pv-crew"><div class="crow"><span class="rk">4</span><span class="cav">{sa["svg"]}</span><span class="cn">Dev (you)</span><span class="cw">+96</span></div><div class="crow dim"><span class="rk">5</span><span class="cav">{av("edo-samurai")}</span><span class="cn">Kabir</span><span class="cw">+12</span></div><div class="crow dim"><span class="rk">6</span><span class="cav ci">ZO</span><span class="cn">Zoya</span><span class="cw neg">&minus;48</span></div><span class="cap">In a crew list</span></div>'''
    hero = f'''<div class="pv-hero"><span class="pv-big">{sa["svg"]}</span><div><div class="pv-name">{e(sa["name"])}</div><div class="pv-from"><span class="sw" style="background:{T[sk][0]};box-shadow:inset 0 0 0 2px {T[sk][3]}"></span>{e(T[sk][8])} style</div></div></div>'''
    head = '<div class="pk-top"><button class="ib" aria-label="Back">&#8249;</button><h3>Choose your avatar</h3><span class="ib ghost"></span></div>'
    foot = '<div class="pk-foot"><button class="cta">Use this avatar</button></div>'
    note = '<p class="pk-note">Shows in its own style at every table, whatever the theme.</p>'
    strip = ''.join(f'<span class="sp" style="background:{T[k][0]}"><i>{AV[k][1]["svg"]}</i><b style="color:{T[k][1]}">{e(T[k][8])}</b></span>' for k in ORDER if k != tab)
    if layout == 'laptop':
        body = f'''<div class="pk lap">{head}<div class="lap-cols"><aside class="lap-pv">{hero}{seat}{crew}{note}</aside><div class="lap-main"><div class="tabs">{tabs}</div><div class="tiles">{tiles}</div>{ini}<h4>Jump to another style</h4><div class="strip">{strip}</div>{foot}</div></div></div>'''
    else:
        body = f'''<div class="pk {layout}">{head}<div class="pk-scroll">{hero}<div class="pv-pair">{seat}{crew}</div><div class="tabs">{tabs}</div><div class="tiles">{tiles}</div>{ini}{note}</div>{foot}</div>'''
    return f'<div class="skin sk-{skin}" style="{tokens(skin)}">{body}</div>'


def device(label, sub, w, h, inner, kind):
    return f'''<figure class="dev-fig"><figcaption><b>{e(label)}</b> <span>{e(sub)}</span></figcaption>
<div class="dev-fit" data-w="{w + 24}" data-h="{h + 24}"><div class="dev {kind}" style="width:{w}px;height:{h}px">{inner}</div></div></figure>'''


CSS = r'''
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#16110d;color:#f3ead7;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden}
svg{display:block;width:100%;height:100%}
.wrap{max-width:1240px;margin:0 auto;padding:0 20px}
.top{padding:56px 0 40px;background:radial-gradient(1200px 400px at 20% -10%,rgba(236,211,155,.12),transparent),#16110d;border-bottom:1px solid rgba(201,161,91,.25)}
.top .eyebrow{color:#ecd39b}
.top h1{font:600 clamp(30px,6vw,52px)/1.05 Georgia,'Times New Roman',serif;margin:8px 0 14px;letter-spacing:-.01em}
.top .lede{max-width:760px;color:#d9ccb2;font-size:17px;margin:0 0 26px}
.rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:0 0 26px;padding:0;list-style:none}
.rules li{background:rgba(246,240,225,.05);border:1px solid rgba(201,161,91,.25);border-radius:14px;padding:16px 18px}
.rules b{display:block;color:#ecd39b;font:600 17px Georgia,serif;margin-bottom:4px}
.rules span{color:#cbbd9f;font-size:14px}
.toc{display:flex;flex-wrap:wrap;gap:8px}
.toc a{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:#f3ead7;font-size:13px;padding:6px 12px 6px 6px;border-radius:99px;border:1px solid rgba(201,161,91,.3)}
.toc a i{width:22px;height:22px;display:block}
.eyebrow{font:600 11px/1 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}
.spec{display:flex;flex-wrap:wrap;gap:6px 18px;color:#b9a88b;font-size:13px;margin-top:22px}
.spec b{color:#f3ead7;font-weight:600}

.theme{background:var(--bg);color:var(--tx);padding:48px 0 52px;border-top:1px solid var(--line)}
.th-head{display:grid;grid-template-columns:auto 1fr;align-items:baseline;gap:4px 18px;margin-bottom:24px}
.th-head .eyebrow{color:var(--acc);grid-column:1/-1}
.th-head h2{margin:0;font:600 clamp(26px,4.4vw,38px)/1.1 var(--dsp)}
.th-head p{margin:0;color:var(--mut);font-size:15px}
@media (max-width:640px){.th-head{grid-template-columns:1fr}}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
@media (max-width:980px){.grid{grid-template-columns:repeat(3,1fr)}}
@media (max-width:700px){.grid{grid-template-columns:repeat(2,1fr);gap:12px}}
.card{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 14px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0}
.card .big{width:96px;height:96px}
.card figcaption{text-align:center;line-height:1.25}
.card figcaption b{display:block;font:600 16px/1.2 var(--dsp)}
.kind{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.small{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%;padding-top:10px;border-top:1px dashed var(--line)}
.small i{width:22px;height:22px;display:block;flex:none}
.seat{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--mut)}
.row{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 8px 3px 3px;border-radius:99px;background:rgba(127,127,127,.12)}
.row .pl{color:#4fae6b;font-weight:700}
.th-ivory .row .pl,.th-ink .row .pl,.th-edo .row .pl{color:#2c7a45}
/* per-theme flavour */
.th-noir .card{border-radius:2px}
.th-cyber .card{border-radius:0;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))}
.th-cyber h2,.th-pixel h2,.th-train h2{text-transform:uppercase;letter-spacing:.06em}
.th-ink .card{border:3px solid #111;border-radius:4px;box-shadow:4px 4px 0 #111}
.th-pixel .card{border-radius:0;border:0;box-shadow:0 0 0 2px #1a1220,inset 2px 2px 0 #4f4558,inset -2px -2px 0 #1a1220}
.th-ivory .card{box-shadow:0 1px 0 #fff,0 8px 24px rgba(60,45,25,.08)}
.th-edo .card{border:1px solid #1e2a4a;border-radius:8px;box-shadow:3px 3px 0 rgba(30,42,74,.2)}
.th-velvet .card{border-radius:20px}
.th-train .card{border-radius:12px}

/* ---------- picker section ---------- */
.pick-sec{background:#0f0b08;padding:56px 0 72px;border-top:1px solid rgba(201,161,91,.25)}
.pick-sec h2{font:600 clamp(26px,4.4vw,38px)/1.1 Georgia,serif;margin:8px 0 10px}
.pick-sec>.wrap>p{color:#cbbd9f;max-width:780px;margin:0 0 10px}
.pick-sec ul.notes{color:#b9a88b;font-size:14px;max-width:820px;padding-left:18px;margin:0 0 30px}
.devs{display:flex;flex-wrap:wrap;gap:36px 32px;align-items:flex-start}
.dev-fig{margin:0;min-width:0;max-width:100%}
.dev-fig.full{flex-basis:100%}
.dev-fig figcaption{font-size:14px;color:#f3ead7;margin-bottom:10px}
.dev-fig figcaption span{color:#9c8d74}
.dev-fit{position:relative;overflow:hidden}
.dev-fit>.dev{position:absolute;left:12px;top:12px;transform-origin:0 0}
.dev{border-radius:40px;overflow:hidden;box-shadow:0 0 0 10px #050403,0 0 0 11px #3a2c20,0 30px 60px rgba(0,0,0,.55)}
.dev.tablet{border-radius:28px}
.dev.laptop{border-radius:12px;box-shadow:0 0 0 10px #050403,0 0 0 11px #3a2c20,0 30px 60px rgba(0,0,0,.55)}

.skin{height:100%;background:var(--bg);color:var(--tx);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.sk-classic{background:radial-gradient(120% 60% at 50% 0,#2a1c13,#1b120d)}
.pk{height:100%;display:flex;flex-direction:column}
.pk-top{display:flex;align-items:center;justify-content:space-between;padding:54px 18px 10px}
.tablet .pk-top,.lap .pk-top{padding-top:22px}
.pk-top h3{margin:0;font:600 21px var(--dsp)}
.ib{width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--tx);font-size:24px;line-height:1}
.ib.ghost{visibility:hidden}
.pk-scroll{flex:1;overflow:hidden;padding:4px 18px 0}
.pv-hero{display:flex;align-items:center;gap:16px;padding:6px 0 14px}
.pv-big{width:96px;height:96px;flex:none}
.pv-name{font:600 22px/1.15 var(--dsp)}
.pv-from{display:flex;align-items:center;gap:7px;margin-top:6px;color:var(--mut);font-size:13px}
.sw{display:inline-block;width:14px;height:14px;border-radius:4px;flex:none}
.pv-pair{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-bottom:14px}
.cap{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin-top:6px}
.felt{height:96px;border-radius:14px;background:radial-gradient(120% 90% at 50% 120%,#3f7a4a,#1f3b2a 70%);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px #7a5426}
.sk-ivory .felt{background:radial-gradient(120% 90% at 50% 120%,#3b6a57,#1f4a3a 70%);box-shadow:inset 0 0 0 2px #c9b98f}
.seatbox{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;column-gap:7px;align-items:center;background:rgba(10,6,4,.72);padding:5px 10px 5px 5px;border-radius:99px;box-shadow:0 0 0 1.5px var(--acc)}
.sk-ivory .seatbox{background:#fffdf8;color:#22261f}
.sav{grid-row:1/3;width:30px;height:30px}
.snm{font-size:12px;font-weight:600;line-height:1.1}
.sst{font-size:11px;color:var(--acc);line-height:1.1}
.sk-ivory .sst{color:#1f4a3a}
.pv-crew{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:6px 8px}
.crow{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 2px}
.crow.dim{opacity:.6}
.crow+.crow{border-top:1px solid var(--line)}
.rk{width:12px;color:var(--mut);font-size:12px}
.cav{width:22px;height:22px;flex:none}
.ci{border-radius:50%;background:#a83c32;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center}
.cn{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cw{color:#5fbf7a;font-weight:700}.cw.neg{color:#e0796a}
.sk-ivory .cw{color:#2c7a45}.sk-ivory .cw.neg{color:#a0452e}
.pv-crew .cap{margin:2px 0 2px}
.tabs{display:flex;gap:6px;overflow:hidden;padding:2px 0 12px;margin-right:-18px;mask-image:linear-gradient(90deg,#000 85%,transparent)}
.tablet .tabs,.lap .tabs{flex-wrap:wrap;margin-right:0;mask-image:none}
.tab{flex:none;display:inline-flex;align-items:center;gap:7px;padding:7px 12px 7px 8px;border-radius:99px;border:1px solid var(--line);background:var(--panel);color:var(--tx);font:500 13px system-ui,sans-serif}
.tab.on{background:var(--acc);color:var(--acctx);border-color:var(--acc);font-weight:700}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px 7px;border-radius:14px;border:1px solid var(--line);background:var(--panel);color:var(--tx);min-width:0}
.tile .art{width:100%;max-width:64px;aspect-ratio:1;border-radius:10px;background:var(--tbg);padding:3px}
.tile .tn{font-size:11px;line-height:1.15;text-align:center;max-width:100%;min-height:2.3em;display:flex;align-items:center;justify-content:center}
.tile.on{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc),0 6px 18px rgba(0,0,0,.25)}
.tile.on .tn{font-weight:700;color:var(--acc)}
.chk{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--acc);color:var(--acctx);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--bg)}
.ini-opt{display:flex;align-items:center;gap:12px;width:100%;margin:12px 0 8px;padding:10px 14px 10px 10px;border-radius:14px;border:1px dashed var(--line);background:transparent;color:var(--tx);text-align:left}
.ini{width:42px;height:42px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font:700 15px var(--dsp);background:#a83c32;color:#f3ead7;box-shadow:inset 0 0 0 2px var(--acc)}
.sk-ivory .ini{background:#1f4a3a;color:#fffdf8;box-shadow:inset 0 0 0 2px #c9b98f}
.it{flex:1;display:flex;flex-direction:column;line-height:1.25}
.it b{font-size:14px}.it span{font-size:12px;color:var(--mut)}
.radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--line);flex:none}
.pk-note{font-size:12px;color:var(--mut);margin:4px 0 0;text-align:center}
.pk-foot{padding:12px 18px 30px;border-top:1px solid var(--line);background:var(--bg)}
.cta{width:100%;height:50px;border-radius:14px;border:0;background:var(--acc);color:var(--acctx);font:700 16px system-ui,sans-serif}
.sk-ivory .cta{border-radius:12px}
/* tablet */
.tablet .pk-scroll{padding:8px 40px 0}
.tablet .pv-hero{gap:22px}.tablet .pv-pair{grid-template-columns:1fr 1.3fr;gap:16px;margin-bottom:22px}
.tablet .felt{height:120px}
.tablet .tiles{gap:16px}.tablet .tile .art{max-width:150px;padding:5px}.tablet .tile .tn{font-size:14px;min-height:1.4em}.tablet .tab{font-size:14px;padding:9px 14px 9px 10px}.tablet .pv-big{width:120px;height:120px}.tablet .pv-name{font-size:28px}.tablet .sav{width:40px;height:40px}.tablet .snm{font-size:15px}.tablet .sst{font-size:13px}.tablet .crow{font-size:15px;padding:6px 2px}.tablet .cav{width:28px;height:28px}.tablet .ini-opt{margin-top:20px}
.tablet .pk-foot{padding:16px 40px 28px}.tablet .cta{max-width:360px;display:block;margin:0 auto}
.tablet .tile{padding:14px 8px 10px}
/* laptop */
.lap .pk-top{padding:22px 36px 14px;border-bottom:1px solid var(--line)}
.lap-cols{flex:1;display:grid;grid-template-columns:360px 1fr;min-height:0}
.lap-pv{padding:26px 28px;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:18px}

.lap-main{padding:24px 36px;display:flex;flex-direction:column}
.lap .tiles{grid-template-columns:repeat(8,1fr);gap:14px;margin-top:14px}.lap .tab{font-size:14px;padding:9px 15px 9px 10px}.lap .pv-big{width:128px;height:128px}.lap .pv-hero{flex-direction:column;align-items:flex-start}.lap .pv-name{font-size:28px}.lap-pv .felt{height:150px}.lap .sav{width:40px;height:40px}.lap .snm{font-size:15px}.lap .sst{font-size:13px}.lap .crow{font-size:14px;padding:6px 2px}
.lap .tile{padding:14px 8px 12px}.lap .tile .art{max-width:128px;padding:5px}.lap .tile .tn{font-size:13px}.lap-main h4{margin:26px 0 0;font:600 13px system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.lap .ini-opt{max-width:420px;margin-top:22px}
.lap .pk-foot{margin-top:auto;border:0;padding:0;display:flex;justify-content:flex-end;background:none}
.lap .cta{width:240px}
.strip{display:grid;grid-template-columns:repeat(8,1fr);gap:12px;margin-top:12px}.sp{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:12px;border:1px solid var(--line)}.sp i{width:56px;height:56px;display:block}.sp b{font-size:12px;font-weight:600}
.foot{padding:30px 0 50px;color:#9c8d74;font-size:13px;background:#0f0b08}
'''

JS = r'''
function fit(){document.querySelectorAll('.dev-fit').forEach(function(f){var w=+f.dataset.w,h=+f.dataset.h,avail=f.closest('.devs').clientWidth||w;var s=Math.min(1,avail/w);f.style.width=(w*s)+'px';f.style.height=(h*s)+'px';var d=f.firstElementChild;d.style.transform='scale('+s+')';});}
window.addEventListener('resize',fit);fit();
'''


def main():
    toc = ''.join(f'<a href="#t-{k}" style="background:{T[k][0]};color:{T[k][1]};border-color:{T[k][5]}"><i>{AV[k][0]["svg"]}</i>{e(T[k][8])}</a>' for k in ORDER)
    n_char = sum(a['kind'] == 'character' for k in AV for a in AV[k])
    top = f'''<header class="top"><div class="wrap"><span class="eyebrow">Train Poker &middot; design review</span>
<h1>Player avatars: 72 looks in 9 styles</h1>
<p class="lede">Eight selectable avatars per theme, each drawn in that theme's own art style. {n_char} characters and {72 - n_char} emblems or animals, all original and self-contained SVG. Please approve, or mark the ones to redraw.</p>
<ul class="rules">
<li><b>Pick from any theme</b><span>The picker shows all nine sets, whatever theme the table is using.</span></li>
<li><b>Keeps its own style</b><span>A Pixel knight stays pixel art at a Noir table, at every seat and in every list.</span></li>
<li><b>Initials stay an option</b><span>Players who pick nothing keep their initials, drawn in the table's style as today.</span></li>
</ul>
<nav class="toc">{toc}<a href="#picker" style="padding-left:12px">The picker &rarr;</a></nav>
<div class="spec"><span><b>Shown at</b> 96 px (profile) and 22 px (table seat, crew list)</span><span><b>Format</b> inline SVG, viewBox 0 0 64 64</span><span><b>Data</b> tools/design/avatars/avatars.json</span></div>
</div></header>'''
    secs = ''.join(section(k) for k in ORDER)
    devs = ''.join([
        device('Phone', '390 x 844, Classic theme, browsing Night Train', 390, 844, picker('classic', 'train', 'train-night-owl', 'phone'), 'phone'),
        device('Phone', '390 x 844, Ivory theme, a Noir pick', 390, 844, picker('ivory', 'noir', 'noir-detective', 'phone'), 'phone'),
        device('Tablet', '820 x 1180, Classic theme, browsing Edo', 820, 1180, picker('classic', 'edo', 'edo-kabuki-star', 'tablet'), 'tablet'),
    ])
    lap = device('Laptop', '1440 x 900, Classic theme, browsing Pixel: the wide grid', 1440, 900, picker('classic', 'pixel', 'pixel-wizard', 'laptop'), 'laptop').replace('class="dev-fig"', 'class="dev-fig full"')
    pick = f'''<section class="pick-sec" id="picker"><div class="wrap"><span class="eyebrow" style="color:#ecd39b">The picker</span><h2>Choose your avatar</h2>
<p>Opened from the profile. Nine theme tabs, a grid of eight, an Initials option, and a live preview of how the pick looks at a table seat and in a crew list.</p>
<ul class="notes"><li>The tab row starts on the current theme; every tab is available.</li><li>Selected tile: accent ring plus a check badge; the preview and its style tag update at once.</li><li>Each tile sits on a small swatch of its own theme's background so the art reads as drawn.</li><li>Phone: 4 columns, tabs scroll sideways. Tablet: 4 large columns, tabs wrap. Laptop: preview on the left, all 8 in one row.</li></ul>
<div class="devs">{devs}{lap}</div></div></section>'''
    page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avatar Review Board</title><style>{CSS}</style></head><body>{top}{secs}{pick}<footer class="foot"><div class="wrap">Generated from tools/design/avatars/gen.py and board.py. Design only; no app code changed.</div></footer><script>{JS}</script></body></html>'''
    open(OUT, 'w').write(page)
    print('wrote', OUT, len(page) // 1024, 'KB')


main()
