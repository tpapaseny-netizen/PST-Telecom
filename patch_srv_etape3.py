# -*- coding: utf-8 -*-
"""PENC SERVER Etape 3 — evaluations des appels (table + route user + route admin)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur Etape 3")

# 1) Table penc_call_ratings (apres penc_security_logs)
ANCH_TBL="      CREATE TABLE IF NOT EXISTS penc_security_logs (id TEXT PRIMARY KEY, type TEXT, user_id TEXT, identifier TEXT, ip TEXT, user_agent TEXT, detail TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\r\n"
s=R(s,ANCH_TBL,
      ANCH_TBL+"      CREATE TABLE IF NOT EXISTS penc_call_ratings (id TEXT PRIMARY KEY, rater_id TEXT, peer_id TEXT, call_type TEXT, rating INTEGER, comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\r\n",
      "Table penc_call_ratings")

# 2) Routes (avant le bloc helpers/overview)
ANCH_R="// ── Etape 2 : moderation temps reel ───────────────────────────\r\n"
ROUTES=(
"// ── Etape 3 : evaluations des appels ──────────────────────────\r\n"
"app.post('/api/penc/call/rate', pencAuth, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    const uid=req.pencUser.userId;\r\n"
"    const r=parseInt((req.body&&req.body.rating),10);\r\n"
"    if(!(r>=1&&r<=5)) return res.status(400).json({error:'note invalide'});\r\n"
"    const ct=((req.body&&req.body.call_type)==='video')?'video':'audio';\r\n"
"    const peer=(req.body&&req.body.peer_id)?String(req.body.peer_id):null;\r\n"
"    const cm=((req.body&&req.body.comment)||'').toString().slice(0,500);\r\n"
"    await _pgPool.query('INSERT INTO penc_call_ratings(id,rater_id,peer_id,call_type,rating,comment,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW())',['cr_'+Date.now()+Math.random().toString(36).slice(2),uid,peer,ct,r,cm||null]);\r\n"
"    res.json({success:true});\r\n"
"  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n"
"app.get('/api/penc/admin/call-ratings', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({avg:0,count:0,per_user:[],history:[]});\r\n"
"    const from=(req.query.from||'').trim(); const to=(req.query.to||'').trim(); const user=(req.query.user||'').trim();\r\n"
"    let where=[]; let params=[]; let i=1;\r\n"
"    if(from){ where.push('cr.created_at >= $'+i); params.push(from); i++; }\r\n"
"    if(to){ where.push('cr.created_at <= $'+i); params.push(to+' 23:59:59'); i++; }\r\n"
"    if(user){ where.push('cr.rater_id = $'+i); params.push(user); i++; }\r\n"
"    const W = where.length?(' WHERE '+where.join(' AND ')):'';\r\n"
"    const g=await _pgPool.query('SELECT COALESCE(AVG(rating),0)::numeric(10,2) avg, COUNT(*)::int c FROM penc_call_ratings cr'+W, params);\r\n"
"    const pu=await _pgPool.query('SELECT cr.rater_id, COALESCE(AVG(cr.rating),0)::numeric(10,2) avg, COUNT(*)::int c, u.full_name, u.username FROM penc_call_ratings cr LEFT JOIN penc_users u ON u.id=cr.rater_id'+W+' GROUP BY cr.rater_id,u.full_name,u.username ORDER BY c DESC LIMIT 100', params);\r\n"
"    const h=await _pgPool.query('SELECT cr.id, cr.rating, cr.comment, cr.call_type, cr.created_at, u.full_name, u.username FROM penc_call_ratings cr LEFT JOIN penc_users u ON u.id=cr.rater_id'+W+' ORDER BY cr.created_at DESC LIMIT 100', params);\r\n"
"    res.json({\r\n"
"      avg: parseFloat(g.rows[0].avg)||0, count: g.rows[0].c||0,\r\n"
"      per_user: pu.rows.map(function(r){ return {user_id:r.rater_id, name:r.full_name||r.username||'?', username:r.username||'', avg:parseFloat(r.avg)||0, count:r.c||0}; }),\r\n"
"      history: h.rows.map(function(r){ return {id:r.id, rating:r.rating, comment:r.comment||'', call_type:r.call_type||'audio', created_at:r.created_at, name:r.full_name||r.username||'?', username:r.username||''}; })\r\n"
"    });\r\n"
"  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n"
)
s=R(s,ANCH_R,ROUTES+ANCH_R,"Routes rate + admin call-ratings")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
