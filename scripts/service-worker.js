/* Replaced at build time. Cache only a public offline page and immutable assets. */
const VERSION = __VERSION__;
const ASSETS = __ASSETS__;
const CACHE = 'boardcue-static-' + VERSION;
const assetPaths = new Set(ASSETS);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/offline.html', '/icons/icon-192.png'])).catch(async error => {
    await caches.delete(CACHE); throw error;
  }));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('boardcue-static-'));
    const previous = names.filter(name => name !== CACHE).at(-1);
    await Promise.all(names.filter(name => name !== CACHE && name !== previous).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    // Never persist server-rendered pages, credentials, board data or RSC responses.
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/offline.html')));
  } else if ((assetPaths.has(url.pathname) || url.pathname.startsWith('/_next/static/')) && !url.search) {
    event.respondWith((async () => {
      const cached = await caches.match(request); if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
  }
});
self.addEventListener('push', event => {
  let tag = 'boardcue-project';
  try { const value = event.data?.json()?.tag; if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value)) tag = value; } catch { /* generic notification */ }
  // Fixed copy and destination, even if an incoming payload contains hostile text/URLs.
  event.waitUntil(self.registration.showNotification('BoardCue', {
    body: 'Ci sono aggiornamenti nei tuoi progetti. Apri BoardCue per consultarli.',
    icon: '/icons/icon-192.png', badge: '/icons/badge.png', tag,
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    // Focus an existing board without navigating away from an unsaved draft.
    if (existing) return existing.focus();
    return self.clients.openWindow('/app');
  })());
});
