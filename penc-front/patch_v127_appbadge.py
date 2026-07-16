# -*- coding: utf-8 -*-
"""PENC — Patch v127 (badge compteur sur l'icone de l'app: Badging API)"""
import io, sys
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)

# ===== 1) SW =====
SW="sw.js"
sw=io.open(SW,"r",encoding="utf-8",newline="").read()
print("== sw.js ==")
BDG=("// ── Badge compteur (Badging API) ──\n"
"function _bdgDB(){ return new Promise(function(res,rej){ try{ var r=indexedDB.open('penc-badge',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('b'); }catch(_){} }; r.onsuccess=function(){ res(r.result); }; r.onerror=function(){ rej(r.error); }; }catch(e){ rej(e); } }); }\n"
"function _bdgGet(){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var rq=db.transaction('b','readonly').objectStore('b').get('count'); rq.onsuccess=function(){ res(rq.result||0); }; rq.onerror=function(){ res(0); }; }catch(_){ res(0); } }); }).catch(function(){ return 0; }); }\n"
"function _bdgSet(n){ return _bdgDB().then(function(db){ return new Promise(function(res){ try{ var tx=db.transaction('b','readwrite'); tx.objectStore('b').put(n,'count'); tx.oncomplete=function(){ res(); }; tx.onerror=function(){ res(); }; }catch(_){ res(); } }); }).catch(function(){}); }\n"
"function _bdgInc(){ if(!self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve(); return _bdgGet().then(function(n){ n=(n||0)+1; return _bdgSet(n).then(function(){ try{ self.navigator.setAppBadge(n); }catch(_){} }); }); }\n"
"\n"
"// Réception d'un push (app ouverte OU fermée)\n")
sw=R(sw,"// Réception d'un push (app ouverte OU fermée)\n",BDG,"Helpers badge SW")
sw=R(sw,"  e.waitUntil(self.registration.showNotification(d.title || 'Penc', opts));",
        "  e.waitUntil(Promise.all([ self.registration.showNotification(d.title || 'Penc', opts), _bdgInc() ]));",
        "Push -> increment badge")
sw=R(sw,"var SW_VERSION = 'v126';","var SW_VERSION = 'v127';","SW_VERSION v127")
io.open(SW,"wb").write(sw.encode("utf-8"))
print("sw.js OK")

# ===== 2) App =====
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("== messager.html ==")
BADGE_JS=("// ── Badge app : remise a zero a l'ouverture ──\n"
"(function(){\n"
"  function _pencClearBadge(){\n"
"    try{ if('clearAppBadge' in navigator) navigator.clearAppBadge(); }catch(_){}\n"
"    try{ var r=indexedDB.open('penc-badge',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('b'); }catch(_){} }; r.onsuccess=function(){ try{ var tx=r.result.transaction('b','readwrite'); tx.objectStore('b').put(0,'count'); }catch(_){} }; }catch(_){}\n"
"  }\n"
"  window._pencClearBadge=_pencClearBadge;\n"
"  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') _pencClearBadge(); });\n"
"  window.addEventListener('focus', _pencClearBadge);\n"
"  if(document.visibilityState==='visible') _pencClearBadge();\n"
"})();\n"
"// URL param ?conv=ID (depuis notif quand app fermée)\n")
s=R(s,"// URL param ?conv=ID (depuis notif quand app fermée)\n",BADGE_JS,"Badge clear app")
s=R(s,"console.log('PENC build v126 (avatar P teal compte officiel + fallback)');",
      "console.log('PENC build v127 (badge compteur icone app: Badging API)');","Build -> v127")
io.open(FN,"wb").write(s.encode("utf-8"))
print("messager.html OK")
