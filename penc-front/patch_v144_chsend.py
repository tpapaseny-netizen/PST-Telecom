# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v144 (#2 bouton envoyer canal bien positionne)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v144 — bouton envoyer canal")

# 1) Centrer verticalement la barre de saisie du canal
s=R(s,".ch-input-bar{padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;",
      ".ch-input-bar{padding:10px 14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;",
      "ch-input-bar align center")

# 2) CSS bouton envoyer rond (non flottant) avant .ch-switch
s=R(s,".ch-switch{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;}",
      ".ch-send-btn{width:42px;height:42px;flex-shrink:0;border:none;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(28,107,74,.3);transition:transform .2s;}\n"
      ".ch-send-btn:active{transform:scale(.9);}\n"
      ".ch-switch{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;}",
      "CSS ch-send-btn")

# 3) Remplacer la classe fab par ch-send-btn sur le bouton d'envoi du canal
s=R(s,'<button class="fab" style="width:42px;height:42px;flex-shrink:0;font-size:18px;" onclick="postToChannel(',
      '<button class="ch-send-btn" onclick="postToChannel(',
      "Bouton envoyer canal")

# 4) Build bump
s=R(s,"console.log('PENC build v143 (confirmations de suppression premium)');",
      "console.log('PENC build v144 (bouton envoyer canal bien positionne)');","Build -> v144")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v144.")
