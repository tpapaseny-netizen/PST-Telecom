# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v192 (stabiliser les discussions: reserver hauteur medias + ancrage scroll)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v192 — stabilisation discussions")

# 1) Reserver hauteur image (anti-reflow)
s=R(s,".media-bubble img{width:100%;display:block;max-height:320px;\n  object-fit:cover;border-radius:14px;}",
      ".media-bubble img{width:100%;display:block;max-height:320px;min-height:170px;background:#1a1f2e;\n  object-fit:cover;border-radius:14px;}",
      "Hauteur reservee image")

# 2) Reserver hauteur video bulle
s=R(s,".media-bubble .vid-wrap video{width:100%;max-height:320px;display:block;\n  object-fit:cover;border-radius:14px;}",
      ".media-bubble .vid-wrap video{width:100%;max-height:320px;min-height:170px;background:#000;display:block;\n  object-fit:cover;border-radius:14px;}",
      "Hauteur reservee video")

# 3) Ancrage du defilement (overflow-anchor)
s=R(s,".messages-area{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:3px;}",
      ".messages-area{flex:1;overflow-y:auto;overflow-anchor:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:3px;}",
      "overflow-anchor messages")

# 4) Build
s=R(s,"console.log('PENC build v191 (apercu avant envoi canaux)');",
      "console.log('PENC build v192 (stabilisation discussions)');","Build -> v192")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v192")
