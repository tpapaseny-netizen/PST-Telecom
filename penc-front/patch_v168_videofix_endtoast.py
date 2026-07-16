# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v168 (fix appel vidéo + message premium fin d'appel)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v168 — vidéo + fin d'appel premium")

# 1) FIX vidéo : setCameraEnabled renvoie la publication
OLD_V=("    if(type==='video'){\n"
"      await _lk.room.localParticipant.setCameraEnabled(true);\n"
"      var cam=_lk.room.localParticipant.getTrack(LK.Track.Source.Camera);\n"
"      if(cam&&cam.track){\n"
"        var lv=document.getElementById('localVideo');\n"
"        if(lv){cam.track.attach(lv);lv.style.display='block';}\n"
"      }\n"
"    }")
NEW_V=("    if(type==='video'){\n"
"      var _camPub=await _lk.room.localParticipant.setCameraEnabled(true);\n"
"      if(_camPub&&_camPub.track){\n"
"        var lv=document.getElementById('localVideo');\n"
"        if(lv){_camPub.track.attach(lv);lv.style.display='block';}\n"
"      }\n"
"    }")
s=R(s,OLD_V,NEW_V,"Fix vidéo (getTrack -> setCameraEnabled return)")

# 2) Fonctions + SVG fin d'appel (avant var _lk={)
FN_BLOCK=(
"var SVG_END_SM='<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g transform=\"rotate(135 12 12)\"><path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z\"/></g></svg>';\n"
"function _fmtDur(secs){ if(typeof secs!=='number'||secs<=0) return ''; var m=Math.floor(secs/60),s=secs%60; return (m<10?'0':'')+m+':'+(s<10?'0':'')+s; }\n"
"function _callEndToast(label,sub){\n"
"  try{\n"
"    var el=document.createElement('div'); el.className='call-end-toast';\n"
"    el.innerHTML='<div class=\"cet-ic\">'+SVG_END_SM+'</div><div class=\"cet-tx\"><div class=\"cet-t\">'+(label||'Appel terminé')+'</div>'+(sub?'<div class=\"cet-s\">'+sub+'</div>':'')+'</div>';\n"
"    document.body.appendChild(el);\n"
"    requestAnimationFrame(function(){ el.classList.add('show'); });\n"
"    setTimeout(function(){ el.classList.remove('show'); setTimeout(function(){ try{el.remove();}catch(e){} },360); }, 3000);\n"
"  }catch(e){}\n"
"}\n"
"var _lk={")
s=R(s,"var _lk={",FN_BLOCK,"Fonctions fin d'appel")

# 3) CSS premium
CSS=(".call-btn.red{background:#e53e3e;box-shadow:0 8px 24px rgba(229,62,62,.45);}\n"
".call-end-toast{position:fixed;top:calc(16px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%) translateY(-24px);z-index:99500;display:flex;align-items:center;gap:12px;min-width:240px;max-width:88vw;padding:14px 16px;background:rgba(26,26,26,.82);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.08);border-left:3px solid #e53e3e;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);opacity:0;transition:transform .38s cubic-bezier(.2,.9,.3,1.2),opacity .3s;pointer-events:none}\n"
".call-end-toast.show{transform:translateX(-50%) translateY(0);opacity:1}\n"
".call-end-toast .cet-ic{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(229,62,62,.16);color:#ff6b6b}\n"
".call-end-toast .cet-tx{display:flex;flex-direction:column;gap:2px;min-width:0}\n"
".call-end-toast .cet-t{color:#fff;font-weight:700;font-size:15px;line-height:1.2}\n"
".call-end-toast .cet-s{color:#9aa0a6;font-size:13px;line-height:1.2}")
s=R(s,".call-btn.red{background:#e53e3e;box-shadow:0 8px 24px rgba(229,62,62,.45);}",CSS,"CSS fin d'appel premium")

# 4) Wire endCall
s=R(s,"function endCall(){\n  if(_lk.targetId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.targetId});\n  if(_lk.callerId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.callerId});\n  cleanupCall();\n}",
      "function endCall(){\n  var _secs=_lk.connected?_lk.seconds:0;\n  if(_lk.targetId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.targetId});\n  if(_lk.callerId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.callerId});\n  cleanupCall();\n  _callEndToast('Appel terminé', _fmtDur(_secs));\n}",
      "Wire endCall")

# 5) ParticipantDisconnected
s=R(s,"    _lk.room.on(LK.RoomEvent.ParticipantDisconnected,function(){\n      showNotif('📵','Appel terminé','','gray',null);\n      cleanupCall();\n    });",
      "    _lk.room.on(LK.RoomEvent.ParticipantDisconnected,function(){\n      var _secs=_lk.seconds;\n      cleanupCall();\n      _callEndToast('Appel terminé', _fmtDur(_secs));\n    });",
      "Wire ParticipantDisconnected")

# 6) call:ended
s=R(s,"  SOCKET.on('call:ended',function(){\n    showNotif('📵','Appel terminé','','gray',null); cleanupCall();\n  });",
      "  SOCKET.on('call:ended',function(){\n    var _secs=_lk.seconds; cleanupCall(); _callEndToast('Appel terminé', _fmtDur(_secs));\n  });",
      "Wire call:ended")

# 7) call:declined
s=R(s,"    showNotif('📵','Appel refusé','','orange',null); cleanupCall();",
      "    cleanupCall(); _callEndToast('Appel refusé','');","Wire call:declined")

# 8) call:busy
s=R(s,"    showNotif('📵','Occupé','La personne est en communication','orange',null); cleanupCall();",
      "    cleanupCall(); _callEndToast('Occupé','La personne est en communication');","Wire call:busy")

# 9) ring timeout
s=R(s,"if(SOCKET&&_lk.targetId) SOCKET.emit('call:end',{target_id:_lk.targetId}); showNotif('📵','Pas de réponse','La personne ne répond pas','orange',null); cleanupCall(); }",
      "if(SOCKET&&_lk.targetId) SOCKET.emit('call:end',{target_id:_lk.targetId}); cleanupCall(); _callEndToast('Pas de réponse','La personne ne répond pas'); }","Wire ring timeout")

# Build
s=R(s,"console.log('PENC build v167 (appels: chrono sync + qualite audio)');",
      "console.log('PENC build v168 (appels: fix video + fin appel premium)');","Build -> v168")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v168.")
