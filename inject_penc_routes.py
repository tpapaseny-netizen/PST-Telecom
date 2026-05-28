
penc_routes = """
// ════════════════════════════════════════════════════════════
// ─── PENC MESSAGING APP — ROUTES BACKEND ────────────────────
// ════════════════════════════════════════════════════════════

const jwt_penc = require('jsonwebtoken');
const bcrypt_penc = require('bcryptjs');
const PENC_SECRET = process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3';

// ── Middleware auth Penc ──────────────────────────────────────
function pencAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.pencUser = jwt_penc.verify(h.slice(7), PENC_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

// ── Collections MongoDB ───────────────────────────────────────
const pencUsersCol   = () => db ? db.collection('penc_users')   : null;
const pencConvsCol   = () => db ? db.collection('penc_convs')   : null;
const pencMsgsCol    = () => db ? db.collection('penc_msgs')    : null;
const pencStatusCol  = () => db ? db.collection('penc_status')  : null;

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

// POST /api/penc/auth/register
app.post('/api/penc/auth/register', async (req, res) => {
  try {
    const { full_name, username, phone, email, password } = req.body;
    if (!full_name || !username || !phone || !password)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe min. 6 caractères' });

    const col = pencUsersCol();
    if (!col) {
      // Mode mémoire simple
      const user = { id: 'u_' + Date.now(), full_name, username, phone, email, avatar_url: null, bio: '', is_online: true, created_at: new Date() };
      const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });
      return res.json({ user, token: tok });
    }

    // Vérif numéro unique
    const existing = await col.findOne({ phone });
    if (existing) return res.status(400).json({ error: 'Ce numéro est déjà associé à un compte. Connecte-toi.' });

    const usernameExist = await col.findOne({ username });
    if (usernameExist) return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });

    const hashed = await bcrypt_penc.hash(password, 10);
    const user = {
      id: 'u_' + Date.now() + Math.random().toString(36).slice(2),
      full_name, username, phone,
      email: email || null,
      password: hashed,
      avatar_url: null, bio: '',
      is_online: true, last_seen: new Date(),
      fcm_token: null, created_at: new Date()
    };
    await col.insertOne(user);
    const { password: _, ...safeUser } = user;
    const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });
    res.json({ user: safeUser, token: tok });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/auth/login
app.post('/api/penc/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

    const col = pencUsersCol();
    if (!col) {
      const user = { id: 'u_demo', full_name: 'Utilisateur Penc', username: identifier, phone: identifier, avatar_url: null };
      const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });
      return res.json({ user, token: tok });
    }

    const user = await col.findOne({
      $or: [{ phone: identifier }, { email: identifier }, { username: identifier }]
    });
    if (!user) return res.status(400).json({ error: 'Compte introuvable' });

    const ok = await bcrypt_penc.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Mot de passe incorrect' });

    await col.updateOne({ id: user.id }, { $set: { is_online: true, last_seen: new Date() } });
    const { password: _, ...safeUser } = user;
    const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });
    res.json({ user: safeUser, token: tok });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/penc/auth/me
app.get('/api/penc/auth/me', pencAuth, async (req, res) => {
  try {
    const col = pencUsersCol();
    if (!col) return res.json({ user: { id: req.pencUser.userId } });
    const user = await col.findOne({ id: req.pencUser.userId });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/penc/auth/profile
app.put('/api/penc/auth/profile', pencAuth, async (req, res) => {
  try {
    const { full_name, bio, avatar_url } = req.body;
    const col = pencUsersCol();
    if (!col) return res.json({ success: true });
    await col.updateOne({ id: req.pencUser.userId }, { $set: { full_name, bio, avatar_url, updated_at: new Date() } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// CONVERSATIONS
// ════════════════════════════════════════════════════════════

// GET /api/penc/conversations
app.get('/api/penc/conversations', pencAuth, async (req, res) => {
  try {
    const col = pencConvsCol(), usersCol = pencUsersCol(), msgsCol = pencMsgsCol();
    if (!col) return res.json({ conversations: [] });

    const convs = await col.find({ members: req.pencUser.userId }).toArray();
    const enriched = await Promise.all(convs.map(async (conv) => {
      const otherId = conv.members.find(m => m !== req.pencUser.userId);
      let otherUser = null;
      if (otherId && usersCol) {
        otherUser = await usersCol.findOne({ id: otherId });
      }
      let lastMsg = null;
      if (msgsCol) {
        lastMsg = await msgsCol.findOne({ conversation_id: conv.id }, { sort: { created_at: -1 } });
      }
      return {
        id: conv.id,
        name: otherUser?.full_name || conv.name || 'Conversation',
        avatar_url: otherUser?.avatar_url || null,
        other_user_id: otherId,
        last_message: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content?.slice(0,50) : '📎 Média') : null,
        unread_count: conv.unread?.[req.pencUser.userId] || 0,
        updated_at: conv.updated_at || conv.created_at,
        type: conv.type || 'direct'
      };
    }));
    enriched.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
    res.json({ conversations: enriched });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/conversations/direct
app.post('/api/penc/conversations/direct', pencAuth, async (req, res) => {
  try {
    const { target_user_id } = req.body;
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id requis' });
    const col = pencConvsCol();
    if (!col) {
      const conv = { id: 'conv_' + Date.now(), members: [req.pencUser.userId, target_user_id], type: 'direct', created_at: new Date(), updated_at: new Date() };
      return res.json({ conversation: conv });
    }
    // Chercher conv existante
    let conv = await col.findOne({ type: 'direct', members: { $all: [req.pencUser.userId, target_user_id] } });
    if (!conv) {
      conv = { id: 'conv_' + Date.now() + Math.random().toString(36).slice(2), members: [req.pencUser.userId, target_user_id], type: 'direct', unread: {}, created_at: new Date(), updated_at: new Date() };
      await col.insertOne(conv);
    }
    res.json({ conversation: conv });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/penc/conversations/:id/messages
app.get('/api/penc/conversations/:id/messages', pencAuth, async (req, res) => {
  try {
    const col = pencMsgsCol(), usersCol = pencUsersCol();
    if (!col) return res.json({ messages: [] });
    const msgs = await col.find({ conversation_id: req.params.id }).sort({ created_at: 1 }).limit(100).toArray();
    const enriched = await Promise.all(msgs.map(async m => {
      let sender = null;
      if (usersCol) { const u = await usersCol.findOne({ id: m.sender_id }); if (u) { const { password: _, ...safe } = u; sender = safe; } }
      return { ...m, sender };
    }));
    res.json({ messages: enriched });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// CONTACTS / SEARCH
// ════════════════════════════════════════════════════════════

// GET /api/penc/contacts/search?q=
app.get('/api/penc/contacts/search', pencAuth, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json({ users: [] });
    const col = pencUsersCol();
    if (!col) return res.json({ users: [] });
    const regex = new RegExp(q, 'i');
    const users = await col.find({
      id: { $ne: req.pencUser.userId },
      $or: [{ full_name: regex }, { username: regex }, { phone: regex }, { email: regex }]
    }).limit(20).toArray();
    const safe = users.map(u => { const { password: _, ...s } = u; return s; });
    res.json({ users: safe });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/penc/contacts
app.get('/api/penc/contacts', pencAuth, async (req, res) => {
  try {
    const col = pencUsersCol();
    if (!col) return res.json({ contacts: [] });
    const users = await col.find({ id: { $ne: req.pencUser.userId } }).limit(50).toArray();
    const safe = users.map(u => { const { password: _, ...s } = u; return s; });
    res.json({ contacts: safe });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// STATUSES
// ════════════════════════════════════════════════════════════

// GET /api/penc/statuses
app.get('/api/penc/statuses', pencAuth, async (req, res) => {
  try {
    const col = pencStatusCol(), usersCol = pencUsersCol();
    if (!col) return res.json({ statuses: [] });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const statuses = await col.find({ created_at: { $gte: cutoff }, user_id: { $ne: req.pencUser.userId } }).sort({ created_at: -1 }).toArray();
    const enriched = await Promise.all(statuses.map(async s => {
      let user = null;
      if (usersCol) { const u = await usersCol.findOne({ id: s.user_id }); if (u) { const { password: _, ...safe } = u; user = safe; } }
      return { ...s, user, viewed: (s.views || []).includes(req.pencUser.userId) };
    }));
    res.json({ statuses: enriched });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/statuses
app.post('/api/penc/statuses', pencAuth, async (req, res) => {
  try {
    const { type, media_url, text_content, bg_color } = req.body;
    const col = pencStatusCol();
    if (!col) return res.json({ success: true });
    const status = { id: 'st_' + Date.now(), user_id: req.pencUser.userId, type, media_url: media_url || null, text_content: text_content || null, bg_color: bg_color || '#050D18', views: [], created_at: new Date(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    await col.insertOne(status);
    res.json({ status, success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/statuses/:id/view
app.post('/api/penc/statuses/:id/view', pencAuth, async (req, res) => {
  try {
    const col = pencStatusCol();
    if (!col) return res.json({ success: true });
    await col.updateOne({ id: req.params.id }, { $addToSet: { views: req.pencUser.userId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// SOCKET.IO — PENC TEMPS RÉEL
// ════════════════════════════════════════════════════════════

const pencOnline = new Map();

io.on('connection', async (socket) => {
  // Vérifier token Penc
  const tok = socket.handshake.auth?.token;
  if (!tok) return;
  let pencUserId;
  try { pencUserId = jwt_penc.verify(tok, PENC_SECRET).userId; }
  catch { return; }

  pencOnline.set(pencUserId, socket.id);
  socket.pencUserId = pencUserId;

  // Rejoindre ses conversations
  const col = pencConvsCol();
  if (col) {
    const convs = await col.find({ members: pencUserId }).toArray();
    convs.forEach(c => socket.join('penc:' + c.id));
  }
  io.emit('user:online', { userId: pencUserId, isOnline: true });

  // Envoyer message
  socket.on('message:send', async (data, cb) => {
    const { conversation_id, type, content, media_url, media_duration, poll_question, poll_options, poll_duration, radio_name, radio_url, money_amount, money_op } = data;
    try {
      const msgsCol = pencMsgsCol();
      const usersCol = pencUsersCol();
      const convCol = pencConvsCol();
      const msg = {
        id: 'msg_' + Date.now() + Math.random().toString(36).slice(2),
        conversation_id, sender_id: pencUserId,
        type: type || 'text', content: content || null,
        media_url: media_url || null, media_duration: media_duration || null,
        poll_question: poll_question || null, poll_options: poll_options || null,
        poll_duration: poll_duration || null, poll_votes: 0, poll_results: poll_options ? poll_options.map(() => 0) : null,
        radio_name: radio_name || null, radio_url: radio_url || null,
        money_amount: money_amount || null, money_op: money_op || null,
        created_at: new Date(), read_at: null
      };
      if (msgsCol) await msgsCol.insertOne(msg);
      if (convCol) await convCol.updateOne({ id: conversation_id }, { $set: { updated_at: new Date() } });

      let sender = { id: pencUserId };
      if (usersCol) { const u = await usersCol.findOne({ id: pencUserId }); if (u) { const { password: _, ...s } = u; sender = s; } }

      const fullMsg = { ...msg, sender };
      io.to('penc:' + conversation_id).emit('message:new', fullMsg);
      if (cb) cb({ success: true, message: fullMsg });
    } catch (e) { console.error(e); if (cb) cb({ error: 'Erreur envoi' }); }
  });

  socket.on('typing:start', ({ conversation_id }) => {
    socket.to('penc:' + conversation_id).emit('typing:start', { userId: pencUserId, conversation_id });
  });
  socket.on('typing:stop', ({ conversation_id }) => {
    socket.to('penc:' + conversation_id).emit('typing:stop', { userId: pencUserId, conversation_id });
  });
  socket.on('message:read', async ({ conversation_id }) => {
    const col = pencConvsCol();
    if (col) await col.updateOne({ id: conversation_id }, { $set: { [`unread.${pencUserId}`]: 0 } });
    socket.to('penc:' + conversation_id).emit('message:read', { userId: pencUserId, conversation_id });
  });

  socket.on('disconnect', async () => {
    pencOnline.delete(pencUserId);
    const usersCol = pencUsersCol();
    if (usersCol) await usersCol.updateOne({ id: pencUserId }, { $set: { is_online: false, last_seen: new Date() } });
    io.emit('user:online', { userId: pencUserId, isOnline: false });
  });
});

"""

content = open('server-at.js', 'r', encoding='utf-8').read()

# Eviter double injection
if '/api/penc/auth/register' in content:
    print('Routes Penc deja presentes — rien a faire')
else:
    marker = 'app.listen(PORT'
    if marker in content:
        content = content.replace(marker, penc_routes + '\n' + marker, 1)
        open('server-at.js', 'w', encoding='utf-8').write(content)
        print('OK Routes Penc injectees avec succes !')
    else:
        print('ERREUR marqueur app.listen non trouve')
