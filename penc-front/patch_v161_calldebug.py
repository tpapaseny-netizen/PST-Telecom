# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v161 (diagnostic appels : rendre les erreurs visibles)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v161 — diagnostic appels")

# 1) Ouvrir un try + log au debut de startCall
s=R(s,"async function startCall(type){\n  if(!CUR_CONV_DATA){showNotif('⚠️','Erreur','Ouvre une conversation d\\'abord','red',null);return;}",
      "async function startCall(type){\n  console.log('[startCall]',type,CUR_CONV_DATA);\n  try{\n  if(!CUR_CONV_DATA){showNotif('⚠️','Erreur','Ouvre une conversation d\\'abord','red',null);return;}",
      "Ouvrir try + log startCall")

# 2) Fermer le try avec un catch visible (toast)
s=R(s,"  _lk.ringTimeout=setTimeout(function(){\n    if(!_lk.connected && _lk.room){ if(SOCKET&&_lk.targetId) SOCKET.emit('call:end',{target_id:_lk.targetId}); showNotif('📵','Pas de réponse','La personne ne répond pas','orange',null); cleanupCall(); }\n  }, 35000);\n}",
      "  _lk.ringTimeout=setTimeout(function(){\n    if(!_lk.connected && _lk.room){ if(SOCKET&&_lk.targetId) SOCKET.emit('call:end',{target_id:_lk.targetId}); showNotif('📵','Pas de réponse','La personne ne répond pas','orange',null); cleanupCall(); }\n  }, 35000);\n  }catch(_se){ showNotif('🐞','Appel — erreur',(_se&&_se.message)||String(_se),'red',null); console.error('startCall error:',_se); }\n}",
      "Fermer try + catch visible")

# 3) Build bump
s=R(s,"console.log('PENC build v160 (appels: occupe + pas-de-reponse)');",
      "console.log('PENC build v161 (appels: diagnostic erreurs visibles)');","Build -> v161")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v161.")
