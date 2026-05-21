with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """app.get('/api/sensms/profile/:id', async (req, res) => {
  try {
    if (!db) return res.json({ success: false, error: 'DB indisponible' });
    var user = await db.collection('sensms_users').findOne({ id: req.params.id });
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    delete user.password; delete user._id;
    res.json({ success: true, user: user });
  } catch (e) { res.json({ success: false, error: e.message }); }
});"""

new = """app.get('/api/sensms/profile/:id', async (req, res) => {
  try {
    var mongoose = require('mongoose');
    var SensmsUser = mongoose.models.SensmsUser || mongoose.model('SensmsUser');
    var user = await SensmsUser.findById(req.params.id).lean();
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    delete user.password;
    res.json({ success: true, user: user });
  } catch (e) { res.json({ success: false, error: e.message }); }
});"""

if old in content:
    content = content.replace(old, new)
    print("Fix applique OK")
else:
    # Remplacement partiel sur la ligne db.collection
    content = content.replace(
        "var user = await db.collection('sensms_users').findOne({ id: req.params.id });",
        "var SensmsUser = require('mongoose').models.SensmsUser; var user = SensmsUser ? await SensmsUser.findById(req.params.id).lean() : null;"
    )
    print("Fix partiel applique")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Verification
import subprocess
result = subprocess.run(['findstr', '/n', 'db.collection', 'server-at.js'], capture_output=True, text=True)
print("db.collection restants:", result.stdout if result.stdout else "aucun - OK")
