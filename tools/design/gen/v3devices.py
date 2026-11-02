"""One player, many devices: add a device with a one-time code, sign in on the other, and one seat per player at a table."""
from v3kit import *

def devlist(th):
    return ('<div class="pnl" style="gap:8px"><div class="hrow"><span class="klbl">Your devices</span><span class="sp"></span><span class="chipt">2</span></div>'
            f'<div class="row on"><span class="dev">{ICON["phone"]}</span><span class="txt"><b>This phone</b><small>Pixel 7 · Chrome · now</small></span></div>'
            f'<div class="row"><span class="dev">{ICON["laptop"]}</span><span class="txt"><b>Dev’s laptop</b><small>Mac · Chrome · 2 min ago</small></span><span class="mm">{ICON["more"]}</span></div></div>')

def profile(th):
    inner = (head('Profile', back=True)
             + f'<div class="pcard">{av(th, ME, 78, "menu")}<b>Dev</b><span class="acc" style="font:700 12.5px var(--ui)">Change name or picture</span></div>'
             + devlist(th)
             + '<div class="bb p hz">' + ic('plus') + 'Add a device</div>'
             + '<div class="bb s">Use an account I already have<small>Sign in with a code from your other device</small></div>'
             + '<div class="row"><span class="txt"><b>Recovery code</b><small>For when you lose every device. Keep it somewhere safe.</small></span><span class="go">›</span></div>'
             + nav('play'))
    return screen(th, inner)

def addcode(th):
    inner = (head('Add a device', 'Code works for 5 minutes, once')
             + '<div class="seg" style="margin:0 30px"><span class="on">Code</span><span>QR</span></div>'
             + '<div class="codebox"><div class="ring" style="--rs:230px"><div class="rin"><div class="digits"><span>4</span><span>8</span><span>2</span><i></i><span>9</span><span>1</span><span>3</span></div>'
             '<small class="mut">4:52 left</small></div></div></div>'
             + '<div class="pnl" style="gap:9px"><span class="klbl">On your other device</span>'
             '<div class="stp"><i>1</i><span>Open Train Poker and tap your name (Profile)</span></div>'
             '<div class="stp"><i>2</i><span>Tap <b>Use an account I already have</b></span></div>'
             '<div class="stp"><i>3</i><span>Type <b>482 913</b> and you’re in</span></div></div>'
             + '<div class="hrow" style="justify-content:center;gap:18px;font:700 13px var(--ui)"><span class="acc">Make a new code</span><span class="mut">Cancel</span></div>'
             + '<p class="hint" style="margin-top:auto;margin-bottom:22px">Only share this code with yourself. Anyone with it can sign in as you for the next 5 minutes.</p>')
    return screen(th, inner)

def addqr(th):
    inner = (head('Add a device', 'Code works for 5 minutes, once')
             + '<div class="seg" style="margin:0 30px"><span>Code</span><span class="on">QR</span></div>'
             + f'<div class="qrbig"><div class="scanl"></div>{qr("482913", 25, 8)}</div>'
             + '<p class="hint">Point the other device’s camera here. On a laptop, show this to its webcam from <b>Use an account I already have › Scan</b>.</p>'
             + '<div class="hrow" style="justify-content:center"><span class="chipt">482 913</span><span class="chipt o">4:31 left</span></div>'
             + '<div style="margin-top:auto;margin-bottom:22px" class="bb g">Done</div>')
    return screen(th, inner)

