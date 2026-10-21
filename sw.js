// The old site's service worker served index.html / script.js cache-first, which would keep returning
// visitors on the old page. This version replaces it: it drops every cache, takes over open tabs, reloads
// them once onto the new site, and from then on never answers requests itself (everything goes to the network).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadOld = keys.length > 0;
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
    if (!hadOld) return;
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach(t => t.navigate(t.url).catch(() => {}));
  })());
});
