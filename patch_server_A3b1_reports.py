# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A3b-1 (signalements)
  - table penc_reports
  - POST /api/penc/report            (user signale un contenu)
  - GET  /api/penc/admin/reports     (admin liste les signalements en attente)
  - POST /api/penc/admin/reports/:id/resolve  (admin traite/rejette)
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A3b1_reports.py
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

print("Patch serveur A3b-1 — signalements")

# 1) Table penc_reports (dans l'init)
IDX = "      CREATE INDEX IF NOT EXISTS idx_psc_status ON penc_status_comments(status_id);"
TBL = IDX + "\r\n      CREATE TABLE IF NOT EXISTS penc_reports (id TEXT PRIMARY KEY, reporter_id TEXT, target_type TEXT, target_id TEXT, target_user_id TEXT, reason TEXT, content_snapshot TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());\r\n      CREATE INDEX IF NOT EXISTS idx_prep_status ON penc_reports(status);"
s = R(s, IDX, TBL, "Table penc_reports")

# 2) Routes
ROUTES = """app.post('/api/penc/report', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const { target_type, target_id, target_user_id, reason, content_snapshot } = req.body || {};
    const id = 'rep_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_reports(id, reporter_id, target_type, target_id, target_user_id, reason, content_snapshot, status, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())', [id, req.pencUser.userId, (target_type||'status'), (target_id||null), (target_user_id||null), (reason||'Non precise'), (content_snapshot||null), 'pending']);
    res.json({ success: true });
  } catch (e) { console.error('report:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/reports', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ reports: [] });
    const r = await _pgPool.query("SELECT rep.*, ru.full_name AS _rep_name, tu.full_name AS _tgt_name, tu.username AS _tgt_un FROM penc_reports rep LEFT JOIN penc_users ru ON ru.id=rep.reporter_id LEFT JOIN penc_users tu ON tu.id=rep.target_user_id WHERE rep.status='pending' ORDER BY rep.created_at DESC LIMIT 200");
    const reports = r.rows.map(function(x){ return { id:x.id, reporter:(x._rep_name||'Utilisateur'), target_type:x.target_type, target_id:x.target_id, target_user_id:x.target_user_id, target_owner:(x._tgt_name||x._tgt_un||'Inconnu'), reason:x.reason, content_snapshot:x.content_snapshot, created_at:x.created_at }; });
    res.json({ reports });
  } catch (e) { res.json({ reports: [] }); }
});
app.post('/api/penc/admin/reports/:id/resolve', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const st = (req.body && req.body.status === 'resolved') ? 'resolved' : 'dismissed';
    await _pgPool.query('UPDATE penc_reports SET status=$1 WHERE id=$2', [st, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "app.post('/api/penc/admin/official-status', pencAuth, pencAdmin, async (req, res) => {"
s = R(s, ANCHOR, ROUTES + ANCHOR, "Routes signalements")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A3b-1).")
print("Verifie : node --check server-at.js")
