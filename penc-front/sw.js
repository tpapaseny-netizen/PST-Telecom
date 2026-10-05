/* Penc Service Worker — notifications push + mise à jour automatique de l'app.
   v367 : RÉSEAU D'ABORD pour le document HTML — chaque ouverture de l'app récupère la
   dernière version en ligne ; le cache ne sert qu'en mode hors-ligne. Les autres ressources
   de la coquille (icônes, etc.) restent en cache-first avec revalidation (ouverture instantanée).
   Jamais de cache pour les appels /api/ (toujours frais) ni le contenu externe (Cloudinary, polices...).
   À l'activation, purge tous les caches d'anciennes versions.
   NOTE : grâce au réseau-d'abord, les mises à jour de messager.html arrivent SEULES, sans toucher
   à ce fichier. Incrémenter SW_VERSION reste une bonne hygiène à chaque release (purge du cache). */

var SW_VERSION = 'v706';
var SHELL_CACHE = 'penc-shell-' + SW_VERSION;

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return (k===SHELL_CACHE || k==='penc-share') ? null : caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
  console.log('[SW] Penc', SW_VERSION, 'actif');
});

// ── Partager vers Penc : Android envoie ici ce que l'utilisateur partage depuis une autre app ──
// (texte, lien, photos, vidéos, documents). On le met de côté puis on ouvre Penc sur « Envoyer à… ».
function _pencReceiveShare(req) {
  return req.formData().then(function (fd) {
    return caches.delete('penc-share').then(function () { return caches.open('penc-share'); }).then(function (c) {
      var files = fd.getAll('media').filter(function (f) { return f && typeof f !== 'string' && f.size > 0; }).slice(0, 10);
      var meta = { title: String(fd.get('title') || ''), text: String(fd.get('text') || ''), url: String(fd.get('url') || ''), files: [], at: Date.now() };
      var jobs = files.map(function (f, i) {
        meta.files.push({ name: f.name || ('fichier' + i), type: f.type || '', size: f.size, key: '/__share/f' + i });
        return c.put('/__share/f' + i, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
      });
      return Promise.all(jobs).then(function () { return c.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })); });
    });
  }).catch(function (err) {
    return caches.open('penc-share').then(function (c) { return c.put('/__share/meta', new Response(JSON.stringify({ title: '', text: '', url: '', files: [], at: Date.now(), error: String((err && err.message) || err) }), { headers: { 'Content-Type': 'application/json' } })); }).catch(function () {});
  }).then(function () { return Response.redirect('/messager?shared=1', 303); });
}
// Partage reçu en GET (certains téléphones) : titre / texte / lien dans l'adresse
function _pencReceiveShareGet(u) {
  var meta = { title: u.searchParams.get('title') || '', text: u.searchParams.get('text') || '', url: u.searchParams.get('url') || '', files: [], at: Date.now() };
  return caches.delete('penc-share').then(function () { return caches.open('penc-share'); })
    .then(function (c) { return c.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } })); })
    .catch(function () {}).then(function () { return Response.redirect('/messager?shared=1', 303); });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method === 'POST') {
    try { var pu = new URL(req.url); if (pu.origin === self.location.origin && pu.searchParams.has('share-target')) { e.respondWith(_pencReceiveShare(req)); return; } } catch (_) {}
    return;
  }
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return; // laisse le navigateur gerer Cloudinary, polices, etc.
  if (url.pathname.indexOf('/api/') === 0) return; // jamais en cache : toujours frais
  if (url.searchParams.has('share-target') && (url.searchParams.has('text') || url.searchParams.has('url') || url.searchParams.has('title'))) { e.respondWith(_pencReceiveShareGet(url)); return; }

  // ── v367 : RESEAU D'ABORD pour le document HTML ──
  // Chaque ouverture recupere la derniere version publiee sur Cloudflare.
  // Hors-ligne : on retombe sur la derniere version en cache.
  var isHTML = (req.mode === 'navigate') || ((req.headers.get('accept') || '').indexOf('text/html') > -1);
  if (isHTML) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function (c) { try { c.put(req, copy); } catch (_) {} });
        }
        return res;
      }).catch(function () {
        return caches.open(SHELL_CACHE).then(function (c) {
          return c.match(req).then(function (m) {
            if (m) return m;
            return c.match('/messager').then(function (m2) {
              if (m2) return m2;
              return c.match('/').then(function (m3) { return m3 || Response.error(); });
            });
          });
        });
      })
    );
    return;
  }

  // ── Autres ressources de la coquille : cache-first avec revalidation ──
  e.respondWith(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) { try { cache.put(req, res.clone()); } catch (_) {} }
          return res;
        }).catch(function () { return cached || Response.error(); });
        return cached || network;
      });
    })
  );
});

