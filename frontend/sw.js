// Service worker network-first: sempre busca a versão mais nova da rede e cai no
// cache apenas quando offline. Evita servir HTML/CSS/JS velhos após um deploy.
const CACHE = 'logix-v2';
const SHELL = ['/', '/index.html', '/assets/tokens.css', '/assets/componentes.css', '/src/main.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // assume já, sem esperar abas antigas fecharem
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/')) return; // nunca cacheia API

  // network-first: rede primeiro, atualiza o cache, e usa o cache só se a rede falhar.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
