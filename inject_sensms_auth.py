with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier si déjà présentes
if '/api/sensms/register' in content:
    print("Routes déjà présentes")
    exit()

routes = """
// ============================================================
// ROUTES SENSMS AUTH
// ============================================================
var sensmsUsers = [];

app.post('/api/sensms/register', async function(req, res) {
  try {
    var name = req.body.name;
    var phone = req.body.phone;
    var email = req.body.email || '';
    var password = req.body.password;
    if (!name || !phone || !password) return res.json({ ok: false, error: 'Champs manquants' });
    // Normaliser le téléphone
    if (!phone.startsWith('+')) phone = '+221' + phone;
    // Vérifier doublon MongoDB
    if (db) {
      var existing = await db.collection('sensms_users').findOne({ phone: phone });
      if (existing) return res.json({ ok: false, error: 'Numero deja enregistre' });
      var newUser = { id: 'u_' + Date.now(), name: name, phone: phone, email: email, password: password, pack: 'Starter', credits: 0, sender_id: 'SenSMS', active: true, created_at: new Date() };
      await db.collection('sensms_users').insertOne(newUser);
      return res.json({ ok: true, user: { id: newUser.id, name: name, phone: phone, email: email, pack: 'Starter', credits: 0, sender_id: 'SenSMS' } });
    }
    // Fallback mémoire
    var existingMem = sensmsUsers.find(function(u) { return u.phone === phone; });
    if (existingMem) return res.json({ ok: false, error: 'Numero deja enregistre' });
    var memUser = { id: 'u_' + Date.now(), name: name, phone: phone, email: email, password: password, pack: 'Starter', credits: 0, sender_id: 'SenSMS', active: true };
    sensmsUsers.push(memUser);
    return res.json({ ok: true, user: { id: memUser.id, name: name, phone: phone, email: email, pack: 'Starter', credits: 0, sender_id: 'SenSMS' } });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.post('/api/sensms/login', async function(req, res) {
  try {
    var identifier = req.body.identifier || req.body.phone || req.body.email || '';
    var password = req.body.password;
    if (!identifier || !password) return res.json({ ok: false, error: 'Champs manquants' });
    // Normaliser
    if (identifier.match(/^[0-9]{9}$/)) identifier = '+221' + identifier;
    var user = null;
    if (db) {
      user = await db.collection('sensms_users').findOne({
        $or: [{ phone: identifier }, { email: identifier }],
        password: password
      });
    }
    // Fallback mémoire
    if (!user) {
      user = sensmsUsers.find(function(u) {
        return (u.phone === identifier || u.email === identifier) && u.password === password;
      });
    }
    if (!user) return res.json({ ok: false, error: 'Identifiants incorrects' });
    if (user.active === false) return res.json({ ok: false, error: 'Compte suspendu' });
    return res.json({ ok: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, pack: user.pack || 'Starter', credits: user.credits || 0, sender_id: user.sender_id || 'SenSMS' } });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

"""

marker = 'connectDB().then('
idx = content.find(marker)
if idx == -1:
    print("ERREUR: marqueur connectDB introuvable")
    exit(1)

new_content = content[:idx] + routes + content[idx:]

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("OK - Routes /api/sensms/register et /api/sensms/login injectées")
