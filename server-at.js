const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const app = express();

// ─── SECURITY HEADERS (Helmet-like) ──────────────────────────
app.use(function(req, res, next) {
  // Pages NOC et SecurCam : pas de restrictions sur les iframes (YouTube, cameras IP)
  if (req.path === '/noc' || req.path === '/securcam' || req.path === '/agent') {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // Pas de CSP ni X-Frame-Options sur ces pages
    return next();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self' https:; " +
    "script-src 'self' 'unsafe-inline' https://checkout.flutterwave.com https://fonts.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "frame-src *; " +
    "connect-src 'self' https://pst-telecom-production.up.railway.app https://api.flutterwave.com https://api.anthropic.com;"
  );
  next();
});

app.use(cors({
  origin: ['https://pst-telecom.vercel.app', 'https://pst-telecom-production.up.railway.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const MONGODB_URI = process.env.MONGODB_URI;
const AT_API_KEY  = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const PORT        = process.env.PORT || 3001;
const JWT_SECRET  = process.env.JWT_SECRET || 'pst-secret-2026-xk9m';
const IS_PROD     = process.env.NODE_ENV === 'production';

// En production, ne pas exposer les détails des erreurs
function safeError(err) {
  if (IS_PROD) return 'Une erreur est survenue — contactez PST';
  return err.message || 'Erreur inconnue';
}

// ─── LOGS SÉCURITÉ ────────────────────────────────────────────
const suspectLogs = [];

async function logSuspect(type, ip, details) {
  const entry = { type, ip, details, createdAt: new Date() };
  suspectLogs.push(entry);
  if (suspectLogs.length > 500) suspectLogs.shift();
  console.warn(`🚨 SUSPECT [${type}] IP:${ip} — ${details}`);
  if (db) {
    try {
      await db.collection('security_logs').insertOne(entry);
    } catch(e) {}
  }
}

// Middleware de surveillance des tentatives suspectes
const failedAttempts = new Map();

function trackFailed(ip, route) {
  const key = ip + ':' + route;
  const now = Date.now();
  const attempts = (failedAttempts.get(key) || []).filter(function(t) { return t > now - 15*60*1000; });
  attempts.push(now);
  failedAttempts.set(key, attempts);
  if (attempts.length >= 5) {
    logSuspect('BRUTE_FORCE', ip, `${attempts.length} tentatives échouées sur ${route}`);
  }
  return attempts.length;
}

// ─── BACKUP AUTOMATIQUE ───────────────────────────────────────
async function backupData() {
  if (!db) return;
  try {
    const timestamp = new Date().toISOString().slice(0,10);
    const abonnes = await db.collection('abonnes').find({}).toArray();
    const recharges = await db.collection('recharges').find({}).sort({createdAt:-1}).limit(1000).toArray();
    const campagnes = await db.collection('sms_campagnes').find({}, {projection:{messages:0}}).toArray();

    await db.collection('backups').updateOne(
      { date: timestamp },
      { $set: {
        date: timestamp,
        abonnes_count: abonnes.length,
        recharges_count: recharges.length,
        campagnes_count: campagnes.length,
        snapshot: {
          abonnes: abonnes.slice(0, 500),
          recharges: recharges.slice(0, 200),
        },
        createdAt: new Date()
      }},
      { upsert: true }
    );
    console.log(`✅ Backup automatique — ${timestamp} — ${abonnes.length} abonnés`);
  } catch(e) {
    console.warn('⚠️ Backup échoué:', e.message);
  }
}

// Route admin pour voir les logs sécurité
// (ajoutée après connectDB)

// ─── RATE LIMITING ────────────────────────────────────────────
const rateLimitMap = new Map();

function rateLimit(maxReq, windowMs) {
  return function(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = ip + ':' + req.path;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, []);
    }
    const requests = rateLimitMap.get(key).filter(function(t) { return t > windowStart; });
    requests.push(now);
    rateLimitMap.set(key, requests);

    if (requests.length > maxReq) {
      return res.status(429).json({ error: 'Trop de requêtes — réessayez dans quelques minutes' });
    }
    next();
  };
}

// Nettoyage toutes les 5 minutes
setInterval(function() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  rateLimitMap.forEach(function(val, key) {
    const filtered = val.filter(function(t) { return t > cutoff; });
    if (filtered.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, filtered);
  });
}, 5 * 60 * 1000);

// Rate limits par route
const limitGeneral  = rateLimit(100, 15 * 60 * 1000); // 100 req/15min
const limitAuth     = rateLimit(10,  15 * 60 * 1000); // 10 tentatives/15min
const limitRecharge = rateLimit(20,  60 * 60 * 1000); // 20 recharges/heure
const limitSMS      = rateLimit(5,   60 * 60 * 1000); // 5 campagnes/heure

app.use(limitGeneral);

// ─── JWT ──────────────────────────────────────────────────────
function signJWT(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch(e) { return null; }
}

function authJWT(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token requis — connectez-vous' });
  const payload = verifyJWT(token);
  if (!payload) return res.status(401).json({ error: 'Token invalide ou expiré — reconnectez-vous' });
  req.user = payload;
  next();
}

// authJWT optionnel — ne bloque pas mais enrichit req.user
function authJWTOptional(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token) { req.user = verifyJWT(token) || null; }
  next();
}

let db;

async function connectDB() {
  if (!MONGODB_URI) { console.warn('⚠️  MONGODB_URI manquant — mode mémoire activé'); return; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('pst_telecom');
    console.log('✅ MongoDB Atlas connecté');
  } catch (err) { console.error('❌ MongoDB erreur:', err.message); }
}

function getAT() {
  if (!AT_API_KEY) return null;
  try { const AfricasTalking = require('africastalking'); return AfricasTalking({ apiKey: AT_API_KEY, username: AT_USERNAME }); }
  catch { return null; }
}

const FORFAITS = {
  starter:  { nom: 'Starter',  minutes: 200,   prix: 2990  },
  smart:    { nom: 'Smart',    minutes: 300,   prix: 5990  },
  business: { nom: 'Business', minutes: 99999, prix: 15990 },
};

function genUserId() { return 'PST-' + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genNumero() {
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
  if (db) { await db.collection('abonnes').insertOne(abonne); }
  else { global._abonnes = global._abonnes || []; global._abonnes.push(abonne); }
}
async function updateAbonne(userId, update) {
  if (db) { await db.collection('abonnes').updateOne({ userId }, { $set: update }); }
  else { global._abonnes = (global._abonnes || []).map(a => a.userId === userId ? { ...a, ...update } : a); }
}
async function deleteAbonne(userId) {
  if (db) { await db.collection('abonnes').deleteOne({ userId }); }
  else { global._abonnes = (global._abonnes || []).filter(a => a.userId !== userId); }
}

app.get('/', (req, res) => { res.redirect('https://pst-telecom.vercel.app'); });

function authAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pst-admin-2026';
  if (token !== ADMIN_PASSWORD) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PST Admin</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:sans-serif;background:#0d2137;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;}.box{background:#111c2a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:2rem;width:320px;text-align:center;}.logo{font-size:2rem;font-weight:900;color:#00c864;margin-bottom:0.5rem;}.sub{font-size:0.8rem;color:#7a8f9e;margin-bottom:2rem;}input{width:100%;padding:0.85rem;background:#0d2137;border:1.5px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:1rem;outline:none;margin-bottom:1rem;}.btn{width:100%;padding:0.85rem;background:#00c864;color:#0d2137;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;}.err{color:#f44336;font-size:0.82rem;margin-top:0.75rem;display:none;}</style></head><body><div class="box"><div class="logo">PST</div><div class="sub">Dashboard Admin</div><input type="password" id="pwd" placeholder="Mot de passe admin" onkeydown="if(event.key==='Enter')login()"/><button class="btn" onclick="login()">Accéder →</button><div class="err" id="err">Mot de passe incorrect</div></div><script>function login(){const p=document.getElementById('pwd').value;if(p)window.location.href='/admin?token='+encodeURIComponent(p);else{document.getElementById('err').style.display='block';}}</script></body></html>`);
  }
  next();
}

app.get('/admin', authAdmin, (req, res) => { res.sendFile(path.join(__dirname, 'admin.html')); });
app.get('/xlsx.js', (req, res) => { res.sendFile(require('path').join(__dirname, 'xlsx.full.min.js')); });
app.get('/sms-marketing', (req, res) => { res.sendFile(path.join(__dirname, 'sms-marketing.html')); });
app.get('/appel', (req, res) => { res.sendFile(path.join(__dirname, 'appel.html')); });
app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'dashboard.html')); });
app.get('/sms', (req, res) => { res.sendFile(path.join(__dirname, 'sms.html')); });
app.get('/recharge', (req, res) => { res.sendFile(path.join(__dirname, 'recharge.html')); });

// ─── VALIDATION DES INPUTS ───────────────────────────────────
function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen || 200).replace(/[<>{}]/g, '');
}

function validateTelephone(tel) {
  const clean = String(tel || '').replace(/[\s\-\(\)]/g, '');
  return /^\+?[0-9]{8,15}$/.test(clean) ? clean : null;
}

function validateMontant(val, min, max) {
  const n = parseInt(val);
  if (isNaN(n) || n < (min||1) || n > (max||100000)) return null;
  return n;
}

function validateRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const clean = ref.trim().toUpperCase();
  if (clean.length < 3 || clean.length > 100) return null;
  return clean;
}

