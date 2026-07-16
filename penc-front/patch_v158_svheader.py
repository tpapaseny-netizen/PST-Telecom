# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v158 (#2 : header statut sans chevauchement, marge securite)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v158 — header statut")

# 1) Texte du statut : marge haute de securite (clear le header + encoche), padding cotes 24px, bas 64px
s=R(s,".sv-text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:30px;font-size:22px;font-weight:700;text-align:center;color:#fff;word-break:break-word;}",
      ".sv-text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:calc(108px + env(safe-area-inset-top,0px)) 24px 64px;font-size:22px;font-weight:700;text-align:center;color:#fff;word-break:break-word;overflow-wrap:break-word;}",
      "sv-text marge haute + box-sizing")

# 2) Header : dégradé un peu plus haut/marqué pour lisibilité quel que soit le fond derrière
s=R(s,"  background:linear-gradient(to bottom,rgba(0,0,0,.75) 0%,transparent 100%);\n  display:flex;align-items:center;gap:10px;pointer-events:none;}",
      "  background:linear-gradient(to bottom,rgba(0,0,0,.82) 0%,rgba(0,0,0,.45) 55%,transparent 100%);\n  display:flex;align-items:center;gap:10px;pointer-events:none;}",
      "Header dégradé renforcé")

# 3) Build bump
s=R(s,"console.log('PENC build v157 (statut texte: limite 280 + police adaptative)');",
      "console.log('PENC build v158 (statut: header sans chevauchement)');","Build -> v158")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v158.")
