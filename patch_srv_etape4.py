# -*- coding: utf-8 -*-
"""PENC SERVER Etape 4 — isolation entre utilisateurs (admin)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur Etape 4")

# 1) Table penc_isolations (apres penc_call_ratings)
ANCH_TBL="      CREATE TABLE IF NOT EXISTS penc_call_ratings (id TEXT PRIMARY KEY, rater_id TEXT, peer_id TEXT, call_type TEXT, rating INTEGER, comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\r\n"
s=R(s,ANCH_TBL,
      ANCH_TBL+"      CREATE TABLE IF NOT EXISTS penc_isolations (id TEXT PRIMARY KEY, user_a TEXT, user_b TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\r\n",
      "Table penc_isolations")

# 2) Helpers isolation (dans le bloc Etape 2)
ANCH_H="setTimeout(_loadBlocked, 8000); setInterval(_loadBlocked, 60000);\r\n"
ISO_H=("var _pencIso = new Set();\r\n"
"function _isoKey(a,b){ a=String(a); b=String(b); return a<b ? a+'|'+b : b+'|'+a; }\r\n"
"function _areIsolated(a,b){ try{ return _pencIso.has(_isoKey(a,b)); }catch(e){ return false; } }\r\n"
"async function _loadIso(){ try{ if(!_pgPool) return; const r=await _pgPool.query(\"SELECT user_a,user_b FROM penc_isolations\"); const set=new Set(); r.rows.forEach(function(x){ set.add(_isoKey(x.user_a,x.user_b)); }); _pencIso=set; }catch(e){ console.error('_loadIso', e.message); } }\r\n"
"setTimeout(_loadIso, 9000); setInterval(_loadIso, 60000);\r\n")
s=R(s,ANCH_H,ANCH_H+ISO_H,"Helpers isolation")

# 3) Routes admin isolation (avant marqueur Etape 2)
ANCH_R="// ── Etape 2 : moderation temps reel ───────────────────────────\r\n"
ROUTES=(
"// ── Etape 4 : isolation entre utilisateurs ────────────────────\r\n"
"app.post('/api/penc/admin/isolate', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    const a=(req.body&&req.body.user_a)?String(req.body.user_a):null;\r\n"
"    let bs=(req.body&&req.body.user_ids)||[]; if(!Array.isArray(bs)) bs=[];\r\n"
"    if(!a||!bs.length) return res.status(400).json({error:'Selection invalide'});\r\n"
"    const adminId=req.pencUser.userId; let n=0;\r\n"
"    for(const b0 of bs){ const b=String(b0); if(!b||b===a) continue;\r\n"
"      const ex=await _pgPool.query('SELECT 1 FROM penc_isolations WHERE (user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1) LIMIT 1',[a,b]);\r\n"
"      if(ex.rows.length) continue;\r\n"
"      await _pgPool.query('INSERT INTO penc_isolations(id,user_a,user_b,created_by,created_at) VALUES($1,$2,$3,$4,NOW())',['iso_'+Date.now()+Math.random().toString(36).slice(2),a,b,adminId]); n++;\r\n"
"    }\r\n"
"    await _loadIso();\r\n"
"    res.json({success:true, created:n});\r\n"
"  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n"
"app.get('/api/penc/admin/isolations', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({isolations:[]});\r\n"
"    const r=await _pgPool.query(\"SELECT i.id, i.user_a, i.user_b, i.created_at, ua.full_name fa, ua.username una, ub.full_name fb, ub.username unb FROM penc_isolations i LEFT JOIN penc_users ua ON ua.id=i.user_a LEFT JOIN penc_users ub ON ub.id=i.user_b ORDER BY i.created_at DESC\");\r\n"
"    res.json({isolations:r.rows.map(function(x){ return {id:x.id, a:{id:x.user_a,name:x.fa||x.una||'?'}, b:{id:x.user_b,name:x.fb||x.unb||'?'}, created_at:x.created_at}; })});\r\n"
"  }catch(e){ res.json({isolations:[]}); }\r\n"
"});\r\n"
"app.delete('/api/penc/admin/isolation/:id', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    await _pgPool.query('DELETE FROM penc_isolations WHERE id=$1',[req.params.id]);\r\n"
"    await _loadIso();\r\n"
"    res.json({success:true});\r\n"
"  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n")
s=R(s,ANCH_R,ROUTES+ANCH_R,"Routes admin isolation")

# 4) Application : message:send
s=R(s,"          const _other = _parts.find(p=>p!==pencUserId);\r\n          if (_other) {",
      "          const _other = _parts.find(p=>p!==pencUserId);\r\n          if (_other && _areIsolated(pencUserId, _other)) { if (typeof cb === 'function') cb({ error: 'Conversation indisponible.' }); return; }\r\n          if (_other) {",
      "Isolation message:send")

# 5) Application : profil/publications
s=R(s,"    const me=req.pencUser.userId; const target=req.params.id;\r\n    if(!_pgPool) return res.json({publications:[]});",
      "    const me=req.pencUser.userId; const target=req.params.id;\r\n    if(_areIsolated(me,target)) return res.status(403).json({error:'Indisponible', publications:[]});\r\n    if(!_pgPool) return res.json({publications:[]});",
      "Isolation publications")

# 6) Application : recherche
s=R(s,"    res.json({ users: results, contacts: results });",
      "    results = results.filter(function(u){ return !_areIsolated(uid, u.id); });\r\n    res.json({ users: results, contacts: results });",
      "Isolation recherche")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
