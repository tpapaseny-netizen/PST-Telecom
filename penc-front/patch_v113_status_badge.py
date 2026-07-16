# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v113 (badge bleu dans la liste des statuts)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v113 — badge liste statuts")

# 1) Nom des autres dans la liste des statuts
s=R(s,'<div class="sv-uname">\'+esc(u.full_name||u.username||\'?\')+\'</div>',
      '<div class="sv-uname">\'+esc(u.full_name||u.username||\'?\')+_badgeFor(uid)+\'</div>',
      "Badge nom statut (autres)")

# 2) Mon statut
s=R(s,'<div class="sv-uname">Mon statut</div>',
      '<div class="sv-uname">Mon statut\'+((ME&&ME.verified)?_pencBadge():\'\')+\'</div>',
      "Badge Mon statut")

# 3) Build bump
s=R(s,"console.log('PENC build v112 (suivi: compteur erreurs app)');",
      "console.log('PENC build v113 (badge bleu dans la liste des statuts)');","Build -> v113")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v113.")
