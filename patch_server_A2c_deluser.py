# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A2c (supprimer un utilisateur)
Ajoute DELETE /api/penc/admin/user/:id (pencAuth + pencAdmin) :
  - refuse de supprimer un administrateur
  - supprime l'utilisateur + ses messages, statuts, commentaires, amities
  - retire aussi de la liste JSONBin et de pencOnline
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A2c_deluser.py
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

print("Patch serveur A2c — supprimer utilisateur")

ROUTE = """app.delete('/api/penc/admin/user/:id', pencAuth, pencAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    let target = null;
    try { if (_pgPool) { const r = await _pgPool.query('SELECT email FROM penc_users WHERE id=$1', [uid]); target = r.rows[0] || null; } } catch (e) {}
    if (target && PENC_ADMIN_EMAILS.includes(String(target.email || '').toLowerCase())) return res.status(400).json({ error: 'Impossible de supprimer un administrateur' });
    if (_pgPool) {
      try { await _pgPool.query('DELETE FROM penc_messages WHERE sender_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_statuses WHERE user_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_status_comments WHERE user_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_friendships WHERE requester=$1 OR recipient=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_users WHERE id=$1', [uid]); } catch (e) {}
    }
    try { const users = await pencUsers(); const i = users.findIndex(x => String(x.id) === String(uid)); if (i >= 0) { users.splice(i, 1); await pencSaveUsers(users); } } catch (e) {}
    try { pencOnline.delete(uid); } catch (e) {}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "app.post('/api/penc/admin/reward/clear', pencAuth, pencAdmin, async (req, res) => {"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route DELETE user inseree")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A2c).")
print("Verifie : node --check server-at.js")
