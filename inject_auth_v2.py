import re, os

SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Verifier si deja injecte
if 'SenSmsUser' in content:
    print("Deja injecte")
    exit(0)

# Trouver l'ancre - essayer plusieurs options
anchors = [
    'connectDB().then(',
    'app.listen(',
    '// DEMARRAGE',
    '// ── DÉMARRAGE',
]

anchor = None
for a in anchors:
    if a in content:
        anchor = a
        print(f"Ancre trouvee: '{a}'")
        break

if not anchor:
    # Injecter a la fin du fichier avant la derniere ligne
    print("Aucune ancre trouvee - injection a la fin")
    anchor = content[-200:].strip().split('\n')[-1]

ROUTES = '''
// ══ SEN-SMS AUTH ROUTES ══
const mongoose_sms = require('mongoose');

const SenSmsUserSchema = new mongoose_sms.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  nom: { type: String, default: '' },
  organisation: { type: String, default: '' },
  telephone: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const SenSmsUser = mongoose.models.SenSmsUser || mongoose.model('SenSmsUser', SenSmsUserSchema);

const SenSmsCampaignSchema = new mongoose_sms.Schema({
  userId: { type: mongoose_sms.Schema.Types.ObjectId, ref: 'SenSmsUser' },
  organisation: String, sender: String, message: String,
  contacts: Number, smsTotal: Number, cout: String, pack: String,
  statut: { type: String, default: 'envoyee' },
  createdAt: { type: Date, default: Date.now }
});
const SenSmsCampaign = mongoose.models.SenSmsCampaign || mongoose.model('SenSmsCampaign', SenSmsCampaignSchema);

function senSmsAuth(req, res, next) {
  var token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Non authentifie' });
  try {
    var jwt = require('jsonwebtoken');
    var decoded = jwt.verify(token, process.env.JWT_SECRET || 'pst-secret-2026');
    req.senSmsUser = decoded;
    next();
  } catch(e) {
    return res.status(401).json({ success: false, error: 'Token invalide' });
  }
}

app.post('/api/sen-sms/register', async (req, res) => {
  try {
    var { email, password, nom, organisation, telephone } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email et mot de passe requis' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court' });
    var existing = await SenSmsUser.findOne({ email: email.toLowerCase() });
    if (existing) return res.json({ success: false, error: 'Email deja utilise' });
    var bcryptjs = require('bcryptjs');
    var hash = await bcryptjs.hash(password, 10);
    var user = new SenSmsUser({ email: email.toLowerCase(), password: hash, nom: nom||'', organisation: organisation||'', telephone: telephone||'' });
    await user.save();
    var jwt = require('jsonwebtoken');
    var token = jwt.sign({ id: user._id, email: user.email, nom: user.nom, organisation: user.organisation }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, email: user.email, nom: user.nom, organisation: user.organisation, credits: 0 } });
  } catch(e) { console.error('register error:', e); res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sen-sms/login', async (req, res) => {
  try {
    var { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email et mot de passe requis' });
    var user = await SenSmsUser.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var bcryptjs = require('bcryptjs');
    var ok = await bcryptjs.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var jwt = require('jsonwebtoken');
    var token = jwt.sign({ id: user._id, email: user.email, nom: user.nom, organisation: user.organisation }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, email: user.email, nom: user.nom, organisation: user.organisation, credits: user.credits } });
  } catch(e) { console.error('login error:', e); res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    var user = await SenSmsUser.findById(req.senSmsUser.id).select('-password');
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    res.json({ success: true, user });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/campaigns', senSmsAuth, async (req, res) => {
  try {
    var campaigns = await SenSmsCampaign.find({ userId: req.senSmsUser.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, campaigns });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sen-sms/campaigns', senSmsAuth, async (req, res) => {
  try {
    var c = new SenSmsCampaign({ userId: req.senSmsUser.id, ...req.body });
    await c.save();
    res.json({ success: true, campaign: c });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/credits', senSmsAuth, async (req, res) => {
  try {
    var user = await SenSmsUser.findById(req.senSmsUser.id).select('credits');
    res.json({ success: true, credits: user ? user.credits : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

// ══ FIN SEN-SMS AUTH ROUTES ══

'''

content = content.replace(anchor, ROUTES + anchor, 1)

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Routes injectees avec succes!")
print("Verification:")
if 'SenSmsUser' in content:
    print("  - SenSmsUser: OK")
if '/api/sen-sms/register' in content:
    print("  - /register: OK")
if '/api/sen-sms/login' in content:
    print("  - /login: OK")
