// ══ ZAMA Service Worker v1.0 ══
const CACHE = 'zama-v1';
const OFFLINE_URL = '/zama';

const PRECACHE = [
  '/zama',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Installation — mise en cache initiale
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE).catch(function(){});
    })
  );
  self.skipWaiting();
});

// Activation — nettoyage anciens caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — stratégie Network First, fallback cache
self.addEventListener('fetch', function(e) {
  // Ignorer les requêtes non GET et les APIs
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('/api/')) return;
  if(e.request.url.includes('exchangerate-api')) return;

  e.respondWith(
    fetch(e.request)
      .then(function(response) {
        // Mettre en cache la réponse fraîche
        if(response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // Fallback: servir depuis le cache
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match(OFFLINE_URL);
        });
      })
  );
});

// Notification push (préparé pour plus tard)
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'ZAMA', {
      body: data.body || 'Vous avez une notification ZAMA',
      icon: '/icons/zama-192.png',
      badge: '/icons/zama-96.png',
      vibrate: [200, 100, 200],
      data: data
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('/zama'));
});
