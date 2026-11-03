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
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { /* not ours */ }
  if (!m.title) return;
  // (the table server pushes a turn only while the app is not on screen; every push must show something)
  e.waitUntil(self.registration.showNotification(m.title, notificationFor(m)));
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
  e.waitUntil(openAt(url));
});
