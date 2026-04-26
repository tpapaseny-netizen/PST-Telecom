const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── MongoDB ───────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
const AT_API_KEY  = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const PORT        = process.env.PORT || 3001;

let db;

async function connectDB() {
  if (!MONGODB_URI) {
    console.warn('⚠️  MONGODB_URI manquant — mode mémoire activé');
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('pst_telecom');
    console.log('✅ MongoDB Atlas connecté');
  } catch (err) {
    console.error('❌ MongoDB erreur:', err.message);
  }
}

// ─── Africa's Talking ───────────────────────────────────────
function getAT() {
  if (!AT_API_KEY) return null;
  try {
    const AfricasTalking = require('africastalking');
    return AfricasTalking({ apiKey: AT_API_KEY, username: AT_USERNAME });
  } catch { return null; }
}

// ─── Helpers ────────────────────────────────────────────────
const FORFAITS = {
  starter:  { nom: 'Starter',  minutes: 200,  prix: 2990 },
  smart:    { nom: 'Smart',    minutes: 300,  prix: 5990 },
  business: { nom: 'Business', minutes: 99999, prix: 15990 },
};

function genUserId()  { return 'PST-' + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genNumero()  {
  const prefixes = ['77','78','76','70'];
  const p = prefixes[Math.floor(Math.random()*prefixes.length)];
  const n = Math.floor(Math.random()*9000000)+1000000;
  return `+221 ${p} ${String(n).slice(0,3)} ${String(n).slice(3,5)} ${String(n).slice(5)}`;
}

async function getAbonnes() {
  if (db) return await db.collection('abonnes').find({}).sort({ createdAt: -1 }).toArray();
  return global._abonnes || [];
}

async function saveAbonne(abonne) {
  if (db) {
    await db.collection('abonnes').insertOne(abonne);
  } else {
    global._abonnes = global._abonnes || [];
    global._abonnes.push(abonne);
  }
}

async function updateAbonne(userId, update) {
  if (db) {
    await db.collection('abonnes').updateOne({ userId }, { $set: update });
  } else {
    global._abonnes = (global._abonnes || []).map(a =>
      a.userId === userId ? { ...a, ...update } : a
    );
  }
}

async function deleteAbonne(userId) {
  if (db) {
    await db.collection('abonnes').deleteOne({ userId });
  } else {
    global._abonnes = (global._abonnes || []).filter(a => a.userId !== userId);
  }
}

// ─── ROUTES ─────────────────────────────────────────────────

// Santé
app.get('/', (req, res) => {
  res.json({ service: 'PST Pure Smart Telecom', status: 'online', version: '4.0' });
});

// Middleware auth admin
function authAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pst-admin-2026';
  if (token !== ADMIN_PASSWORD) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PST Admin</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:sans-serif;background:#0d2137;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;}.box{background:#111c2a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:2rem;width:320px;text-align:center;}.logo{font-size:2rem;font-weight:900;color:#00c864;margin-bottom:0.5rem;}.sub{font-size:0.8rem;color:#7a8f9e;margin-bottom:2rem;}input{width:100%;padding:0.85rem;background:#0d2137;border:1.5px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:1rem;outline:none;margin-bottom:1rem;}.btn{width:100%;padding:0.85rem;background:#00c864;color:#0d2137;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;}.err{color:#f44336;font-size:0.82rem;margin-top:0.75rem;display:none;}</style></head><body><div class="box"><div class="logo">PST</div><div class="sub">Dashboard Admin</div><input type="password" id="pwd" placeholder="Mot de passe admin" onkeydown="if(event.key==='Enter')login()"/><button class="btn" onclick="login()">Accéder →</button><div class="err" id="err">Mot de passe incorrect</div></div><script>function login(){const p=document.getElementById('pwd').value;if(p)window.location.href='/admin?token='+encodeURIComponent(p);else{document.getElementById('err').style.display='block';}}</script></body></html>`);
  }
  next();
}

