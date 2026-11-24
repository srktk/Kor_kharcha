// House Expenses service worker: offline copy of the page + web push notifications.
// Bump CACHE_NAME together with APP_VERSION in index.html.
const CACHE_NAME = 'house-expenses-v7.19.0';
const APP_SHELL = ['./', 'index.html', 'manifest.json', 'icon-512.png', 'fonts/inter.woff2'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// Only this site's own files are handled. The data API, images and CDNs always go straight to the network.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so updates show up straight away; cached page when offline
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put('index.html', copy)); }
      return res;
    }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('index.html')));
    return;
  }
  // Static files only (the update checker fetches index.html?t=… and must always reach the network)
  if (/\/(manifest\.json|icon-512\.png|fonts\/inter\.woff2)$/.test(url.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
});

// Notification sent by the Cloudflare Worker when someone else changes something
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'House Expenses';
  const body = d.body || 'Something changed';
  e.waitUntil((async () => {
    // Open pages refresh their data straight away
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'push', title, body }));
    await self.registration.showNotification(title, {
      body,
      icon: 'icon-512.png',
      badge: 'icon-512.png',
      data: { url: self.registration.scope },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus(); }
    return self.clients.openWindow(target);
  })());
});
