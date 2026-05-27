#!/usr/bin/env python3
# fix_sensms_me.py

FILE = "server-at.js"

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Chercher la route /api/sen-sms/me actuelle
OLD = """app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var user = await db.collection('sensms_users').findOne({ _id: new ObjectId(req.senSmsUser.id) }, { projection: { password: 0 } });
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    res.json({ success: true, user: { ...user, id: user._id } });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

NEW = """app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    // JSONBin - récupérer l'utilisateur par ID depuis le token
    const userId = req.senSmsUser.id || req.senSmsUser._id;
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === String(userId) || u.id === userId);
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    const { password: _, ...userSafe } = user;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error('sen-sms/me error:', e.message);
    res.json({ success: false, error: 'Erreur serveur' });
  }
});"""

# Aussi corriger la route /api/sen-sms/credits si elle utilise MongoDB
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
    const userId = req.senSmsUser.id || req.senSmsUser._id;
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === String(userId));
    res.json({ success: true, credits: user ? (user.credits||0) : 0 });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

OLD_CAMPS = """app.get('/api/sen-sms/campaigns', senSmsAuth, async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const { ObjectId } = require('mongodb');
    var campaigns = await db.collection('sensms_campaigns').find({ userId: req.senSmsUser.id }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, campaigns });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

NEW_CAMPS = """app.get('/api/sen-sms/campaigns', async (req, res) => {
  try {
    const db = await jbGet(BINS.campaigns) || { campaigns: [] };
    res.json({ success: true, campaigns: [...db.campaigns].reverse().slice(0, 100) });
  } catch(e) { res.json({ success: false, error: 'Erreur serveur' }); }
});"""

import shutil
changed = False

if OLD in content:
    content = content.replace(OLD, NEW)
    print("✅ Route /api/sen-sms/me corrigée → JSONBin")
    changed = True
else:
    print("⚠️  Route /api/sen-sms/me non trouvée - cherchons...")
    idx = content.find('/api/sen-sms/me')
    if idx != -1:
        print(f"   Trouvée à la position {idx}, ligne {content[:idx].count(chr(10))+1}")
        print(f"   Contexte: {content[idx:idx+200]}")

if OLD_CREDITS in content:
    content = content.replace(OLD_CREDITS, NEW_CREDITS)
    print("✅ Route /api/sen-sms/credits corrigée → JSONBin")
    changed = True
else:
    print("⚠️  Route credits non trouvée (peut-être déjà correcte)")

if OLD_CAMPS in content:
    content = content.replace(OLD_CAMPS, NEW_CAMPS)
    print("✅ Route /api/sen-sms/campaigns corrigée → JSONBin")
    changed = True
else:
    print("⚠️  Route campaigns non trouvée")

if changed:
    shutil.copy(FILE, FILE + ".backup_me_fix")
    with open(FILE, 'w', encoding='utf-8') as f:
        f.write(content)
    print()
    print("✅ server-at.js sauvegardé!")
    print()
    print("  git add .")
    print('  git commit -m "fix: sen-sms/me et credits via JSONBin - session persistante"')
    print("  git push")
else:
    print("❌ Aucune modification")
