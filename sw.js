/* Penc Service Worker — notifications push (messages + statuts)
   Volontairement SANS cache : il n'intercepte pas les requêtes réseau,
   donc il ne peut jamais servir une version périmée de l'app.
   Son seul rôle : recevoir les push et afficher les notifications,
   même quand l'application est fermée. */

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

// Réception d'un push (app ouverte OU fermée)
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { title: 'Penc', body: (e.data && e.data.text()) || '' }; }

  // On rassemble conv_id / url / type dans data (le serveur les envoie au 1er niveau)
  var data = Object.assign({}, d.data || {});
  if (d.conv_id && !data.conv_id) data.conv_id = d.conv_id;
  if (d.url && !data.url) data.url = d.url;
  if (d.type && !data.type) data.type = d.type;

  var opts = {
    body: d.body || '',
    icon: d.icon || '/icon-192.png',
    badge: d.badge || '/icon-192.png',
    tag: d.tag || 'penc',
    data: data,
    vibrate: [80, 40, 80],
    renotify: true
  };
  e.waitUntil(self.registration.showNotification(d.title || 'Penc', opts));
});

// Clic sur la notification : on ramène l'utilisateur DANS l'app
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var target = data.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          c.focus();
          // Si c'est un message, on demande au front d'ouvrir la conversation
          if (data.conv_id) { try { c.postMessage({ type: 'OPEN_CONV', conv_id: data.conv_id }); } catch (_) {} }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
