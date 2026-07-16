# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v160 (appels Phase 1A : occupe + timeout pas-de-reponse)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v160 — appels robustesse 1A")

# 1) Etat _lk : ajouter ringTimeout + connected
s=R(s,"  timerInterval:null, seconds:0, url:''\n};",
      "  timerInterval:null, seconds:0, url:'',\n  ringTimeout:null, connected:false\n};",
      "Etat _lk + ringTimeout/connected")

# 2) Occupe : refuser un appel entrant si deja en appel/sonnerie
s=R(s,"  SOCKET.on('call:incoming',function(data){\n    _lk.callerId=data.from; _lk.type=data.type||'audio';",
      "  SOCKET.on('call:incoming',function(data){\n"
      "    var _coAct=document.getElementById('callOverlay'); var _icAct=document.getElementById('incomingCallOverlay');\n"
      "    if(_lk.room || (_coAct&&_coAct.classList.contains('active')) || (_icAct&&_icAct.classList.contains('active'))){\n"
      "      if(SOCKET) SOCKET.emit('call:busy',{target_id:data.from});\n"
      "      return;\n"
      "    }\n"
      "    _lk.callerId=data.from; _lk.type=data.type||'audio';",
      "Occupe (busy)")

# 3) Timeout pas-de-reponse cote appelant (35 s)
s=R(s,"  // Rejoindre la room LiveKit\n  await joinLKRoom(roomName, type, false);\n}",
      "  // Rejoindre la room LiveKit\n  await joinLKRoom(roomName, type, false);\n"
      "  // Pas de reponse apres 35 s -> annuler\n"
      "  _lk.connected=false; clearTimeout(_lk.ringTimeout);\n"
      "  _lk.ringTimeout=setTimeout(function(){\n"
      "    if(!_lk.connected && _lk.room){ if(SOCKET&&_lk.targetId) SOCKET.emit('call:end',{target_id:_lk.targetId}); showNotif('📵','Pas de réponse','La personne ne répond pas','orange',null); cleanupCall(); }\n"
      "  }, 35000);\n}",
      "Timeout pas-de-reponse")

# 4) Marquer connecte quand le correspondant rejoint
s=R(s,"    _lk.room.on(LK.RoomEvent.ParticipantConnected,function(p){\n      console.log('✅ Participant connecté:',p.identity);\n      stopRingtone();",
      "    _lk.room.on(LK.RoomEvent.ParticipantConnected,function(p){\n      console.log('✅ Participant connecté:',p.identity);\n      _lk.connected=true; clearTimeout(_lk.ringTimeout);\n      stopRingtone();",
      "Marquer connecte")

# 5) Nettoyage : annuler le timeout
s=R(s,"function cleanupCall(){\n  stopRingtone();\n  clearInterval(_lk.timerInterval);",
      "function cleanupCall(){\n  stopRingtone();\n  clearInterval(_lk.timerInterval);\n  clearTimeout(_lk.ringTimeout); _lk.connected=false;",
      "Nettoyage timeout")

# 6) Build bump
s=R(s,"console.log('PENC build v159 (statut officiel: duree perso + suppression)');",
      "console.log('PENC build v160 (appels: occupe + pas-de-reponse)');","Build -> v160")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v160.")
