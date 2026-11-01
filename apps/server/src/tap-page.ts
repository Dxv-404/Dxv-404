// Tap-to-everyone check, served by both table servers at /tap?t=CODE. Open it on two or more phones
// with the same code. Each tap goes to the table as a reaction and comes back to every phone.
// Every phone shows two legs, measured against the server's clock:
//   "your tap reaches the table" (up) and "a tap from the table reaches you" (down).
// Tap-to-everyone = the tapping phone's up leg + the slowest other phone's down leg.
export const TAP_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Train Poker tap check</title><style>body{font:17px/1.5 system-ui,sans-serif;background:#1b120d;color:#f3ead7;padding:20px;margin:0}b{color:#ecd39b}pre{white-space:pre-wrap;word-break:break-all;font-size:13px}button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid #ecd39b;background:#2a1d14;color:#f3ead7}#tap{display:block;width:100%;height:150px;font-size:28px;margin:16px 0;touch-action:manipulation}#tap:disabled{opacity:.5}.flash{animation:f .4s}@keyframes f{from{background:#ecd39b;color:#1b120d}}</style></head>
<body><h1>Tap check</h1><p id="who">Connecting…</p><button id="tap" disabled>Tap</button><p id="out">Open this page on another phone with the same code, then take turns tapping (about 20 taps each).</p><p><button id="copy">Copy result</button></p><pre id="raw"></pre><script>
(() => {
  const code = (new URLSearchParams(location.search).get('t') || 'TAP1').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12).padEnd(4, '0');
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
  const me = sessionStorage.getItem('tp-tap-id') || ('tap_' + rand(4)); sessionStorage.setItem('tp-tap-id', me);
  const token = sessionStorage.getItem('tp-tap-token') || rand(16); sessionStorage.setItem('tp-tap-token', token);
  const $ = (id) => document.getElementById(id);
  const up = [], down = [], round = [];
  let offset = null, bestRtt = Infinity, sentAt = 0, ws, players = 0;
  const stats = (t) => { if (!t.length) return null; t = t.slice().sort((a, b) => a - b); const q = (x) => Math.round(t[Math.min(t.length - 1, Math.floor(x * t.length))]); return { n: t.length, p50: q(0.5), p95: q(0.95), min: Math.round(t[0]) }; };
  const show = () => {
    const u = stats(up), d = stats(down), r = stats(round);
    const parts = [];
    if (u) parts.push('Your tap reaches the table: median <b>' + u.p50 + ' ms</b> (95%: ' + u.p95 + ' ms, ' + u.n + ' taps)');
    if (d) parts.push('A tap from another phone reaches you after the table: median <b>' + d.p50 + ' ms</b> (95%: ' + d.p95 + ' ms, ' + d.n + ' taps)');
    if (r) parts.push('Your tap, to the table and back to you: median <b>' + r.p50 + ' ms</b>');
    if (u && d) parts.push('Tap to everyone, if the other phone is like this one: about <b>' + (u.p50 + d.p50) + ' ms</b>');
    $('out').innerHTML = parts.join('<br>') || 'Tap the button, and tap on the other phone too.';
    $('raw').textContent = JSON.stringify({ server: location.host, code, players, up: u, down: d, round: r, rtt: Math.round(bestRtt), net: navigator.connection && navigator.connection.effectiveType, ua: navigator.userAgent });
  };
  const connect = () => {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/table/' + code);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 1, table: code, player: me, lastSeq: 0, token, name: 'Tap ' + me.slice(-4) }));
    ws.onmessage = (ev) => {
      const now = Date.now();
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome' || m.t === 'update') { players = (m.view.players || []).filter((p) => p.connected).length; $('who').innerHTML = 'Table <b>' + code + '</b> · phones here: <b>' + players + '</b>'; $('tap').disabled = false; }
      if (m.t === 'pong') { const rtt = now - m.c; if (rtt <= bestRtt) { bestRtt = rtt; offset = m.s - (m.c + rtt / 2); } }
      if (m.t === 'react' && offset !== null && typeof m.at === 'number') {
        if (m.from === me && sentAt) { up.push(Math.max(0, m.at - (sentAt + offset))); round.push(now - sentAt); sentAt = 0; }
        else if (m.from !== me) { down.push(Math.max(0, now + offset - m.at)); document.body.classList.remove('flash'); void document.body.offsetWidth; document.body.classList.add('flash'); }
        show();
      }
    };
    ws.onclose = () => { $('tap').disabled = true; $('who').textContent = 'Reconnecting…'; setTimeout(connect, 1000); };
  };
  setInterval(() => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'ping', c: Date.now() })); }, 1000);
  $('tap').onclick = () => {
    if (!ws || ws.readyState !== 1) return;
    sentAt = Date.now();
    ws.send(JSON.stringify({ t: 'react', reaction: '👍' }));
    $('tap').disabled = true; setTimeout(() => { $('tap').disabled = false; }, 900); // one reaction every 0.8 s
  };
  $('copy').onclick = () => navigator.clipboard.writeText($('raw').textContent).then(() => { $('copy').textContent = 'Copied'; });
  connect(); show();
})();
</script></body></html>`;
