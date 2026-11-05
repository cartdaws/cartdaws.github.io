// INTRUDER service worker. Network first: online you always get the newest build; offline you get the last one that loaded.
const CACHE = 'intruder-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(async (c) => {
        // hashed bundles from older builds are dead weight: drop them when their replacement arrives
        const m = new URL(r.url).pathname.match(/assets\/(index)-[^/]+\.(js|css)$/);
        if (m) for (const k of await c.keys()) { const p = new URL(k.url).pathname; if (p !== new URL(r.url).pathname && p.includes('assets/' + m[1] + '-') && p.endsWith('.' + m[2])) c.delete(k); }
        c.put(r, copy);
      });
    }
    return res;
  }).catch(() => caches.match(r).then((hit) => hit || Response.error())));
});
