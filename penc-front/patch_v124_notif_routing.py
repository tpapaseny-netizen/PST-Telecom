# -*- coding: utf-8 -*-
"""PENC — Patch v124 (redirection instantanee au clic des notifications)"""
import io, sys
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)

# ============ 1) SW (sw.js, LF) ============
SW="sw.js"
sw=io.open(SW,"r",encoding="utf-8",newline="").read()
print("== sw.js ==")
OLD_NC="""self.addEventListener('notificationclick', function (e) {
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
});"""
NEW_NC="""self.addEventListener('notificationclick', function (e) {
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
});"""
sw=R(sw,OLD_NC,NEW_NC,"notificationclick routage complet")
sw=R(sw,"var SW_VERSION = 'v123';","var SW_VERSION = 'v124';","SW_VERSION v124")
io.open(SW,"wb").write(sw.encode("utf-8"))
print("sw.js OK")

# ============ 2) App (messager.html, LF no BOM) ============
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("== messager.html ==")

# 2a) Listener SW -> PENC_NAV + helper _pencNav
OLD_LIS="""  navigator.serviceWorker.addEventListener('message',function(e){
    if(e.data&&e.data.type==='OPEN_CONV'){
      var conv=(CONVS||[]).find(function(c){return c.id===e.data.conv_id;});
      if(conv){ showTab('chats'); openConv(conv); }
      else { loadConvs().then(function(){ var cv=(CONVS||[]).find(function(c){return c.id===e.data.conv_id;}); if(cv){showTab('chats');openConv(cv);} }); }
    }
  });"""
NEW_LIS="""  function _pencNav(nav){
    try{
      if(!nav) return;
      if(nav.conv_id){ var conv=(CONVS||[]).find(function(c){return c.id===nav.conv_id;}); if(conv){ showTab('chats'); openConv(conv); } else { loadConvs().then(function(){ var cv=(CONVS||[]).find(function(c){return c.id===nav.conv_id;}); if(cv){ showTab('chats'); openConv(cv);} }); } return; }
      if(nav.status_id){ if(typeof openStatusById==='function') openStatusById(nav.status_id); return; }
      if(nav.type==='friend_request'||nav.type==='friend_accepted'){ if(typeof openFriends==='function'){ openFriends(); if(typeof switchFriendTab==='function') setTimeout(function(){ switchFriendTab('req'); },180); } return; }
    }catch(_){}
  }
  window._pencNav=_pencNav;
  navigator.serviceWorker.addEventListener('message',function(e){
    if(!e.data) return;
    if(e.data.type==='OPEN_CONV'){ _pencNav({conv_id:e.data.conv_id, type:'message'}); return; }
    if(e.data.type==='PENC_NAV'){ _pencNav(e.data.nav||{}); return; }
  });"""
s=R(s,OLD_LIS,NEW_LIS,"Listener PENC_NAV + _pencNav")

# 2b) URL parse : statut OU status + req
s=R(s,"(function(){ try{ var p=new URLSearchParams(location.search); var sid=p.get('statut'); if(sid) window._pendingStatut=sid; }catch(e){} })();",
      "(function(){ try{ var p=new URLSearchParams(location.search); var sid=p.get('statut')||p.get('status'); if(sid) window._pendingStatut=sid; if(p.get('req')) window._pendingReq=1; }catch(e){} })();",
      "URL parse statut/status/req")

# 2c) Interval : consommer _pendingReq aussi
s=R(s,"  var sid=window._pendingStatut;\n  if(sid && typeof TOKEN!=='undefined' && TOKEN){ window._pendingStatut=null; clearInterval(_statTimer); openStatusById(sid); }",
      "  if(typeof TOKEN!=='undefined' && TOKEN && window._pendingReq){ window._pendingReq=null; if(typeof openFriends==='function'){ openFriends(); if(typeof switchFriendTab==='function') setTimeout(function(){ switchFriendTab('req'); },220); } }\n  var sid=window._pendingStatut;\n  if(sid && typeof TOKEN!=='undefined' && TOKEN){ window._pendingStatut=null; clearInterval(_statTimer); openStatusById(sid); }",
      "Consommer _pendingReq")

# 2d) Build bump
s=R(s,"console.log('PENC build v123 (radio native dans Penc, fin iframe DeglouFM)');",
      "console.log('PENC build v124 (redirection instantanee au clic des notifications)');","Build -> v124")

io.open(FN,"wb").write(s.encode("utf-8"))
print("messager.html OK")
