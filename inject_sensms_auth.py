with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

ANCHOR = '// \u2500\u2500\u2500 D\u00c9MARRAGE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'

# Verifier presence
if ANCHOR not in content:
    # Chercher avec regex
    import re
    m = re.search(r'//\s*[\u2500\u2014-]+\s*D[EÉ]MARRAGE\s*[\u2500\u2014-]+', content)
    if m:
        ANCHOR = m.group(0)
        print('Ancre trouvee:', repr(ANCHOR))
    else:
        print('ERREUR - Ancre introuvable')
        exit(1)

ROUTES = """
// ================================================
// SEN-SMS AUTH (MongoDB)
// ================================================

// POST /api/sensms/register
app.post('/api/sensms/register', async (req, res) => {
  try {
    var name = req.body.name; var phone = req.body.phone; var email = req.body.email || ''; var password = req.body.password;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });
    if (db) {
      var existing = await db.collection('sensms_users').findOne({ phone: phone });
      if (existing) return res.json({ success: false, error: 'Numero deja enregistre' });
    }
    var hash = crypto.createHash('sha256').update(password).digest('hex');
    var id = 'sms_' + Date.now();
    var user = { id: id, name: name, phone: phone, email: email, password: hash, credits: 0, sender_id: '', created_at: new Date() };
    if (db) await db.collection('sensms_users').insertOne(user);
    res.json({ success: true, user: { id: id, name: name, phone: phone, email: email, credits: 0 } });
  } catch (e) { console.error('[SenSMS register]', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
});

// POST /api/sensms/login
app.post('/api/sensms/login', async (req, res) => {
  try {
    var identifier = req.body.identifier; var password = req.body.password;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    var user = null;
    if (db) user = await db.collection('sensms_users').findOne({ $or: [{ phone: identifier }, { email: identifier }] });
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    var ok = (crypto.createHash('sha256').update(password).digest('hex') === user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, credits: user.credits || 0, sender_id: user.sender_id || '' } });
  } catch (e) { console.error('[SenSMS login]', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
});

// GET /api/sensms/profile/:id
app.get('/api/sensms/profile/:id', async (req, res) => {
  try {
    if (!db) return res.json({ success: false, error: 'DB indisponible' });
    var user = await db.collection('sensms_users').findOne({ id: req.params.id });
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    delete user.password; delete user._id;
    res.json({ success: true, user: user });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// POST /api/sensms/update-sender
app.post('/api/sensms/update-sender', async (req, res) => {
  try {
    var id = req.body.id; var sender_id = req.body.sender_id;
    if (!id || !sender_id) return res.json({ success: false, error: 'Donnees manquantes' });
    if (sender_id.length > 11) return res.json({ success: false, error: 'Sender ID max 11 caracteres' });
    if (db) await db.collection('sensms_users').updateOne({ id: id }, { $set: { sender_id: sender_id.toUpperCase() } });
    res.json({ success: true, sender_id: sender_id.toUpperCase() });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

// GET /api/sensms/users (admin)
app.get('/api/sensms/users', async (req, res) => {
  try {
    var token = req.headers['x-admin-token'] || req.query.token;
    if (token !== (process.env.ADMIN_PASSWORD || 'pst-admin-2026')) return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.json([]);
    var users = await db.collection('sensms_users').find({}).sort({ created_at: -1 }).toArray();
    res.json(users.map(function(u) { delete u.password; delete u._id; return u; }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// FIN SEN-SMS AUTH

"""

# CORS
OLD_CORS = 'app.use(cors());'
NEW_CORS = "app.use(cors({ origin: ['https://www.sensms.com', 'https://sensms.com', 'https://zama-sn.com', 'https://www.zama-sn.com', 'https://pst-telecom.vercel.app'], credentials: true }));"
if OLD_CORS in content:
    content = content.replace(OLD_CORS, NEW_CORS)
    print('OK - CORS corrige')

content = content.replace(ANCHOR, ROUTES + ANCHOR)
with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK - Routes SenSMS auth MongoDB injectees')
