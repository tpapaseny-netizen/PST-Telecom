# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v162 (afficher le diagnostic d'appel a l'ecran)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v162 — diagnostic appel a l'ecran")

s=R(s,"  SOCKET.on('call:accepted',function(){",
      "  SOCKET.on('call:debug',function(d){ try{ var on=d&&d.online; showNotif(on?'✅':'⚠️','Diagnostic appel','cible='+String((d&&d.target)||'').slice(0,8)+' · en ligne='+(!!on)+' · sockets='+(d&&d.room_sockets),'gray',null); console.log('[call:debug]',d); }catch(e){} });\n  SOCKET.on('call:accepted',function(){",
      "Listener call:debug")

s=R(s,"console.log('PENC build v161 (appels: diagnostic erreurs visibles)');",
      "console.log('PENC build v162 (appels: diagnostic en ligne a l ecran)');","Build -> v162")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v162.")
