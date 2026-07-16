# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v109 (B5 : verif maj quand l'app revient au premier plan)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v109 — auto-update (B5)")

OLD="    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') _obFlush(); });"
NEW="    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible'){ _obFlush(); try{ navigator.serviceWorker.getRegistration().then(function(reg){ if(reg) reg.update(); }).catch(function(){}); }catch(e){} } });"
s=R(s,OLD,NEW,"Verif maj sur retour app")

s=R(s,"console.log('PENC build v108 (badge partout + modifier le profil)');",
      "console.log('PENC build v109 (B5: mise a jour auto sans reinstaller)');","Build -> v109")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v109.")
