# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v174 (vidéo deux sens + anti-coupure audio)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v174 — vidéo + anti-coupure")

# 1) Retirer showCallOverlay de sa position actuelle (après caméra)
OLD_OVL=("    showCallOverlay(\n"
"      isRecipient?_lk.callerName:CUR_CONV_DATA&&CUR_CONV_DATA.name,\n"
"      isRecipient?_lk.callerAvatar:CUR_CONV_DATA&&CUR_CONV_DATA.avatar_url,\n"
"      type, isRecipient?'En communication':'En attente...', true\n"
"    );\n"
"  }catch(e){")
s=R(s,OLD_OVL,"  }catch(e){","Retirer showCallOverlay (apres camera)")

# 2) Réinsérer showCallOverlay AVANT connect + wake lock après connect
s=R(s,"    // Connecter\n    await _lk.room.connect(r.url, r.token);",
      "    showCallOverlay(\n"
      "      isRecipient?_lk.callerName:CUR_CONV_DATA&&CUR_CONV_DATA.name,\n"
      "      isRecipient?_lk.callerAvatar:CUR_CONV_DATA&&CUR_CONV_DATA.avatar_url,\n"
      "      type, isRecipient?'En communication':'En attente...', true\n"
      "    );\n"
      "    // Connecter\n    await _lk.room.connect(r.url, r.token);\n"
      "    try{ _acquireWakeLock(); }catch(_w){}",
      "showCallOverlay avant connect + wakelock")

# 3) DTX off (audio continu, anti-coupure)
s=R(s,"publishDefaults:{dtx:true,red:true}","publishDefaults:{dtx:false,red:true}","DTX off")

# 4) Fonctions wake lock (avant var _lk={)
WL=("var _wakeLock=null;\n"
"async function _acquireWakeLock(){ try{ if('wakeLock' in navigator){ _wakeLock=await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', _reWake); } }catch(e){} }\n"
"function _reWake(){ try{ if(document.visibilityState==='visible' && _lk && _lk.room && !_wakeLock){ _acquireWakeLock(); } }catch(e){} }\n"
"function _releaseWakeLock(){ try{ if(_wakeLock){ _wakeLock.release(); _wakeLock=null; } document.removeEventListener('visibilitychange', _reWake); }catch(e){} }\n"
"var _lk={")
s=R(s,"var _lk={",WL,"Fonctions wake lock")

# 5) cleanupCall : libérer wake lock + cacher vidéos
s=R(s,"function cleanupCall(){\n  stopRingtone();",
      "function cleanupCall(){\n  try{_releaseWakeLock();}catch(_w){}\n  try{ var _lvv=document.getElementById('localVideo'),_rvv=document.getElementById('remoteVideo'); if(_lvv){_lvv.style.display='none';} if(_rvv){_rvv.style.display='none';} }catch(_v){}\n  stopRingtone();",
      "cleanupCall release wakelock + hide videos")

# 6) Build
s=R(s,"console.log('PENC build v173 (Appels dans la barre)');",
      "console.log('PENC build v174 (video deux sens + anti-coupure audio)');","Build -> v174")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v174.")
