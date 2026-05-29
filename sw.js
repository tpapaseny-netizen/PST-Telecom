// Penc — Service Worker (PWA + push)
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){ /* pass-through (réseau) */ });

self.addEventListener('push', function(e){
  var data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch(err){ data = { title: 'Penc', body: (e.data ? e.data.text() : '') }; }
  var title = data.title || 'Penc';
  var options = {
    body: data.body || '',
    icon: '/penc-icon-192.png',
    badge: '/penc-icon-192.png',
    tag: data.tag || 'penc-msg',
    renotify: true,
    data: { url: data.url || '/messager' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/messager';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/messager') > -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
