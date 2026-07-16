# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v180 (bouton fermer X dans Nouvelle conversation)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v180 — bouton fermer X")
X='<button class="sheet-x" onclick="closeOl(\'ol-newchat\')" aria-label="Fermer"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
s=R(s,'<div class="overlay" id="ol-newchat">\n  <div class="sheet">\n    <div class="sheet-handle"></div>\n    <div class="sheet-title">Nouvelle conversation</div>',
      '<div class="overlay" id="ol-newchat">\n  <div class="sheet" style="position:relative">\n    <div class="sheet-handle"></div>\n    '+X+'\n    <div class="sheet-title">Nouvelle conversation</div>',"Bouton X newchat")
s=R(s,"console.log('PENC build v179 (modal statut premium)');",
      "console.log('PENC build v180 (fermer X nouvelle conversation)');","Build -> v180")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v180")
