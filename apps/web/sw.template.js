// Offline cache: everything the game needs is stored on first visit.
const CACHE = '__CACHE__';
const FILES = __FILES__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // opening the app (a page load) always asks the network first, so whoever opens it gets the latest version
  // on any device without clearing anything; the saved copy is used only when offline or the network is very slow
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(e.request, { cache: 'no-store' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {}); return res; }
        throw new Error('bad');
      } catch {
        return (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match('./index.html')) || fetch(e.request);
      }
    })());
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

// Push notifications (your turn while the app is in the background, a crew table started, approvals,
// trophies). A push is a backup: while the table is on screen, nothing is shown.
/** A crew table that started (kind from newer servers; the tag from older ones): it gets a Join now button. */
const isCrewTable = (m) => m.kind === 'crewTable' || (!m.kind && /^table-/.test(String(m.tag || '')));
/** Buttons on notifications: Android and desktop browsers; iPhones show none (tapping the notification joins). */
const canAct = () => typeof Notification !== 'undefined' && 'actions' in Notification.prototype && (Notification.maxActions === undefined || Notification.maxActions > 0);
function notificationFor(m) {
  const o = {
    body: m.body || '', tag: m.tag || 'tp', renotify: true, data: { url: m.url || './', kind: m.kind || (isCrewTable(m) ? 'crewTable' : '') },
    icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', vibrate: [80, 60, 80],
  };
  if (isCrewTable(m) && canAct()) o.actions = [{ action: 'join', title: 'Join now' }];
  return o;
}
// ---- research (docs/research-data.md): a push arriving and a tap on it, sent to the ingestion endpoint the
// app named (kept in IndexedDB); if that fails they wait in IndexedDB and the app sends them next time.
// Never in the way: every step is wrapped, and showing the notification never waits for it.
const swSession = 'sw-' + Math.random().toString(36).slice(2, 12);
let swSeq = 0;
function idb(fn) {
  return new Promise((res) => {
    try {
      const open = indexedDB.open('tp-research', 1);
      open.onupgradeneeded = () => { open.result.createObjectStore('kv'); };
      open.onsuccess = () => { try { fn(open.result.transaction('kv', 'readwrite').objectStore('kv'), res); } catch (e) { res(null); } };
      open.onerror = () => res(null);
    } catch (e) { res(null); }
  });
}
const idbGet = (k) => idb((st, res) => { const r = st.get(k); r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null); });
const idbPut = (k, v) => idb((st, res) => { const r = st.put(v, k); r.onsuccess = () => res(true); r.onerror = () => res(null); });
async function research(t, p) {
  try {
    const cfg = await idbGet('cfg');
    if (!cfg || !cfg.url) return null;
    const ev = { id: crypto.randomUUID(), sv: 1, t, v: 1, src: 'w', tc: Date.now(), tm: Math.round(performance.now() * 1000) / 1000, s: swSession, q: ++swSeq, d: cfg.device || null, a: null, g: null, app: cfg.app || null, p };
    try {
      const r = await fetch(cfg.url + '/research/ingest', { method: 'POST', body: JSON.stringify({ events: [ev] }), keepalive: true });
      if (r && r.ok) return ev;
    } catch (e) { /* offline: keep it */ }
    const pending = (await idbGet('pending')) || [];
    pending.push(ev);
    await idbPut('pending', pending.slice(-200));
    return ev;
  } catch (e) { return null; }
}

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { /* not ours */ }
  if (!m.title) return;
  // (the table server pushes a turn only while the app is not on screen; every push must show something)
  e.waitUntil(Promise.all([
    self.registration.showNotification(m.title, notificationFor(m)),
    research('push.arrive', { kind: m.kind || null, tag: m.tag || null, url: m.url || null, title: String(m.title).slice(0, 60) }).catch(() => null),
  ]));
});
/**
 * Tapping a notification (its body, or Join now): the app opens at the notification's page, the table for a
 * crew table or a turn. An app window already open is brought forward and taken there; otherwise a new one opens.
 */
async function openAt(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = list.find((c) => c.url.startsWith(self.registration.scope));
  if (!open) return self.clients.openWindow(url);
  let c = open;
  try { c = (await open.focus()) || open; } catch { /* focus not allowed: still take it there */ }
  if (c.url === url) return c;
  try { if ('navigate' in c) { const n = await c.navigate(url); if (n) return n; } } catch { /* not ours to navigate (not controlled yet) */ }
  // the page moves itself (main.ts listens): the same page, a new route
  c.postMessage({ t: 'open', url });
  return c;
}
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(String((e.notification.data && e.notification.data.url) || './').replace(/^\//, './'), self.registration.scope).href;
  // research: the tap (Join now or the notification), and a note the app reads when it opens (time to open)
  const d = e.notification.data || {};
  const click = { at: Date.now(), action: e.action || '', kind: d.kind || null, tag: e.notification.tag || null, url };
  const note = (async () => {
    try {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const ev = await research('push.click', { ...click, appOpen: list.length > 0 });
      await idbPut('click', { ...click, id: ev ? ev.id : null });
    } catch (err) { /* ignore */ }
  })();
  e.waitUntil(Promise.all([openAt(url), note.catch(() => null)]));
});
