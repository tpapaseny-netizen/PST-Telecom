# -*- coding: utf-8 -*-
"""PENC SERVER — Canaux : compteur de vues par post"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur — vues canaux")

ANCH=("    res.json({success:true,channel:{id:ch.id,name:ch.name,description:ch.description,icon_url:ch.icon_url}}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n});\r\n")
NEW=ANCH+("app.post('/api/penc/channels/:id/posts/:pid/view', pencAuth, async (req,res) => {\r\n"
"  try{ const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);\r\n"
"    if(!ch) return res.status(404).json({error:'Canal introuvable'});\r\n"
"    const p=(ch.posts||[]).find(x=>x.id===req.params.pid);\r\n"
"    if(!p) return res.status(404).json({error:'Post introuvable'});\r\n"
"    p.views=(p.views||0)+1; await pencSaveChannels(channels);\r\n"
"    res.json({success:true,views:p.views});\r\n"
"  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n")
s=R(s,ANCH,NEW,"Route vue post")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js (vues canaux).")
