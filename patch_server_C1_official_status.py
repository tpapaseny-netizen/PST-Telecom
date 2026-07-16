# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch C1 (statut officiel Penc)
Route POST /api/penc/admin/official-status (pencAuth + pencAdmin) :
  publie un statut au nom de 'penc_official', longue duree (30 jours).
Comme le fil /statuses renvoie tous les statuts, il apparait chez tout le monde.
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_C1_official_status.py
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

print("Patch serveur C1 — statut officiel Penc")

ROUTE = """app.post('/api/penc/admin/official-status', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { type, media_url, text_content, bg_color, caption, duration } = req.body || {};
    const status = {
      id: 'st_' + Date.now() + Math.random().toString(36).slice(2),
      user_id: 'penc_official', type: type || 'text',
      media_url: media_url || null, text_content: text_content || null,
      bg_color: bg_color || '#0E8C7C', caption: caption || null,
      duration: (typeof duration === 'number' && duration > 0 && duration <= 60) ? Math.round(duration) : (type === 'video' ? 0 : 10),
      reactions: [], views: [], view_ips: [],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
    };
    if (_pgPool) { await pgSaveStatus(status); }
    else { const statuses = await pencStatuses(); statuses.push(status); await pencSaveStatuses(statuses); }
    res.json({ status, success: true });
  } catch (e) { console.error('official-status:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "app.get('/api/penc/admin/statuses', pencAuth, pencAdmin, async (req, res) => {"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route statut officiel")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (C1).")
print("Verifie : node --check server-at.js")
