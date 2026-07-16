# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v166 (enregistrer l'ecoute des appels au demarrage/reprise de session)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v166 — initCallSocket au boot")

s=R(s,
"    showScreen('screen-main');\n    initSocket();\n    loadConvs().then(function(){ try{ _pencRestoreView(); }",
"    showScreen('screen-main');\n    initSocket(); initCallSocket();\n    loadConvs().then(function(){ try{ _pencRestoreView(); }",
"initCallSocket au demarrage (reprise session)")

s=R(s,"console.log('PENC build v165 (appels: sonnerie definie - LE fix)');",
      "console.log('PENC build v166 (appels: ecoute entrante au boot - LE fix final)');","Build -> v166")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v166.")
