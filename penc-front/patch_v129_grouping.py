# -*- coding: utf-8 -*-
"""PENC — Patch v129 (groupement des notifications)"""
import io, sys
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)

# ===== 1) SW =====
SW="sw.js"
sw=io.open(SW,"r",encoding="utf-8",newline="").read()
print("== sw.js ==")

# 1a) Helpers groupes (apres _bdgInc)
GRP=("function _bdgInc(){ if(!self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve(); return _bdgGet().then(function(n){ n=(n||0)+1; return _bdgSet(n).then(function(){ try{ self.navigator.setAppBadge(n); }catch(_){} }); }); }\n"
"function _grpGet(){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var rq=db.transaction('b','readonly').objectStore('b').get('groups'); rq.onsuccess=function(){ res(rq.result||{}); }; rq.onerror=function(){ res({}); }; }catch(_){ res({}); } }); }).catch(function(){ return {}; }); }\n"
"function _grpSet(o){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var tx=db.transaction('b','readwrite'); tx.objectStore('b').put(o,'groups'); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }catch(_){ res(); } }); }).catch(function(){}); }\n")
sw=R(sw,"function _bdgInc(){ if(!self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve(); return _bdgGet().then(function(n){ n=(n||0)+1; return _bdgSet(n).then(function(){ try{ self.navigator.setAppBadge(n); }catch(_){} }); }); }\n",
      GRP,"Helpers groupes SW")

# 1b) Remplacer le handler push par la version groupée
OLD_PUSH="""self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (_) { d = { title: 'Penc', body: (e.data && e.data.text()) || '' }; }
  var data = Object.assign({}, d.data || {});
  if (d.conv_id && !data.conv_id) data.conv_id = d.conv_id;
  if (d.url && !data.url) data.url = d.url;
  if (d.type && !data.type) data.type = d.type;
  var opts = {
    body: d.body || '',
    icon: d.icon || '/penc-icon-192.png',
    badge: d.badge || '/penc-icon-192.png',
    tag: d.tag || 'penc',
    data: data,
    vibrate: [80, 40, 80],
    renotify: true
  };
  e.waitUntil(Promise.all([ self.registration.showNotification(d.title || 'Penc', opts), _bdgInc() ]));
});"""
NEW_PUSH="""self.addEventListener('push', function (e) {
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
});"""
sw=R(sw,OLD_PUSH,NEW_PUSH,"Handler push groupé")
sw=R(sw,"var SW_VERSION = 'v128';","var SW_VERSION = 'v129';","SW_VERSION v129")
io.open(SW,"wb").write(sw.encode("utf-8"))
print("sw.js OK")

# ===== 2) App : nettoyer groupes + fermer notifs a l'ouverture =====
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("== messager.html ==")
OLD_CLR="""  function _pencClearBadge(){
    try{ if('clearAppBadge' in navigator) navigator.clearAppBadge(); }catch(_){}
    try{ var r=indexedDB.open('penc-badge',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('b'); }catch(_){} }; r.onsuccess=function(){ try{ var tx=r.result.transaction('b','readwrite'); tx.objectStore('b').put(0,'count'); }catch(_){} }; }catch(_){}
  }"""
NEW_CLR="""  function _pencClearBadge(){
    try{ if('clearAppBadge' in navigator) navigator.clearAppBadge(); }catch(_){}
    try{ var r=indexedDB.open('penc-badge',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('b'); }catch(_){} }; r.onsuccess=function(){ try{ var tx=r.result.transaction('b','readwrite'); tx.objectStore('b').put(0,'count'); tx.objectStore('b').put({},'groups'); }catch(_){} }; }catch(_){}
    try{ if(navigator.serviceWorker && navigator.serviceWorker.ready){ navigator.serviceWorker.ready.then(function(reg){ try{ reg.getNotifications().then(function(ns){ ns.forEach(function(n){ try{ n.close(); }catch(_){} }); }); }catch(_){} }); } }catch(_){}
  }"""
s=R(s,OLD_CLR,NEW_CLR,"Clear groupes + notifs")
s=R(s,"console.log('PENC build v128 (couleurs du Senegal: bandeau tricolore)');",
      "console.log('PENC build v129 (groupement des notifications)');","Build -> v129")
io.open(FN,"wb").write(s.encode("utf-8"))
print("messager.html OK")
