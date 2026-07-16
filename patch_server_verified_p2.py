# -*- coding: utf-8 -*-
"""
PENC SERVER — Badge bleu (Phase 2 : verification par pieces)
  - table penc_verif_requests
  - POST /api/penc/verify/request          (user envoie sa piece)
  - GET  /api/penc/verify/status           (user : verified / pending)
  - GET  /api/penc/admin/verify-requests   (admin : liste en attente + pieces)
  - POST /api/penc/admin/verify-requests/:id/approve   (-> verified=true, type 'id')
  - POST /api/penc/admin/verify-requests/:id/reject
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_verified_p2.py
"""
import io, sys, os

FN = "server-at.js"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "rb") as f:
    s = f.read().decode("utf-8-sig")

print("Patch serveur — Badge bleu (Phase 2)")

# 1) Table
IDX = "      CREATE INDEX IF NOT EXISTS idx_prep_status ON penc_reports(status);"
TBL = IDX + "\r\n      CREATE TABLE IF NOT EXISTS penc_verif_requests (id TEXT PRIMARY KEY, user_id TEXT, doc_url TEXT, doc_url2 TEXT, type TEXT, note TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());\r\n      CREATE INDEX IF NOT EXISTS idx_pvr_status ON penc_verif_requests(status);"
s = R(s, IDX, TBL, "Table penc_verif_requests")

# 2) Routes
ROUTES = """app.post('/api/penc/verify/request', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const { doc_url, doc_url2, note, type } = req.body || {};
    if (!doc_url) return res.status(400).json({ error: 'Document requis' });
    const uid = req.pencUser.userId;
    await _pgPool.query("UPDATE penc_verif_requests SET status='cancelled' WHERE user_id=$1 AND status='pending'", [uid]);
    const id = 'vrq_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_verif_requests(id, user_id, doc_url, doc_url2, type, note, status, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id, uid, doc_url, (doc_url2||null), (type||'id'), (note||null), 'pending']);
    res.json({ success: true });
  } catch (e) { console.error('verify/request:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/verify/status', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ verified:false, pending:false });
    const uid = req.pencUser.userId;
    let verified = false;
    try { const u = await pgFindUser('id', uid); verified = !!(u && u.verified); } catch(e){}
    let pending = false;
    try { const r = await _pgPool.query("SELECT 1 FROM penc_verif_requests WHERE user_id=$1 AND status='pending' LIMIT 1",[uid]); pending = r.rows.length>0; } catch(e){}
    res.json({ verified, pending });
  } catch (e) { res.json({ verified:false, pending:false }); }
});
app.get('/api/penc/admin/verify-requests', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ requests: [] });
    const r = await _pgPool.query("SELECT vr.*, u.full_name AS _name, u.username AS _un, u.phone AS _phone, u.avatar_url AS _av, u.verified AS _verified FROM penc_verif_requests vr LEFT JOIN penc_users u ON u.id=vr.user_id WHERE vr.status='pending' ORDER BY vr.created_at DESC LIMIT 200");
    const requests = r.rows.map(function(x){ return { id:x.id, user_id:x.user_id, name:(x._name||x._un||'Utilisateur'), username:x._un||'', phone:x._phone||'', avatar_url:x._av||null, already_verified:!!x._verified, doc_url:x.doc_url, doc_url2:x.doc_url2, type:x.type, note:x.note, created_at:x.created_at }; });
    res.json({ requests });
  } catch (e) { res.json({ requests: [] }); }
});
app.post('/api/penc/admin/verify-requests/:id/approve', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const rq = await _pgPool.query('SELECT user_id FROM penc_verif_requests WHERE id=$1', [req.params.id]);
    if (!rq.rows.length) return res.status(404).json({ error: 'Introuvable' });
    const uid = rq.rows[0].user_id;
    await _pgPool.query("UPDATE penc_verif_requests SET status='approved' WHERE id=$1", [req.params.id]);
    await _pgPool.query("UPDATE penc_users SET verified=TRUE, verified_type='id', verified_at=NOW() WHERE id=$1", [uid]);
    try { emitToUsers(String(uid), 'penc:verified', { verified: true }); } catch(e){}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/verify-requests/:id/reject', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    await _pgPool.query("UPDATE penc_verif_requests SET status='rejected' WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "// ── Modération admin (Fonct. 5) ──"
s = R(s, ANCHOR, ROUTES + ANCHOR, "Routes verification P2")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (badge bleu P2).")
print("Verifie : node --check server-at.js")
