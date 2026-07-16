# -*- coding: utf-8 -*-
"""PENC SERVER — B6 (traçage global des erreurs client -> logs serveur)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur B6 — client-log")

ROUTE="""app.post('/api/penc/client-log', async (req, res) => {
  try {
    if (!_pgPool) return res.json({ ok: true });
    let uid = null;
    try { const a=(req.headers.authorization||'').replace('Bearer ',''); if(a){ const dec=jwt_penc.verify(a, PENC_SECRET); uid=dec&&dec.userId; } } catch(e){}
    const { message, detail } = req.body || {};
    if (!message) return res.json({ ok: true });
    const id='cer_'+Date.now()+Math.random().toString(36).slice(2);
    const ua=String(req.headers['user-agent']||'').slice(0,300);
    const ip=((req.headers['x-forwarded-for']||'').split(',')[0].trim())||req.ip||'';
    const det=String(message).slice(0,200)+(detail?(' | '+String(detail).slice(0,300)):'');
    await _pgPool.query('INSERT INTO penc_security_logs(id,type,user_id,identifier,ip,user_agent,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id,'client_error',uid,null,ip,ua,det]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: true }); }
});
""".replace("\n","\r\n")

ANCHOR="// ── Modération admin (Fonct. 5) ──"
s=R(s,ANCHOR,ROUTE+ANCHOR,"Route /client-log")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour (B6).")
