// Basic offline support: cache the app shell, always hit the network for API calls.
const CACHE = 'tracker-v2';
const SHELL = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/store.js',
  'js/targets.js',
  'js/food.js',
  'js/foods.js',
  'manifest.webmanifest',
  'icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache cross-origin requests (food API) — network only.
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate for the app shell.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
