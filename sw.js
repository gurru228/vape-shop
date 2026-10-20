const CACHE_NAME = 'vapeshop-v16-site-review';
const LOCAL_PREVIEW = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/lib/contact.js',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  if (!LOCAL_PREVIEW) event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // 本地开发直接读取最新文件，避免预览仍显示旧布局。
  if (LOCAL_PREVIEW) return;
  // 只缓存 GET 请求，跳过 API 请求
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/.netlify/')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
