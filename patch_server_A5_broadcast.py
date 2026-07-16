# -*- coding: utf-8 -*-
"""
PENC SERVER — A5 (notification push a tous depuis l'admin)
  - POST /api/penc/admin/broadcast  {title, body, url}
    -> Web Push a TOUS les abonnes (penc_push) + io.emit('penc:broadcast') pour les connectes
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A5_broadcast.py
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

print("Patch serveur A5 — broadcast push")

ROUTES = """app.post('/api/penc/admin/broadcast', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { title, body, url } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Message requis' });
    const data = { title: (title||'Penc'), body: String(body), url: (url||'/messager') };
    try { io.emit('penc:broadcast', data); } catch(e){}
    let sent = 0, total = 0;
    if (webpush) {
      const payload = JSON.stringify({ title: data.title, body: data.body, tag: 'penc-broadcast', url: data.url });
      const subs = await pencPushSubs(); total = subs.length;
      const dead = [];
      for (const sb of subs) {
        try { await webpush.sendNotification(sb.subscription, payload); sent++; }
        catch (err) { if (err && (err.statusCode===404||err.statusCode===410) && sb.subscription) dead.push(sb.subscription.endpoint); }
      }
      if (dead.length) { try { const all = await pencPushSubs(); await pencSavePushSubs(all.filter(z => !(z.subscription && dead.includes(z.subscription.endpoint)))); } catch(e){} }
    }
    res.json({ success: true, sent, total });
  } catch (e) { console.error('broadcast:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "// ── Modération admin (Fonct. 5) ──"
s = R(s, ANCHOR, ROUTES + ANCHOR, "Route broadcast")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A5).")
print("Verifie : node --check server-at.js")
