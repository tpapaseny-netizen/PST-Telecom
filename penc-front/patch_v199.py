# -*- coding: utf-8 -*-
"""PENC v199 — statut en ligne FIABLE via le signal serveur call:debug"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v199 — statut fiable via call:debug")

OLD="SOCKET.on('call:debug',function(d){ try{ var on=d&&d.online; showNotif(on?'\u2705':'\u26a0\ufe0f','Diagnostic appel','cible='+String((d&&d.target)||'').slice(0,8)+' \u00b7 en ligne='+(!!on)+' \u00b7 sockets='+(d&&d.room_sockets),'gray',null); console.log('[call:debug]',d); }catch(e){} });"
NEW=("SOCKET.on('call:debug',function(d){ try{ if(!d) return; var _on=!!d.online; "
     "if(d.target!=null){ if(_on) ONLINE.add(String(d.target)); else ONLINE.delete(String(d.target)); } "
     "if(_lk&&_lk.room&&_lk.isCaller&&!_lk.connected){ var _st=document.getElementById('callTimer'); if(_st){ var _nn=(CUR_CONV_DATA&&CUR_CONV_DATA.name)||''; _st.textContent=_on?(_nn+' est en ligne'):(_nn+\" n'est pas en ligne\"); } } "
     "console.log('[call:debug]',d); }catch(e){} });")
s=R(s,OLD,NEW,"call:debug pilote le statut")

# Build
s=R(s,"console.log('PENC build v198 (statut en ligne a l\\'appel)');",
      "console.log('PENC build v199 (statut en ligne fiable via serveur)');","Build -> v199")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v199")
