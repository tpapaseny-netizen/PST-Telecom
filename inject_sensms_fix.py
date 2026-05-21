with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

OLD = """// POST /api/sensms/register
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
});"""

NEW = """// POST /api/sensms/register
var _sensmsUsers = {};
app.post('/api/sensms/register', async (req, res) => {
  try {
    var name = req.body.name; var phone = req.body.phone; var email = req.body.email || ''; var password = req.body.password;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });
    var hash = crypto.createHash('sha256').update(password).digest('hex');
    var id = 'sms_' + Date.now();
    var user = { id: id, name: name, phone: phone, email: email, password: hash, credits: 0, sender_id: '', created_at: new Date() };
    if (db) {
      var existing = await db.collection('sensms_users').findOne({ phone: phone });
      if (existing) return res.json({ success: false, error: 'Numero deja enregistre' });
      await db.collection('sensms_users').insertOne(user);
    } else {
      if (_sensmsUsers[phone]) return res.json({ success: false, error: 'Numero deja enregistre' });
      _sensmsUsers[phone] = user;
    }
    res.json({ success: true, user: { id: id, name: name, phone: phone, email: email, credits: 0 } });
  } catch (e) { console.error('[SenSMS register]', e.message); res.json({ success: false, error: e.message }); }
});"""

OLD_LOGIN = """// POST /api/sensms/login
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
});"""

NEW_LOGIN = """// POST /api/sensms/login
app.post('/api/sensms/login', async (req, res) => {
  try {
    var identifier = req.body.identifier; var password = req.body.password;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    var user = null;
    if (db) {
      user = await db.collection('sensms_users').findOne({ $or: [{ phone: identifier }, { email: identifier }] });
    } else {
      user = _sensmsUsers[identifier] || Object.values(_sensmsUsers).find(function(u){ return u.email === identifier; });
    }
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    var ok = (crypto.createHash('sha256').update(password).digest('hex') === user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, credits: user.credits || 0, sender_id: user.sender_id || '' } });
  } catch (e) { console.error('[SenSMS login]', e.message); res.json({ success: false, error: e.message }); }
});"""

if OLD in content:
    content = content.replace(OLD, NEW)
    print('OK - register corrige')
else:
    print('WARN - register pas trouve, cherche variante...')

if OLD_LOGIN in content:
    content = content.replace(OLD_LOGIN, NEW_LOGIN)
    print('OK - login corrige')
else:
    print('WARN - login pas trouve')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fichier sauvegarde')
