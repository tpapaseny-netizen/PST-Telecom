# -*- coding: utf-8 -*-
"""
PENC SERVER — Badge bleu (Phase 1)
  - colonnes verified / verified_type / verified_at sur penc_users
  - GET  /api/penc/verified                liste des IDs certifies (pour afficher le badge)
  - POST /api/penc/admin/verify/:userId    admin certifie / retire (gratuit, celebrites)
  - 'verified' ajoute a /admin/overview
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_verified_p1.py
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

print("Patch serveur — Badge bleu (Phase 1)")

# 1) Colonnes
ALT = "      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS moderator BOOLEAN DEFAULT FALSE;"
NEWALT = (ALT
  + "\r\n      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;"
  + "\r\n      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified_type TEXT;"
  + "\r\n      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;")
s = R(s, ALT, NEWALT, "Colonnes verified")

# 2) Overview : exposer verified
s = R(s,
  "suspended:!!(_modMap[String(u.id)]||{}).suspended };",
  "suspended:!!(_modMap[String(u.id)]||{}).suspended, verified:!!u.verified };",
  "verified dans overview")

# 3) Routes
ROUTES = """app.get('/api/penc/verified', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ ids: [] });
    const r = await _pgPool.query('SELECT id FROM penc_users WHERE verified=TRUE');
    res.json({ ids: r.rows.map(x => String(x.id)) });
  } catch (e) { res.json({ ids: [] }); }
});
app.post('/api/penc/admin/verify/:userId', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const v = !!(req.body && req.body.verified);
    const type = (req.body && req.body.type) || (v ? 'admin' : null);
    await _pgPool.query('UPDATE penc_users SET verified=$1, verified_type=$2, verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END WHERE id=$3', [v, type, req.params.userId]);
    try { emitToUsers(String(req.params.userId), 'penc:verified', { verified: v }); } catch(e){}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "// ── Modération admin (Fonct. 5) ──"
s = R(s, ANCHOR, ROUTES + ANCHOR, "Routes badge bleu")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (badge bleu P1).")
print("Verifie : node --check server-at.js")
