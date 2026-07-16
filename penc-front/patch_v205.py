# -*- coding: utf-8 -*-
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
ISO=io.open("fb_admiso.js",encoding="utf-8").read()
print("Patch v205")
# Fonctions admin iso (avant openAdmin)
s=R(s,"function openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      ISO+"\nfunction openAdmin(){\n  var ov=document.getElementById('adminOverlay');","Fonctions admin iso")
# Bouton (apres evaluations)
RATE='  html+=`<button onclick="openAdminRatings()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#D4A017;color:#04150f;font-weight:700;cursor:pointer;margin:0 0 10px;">⭐ Évaluations des appels</button>`;'
ISOBTN='  html+=`<button onclick="openAdminIso()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#B23A48;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🚫 Isolations</button>`;'
s=R(s,RATE,RATE+"\n"+ISOBTN,"Bouton isolations")
# Build
s=R(s,"console.log('PENC build v204 (admin: evaluations des appels)');",
      "console.log('PENC build v205 (admin: isolations entre utilisateurs)');","Build -> v205")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v205")