// ─── AUTH CLIENT JWT ─────────────────────────────────────────
app.post('/api/auth/login', limitAuth, async (req, res) => {
  try {
    const { userId, telephone } = req.body;
    if (!userId || !telephone) return res.status(400).json({ error: 'userId et téléphone requis' });
    const abonnes = await getAbonnes();
    const abonne = abonnes.find(function(a) { return a.userId === userId && a.telephone === telephone; });
    if (!abonne) {
      const ip = req.ip || 'unknown';
      trackFailed(ip, '/api/auth/login');
      return res.status(404).json({ error: 'Compte introuvable' });
    }
    const token = signJWT({ userId: abonne.userId, telephone, role: 'client' });
    res.json({ success: true, token, abonne: { userId: abonne.userId, nom: abonne.nom, prenom: abonne.prenom, forfait: abonne.forfait, statut: abonne.statut, minutes: abonne.minutes, minutesUsees: abonne.minutesUsees, numeroVirtuel: abonne.numeroVirtuel } });
  } catch(err) { res.status(500).json({ error: safeError(err) }); }
});

app.get('/api/auth/me', authJWT, async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    const abonne = abonnes.find(function(a) { return a.userId === req.user.userId; });
    if (!abonne) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ success: true, abonne });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    const total   = abonnes.length;
    const actifs  = abonnes.filter(a => a.statut === 'actif').length;
    const attente = abonnes.filter(a => a.statut === 'en_attente').length;
    const revenus = abonnes.filter(a => a.statut === 'actif').reduce((sum, a) => sum + (FORFAITS[a.forfait]?.prix || 0), 0);
    res.json({ total, actifs, attente, revenus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/abonnes', async (req, res) => {
  try { res.json(await getAbonnes()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', limitAuth, async (req, res) => {
  try {
    const nom = sanitize(req.body.nom, 100);
    const prenom = sanitize(req.body.prenom, 100);
    const telephone = validateTelephone(req.body.telephone);
    const forfait = ['starter','smart','business'].includes(req.body.forfait) ? req.body.forfait : 'smart';

    if (!nom || nom.length < 2) return res.status(400).json({ error: 'Nom invalide' });
    if (!telephone) return res.status(400).json({ error: 'Numéro de téléphone invalide' });

    const f = FORFAITS[forfait] || FORFAITS.smart;
    const abonne = { userId: genUserId(), nom, prenom, telephone, forfait, forfaitNom: f.nom, minutes: f.minutes, minutesUsees: 0, prix: f.prix, numeroVirtuel: genNumero(), statut: 'en_attente', createdAt: new Date(), updatedAt: new Date(), paiements: [] };
    await saveAbonne(abonne);
    const at = getAT();
    if (at) { try { await at.SMS.send({ to: telephone, message: `Bienvenue sur PST ! Forfait ${f.nom} en cours d'activation. ID: ${abonne.userId}`, from: 'PST' }); } catch (e) {} }
    const lienWave = `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${f.prix}`;
    res.json({ success: true, userId: abonne.userId, numeroVirtuel: abonne.numeroVirtuel, lienWave, message: `Compte PST créé ! Forfait ${f.nom} — ${f.prix} FCFA` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/activer/:userId', async (req, res) => {
  try {
    await updateAbonne(req.params.userId, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date() });
    res.json({ success: true, message: 'Abonné activé' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/suspendre/:userId', async (req, res) => {
  try { await updateAbonne(req.params.userId, { statut: 'suspendu', updatedAt: new Date() }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/abonne/:userId', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait, minutesBonus } = req.body;
    const update = { updatedAt: new Date() };
    if (nom) update.nom = nom;
    if (prenom) update.prenom = prenom;
    if (telephone) update.telephone = telephone;
    if (forfait && FORFAITS[forfait]) { update.forfait = forfait; update.forfaitNom = FORFAITS[forfait].nom; update.prix = FORFAITS[forfait].prix; update.minutes = FORFAITS[forfait].minutes; }
    if (minutesBonus && db) { await db.collection('abonnes').updateOne({ userId: req.params.userId }, { $inc: { minutes: parseInt(minutesBonus) }, $set: update }); }
    else { await updateAbonne(req.params.userId, update); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/abonne/:userId', async (req, res) => {
  try { await deleteAbonne(req.params.userId); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appel/initier', async (req, res) => {
  try {
    const { userId, numeroDestination } = req.body;
    const abonnes = await getAbonnes();
    const abonne  = abonnes.find(a => a.userId === userId);
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    if (abonne.statut !== 'actif') return res.status(403).json({ error: 'Forfait non actif' });
    res.json({ success: true, callId: 'CALL-DEMO-' + Math.random().toString(16).slice(2,8).toUpperCase(), type: 'sandbox', message: `[SANDBOX] Appel simulé vers ${numeroDestination}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/webhook/wave', async (req, res) => {
  try {
    const { amount, client_reference } = req.body;
    if (client_reference) { await updateAbonne(client_reference, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date(), paiementWave: { amount, date: new Date() } }); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const SMS_PACKS = {
  pack1: { points: 5,  prix: 1000, label: '5 points' },
  pack2: { points: 12, prix: 2000, label: '12 points' },
  pack3: { points: 30, prix: 4500, label: '30 points' },
  pack4: { points: 70, prix: 9000, label: '70 points' },
};

const SMS_SERVICES = [
  { id: 'whatsapp',  nom: 'WhatsApp',       icon: '💬', prix_points: 1 },
  { id: 'google',    nom: 'Google / Gmail',  icon: '🔵', prix_points: 1 },
  { id: 'facebook',  nom: 'Facebook',        icon: '📘', prix_points: 1 },
  { id: 'instagram', nom: 'Instagram',       icon: '📸', prix_points: 1 },
  { id: 'tiktok',    nom: 'TikTok',          icon: '🎵', prix_points: 1 },
  { id: 'telegram',  nom: 'Telegram',        icon: '✈️',  prix_points: 1 },
  { id: 'twitter',   nom: 'Twitter / X',     icon: '🐦', prix_points: 1 },
  { id: 'snapchat',  nom: 'Snapchat',        icon: '👻', prix_points: 1 },
  { id: 'microsoft', nom: 'Microsoft',       icon: '🪟', prix_points: 2 },
  { id: 'apple',     nom: 'Apple',           icon: '🍎', prix_points: 2 },
  { id: 'amazon',    nom: 'Amazon',          icon: '📦', prix_points: 2 },
  { id: 'netflix',   nom: 'Netflix',         icon: '🎬', prix_points: 2 },
  { id: 'uber',      nom: 'Uber',            icon: '🚗', prix_points: 1 },
  { id: 'airbnb',    nom: 'Airbnb',          icon: '🏠', prix_points: 2 },
  { id: 'linkedin',  nom: 'LinkedIn',        icon: '💼', prix_points: 1 },
  { id: 'chatgpt',   nom: 'OpenAI/ChatGPT',  icon: '🤖', prix_points: 2 },
  { id: 'discord',   nom: 'Discord',         icon: '🎮', prix_points: 1 },
  { id: 'viber',     nom: 'Viber',           icon: '📱', prix_points: 1 },
];

function getServiceNom(id) {
  const noms = { google:'Google / Gmail',facebook:'Facebook',instagram:'Instagram',whatsapp:'WhatsApp',telegram:'Telegram',tiktok:'TikTok',twitter:'Twitter / X',snapchat:'Snapchat',microsoft:'Microsoft',apple:'Apple',amazon:'Amazon',netflix:'Netflix',uber:'Uber',airbnb:'Airbnb',linkedin:'LinkedIn',discord:'Discord',viber:'Viber',chatgpt:'ChatGPT / OpenAI',spotify:'Spotify',paypal:'PayPal' };
  return noms[id.toLowerCase()] || (id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g,' '));
}
function getServiceLogo(id) {
  const logos = { uber:'uber.com',instagram:'instagram.com',microsoft:'microsoft.com',google:'google.com',facebook:'facebook.com',whatsapp:'whatsapp.com',telegram:'telegram.org',tiktok:'tiktok.com',twitter:'twitter.com',snapchat:'snapchat.com',amazon:'amazon.com',netflix:'netflix.com',apple:'apple.com',linkedin:'linkedin.com',discord:'discord.com',viber:'viber.com',airbnb:'airbnb.com',chatgpt:'openai.com',spotify:'spotify.com',paypal:'paypal.com' };
  const domain = logos[id.toLowerCase()];
  return domain ? `https://logo.clearbit.com/${domain}` : `https://www.google.com/s2/favicons?domain=${id}.com&sz=64`;
}

let fivesimServicesCache = null, fivesimCacheTime = 0;
async function getFivesimServices() {
  const now = Date.now();
  if (fivesimServicesCache && (now - fivesimCacheTime) < 3600000) return fivesimServicesCache;
  const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
  if (!FIVESIM_KEY) return null;
  try {
    const r = await fetch('https://5sim.net/v1/guest/products/any/any', { headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' } });
    if (!r.ok) return null;
    const data = await r.json();
    const services = Object.entries(data).map(([id, info]) => ({ id, nom: getServiceNom(id), logo: getServiceLogo(id), prix_usd: info.Cost || 0.01, count: info.Qty || 0, prix_points: Math.max(1, Math.ceil((info.Cost || 0.01) / 0.04)) })).filter(s => s.count > 0).sort((a,b) => b.count - a.count);
    fivesimServicesCache = services; fivesimCacheTime = now;
    return services;
  } catch(e) { return null; }
}

app.get('/api/sms/services', async (req, res) => { const live = await getFivesimServices(); if (live) return res.json(live); res.json(SMS_SERVICES); });
app.get('/api/sms/packs', (req, res) => res.json(SMS_PACKS));

app.post('/api/sms/acheter-points', async (req, res) => {
  try { const { pack } = req.body; const p = SMS_PACKS[pack]; if (!p) return res.status(400).json({ error: 'Pack invalide' }); res.json({ success: true, lienWave: `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${p.prix}`, pack: p }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sms/confirmer-points', async (req, res) => {
  try {
    const { userId, pack } = req.body; const p = SMS_PACKS[pack]; if (!p) return res.status(400).json({ error: 'Pack invalide' });
    if (db) { await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: p.points }, $push: { historiquePoints: { type: 'achat', points: p.points, pack, date: new Date() } } }); }
    res.json({ success: true, pointsAjoutes: p.points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sms/demander-numero', async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const service = SMS_SERVICES.find(s => s.id === serviceId);
    if (!service) return res.status(400).json({ error: 'Service invalide' });
    const abonnes = await getAbonnes();
    const abonne = abonnes.find(a => a.userId === userId);
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    const points = abonne.pointsSMS || 0;
    if (points < service.prix_points) return res.status(403).json({ error: 'Points insuffisants', pointsActuels: points, pointsNecessaires: service.prix_points });
    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
    if (FIVESIM_KEY) {
      try {
        const r = await fetch(`https://5sim.net/v1/user/buy/activation/any/any/${service.id}`, { headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' } });
        if (r.ok) {
          const data = await r.json();
          const activationId = 'FSIM-' + data.id;
          const expireAt = new Date(Date.now() + 20 * 60 * 1000);
          if (db) { await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: -service.prix_points }, $push: { activationsSMS: { activationId, fivesimId: data.id, serviceId, service: service.nom, icon: service.icon, numeroTemp: data.phone, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } } }); }
          return res.json({ success: true, activationId, numeroTemp: data.phone, service: service.nom, expireAt, pointsRestants: points - service.prix_points });
        }
      } catch (e) {}
    }
    const numeroTemp = '+1' + Math.floor(2000000000 + Math.random() * 8000000000);
    const activationId = 'ACT-' + Math.random().toString(36).slice(2,10).toUpperCase();
    const expireAt = new Date(Date.now() + 20 * 60 * 1000);
    if (db) { await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: -service.prix_points }, $push: { activationsSMS: { activationId, serviceId, service: service.nom, icon: service.icon, numeroTemp, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } } }); }
    res.json({ success: true, activationId, numeroTemp, service: service.nom, expireAt, pointsRestants: points - service.prix_points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sms/verifier/:activationId', async (req, res) => {
  try {
    const { activationId } = req.params; const { userId } = req.query;
    if (!db) return res.json({ activationId, statut: 'en_attente', smsRecu: null });
    const abonne = await db.collection('abonnes').findOne({ userId });
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    const activation = (abonne.activationsSMS || []).find(a => a.activationId === activationId);
    if (!activation) return res.status(404).json({ error: 'Activation introuvable' });
    if (activation.smsRecu) return res.json({ activationId, statut: 'recu', smsRecu: activation.smsRecu });
    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
    if (FIVESIM_KEY && activation.fivesimId) {
      try {
        const r = await fetch(`https://5sim.net/v1/user/check/${activation.fivesimId}`, { headers: { 'Authorization': `Bearer ${FIVESIM_KEY}`, 'Accept': 'application/json' } });
        if (r.ok) {
          const data = await r.json();
          if (data.sms && data.sms.length > 0) {
            const smsText = data.sms[0].text;
            await db.collection('abonnes').updateOne({ userId, 'activationsSMS.activationId': activationId }, { $set: { 'activationsSMS.$.smsRecu': smsText, 'activationsSMS.$.statut': 'recu' } });
            return res.json({ activationId, statut: 'recu', smsRecu: smsText });
          }
        }
      } catch (e) {}
    }
    return res.json({ activationId, statut: activation.statut, smsRecu: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/sms-stats', async (req, res) => {
  try {
    if (!db) return res.json({ totalActivations: 0, pointsVendus: 0, revenusPoints: 0 });
    const abonnes = await db.collection('abonnes').find({}).toArray();
    let totalActivations = 0, pointsVendus = 0;
    abonnes.forEach(a => { totalActivations += (a.activationsSMS || []).length; (a.historiquePoints || []).forEach(h => { if (h.type === 'achat') pointsVendus += h.points; }); });
    res.json({ totalActivations, pointsVendus, revenusPoints: Math.round(pointsVendus / 5 * 1000) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/activations', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const abonnes = await db.collection('abonnes').find({}).toArray();
    const activations = [];
    abonnes.forEach(a => { (a.activationsSMS || []).forEach(act => activations.push({ ...act, userId: a.userId, nom: a.nom, prenom: a.prenom })); });
    activations.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    res.json(activations.slice(0, 100));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/ajouter-points', async (req, res) => {
  try {
    const { userId, points } = req.body;
    if (!db) return res.json({ success: true });
    await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: parseInt(points) }, $push: { historiquePoints: { type: 'admin', points: parseInt(points), date: new Date() } } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sms/inscription', async (req, res) => {
  try {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
    if (db) { const exist = await db.collection('comptes_sms').findOne({ telephone }); if (exist) return res.json({ success: true, userId: exist.userId, nouveau: false }); }
    const userId = 'SMS-' + Math.random().toString(16).slice(2,10).toUpperCase();
    const compte = { userId, nom, telephone, pointsSMS: 0, type: 'sms_only', createdAt: new Date(), activationsSMS: [], historiquePoints: [] };
    if (db) await db.collection('comptes_sms').insertOne(compte);
    res.json({ success: true, userId, nouveau: true, message: `Compte SMS créé ! Votre ID : ${userId}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sms/connexion', async (req, res) => {
  try {
    const { userId, telephone } = req.body;
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    let compte = await db.collection('comptes_sms').findOne({ userId, telephone });
    if (!compte) { const abonne = await db.collection('abonnes').findOne({ userId, telephone }); if (abonne) compte = abonne; }
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ success: true, compte });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sms/compte/:userId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    const compte = await db.collection('comptes_sms').findOne({ userId: req.params.userId }) || await db.collection('abonnes').findOne({ userId: req.params.userId });
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ userId: compte.userId, nom: compte.nom, pointsSMS: compte.pointsSMS || 0, type: compte.type || 'abonne' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/payments', async (req, res) => {
  try { const payments = await db.collection('payments').find({}).sort({ createdAt: -1 }).toArray(); res.json(payments); }
  catch (e) { res.json([]); }
});

app.post('/api/admin/payments', async (req, res) => {
  try {
    const { userId, montant, moyen, type, reference, statut } = req.body;
    if (!userId || !montant) return res.status(400).json({ error: 'userId et montant requis' });
    const payment = { userId, montant: parseInt(montant), moyen: moyen || 'wave', type: type || 'forfait', reference: reference || '', statut: statut || 'en_attente', createdAt: new Date() };
    const result = await db.collection('payments').insertOne(payment);
    await db.collection('activity_logs').insertOne({ type: 'paiement', message: `Paiement ${montant} FCFA enregistré pour ${userId} (${moyen})`, createdAt: new Date() });
    res.json({ success: true, id: result.insertedId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/payments/:id/validate', async (req, res) => {
  try {
    const payment = await db.collection('payments').findOne({ _id: new ObjectId(req.params.id) });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    await db.collection('payments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { statut: 'confirme', validatedAt: new Date() } });
    await db.collection('abonnes').updateOne({ userId: payment.userId }, { $set: { statut: 'actif', activatedAt: new Date() } });
    await db.collection('activity_logs').insertOne({ type: 'activation', message: `Paiement validé — ${payment.userId} activé (${payment.montant} FCFA)`, createdAt: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/payments/:id', async (req, res) => {
  try { await db.collection('payments').deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flutterwave/confirm', async (req, res) => {
  try {
    const { tx_ref, userId, transaction_id } = req.body;
    if (!tx_ref || !userId) return res.status(400).json({ error: 'Données manquantes' });
    const FLW_SECRET = process.env.FLW_SECRET_KEY;
    const verify = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, { headers: { Authorization: `Bearer ${FLW_SECRET}` } });
    const verifyData = await verify.json();
    if (verifyData.data && verifyData.data.status === 'successful') {
      const montant = verifyData.data.amount;
      await db.collection('payments').insertOne({ userId, montant, moyen: 'flutterwave_card', type: 'forfait', reference: tx_ref, statut: 'confirme', transaction_id, createdAt: new Date() });
      await db.collection('abonnes').updateOne({ userId }, { $set: { statut: 'actif', activatedAt: new Date() } });
      await db.collection('activity_logs').insertOne({ type: 'paiement', message: `Paiement carte ${montant} XOF confirmé pour ${userId}`, createdAt: new Date() });
      res.json({ success: true });
    } else { res.status(400).json({ error: 'Paiement non vérifié' }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flutterwave/webhook', async (req, res) => {
  try {
    const payload = req.body;
    if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
      const tx_ref = payload.data.tx_ref;
      const userId = tx_ref.split('-')[1];
      const montant = payload.data.amount;
      await db.collection('payments').insertOne({ userId, montant, moyen: 'flutterwave_card', type: 'forfait', reference: tx_ref, statut: 'confirme', createdAt: new Date() });
      await db.collection('abonnes').updateOne({ userId }, { $set: { statut: 'actif', activatedAt: new Date() } });
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

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
  try { const users = await db.collection('sms_users').find({}).sort({ createdAt: -1 }).toArray(); res.json(users); }
  catch (e) { res.json([]); }
});

app.post('/api/admin/users/:id/activate', async (req, res) => {
  try {
    await db.collection('abonnes').updateOne({ userId: req.params.id }, { $set: { statut: 'actif' } });
    await db.collection('activity_logs').insertOne({ type: 'activation', message: `Abonné ${req.params.id} activé`, createdAt: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/:id/suspend', async (req, res) => {
  try { await db.collection('abonnes').updateOne({ userId: req.params.id }, { $set: { statut: 'suspendu' } }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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
  try { await db.collection('abonnes').deleteOne({ userId: req.params.id }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/content', async (req, res) => {
  try { const content = await db.collection('site_content').findOne({}); res.json(content || {}); }
  catch (e) { res.json({}); }
});

app.post('/api/admin/content', async (req, res) => {
  try { await db.collection('site_content').updateOne({}, { $set: req.body }, { upsert: true }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ROUTES SMS MARKETING ════════════════════════════════

app.post('/api/sms-marketing/send', limitSMS, async (req, res) => {
  try {
    const { campagne, messages, sender, scheduled, total } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: 'Aucun message' });
    const camp = { campagne: campagne || 'Campagne SMS', sender: sender || 'PST-Telecom', total: messages.length, envoyes: 0, echecs: 0, statut: scheduled ? 'planifie' : 'en_cours', scheduledAt: scheduled ? new Date(scheduled) : null, createdAt: new Date() };
    const result = await db.collection('sms_campagnes').insertOne(camp);
    const campId = result.insertedId;
    if (scheduled) {
      await db.collection('sms_campagnes').updateOne({ _id: campId }, { $set: { messages, statut: 'planifie' } });
      return res.json({ success: true, campagneId: campId, statut: 'planifie' });
    }
    const AT = require('africastalking')({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    const sms = AT.SMS;
    let envoyes = 0, echecs = 0;
    for (let i = 0; i < messages.length; i += 50) {
      const batch = messages.slice(i, i + 50);
      for (const msg of batch) {
        try { await sms.send({ to: [msg.telephone], message: msg.message, from: sender || 'PST-Telecom' }); envoyes++; }
        catch(e) { echecs++; }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    await db.collection('sms_campagnes').updateOne({ _id: campId }, { $set: { envoyes, echecs, statut: 'termine', finishedAt: new Date() } });
    await db.collection('activity_logs').insertOne({ type: 'sms_marketing', message: `Campagne "${campagne}" — ${envoyes} SMS envoyés, ${echecs} échecs`, createdAt: new Date() });
    res.json({ success: true, campagneId: campId, envoyes, echecs, total: messages.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms-marketing/campagnes', async (req, res) => {
  try { const campagnes = await db.collection('sms_campagnes').find({}, { projection: { messages: 0 } }).sort({ createdAt: -1 }).limit(50).toArray(); res.json(campagnes); }
  catch (e) { res.json([]); }
});

app.get('/api/sms-marketing/stats', async (req, res) => {
  try {
    const campagnes = await db.collection('sms_campagnes').find({}).toArray();
    res.json({ totalCampagnes: campagnes.length, totalEnvoyes: campagnes.reduce((s,c) => s+(c.envoyes||0), 0), totalEchecs: campagnes.reduce((s,c) => s+(c.echecs||0), 0) });
  } catch (e) { res.json({ totalCampagnes:0, totalEnvoyes:0, totalEchecs:0 }); }
});

// ═══ ROUTES RÉFÉRENCES ET CODES SMS MARKETING ═══════════════

app.post('/api/sms-marketing/verify-ref', async (req, res) => {
  try {
    const { reference, telephone, smsCount, montant } = req.body;
    if (!reference || reference.length < 3) return res.json({ valid: false, error: 'Référence trop courte' });
    const ref = reference.toUpperCase().trim();

    // 1. Vérifier si déjà utilisée
    const dejáUtilisee = await db.collection('sms_refs_utilisees').findOne({ reference: ref });
    if (dejáUtilisee) return res.json({ valid: false, error: 'Cette référence a déjà été utilisée pour une campagne PST' });

    // 2. Vérifier si pré-autorisée par l'admin (Wave manuel)
    const autorisee = await db.collection('sms_refs_autorisees').findOne({ reference: ref, utilise: false });
    if (autorisee) {
      await db.collection('sms_refs_autorisees').updateOne({ reference: ref }, { $set: { utilise: true, utiliseAt: new Date(), utilisePar: telephone } });
      await db.collection('sms_refs_utilisees').insertOne({ reference: ref, telephone, smsCount: parseInt(smsCount)||0, utiliseeAt: new Date() });
      await db.collection('activity_logs').insertOne({ type: 'sms_marketing', message: `Réf ${ref} validée (pré-autorisée) — ${smsCount} SMS pour ${telephone}`, createdAt: new Date() });
      return res.json({ valid: true });
    }

    // 3. Vérifier si paiement Flutterwave automatique enregistré
    const flwPaiement = await db.collection('payments').findOne({
      reference: ref,
      statut: 'confirme',
      moyen: 'flutterwave_card',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    if (flwPaiement) {
      await db.collection('sms_refs_utilisees').insertOne({ reference: ref, telephone, smsCount: parseInt(smsCount)||0, utiliseeAt: new Date() });
      await db.collection('activity_logs').insertOne({ type: 'sms_marketing', message: `Réf ${ref} validée (Flutterwave) — ${smsCount} SMS pour ${telephone}`, createdAt: new Date() });
      return res.json({ valid: true });
    }

    // 4. Rien trouvé — demander de contacter PST
    return res.json({ valid: false, error: 'Référence non reconnue. Après paiement Wave, contactez PST au +221 77 152 09 59 pour activer votre campagne.' });

  } catch (e) { res.status(500).json({ valid: false, error: e.message }); }
});

// Admin — pré-autoriser une référence Wave/Visa après paiement confirmé
app.post('/api/sms-marketing/autoriser-ref', async (req, res) => {
  try {
    const { reference, telephone, montant, pack, notes } = req.body;
    if (!reference) return res.status(400).json({ error: 'Référence requise' });
    const ref = reference.toUpperCase().trim();

    // Vérifier si déjà enregistrée
    const exist = await db.collection('sms_refs_autorisees').findOne({ reference: ref });
    if (exist) return res.status(400).json({ error: 'Référence déjà enregistrée' });

    await db.collection('sms_refs_autorisees').insertOne({
      reference: ref,
      telephone: telephone || '',
      montant: parseInt(montant) || 0,
      pack: pack || '',
      notes: notes || '',
      utilise: false,
      createdAt: new Date()
    });

    await db.collection('activity_logs').insertOne({
      type: 'sms_marketing',
      message: `Référence ${ref} autorisée par admin — ${montant} FCFA pour ${telephone}`,
      createdAt: new Date()
    });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin — lister les références autorisées
app.get('/api/sms-marketing/refs', async (req, res) => {
  try {
    const refs = await db.collection('sms_refs_autorisees').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(refs);
  } catch (e) { res.json([]); }
});

// Admin — supprimer une référence autorisée
app.delete('/api/sms-marketing/refs/:ref', async (req, res) => {
  try {
    await db.collection('sms_refs_autorisees').deleteOne({ reference: req.params.ref.toUpperCase() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms-marketing/generate-code', async (req, res) => {
  try {
    const { telephone, smsCount, pack, montant, notes } = req.body;
    const code = 'PST-' + Math.random().toString(36).slice(2,6).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.collection('sms_codes').insertOne({ code, telephone, smsCount: parseInt(smsCount)||0, pack: pack||'', montant: parseInt(montant)||0, notes: notes||'', statut: 'actif', utilise: false, createdAt: new Date(), expireAt });
    res.json({ success: true, code, expireAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms-marketing/verify-code', async (req, res) => {
  try {
    const { code, telephone, smsCount } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Code requis' });
    const codeDoc = await db.collection('sms_codes').findOne({ code: code.toUpperCase().trim(), statut: 'actif', utilise: false, expireAt: { $gt: new Date() } });
    if (!codeDoc) return res.json({ valid: false, error: 'Code invalide ou expiré' });
    await db.collection('sms_codes').updateOne({ code: code.toUpperCase().trim() }, { $set: { utilise: true, utiliseAt: new Date(), utilisePar: telephone } });
    await db.collection('activity_logs').insertOne({ type: 'sms_marketing', message: `Code ${code} validé — ${smsCount} SMS pour ${telephone}`, createdAt: new Date() });
    res.json({ valid: true, smsCount: codeDoc.smsCount, pack: codeDoc.pack });
  } catch (e) { res.status(500).json({ valid: false, error: e.message }); }
});

app.get('/api/sms-marketing/codes', async (req, res) => {
  try { const codes = await db.collection('sms_codes').find({}).sort({ createdAt: -1 }).limit(100).toArray(); res.json(codes); }
  catch (e) { res.json([]); }
});

app.delete('/api/sms-marketing/codes/:code', async (req, res) => {
  try { await db.collection('sms_codes').updateOne({ code: req.params.code }, { $set: { statut: 'revoque' } }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ROUTES RECHARGE TÉLÉPHONIQUE ═══════════════════════════

app.get('/recharge', (req, res) => {
  res.sendFile(path.join(__dirname, 'recharge.html'));
});

// ═══ ROUTES RECHARGE TÉLÉPHONIQUE ════════════════════════════

app.get('/recharge', (req, res) => {
  res.sendFile(path.join(__dirname, 'recharge.html'));
});

app.post('/api/recharge/envoyer', limitRecharge, async (req, res) => {
  try {
    const numero = validateTelephone(req.body.numero);
    const montant = validateMontant(req.body.montant, 100, 100000);
    const operateur = ['orange','free','expresso'].includes(req.body.operateur) ? req.body.operateur : null;
    const nom = sanitize(req.body.nom, 100);
    const telephone = validateTelephone(req.body.telephone);
    const transactionId = sanitize(req.body.transactionId, 100);

    if (!numero) return res.status(400).json({ error: 'Numéro invalide' });
    if (!montant) return res.status(400).json({ error: 'Montant invalide (100 - 100 000 FCFA)' });
    if (!operateur) return res.status(400).json({ error: 'Opérateur invalide (orange/free/expresso)' });

    // Enregistrer la recharge
    const recharge = {
      numero, operateur, montant: parseInt(montant),
      nom: nom || '', telephone: telephone || '',
      transactionId: transactionId || '',
      statut: 'pending', createdAt: new Date()
    };
    const result = await db.collection('recharges').insertOne(recharge);

    // Envoyer via Africa's Talking Airtime
    const AT_KEY = process.env.AT_API_KEY;
    const AT_USER = process.env.AT_USERNAME || 'sandbox';

    if (AT_KEY && AT_USER !== 'sandbox') {
      try {
        const AfricasTalking = require('africastalking')({ apiKey: AT_KEY, username: AT_USER });
        const airtime = AfricasTalking.AIRTIME;
        const atRes = await airtime.send({
          recipients: [{ phoneNumber: numero, amount: `XOF ${montant}`, currencyCode: 'XOF' }]
        });
        const success = atRes.responses && atRes.responses[0] && atRes.responses[0].status === 'Success';
        await db.collection('recharges').updateOne(
          { _id: result.insertedId },
          { $set: { statut: success ? 'success' : 'failed', atResponse: atRes, finishedAt: new Date() } }
        );
        if (!success) return res.status(400).json({ error: 'Recharge échouée — ' + (atRes.responses[0]?.errorMessage || 'Erreur AT') });
      } catch (atErr) {
        await db.collection('recharges').updateOne({ _id: result.insertedId }, { $set: { statut: 'failed', error: atErr.message } });
        return res.status(500).json({ error: 'Erreur Africa\'s Talking: ' + atErr.message });
      }
    } else {
      // Mode sandbox — simuler succès
      await db.collection('recharges').updateOne({ _id: result.insertedId }, { $set: { statut: 'success', sandbox: true, finishedAt: new Date() } });
    }

    // Log activité
    await db.collection('activity_logs').insertOne({
      type: 'recharge',
      message: `Recharge ${montant} FCFA → ${numero} (${operateur}) — ${nom}`,
      createdAt: new Date()
    });

    res.json({ success: true, rechargeId: result.insertedId, message: `${montant} FCFA envoyés sur ${numero}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recharge/historique', async (req, res) => {
  try {
    const { telephone, numero } = req.query;
    const query = telephone ? { $or: [{ telephone }, { numero: { $regex: telephone.replace('+221','').replace(/\s/g,'') } }] } : {};
    const recharges = await db.collection('recharges').find(query).sort({ createdAt: -1 }).limit(20).toArray();
    res.json(recharges);
  } catch (e) { res.json([]); }
});

// Admin — stats recharges
app.get('/api/admin/recharges', async (req, res) => {
  try {
    const recharges = await db.collection('recharges').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(recharges);
  } catch (e) { res.json([]); }
});

app.get('/api/admin/recharges/stats', async (req, res) => {
  try {
    const recharges = await db.collection('recharges').find({}).toArray();
    const total = recharges.length;
    const success = recharges.filter(r => r.statut === 'success').length;
    const montantTotal = recharges.filter(r => r.statut === 'success').reduce((s, r) => s + (r.montant || 0), 0);
    res.json({ total, success, failed: total - success, montantTotal });
  } catch (e) { res.json({ total: 0, success: 0, failed: 0, montantTotal: 0 }); }
});

// ═══ FACTURES PDF + EMAIL ════════════════════════════════════

// Générer le HTML de la facture
function genererFactureHTML(data) {
  const num = data.numeroFacture || ('PST-' + Date.now());
  const date = new Date(data.date || Date.now()).toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'});
  const lignes = data.lignes || [{description: data.description || 'Service PST', quantite: 1, prix: data.montant || 0}];
  const total = lignes.reduce(function(s, l) { return s + (l.quantite * l.prix); }, 0);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 0; background: #fff; }
  .facture { max-width: 700px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #00E676; padding-bottom: 24px; }
  .logo { font-size: 36px; font-weight: 900; color: #060B12; }
  .logo span { color: #00E676; }
  .logo-sub { font-size: 11px; color: #556B82; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
  .facture-meta { text-align: right; }
  .facture-num { font-size: 20px; font-weight: 700; color: #060B12; }
  .facture-date { font-size: 13px; color: #556B82; margin-top: 4px; }
  .facture-status { background: #00E676; color: #000; padding: 4px 12px; border-radius: 100px; font-size: 11px; font-weight: 700; margin-top: 8px; display: inline-block; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 36px; }
  .partie h4 { font-size: 11px; color: #556B82; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .partie p { font-size: 14px; color: #1a1a2e; margin: 2px 0; }
  .partie strong { font-size: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #060B12; color: #fff; padding: 12px 16px; font-size: 12px; text-align: left; text-transform: uppercase; letter-spacing: 0.5px; }
  tbody td { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  tbody tr:nth-child(even) { background: #f8fffe; }
  .total-section { display: flex; justify-content: flex-end; }
  .total-box { background: #060B12; color: #fff; padding: 20px 24px; border-radius: 12px; min-width: 240px; }
  .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; opacity: 0.7; }
  .total-final { display: flex; justify-content: space-between; font-size: 20px; font-weight: 700; color: #00E676; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }
  .footer { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid #f0f0f0; font-size: 12px; color: #556B82; }
  .footer a { color: #00E676; }
  .merci { background: linear-gradient(135deg, #060B12, #0D1620); color: #fff; padding: 20px; border-radius: 12px; text-align: center; margin-top: 24px; }
  .merci h3 { color: #00E676; margin-bottom: 8px; }
  .merci p { font-size: 13px; opacity: 0.7; }
</style>
</head>
<body>
<div class="facture">
  <div class="header">
    <div>
      <div class="logo">P<span>S</span>T</div>
      <div class="logo-sub">Pure Smart Telecom</div>
      <div style="font-size:12px;color:#556B82;margin-top:8px;">
        Dakar, Sénégal<br>
        +221 77 152 09 59<br>
        pst-telecom.vercel.app
      </div>
    </div>
    <div class="facture-meta">
      <div class="facture-num">FACTURE #${num}</div>
      <div class="facture-date">Date : ${date}</div>
      <div class="facture-status">✓ PAYÉE</div>
    </div>
  </div>

  <div class="parties">
    <div class="partie">
      <h4>Émetteur</h4>
      <strong>PST Pure Smart Telecom</strong>
      <p>Dakar, Sénégal</p>
      <p>+221 77 152 09 59</p>
      <p>contact@pst-telecom.sn</p>
    </div>
    <div class="partie" style="text-align:right">
      <h4>Client</h4>
      <strong>${data.clientNom || 'Client PST'}</strong>
      <p>${data.clientTel || ''}</p>
      <p>${data.clientEmail || ''}</p>
      <p>${data.clientOrg || ''}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qté</th>
        <th>Prix unitaire</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${lignes.map(function(l) {
        return '<tr><td>' + l.description + '</td><td>' + l.quantite + '</td><td>' + l.prix.toLocaleString('fr-FR') + ' FCFA</td><td><strong>' + (l.quantite * l.prix).toLocaleString('fr-FR') + ' FCFA</strong></td></tr>';
      }).join('')}
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-box">
      <div class="total-row"><span>Sous-total</span><span>${total.toLocaleString('fr-FR')} FCFA</span></div>
      <div class="total-row"><span>TVA</span><span>0 FCFA</span></div>
      <div class="total-row"><span>Frais</span><span>0 FCFA</span></div>
      <div class="total-final"><span>TOTAL</span><span>${total.toLocaleString('fr-FR')} FCFA</span></div>
    </div>
  </div>

  <div class="merci">
    <h3>Merci pour votre confiance !</h3>
    <p>Cette facture confirme votre paiement. Conservez-la pour vos archives.</p>
  </div>

  <div class="footer">
    <p>PST Pure Smart Telecom — L'opérateur intelligent du Sénégal</p>
    <p><a href="https://pst-telecom.vercel.app">pst-telecom.vercel.app</a> — +221 77 152 09 59</p>
  </div>
</div>
</body>
</html>`;
}

// Générer et télécharger une facture en HTML (le navigateur peut l'imprimer en PDF)
app.get('/api/facture/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let factureData = null;

    // Chercher dans les campagnes SMS
    try {
      const camp = await db.collection('sms_campagnes').findOne({ _id: new ObjectId(id) });
      if (camp) {
        factureData = {
          numeroFacture: 'PST-SMS-' + id.slice(-6).toUpperCase(),
          date: camp.createdAt,
          clientNom: camp.clientNom || 'Client PST',
          clientTel: camp.clientTel || '',
          clientEmail: camp.clientEmail || '',
          clientOrg: camp.clientOrg || '',
          lignes: [{
            description: 'Campagne SMS Marketing — ' + (camp.campagne || 'Campagne') + ' (' + (camp.total || 0) + ' SMS)',
            quantite: 1,
            prix: camp.montantPaye || 0
          }]
        };
      }
    } catch(e) {}

    // Chercher dans les recharges
    if (!factureData) {
      try {
        const rch = await db.collection('recharges').findOne({ _id: new ObjectId(id) });
        if (rch) {
          factureData = {
            numeroFacture: 'PST-RCH-' + id.slice(-6).toUpperCase(),
            date: rch.createdAt,
            clientNom: rch.nom || 'Client PST',
            clientTel: rch.telephone || '',
            lignes: [{
              description: 'Recharge téléphonique ' + (rch.operateur||'') + ' — ' + rch.numero,
              quantite: 1,
              prix: rch.montant || 0
            }]
          };
        }
      } catch(e) {}
    }

    if (!factureData) {
      return res.status(404).send('Facture introuvable');
    }

    const html = genererFactureHTML(factureData);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="facture-' + factureData.numeroFacture + '.html"');
    res.send(html);
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// Générer une facture manuelle et l'envoyer par email
app.post('/api/facture/generer', async (req, res) => {
  try {
    const { clientNom, clientEmail, clientTel, clientOrg, lignes, description, montant, sendEmail } = req.body;

    const num = 'PST-' + Date.now().toString().slice(-8);
    const factureData = {
      numeroFacture: num,
      date: new Date(),
      clientNom, clientEmail, clientTel, clientOrg,
      lignes: lignes || [{ description: description || 'Service PST', quantite: 1, prix: parseInt(montant) || 0 }]
    };

    // Sauvegarder en DB
    const result = await db.collection('factures').insertOne({ ...factureData, createdAt: new Date() });

    // Envoyer par email si demandé
    if (sendEmail && clientEmail) {
      try {
        const GMAIL_USER = process.env.GMAIL_USER;
        const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

        if (GMAIL_USER && GMAIL_PASS) {
          const transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: { user: GMAIL_USER, pass: GMAIL_PASS }
          });

          const html = genererFactureHTML(factureData);

          await transporter.sendMail({
            from: '"PST Pure Smart Telecom" <' + GMAIL_USER + '>',
            to: clientEmail,
            subject: 'Votre facture PST #' + num,
            html: `<p>Bonjour ${clientNom},</p>
                   <p>Veuillez trouver ci-joint votre facture PST <strong>#${num}</strong>.</p>
                   <p>Merci pour votre confiance !</p>
                   <p>— PST Pure Smart Telecom<br>+221 77 152 09 59</p>`,
            attachments: [{
              filename: 'facture-' + num + '.html',
              content: html,
              contentType: 'text/html'
            }]
          });
        }
      } catch(emailErr) {
        console.warn('Email non envoyé:', emailErr.message);
      }
    }

    res.json({ success: true, factureId: result.insertedId, numeroFacture: num, url: '/api/facture/' + result.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Lister les factures (admin)
app.get('/api/admin/factures', async (req, res) => {
  try {
    const factures = await db.collection('factures').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(factures);
  } catch(e) { res.json([]); }
});

// ═══════════════════════════════════════════
// ROUTES NOC CENTER — VERSION FINALE
// ═══════════════════════════════════════════

app.get('/noc', async (req, res) => {
  const token = req.query.token || '';
  // Admin access
  if (token === process.env.ADMIN_PASSWORD || token === 'pst-admin-2026') {
    return res.sendFile(require('path').join(__dirname, 'noc.html'));
  }
  // Client NOC access - check if token is a valid NOC client code
  if (token.startsWith('NOC-') && db) {
    const client = await db.collection('noc_clients').findOne({ code: token });
    if (client) return res.sendFile(require('path').join(__dirname, 'noc.html'));
  }
  // Invalid token - redirect to admin
  res.redirect('/admin');
});

app.get('/api/noc/cameras', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const cams = await db.collection('noc_cameras').find({}).sort({ createdAt: -1 }).toArray();
    res.json(cams);
  } catch(e) { res.json([]); }
});

app.get('/api/noc/clients', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const cams = await db.collection('noc_cameras').find({}, { projection: { client: 1 } }).toArray();
    const names = [...new Set(cams.map(c => c.client).filter(Boolean))];
    res.json(names.map(n => ({ name: n })));
  } catch(e) { res.json([]); }
});

app.post('/api/noc/cameras', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name et url requis' });
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const cam = { ...req.body, createdAt: new Date() };
    delete cam.token;
    const r = await db.collection('noc_cameras').insertOne(cam);
    cam._id = r.insertedId;
    res.json({ success: true, camera: cam });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/noc/cameras/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    const update = { ...req.body, updatedAt: new Date() };
    delete update._id; delete update.token; delete update.createdAt;
    await db.collection('noc_cameras').updateOne({ _id: oid }, { $set: update });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/noc/cameras/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    const r = await db.collection('noc_cameras').deleteOne({ _id: oid });
    if (r.deletedCount === 0) return res.status(404).json({ error: 'Camera non trouvee' });
    res.json({ success: true, deleted: req.params.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// ═══════════════════════════════════════════
// AGENT IA AIDA — SERVICE CLIENT PST
// ═══════════════════════════════════════════

app.get('/agent', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'agent.html'));
});

app.post('/api/agent/log', async (req, res) => {
  try {
    const { message, reply, service } = req.body;
    if (db) await db.collection('agent_logs').insertOne({ message, reply, service: service||'general', createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

app.get('/api/agent/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, today: 0 });
    const total = await db.collection('agent_logs').countDocuments();
    const today = new Date(); today.setHours(0,0,0,0);
    const todayCount = await db.collection('agent_logs').countDocuments({ createdAt: { $gte: today } });
    res.json({ total, today: todayCount });
  } catch(e) { res.json({ total: 0, today: 0 }); }
});


// ═══════════════════════════════════════════
// PROXY CLAUDE API — AGENT AIDA
// ═══════════════════════════════════════════
app.post('/api/agent/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: system,
        messages: messages
      })
    });
    const data = await response.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
// ROUTES NOC CLIENTS DB
// ═══════════════════════════════════════════

app.post('/api/noc/clients/creer', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { nom, telephone, email, forfait, code } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'nom et telephone requis' });
    const client = {
      nom, telephone, email: email || '',
      forfait: forfait || 'noc-starter',
      code: code || 'NOC-' + Date.now().toString(36).toUpperCase().slice(-6),
      statut: 'actif',
      createdAt: new Date()
    };
    const r = await db.collection('noc_clients').insertOne(client);
    client._id = r.insertedId;
    await db.collection('activity_logs').insertOne({
      type: 'noc_client',
      message: 'Nouveau client NOC: ' + nom + ' (' + client.code + ')',
      createdAt: new Date()
    });
    res.json({ success: true, code: client.code, client });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/noc/clients/liste', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const clients = await db.collection('noc_clients').find({}).sort({ createdAt: -1 }).toArray();
    res.json(clients);
  } catch(e) { res.json([]); }
});

app.delete('/api/noc/clients/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('noc_clients').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════
// AGENT NOC — SURVEILLANCE CAMERAS 24H/24
// ═══════════════════════════════════════════

const NOC_ALERT_PHONE = process.env.ADMIN_PHONE || '+221771520959';
let nocAgentTimer = null;
let cameraStatus = {}; // Track camera status in memory

// Start NOC agent when server starts
function startNocAgent() {
  console.log('🤖 Agent NOC démarré — surveillance toutes les 5 minutes');
  
  // Check immediately then every 5 minutes
  checkAllCameras();
  nocAgentTimer = setInterval(checkAllCameras, 5 * 60 * 1000);
}

async function checkAllCameras() {
  try {
    if (!db) return;
    const cameras = await db.collection('noc_cameras').find({ status: { $ne: 'disabled' } }).toArray();
    
    for (const cam of cameras) {
      const id = cam._id.toString();
      const url = cam.url || '';
      
      // Only check HTTP/HTTPS URLs (YouTube embeds, HLS)
      if (!url.startsWith('http')) continue;
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        // For YouTube embeds, check if the base URL responds
        const checkUrl = url.includes('youtube.com/embed') 
          ? 'https://www.youtube.com' 
          : url.split('?')[0];
        
        const resp = await fetch(checkUrl, { 
          method: 'HEAD', 
          signal: controller.signal 
        });
        clearTimeout(timeout);
        
        const isOnline = resp.status < 500;
        const wasOnline = cameraStatus[id] !== 'offline';
        
        if (!isOnline && wasOnline) {
          // Camera just went offline
          cameraStatus[id] = 'offline';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'offline', lastOffline: new Date() } }
          );
          await sendNocAlert('offline', cam);
          await logNocEvent('offline', cam);
          
        } else if (isOnline && !wasOnline) {
          // Camera came back online
          cameraStatus[id] = 'online';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'online', lastOnline: new Date() } }
          );
          await sendNocAlert('reconnect', cam);
          await logNocEvent('reconnect', cam);
        } else {
          cameraStatus[id] = isOnline ? 'online' : 'offline';
        }
        
      } catch(e) {
        // Timeout or network error = offline
        if (cameraStatus[id] !== 'offline') {
          cameraStatus[id] = 'offline';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'offline', lastOffline: new Date() } }
          );
          await sendNocAlert('offline', cam);
          await logNocEvent('offline', cam);
        }
      }
    }
  } catch(e) {
    console.error('Agent NOC erreur:', e.message);
  }
}

async function sendNocAlert(type, cam) {
  try {
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });
    
    const msg = type === 'offline'
      ? `ALERTE PST NOC : Camera "${cam.name || 'Inconnue'}" chez ${cam.client || 'Client'} est HORS LIGNE ! Verifiez immediatement.`
      : `PST NOC : Camera "${cam.name || 'Inconnue'}" chez ${cam.client || 'Client'} est de nouveau EN LIGNE.`;
    
    await AT.SMS.send({
      to: [NOC_ALERT_PHONE],
      message: msg,
      from: process.env.AT_USERNAME
    });
    
    console.log(`Agent NOC SMS envoye: ${type} - ${cam.name}`);
  } catch(e) {
    console.error('Agent NOC SMS erreur:', e.message);
  }
}

async function logNocEvent(type, cam) {
  try {
    if (!db) return;
    await db.collection('noc_alerts').insertOne({
      type,
      cameraId: cam._id,
      cameraName: cam.name || 'Inconnue',
      client: cam.client || '',
      url: cam.url || '',
      createdAt: new Date()
    });
    await db.collection('activity_logs').insertOne({
      type: 'noc_alert',
      message: `Camera ${type === 'offline' ? 'HORS LIGNE' : 'RECONNECTEE'}: ${cam.name} (${cam.client})`,
      createdAt: new Date()
    });
  } catch(e) {}
}

// API routes for NOC agent
app.get('/api/noc/alerts', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const alerts = await db.collection('noc_alerts')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(alerts);
  } catch(e) { res.json([]); }
});

app.get('/api/noc/agent/status', async (req, res) => {
  try {
    if (!db) return res.json({ running: false, cameras: 0 });
    const total = await db.collection('noc_cameras').countDocuments();
    const offline = Object.values(cameraStatus).filter(s => s === 'offline').length;
    res.json({ 
      running: nocAgentTimer !== null,
      cameras: total,
      offline,
      online: total - offline,
      lastCheck: new Date().toISOString()
    });
  } catch(e) { res.json({ running: false }); }
});

app.post('/api/noc/agent/check-now', async (req, res) => {
  checkAllCameras();
  res.json({ success: true, message: 'Verification lancee' });
});



// ═══════════════════════════════════════════
// AGENT SMS MARKETING — CAMPAGNES AUTO
// ═══════════════════════════════════════════

// ADMIN_PHONE already declared above

// Verifier et lancer une campagne automatiquement
async function lancerCampagneAuto(campagneId) {
  try {
    if (!db) return { success: false, error: 'DB non disponible' };
    
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(campagneId); } catch(e) { return { success: false, error: 'ID invalide' }; }
    
    const campagne = await db.collection('sms_campagnes').findOne({ _id: oid });
    if (!campagne) return { success: false, error: 'Campagne non trouvee' };
    if (campagne.statut === 'envoye') return { success: false, error: 'Deja envoyee' };
    
    // Marquer comme en cours
    await db.collection('sms_campagnes').updateOne(
      { _id: oid },
      { $set: { statut: 'en_cours', startedAt: new Date() } }
    );
    
    // Envoyer les SMS via Africa's Talking
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });
    
    const contacts = campagne.contacts || [];
    const message = campagne.message || '';
    const expediteur = campagne.expediteur || 'PST';
    
    let envoyes = 0;
    let echecs = 0;
    const batchSize = 50;
    
    // Envoyer par lots de 50
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      const numeros = batch.map(c => c.telephone || c).filter(Boolean);
      
      if (!numeros.length) continue;
      
      try {
        // Personnaliser le message pour chaque contact
        const msgs = batch.map(c => {
          let msg = message;
          if (typeof c === 'object') {
            msg = msg.replace(/{prenom}/g, c.prenom || '')
                     .replace(/{nom}/g, c.nom || '')
                     .replace(/{classe}/g, c.classe || '')
                     .replace(/{table}/g, c.table || '')
                     .replace(/{matricule}/g, c.matricule || '')
                     .replace(/{mention}/g, c.mention || '')
                     .replace(/{centre}/g, c.centre || '')
                     .replace(/{jury}/g, c.jury || '');
          }
          return { to: c.telephone || c, message: msg };
        });
        
        // Envoyer les SMS
        for (const m of msgs) {
          try {
            await AT.SMS.send({
              to: [m.to],
              message: m.message,
              from: expediteur
            });
            envoyes++;
          } catch(e) {
            echecs++;
          }
        }
        
        // Pause entre les lots
        await new Promise(r => setTimeout(r, 500));
        
      } catch(e) {
        echecs += numeros.length;
      }
    }
    
    // Marquer comme termine
    await db.collection('sms_campagnes').updateOne(
      { _id: oid },
      { $set: { statut: 'envoye', envoyes, echecs, finishedAt: new Date() } }
    );
    
    // Log activite
    await db.collection('activity_logs').insertOne({
      type: 'sms_campagne',
      message: `Campagne SMS terminee: ${envoyes} envoyes, ${echecs} echecs - ${campagne.nom || ''}`,
      createdAt: new Date()
    });
    
    // Alerter l'admin par SMS
    try {
      await AT.SMS.send({
        to: [ADMIN_PHONE],
        message: `PST SMS Marketing: Campagne "${campagne.nom || 'Sans nom'}" terminee. ${envoyes} SMS envoyes, ${echecs} echecs.`,
        from: process.env.AT_USERNAME
      });
    } catch(e) {}
    
    return { success: true, envoyes, echecs };
    
  } catch(e) {
    console.error('Agent SMS Marketing erreur:', e.message);
    return { success: false, error: e.message };
  }
}

// Sauvegarder une campagne en DB
async function sauvegarderCampagne(data) {
  try {
    if (!db) return null;
    const campagne = {
      nom: data.nom || 'Campagne PST',
      message: data.message,
      contacts: data.contacts || [],
      expediteur: data.expediteur || 'PST',
      pack: data.pack || 'starter',
      montant: data.montant || 0,
      reference: data.reference || '',
      statut: 'en_attente',
      createdAt: new Date()
    };
    const r = await db.collection('sms_campagnes').insertOne(campagne);
    campagne._id = r.insertedId;
    return campagne;
  } catch(e) {
    console.error('Sauvegarde campagne erreur:', e.message);
    return null;
  }
}

// Routes API Agent SMS Marketing
app.post('/api/sms-marketing/campagne/sauvegarder', async (req, res) => {
  try {
    const campagne = await sauvegarderCampagne(req.body);
    if (!campagne) return res.status(500).json({ error: 'Erreur sauvegarde' });
    res.json({ success: true, campagneId: campagne._id, campagne });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms-marketing/campagne/lancer/:id', async (req, res) => {
  try {
    const result = await lancerCampagneAuto(req.params.id);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms-marketing/campagnes', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const campagnes = await db.collection('sms_campagnes')
      .find({}, { projection: { contacts: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(campagnes);
  } catch(e) { res.json([]); }
});

app.get('/api/sms-marketing/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, envoyes: 0, en_attente: 0 });
    const campagnes = await db.collection('sms_campagnes').find({}).toArray();
    const total = campagnes.length;
    const envoyes = campagnes.filter(c => c.statut === 'envoye').length;
    const en_attente = campagnes.filter(c => c.statut === 'en_attente').length;
    const totalSMS = campagnes.reduce((s, c) => s + (c.envoyes || 0), 0);
    res.json({ total, envoyes, en_attente, totalSMS });
  } catch(e) { res.json({ total: 0, envoyes: 0, en_attente: 0, totalSMS: 0 }); }
});

app.delete('/api/sms-marketing/campagne/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('sms_campagnes').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

console.log('Agent SMS Marketing pret');



// ═══════════════════════════════════════════
// AGENT RECHARGE — RECHARGES AUTO 24H/24
// ═══════════════════════════════════════════

// ADMIN_PHONE already declared above

// Traiter une recharge automatiquement
async function traiterRecharge(data) {
  try {
    const { telephone, montant, operateur, clientNom, reference } = data;
    
    if (!telephone || !montant) {
      return { success: false, error: 'telephone et montant requis' };
    }

    // Sauvegarder en DB
    let rechargeId = null;
    if (db) {
      const r = await db.collection('recharges').insertOne({
        telephone,
        montant: Number(montant),
        operateur: operateur || detecterOperateur(telephone),
        clientNom: clientNom || 'Client PST',
        reference: reference || '',
        statut: 'en_cours',
        createdAt: new Date()
      });
      rechargeId = r.insertedId;
    }

    // Envoyer la recharge via Africa's Talking
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });

    try {
      const result = await AT.AIRTIME.send({
        recipients: [{
          phoneNumber: telephone.startsWith('+') ? telephone : '+221' + telephone,
          amount: `XOF ${montant}`,
          currencyCode: 'XOF'
        }]
      });

      const statut = result.responses && result.responses[0].status === 'Sent' ? 'reussi' : 'echec';
      
      // Mettre a jour le statut
      if (db && rechargeId) {
        await db.collection('recharges').updateOne(
          { _id: rechargeId },
          { $set: { statut, finishedAt: new Date(), atResponse: result } }
        );
      }

      // Log activite
      if (db) {
        await db.collection('activity_logs').insertOne({
          type: 'recharge',
          message: `Recharge ${statut}: ${montant} FCFA vers ${telephone} (${operateur || detecterOperateur(telephone)})`,
          createdAt: new Date()
        });
      }

      // Alerter admin si echec
      if (statut === 'echec') {
        try {
          await AT.SMS.send({
            to: [ADMIN_PHONE],
            message: `PST ALERTE: Recharge echouee - ${montant}F vers ${telephone}. Verifiez le wallet AT.`,
            from: process.env.AT_USERNAME
          });
        } catch(e) {}
      }

      return { success: statut === 'reussi', statut, rechargeId };

    } catch(e) {
      // AT error - update DB
      if (db && rechargeId) {
        await db.collection('recharges').updateOne(
          { _id: rechargeId },
          { $set: { statut: 'echec', error: e.message, finishedAt: new Date() } }
        );
      }
      
      // Mode sandbox - simuler succes
      if (process.env.AT_USERNAME === 'sandbox') {
        if (db && rechargeId) {
          await db.collection('recharges').updateOne(
            { _id: rechargeId },
            { $set: { statut: 'simule', finishedAt: new Date() } }
          );
        }
        return { success: true, statut: 'simule', message: 'Mode sandbox - recharge simulee' };
      }
      
      return { success: false, error: e.message };
    }

  } catch(e) {
    console.error('Agent Recharge erreur:', e.message);
    return { success: false, error: e.message };
  }
}

function detecterOperateur(telephone) {
  const num = telephone.replace(/\D/g, '').slice(-9);
  const prefix = num.substring(0, 2);
  if (['77','78','71'].includes(prefix)) return 'Orange';
  if (['76'].includes(prefix)) return 'Free';
  if (['70'].includes(prefix)) return 'Expresso';
  return 'Inconnu';
}

// Stats recharges
async function getRechargeStats() {
  try {
    if (!db) return { total: 0, reussies: 0, echecs: 0, volume: 0 };
    const recharges = await db.collection('recharges').find({}).toArray();
    const total = recharges.length;
    const reussies = recharges.filter(r => r.statut === 'reussi' || r.statut === 'simule').length;
    const echecs = recharges.filter(r => r.statut === 'echec').length;
    const volume = recharges.reduce((s, r) => s + (Number(r.montant) || 0), 0);
    return { total, reussies, echecs, volume };
  } catch(e) {
    return { total: 0, reussies: 0, echecs: 0, volume: 0 };
  }
}

// API Routes Agent Recharge
app.post('/api/recharge/traiter', async (req, res) => {
  try {
    const result = await traiterRecharge(req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recharge/stats', async (req, res) => {
  try {
    const stats = await getRechargeStats();
    res.json(stats);
  } catch(e) { res.json({ total: 0, reussies: 0, echecs: 0, volume: 0 }); }
});

app.get('/api/recharge/historique', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const recharges = await db.collection('recharges')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(recharges);
  } catch(e) { res.json([]); }
});

console.log('Agent Recharge pret');



// ═══════════════════════════════════════════
// AGENT FACTURATION — FACTURES AUTO PDF+GMAIL
// ═══════════════════════════════════════════


// Gmail transporter
function getMailer() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'gwwjmwlgrigemvmd'
    }
  });
}

// Generate invoice HTML
function generateInvoiceHTML(data) {
  const { numero, date, client, telephone, service, montant, forfait } = data;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px}
.invoice{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#0a0d12,#1a2035);padding:30px;text-align:center}
.header h1{color:#00d4ff;font-size:28px;margin:0;letter-spacing:2px}
.header p{color:#94a3b8;margin:4px 0 0;font-size:13px}
.body{padding:30px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
.row:last-child{border-bottom:none}
.label{color:#64748b}
.value{font-weight:600;color:#1a2035}
.total-box{background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(124,58,237,0.08));border:1px solid rgba(0,212,255,0.2);border-radius:10px;padding:16px;margin-top:20px;display:flex;justify-content:space-between;align-items:center}
.total-label{font-size:14px;color:#64748b}
.total-amount{font-size:24px;font-weight:800;color:#00d4ff}
.footer{background:#f8f9fa;padding:20px;text-align:center;font-size:12px;color:#94a3b8}
.badge{display:inline-block;background:#00e676;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px}
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <h1>PST TELECOM</h1>
    <p>Pure Smart Telecom — Facture officielle</p>
  </div>
  <div class="body">
    <div style="text-align:center;margin-bottom:20px">
      <div class="badge">✓ PAIEMENT CONFIRME</div>
    </div>
    <div class="row"><span class="label">N° Facture</span><span class="value">${numero}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${date}</span></div>
    <div class="row"><span class="label">Client</span><span class="value">${client}</span></div>
    <div class="row"><span class="label">Téléphone</span><span class="value">${telephone}</span></div>
    <div class="row"><span class="label">Service</span><span class="value">${service}</span></div>
    ${forfait ? `<div class="row"><span class="label">Forfait</span><span class="value">${forfait}</span></div>` : ''}
    <div class="total-box">
      <span class="total-label">MONTANT TOTAL</span>
      <span class="total-amount">${Number(montant).toLocaleString('fr-FR')} FCFA</span>
    </div>
  </div>
  <div class="footer">
    PST Pure Smart Telecom • pst-telecom.vercel.app<br>
    Contact: +221 77 152 09 59 • papasenytoure@gmail.com<br>
    Merci de votre confiance !
  </div>
</div>
</body>
</html>`;
}

// Generate invoice number
function genInvoiceNum() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const r = Math.random().toString(36).substring(2,6).toUpperCase();
  return `PST-${y}${m}-${r}`;
}

// Main function: create and send invoice
async function sendInvoice(data) {
  try {
    const numero = genInvoiceNum();
    const date = new Date().toLocaleDateString('fr-FR', {
      day:'2-digit', month:'long', year:'numeric'
    });
    
    const invoiceData = { ...data, numero, date };
    const html = generateInvoiceHTML(invoiceData);
    
    // Save to DB
    if (db) {
      await db.collection('factures').insertOne({
        numero,
        client: data.client,
        telephone: data.telephone,
        service: data.service,
        montant: data.montant,
        email: data.email || '',
        html,
        createdAt: new Date(),
        sent: false
      });
    }
    
    // Send email if we have an email address
    if (data.email) {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `PST Telecom <${process.env.GMAIL_USER || 'papasenytoure@gmail.com'}>`,
        to: data.email,
        subject: `Facture PST ${numero} — ${data.service}`,
        html,
        attachments: [{
          filename: `Facture-PST-${numero}.html`,
          content: html,
          contentType: 'text/html'
        }]
      });
      if (db) await db.collection('factures').updateOne({ numero }, { $set: { sent: true } });
      console.log(`Facture ${numero} envoyee a ${data.email}`);
    }
    
    // Always send copy to admin
    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `PST Telecom <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
        subject: `[PST ADMIN] Nouveau paiement - ${data.client} - ${Number(data.montant).toLocaleString()} FCFA`,
        html
      });
    } catch(e) { console.log('Admin email erreur:', e.message); }
    
    return { success: true, numero };
  } catch(e) {
    console.error('Erreur facture:', e.message);
    return { success: false, error: e.message };
  }
}

// API Routes
app.post('/api/factures/generer', async (req, res) => {
  try {
    const { client, telephone, email, service, montant, forfait } = req.body;
    if (!client || !montant) return res.status(400).json({ error: 'client et montant requis' });
    const result = await sendInvoice({ client, telephone, email, service, montant, forfait });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/factures', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const factures = await db.collection('factures')
      .find({}, { projection: { html: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(factures);
  } catch(e) { res.json([]); }
});

app.get('/api/factures/:numero', async (req, res) => {
  try {
    if (!db) return res.status(404).json({ error: 'Non trouvee' });
    const f = await db.collection('factures').findOne({ numero: req.params.numero });
    if (!f) return res.status(404).json({ error: 'Non trouvee' });
    res.send(f.html);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/factures/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('factures').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Auto-generate invoice when payment confirmed (hook into existing webhook)
async function autoFactureOnPayment(paymentData) {
  if (!paymentData || !paymentData.montant) return;
  await sendInvoice({
    client: paymentData.nom || paymentData.client || 'Client PST',
    telephone: paymentData.telephone || '',
    email: paymentData.email || '',
    service: paymentData.service || 'Forfait PST',
    montant: paymentData.montant,
    forfait: paymentData.forfait || ''
  });
}

// Make available globally
global.autoFactureOnPayment = autoFactureOnPayment;

console.log('Agent Facturation pret');



// Historique NOC
app.get('/api/noc/historique', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const hist = await db.collection('noc_historique')
      .find({}).sort({ createdAt: -1 }).limit(100).toArray();
    res.json(hist);
  } catch(e) { res.json([]); }
});


// GET cameras d un client specifique par son code NOC
app.get('/api/noc/cameras/client/:code', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const code = req.params.code;
    const client = await db.collection('noc_clients').findOne({ code });
    if (!client) return res.status(401).json({ error: 'Code invalide' });
    const limites = { 'noc-starter': 4, 'noc-pro': 10, 'noc-business': 30, 'noc-entreprise': 999 };
    const limite = limites[client.forfait] || 4;
    const cameras = await db.collection('noc_cameras')
      .find({ $or: [{ client: client.nom }, { clientCode: code }] })
      .sort({ createdAt: -1 }).limit(limite).toArray();
    await db.collection('noc_historique').insertOne({
      clientCode: code, clientNom: client.nom,
      action: 'connexion', camerasVues: cameras.length,
      createdAt: new Date()
    });
    res.json(cameras);
  } catch(e) { res.json([]); }
});


// Assigner une camera a un client NOC
app.put('/api/noc/cameras/:id/assigner', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    const { clientCode, clientName } = req.body;
    await db.collection('noc_cameras').updateOne(
      { _id: oid },
      { $set: { clientCode, client: clientName, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

connectDB().then(() => {

  // Routes sécurité admin
  app.get('/api/admin/security-logs', async (req, res) => {
    try {
      const logs = db
        ? await db.collection('security_logs').find({}).sort({ createdAt: -1 }).limit(100).toArray()
        : suspectLogs.slice(-100).reverse();
      res.json(logs);
    } catch(e) { res.json([]); }
  });

  app.get('/api/admin/backups', async (req, res) => {
    try {
      if (!db) return res.json([]);
      const backups = await db.collection('backups').find({}, { projection: { snapshot: 0 } }).sort({ createdAt: -1 }).limit(30).toArray();
      res.json(backups);
    } catch(e) { res.json([]); }
  });

  app.post('/api/admin/backup-now', async (req, res) => {
    try {
      await backupData();
      res.json({ success: true, message: 'Backup effectué' });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // Backup automatique toutes les 24h
  setInterval(backupData, 24 * 60 * 60 * 1000);
  // Premier backup au démarrage après 30 secondes
  setTimeout(backupData, 30 * 1000);

  app.listen(PORT, () => {
    console.log(`\n🚀 PST — Pure Smart Telecom`);
    console.log(`📡 Backend Africa's Talking`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🔒 Sécurité: JWT + Rate Limit + Headers + Logs`);
    console.log(`💾 MongoDB: ${db ? 'connecté' : 'mode mémoire'}\n`);
  });
});


