#!/usr/bin/env python3
# patch_sensms_jsonbin.py
# Place ce fichier dans C:\Users\NDCHEIKH\Desktop\PST-Telecom\
# Puis exécute : python patch_sensms_jsonbin.py

import os, re

FILE = "server-at.js"
MARKER = "// ─── DÉMARRAGE"

JSONBIN_BLOCK = '''
// ═══════════════════════════════════════════════════════════════
// ─── JSONBIN.IO — Stockage persistant SenSMS (remplace MongoDB)
// ═══════════════════════════════════════════════════════════════
const JSONBIN_MASTER_KEY = process.env.JSONBIN_MASTER_KEY || "$2a$10$6wx4e4ryFO7kXX.tUIBfIeM.BRERmrVlVwqDk/Qj3be1hF5gsUg1O";
const JSONBIN_BASE = "https://api.jsonbin.io/v3";

// IDs des bins (créés automatiquement au premier démarrage, puis sauvegardés en vars Render)
let BINS = {
  users:     process.env.JSONBIN_USERS_BIN     || null,
  campaigns: process.env.JSONBIN_CAMPAIGNS_BIN || null,
  contacts:  process.env.JSONBIN_CONTACTS_BIN  || null
};

async function jbGet(binId) {
  if (!binId) return null;
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_MASTER_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record;
  } catch(e) { return null; }
}

async function jbSet(binId, record) {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(record)
    });
    return res.ok;
  } catch(e) { return false; }
}

async function jbCreate(name, initialData) {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY,
        "X-Bin-Name": name,
        "X-Bin-Private": "true"
      },
      body: JSON.stringify(initialData)
    });
    const data = await res.json();
    return data.metadata?.id || null;
  } catch(e) { return null; }
}

async function initJSONBins() {
  console.log("📦 Initialisation JSONBin SenSMS...");
  if (!BINS.users) {
    BINS.users = await jbCreate("sensms_users", { users: [] });
    if (BINS.users) console.log("✅ Bin users créé:", BINS.users);
  }
  if (!BINS.campaigns) {
    BINS.campaigns = await jbCreate("sensms_campaigns", { campaigns: [] });
    if (BINS.campaigns) console.log("✅ Bin campaigns créé:", BINS.campaigns);
  }
  if (!BINS.contacts) {
    BINS.contacts = await jbCreate("sensms_contacts", { contacts: [] });
    if (BINS.contacts) console.log("✅ Bin contacts créé:", BINS.contacts);
  }
  console.log("📦 JSONBin BINS IDs:", JSON.stringify(BINS));
  console.log("⚠️  IMPORTANT: Ajoute ces IDs comme variables Render pour ne pas les perdre !");
  console.log("   JSONBIN_USERS_BIN =", BINS.users);
  console.log("   JSONBIN_CAMPAIGNS_BIN =", BINS.campaigns);
  console.log("   JSONBIN_CONTACTS_BIN =", BINS.contacts);
}

initJSONBins().catch(console.error);

// ═══════════════════════════════════════════════════════════════
// ─── ROUTES SENSMS (JSONBin — persistant sans MongoDB)
// ═══════════════════════════════════════════════════════════════

// Inscription SenSMS
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
});

// Connexion SenSMS
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
    if (!user) return res.json({ success: false, error: "Identifiant ou mot de passe incorrect" });

    // Génération token JWT maison
    const jwtSecret = process.env.JWT_SECRET || "pst-jwt-2026-xK9mPq7nR3";
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      id: user.id, phone: user.phone, role: user.role,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7
    })).toString("base64url");
    const sig = nodeCrypto.createHmac("sha256", jwtSecret).update(header + "." + payload).digest("base64url");
    const token = header + "." + payload + "." + sig;

    const { password: _pw, ...userSafe } = user;
    res.json({ success: true, user: userSafe, token });
  } catch(e) {
    console.error("SenSMS login error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// Profil SenSMS (par token)
app.get("/api/sen-sms/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return res.json({ success: false, error: "Non authentifié" });

    const parts = token.split(".");
    if (parts.length !== 3) return res.json({ success: false, error: "Token invalide" });

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.json({ success: false, error: "Session expirée" });
    }

    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === payload.id);
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable" });

    const { password: _pw, ...userSafe } = user;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    res.json({ success: false, error: "Token invalide" });
  }
});

// Envoyer SMS (Techsoft)
app.post("/api/sen-sms/send", async (req, res) => {
  try {
    const { recipients, message, sender_id } = req.body;
    if (!recipients || !message) return res.json({ success: false, error: "Destinataires et message requis" });

    const TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || "1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823";
    const phones = Array.isArray(recipients) ? recipients : recipients.split(",").map(p => p.trim());
    const results = [];

    for (const phone of phones) {
      try {
        const response = await fetch("https://app.techsoft-sms.com/api/http/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${TECHSOFT_TOKEN}`
          },
          body: JSON.stringify({
            recipient: phone,
            sender_id: sender_id || "SenSMS",
            message,
            type: "plain"
          })
        });
        const data = await response.json();
        results.push({ phone, status: data.status || "sent", response: data });
      } catch(e) {
        results.push({ phone, status: "error", error: e.message });
      }
    }

    // Historique campagne dans JSONBin
    const cdb = await jbGet(BINS.campaigns) || { campaigns: [] };
    cdb.campaigns.push({
      id: Date.now().toString(),
      message,
      sender_id: sender_id || "SenSMS",
      recipients: phones,
      sent: results.filter(r => r.status !== "error").length,
      failed: results.filter(r => r.status === "error").length,
      sentAt: new Date().toISOString()
    });
    if (cdb.campaigns.length > 500) cdb.campaigns = cdb.campaigns.slice(-500);
    await jbSet(BINS.campaigns, cdb);

    res.json({ success: true, results, total: phones.length,
      sent: results.filter(r => r.status !== "error").length });
  } catch(e) {
    console.error("SenSMS send error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// Historique campagnes
app.get("/api/sen-sms/campaigns", async (req, res) => {
  try {
    const db = await jbGet(BINS.campaigns) || { campaigns: [] };
    res.json({ success: true, campaigns: [...db.campaigns].reverse().slice(0, 100) });
  } catch(e) {
    res.json({ success: false, campaigns: [] });
  }
});

// Contacts — ajouter
app.post("/api/sen-sms/contacts", async (req, res) => {
  try {
    const { name, phone, group } = req.body;
    if (!phone) return res.json({ success: false, error: "Téléphone requis" });
    const db = await jbGet(BINS.contacts) || { contacts: [] };
    const exists = db.contacts.find(c => c.phone === phone);
    if (exists) return res.json({ success: false, error: "Contact déjà existant" });
    db.contacts.push({
      id: Date.now().toString(),
      name: name || "", phone,
      group: group || "default",
      createdAt: new Date().toISOString()
    });
    await jbSet(BINS.contacts, db);
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Contacts — liste
app.get("/api/sen-sms/contacts", async (req, res) => {
  try {
    const db = await jbGet(BINS.contacts) || { contacts: [] };
    res.json({ success: true, contacts: db.contacts });
  } catch(e) {
    res.json({ success: false, contacts: [] });
  }
});

// Admin — liste users
app.get("/api/sen-sms/admin/users", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-admin-token"];
    const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
    if (token !== adminPwd) return res.status(403).json({ success: false, error: "Non autorisé" });
    const db = await jbGet(BINS.users) || { users: [] };
    const safe = db.users.map(u => { const { password: _, ...s } = u; return s; });
    res.json({ success: true, users: safe, total: safe.length });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Admin — ajouter crédits
app.post("/api/sen-sms/admin/credits", async (req, res) => {
  try {
    const { token, userId, credits } = req.body;
    const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
    if (token !== adminPwd) return res.status(403).json({ success: false, error: "Non autorisé" });
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable" });
    user.credits = (user.credits || 0) + parseInt(credits || 0);
    await jbSet(BINS.users, db);
    res.json({ success: true, newCredits: user.credits });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ⚡ Récupérer les IDs des bins (à sauvegarder dans Render)
app.get("/api/sen-sms/bins", async (req, res) => {
  const token = req.query.token;
  const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
  if (token !== adminPwd) return res.status(403).json({ error: "Non autorisé" });
  res.json({ success: true, bins: BINS,
    message: "Sauvegarde ces IDs dans les variables Render !" });
});

'''

