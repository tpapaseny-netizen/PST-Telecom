# -*- coding: utf-8 -*-
"""PENC v198 — statut 'en ligne / n'est pas en ligne' du correspondant pendant l'appel"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v198 — statut en ligne a l'appel")

# 1) Au demarrage de l'appel : afficher le statut du correspondant
s=R(s,"  showCallOverlay(CUR_CONV_DATA.name,CUR_CONV_DATA.avatar_url,type,'Appel en cours...',false);",
      "  var _onl=ONLINE.has(targetId); var _cnm=CUR_CONV_DATA.name||'';\n"
      "  showCallOverlay(CUR_CONV_DATA.name,CUR_CONV_DATA.avatar_url,type,(_onl?(_cnm+' est en ligne'):(_cnm+\" n'est pas en ligne\")),false);",
      "Statut au demarrage")

# 2) Mise a jour en direct si le correspondant se connecte/deconnecte pendant la sonnerie
s=R(s,"    if(isOnline) ONLINE.add(userId); else ONLINE.delete(userId);",
      "    if(isOnline) ONLINE.add(userId); else ONLINE.delete(userId);\n"
      "    try{ if(_lk&&_lk.room&&_lk.isCaller&&!_lk.connected&&String(_lk.targetId)===String(userId)){ var _cst=document.getElementById('callTimer'); if(_cst){ var _cnn=(CUR_CONV_DATA&&CUR_CONV_DATA.name)||''; _cst.textContent=isOnline?(_cnn+' est en ligne'):(_cnn+\" n'est pas en ligne\"); } } }catch(_e){}",
      "Maj statut en direct")

# Build
s=R(s,"console.log('PENC build v197 (fix duree appel sec/ms)');",
      "console.log('PENC build v198 (statut en ligne a l\\'appel)');","Build -> v198")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v198")
