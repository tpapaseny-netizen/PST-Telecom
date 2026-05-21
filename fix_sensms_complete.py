with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Trouver toutes les routes sensms
route_matches = list(re.finditer(r"(?:// (?:POST|GET) /api/sensms|app\.(?:post|get)\('/api/sensms)", content))
if not route_matches:
    print("Aucune route sensms trouvée"); exit()

first_route_pos = route_matches[0].start()
last_route_pos = route_matches[-1].start()

# Fin du dernier bloc
end_pos = content.rfind('});\n', last_route_pos, last_route_pos + 3000) + 4
print(f"Début: ligne {content[:first_route_pos].count(chr(10))+1}, Fin: ligne {content[:end_pos].count(chr(10))+1}")

# Inclure le schema SensmsUser juste avant si présent
schema_pos = content.rfind('var SensmsUser', max(0, first_route_pos - 500), first_route_pos)
if schema_pos > 0:
    first_route_pos = content.rfind('\n', 0, schema_pos) + 1

new_block = """// === SENSMS ROUTES ===
var _sensmsSchema = new (require('mongoose').Schema)({
  phone: String, email: String, name: String, password: String,
  pack: { type: String, default: 'Starter' },
  credits: { type: Number, default: 0 },
  sender_id: { type: String, default: 'SenSMS' },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});
var SensmsUser = require('mongoose').models.SensmsUser || require('mongoose').model('SensmsUser', _sensmsSchema);

// POST /api/sensms/register
app.post('/api/sensms/register', async (req, res) => {
  try {
    var name = req.body.name; var phone = req.body.phone; var email = req.body.email || ''; var password = req.body.password;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });
    if (phone.match(/^[0-9]{9}$/)) phone = '+221' + phone;
    var existing = await SensmsUser.findOne({ $or: [{ phone: phone }, { email: email && email.length > 0 ? email : null }] });
    if (existing) return res.json({ success: false, error: 'Compte deja existant avec ce numero ou email' });
    var bcrypt = require('bcryptjs');
    var hash = await bcrypt.hash(password, 10);
    var newUser = new SensmsUser({ name: name, phone: phone, email: email, password: hash });
    await newUser.save();
    res.json({ success: true, user: { id: newUser._id, name: newUser.name, phone: newUser.phone, email: newUser.email, pack: newUser.pack, credits: newUser.credits, sender_id: newUser.sender_id } });
  } catch(e) { console.error('SENSMS register error:', e); res.json({ success: false, error: e.message }); }
});

// POST /api/sensms/login
app.post('/api/sensms/login', async (req, res) => {
  try {
    var identifier = req.body.identifier || req.body.phone || req.body.email || '';
    var password = req.body.password;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    if (identifier.match(/^[0-9]{9}$/)) identifier = '+221' + identifier;
    var user = await SensmsUser.findOne({ $or: [{ phone: identifier }, { email: identifier }] });
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    var bcrypt = require('bcryptjs');
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user._id, phone: user.phone, email: user.email, name: user.name, pack: user.pack || 'Starter', credits: user.credits || 0, sender_id: user.sender_id || 'SenSMS' } });
  } catch(e) { console.error('SENSMS login error:', e); res.json({ success: false, error: e.message }); }
});

// GET /api/sensms/profile/:id
app.get('/api/sensms/profile/:id', async (req, res) => {
  try {
    var user = await SensmsUser.findById(req.params.id).lean();
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    delete user.password;
    res.json({ success: true, user: user });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// POST /api/sensms/update-sender
app.post('/api/sensms/update-sender', async (req, res) => {
  try {
    var id = req.body.id; var sender_id = req.body.sender_id;
    if (!id || !sender_id) return res.json({ success: false, error: 'Donnees manquantes' });
    if (sender_id.length > 11) return res.json({ success: false, error: 'Sender ID max 11 caracteres' });
    await SensmsUser.updateOne({ _id: id }, { $set: { sender_id: sender_id.toUpperCase() } });
    res.json({ success: true, sender_id: sender_id.toUpperCase() });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// GET /api/sensms/users (admin)
app.get('/api/sensms/users', async (req, res) => {
  try {
    var users = await SensmsUser.find({}).sort({ created_at: -1 }).lean();
    users.forEach(function(u) { delete u.password; });
    res.json({ success: true, users: users });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

"""

content = content[:first_route_pos] + new_block + content[end_pos:]

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

routes = re.findall(r"app\.(post|get)\('/api/sensms/[^']+'\)", content)
print(f"Routes sensms: {len(routes)}")
for r in routes:
    print(f"  {r}")
print("Done")
