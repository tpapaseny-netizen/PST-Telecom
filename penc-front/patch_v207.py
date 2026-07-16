# -*- coding: utf-8 -*-
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
FICHE=io.open("fb_fiche.js",encoding="utf-8").read()
print("Patch v207")
# Fonctions fiche (avant openAdmin)
s=R(s,"function openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      FICHE+"\nfunction openAdmin(){\n  var ov=document.getElementById('adminOverlay');","Fonctions fiche")
# Bouton Fiche dans la carte utilisateur (apres Supprimer)
DEL='''      +'<button data-id="'+u.id+'" data-kind="delete" onclick="_admBtn(this)" style="'+_repBtn('#7C1D2B')+'">Supprimer</button>'\''''
# safer: anchor on the exact substring
ANCH='+\'<button data-id="\'+u.id+\'" data-kind="delete" onclick="_admBtn(this)" style="\'+_repBtn(\'#7C1D2B\')+\'">Supprimer</button>\''
NEW=ANCH+'\n      +\'<button onclick="openUserFiche(\\\''+'\'+u.id+\'\\\')" style="\'+_repBtn(\'#2563EB\')+\'">📋 Fiche</button>\''
s=R(s,ANCH,NEW,"Bouton Fiche")
# Build
s=R(s,"console.log('PENC build v206 (admin: classement par pays)');",
      "console.log('PENC build v207 (admin: fiche detaillee + export PDF/CSV)');","Build -> v207")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v207")
