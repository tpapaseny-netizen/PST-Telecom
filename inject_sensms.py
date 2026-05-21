import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier que les routes ne sont pas déjà présentes
if '/api/sensms/register' in content:
    print('Routes SenSMS déjà présentes - rien à faire')
    exit(0)

ROUTES = '''
// ════════════════════════════════════════════════
// SEN-SMS AUTH ROUTES
// ════════════════════════════════════════════════

const SenSmsUser = mongoose.model('SenSmsUser', new mongoose.Schema({
  name:      { type: String, required: true },
  phone:     { type: String, required: true, unique: true },
  email:     { type: String, default: '' },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}));

// REGISTER
app.post('/api/sensms/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });

    const existing = await SenSmsUser.findOne({ phone });
    if (existing) return res.json({ success: false, error: 'Ce numéro est déjà enregistré' });

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const user = await SenSmsUser.create({ name, phone, email: email || '', password: hash });

    res.json({ success: true, user: { id: user._id, name: user.name, phone: user.phone, email: user.email } });
  } catch (e) {
    console.error('SenSMS register error:', e);
    res.json({ success: false, error: 'Erreur serveur' });
  }
});

// LOGIN
app.post('/api/sensms/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });

    const user = await SenSmsUser.findOne({
      $or: [ { phone: identifier }, { email: identifier } ]
    });
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });

    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });

    res.json({ success: true, user: { id: user._id, name: user.name, phone: user.phone, email: user.email } });
  } catch (e) {
    console.error('SenSMS login error:', e);
    res.json({ success: false, error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════
// FIN SEN-SMS AUTH ROUTES
// ════════════════════════════════════════════════
'''

# Injecter avant le bloc DÉMARRAGE
marker = '// *** DÉMARRAGE'
if marker not in content:
    marker = 'connectDB().then'

if marker not in content:
    print('ERREUR: marqueur introuvable dans server-at.js')
    exit(1)

content = content.replace(marker, ROUTES + '\n' + marker, 1)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('OK - Routes SenSMS injectées')
