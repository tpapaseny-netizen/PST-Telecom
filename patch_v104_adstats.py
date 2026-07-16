# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v104 (A6 : stats publicites)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v104 — Stats pubs (A6)")

# 1) Bandeau recap (avant la map)
OLD1="    box.innerHTML=ads.map(function(a){"
NEW1=("    var _tv=0,_tr=0; ads.forEach(function(a){ _tv+=(a.views||0); _tr+=(a.revenue||0); });\n"
      "    box.innerHTML='<div style=\"display:flex;gap:8px;margin-bottom:10px;\"><div style=\"flex:1;background:var(--card2);border-radius:10px;padding:10px;text-align:center;\"><div style=\"font-weight:800;font-size:16px;\">'+_tv+'</div><div style=\"font-size:11px;color:var(--muted);\">vues totales</div></div><div style=\"flex:1;background:var(--card2);border-radius:10px;padding:10px;text-align:center;\"><div style=\"font-weight:800;font-size:16px;color:#00C896;\">'+_tr+' F</div><div style=\"font-size:11px;color:var(--muted);\">revenus générés</div></div></div>'+ads.map(function(a){")
s=R(s,OLD1,NEW1,"Bandeau recap pubs")

# 2) Ligne stats par pub
OLD2="'+stt+'</div></div><div style=\"display:flex;gap:6px;margin-top:8px;\">"
NEW2="'+stt+'</div><div style=\"font-size:12px;margin-top:3px;color:var(--text);\">👁️ '+(a.views||0)+' vues · 💰 '+(a.revenue||0)+' F générés</div></div><div style=\"display:flex;gap:6px;margin-top:8px;\">"
s=R(s,OLD2,NEW2,"Stats par pub")

# 3) Build bump
s=R(s,"console.log('PENC build v103 (admin: notification push a tous)');",
      "console.log('PENC build v104 (admin: stats publicites)');","Build -> v104")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v104.")
