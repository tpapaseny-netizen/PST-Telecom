# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v184 (appels en arriere-plan + reduire/pastille flottante)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v184 — appels arriere-plan + reduire")

# 1) Bouton reduire dans l'overlay
s=R(s,'<div id="callOverlay">\n  <video id="remoteVideo" autoplay playsinline></video>',
      '<div id="callOverlay">\n  <button class="call-min" onclick="minimizeCall()" aria-label="R\u00e9duire"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>\n  <video id="remoteVideo" autoplay playsinline></video>',
      "Bouton reduire")

# 2) Pastille flottante (avant deleteToast)
PILL=('<div id="callPill" onclick="expandCall()">\n'
'  <div class="cp-av" id="callPillAv"></div>\n'
'  <div class="cp-tx"><div class="cp-name" id="callPillName"></div><div class="cp-sub"><span class="cp-dot"></span><span id="callPillTimer">00:00</span></div></div>\n'
'  <button class="cp-end" onclick="event.stopPropagation();endCall()" aria-label="Raccrocher"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(135 12 12)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></g></svg></button>\n'
'</div>\n')
s=R(s,'</div>\n<div id="deleteToast">','</div>\n'+PILL+'<div id="deleteToast">',"Pastille flottante")

# 3) CSS
CSS=(".call-min{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:16px;z-index:12;width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,.12);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,transform .12s}\n"
".call-min:active{transform:scale(.9);background:rgba(255,255,255,.2)}\n"
"#callOverlay.minimized{display:none!important}\n"
"#callPill{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:10px;right:10px;z-index:99300;display:none;align-items:center;gap:11px;padding:9px 12px;background:rgba(20,28,38,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(0,200,150,.25);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.5);cursor:pointer;animation:cpIn .3s cubic-bezier(.2,.9,.3,1.2)}\n"
"#callPill.show{display:flex}\n"
"@keyframes cpIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}\n"
".cp-av{width:40px;height:40px;border-radius:50%;background:var(--card2);overflow:hidden;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;flex:0 0 auto;font-size:15px}\n"
".cp-av img{width:100%;height:100%;object-fit:cover}\n"
".cp-tx{flex:1;min-width:0}\n"
".cp-name{color:#fff;font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
".cp-sub{display:flex;align-items:center;gap:6px;color:#7fe9c4;font-size:12.5px;margin-top:1px}\n"
".cp-dot{width:7px;height:7px;border-radius:50%;background:#00E0A6;box-shadow:0 0 8px #00E0A6;animation:cpDot 1.4s ease-in-out infinite}\n"
"@keyframes cpDot{0%,100%{opacity:1}50%{opacity:.4}}\n"
".cp-end{flex:0 0 auto;width:40px;height:40px;border-radius:50%;border:none;background:#e02424;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s}\n"
".cp-end:active{transform:scale(.9)}")
s=R(s,"#callOverlay.minimized{display:none!important}\n","",  # garde-fou si deja present (ne devrait pas)
      "noop") if False else s
s=R(s,".call-end-toast{position:fixed;",CSS+"\n.call-end-toast{position:fixed;","CSS pastille+reduire")

# 4) Fonctions (avant cleanupCall)
FNS=("function minimizeCall(){\n"
"  try{ var o=document.getElementById('callOverlay'); if(o) o.classList.add('minimized');\n"
"  var p=document.getElementById('callPill'); if(p){ var nm=document.getElementById('callName'); var pn=document.getElementById('callPillName'); if(pn&&nm) pn.textContent=nm.textContent||''; var av0=document.getElementById('callAv'), av=document.getElementById('callPillAv'); if(av&&av0) av.innerHTML=av0.innerHTML; var ct=document.getElementById('callTimer'), pt=document.getElementById('callPillTimer'); if(pt&&ct) pt.textContent=ct.textContent||'00:00'; p.classList.add('show'); } }catch(e){}\n"
"}\n"
"function expandCall(){\n"
"  try{ var o=document.getElementById('callOverlay'); if(o) o.classList.remove('minimized'); var p=document.getElementById('callPill'); if(p) p.classList.remove('show'); var rv=document.getElementById('remoteVideo'); if(rv&&rv.play) rv.play().catch(function(){}); }catch(e){}\n"
"}\n"
"function _setupCallMediaSession(name){\n"
"  try{ if('mediaSession' in navigator){ if(window.MediaMetadata) navigator.mediaSession.metadata=new MediaMetadata({title:'Appel Penc',artist:name||'Penc',album:'Penc'}); navigator.mediaSession.playbackState='playing'; try{ navigator.mediaSession.setActionHandler('hangup',function(){ endCall(); }); }catch(_h){} } }catch(e){}\n"
"}\n"
"function _clearCallMediaSession(){ try{ if('mediaSession' in navigator){ navigator.mediaSession.playbackState='none'; navigator.mediaSession.metadata=null; } }catch(e){} }\n"
"function cleanupCall(){")
s=R(s,"function cleanupCall(){",FNS,"Fonctions minimize/mediasession")

# 5) cleanupCall : cacher pastille + clear mediasession
s=R(s,"function cleanupCall(){\n  try{_releaseWakeLock();}catch(_w){}\n",
      "function cleanupCall(){\n  try{_releaseWakeLock();}catch(_w){}\n  try{ var _p=document.getElementById('callPill'); if(_p) _p.classList.remove('show'); var _o=document.getElementById('callOverlay'); if(_o) _o.classList.remove('minimized'); }catch(_pe){}\n  try{ _clearCallMediaSession(); }catch(_ms){}\n",
      "cleanupCall hide pill + clear mediasession")

# 6) joinLKRoom : mediasession apres connect
s=R(s,"await _lk.room.connect(r.url, r.token);\n    try{ _acquireWakeLock(); }catch(_w){}",
      "await _lk.room.connect(r.url, r.token);\n    try{ _acquireWakeLock(); }catch(_w){}\n    try{ _setupCallMediaSession(isRecipient?_lk.callerName:(CUR_CONV_DATA&&CUR_CONV_DATA.name)); }catch(_m){}",
      "mediasession apres connect")

# 7) startCallTimer : maj pastille
s=R(s,"    if(el) el.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;\n  },1000);",
      "    if(el) el.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;\n    var pe=document.getElementById('callPillTimer'); if(pe) pe.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;\n  },1000);",
      "pastille timer")

# 8) _reWake : reprise audio
s=R(s,"function _reWake(){ try{ if(document.visibilityState==='visible' && _lk && _lk.room && !_wakeLock){ _acquireWakeLock(); } }catch(e){} }",
      "function _reWake(){ try{ if(document.visibilityState==='visible' && _lk && _lk.room){ if(!_wakeLock) _acquireWakeLock(); var _a=document.getElementById('penc-remote-audio'); if(_a&&_a.play) _a.play().catch(function(){}); } }catch(e){} }",
      "_reWake reprise audio")

# 9) Build
s=R(s,"console.log('PENC build v183 (ecran appel actif premium)');",
      "console.log('PENC build v184 (appels arriere-plan + reduire)');","Build -> v184")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v184")
