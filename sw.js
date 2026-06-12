/* Penc Service Worker — notifications push + mise à jour automatique de l'app.
   Pas de cache de pages : ne sert jamais une version périmée.
   À l'activation, purge tous les anciens caches (au cas où un ancien SW en aurait laissé). */

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

// Réception d'un push (app ouverte OU fermée)
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { title: 'Penc', body: (e.data && e.data.text()) || '' }; }
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

// Clic sur la notification : ramène l'utilisateur DANS l'app
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
          if (data.conv_id) { try { c.postMessage({ type: 'OPEN_CONV', conv_id: data.conv_id }); } catch (_) {} }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ══════════════ Envoi en arrière-plan (Background Sync) ══════════════
var PENC_SEND_URL = 'https://pst-telecom.onrender.com/api/penc/send';
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
          .then(function(d){ if(d&&d.success){ _swDel(db,it.id); if(!d.duplicate){ return self.registration.showNotification('Penc',{body:'Message envoyé \u2705',icon:'/icon-192.png',badge:'/icon-192.png',tag:'penc-sent'}); } } })
          .catch(function(){});
      }));
    });
  }).catch(function(){});
}
self.addEventListener('sync', function(e){ if(e.tag==='penc-outbox'){ e.waitUntil(_swFlush()); } });