// Admin dashboard
app.get('/admin', authAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Interface appel
app.get('/appel', (req, res) => {
  res.sendFile(path.join(__dirname, 'appel.html'));
});

// Dashboard client
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ─── STATS ADMIN ────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    const total   = abonnes.length;
    const actifs  = abonnes.filter(a => a.statut === 'actif').length;
    const attente = abonnes.filter(a => a.statut === 'en_attente').length;
    const revenus = abonnes
      .filter(a => a.statut === 'actif')
      .reduce((sum, a) => sum + (FORFAITS[a.forfait]?.prix || 0), 0);
    res.json({ total, actifs, attente, revenus });
  } catch (err) {
    console.error('Stats erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── LISTE ABONNÉS ──────────────────────────────────────────
app.get('/api/admin/abonnes', async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    res.json(abonnes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CRÉER ABONNÉ ───────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait = 'smart' } = req.body;
    if (!nom || !telephone) {
      return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
    }

    const f = FORFAITS[forfait] || FORFAITS.smart;
    const abonne = {
      userId:        genUserId(),
      nom, prenom,
      telephone,
      forfait,
      forfaitNom:    f.nom,
      minutes:       f.minutes,
      minutesUsees:  0,
      prix:          f.prix,
      numeroVirtuel: genNumero(),
      statut:        'en_attente',
      createdAt:     new Date(),
      updatedAt:     new Date(),
      paiements:     [],
    };

    await saveAbonne(abonne);

    // SMS de bienvenue
    const at = getAT();
    if (at) {
      try {
        await at.SMS.send({
          to: telephone,
          message: `Bienvenue sur PST Pure Smart Telecom ! 🎉\nVotre forfait ${f.nom} (${f.prix} FCFA/${f.minutes === 99999 ? 'illimité' : f.minutes + ' min'}) est en cours d'activation.\nVotre numéro PST : ${abonne.numeroVirtuel}\nID : ${abonne.userId}`,
          from: 'PST',
        });
      } catch (smsErr) {
        console.warn('SMS non envoyé:', smsErr.message);
      }
    }

    const lienWave = `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${f.prix}`;
    res.json({
      success: true,
      userId: abonne.userId,
      numeroVirtuel: abonne.numeroVirtuel,
      lienWave,
      message: `Compte PST créé ! Forfait ${f.nom} — ${f.prix} FCFA`,
    });
  } catch (err) {
    console.error('Register erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── ACTIVER ABONNÉ ─────────────────────────────────────────
app.post('/api/admin/activer/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await updateAbonne(userId, {
      statut: 'actif',
      activatedAt: new Date(),
      updatedAt: new Date(),
    });

    const abonnes = await getAbonnes();
    const abonne = abonnes.find(a => a.userId === userId);

    if (abonne) {
      const at = getAT();
      if (at) {
        try {
          await at.SMS.send({
            to: abonne.telephone,
            message: `✅ PST Telecom : Votre forfait ${abonne.forfaitNom} est maintenant ACTIF !\nNuméro PST : ${abonne.numeroVirtuel}\nMinutes : ${abonne.minutes === 99999 ? 'Illimitées' : abonne.minutes}\nBonne communication ! 📞`,
            from: 'PST',
          });
        } catch (smsErr) {
          console.warn('SMS activation non envoyé:', smsErr.message);
        }
      }
    }

    res.json({ success: true, message: 'Abonné activé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUSPENDRE ABONNÉ ───────────────────────────────────────
app.post('/api/admin/suspendre/:userId', async (req, res) => {
  try {
    await updateAbonne(req.params.userId, {
      statut: 'suspendu',
      updatedAt: new Date(),
    });
    res.json({ success: true, message: 'Abonné suspendu' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MODIFIER ABONNÉ ────────────────────────────────────────
app.put('/api/admin/abonne/:userId', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait, minutesBonus } = req.body;
    const update = { updatedAt: new Date() };
    if (nom)       update.nom = nom;
    if (prenom)    update.prenom = prenom;
    if (telephone) update.telephone = telephone;
    if (forfait && FORFAITS[forfait]) {
      update.forfait    = forfait;
      update.forfaitNom = FORFAITS[forfait].nom;
      update.prix       = FORFAITS[forfait].prix;
      update.minutes    = FORFAITS[forfait].minutes;
    }
    if (minutesBonus && db) {
      await db.collection('abonnes').updateOne(
        { userId: req.params.userId },
        { $inc: { minutes: parseInt(minutesBonus) }, $set: update }
      );
    } else {
      await updateAbonne(req.params.userId, update);
    }
    res.json({ success: true, message: 'Abonné mis à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPPRIMER ABONNÉ ───────────────────────────────────────
app.delete('/api/admin/abonne/:userId', async (req, res) => {
  try {
    await deleteAbonne(req.params.userId);
    res.json({ success: true, message: 'Abonné supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── APPEL ──────────────────────────────────────────────────
app.post('/api/appel/initier', async (req, res) => {
  try {
    const { userId, numeroDestination } = req.body;
    const abonnes = await getAbonnes();
    const abonne  = abonnes.find(a => a.userId === userId);

    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    if (abonne.statut !== 'actif') return res.status(403).json({ error: 'Forfait non actif' });
    if (abonne.minutes !== 99999 && abonne.minutesUsees >= abonne.minutes) {
      return res.status(403).json({ error: 'Minutes épuisées' });
    }

    const at = getAT();
    if (at) {
      try {
        const callResp = await at.VOICE.call({
          callFrom: '+254711082300',
          callTo:   [numeroDestination],
        });
        return res.json({ success: true, callId: callResp.entries?.[0]?.sessionId || 'AT-' + Date.now(), type: 'real' });
      } catch (voiceErr) {
        console.warn('Appel AT:', voiceErr.message);
      }
    }

    // Fallback simulé
    res.json({
      success: true,
      callId: 'CALL-DEMO-' + Math.random().toString(16).slice(2,8).toUpperCase(),
      type: 'sandbox',
      message: `[SANDBOX] Appel simulé vers ${numeroDestination}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── WEBHOOK WAVE ───────────────────────────────────────────
app.post('/api/webhook/wave', async (req, res) => {
  try {
    const { amount, client_reference } = req.body;
    console.log('Webhook Wave reçu:', req.body);
    if (client_reference) {
      await updateAbonne(client_reference, {
        statut: 'actif',
        activatedAt: new Date(),
        updatedAt: new Date(),
        paiementWave: { amount, date: new Date() },
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DÉMARRAGE ──────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 PST — Pure Smart Telecom`);
    console.log(`📡 Backend Africa's Talking`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`💾 MongoDB: ${db ? 'connecté' : 'mode mémoire'}\n`);
  });
});