# ── Lecture du fichier
if not os.path.exists(FILE):
    print(f"❌ Fichier {FILE} introuvable. Assure-toi d'être dans le bon dossier !")
    exit(1)

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

print(f"✅ {FILE} lu — {len(content)} caractères")

# ── Vérifier si le patch est déjà appliqué
if "JSONBIN.IO — Stockage persistant SenSMS" in content:
    print("⚠️  Patch JSONBin déjà présent dans server-at.js — pas de modification.")
    exit(0)

# ── Chercher l'ancien code SenSMS MongoDB à supprimer (si existant)
# On supprime les anciennes routes /api/sen-sms/ si elles sont basées sur mongoose
OLD_PATTERNS = [
    # Supprimer l'ancien bloc d'inscription SenSMS mongoose
    r'// Inscription SenSMS\s*\napp\.post\("/api/sen-sms/register".*?(?=\n// |\napp\.)',
    r'// Connexion SenSMS\s*\napp\.post\("/api/sen-sms/login".*?(?=\n// |\napp\.)',
]

for pattern in OLD_PATTERNS:
    new_c = re.sub(pattern, '', content, flags=re.DOTALL)
    if new_c != content:
        content = new_c
        print("✅ Ancienne route SenSMS supprimée")

# ── Injection avant le marqueur DÉMARRAGE
MARKER = "// ─── DÉMARRAGE"
if MARKER in content:
    content = content.replace(MARKER, JSONBIN_BLOCK + "\n" + MARKER, 1)
    print(f"✅ Bloc JSONBin injecté avant '{MARKER}'")
else:
    # Fallback : injecter avant app.listen
    if "app.listen" in content:
        idx = content.rfind("app.listen")
        content = content[:idx] + JSONBIN_BLOCK + "\n" + content[idx:]
        print("✅ Bloc JSONBin injecté avant app.listen (fallback)")
    else:
        print("❌ Marqueur DÉMARRAGE et app.listen introuvables !")
        exit(1)

# ── Sauvegarde backup
import shutil
shutil.copy(FILE, FILE + ".backup_before_jsonbin")
print(f"✅ Backup créé : {FILE}.backup_before_jsonbin")

# ── Écriture
with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print(f"✅ {FILE} mis à jour avec JSONBin SenSMS !")
print()
print("═══════════════════════════════════════════════")
print("PROCHAINES ÉTAPES :")
print("1. git add .")
print('2. git commit -m "feat: SenSMS routes JSONBin - sans MongoDB"')
print("3. git push")
print("4. Attendre Render redeploy (~2 min)")
print("5. Aller sur : https://pst-telecom.onrender.com/api/sen-sms/bins?token=pst-admin-2026")
print("   → Copier les 3 IDs de bins et les ajouter comme vars Render !")
print("═══════════════════════════════════════════════")
