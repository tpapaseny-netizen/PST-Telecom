#!/usr/bin/env python3
# add_sensms_me_route.py

FILE = "server-at.js"

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier si la route existe déjà (version JSONBin)
if "jbGet(BINS.users)" in content and "/api/sen-sms/me" in content:
    print("✅ Route /api/sen-sms/me JSONBin déjà présente")
else:
    print("Route /api/sen-sms/me manquante ou ancienne - ajout...")

# Supprimer l'ancienne version si elle existe
OLD_ME = """app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var user = await db.collection('sensms_users').findOne({ _id: new ObjectId(req.senSmsUser.id) }, { projection: { password: 0 } });
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    res.json({ success: true, user: { ...user, id: user._id } });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

NEW_ME = """app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    const userId = String(req.senSmsUser.id || req.senSmsUser._id || '');
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => String(u.id) === userId);
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    const { password: _, ...userSafe } = user;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error('sen-sms/me error:', e.message);
    res.json({ success: false, error: 'Erreur serveur' });
  }
});"""

if OLD_ME in content:
    content = content.replace(OLD_ME, NEW_ME)
    print("✅ Ancienne route /api/sen-sms/me remplacée")
elif NEW_ME in content:
    print("✅ Route JSONBin déjà en place")
else:
    # Injecter juste avant le marqueur DÉMARRAGE ou avant connectDB
    INJECT_BEFORE = "// ─── DÉMARRAGE"
    if INJECT_BEFORE in content:
        content = content.replace(INJECT_BEFORE, NEW_ME + "\n\n" + INJECT_BEFORE, 1)
        print("✅ Route /api/sen-sms/me ajoutée avant DÉMARRAGE")
    else:
        # Injecter avant app.listen
        idx = content.rfind("app.listen")
        content = content[:idx] + NEW_ME + "\n\n" + content[idx:]
        print("✅ Route /api/sen-sms/me ajoutée avant app.listen")

# Aussi corriger le secret JWT dans senSmsAuth
content = content.replace(
    "process.env.JWT_SECRET || 'pst-secret-2026'",
    "process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3'"
)
print("✅ Secret JWT unifié")

# Corriger la route credits si MongoDB
OLD_CREDITS = """app.get('/api/sen-sms/credits', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var user = await db.collection('sensms_users').findOne({ _id: new ObjectId(req.senSmsUser.id) }, { projection: { credits: 1 } });
    res.json({ success: true, credits: user ? (user.credits||0) : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

NEW_CREDITS = """app.get('/api/sen-sms/credits', senSmsAuth, async (req, res) => {
  try {
    const userId = String(req.senSmsUser.id || req.senSmsUser._id || '');
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => String(u.id) === userId);
    res.json({ success: true, credits: user ? (user.credits||0) : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

if OLD_CREDITS in content:
    content = content.replace(OLD_CREDITS, NEW_CREDITS)
    print("✅ Route /api/sen-sms/credits corrigée")

import shutil
shutil.copy(FILE, FILE + ".backup_add_me")
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ server-at.js sauvegardé!")
print()
print("  git add .")
print('  git commit -m "fix: route sen-sms/me JSONBin + JWT secret"')
print("  git push")