// ── Badge compteur (Badging API) ──
function _bdgDB(){ return new Promise(function(res,rej){ try{ var r=indexedDB.open('penc-badge',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('b'); }catch(_){} }; r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }catch(e){ rej(e); } }); }
function _bdgGet(){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var rq=db.transaction('b','readonly').objectStore('b').get('count'); rq.onsuccess=function(){ res(rq.result||0); }; rq.onerror=function(){ res(0); }; }catch(_){ res(0); } }); }).catch(function(){ return 0; }); }
function _bdgSet(n){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var tx=db.transaction('b','readwrite'); tx.objectStore('b').put(n,'count'); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }catch(_){ res(); } }); }).catch(function(){}); }
function _bdgInc(){ if(!self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve(); return _bdgGet().then(function(n){ n=(n||0)+1; return _bdgSet(n).then(function(){ try{ self.navigator.setAppBadge(n); }catch(_){} }); }); }
function _grpGet(){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var rq=db.transaction('b','readonly').objectStore('b').get('groups'); rq.onsuccess=function(){ res(rq.result||{}); }; rq.onerror=function(){ res({}); }; }catch(_){ res({}); } }); }).catch(function(){ return {}; }); }
function _grpSet(o){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var tx=db.transaction('b','readwrite'); tx.objectStore('b').put(o,'groups'); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }catch(_){ res(); } }); }).catch(function(){}); }

// Réception d'un push (app ouverte OU fermée)
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { title: 'Penc', body: (e.data && e.data.text()) || '' }; }
  var data = Object.assign({}, d.data || {});
  if (d.conv_id && !data.conv_id) data.conv_id = d.conv_id;
  if (d.url && !data.url) data.url = d.url;
  if (d.type && !data.type) data.type = d.type;
  if (d.post_id && !data.post_id) data.post_id = d.post_id;
  if (d.call_data && !data.call) data.call = d.call_data;
  var ICON = d.icon || '/penc-icon-192.png';
  var BADGE = d.badge || '/penc-icon-192.png';
  // Appel entrant : notification qui reste affichée, vibre comme un appel, et ramène à l'écran d'appel
  if (d.tag === 'penc-call' || data.call) {
    data.type = 'call'; data.url = '/messager?call=1';
    e.waitUntil(self.registration.showNotification(d.title || 'Appel Penc', {
      body: d.body || 'Appel entrant — touche pour répondre', icon: ICON, badge: BADGE, tag: 'penc-call',
      renotify: true, requireInteraction: true, vibrate: [500, 250, 500, 250, 500, 250, 500, 250, 500], data: data
    }));
    return;
  }
  // App ouverte et visible à l'écran : la bannière interne suffit, pas de doublon dans la barre du téléphone
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
    var visible = cl.some(function (c) { return c.visibilityState === 'visible' && c.focused; });
    if (visible && data.conv_id) return;
    return _bdgInc().then(function () {
    var reg = self.registration;
    if (data.conv_id) {
      return _grpGet().then(function (g) {
        g = g || {};
        g[data.conv_id] = (g[data.conv_id] || 0) + 1;
        return _grpSet(g).then(function () {
          var convs = Object.keys(g);
          // Seuil relevé de 2 à 6 discussions distinctes avant de tout regrouper en un message
          // générique — avant, dès la 2e discussion avec un message en attente, tout disparaissait
          // dans un vague "X nouvelles conversations" au lieu de garder chaque expéditeur visible
          // séparément, contrairement à WhatsApp qui préserve des notifications distinctes bien
          // plus longtemps avant de résumer.
          if (convs.length >= 6) {
            return reg.getNotifications().then(function (list) {
              list.forEach(function (n) { if (n.data && n.data.conv_id) { try { n.close(); } catch (_) {} } });
              return reg.showNotification('Penc', {
                body: convs.length + ' nouvelles conversations sur Penc',
                icon: ICON, badge: BADGE, tag: 'penc-summary', renotify: true,
                vibrate: [80, 40, 80], data: { type: 'summary', url: '/messager' }
              });
            });
          }
          var cnt = g[data.conv_id];
          var body = cnt > 1 ? (cnt + ' nouveaux messages') : (d.body || '');
          data.count = cnt;
          return reg.showNotification(d.title || 'Penc', {
            body: body, icon: ICON, badge: BADGE, tag: d.tag || ('penc-' + data.conv_id),
            renotify: true, vibrate: [80, 40, 80], data: data
          });
        });
      });
    }
    return reg.showNotification(d.title || 'Penc', {
      body: d.body || '', icon: ICON, badge: BADGE, tag: d.tag || 'penc',
      renotify: true, vibrate: [80, 40, 80], data: data
    });
  });
  }));
});

