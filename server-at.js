const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const MONGODB_URI = process.env.MONGODB_URI;
const AT_API_KEY  = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const PORT        = process.env.PORT || 3001;

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
app.get('/sms-marketing', (req, res) => { res.sendFile(path.join(__dirname, 'sms-marketing.html')); });
app.get('/appel', (req, res) => { res.sendFile(path.join(__dirname, 'appel.html')); });
app.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, 'dashboard.html')); });
app.get('/sms', (req, res) => { res.sendFile(path.join(__dirname, 'sms.html')); });

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait = 'smart' } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
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

app.post('/api/sms-marketing/send', async (req, res) => {
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
    const { reference, telephone, smsCount } = req.body;
    if (!reference || reference.length < 5) return res.json({ valid: false, error: 'Référence trop courte — vérifiez dans votre app Wave' });
    const ref = reference.toUpperCase().trim();
    const isWave = /^W[0-9A-Z]{5,20}$/.test(ref);
    const isFLW  = /^FLW/.test(ref);
    const isTxn  = /^(TXN|PST|REF|TRF|PAY|WAVE|T_)[0-9A-Z\-_]{3,}$/.test(ref);
    if (!isWave && !isFLW && !isTxn) return res.json({ valid: false, error: 'Format non reconnu. Wave: W241234567 — Flutterwave: FLW-MOCK-XXXX' });
    const existing = await db.collection('sms_refs_utilisees').findOne({ reference: ref });
    if (existing) return res.json({ valid: false, error: 'Cette référence a déjà été utilisée pour une campagne PST' });
    await db.collection('sms_refs_utilisees').insertOne({ reference: ref, telephone: telephone || '', smsCount: parseInt(smsCount) || 0, statut: 'utilise', utiliseeAt: new Date() });
    await db.collection('activity_logs').insertOne({ type: 'sms_marketing', message: `Référence ${ref} validée — ${smsCount} SMS pour ${telephone}`, createdAt: new Date() });
    res.json({ valid: true });
  } catch (e) { res.status(500).json({ valid: false, error: e.message }); }
});

app.get('/api/sms-marketing/refs', async (req, res) => {
  try { const refs = await db.collection('sms_refs_utilisees').find({}).sort({ utiliseeAt: -1 }).limit(100).toArray(); res.json(refs); }
  catch (e) { res.json([]); }
});

app.delete('/api/sms-marketing/refs/:ref', async (req, res) => {
  try { await db.collection('sms_refs_utilisees').deleteOne({ reference: req.params.ref.toUpperCase() }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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

// ─── DÉMARRAGE ──────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 PST — Pure Smart Telecom`);
    console.log(`📡 Backend Africa's Talking`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`💾 MongoDB: ${db ? 'connecté' : 'mode mémoire'}\n`);
  });
});
