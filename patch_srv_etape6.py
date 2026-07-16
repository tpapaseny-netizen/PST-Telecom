# -*- coding: utf-8 -*-
"""PENC SERVER Etape 6 — fiche detaillee agregee par utilisateur"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur Etape 6")

ANCH="// ── Etape 4 : isolation entre utilisateurs ────────────────────\r\n"
R6=open("/home/claude/fiche_route.js","r",encoding="utf-8").read()
# convertir LF->CRLF pour coherence
R6="\r\n".join(R6.split("\n"))
s=R(s,ANCH,R6+ANCH,"Route fiche")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
