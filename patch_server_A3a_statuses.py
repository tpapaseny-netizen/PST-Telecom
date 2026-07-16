# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A3a (tous les statuts publies)
Route GET /api/penc/admin/statuses (pencAuth + pencAdmin) :
  renvoie jusqu'a 300 statuts recents avec proprietaire (nom), type, media, vues, likes.
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A3a_statuses.py
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

print("Patch serveur A3a — tous les statuts")

ROUTE = """app.get('/api/penc/admin/statuses', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ statuses: [] });
    const r = await _pgPool.query('SELECT s.*, u.full_name AS _fn, u.username AS _un FROM penc_statuses s LEFT JOIN penc_users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 300');
    const out = r.rows.map(function(row){ const x = pgStatusToObj(row); return { id:x.id, user_id:row.user_id, owner:(row._fn||row._un||'Inconnu'), type:x.type, media_url:x.media_url||null, text_content:x.text_content||null, bg_color:x.bg_color||null, caption:x.caption||null, created_at:x.created_at, views:Array.isArray(x.views)?x.views.length:0, likes:Array.isArray(x.reactions)?x.reactions.length:0 }; });
    res.json({ statuses: out });
  } catch (e) { res.json({ statuses: [] }); }
});
""".replace("\n", "\r\n")

ANCHOR = "app.delete('/api/penc/admin/statuses/:id', pencAuth, pencAdmin, async (req,res)=>{"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route GET /admin/statuses")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A3a).")
print("Verifie : node --check server-at.js")
