SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Verifier qu'on est propre
if 'SenSmsUser' in content:
    print("ATTENTION: SenSmsUser encore present")

# Trouver la ligne exacte du bcrypt require
m = re.search(r"const bcrypt\s*=\s*require\(['\"]bcrypt[^'\"]*['\"]\);?", content)
if m:
    print(f"bcrypt: {m.group()}")
    end_line = content.find('\n', m.end()) + 1
else:
    print("bcrypt not found - chercher autre ancre")
    # Utiliser la ligne avec client =
    m2 = re.search(r"const client\s*=\s*new MongoClient", content)
    if m2:
        end_line = content.find('\n', m2.end()) + 1
        print(f"MongoClient trouve a ligne {content[:end_line].count(chr(10))}")
    else:
        print("ERREUR: pas d ancre trouvee")
        exit(1)

# Routes auth avec MongoClient (pas mongoose)
ROUTES = """
// ══ CORS ══
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══ SEN-SMS AUTH ══
function senSmsAuth(req, res, next) {
  var token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Non authentifie' });
  try {
    var decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'pst-secret-2026');
    req.senSmsUser = decoded;
    next();
  } catch(e) { return res.status(401).json({ success: false, error: 'Token invalide' }); }
}

app.post('/api/sen-sms/register', async (req, res) => {
  try {
    var { email, password, nom, organisation, telephone } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email et mot de passe requis' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court' });
    const db = client.db('pst_telecom');
    const users = db.collection('sensms_users');
    var existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) return res.json({ success: false, error: 'Email deja utilise' });
    var hash = await bcrypt.hash(password, 10);
    var result = await users.insertOne({ email: email.toLowerCase(), password: hash, nom: nom||'', organisation: organisation||'', telephone: telephone||'', credits: 0, createdAt: new Date() });
    var token = require('jsonwebtoken').sign({ id: result.insertedId, email: email.toLowerCase(), nom: nom||'', organisation: organisation||'' }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: result.insertedId, email: email.toLowerCase(), nom: nom||'', organisation: organisation||'', credits: 0 } });
  } catch(e) { console.error('register:', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sen-sms/login', async (req, res) => {
  try {
    var { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email et mot de passe requis' });
    const db = client.db('pst_telecom');
    const users = db.collection('sensms_users');
    var user = await users.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var token = require('jsonwebtoken').sign({ id: user._id, email: user.email, nom: user.nom||'', organisation: user.organisation||'' }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, email: user.email, nom: user.nom||'', organisation: user.organisation||'', credits: user.credits||0 } });
  } catch(e) { console.error('login:', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var user = await db.collection('sensms_users').findOne({ _id: new ObjectId(req.senSmsUser.id) }, { projection: { password: 0 } });
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    res.json({ success: true, user: { ...user, id: user._id } });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/credits', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var user = await db.collection('sensms_users').findOne({ _id: new ObjectId(req.senSmsUser.id) }, { projection: { credits: 1 } });
    res.json({ success: true, credits: user ? (user.credits||0) : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/campaigns', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var campaigns = await db.collection('sensms_campaigns').find({ userId: req.senSmsUser.id }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, campaigns });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sen-sms/campaigns', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    await db.collection('sensms_campaigns').insertOne({ userId: req.senSmsUser.id, ...req.body, createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});
// ══ FIN SEN-SMS AUTH ══

"""

content = content[:end_line] + ROUTES + content[end_line:]

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Injection OK")
print("CORS:", 'Access-Control-Allow-Origin' in content)
print("/register:", '/api/sen-sms/register' in content)
print("MongoClient used:", 'client.db' in content)
