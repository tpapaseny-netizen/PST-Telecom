SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Verifier que tout est propre
if 'SenSmsUser' in content:
    print("ERREUR: SenSmsUser encore present - relance fix_all.py d'abord")
    exit(1)

# Trouver la ligne avec require mongoose
import re
m = re.search(r"const mongoose = require\(['\"]mongoose['\"]\);?", content)
if not m:
    m = re.search(r"mongoose = require\(['\"]mongoose['\"]\);?", content)

if not m:
    print("ERREUR: mongoose require non trouve")
    exit(1)

print(f"mongoose trouve: {repr(m.group())}")
end_of_line = content.find('\n', m.end()) + 1

# CORS + Routes a injecter juste apres mongoose
INJECT = """
// CORS
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══ SEN-SMS AUTH ROUTES ══
const SenSmsUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  nom: { type: String, default: '' },
  organisation: { type: String, default: '' },
  telephone: { type: String, default: '' },
  credits: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const SenSmsUser = mongoose.models.SenSmsUser || mongoose.model('SenSmsUser', SenSmsUserSchema);

const SenSmsCampaignSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'SenSmsUser' },
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
    var decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'pst-secret-2026');
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
    var hash = await bcrypt.hash(password, 10);
    var user = new SenSmsUser({ email: email.toLowerCase(), password: hash, nom: nom||'', organisation: organisation||'', telephone: telephone||'' });
    await user.save();
    var token = require('jsonwebtoken').sign({ id: user._id, email: user.email, nom: user.nom, organisation: user.organisation }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, email: user.email, nom: user.nom, organisation: user.organisation, credits: 0 } });
  } catch(e) { console.error('register:', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sen-sms/login', async (req, res) => {
  try {
    var { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, error: 'Email et mot de passe requis' });
    var user = await SenSmsUser.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Email ou mot de passe incorrect' });
    var token = require('jsonwebtoken').sign({ id: user._id, email: user.email, nom: user.nom, organisation: user.organisation }, process.env.JWT_SECRET || 'pst-secret-2026', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: user._id, email: user.email, nom: user.nom, organisation: user.organisation, credits: user.credits } });
  } catch(e) { console.error('login:', e.message); res.json({ success: false, error: 'Erreur serveur' }); }
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
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.get('/api/sen-sms/credits', senSmsAuth, async (req, res) => {
  try {
    var user = await SenSmsUser.findById(req.senSmsUser.id).select('credits');
    res.json({ success: true, credits: user ? user.credits : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});
// ══ FIN SEN-SMS AUTH ROUTES ══

"""

content = content[:end_of_line] + INJECT + content[end_of_line:]

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Injection OK apres mongoose ligne", content[:end_of_line].count('\n'))
print("SenSmsUser present:", 'SenSmsUser' in content)
print("CORS present:", 'Access-Control-Allow-Origin' in content)
print("/register present:", '/api/sen-sms/register' in content)
