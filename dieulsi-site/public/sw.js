/* Dieulsi — service worker minimal : la page s'ouvre même avec un réseau faible.
   Réseau d'abord pour la page (toujours la dernière version), cache en secours. Jamais de cache pour l'API. */
var V = 'yb-v3-dieulsi';
self.addEventListener('install', function (e) { self.skipWaiting(); e.waitUntil(caches.open(V).then(function (c) { return c.addAll(['/', '/manifest.json', '/icon-192.png']).catch(function () {}); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return x === V ? null : caches.delete(x); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var u; try { u = new URL(req.url); } catch (_) { return; }
  if (u.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) { if (res && res.status === 200) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); } return res; })
    .catch(function () { return caches.match(req).then(function (m) { return m || caches.match('/'); }); }));
});
