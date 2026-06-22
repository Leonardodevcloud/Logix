// Service worker mínimo: cacheia o shell estático. Versione CACHE ao mudar assets.
const CACHE = 'logix-v1';
const SHELL = ['/', '/index.html', '/assets/tokens.css', '/src/main.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/')) return; // nunca cacheia API
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
