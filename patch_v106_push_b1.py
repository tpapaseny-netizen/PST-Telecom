# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v106 (B1 : push iOS installe + anti-spam prompt)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v106 — Push B1")

# 1) iOS : autoriser l'abonnement quand l'app est installee (standalone)
OLD1="    if(/iphone|ipad|ipod/i.test(navigator.userAgent)){"
NEW1="    if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !((window.navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches))){"
s=R(s,OLD1,NEW1,"iOS push si installe")

# 2) Auto-prompt : seulement si permission non encore decidee (evite le spam de toast)
OLD2="setTimeout(function(){ if(TOKEN && 'Notification' in window && Notification.permission!=='denied') enablePush(); }, 3500);"
NEW2="setTimeout(function(){ if(TOKEN && 'Notification' in window && Notification.permission==='default') enablePush(); }, 3500);"
s=R(s,OLD2,NEW2,"Auto-prompt une seule fois")

# 3) Build bump
s=R(s,"console.log('PENC build v105 (admin: logs & securite)');",
      "console.log('PENC build v106 (B1: push iOS installe + anti-spam)');","Build -> v106")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v106.")
