# -*- coding: utf-8 -*-
"""PENC SERVER — A6 (stats publicites: vues + revenus par pub)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur A6 — stats pubs")
OLD="    const ads=r.rows.map(function(a){ if(a.owner_id){ var u=users.find(function(x){return String(x.id)===String(a.owner_id);}); a.owner_name=u?(u.full_name||u.username||'Utilisateur'):'Utilisateur'; } else { a.owner_name='Admin'; } return a; });"
NEW=("    let statMap={};\r\n"
     "    try{ const sr=await _pgPool.query(\"SELECT ad_id, COUNT(*)::int views, COALESCE(SUM(total),0)::int revenue FROM penc_ad_revenue GROUP BY ad_id\"); sr.rows.forEach(function(x){ statMap[String(x.ad_id)]={views:x.views, revenue:x.revenue}; }); }catch(e){}\r\n"
     "    const ads=r.rows.map(function(a){ if(a.owner_id){ var u=users.find(function(x){return String(x.id)===String(a.owner_id);}); a.owner_name=u?(u.full_name||u.username||'Utilisateur'):'Utilisateur'; } else { a.owner_name='Admin'; } var st=statMap[String(a.id)]||{views:0,revenue:0}; a.views=st.views; a.revenue=st.revenue; return a; });")
s=R(s,OLD,NEW,"Stats vues/revenus dans /ads")
data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour (A6).")