def entercode(th, err=None):
    if err == 'wrong':
        sl, msg = ('<span class="f">4</span><span class="f">8</span><span class="f">2</span><span class="dash">–</span><span class="f">9</span><span class="f">1</span><span class="f">8</span>',
                   '<p class="errm">That code doesn’t match. 4 tries left before a short pause.</p>')
    elif err == 'expired':
        sl, msg = ('<span class="f">4</span><span class="f">8</span><span class="f">2</span><span class="dash">–</span><span class="f">9</span><span class="f">1</span><span class="f">3</span>',
                   '<p class="errm">This code ran out. Make a new one on your other device; it takes a second.</p>')
    else:
        sl, msg = ('<span class="f">4</span><span class="f">8</span><span class="f">2</span><span class="dash">–</span><span class="f">9</span><span class="c"></span><span></span>',
                   '<p class="hint" style="margin:0">On your other device: Profile › Add a device</p>')
    pad = ''.join(f'<span>{k}</span>' for k in '123456789') + '<span></span><span>0</span><span>⌫</span>'
    inner = (head('Use your account', 'Sign in with a one-time code')
             + f'<div class="pnl" style="gap:14px"><div class="ttl">Type the 6-digit code</div><div class="kslots{" err" if err else ""}">{sl}</div>{msg}</div>'
             + '<div class="row">' + ic('qr') + '<span class="txt"><b>Scan the QR instead</b><small>From the other device’s screen</small></span><span class="go">›</span></div>'
             + f'<div class="pad">{pad}</div>')
    return screen(th, inner)

def merge(th):
    sheet = ('<div class="bsheet"><span class="grip"></span><b style="font:var(--dspw,700) 20px var(--dsp)">This phone has its own crew</b>'
             '<p class="mut" style="margin:0;font-size:13px;line-height:1.5">You played on this phone before as “Dev”. Bring its crew and games into your account, or leave them behind?</p>'
             f'<div class="row">{emblem(HOS, 36)}<span class="txt"><b>Hostel 4B</b><small>7 members · you’re the leader · 12 games</small></span></div>'
             '<div class="bb p">Bring them over<small>Recommended: nothing is lost</small></div><div class="bb g">Leave them behind</div></div>')
    return screen(th, head('Use your account') + '<div class="pnl"><div class="kslots"><span class="f">4</span><span class="f">8</span><span class="f">2</span><span class="dash">–</span><span class="f">9</span><span class="f">1</span><span class="f">3</span></div></div>',
                  overlay='<div class="kdim"></div>' + sheet)

def linked(th):
    inner = (head('You’re in', back=False)
             + f'<div class="linkart"><span class="d1">{ICON["laptop"]}</span><span class="wire"><i></i><i></i><i></i></span><span class="d2">{ICON["phone"]}</span></div>'
             + f'<div class="pcard">{av(th, ME, 70, "menu")}<b>Welcome back, Dev</b><span class="mut" style="font-size:12.5px">This phone is now your account too</span></div>'
             + '<div class="three"><div class="stat"><b>2</b><small>crews</small></div><div class="stat"><b>48</b><small>games</small></div><div class="stat"><b>3</b><small>trophies</small></div></div>'
             + '<div class="pnl" style="gap:6px;font-size:12.5px;line-height:1.5"><span class="klbl">What moved with you</span><span>Your name and picture, your crews, your league places, your games and replays, your theme.</span></div>'
             + '<div class="bb p" style="margin-top:auto;margin-bottom:22px">Go to the menu</div>')
    return screen(th, inner, overlay='<div class="toast" style="top:18px">' + ic('check') + 'Signed in. Your laptop got a notice too.</div>')

def seatmove(th):
    body = phone_body(th, bubble=False, actions='<button class="act ghost">Watching</button>', hero_hint=('Watching', 'Your seat is on your laptop'))
    ask = ('<div class="askb"><div class="hrow"><span class="dev">' + ICON['laptop'] + '</span><b style="font:var(--dspw,700) 18px var(--dsp)">You’re playing on your laptop</b></div>'
           '<small>Same account, same seat. Only one device can play it at a time; the other one watches.</small>'
           '<div class="two"><span class="bb g">Just watch</span><span class="bb p">Move seat here</span></div></div>')
    return f'<div class="tp phone dense th-{th.key}" style="width:390px;height:844px">{body}<div class="kdim"></div>{ask}</div>'

