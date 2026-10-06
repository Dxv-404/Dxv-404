// Offline cache: everything the game needs is stored on first visit.
const CACHE = 'train-poker-1c7b68112d';
const FILES = [
  './',
  "assets/dealer.webp",
  "assets/icon-180.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "css/app.css",
  "fonts/figtree-400.woff2",
  "fonts/figtree-500.woff2",
  "fonts/figtree-600.woff2",
  "fonts/figtree-700.woff2",
  "fonts/fraunces-italic.woff2",
  "fonts/fraunces.woff2",
  "index.html",
  "js/app.js",
  "js/cards.js",
  "js/engine.js",
  "js/fx.js",
  "js/guest.js",
  "js/host.js",
  "js/info.js",
  "js/net.js",
  "js/qr.js",
  "js/qrworker.js",
  "js/table.js",
  "js/ui.js",
  "manifest.webmanifest",
  "vendor/jsQR.js",
  "vendor/qrcode.mjs",
];
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
