#!/usr/bin/env python3
# fix_sensms_register.py
# Corrige la route /api/sen-sms/register pour accepter les champs du frontend

FILE = "server-at.js"

OLD = '''// Inscription SenSMS
app.post("/api/sen-sms/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) return res.json({ success: false, error: "Champs requis: nom, téléphone, mot de passe" });

    const db = await jbGet(BINS.users) || { users: [] };
    const exists = db.users.find(u => u.phone === phone || (email && u.email === email));
    if (exists) return res.json({ success: false, error: "Compte déjà existant avec ce téléphone ou email" });

    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");
    const newUser = {
      id: Date.now().toString(),
      name, phone,
      email: email || "",
      password: hashedPw,
      credits: 0,
      role: "user",
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    await jbSet(BINS.users, db);

    const { password: _pw, ...userSafe } = newUser;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error("SenSMS register error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});'''

NEW = '''// Inscription SenSMS
app.post("/api/sen-sms/register", async (req, res) => {
  try {
    // Accepter les deux formats (frontend envoie: nom, organisation, telephone, email, password)
    const nom = req.body.nom || req.body.name || "";
    const org = req.body.organisation || req.body.org || "";
    const phone = req.body.telephone || req.body.phone || "";
    const email = req.body.email || "";
    const password = req.body.password || "";

    if (!email || !password) return res.json({ success: false, error: "Email et mot de passe requis" });
    if (password.length < 6) return res.json({ success: false, error: "Mot de passe trop court (6 caractères minimum)" });

    const db = await jbGet(BINS.users) || { users: [] };
    const exists = db.users.find(u => u.email === email || (phone && u.phone === phone));
    if (exists) return res.json({ success: false, error: "Compte déjà existant avec cet email ou téléphone" });

    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");
    const newUser = {
      id: Date.now().toString(),
      nom: nom || email.split("@")[0],
      organisation: org,
      phone: phone,
      email: email,
      password: hashedPw,
      credits: 0,
      role: "user",
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    await jbSet(BINS.users, db);

    const { password: _pw, ...userSafe } = newUser;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error("SenSMS register error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});'''

# Correction aussi pour le login (frontend envoie email dans le champ identifier)
OLD_LOGIN = '''// Connexion SenSMS
app.post("/api/sen-sms/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.json({ success: false, error: "Identifiant et mot de passe requis" });

    const db = await jbGet(BINS.users) || { users: [] };
    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");

    const user = db.users.find(u =>
      (u.phone === identifier || u.email === identifier) && u.password === hashedPw
    );
    if (!user) return res.json({ success: false, error: "Identifiant ou mot de passe incorrect" });'''

NEW_LOGIN = '''// Connexion SenSMS
app.post("/api/sen-sms/login", async (req, res) => {
  try {
    // Frontend envoie: email + password (champ identifier ou email)
    const identifier = req.body.identifier || req.body.email || "";
    const password = req.body.password || "";
    if (!identifier || !password) return res.json({ success: false, error: "Email et mot de passe requis" });

    const db = await jbGet(BINS.users) || { users: [] };
    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");

    const user = db.users.find(u =>
      (u.email === identifier || u.phone === identifier) && u.password === hashedPw
    );
    if (!user) return res.json({ success: false, error: "Email ou mot de passe incorrect" });'''

import os
if not os.path.exists(FILE):
    print(f"❌ {FILE} introuvable !")
    exit(1)

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

changed = False

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    print("✅ Route register corrigée")
    changed = True
else:
    print("⚠️  Route register non trouvée avec pattern exact — vérification...")
    if "nom = req.body.nom" in content:
        print("✅ Route register déjà corrigée")
    else:
        print("❌ Pattern register non trouvé")

if OLD_LOGIN in content:
    content = content.replace(OLD_LOGIN, NEW_LOGIN, 1)
    print("✅ Route login corrigée")
    changed = True
else:
    if "req.body.identifier || req.body.email" in content:
        print("✅ Route login déjà corrigée")
    else:
        print("⚠️  Route login non trouvée avec pattern exact")

if changed:
    import shutil
    shutil.copy(FILE, FILE + ".backup_before_fix_register")
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✅ {FILE} sauvegardé !")
    print()
    print("Maintenant exécute :")
    print("  git add .")
    print('  git commit -m "fix: SenSMS register/login champs frontend"')
    print("  git push")
else:
    print("Aucune modification nécessaire")
