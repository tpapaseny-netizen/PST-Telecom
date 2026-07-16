# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v112 (carte compteur erreurs app 24h)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v112 — carte erreurs 24h")

OLD="Comptes suspendus</div></div></div>';"
NEW="Comptes suspendus</div></div><div class=\"fin-card\"><div class=\"fin-card-v\" style=\"color:#7C3AED;\">'+(d.errors_24h||0)+'</div><div class=\"fin-card-l\">🐞 Erreurs app (24h)</div></div></div>';"
s=R(s,OLD,NEW,"Carte erreurs 24h")

s=R(s,"console.log('PENC build v111 (B6: tracage global des erreurs)');",
      "console.log('PENC build v112 (suivi: compteur erreurs app)');","Build -> v112")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v112.")
