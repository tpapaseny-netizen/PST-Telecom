# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v130 (DeglouFM: repli 'Reessayer' dans Penc, plus de sortie vers base44)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v130 — repli radio Reessayer")

# 1) Texte du repli (sans mention 'ne peut pas s'afficher')
s=R(s,"<div style=\"font-size:15px; line-height:1.5;\">DeglouFM ne peut pas s'afficher integre ici<br/>(protection anti-iframe du site).</div>",
      "<div style=\"font-size:15px; line-height:1.5;\">DeglouFM met un peu de temps à charger…<br/>Réessaie dans un instant.</div>",
      "Texte repli")

# 2) Bouton : ouverture externe -> Reessayer (dans Penc)
s=R(s,"<button onclick=\"window.open('https://deglufm.base44.app','_blank')\">Ouvrir DeglouFM &#8599;</button>",
      "<button onclick=\"retryRadio()\">Réessayer</button>",
      "Bouton Reessayer")

# 3) Fonction retryRadio dans l'IIFE
s=R(s,"  window.addEventListener('message', function(e){",
      "  window.retryRadio=function(){\n"
      "    var fr=el('radioFrame'), fb=el('radioFallback');\n"
      "    if(!fr) return;\n"
      "    if(fb) fb.classList.remove('show');\n"
      "    _loaded=false; _active=false;\n"
      "    try{ fr.src='about:blank'; }catch(_){}\n"
      "    setTimeout(function(){ window.openRadio(); }, 120);\n"
      "  };\n"
      "  window.addEventListener('message', function(e){",
      "Fonction retryRadio")

# 4) Build bump
s=R(s,"console.log('PENC build v129 (groupement des notifications)');",
      "console.log('PENC build v130 (DeglouFM: repli Reessayer, plus de sortie base44)');","Build -> v130")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v130.")