def lap_add(th):
    dlg = (f'<div class="ldlg"><div class="hrow"><b class="lt">Add a device</b><span class="sp"></span><span class="ib">✕</span></div>'
           f'<div class="lgrid"><div class="qrbig">{qr("482913", 25, 9)}</div><div class="lside"><span class="klbl">Or type this code</span>'
           '<div class="digits big2"><span>4</span><span>8</span><span>2</span><i></i><span>9</span><span>1</span><span>3</span></div>'
           '<div class="hrow"><div class="ring" style="--rs:44px"><span></span></div><span class="mut">4:52 left · works once</span></div>'
           '<div class="stp"><i>1</i><span>On your phone, open Train Poker › your name</span></div><div class="stp"><i>2</i><span>Use an account I already have</span></div>'
           '<div class="stp"><i>3</i><span>Scan this QR, or type the code</span></div><span class="acc" style="font:700 13px var(--ui)">Make a new code</span></div></div></div>')
    return lap_frame(th, dlg)

def lap_enter(th):
    dlg = ('<div class="ldlg" style="width:560px"><div class="hrow"><b class="lt">Use your account</b><span class="sp"></span><span class="ib">✕</span></div>'
           '<p class="mut" style="margin:0;font-size:14px">On your phone: Profile › Add a device. Then type the code here, or hold the phone’s QR up to this camera.</p>'
           '<div class="kslots" style="gap:10px"><span class="f">4</span><span class="f">8</span><span class="f">2</span><span class="dash">–</span><span class="f">9</span><span class="c"></span><span></span></div>'
           '<div class="hrow"><span class="bb g hz" style="flex:1">' + ic('qr') + 'Scan with the camera</span><span class="bb p" style="flex:1">Sign in</span></div>'
           '<p class="hint" style="text-align:left">Typing works with the keyboard; paste works too. Tab moves between the boxes.</p></div>')
    return lap_frame(th, dlg)

def lap_frame(th, dlg):
    return scaled(f'<div class="tp v3s th-{th.key}" style="width:1440px;height:900px"><div class="fx" aria-hidden="true">{th.bg("lap")}</div><div class="kdim" style="z-index:3"></div>{dlg}</div>', 1440, 900, .62)

CSS = r'''
.pcard{display:grid;justify-items:center;gap:4px;text-align:center}.pcard>b{font:var(--dspw,700) 22px var(--dsp)}
.codebox{display:grid;place-items:center;padding:6px 0}
.rin{display:grid;justify-items:center;gap:6px}.rin .digits span{width:27px;height:40px;font-size:22px}.rin .digits i{width:4px}
.stp{display:flex;gap:10px;align-items:center;font-size:13px}.stp i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:none;background:var(--acc);color:var(--acctx);font:800 11.5px var(--num)}
.qrbig{position:relative;justify-self:center;padding:10px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px var(--line),0 14px 30px rgba(0,0,0,.3);overflow:hidden}
.scanl{position:absolute;left:0;right:0;height:3px;background:var(--acc);box-shadow:0 0 12px var(--acc);animation:scan 2.4s ease-in-out infinite;z-index:2}
@keyframes scan{0%,100%{top:8%}50%{top:90%}}
.pad{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:auto -18px 0;padding:10px 12px 26px;background:color-mix(in srgb,var(--tx) 6%,var(--bg))}
.pad span{height:46px;display:grid;place-items:center;border-radius:var(--r-btn,10px);font:var(--numw,600) 22px var(--num);background:var(--chipbg)}
.pad span:empty{background:none}
.errm{margin:0;font-size:12.5px;color:var(--red,#e0524a);line-height:1.45}
.linkart{display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 0}
.linkart>span:not(.wire){width:58px;height:58px;display:grid;place-items:center;border-radius:16px;background:var(--chipbg);box-shadow:inset 0 0 0 1px var(--line);color:var(--acc)}.linkart svg{width:32px;height:32px}
.wire{display:flex;gap:7px}.wire i{width:9px;height:9px;border-radius:50%;background:var(--acc);animation:wire 1.2s ease-in-out infinite}.wire i:nth-child(2){animation-delay:.2s}.wire i:nth-child(3){animation-delay:.4s}
@keyframes wire{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:none}}
.linkart .d2{animation:land .8s cubic-bezier(.2,1.3,.4,1) both}
@keyframes land{from{transform:translateX(-40px);opacity:0}}
.ldlg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;width:760px;padding:30px;border-radius:var(--r-panel,20px);background:var(--bg);box-shadow:var(--panelsh,inset 0 0 0 1px var(--line)),0 30px 80px rgba(0,0,0,.6);display:grid;gap:18px;animation:pop2 .4s cubic-bezier(.2,.9,.3,1.1) both}
@keyframes pop2{from{transform:translate(-50%,-46%) scale(.96);opacity:0}}
.ldlg .lt{font:var(--dspw,700) 28px var(--dsp)}
.lgrid{display:grid;grid-template-columns:auto 1fr;gap:30px;align-items:center}
.lside{display:grid;gap:12px}.big2 span{width:52px;height:68px;font-size:36px}
.ldlg .kslots span{height:64px;font-size:30px}
'''

