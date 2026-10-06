// Offline peer-to-peer networking: WebRTC data channels over a local hotspot,
// signalled by scanning QR codes (no server, no internet).
//
// Signal payload (fits in a small QR):
//   PK1~<o|a>~<ufrag>~<pwd>~<fingerprint base64>~<candidates>~<extra json>
// candidates: comma list of "ip:port" (udp host candidates)

const ICE = { iceServers: [] }; // no STUN/TURN: host candidates only, works on a LAN with no internet

function b64(bytes) { let s = ''; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/=+$/, ''); }
function unb64(str) { const s = atob(str); return Uint8Array.from(s, (c) => c.charCodeAt(0)); }

function compactSdp(sdp, kind, extra) {
  const get = (re) => (sdp.match(re) || [])[1];
  const ufrag = get(/a=ice-ufrag:(\S+)/);
  const pwd = get(/a=ice-pwd:(\S+)/);
  const fp = get(/a=fingerprint:sha-256 (\S+)/);
  const fpBytes = fp.split(':').map((h) => parseInt(h, 16));
  const cands = [];
  for (const m of sdp.matchAll(/a=candidate:\S+ 1 (udp|UDP) \d+ (\S+) (\d+) typ host/g)) {
    const addr = m[2];
    const entry = `${addr}:${m[3]}`;
    if (!cands.includes(entry)) cands.push(entry);
  }
  // prefer IPv4 private addresses first (that's the hotspot), keep a few
  cands.sort((a, b) => score(b) - score(a));
  const list = cands.slice(0, 6).map((c) => c.replace(/:(\d+)$/, '_$1'));
  return ['PK1', kind, ufrag, pwd, b64(fpBytes), list.join(','), extra ? JSON.stringify(extra) : ''].join('~');
}
function score(c) {
  if (/^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^10\./.test(c)) return 3;
  if (/\.local:/.test(c)) return 2;
  if (/^\d+\.\d+\.\d+\.\d+:/.test(c)) return 1;
  return 0;
}

export function parsePayload(str) {
  const parts = String(str).trim().split('~');
  if (parts[0] !== 'PK1' || parts.length < 6) throw new Error('That is not a Train Poker code');
  const [, kind, ufrag, pwd, fp, cands, extra] = parts;
  return {
    kind, ufrag, pwd,
    fp: [...unb64(fp)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':'),
    cands: cands ? cands.split(',').map((c) => { const i = c.lastIndexOf('_'); return { addr: c.slice(0, i), port: c.slice(i + 1) }; }) : [],
    extra: extra ? JSON.parse(extra) : {},
  };
}

function expandSdp(p, kind) {
  const lines = [
    'v=0',
    `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${p.ufrag}`,
    `a=ice-pwd:${p.pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${p.fp}`,
    `a=setup:${kind === 'o' ? 'actpass' : 'active'}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  p.cands.forEach((c, i) => {
    const ipv = c.addr.includes(':') ? 'ip6' : 'ip4';
    lines.push(`a=candidate:${i + 1} 1 udp ${2122260223 - i * 256} ${c.addr} ${c.port} typ host generation 0 network-id ${i + 1}`);
    void ipv;
  });
  lines.push('a=end-of-candidates');
  return lines.join('\r\n') + '\r\n';
}

function waitGather(pc, ms = 3000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', chk); resolve(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
    pc.addEventListener('icegatheringstatechange', chk);
    const t = setTimeout(done, ms);
  });
}

// A single link to one remote phone.
export class Link {
  constructor() {
    this.pc = null;
    this.dc = null;
    this.onmessage = null;
    this.onopen = null;
    this.onclose = null;
    this.lastSeen = 0;
    this.open = false;
    this.closed = false;
  }

  _wire(dc) {
    this.dc = dc;
    dc.onopen = () => { this.open = true; this.lastSeen = Date.now(); this.onopen && this.onopen(); };
    dc.onclose = () => this._closed();
    dc.onerror = () => {};
    dc.onmessage = (e) => {
      this.lastSeen = Date.now();
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'ping') return this.send({ t: 'pong' });
      if (msg.t === 'pong') return;
      this.onmessage && this.onmessage(msg);
    };
  }

  _closed() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.onclose && this.onclose();
  }

  _watch() {
    this.pc.onconnectionstatechange = () => {
      const st = this.pc.connectionState;
      if (st === 'failed' || st === 'closed') this._closed();
    };
  }

  // Host side: make an offer payload.
  async createOffer(extra) {
    this.pc = new RTCPeerConnection(ICE);
    this._watch();
    this._wire(this.pc.createDataChannel('poker', { ordered: true }));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitGather(this.pc);
    return compactSdp(this.pc.localDescription.sdp, 'o', extra);
  }

  // Host side: accept the guest's answer payload.
  async acceptAnswer(payload) {
    const p = typeof payload === 'string' ? parsePayload(payload) : payload;
    if (p.kind !== 'a') throw new Error('That is a join code. Scan the reply code from your friend\'s phone.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: expandSdp(p, 'a') });
  }

  // Guest side: take host offer, return answer payload.
  async acceptOffer(payload, extra) {
    const p = typeof payload === 'string' ? parsePayload(payload) : payload;
    if (p.kind !== 'o') throw new Error('That is a reply code. Scan the join code on the host phone.');
    this.pc = new RTCPeerConnection(ICE);
    this._watch();
    this.pc.ondatachannel = (e) => this._wire(e.channel);
    await this.pc.setRemoteDescription({ type: 'offer', sdp: expandSdp(p, 'o') });
    const ans = await this.pc.createAnswer();
    await this.pc.setLocalDescription(ans);
    await waitGather(this.pc);
    return compactSdp(this.pc.localDescription.sdp, 'a', extra);
  }

  send(msg) {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    try { this.dc.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  close() {
    try { this.dc && this.dc.close(); } catch {}
    try { this.pc && this.pc.close(); } catch {}
    this._closed();
  }
}

// Keepalive: pings every 2.5 s; a link silent for 9 s is treated as dropped.
export function keepAlive(link, onDead) {
  const iv = setInterval(() => {
    if (link.closed) return clearInterval(iv);
    if (!link.open) return;
    link.send({ t: 'ping' });
    if (Date.now() - link.lastSeen > 9000) { clearInterval(iv); link.close(); onDead && onDead(); }
  }, 2500);
  return () => clearInterval(iv);
}

// Expose raw LAN IPs instead of mDNS names: Chrome only does this while the page
// has camera/mic permission, which we need anyway for scanning.
export async function warmUpCamera() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    return s;
  } catch { return null; }
}
