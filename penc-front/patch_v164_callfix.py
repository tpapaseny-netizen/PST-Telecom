# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v164 (appels : garde socket connecté + busy assoupli)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v164 — fix appels")

# 1) startCall : ne pas appeler si le socket n'est pas connecté (serveur en veille)
s=R(s,"  if(_lk.room){showNotif('📞','Appel en cours','Tu es déjà en communication','orange',null);return;}\n  _lk.type=type; _lk.targetId=targetId; _lk.isCaller=true;",
      "  if(_lk.room){showNotif('📞','Appel en cours','Tu es déjà en communication','orange',null);return;}\n"
      "  if(!SOCKET || !SOCKET.connected){ try{ SOCKET&&SOCKET.connect&&SOCKET.connect(); }catch(_e){} showNotif('⏳','Connexion','Serveur en cours de réveil — réessaie dans ~10 s','orange',null); return; }\n"
      "  _lk.type=type; _lk.targetId=targetId; _lk.isCaller=true;",
      "Garde socket connecté")

# 2) Assouplir le garde-fou occupé (seulement si appel réellement actif)
s=R(s,"    var _coAct=document.getElementById('callOverlay'); var _icAct=document.getElementById('incomingCallOverlay');\n    if(_lk.room || (_coAct&&_coAct.classList.contains('active')) || (_icAct&&_icAct.classList.contains('active'))){\n      if(SOCKET) SOCKET.emit('call:busy',{target_id:data.from});\n      return;\n    }",
      "    if(_lk.room){\n      if(SOCKET) SOCKET.emit('call:busy',{target_id:data.from});\n      return;\n    }",
      "Busy assoupli (room seulement)")

# 3) Build bump
s=R(s,"console.log('PENC build v163 (appels: UI premium SVG)');",
      "console.log('PENC build v164 (appels: garde socket + busy assoupli)');","Build -> v164")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v164.")