def build(th):
    r1 = ''.join([
        col('Profile', 'Your devices', 'Every device signed in as you, with when it was last used. Two buttons: add another device, or sign this one in to an account you already have.', profile(th)),
        col('Add a device · code', 'A one-time code', 'Six digits inside a ring that empties over 5 minutes. The code works once. The steps for the other device sit right under it.', addcode(th)),
        col('Add a device · QR', 'Or a QR', 'The same code as a QR, with a scan line. Phones scan with the camera; laptops can scan with their webcam.', addqr(th)),
        col('Other device · enter', 'Type the code', 'The same code boxes as the table and crew codes, with a number pad. Pasting the code fills every box.', entercode(th)),
        col('Other device · wrong', 'Wrong code', 'One shake, the theme’s red, and how many tries are left. After 5 wrong tries the code is cancelled and a new one is needed.', entercode(th, 'wrong')),
    ])
    r2 = ''.join([
        col('Other device · merge', 'If that device had its own crews', 'Asked once, only when there is something to bring. Bringing them over is the default because nothing is lost.', merge(th)),
        col('Other device · done', 'Signed in', 'The two devices join with a little animation; what moved with you is listed. The first device gets a notice: “Signed in on a new phone”.', linked(th)),
        col('At a table', 'One seat, one device', 'If you open a table you are already playing on another device, you choose: move the seat here, or just watch. The seat never plays twice.', seatmove(th)),
    ])
    r3 = ''.join([
        col('Laptop · add a device', 'Adding from a laptop', 'On big screens the QR and the code sit side by side in a dialog over the theme’s background, so a phone can scan it from the desk.', lap_add(th), 893),
        col('Laptop · sign in', 'Signing in on a laptop', 'Type it, paste it or let the webcam read the phone’s QR. Keyboard friendly: digits type straight into the boxes.', lap_enter(th), 893),
    ])
    body = f'<div class="v3row">{r1}</div><div class="v3row">{r2}</div><div class="v3row">{r3}</div>' + note(
        ('The code', '6 digits, works once, for 5 minutes. Making a new code cancels the old one. 5 wrong tries cancel it too.'),
        ('Safety', 'Every new sign-in sends a notice to your other devices with a “Not me? Log it out” button. Devices can be renamed and logged out from Profile.'),
        ('Either way round', 'Phone to laptop, laptop to phone, phone to phone. The recovery code stays as the last resort when every device is lost.'),
        ('Motion', 'Digits flip in one after another (60 ms apart); the ring drains over 5 minutes; the QR scan line sweeps 2.4 s; the devices join with travelling dots; dialogs pop 0.4 s.'))
    return board(th, f'{th.key}-devices.dc.html', f'{th.name}: your account on every device', 'Add a device with a one-time code or QR, sign in on the other one, bring along anything that device had, and keep one seat per player at a table.', body, 2160, 2900, CSS)
