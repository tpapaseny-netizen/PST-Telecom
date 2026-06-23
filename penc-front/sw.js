/* Penc Service Worker — notifications push + mise à jour automatique de l'app.
   Pas de cache de pages : ne sert jamais une version périmée.
   À l'activation, purge tous les anciens caches.
   SW_VERSION change à chaque release => le navigateur détecte la mise à jour,
   le SW s'active (skipWaiting+claim) et l'app ouverte se recharge (controllerchange). */

var SW_VERSION = 'v230';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
  console.log('[SW] Penc', SW_VERSION, 'actif');
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
  var ICON = d.icon || '/penc-icon-192.png';
  var BADGE = d.badge || '/penc-icon-192.png';
  e.waitUntil(_bdgInc().then(function () {
    var reg = self.registration;
    if (data.conv_id) {
      return _grpGet().then(function (g) {
        g = g || {};
        g[data.conv_id] = (g[data.conv_id] || 0) + 1;
        return _grpSet(g).then(function () {
          var convs = Object.keys(g);
          if (convs.length >= 2) {
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
  }));
});

// Clic sur la notification : ramène l'utilisateur DANS l'app
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var target = data.url || '/messager';
  if (data.status_id) target = '/messager?statut=' + encodeURIComponent(data.status_id);
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
