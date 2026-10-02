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
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/share') {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const audio = form.get('audio');
        let text = [form.get('title'), form.get('text'), form.get('url')].filter(value => typeof value === 'string' && value.trim()).join('\n');
        // Long shares are kept (trimmed, flagged) instead of being lost; never cut a surrogate pair in half.
        const truncated = text.length > 12000;
        if (truncated) text = text.slice(0, /[\uD800-\uDBFF]/.test(text[11999]) ? 11999 : 12000);
        if (!text && !(audio instanceof File)) return Response.redirect(new URL('/app?shareError=1', self.location.origin), 303);
        if (audio instanceof File && (audio.size > 8 * 1024 * 1024 || !audio.size || !(audio.type.startsWith('audio/') || /\.(ogg|opus|mp3|m4a|webm|wav)$/i.test(audio.name)))) return Response.redirect(new URL('/app?shareError=1', self.location.origin), 303);
        const db = await new Promise((resolve, reject) => {
          const open = indexedDB.open('boardcue-share', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('inbox');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('inbox', 'readwrite');
          // audioName survives even if a browser drops File.name on clone; the server infers format from it when type is empty.
          const file = audio instanceof File ? audio : null;
          tx.objectStore('inbox').put({ text, audio: file, audioName: file?.name || null, truncated, createdAt: Date.now() }, 'latest');
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return Response.redirect(new URL('/app?shared=1', self.location.origin), 303);
      } catch {
        return Response.redirect(new URL('/app?shareError=1', self.location.origin), 303);
      }
    })());
    return;
  }
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
