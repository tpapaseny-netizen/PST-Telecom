# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A2e (message direct depuis l'admin)
Route POST /api/penc/admin/message/:userId  {content}
  - cree/retrouve la conversation entre l'admin et l'utilisateur
  - insere le message, l'emet en temps reel (message:new) + push
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A2e_dm.py
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

print("Patch serveur A2e — message direct admin")

ROUTE = """app.post('/api/penc/admin/message/:userId', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    const adminId = req.pencUser.userId;
    const target = req.params.userId;
    const content = ((req.body && req.body.content) || '').toString().trim();
    if (!content) return res.status(400).json({ error: 'Message vide' });
    if (String(target) === String(adminId)) return res.status(400).json({ error: 'Destinataire invalide' });
    const conv = await pgGetOrCreateConv(adminId, target);
    if (!conv) return res.status(500).json({ error: 'Conversation impossible' });
    const msg = {
      id: 'msg_' + Date.now() + Math.random().toString(36).slice(2),
      conversation_id: conv.id, sender_id: adminId, reply_to: null,
      type: 'text', content: content, media_url: null, media_duration: null,
      client_id: null, created_at: new Date().toISOString(), read_at: null
    };
    let sender = { id: adminId };
    try { const u = await pgFindUser('id', adminId); if (u) sender = pencStrip(u); } catch (_) {}
    const fullMsg = { ...msg, sender };
    try { io.to('penc:' + conv.id).emit('message:new', fullMsg); } catch (_) {}
    try { io.to('user:' + String(target)).emit('message:new', fullMsg); } catch (_) {}
    try { io.to('user:' + String(adminId)).emit('message:new', fullMsg); } catch (_) {}
    try { await pgSaveMessage({ id: msg.id, conversation_id: msg.conversation_id, sender_id: msg.sender_id, type: 'text', content: content, media_url: null, duration: null, reply_to: null, created_at: msg.created_at, client_id: null }); } catch (e) { console.error('admin dm persist:', e.message); }
    try { if (typeof webpush !== 'undefined' && webpush) { const ptitle = (sender && sender.full_name) ? sender.full_name : 'Nouveau message'; await sendPencPush(target, { title: ptitle, body: content.slice(0, 120), tag: 'penc-' + conv.id, url: '/messager?conv=' + conv.id, conv_id: conv.id }); } } catch (_pp) {}
    return res.json({ success: true, message: fullMsg, conversation_id: conv.id });
  } catch (e) { return res.status(500).json({ error: 'Erreur envoi' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "app.post('/api/penc/admin/moderator/:userId', pencAuth, pencAdmin, async (req,res)=>{"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route message direct admin")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A2e).")
print("Verifie : node --check server-at.js")
