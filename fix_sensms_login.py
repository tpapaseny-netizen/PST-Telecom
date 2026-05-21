import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Supprimer les deux versions existantes de la route sensms/login
# On cherche le pattern depuis app.post('/api/sensms/login' jusqu'au }); suivant (bloc complet)
pattern = r"// POST /api/sensms/login\n?app\.post\('/api/sensms/login'[\s\S]*?\}\);\n?"
content = re.sub(pattern, '', content)

# Aussi supprimer sans le commentaire
pattern2 = r"app\.post\('/api/sensms/login',\s*async\s*(function\s*)?\(req,\s*res\)\s*\{[\s\S]*?\}\);\n?"
content = re.sub(pattern2, '', content)

# Nouvelle route unique propre
new_route = """// POST /api/sensms/login
app.post('/api/sensms/login', async (req, res) => {
  try {
    var identifier = req.body.identifier || req.body.phone || req.body.email || '';
    var password = req.body.password;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    if (identifier.match(/^[0-9]{9}$/)) identifier = '+221' + identifier;
    var user = null;
    if (db) {
      var SensmsUser = require('mongoose').model('SensmsUser');
      user = await SensmsUser.findOne({ $or: [{ phone: identifier }, { email: identifier }] });
    } else {
      user = global.sensmsUsers ? global.sensmsUsers.find(function(u) { return u.phone === identifier || u.email === identifier; }) : null;
    }
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    var bcrypt = require('bcryptjs');
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user._id || user.id, phone: user.phone, email: user.email, name: user.name, pack: user.pack || 'Starter', credits: user.credits || 0, sender_id: user.sender_id || 'SenSMS' } });
  } catch(e) { console.error('SENSMS login error:', e); res.json({ success: false, error: e.message }); }
});

"""

# Injecter avant connectDB().then(
content = content.replace('connectDB().then(() => {', new_route + 'connectDB().then(() => {', 1)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done - route sensms/login remplacee avec succes:true")

# Verification
import subprocess
result = subprocess.run(['findstr', '/n', 'sensms/login', 'server-at.js'], capture_output=True, text=True)
print(result.stdout)
