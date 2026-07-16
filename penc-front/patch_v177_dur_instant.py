# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v177 (duree reelle + connexion instantanee)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v177 — duree reelle + instantane")

# 1) Fonctions _callElapsed + _prefetchCallToken (avant _logCall)
FNS=("function _callElapsed(){ try{ return _lk.startTs?Math.max(0,Math.round((Date.now()-_lk.startTs)/1000)):(_lk.seconds||0); }catch(e){ return _lk.seconds||0; } }\n"
"function _prefetchCallToken(){ try{ var rn=_lk.roomName, tp=_lk.type; if(!rn) return; _lk.pendingRoom=rn; _lk.pendingToken=null; _lk.pendingUrl=null; api('/call/token','POST',{room_name:rn,participant_name:ME&&(ME.full_name||ME.username),type:tp}).then(function(r){ if(r&&!r.error&&_lk.pendingRoom===rn){ _lk.pendingToken=r.token; _lk.pendingUrl=r.url; } }).catch(function(){}); }catch(e){} }\n"
"function _logCall(status){")
s=R(s,"function _logCall(status){",FNS,"Fonctions _callElapsed + prefetch")

# 2) startCallTimer : horodatage
s=R(s,"function startCallTimer(){\n  _lk.seconds=0; clearInterval(_lk.timerInterval);",
      "function startCallTimer(){\n  _lk.seconds=0; _lk.startTs=Date.now(); clearInterval(_lk.timerInterval);","startTs dans startCallTimer")

# 3) _logCall : duree horodatee
s=R(s,"duration:(_lk.connected?(_lk.seconds||0):0)","duration:(_lk.connected?_callElapsed():0)","duree horodatee _logCall")

# 4) endCall : duree horodatee
s=R(s,"var _secs=_lk.connected?_lk.seconds:0;","var _secs=_lk.connected?_callElapsed():0;","endCall duree")

# 5) ParticipantDisconnected : duree horodatee
s=R(s,"      var _secs=_lk.seconds;\n      _logCall('answered');","      var _secs=_callElapsed();\n      _logCall('answered');","ParticipantDisconnected duree")

# 6) call:ended : duree horodatee
s=R(s,"var _secs=_lk.seconds; _logCall(_lk.connected","var _secs=_callElapsed(); _logCall(_lk.connected","call:ended duree")

# 7) cleanupCall : capture horodatee + purge jeton pre-charge
s=R(s,"  try{ _lastCall={secs:_lk.seconds||0,type:_lk.type||'audio',connected:!!_lk.connected}; }catch(_lc){}\n",
      "  try{ _lastCall={secs:_callElapsed(),type:_lk.type||'audio',connected:!!_lk.connected}; }catch(_lc){}\n  _lk.pendingToken=null;_lk.pendingRoom=null;_lk.pendingUrl=null;\n",
      "cleanupCall capture+purge")

# 8) call:incoming : pre-charger le jeton (connexion instantanee)
s=R(s,"    _lk.roomName=data.room_name;\n    var o=document.getElementById('incomingCallOverlay');",
      "    _lk.roomName=data.room_name;\n    _prefetchCallToken();\n    var o=document.getElementById('incomingCallOverlay');",
      "call:incoming prefetch")

# 9) joinLKRoom : utiliser le jeton pre-charge si dispo
s=R(s,"    var r=await api('/call/token','POST',{\n      room_name:roomName,\n      participant_name:ME&&(ME.full_name||ME.username),\n      type:type\n    });",
      "    var r;\n    if(_lk.pendingToken && _lk.pendingRoom===roomName){ r={token:_lk.pendingToken,url:_lk.pendingUrl}; _lk.pendingToken=null; }\n    else { r=await api('/call/token','POST',{\n      room_name:roomName,\n      participant_name:ME&&(ME.full_name||ME.username),\n      type:type\n    }); }",
      "joinLKRoom token pre-charge")

# 10) declineCall : purge jeton
s=R(s,"document.getElementById('incomingCallOverlay').classList.remove('active');\n  _lk.callerId=null;",
      "document.getElementById('incomingCallOverlay').classList.remove('active');\n  _lk.callerId=null;\n  _lk.pendingToken=null;_lk.pendingRoom=null;_lk.pendingUrl=null;",
      "declineCall purge jeton")

# 11) Build
s=R(s,"console.log('PENC build v176 (appel entrant premium)');",
      "console.log('PENC build v177 (duree reelle + connexion instantanee)');","Build -> v177")

io.open(FN,"wb").write(s.encode("utf-8"))
print("\nTermine. messager.html -> v177.")
