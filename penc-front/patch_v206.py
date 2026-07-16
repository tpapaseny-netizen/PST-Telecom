# -*- coding: utf-8 -*-
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
CTRY=io.open("fb_admcountry.js",encoding="utf-8").read()
print("Patch v206")
s=R(s,"function openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      CTRY+"\nfunction openAdmin(){\n  var ov=document.getElementById('adminOverlay');","Fonctions admin pays")
ISOBTN='  html+=`<button onclick="openAdminIso()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#B23A48;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🚫 Isolations</button>`;'
CTRYBTN='  html+=`<button onclick="openAdminCountry()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#1E7A6F;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🌍 Par pays</button>`;'
s=R(s,ISOBTN,ISOBTN+"\n"+CTRYBTN,"Bouton pays")
s=R(s,"console.log('PENC build v205 (admin: isolations entre utilisateurs)');",
      "console.log('PENC build v206 (admin: classement par pays)');","Build -> v206")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v206")
