# -*- coding: utf-8 -*-
"""PENC v203 (front Etape 2) — deconnexion forcee + UI gestion utilisateurs/corbeille"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
SOCK=io.open("fb_socket.js",encoding="utf-8").read()
FUNCS=io.open("fb_funcs.js",encoding="utf-8").read()
print("Patch v203")

# 1) Socket handler forcelogout (avant admin:newad)
ANCH_SOCK="  SOCKET.on('admin:newad', function(data){ showNotif('📢','Nouvelle publicité'"
s=R(s,ANCH_SOCK, SOCK+ANCH_SOCK, "Socket forcelogout")

# 2) Fonctions admin users (avant function openAdmin())
s=R(s,"function openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      FUNCS+"\nfunction openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      "Fonctions admin users")

# 3) Boutons dans renderAdmin (avant Securite & logs)
SEC='  html+=`<button onclick="openAdminSecurity()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#7C3AED;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🔒 Sécurité & logs</button>`;'
NEWBTNS=('  html+=`<button onclick="openAdminUsers()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#0EA5A0;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">👥 Gérer les utilisateurs</button>`;\n'
         '  html+=`<button onclick="openAdminDeleted()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#5b6472;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🗑️ Comptes supprimés</button>`;\n'
         +SEC)
s=R(s,SEC,NEWBTNS,"Boutons admin")

# 4) Build
s=R(s,"console.log('PENC build v202 (connexion sans scroll)');",
      "console.log('PENC build v203 (admin: actions utilisateurs + corbeille)');","Build -> v203")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v203")
