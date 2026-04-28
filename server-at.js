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

// Santé API
app.get('/', (req, res) => {
  res.redirect('https://pst-telecom.vercel.app');
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

// Page SMS verification
app.get('/sms', (req, res) => {
  res.sendFile(path.join(__dirname, 'sms.html'));
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

// ─── APPELS VONAGE ──────────────────────────────────────────
app.post('/api/appel/initier', async (req, res) => {
  try {
    const { userId, numeroDestination } = req.body;
    const abonnes = await getAbonnes();
    const abonne  = abonnes.find(a => a.userId === userId);

    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    if (abonne.statut !== 'actif') return res.status(403).json({ error: 'Forfait non actif' });
    if (abonne.minutes !== 99999 && (abonne.minutesUsees||0) >= abonne.minutes) {
      return res.status(403).json({ error: 'Minutes épuisées' });
    }

    const VONAGE_KEY    = process.env.VONAGE_API_KEY;
    const VONAGE_SECRET = process.env.VONAGE_API_SECRET;

    if (VONAGE_KEY && VONAGE_SECRET) {
      try {
        const to = numeroDestination.replace(/\s/g, '');
        const VONAGE_NUMBER = process.env.VONAGE_NUMBER || '12345678901';
        const credentials = Buffer.from(`${VONAGE_KEY}:${VONAGE_SECRET}`).toString('base64');
        const r = await fetch('https://api.nexmo.com/v1/calls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${credentials}` },
          body: JSON.stringify({
            to: [{ type: 'phone', number: to }],
            from: { type: 'phone', number: VONAGE_NUMBER },
            ncco: [{ action: 'talk', text: 'Appel PST Pure Smart Telecom. Connexion en cours.', language: 'fr-FR' }]
          }),
        });
        if (r.ok) {
          const data = await r.json();
          if (db) await db.collection('abonnes').updateOne({ userId }, { $inc: { minutesUsees: 1 } });
          return res.json({ success: true, callId: data.uuid || 'VNG-' + Date.now(), type: 'real' });
        }
      } catch (vonageErr) {
        console.warn('Vonage erreur:', vonageErr.message);
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

// ─── PACKS & SERVICES SMS ───────────────────────────────────
const SMS_PACKS = {
  pack1: { points: 5,  prix: 1000, label: '5 points' },
  pack2: { points: 12, prix: 2000, label: '12 points' },
  pack3: { points: 30, prix: 4500, label: '30 points' },
  pack4: { points: 70, prix: 9000, label: '70 points' },
};

const SMS_SERVICES = [
  { id: 'whatsapp',  nom: 'WhatsApp',        icon: '💬', prix_points: 1 },
  { id: 'google',    nom: 'Google / Gmail',   icon: '🔵', prix_points: 1 },
  { id: 'facebook',  nom: 'Facebook',         icon: '📘', prix_points: 1 },
  { id: 'instagram', nom: 'Instagram',        icon: '📸', prix_points: 1 },
  { id: 'tiktok',    nom: 'TikTok',           icon: '🎵', prix_points: 1 },
  { id: 'telegram',  nom: 'Telegram',         icon: '✈️',  prix_points: 1 },
  { id: 'twitter',   nom: 'Twitter / X',      icon: '🐦', prix_points: 1 },
  { id: 'snapchat',  nom: 'Snapchat',         icon: '👻', prix_points: 1 },
  { id: 'microsoft', nom: 'Microsoft',        icon: '🪟', prix_points: 2 },
  { id: 'apple',     nom: 'Apple',            icon: '🍎', prix_points: 2 },
  { id: 'amazon',    nom: 'Amazon',           icon: '📦', prix_points: 2 },
  { id: 'netflix',   nom: 'Netflix',          icon: '🎬', prix_points: 2 },
  { id: 'uber',      nom: 'Uber',             icon: '🚗', prix_points: 1 },
  { id: 'airbnb',    nom: 'Airbnb',           icon: '🏠', prix_points: 2 },
  { id: 'linkedin',  nom: 'LinkedIn',         icon: '💼', prix_points: 1 },
  { id: 'chatgpt',   nom: 'OpenAI/ChatGPT',   icon: '🤖', prix_points: 2 },
  { id: 'discord',   nom: 'Discord',          icon: '🎮', prix_points: 1 },
  { id: 'viber',     nom: 'Viber',            icon: '📱', prix_points: 1 },
];

// Mapping logos publics pour les services connus
const SERVICE_LOGOS = {
  uber: 'https://logo.clearbit.com/uber.com',
  tinder: 'https://logo.clearbit.com/tinder.com',
  instagram: 'https://logo.clearbit.com/instagram.com',
  microsoft: 'https://logo.clearbit.com/microsoft.com',
  google: 'https://logo.clearbit.com/google.com',
  yahoo: 'https://logo.clearbit.com/yahoo.com',
  facebook: 'https://logo.clearbit.com/facebook.com',
  whatsapp: 'https://logo.clearbit.com/whatsapp.com',
  telegram: 'https://logo.clearbit.com/telegram.org',
  tiktok: 'https://logo.clearbit.com/tiktok.com',
  twitter: 'https://logo.clearbit.com/twitter.com',
  snapchat: 'https://logo.clearbit.com/snapchat.com',
  amazon: 'https://logo.clearbit.com/amazon.com',
  netflix: 'https://logo.clearbit.com/netflix.com',
  apple: 'https://logo.clearbit.com/apple.com',
  linkedin: 'https://logo.clearbit.com/linkedin.com',
  discord: 'https://logo.clearbit.com/discord.com',
  viber: 'https://logo.clearbit.com/viber.com',
  airbnb: 'https://logo.clearbit.com/airbnb.com',
  ebay: 'https://logo.clearbit.com/ebay.com',
  pof: 'https://logo.clearbit.com/pof.com',
  line: 'https://logo.clearbit.com/line.me',
  zoom: 'https://logo.clearbit.com/zoom.us',
  spotify: 'https://logo.clearbit.com/spotify.com',
  paypal: 'https://logo.clearbit.com/paypal.com',
  uber_eats: 'https://logo.clearbit.com/ubereats.com',
  booking: 'https://logo.clearbit.com/booking.com',
  badoo: 'https://logo.clearbit.com/badoo.com',
  steam: 'https://logo.clearbit.com/steampowered.com',
  vkontakte: 'https://logo.clearbit.com/vk.com',
  ok: 'https://logo.clearbit.com/ok.ru',
  wechat: 'https://logo.clearbit.com/wechat.com',
  shopee: 'https://logo.clearbit.com/shopee.com',
  lazada: 'https://logo.clearbit.com/lazada.com',
  grab: 'https://logo.clearbit.com/grab.com',
  gojek: 'https://logo.clearbit.com/gojek.com',
  aliexpress: 'https://logo.clearbit.com/aliexpress.com',
  alibaba: 'https://logo.clearbit.com/alibaba.com',
  chatgpt: 'https://logo.clearbit.com/openai.com',
  openai: 'https://logo.clearbit.com/openai.com',
  coinbase: 'https://logo.clearbit.com/coinbase.com',
  binance: 'https://logo.clearbit.com/binance.com',
  twitter_x: 'https://logo.clearbit.com/x.com',
  reddit: 'https://logo.clearbit.com/reddit.com',
  pinterest: 'https://logo.clearbit.com/pinterest.com',
  match: 'https://logo.clearbit.com/match.com',
  hinge: 'https://logo.clearbit.com/hinge.co',
  bumble: 'https://logo.clearbit.com/bumble.com',
  lyft: 'https://logo.clearbit.com/lyft.com',
  doordash: 'https://logo.clearbit.com/doordash.com',
  instacart: 'https://logo.clearbit.com/instacart.com',
  zoho: 'https://logo.clearbit.com/zoho.com',
  zomato: 'https://logo.clearbit.com/zomato.com',
  swiggy: 'https://logo.clearbit.com/swiggy.com',
};

const SERVICE_NOMS = {
  google: 'Google / Gmail / YouTube',
  youtube: 'YouTube / Google',
  gmail: 'Gmail / Google',
  facebook: 'Facebook / Meta',
  instagram: 'Instagram / Meta',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
  twitter_x: 'Twitter / X',
  snapchat: 'Snapchat',
  microsoft: 'Microsoft / Outlook',
  apple: 'Apple / iCloud',
  amazon: 'Amazon',
  netflix: 'Netflix',
  uber: 'Uber',
  uber_eats: 'Uber Eats',
  airbnb: 'Airbnb',
  linkedin: 'LinkedIn',
  discord: 'Discord',
  viber: 'Viber',
  chatgpt: 'ChatGPT / OpenAI',
  openai: 'OpenAI / ChatGPT',
  spotify: 'Spotify',
  paypal: 'PayPal',
  ebay: 'eBay',
  zoom: 'Zoom',
  tinder: 'Tinder',
  badoo: 'Badoo',
  bumble: 'Bumble',
  hinge: 'Hinge',
  match: 'Match.com',
  reddit: 'Reddit',
  pinterest: 'Pinterest',
  steam: 'Steam',
  vkontakte: 'VKontakte',
  wechat: 'WeChat',
  line: 'Line',
  grab: 'Grab',
  gojek: 'Gojek',
  shopee: 'Shopee',
  lazada: 'Lazada',
  alibaba: 'Alibaba',
  aliexpress: 'AliExpress',
  binance: 'Binance',
  coinbase: 'Coinbase',
  zoho: 'Zoho',
  zomato: 'Zomato',
  booking: 'Booking.com',
};

function getServiceNom(id) {
  return SERVICE_NOMS[id.toLowerCase()] || (id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g,' '));
}

function getServiceLogo(id) {
  const key = id.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (SERVICE_LOGOS[key]) return SERVICE_LOGOS[key];
  return `https://www.google.com/s2/favicons?domain=${key}.com&sz=64`;
}
let fivesimServicesCache = null;
let fivesimCacheTime = 0;

async function getFivesimServices() {
  const now = Date.now();
  if (fivesimServicesCache && (now - fivesimCacheTime) < 3600000) return fivesimServicesCache;
  const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
  if (!FIVESIM_KEY) return null;
  try {
    const r = await fetch('https://5sim.net/v1/guest/products/any/any', {
      headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    const data = await r.json();
    // Convertir en tableau trié par nombre de numéros
    const services = Object.entries(data).map(([id, info]) => ({
      id,
      nom: getServiceNom(id),
      logo: getServiceLogo(id),
      prix_usd: info.Cost || 0.01,
      count: info.Qty || 0,
      prix_points: Math.max(1, Math.ceil((info.Cost || 0.01) / 0.04)),
    })).filter(s => s.count > 0).sort((a,b) => b.count - a.count);
    fivesimServicesCache = services;
    fivesimCacheTime = now;
    return services;
  } catch(e) {
    console.warn('5SIM services erreur:', e.message);
    return null;
  }
}

app.get('/api/sms/services', async (req, res) => {
  const live = await getFivesimServices();
  if (live) return res.json(live);
  // Fallback liste statique
  res.json(SMS_SERVICES);
});
app.get('/api/sms/packs', (req, res) => res.json(SMS_PACKS));

// Acheter des points
app.post('/api/sms/acheter-points', async (req, res) => {
  try {
    const { userId, pack } = req.body;
    const p = SMS_PACKS[pack];
    if (!p) return res.status(400).json({ error: 'Pack invalide' });
    const lienWave = `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${p.prix}`;
    res.json({ success: true, lienWave, pack: p });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Confirmer achat points après paiement
app.post('/api/sms/confirmer-points', async (req, res) => {
  try {
    const { userId, pack } = req.body;
    const p = SMS_PACKS[pack];
    if (!p) return res.status(400).json({ error: 'Pack invalide' });
    if (db) {
      await db.collection('abonnes').updateOne(
        { userId },
        { $inc: { pointsSMS: p.points }, $push: { historiquePoints: { type: 'achat', points: p.points, pack, date: new Date() } } }
      );
    }
    res.json({ success: true, pointsAjoutes: p.points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Demander un numéro temporaire via 5SIM
app.post('/api/sms/demander-numero', async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const service = SMS_SERVICES.find(s => s.id === serviceId);
    if (!service) return res.status(400).json({ error: 'Service invalide' });

    const abonnes = await getAbonnes();
    const abonne = abonnes.find(a => a.userId === userId);
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });

    const points = abonne.pointsSMS || 0;
    if (points < service.prix_points) {
      return res.status(403).json({ error: 'Points insuffisants', pointsActuels: points, pointsNecessaires: service.prix_points });
    }

    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;

    if (FIVESIM_KEY) {
      // Appel API 5SIM réel
      try {
        const r = await fetch(`https://5sim.net/v1/user/buy/activation/any/any/${service.id}`, {
          headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' }
        });
        if (r.ok) {
          const data = await r.json();
          const activationId = 'FSIM-' + data.id;
          const expireAt = new Date(Date.now() + 20 * 60 * 1000);

          if (db) {
            await db.collection('abonnes').updateOne(
              { userId },
              {
                $inc: { pointsSMS: -service.prix_points },
                $push: { activationsSMS: { activationId, fivesimId: data.id, serviceId, service: service.nom, icon: service.icon, numeroTemp: data.phone, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } }
              }
            );
          }
          return res.json({ success: true, activationId, numeroTemp: data.phone, service: service.nom, expireAt, pointsRestants: points - service.prix_points });
        }
      } catch (fiveSimErr) {
        console.warn('5SIM erreur:', fiveSimErr.message);
      }
    }

    // Fallback simulé si pas de clé ou erreur
    const numeroTemp = '+1' + Math.floor(2000000000 + Math.random() * 8000000000);
    const activationId = 'ACT-' + Math.random().toString(36).slice(2,10).toUpperCase();
    const expireAt = new Date(Date.now() + 20 * 60 * 1000);

    if (db) {
      await db.collection('abonnes').updateOne(
        { userId },
        {
          $inc: { pointsSMS: -service.prix_points },
          $push: { activationsSMS: { activationId, serviceId, service: service.nom, icon: service.icon, numeroTemp, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } }
        }
      );
    }
    res.json({ success: true, activationId, numeroTemp, service: service.nom, expireAt, pointsRestants: points - service.prix_points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Vérifier SMS reçu via 5SIM
app.get('/api/sms/verifier/:activationId', async (req, res) => {
  try {
    const { activationId } = req.params;
    const { userId } = req.query;
    if (!db) return res.json({ activationId, statut: 'en_attente', smsRecu: null });

    const abonne = await db.collection('abonnes').findOne({ userId });
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });

    const activation = (abonne.activationsSMS || []).find(a => a.activationId === activationId);
    if (!activation) return res.status(404).json({ error: 'Activation introuvable' });

    // Si déjà reçu
    if (activation.smsRecu) return res.json({ activationId, statut: 'recu', smsRecu: activation.smsRecu });

    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;

    // Vérifier sur 5SIM si c'est une vraie activation
    if (FIVESIM_KEY && activation.fivesimId) {
      try {
        const r = await fetch(`https://5sim.net/v1/user/check/${activation.fivesimId}`, {
          headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' }
        });
        if (r.ok) {
          const data = await r.json();
          if (data.sms && data.sms.length > 0) {
            const smsText = data.sms[0].text;
            await db.collection('abonnes').updateOne(
              { userId, 'activationsSMS.activationId': activationId },
              { $set: { 'activationsSMS.$.smsRecu': smsText, 'activationsSMS.$.statut': 'recu' } }
            );
            return res.json({ activationId, statut: 'recu', smsRecu: smsText });
          }
        }
      } catch (e) { console.warn('5SIM check erreur:', e.message); }
    }

    return res.json({ activationId, statut: activation.statut, smsRecu: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin - stats SMS
app.get('/api/admin/sms-stats', async (req, res) => {
  try {
    if (!db) return res.json({ totalActivations: 0, pointsVendus: 0, revenusPoints: 0 });
    const abonnes = await db.collection('abonnes').find({}).toArray();
    let totalActivations = 0, pointsVendus = 0;
    abonnes.forEach(a => {
      totalActivations += (a.activationsSMS || []).length;
      (a.historiquePoints || []).forEach(h => { if (h.type === 'achat') pointsVendus += h.points; });
    });
    res.json({ totalActivations, pointsVendus, revenusPoints: Math.round(pointsVendus / 5 * 1000) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin - liste activations
app.get('/api/admin/activations', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const abonnes = await db.collection('abonnes').find({}).toArray();
    const activations = [];
    abonnes.forEach(a => {
      (a.activationsSMS || []).forEach(act => activations.push({ ...act, userId: a.userId, nom: a.nom, prenom: a.prenom }));
    });
    activations.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    res.json(activations.slice(0, 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin - ajouter points manuellement
app.post('/api/admin/ajouter-points', async (req, res) => {
  try {
    const { userId, points } = req.body;
    if (!db) return res.json({ success: true });
    await db.collection('abonnes').updateOne(
      { userId },
      { $inc: { pointsSMS: parseInt(points) }, $push: { historiquePoints: { type: 'admin', points: parseInt(points), date: new Date() } } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── STRIPE PAIEMENT ────────────────────────────────────────
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

// Créer une session de paiement Stripe
app.post('/api/paiement/stripe/creer', async (req, res) => {
  try {
    const { type, forfait, pack, userId, devise = 'usd' } = req.body;
    if (!STRIPE_SECRET) return res.status(503).json({ error: 'Stripe non configuré' });

    const stripe = require('stripe')(STRIPE_SECRET);

    let montant, description, currency;

    if (devise === 'xof') {
      // FCFA — Stripe supporte XOF
      currency = 'xof';
      if (type === 'forfait') {
        const f = FORFAITS[forfait];
        if (!f) return res.status(400).json({ error: 'Forfait invalide' });
        montant = f.prix; // déjà en FCFA
        description = `PST Forfait ${f.nom} — ${f.minutes === 99999 ? 'Illimité' : f.minutes + ' min'}`;
      } else {
        const p = SMS_PACKS[pack];
        if (!p) return res.status(400).json({ error: 'Pack invalide' });
        montant = p.prix;
        description = `PST ${p.label} SMS`;
      }
    } else {
      // USD
      currency = 'usd';
      if (type === 'forfait') {
        const f = FORFAITS[forfait];
        if (!f) return res.status(400).json({ error: 'Forfait invalide' });
        montant = Math.round(f.prix / 600 * 100); // FCFA → centimes USD
        description = `PST Forfait ${f.nom}`;
      } else {
        const p = SMS_PACKS[pack];
        if (!p) return res.status(400).json({ error: 'Pack invalide' });
        montant = Math.round(p.prix / 600 * 100);
        description = `PST ${p.label} SMS`;
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: description, description: 'Pure Smart Telecom' },
          unit_amount: montant,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://pst-telecom-production.up.railway.app/dashboard?paiement=success&type=${type}&ref=${userId}`,
      cancel_url: `https://pst-telecom-production.up.railway.app/dashboard?paiement=cancel`,
      metadata: { userId, type, forfait: forfait || '', pack: pack || '' },
    });

    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Webhook Stripe — confirmation paiement
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_SECRET) return res.json({ received: true });

  try {
    const stripe = require('stripe')(STRIPE_SECRET);
    let event;
    if (WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { userId, type, forfait, pack } = session.metadata;

      if (type === 'forfait' && userId) {
        await updateAbonne(userId, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date() });
      } else if (type === 'sms' && pack && userId) {
        const p = SMS_PACKS[pack];
        if (p && db) {
          await db.collection('abonnes').updateOne(
            { userId },
            { $inc: { pointsSMS: p.points }, $push: { historiquePoints: { type: 'stripe', points: p.points, pack, date: new Date() } } }
          );
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook Stripe erreur:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── INSCRIPTION SMS RAPIDE ─────────────────────────────────
app.post('/api/sms/inscription', async (req, res) => {
  try {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et téléphone obligatoires' });

    // Vérifier si déjà inscrit
    if (db) {
      const exist = await db.collection('comptes_sms').findOne({ telephone });
      if (exist) return res.json({ success: true, userId: exist.userId, nouveau: false });
    }

    const userId = 'SMS-' + Math.random().toString(16).slice(2,10).toUpperCase();
    const compte = {
      userId, nom, telephone,
      pointsSMS: 0,
      type: 'sms_only',
      createdAt: new Date(),
      activationsSMS: [],
      historiquePoints: [],
    };

    if (db) await db.collection('comptes_sms').insertOne(compte);

    res.json({ success: true, userId, nouveau: true, message: `Compte SMS créé ! Votre ID : ${userId}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Connexion compte SMS
app.post('/api/sms/connexion', async (req, res) => {
  try {
    const { userId, telephone } = req.body;
    if (!db) return res.status(503).json({ error: 'DB non disponible' });

    // Chercher dans comptes_sms ET abonnes
    let compte = await db.collection('comptes_sms').findOne({ userId, telephone });
    if (!compte) {
      const abonne = await db.collection('abonnes').findOne({ userId, telephone });
      if (abonne) compte = abonne;
    }
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });

    res.json({ success: true, compte });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Points SMS pour compte SMS-only
app.get('/api/sms/compte/:userId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    const compte = await db.collection('comptes_sms').findOne({ userId: req.params.userId })
      || await db.collection('abonnes').findOne({ userId: req.params.userId });
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ userId: compte.userId, nom: compte.nom, pointsSMS: compte.pointsSMS || 0, type: compte.type || 'abonne' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});// ═══ ROUTES PAIEMENTS ════════════════════════════════════

// Lister tous les paiements
app.get('/api/admin/payments', async (req, res) => {
  try {
    const payments = await db.collection('payments').find({}).sort({ createdAt: -1 }).toArray();
    res.json(payments);
  } catch (e) { res.json([]); }
});

// Enregistrer un paiement manuel
app.post('/api/admin/payments', async (req, res) => {
  try {
    const { userId, montant, moyen, type, reference, statut } = req.body;
    if (!userId || !montant) return res.status(400).json({ error: 'userId et montant requis' });
    const payment = {
      userId, montant: parseInt(montant), moyen: moyen || 'wave',
      type: type || 'forfait', reference: reference || '',
      statut: statut || 'en_attente', createdAt: new Date()
    };
    const result = await db.collection('payments').insertOne(payment);
    await db.collection('activity_logs').insertOne({
      type: 'paiement', message: `Paiement ${montant} FCFA enregistré pour ${userId} (${moyen})`,
      createdAt: new Date()
    });
    res.json({ success: true, id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Valider un paiement et activer l'abonné
app.post('/api/admin/payments/:id/validate', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const payment = await db.collection('payments').findOne({ _id: new ObjectId(req.params.id) });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    await db.collection('payments').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { statut: 'confirme', validatedAt: new Date() } }
    );
    // Activer l'abonné
    await db.collection('abonnes').updateOne(
      { userId: payment.userId },
      { $set: { statut: 'actif', activatedAt: new Date() } }
    );
    await db.collection('activity_logs').insertOne({
      type: 'activation', message: `Paiement validé — ${payment.userId} activé (${payment.montant} FCFA)`,
      createdAt: new Date()
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Supprimer une transaction
app.delete('/api/admin/payments/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    await db.collection('payments').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ═══ ROUTES ADMIN ═══════════════════════════════════════

const SUPER_ADMINS = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (password !== (process.env.ADMIN_PASSWORD || 'pst-admin-2026')) return res.status(403).json({ error: 'Mot de passe incorrect' });
  const isSuper = SUPER_ADMINS.includes(email.toLowerCase());
  res.json({ success: true, role: isSuper ? 'super' : 'admin', name: email.split('@')[0] });
});

app.get('/api/admin/activity', async (req, res) => {
  try {
    const logs = await db.collection('activity_logs').find({}).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(logs.map(l => ({ type: l.type, message: l.message, time: new Date(l.createdAt).toLocaleTimeString('fr-FR') })));
  } catch (e) { res.json([]); }
});

app.get('/api/admin/sms-users', async (req, res) => {
  try {
    const users = await db.collection('sms_users').find({}).sort({ createdAt: -1 }).toArray();
    res.json(users);
  } catch (e) { res.json([]); }
});

app.post('/api/admin/users/:id/activate', async (req, res) => {
  try {
    await db.collection('abonnes').updateOne({ userId: req.params.id }, { $set: { statut: 'actif' } });
    await db.collection('activity_logs').insertOne({ type: 'activation', message: `Abonné ${req.params.id} activé`, createdAt: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/suspend', async (req, res) => {
  try {
    await db.collection('abonnes').updateOne({ userId: req.params.id }, { $set: { statut: 'suspendu' } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/users/:id', async (req, res) => {
  try {
    const { forfait, minutesBonus } = req.body;
    const update = { $set: {} };
    if (forfait) update.$set.forfait = forfait;
    if (minutesBonus) update.$inc = { minutes: parseInt(minutesBonus) };
    await db.collection('abonnes').updateOne({ userId: req.params.id }, update);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await db.collection('abonnes').deleteOne({ userId: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/content', async (req, res) => {
  try {
    const content = await db.collection('site_content').findOne({});
    res.json(content || {});
  } catch (e) { res.json({}); }
});

app.post('/api/admin/content', async (req, res) => {
  try {
    await db.collection('site_content').updateOne({}, { $set: req.body }, { upsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