// Clic sur la notification : ramène l'utilisateur DANS l'app
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var target = data.url || '/messager';
  if (data.type === 'call') target = '/messager?call=1';
  else if (data.post_id) target = '/messager?post=' + encodeURIComponent(data.post_id);
  else if (data.status_id) target = '/messager?statut=' + encodeURIComponent(data.status_id);
  else if (data.conv_id) target = '/messager?conv=' + encodeURIComponent(data.conv_id);
  else if (data.type === 'friend_request' || data.type === 'friend_accepted') target = '/messager?req=1';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) {
          c.focus();
          try { c.postMessage({ type: 'PENC_NAV', nav: data }); } catch (_) {}
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ══════════════ Envoi en arrière-plan (Background Sync) ══════════════
var PENC_SEND_URL = 'https://api.penc-messagerie.com/api/penc/send';
function _swDB(){ return new Promise(function(res,rej){ try{ var r=indexedDB.open('penc-outbox',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('q',{keyPath:'id'}); }catch(_){} }; r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);}; }catch(e){ rej(e); } }); }
function _swAll(db){ return new Promise(function(res){ try{ var rq=db.transaction('q','readonly').objectStore('q').getAll(); rq.onsuccess=function(){res(rq.result||[]);}; rq.onerror=function(){res([]);}; }catch(_){ res([]); } }); }
function _swDel(db,id){ try{ db.transaction('q','readwrite').objectStore('q').delete(id); }catch(_){} }
function _swFlush(){
  return _swDB().then(function(db){
    return _swAll(db).then(function(items){
      if(!items||!items.length) return;
      return Promise.all(items.map(function(it){
        return fetch(PENC_SEND_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+(it.token||'')},body:JSON.stringify(it.payload)})
          .then(function(r){return r.json();})
          .then(function(d){ if(d&&d.success){ _swDel(db,it.id); if(!d.duplicate){ return self.registration.showNotification('Penc',{body:'Message envoyé \u2705',icon:'/penc-icon-192.png',badge:'/penc-icon-192.png',tag:'penc-sent'}); } } })
          .catch(function(){});
      }));
    });
  }).catch(function(){});
}
self.addEventListener('sync', function(e){ if(e.tag==='penc-outbox'){ e.waitUntil(_swFlush()); } });

// ══ Abonnement aux notifications renouvelé par le navigateur : on se réabonne tout seul avec la même clé ══
self.addEventListener('pushsubscriptionchange', function (e) {
  var opts = (e.oldSubscription && e.oldSubscription.options) || null;
  if (!opts || !opts.applicationServerKey) return;
  e.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: opts.applicationServerKey })
      .then(function () { return self.clients.matchAll({ type: 'window', includeUncontrolled: true }); })
      .then(function (list) { list.forEach(function (c) { try { c.postMessage({ type: 'PENC_RESUB' }); } catch (_) {} }); })
      .catch(function () {})
  );
});
