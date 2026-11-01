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
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { /* not ours */ }
  if (!m.title) return;
  // (the table server pushes a turn only while the app is not on screen; every push must show something)
  e.waitUntil(self.registration.showNotification(m.title, {
    body: m.body || '', tag: m.tag || 'tp', renotify: true, data: { url: m.url || './' },
    icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', vibrate: [80, 60, 80],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(String((e.notification.data && e.notification.data.url) || './').replace(/^\//, './'), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : c));
    return self.clients.openWindow(url);
  }));
});
