# -*- coding: utf-8 -*-
"""PENC SERVER — A7 (logs & securite)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur A7 — logs & securite")

# 1) Table
IDX="      CREATE INDEX IF NOT EXISTS idx_pvr_status ON penc_verif_requests(status);"
TBL=IDX+"\r\n      CREATE TABLE IF NOT EXISTS penc_security_logs (id TEXT PRIMARY KEY, type TEXT, user_id TEXT, identifier TEXT, ip TEXT, user_agent TEXT, detail TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\r\n      CREATE INDEX IF NOT EXISTS idx_psl_created ON penc_security_logs(created_at);"
s=R(s,IDX,TBL,"Table penc_security_logs")

# 2) Helper pencSecLog (avant sendPencPush)
SP="async function sendPencPush(userId, payload) {"
HELPER=("""async function pencSecLog(type, req, extra) {
  try {
    if (!_pgPool) return;
    extra = extra || {};
    const ip = (req && req.headers && (req.headers['x-forwarded-for']||'').split(',')[0].trim()) || (req && req.ip) || '';
    const ua = (req && req.headers && req.headers['user-agent']) || '';
    const id = 'sec_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_security_logs(id, type, user_id, identifier, ip, user_agent, detail, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id, type, (extra.user_id||null), (extra.identifier||null), ip, String(ua).slice(0,300), (extra.detail||null)]);
  } catch(e) {}
}
""").replace("\n","\r\n")+SP
s=R(s,SP,HELPER,"Helper pencSecLog")

# 3) Login : compte introuvable
NF=r"""    if (!user) return res.status(400).json({error:'Compte introuvable. Inscris-toi d\'abord.'});"""
NF2=r"""    if (!user) { pencSecLog('login_failed', req, {identifier:id, detail:'compte introuvable'}); return res.status(400).json({error:'Compte introuvable. Inscris-toi d\'abord.'}); }"""
s=R(s,NF,NF2,"Log echec: compte introuvable")

# 4) Login : mot de passe incorrect
PW="    if (!pwdOk) return res.status(400).json({error:'Mot de passe incorrect.'});"
PW2="    if (!pwdOk) { pencSecLog('login_failed', req, {identifier:id, user_id:(user&&user.id)||null, detail:'mot de passe incorrect'}); return res.status(400).json({error:'Mot de passe incorrect.'}); }"
s=R(s,PW,PW2,"Log echec: mot de passe")

# 5) Login : succes
OK="    const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });"
OK2="    pencSecLog('login_ok', req, {identifier:id, user_id:user.id});\r\n"+OK
s=R(s,OK,OK2,"Log succes connexion")

# 6) Suspend : log moderation
SUS="    await _pgPool.query('UPDATE penc_users SET suspended=$1 WHERE id=$2',[susp,req.params.userId]);"
SUS2=SUS+"\r\n    pencSecLog(susp?'user_suspended':'user_unsuspended', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null});"
s=R(s,SUS,SUS2,"Log suspension")

# 7) Route securite
ROUTE="""app.get('/api/penc/admin/security', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] });
    let logs=[], failed_24h=0, suspended=[], moderators=[];
    try { const r = await _pgPool.query("SELECT * FROM penc_security_logs ORDER BY created_at DESC LIMIT 100"); logs = r.rows; } catch(e){}
    try { const f = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='login_failed' AND created_at >= NOW() - INTERVAL '24 hours'"); failed_24h = f.rows[0].c; } catch(e){}
    try { const sq = await _pgPool.query("SELECT id, full_name, username, phone FROM penc_users WHERE suspended=TRUE LIMIT 100"); suspended = sq.rows; } catch(e){}
    try { const m = await _pgPool.query("SELECT id, full_name, username FROM penc_users WHERE moderator=TRUE LIMIT 100"); moderators = m.rows; } catch(e){}
    res.json({ logs, failed_24h, suspended, moderators });
  } catch (e) { res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] }); }
});
""".replace("\n","\r\n")
ANCHOR="// ── Modération admin (Fonct. 5) ──"
s=R(s,ANCHOR,ROUTE+ANCHOR,"Route /admin/security")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour (A7).")
