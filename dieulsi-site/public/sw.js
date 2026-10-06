/* Dieulsi — service worker (ybq4, ybq5)
   Pages : réseau d'abord (toujours la dernière version), copie de secours hors connexion.
   Images et icônes : cache d'abord. L'API (api.penc-messagerie.com) n'est jamais mise en cache.
   Notifications : affichage + ouverture de l'appli au bon endroit. */
const CACHE = 'dieulsi-v5';   // ybq5

self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/.well-known/')) return;
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE); c.put('/', res.clone()).catch(function () {});
        return res;
      } catch (_) {
        return (await caches.match('/')) || new Response('<h1 style="font-family:sans-serif;color:#1877F2">Dieulsi</h1><p style="font-family:sans-serif">Pas de connexion internet. Réessaie dans un instant.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  if (/\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith((async function () {
      const hit = await caches.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()).catch(function () {}); }
      return res;
    })());
  }
});

self.addEventListener('push', function (e) {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'Dieulsi', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async function () {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = list.some(function (c) { return c.visibilityState === 'visible'; });
    // Appli ouverte à l'écran : on la met à jour ; les nouvelles courses sonnent quand même
    list.forEach(function (c) { c.postMessage({ type: 'yb-open', tag: d.tag || '' }); });
    if (visible && d.tag !== 'yb-offer') return;
    await self.registration.showNotification(d.title || 'Dieulsi', {
      body: d.body || '',
      icon: '/icon-192.png',
      tag: d.tag || 'dieulsi',
      renotify: true,
      requireInteraction: !!d.urgent,
      vibrate: d.urgent ? [400, 150, 400, 150, 400] : [200],
      data: { url: d.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async function () {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) { c.postMessage({ type: 'yb-open' }); return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
