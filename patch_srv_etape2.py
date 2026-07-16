# -*- coding: utf-8 -*-
"""PENC SERVER Etape 2 — actions instantanees: suspend/block/soft-delete/restore + garde-fou temps reel"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur Etape 2")

# 1) Colonnes blocked + deleted_at
s=R(s,"      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;\r\n",
      "      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;\r\n"
      "      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE;\r\n"
      "      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;\r\n",
      "Colonnes blocked + deleted_at")

# 2) Garde-fou pencAuth (token inutilisable si restreint)
s=R(s,"    req.pencUser = jwt_penc.verify(h.slice(7), PENC_SECRET);\r\n    next();\r\n  } catch { res.status(401).json({ error: 'Token invalide' }); }",
      "    req.pencUser = jwt_penc.verify(h.slice(7), PENC_SECRET);\r\n"
      "    if (typeof _pencBlocked!=='undefined' && _pencBlocked.has(String(req.pencUser.userId))) return res.status(403).json({ error: 'compte_restreint', restricted:true });\r\n"
      "    next();\r\n  } catch { res.status(401).json({ error: 'Token invalide' }); }",
      "Garde-fou pencAuth")

# 3) Login : bloquer suspended + blocked + deleted
s=R(s,"    if (user && user.suspended && !isAdminBypass) return res.status(403).json({ error: '🚫 Ce compte a été suspendu.' });",
      "    if (user && (user.suspended||user.blocked||user.deleted_at) && !isAdminBypass) return res.status(403).json({ error: '🚫 Ce compte a été suspendu. Contactez support@penc-messagerie.com' });",
      "Login guard")

# 4) Helpers (set + forceLogout + load + purge) avant overview
HELP=(
"// ── Etape 2 : moderation temps reel ───────────────────────────\r\n"
"let _pencBlocked = new Set();\r\n"
"async function _loadBlocked(){\r\n"
"  try{ if(!_pgPool) return; const r=await _pgPool.query(\"SELECT id FROM penc_users WHERE suspended=TRUE OR blocked=TRUE OR deleted_at IS NOT NULL\"); const set=new Set(); r.rows.forEach(function(x){ set.add(String(x.id)); }); _pencBlocked=set; }catch(e){ console.error('_loadBlocked', e.message); }\r\n"
"}\r\n"
"async function _forceLogout(userId, reason){\r\n"
"  try{ _pencBlocked.add(String(userId));\r\n"
"    try{ io.to('user:'+String(userId)).emit('admin:forcelogout', { reason: reason||'suspended' }); }catch(e){}\r\n"
"    try{ const socks=await io.in('user:'+String(userId)).fetchSockets(); socks.forEach(function(sk){ try{ sk.disconnect(true); }catch(_){} }); }catch(e){}\r\n"
"    try{ pencOnline.delete(String(userId)); }catch(e){}\r\n"
"  }catch(e){ console.error('_forceLogout', e.message); }\r\n"
"}\r\n"
"async function _purgeTrash(){\r\n"
"  try{ if(!_pgPool) return; const r=await _pgPool.query(\"SELECT id FROM penc_users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'\");\r\n"
"    for(const row of r.rows){ const uid=row.id;\r\n"
"      try{ await _pgPool.query('DELETE FROM penc_messages WHERE sender_id=$1',[uid]); }catch(e){}\r\n"
"      try{ await _pgPool.query('DELETE FROM penc_statuses WHERE user_id=$1',[uid]); }catch(e){}\r\n"
"      try{ await _pgPool.query('DELETE FROM penc_status_comments WHERE user_id=$1',[uid]); }catch(e){}\r\n"
"      try{ await _pgPool.query('DELETE FROM penc_friendships WHERE requester=$1 OR recipient=$1',[uid]); }catch(e){}\r\n"
"      try{ await _pgPool.query('DELETE FROM penc_users WHERE id=$1',[uid]); }catch(e){}\r\n"
"    }\r\n"
"    if(r.rows.length) console.log('[purge] '+r.rows.length+' compte(s) purge(s) apres 30j');\r\n"
"  }catch(e){ console.error('_purgeTrash', e.message); }\r\n"
"}\r\n"
"setTimeout(_loadBlocked, 8000); setInterval(_loadBlocked, 60000);\r\n"
"setTimeout(_purgeTrash, 20000); setInterval(_purgeTrash, 6*3600*1000);\r\n"
)
s=R(s,"app.get('/api/penc/admin/overview', pencAuth, pencAdmin, async (req, res) => {",
      HELP+"app.get('/api/penc/admin/overview', pencAuth, pencAdmin, async (req, res) => {",
      "Helpers moderation")

# 5) Overview : exclure les comptes en corbeille
s=R(s,"    const all = users.map(enrich);\r\n    const withdrawals = all.filter(u => u.withdraw_request && u.withdraw_request.status === 'pending');",
      "    let _del=new Set(); try{ if(_pgPool){ const _dq=await _pgPool.query(\"SELECT id FROM penc_users WHERE deleted_at IS NOT NULL\"); _dq.rows.forEach(function(r){ _del.add(String(r.id)); }); } }catch(_e){}\r\n"
      "    const all = users.filter(function(u){ return !_del.has(String(u.id)); }).map(enrich);\r\n    const withdrawals = all.filter(u => u.withdraw_request && u.withdraw_request.status === 'pending');",
      "Overview exclut corbeille")

# 6) Suspend : effet instantane
s=R(s,"    await _pgPool.query('UPDATE penc_users SET suspended=$1 WHERE id=$2',[susp,req.params.userId]);\r\n    pencSecLog(susp?'user_suspended':'user_unsuspended', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null});",
      "    await _pgPool.query('UPDATE penc_users SET suspended=$1 WHERE id=$2',[susp,req.params.userId]);\r\n    if(susp){ await _forceLogout(req.params.userId,'suspended'); } else { _pencBlocked.delete(String(req.params.userId)); await _loadBlocked(); }\r\n    pencSecLog(susp?'user_suspended':'user_unsuspended', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null});",
      "Suspend instantane")

# 7) Nouvelle route block + restore + deleted (apres la route moderator)
MOD_ANCHOR=("app.post('/api/penc/admin/moderator/:userId', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    const mod=!!(req.body&&req.body.moderator);\r\n"
"    await _pgPool.query('UPDATE penc_users SET moderator=$1 WHERE id=$2',[mod,req.params.userId]);\r\n"
"    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});")
NEW_ROUTES=(MOD_ANCHOR+"\r\n"
"app.post('/api/penc/admin/block/:userId', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    const blk=!!(req.body&&req.body.block);\r\n"
"    await _pgPool.query('UPDATE penc_users SET blocked=$1 WHERE id=$2',[blk,req.params.userId]);\r\n"
"    if(blk){ await _forceLogout(req.params.userId,'blocked'); } else { _pencBlocked.delete(String(req.params.userId)); await _loadBlocked(); }\r\n"
"    try{ pencSecLog(blk?'user_blocked':'user_unblocked', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}\r\n"
"    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n"
"app.get('/api/penc/admin/deleted', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({deleted:[]});\r\n"
"    const r=await _pgPool.query(\"SELECT id,full_name,username,email,phone,avatar_url,deleted_at FROM penc_users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC\");\r\n"
"    res.json({deleted:r.rows.map(function(x){ return {id:x.id,full_name:x.full_name,username:x.username,email:x.email||'',phone:x.phone||'',avatar_url:x.avatar_url||null,deleted_at:x.deleted_at}; })}); }catch(e){ res.json({deleted:[]}); }\r\n"
"});\r\n"
"app.post('/api/penc/admin/user/:id/restore', pencAuth, pencAdmin, async (req,res)=>{\r\n"
"  try{ if(!_pgPool) return res.json({success:true});\r\n"
"    await _pgPool.query('UPDATE penc_users SET deleted_at=NULL, suspended=FALSE, blocked=FALSE WHERE id=$1',[req.params.id]);\r\n"
"    _pencBlocked.delete(String(req.params.id));\r\n"
"    try{ pencSecLog('user_restored', req, {user_id:req.params.id, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}\r\n"
"    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});")
s=R(s,MOD_ANCHOR,NEW_ROUTES,"Routes block/deleted/restore")

# 8) DELETE -> soft delete (corbeille)
OLD_DEL=("    if (_pgPool) {\r\n"
"      try { await _pgPool.query('DELETE FROM penc_messages WHERE sender_id=$1', [uid]); } catch (e) {}\r\n"
"      try { await _pgPool.query('DELETE FROM penc_statuses WHERE user_id=$1', [uid]); } catch (e) {}\r\n"
"      try { await _pgPool.query('DELETE FROM penc_status_comments WHERE user_id=$1', [uid]); } catch (e) {}\r\n"
"      try { await _pgPool.query('DELETE FROM penc_friendships WHERE requester=$1 OR recipient=$1', [uid]); } catch (e) {}\r\n"
"      try { await _pgPool.query('DELETE FROM penc_users WHERE id=$1', [uid]); } catch (e) {}\r\n"
"    }\r\n"
"    try { const users = await pencUsers(); const i = users.findIndex(x => String(x.id) === String(uid)); if (i >= 0) { users.splice(i, 1); await pencSaveUsers(users); } } catch (e) {}\r\n"
"    try { pencOnline.delete(uid); } catch (e) {}\r\n"
"    res.json({ success: true });")
NEW_DEL=("    if (_pgPool) { try { await _pgPool.query('UPDATE penc_users SET deleted_at=NOW(), suspended=TRUE WHERE id=$1', [uid]); } catch (e) {} }\r\n"
"    await _forceLogout(uid,'deleted');\r\n"
"    try{ pencSecLog('user_trashed', req, {user_id:uid, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}\r\n"
"    res.json({ success: true, trashed:true });")
s=R(s,OLD_DEL,NEW_DEL,"Soft-delete corbeille")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
