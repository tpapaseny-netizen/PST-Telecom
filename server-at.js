const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
app.get('/xlsx.js', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'));
});

// ─── CONFIG ────────────────────────────────────────────────
const MONGODB_URI      = process.env.MONGODB_URI;
const AT_API_KEY       = process.env.AT_API_KEY;
const AT_USERNAME      = process.env.AT_USERNAME || 'pst-telecom';
const PORT             = process.env.PORT || 3001;
const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD || 'pst-admin-2026';
const SUPER_ADMINS     = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];

// ─── izichangePay CONFIG ────────────────────────────────────
const IZIPAY_API_KEY    = process.env.IZIPAY_API_KEY || '14|6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680';
const IZIPAY_SECRET_KEY = process.env.IZIPAY_SECRET_KEY || 'Pstdiama@1';
const IZIPAY_IPN_SECRET = process.env.IZIPAY_IPN_SECRET || 'Pstdiama@1';
const IZIPAY_DOMAIN     = 'https://pay.izichange.com';
const IZIPAY_POS        = 'https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402';

let db;

// ─── HELPERS ────────────────────────────────────────────────
function normalizePhone(p) {
  let n = (p || '').replace(/\s/g, '').replace(/[^\d]/g, '');
  if (n.startsWith('221')) n = n.slice(3);
  return n;
}

function getAT() {
  if (!AT_API_KEY) return null;
  try {
    const AfricasTalking = require('africastalking');
    return AfricasTalking({ apiKey: AT_API_KEY, username: AT_USERNAME });
  } catch { return null; }
}

function genUserId() { return 'PST-' + Math.random().toString(16).slice(2, 10).toUpperCase(); }
function genNumero() {
  const prefixes = ['77', '78', '76', '70'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const n = Math.floor(Math.random() * 9000000) + 1000000;
  return '+221 ' + p + ' ' + String(n).slice(0, 3) + ' ' + String(n).slice(3, 5) + ' ' + String(n).slice(5);
}

// ─── izichangePay HELPERS ────────────────────────────────────
function iziSign(data) {
  let str = '';
  for (const [key, value] of Object.entries(data)) {
    str += key + '=' + (Array.isArray(value) ? value.join('') : value);
  }
  return crypto.createHmac('sha256', IZIPAY_SECRET_KEY).update(str).digest('hex');
}

const iziClient = axios.create({
  baseURL: IZIPAY_DOMAIN,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
});

async function generateIziPayUrl(options) {
  const {
    amount, orderId, senderName, senderEmail,
    coin = 'usdt.trc20',
    acceptedCoins = [
      'usdt.trc20', 'usdt.bep20', 'usdt.erc20', 'usdt.ton', 'usdt.opbnb',
      'usdc.trc20', 'usdc.bep20', 'usdc.erc20', 'btc', 'btc.bep20',
      'eth', 'eth.bep20', 'bnb', 'opbnb', 'trx', 'xrp.bep20',
      'sol.bep20', 'ada.bep20', 'doge.bep20', 'dot.bep20',
      'shib.bep20', 'ltc', 'busd.bep20', 'ton', 'twt.bep20'
    ]
  } = options;

  const baseUrl = 'https://pst-telecom-production.up.railway.app';

  const toSign = {
    coin,
    acceptedCoins,
    amount: String(parseFloat(amount).toFixed(2)),
    successUrl: baseUrl + '/api/zama/pay-success?order=' + orderId,
    canceledUrl: baseUrl + '/api/zama/pay-cancel?order=' + orderId,
    failedUrl: baseUrl + '/api/zama/pay-failed?order=' + orderId,
  };

  const payload = {
    ...toSign,
    firstname: (senderName || 'Client').split(' ')[0],
    lastname: (senderName || '').split(' ').slice(1).join(' ') || '',
    email: senderEmail || '',
    memo: 'ZAMA-' + orderId,
  };

  const signature = iziSign(toSign);

  try {
    const resp = await iziClient.post(
      '/api/payements/init_operation_with_customer_data',
      payload,
      { headers: { 'x-api-key': IZIPAY_API_KEY, 'x-signature': signature } }
    );
    return resp.data;
  } catch (err) {
    console.error('[iziPay]', err.response?.data || err.message);
    return { url: IZIPAY_POS + '?memo=ZAMA-' + orderId };
  }
}

async function sendAdminEmail(subject, html) {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    await transporter.sendMail({
      from: '"ZAMA by PST Telecom" <' + process.env.GMAIL_USER + '>',
      to: process.env.GMAIL_USER,
      subject, html
    });
  } catch(e) { console.log('[email]', e.message); }
}

// ─── MONGODB ────────────────────────────────────────────────
async function connectDB() {
  if (!MONGODB_URI) { console.warn('⚠️ MONGODB_URI manquant — mode memoire'); return; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('pst_telecom');
    console.log('✅ MongoDB Atlas connecte');
  } catch (err) { console.error('❌ MongoDB:', err.message); }
}

// ─── FORFAITS ───────────────────────────────────────────────
const FORFAITS = {
  starter:  { nom: 'Starter',  minutes: 200,   prix: 2990 },
  smart:    { nom: 'Smart',    minutes: 300,   prix: 5990 },
  business: { nom: 'Business', minutes: 99999, prix: 15990 },
};
const SMS_PACKS = {
  pack1: { points: 5,  prix: 1000, label: '5 points' },
  pack2: { points: 12, prix: 2000, label: '12 points' },
  pack3: { points: 30, prix: 4500, label: '30 points' },
  pack4: { points: 70, prix: 9000, label: '70 points' },
};

// ─── DB HELPERS ─────────────────────────────────────────────
async function getAbonnes() {
  if (db) return await db.collection('abonnes').find({}).sort({ createdAt: -1 }).toArray();
  return global._abonnes || [];
}
async function saveAbonne(a) {
  if (db) await db.collection('abonnes').insertOne(a);
  else { global._abonnes = global._abonnes || []; global._abonnes.push(a); }
}
async function updateAbonne(userId, update) {
  if (db) await db.collection('abonnes').updateOne({ userId }, { $set: update });
  else global._abonnes = (global._abonnes || []).map(a => a.userId === userId ? { ...a, ...update } : a);
}
async function deleteAbonne(userId) {
  if (db) await db.collection('abonnes').deleteOne({ userId });
  else global._abonnes = (global._abonnes || []).filter(a => a.userId !== userId);
}

// ─── AUTH ADMIN ─────────────────────────────────────────────
function authAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== ADMIN_PASSWORD) {
    const page = '<html><head><meta charset=\"UTF-8\"><title>PST</title>' +
      '<style>body{background:#0d2137;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
      '.b{background:#111c2a;border-radius:16px;padding:2rem;width:300px;text-align:center}' +
      'input{width:100%;padding:.8rem;background:#0d2137;border:1px solid #333;border-radius:8px;color:white;font-size:1rem;margin:.5rem 0}' +
      '.btn{width:100%;padding:.8rem;background:#00c864;color:#000;border:none;border-radius:8px;font-weight:700;cursor:pointer}</style></head>' +
      '<body><div class=\"b\"><h2 style=\"color:#00c864\">PST Admin</h2>' +
      '<input type=\"password\" id=\"p\" placeholder=\"Mot de passe\"/>' +
      '<button class=\"btn\" onclick=\"var p=document.getElementById(\\"p\\").value;if(p)location.href=\\"/admin?token=\\"+p\">Acceder</button>' +
      '</div></body></html>';
    return res.send(page);
  }
  next();
}

// ════════════════════════════════════════════
// ROUTES STATIQUES
// ════════════════════════════════════════════
app.get('/', (req, res) => res.redirect('https://pst-telecom.vercel.app'));
app.get('/admin', authAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/sms-marketing', (req, res) => res.sendFile(path.join(__dirname, 'sms-marketing.html')));
app.get('/appel', (req, res) => res.sendFile(path.join(__dirname, 'appel.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/sms', (req, res) => res.sendFile(path.join(__dirname, 'sms.html')));
app.get('/streaming', (req, res) => res.sendFile(path.join(__dirname, 'streaming.html')));
app.get('/recharge', (req, res) => res.sendFile(path.join(__dirname, 'recharge.html')));
app.get('/noc', (req, res) => res.sendFile(path.join(__dirname, 'noc.html')));
app.get('/trax', (req, res) => res.sendFile(path.join(__dirname, 'pst-trax.html')));
app.get('/trax-driver', (req, res) => res.sendFile(path.join(__dirname, 'pst-trax-driver.html')));
app.get('/zama', (req, res) => res.sendFile(path.join(__dirname, 'zama.html')));
app.get('/crypto-admin', (req, res) => res.sendFile(path.join(__dirname, 'crypto-dashboard.html')));
app.get('/izipay-widget.js', (req, res) => res.sendFile(path.join(__dirname, 'izipay-widget.js')));

// ════════════════════════════════════════════
// PST-TRAX ROUTES
// ════════════════════════════════════════════
app.post('/api/trax/register', async (req, res) => {
  try {
    const { name, phone, role, vid, vType, password } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'Donnees manquantes' });
    const np = normalizePhone(phone);
    if (db) {
      const ex = await db.collection('trax_users').findOne({ $or: [{ phone: np }, { phone: '+221' + np }] });
      if (ex) return res.status(409).json({ exists: true, error: 'Numero deja inscrit' });
      const user = { id: 'U-' + Date.now(), name, phone: np, role, password: password || '', vid: vid || null, typeLabel: vType?.label || null, typeIcon: vType?.icon || null, createdAt: new Date() };
      await db.collection('trax_users').insertOne(user);
      return res.json({ success: true, user: { id: user.id, name, phone: np, role, vid, typeLabel: user.typeLabel, typeIcon: user.typeIcon } });
    }
    return res.json({ success: true, user: { id: 'U-' + Date.now(), name, phone: np, role, vid } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trax/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telephone requis' });
    const np = normalizePhone(phone);
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const user = await db.collection('trax_users').findOne({ $or: [{ phone: np }, { phone: '+221' + np }] });
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    if (user.password && user.password !== password) return res.status(401).json({ error: 'wrong_password' });
    return res.json({ success: true, user: { id: user.id, name: user.name, phone: np, role: user.role, vid: user.vid, typeLabel: user.typeLabel, typeIcon: user.typeIcon } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trax/reset-password', async (req, res) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword) return res.status(400).json({ error: 'Donnees manquantes' });
    const np = normalizePhone(phone);
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const r = await db.collection('trax_users').updateOne({ $or: [{ phone: np }, { phone: '+221' + np }] }, { $set: { password: newPassword, updatedAt: new Date() } });
    if (r.matchedCount === 0) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trax/vehicles', async (req, res) => {
  try {
    if (db) {
      const v = await db.collection('trax_vehicles').find({}).toArray();
      return res.json(v.map(x => { delete x._id; return x; }));
    }
    res.json(Object.values(global._trax_vehicles || {}));
  } catch(e) { res.json([]); }
});

app.post('/api/trax/vehicles', async (req, res) => {
  try {
    const v = req.body;
    if (!Array.isArray(v)) return res.status(400).json({ error: 'Format invalide' });
    if (db) {
      await db.collection('trax_vehicles').deleteMany({});
      if (v.length > 0) await db.collection('trax_vehicles').insertMany(v.map(x => { delete x._id; return x; }));
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trax/position', async (req, res) => {
  try {
    const d = req.body;
    if (!d.lat || !d.lng) return res.status(400).json({ error: 'GPS manquant' });
    const vid = d.vehicleId || d.id;
    if (!vid) return res.status(400).json({ error: 'vehicleId requis' });
    let cut = false;
    if (db) {
      await db.collection('trax_vehicles').updateOne(
        { $or: [{ vehicleId: vid }, { id: vid }] },
        { $set: { lat: parseFloat(d.lat), lng: parseFloat(d.lng), speed: d.speed || 0, status: d.status || 'online', lastSeen: new Date(), driver: d.driver || d.driverName, phone: d.phone } },
        { upsert: true }
      );
      await db.collection('trax_positions').insertOne({ vehicleId: vid, lat: parseFloat(d.lat), lng: parseFloat(d.lng), speed: d.speed || 0, status: d.status || 'online', createdAt: new Date() });
      const vehicle = await db.collection('trax_vehicles').findOne({ $or: [{ vehicleId: vid }, { id: vid }] });
      if (vehicle) cut = vehicle.cut || false;
    } else {
      global._trax_vehicles = global._trax_vehicles || {};
      global._trax_vehicles[vid] = { ...d, lastSeen: Date.now() };
    }
    res.json({ success: true, cut });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trax/vehicles/:vehicleId', async (req, res) => {
  try {
    if (db) {
      const v = await db.collection('trax_vehicles').findOne({ $or: [{ vehicleId: req.params.vehicleId }, { id: req.params.vehicleId }] });
      return res.json(v || {});
    }
    res.json((global._trax_vehicles || {})[req.params.vehicleId] || {});
  } catch(e) { res.json({}); }
});

app.get('/api/trax/history/:vehicleId', async (req, res) => {
  try {
    const hours = req.query.hours || 24;
    const since = new Date(Date.now() - hours * 3600000);
    if (db) {
      const positions = await db.collection('trax_positions').find({ vehicleId: req.params.vehicleId, createdAt: { $gte: since } }).sort({ createdAt: 1 }).limit(1000).toArray();
      return res.json(positions);
    }
    res.json([]);
  } catch(e) { res.json([]); }
});

app.post('/api/trax/cut/:vehicleId', async (req, res) => {
  try {
    const cut = req.body.cut !== false;
    if (db) await db.collection('trax_vehicles').updateOne({ $or: [{ vehicleId: req.params.vehicleId }, { id: req.params.vehicleId }] }, { $set: { cut, cutAt: new Date() } });
    else { if (global._trax_vehicles?.[req.params.vehicleId]) global._trax_vehicles[req.params.vehicleId].cut = cut; }
    res.json({ success: true, cut });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trax/commands/:vehicleId', async (req, res) => {
  try {
    if (db) {
      const v = await db.collection('trax_vehicles').findOne({ $or: [{ vehicleId: req.params.vehicleId }, { id: req.params.vehicleId }] });
      if (!v) return res.json({ cut: false });
      if (v.pendingMessage) await db.collection('trax_vehicles').updateOne({ vehicleId: req.params.vehicleId }, { $unset: { pendingMessage: '' } });
      return res.json({ cut: v.cut || false, message: v.pendingMessage || null });
    }
    res.json({ cut: false });
  } catch(e) { res.json({ cut: false }); }
});

app.post('/api/trax/message/:vehicleId', async (req, res) => {
  try {
    if (db) await db.collection('trax_vehicles').updateOne({ $or: [{ vehicleId: req.params.vehicleId }, { id: req.params.vehicleId }] }, { $set: { pendingMessage: req.body.message } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/trax/stats', async (req, res) => {
  try {
    if (db) {
      const vehicles = await db.collection('trax_vehicles').find({}).toArray();
      return res.json({ total: vehicles.length, moving: vehicles.filter(v => v.status === 'moving').length, stopped: vehicles.filter(v => v.status === 'stopped').length, offline: vehicles.filter(v => v.status === 'offline').length, alert: vehicles.filter(v => v.status === 'alert').length });
    }
    res.json({ total: 0, moving: 0, stopped: 0, offline: 0, alert: 0 });
  } catch(e) { res.json({ total: 0, moving: 0, stopped: 0, offline: 0, alert: 0 }); }
});

app.delete('/api/trax/vehicles/:vehicleId', async (req, res) => {
  try {
    if (db) {
      await db.collection('trax_vehicles').deleteOne({ $or: [{ vehicleId: req.params.vehicleId }, { id: req.params.vehicleId }] });
      await db.collection('trax_positions').deleteMany({ vehicleId: req.params.vehicleId });
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// PST STREAM CHANNELS
// ════════════════════════════════════════════
app.get('/api/channels', async (req, res) => {
  try {
    if (db) {
      const config = await db.collection('pst_stream_config').findOne({ key: 'channels' });
      return res.json({ channels: config ? config.channels : [] });
    }
    res.json({ channels: global._pst_channels || [] });
  } catch(e) { res.json({ channels: [] }); }
});

app.post('/api/channels', async (req, res) => {
  try {
    const { channels } = req.body;
    if (db) {
      await db.collection('pst_stream_config').updateOne({ key: 'channels' }, { $set: { channels, updatedAt: new Date() } }, { upsert: true });
    } else global._pst_channels = channels;
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// NOC / RECHARGE STATS
// ════════════════════════════════════════════
app.get('/api/noc/agent/status', async (req, res) => {
  try {
    if (!db) return res.json({ cameras: 0, online: 0, offline: 0 });
    const cameras = await db.collection('cameras').find({}).toArray();
    res.json({ cameras: cameras.length, online: cameras.filter(c => c.statut === 'online').length, offline: cameras.filter(c => c.statut !== 'online').length });
  } catch(e) { res.json({ cameras: 0, online: 0, offline: 0 }); }
});

app.get('/api/recharge/stats', async (req, res) => {
  try {
    if (!db) return res.json({ recharges: 0, reussies: 0, echecs: 0, fcfa: 0 });
    const recharges = await db.collection('recharges').find({}).toArray();
    res.json({ recharges: recharges.length, reussies: recharges.filter(r => r.statut === 'success').length, echecs: recharges.filter(r => r.statut === 'failed').length, fcfa: recharges.filter(r => r.statut === 'success').reduce((s, r) => s + (r.montant || 0), 0) });
  } catch(e) { res.json({ recharges: 0, reussies: 0, echecs: 0, fcfa: 0 }); }
});

// ════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (password !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Mot de passe incorrect' });
  res.json({ success: true, role: SUPER_ADMINS.includes(email.toLowerCase()) ? 'super' : 'admin', name: email.split('@')[0] });
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    res.json({ total: abonnes.length, actifs: abonnes.filter(a => a.statut === 'actif').length, attente: abonnes.filter(a => a.statut === 'en_attente').length, revenus: abonnes.filter(a => a.statut === 'actif').reduce((s, a) => s + (FORFAITS[a.forfait]?.prix || 0), 0) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/abonnes', async (req, res) => {
  try { res.json(await getAbonnes()); } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('abonnes').find({}).sort({ createdAt: -1 }).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/admin/activer/:userId', async (req, res) => {
  try {
    await updateAbonne(req.params.userId, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date() });
    const abonnes = await getAbonnes();
    const abonne = abonnes.find(a => a.userId === req.params.userId);
    if (abonne) {
      const at = getAT();
      if (at) {
        try { await at.SMS.send({ to: abonne.telephone, message: 'PST Telecom: Votre forfait ' + abonne.forfaitNom + ' est ACTIF! Numero: ' + abonne.numeroVirtuel, from: 'PST' }); } catch(e) {}
      }
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/suspendre/:userId', async (req, res) => {
  try { await updateAbonne(req.params.userId, { statut: 'suspendu', updatedAt: new Date() }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/abonne/:userId', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait, minutesBonus } = req.body;
    const update = { updatedAt: new Date() };
    if (nom) update.nom = nom; if (prenom) update.prenom = prenom; if (telephone) update.telephone = telephone;
    if (forfait && FORFAITS[forfait]) { update.forfait = forfait; update.forfaitNom = FORFAITS[forfait].nom; update.prix = FORFAITS[forfait].prix; update.minutes = FORFAITS[forfait].minutes; }
    if (minutesBonus && db) await db.collection('abonnes').updateOne({ userId: req.params.userId }, { $inc: { minutes: parseInt(minutesBonus) }, $set: update });
    else await updateAbonne(req.params.userId, update);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/abonne/:userId', async (req, res) => {
  try { await deleteAbonne(req.params.userId); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/activity', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const logs = await db.collection('activity_logs').find({}).sort({ createdAt: -1 }).limit(50).toArray();
    res.json(logs.map(l => ({ type: l.type, message: l.message, time: new Date(l.createdAt).toLocaleTimeString('fr-FR') })));
  } catch(e) { res.json([]); }
});

app.get('/api/admin/payments', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('payments').find({}).sort({ createdAt: -1 }).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/admin/payments', async (req, res) => {
  try {
    const { userId, montant, moyen, type, reference, statut } = req.body;
    if (!userId || !montant) return res.status(400).json({ error: 'userId et montant requis' });
    const payment = { userId, montant: parseInt(montant), moyen: moyen || 'wave', type: type || 'forfait', reference: reference || '', statut: statut || 'en_attente', createdAt: new Date() };
    const result = await db.collection('payments').insertOne(payment);
    res.json({ success: true, id: result.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/payments/:id/validate', async (req, res) => {
  try {
    const payment = await db.collection('payments').findOne({ _id: new ObjectId(req.params.id) });
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
    await db.collection('payments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { statut: 'confirme', validatedAt: new Date() } });
    await db.collection('abonnes').updateOne({ userId: payment.userId }, { $set: { statut: 'actif', activatedAt: new Date() } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/payments/:id', async (req, res) => {
  try { await db.collection('payments').deleteOne({ _id: new ObjectId(req.params.id) }); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// ABONNES / APPELS / WAVE
// ════════════════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait = 'smart' } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et telephone obligatoires' });
    const f = FORFAITS[forfait] || FORFAITS.smart;
    const abonne = { userId: genUserId(), nom, prenom, telephone, forfait, forfaitNom: f.nom, minutes: f.minutes, minutesUsees: 0, prix: f.prix, numeroVirtuel: genNumero(), statut: 'en_attente', createdAt: new Date(), updatedAt: new Date(), paiements: [] };
    await saveAbonne(abonne);
    const at = getAT();
    if (at) { try { await at.SMS.send({ to: telephone, message: 'Bienvenue PST Telecom! Forfait ' + f.nom + ' active. ID: ' + abonne.userId, from: 'PST' }); } catch(e) {} }
    res.json({ success: true, userId: abonne.userId, numeroVirtuel: abonne.numeroVirtuel, lienWave: 'https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=' + f.prix });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appel/initier', async (req, res) => {
  try {
    const { userId, numeroDestination } = req.body;
    const abonnes = await getAbonnes();
    const abonne = abonnes.find(a => a.userId === userId);
    if (!abonne) return res.status(404).json({ error: 'Abonne introuvable' });
    if (abonne.statut !== 'actif') return res.status(403).json({ error: 'Forfait non actif' });
    const VONAGE_KEY = process.env.VONAGE_API_KEY; const VONAGE_SECRET = process.env.VONAGE_API_SECRET;
    if (VONAGE_KEY && VONAGE_SECRET) {
      try {
        const to = numeroDestination.replace(/\s/g, '');
        const credentials = Buffer.from(VONAGE_KEY + ':' + VONAGE_SECRET).toString('base64');
        const r = await fetch('https://api.nexmo.com/v1/calls', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + credentials }, body: JSON.stringify({ to: [{ type: 'phone', number: to }], from: { type: 'phone', number: process.env.VONAGE_NUMBER || '12345678901' }, ncco: [{ action: 'talk', text: 'Appel PST Telecom.', language: 'fr-FR' }] }) });
        if (r.ok) { const data = await r.json(); return res.json({ success: true, callId: data.uuid, type: 'real' }); }
      } catch(e) {}
    }
    res.json({ success: true, callId: 'CALL-DEMO-' + Math.random().toString(16).slice(2, 8).toUpperCase(), type: 'sandbox' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/webhook/wave', async (req, res) => {
  try {
    const { amount, client_reference } = req.body;
    if (client_reference) await updateAbonne(client_reference, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// SMS VERIFICATION (5SIM)
// ════════════════════════════════════════════
const SMS_SERVICES = [
  { id: 'whatsapp', nom: 'WhatsApp', icon: '💬', prix_points: 1 },
  { id: 'google', nom: 'Google / Gmail', icon: '🔵', prix_points: 1 },
  { id: 'facebook', nom: 'Facebook', icon: '📘', prix_points: 1 },
  { id: 'instagram', nom: 'Instagram', icon: '📸', prix_points: 1 },
  { id: 'tiktok', nom: 'TikTok', icon: '🎵', prix_points: 1 },
  { id: 'telegram', nom: 'Telegram', icon: '✈️', prix_points: 1 },
  { id: 'twitter', nom: 'Twitter / X', icon: '🐦', prix_points: 1 },
  { id: 'snapchat', nom: 'Snapchat', icon: '👻', prix_points: 1 },
  { id: 'microsoft', nom: 'Microsoft', icon: '🪟', prix_points: 2 },
  { id: 'apple', nom: 'Apple', icon: '🍎', prix_points: 2 },
  { id: 'amazon', nom: 'Amazon', icon: '📦', prix_points: 2 },
  { id: 'netflix', nom: 'Netflix', icon: '🎬', prix_points: 2 },
  { id: 'chatgpt', nom: 'ChatGPT / OpenAI', icon: '🤖', prix_points: 2 },
  { id: 'discord', nom: 'Discord', icon: '🎮', prix_points: 1 },
  { id: 'uber', nom: 'Uber', icon: '🚗', prix_points: 1 },
  { id: 'linkedin', nom: 'LinkedIn', icon: '💼', prix_points: 1 },
  { id: 'viber', nom: 'Viber', icon: '📱', prix_points: 1 },
  { id: 'airbnb', nom: 'Airbnb', icon: '🏠', prix_points: 2 },
];

app.get('/api/sms/services', async (req, res) => {
  const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
  if (FIVESIM_KEY) {
    try {
      const r = await fetch('https://5sim.net/v1/guest/products/any/any', { headers: { 'Authorization': 'Bearer ' + FIVESIM_KEY, 'Accept': 'application/json' } });
      if (r.ok) {
        const data = await r.json();
        const services = Object.entries(data).map(([id, info]) => ({ id, nom: id.charAt(0).toUpperCase() + id.slice(1), icon: '📱', prix_points: Math.max(1, Math.ceil((info.Cost || 0.01) / 0.04)), count: info.Qty || 0 })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
        return res.json(services);
      }
    } catch(e) {}
  }
  res.json(SMS_SERVICES);
});

app.get('/api/sms/packs', (req, res) => res.json(SMS_PACKS));

app.post('/api/sms/acheter-points', async (req, res) => {
  try {
    const { pack } = req.body;
    const p = SMS_PACKS[pack];
    if (!p) return res.status(400).json({ error: 'Pack invalide' });
    res.json({ success: true, lienWave: 'https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=' + p.prix, pack: p });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/confirmer-points', async (req, res) => {
  try {
    const { userId, pack } = req.body;
    const p = SMS_PACKS[pack];
    if (!p) return res.status(400).json({ error: 'Pack invalide' });
    if (db) await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: p.points }, $push: { historiquePoints: { type: 'achat', points: p.points, pack, date: new Date() } } });
    res.json({ success: true, pointsAjoutes: p.points });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/demander-numero', async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const service = SMS_SERVICES.find(s => s.id === serviceId) || { id: serviceId, nom: serviceId, prix_points: 1 };
    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
    if (FIVESIM_KEY) {
      try {
        const r = await fetch('https://5sim.net/v1/user/buy/activation/any/any/' + service.id, { headers: { 'Authorization': 'Bearer ' + FIVESIM_KEY, 'Accept': 'application/json' } });
        if (r.ok) {
          const data = await r.json();
          const activationId = 'FSIM-' + data.id;
          const expireAt = new Date(Date.now() + 20 * 60 * 1000);
          if (db) await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: -service.prix_points }, $push: { activationsSMS: { activationId, fivesimId: data.id, serviceId, service: service.nom, numeroTemp: data.phone, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } } });
          return res.json({ success: true, activationId, numeroTemp: data.phone, service: service.nom, expireAt });
        }
      } catch(e) { console.warn('5SIM:', e.message); }
    }
    const numeroTemp = '+1' + Math.floor(2000000000 + Math.random() * 8000000000);
    const activationId = 'ACT-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    const expireAt = new Date(Date.now() + 20 * 60 * 1000);
    if (db) await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: -service.prix_points }, $push: { activationsSMS: { activationId, serviceId, service: service.nom, numeroTemp, expireAt, statut: 'en_attente', smsRecu: null, createdAt: new Date() } } });
    res.json({ success: true, activationId, numeroTemp, service: service.nom, expireAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms/verifier/:activationId', async (req, res) => {
  try {
    const { activationId } = req.params; const { userId } = req.query;
    if (!db) return res.json({ activationId, statut: 'en_attente', smsRecu: null });
    const abonne = await db.collection('abonnes').findOne({ userId });
    if (!abonne) return res.status(404).json({ error: 'Abonne introuvable' });
    const activation = (abonne.activationsSMS || []).find(a => a.activationId === activationId);
    if (!activation) return res.status(404).json({ error: 'Activation introuvable' });
    if (activation.smsRecu) return res.json({ activationId, statut: 'recu', smsRecu: activation.smsRecu });
    const FIVESIM_KEY = process.env.FIVESIM_API_KEY;
    if (FIVESIM_KEY && activation.fivesimId) {
      try {
        const r = await fetch('https://5sim.net/v1/user/check/' + activation.fivesimId, { headers: { 'Authorization': 'Bearer ' + FIVESIM_KEY } });
        if (r.ok) {
          const data = await r.json();
          if (data.sms?.length > 0) {
            const smsText = data.sms[0].text;
            await db.collection('abonnes').updateOne({ userId, 'activationsSMS.activationId': activationId }, { $set: { 'activationsSMS.$.smsRecu': smsText, 'activationsSMS.$.statut': 'recu' } });
            return res.json({ activationId, statut: 'recu', smsRecu: smsText });
          }
        }
      } catch(e) {}
    }
    res.json({ activationId, statut: activation.statut, smsRecu: null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/inscription', async (req, res) => {
  try {
    const { nom, telephone } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et telephone obligatoires' });
    if (db) { const exist = await db.collection('comptes_sms').findOne({ telephone }); if (exist) return res.json({ success: true, userId: exist.userId, nouveau: false }); }
    const userId = 'SMS-' + Math.random().toString(16).slice(2, 10).toUpperCase();
    const compte = { userId, nom, telephone, pointsSMS: 0, type: 'sms_only', createdAt: new Date(), activationsSMS: [], historiquePoints: [] };
    if (db) await db.collection('comptes_sms').insertOne(compte);
    res.json({ success: true, userId, nouveau: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms/connexion', async (req, res) => {
  try {
    const { userId, telephone } = req.body;
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    let compte = await db.collection('comptes_sms').findOne({ userId, telephone });
    if (!compte) compte = await db.collection('abonnes').findOne({ userId, telephone });
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ success: true, compte });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms/compte/:userId', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    const compte = await db.collection('comptes_sms').findOne({ userId: req.params.userId }) || await db.collection('abonnes').findOne({ userId: req.params.userId });
    if (!compte) return res.status(404).json({ error: 'Compte introuvable' });
    res.json({ userId: compte.userId, nom: compte.nom, pointsSMS: compte.pointsSMS || 0, type: compte.type || 'abonne' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/sms-stats', async (req, res) => {
  try {
    if (!db) return res.json({ totalActivations: 0, pointsVendus: 0 });
    const abonnes = await db.collection('abonnes').find({}).toArray();
    let totalActivations = 0, pointsVendus = 0;
    abonnes.forEach(a => { totalActivations += (a.activationsSMS || []).length; (a.historiquePoints || []).forEach(h => { if (h.type === 'achat') pointsVendus += h.points; }); });
    res.json({ totalActivations, pointsVendus });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/ajouter-points', async (req, res) => {
  try {
    const { userId, points } = req.body;
    if (!db) return res.json({ success: true });
    await db.collection('abonnes').updateOne({ userId }, { $inc: { pointsSMS: parseInt(points) }, $push: { historiquePoints: { type: 'admin', points: parseInt(points), date: new Date() } } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// SMS MARKETING
// ════════════════════════════════════════════
app.post('/api/sms-marketing/send', async (req, res) => {
  try {
    const { campagne, messages, sender, scheduled } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: 'Aucun message' });
    const camp = { campagne: campagne || 'Campagne SMS', sender: sender || 'PST-Telecom', total: messages.length, envoyes: 0, echecs: 0, statut: scheduled ? 'planifie' : 'en_cours', scheduledAt: scheduled ? new Date(scheduled) : null, createdAt: new Date() };
    const result = db ? await db.collection('sms_campagnes').insertOne(camp) : { insertedId: null };
    if (scheduled) { if (db) await db.collection('sms_campagnes').updateOne({ _id: result.insertedId }, { $set: { messages, statut: 'planifie' } }); return res.json({ success: true, statut: 'planifie' }); }
    const AT = require('africastalking')({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    const sms = AT.SMS; let envoyes = 0, echecs = 0;
    for (const msg of messages) { try { await sms.send({ to: [msg.telephone], message: msg.message, from: sender || 'PST-Telecom' }); envoyes++; } catch(e) { echecs++; } await new Promise(r => setTimeout(r, 100)); }
    if (db) await db.collection('sms_campagnes').updateOne({ _id: result.insertedId }, { $set: { envoyes, echecs, statut: 'termine', finishedAt: new Date() } });
    res.json({ success: true, envoyes, echecs, total: messages.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms-marketing/campagnes', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('sms_campagnes').find({}, { projection: { messages: 0 } }).sort({ createdAt: -1 }).limit(50).toArray());
  } catch(e) { res.json([]); }
});

app.get('/api/sms-marketing/stats', async (req, res) => {
  try {
    if (!db) return res.json({ totalCampagnes: 0, totalEnvoyes: 0, totalEchecs: 0 });
    const campagnes = await db.collection('sms_campagnes').find({}).toArray();
    res.json({ totalCampagnes: campagnes.length, totalEnvoyes: campagnes.reduce((s, c) => s + (c.envoyes || 0), 0), totalEchecs: campagnes.reduce((s, c) => s + (c.echecs || 0), 0) });
  } catch(e) { res.json({ totalCampagnes: 0, totalEnvoyes: 0, totalEchecs: 0 }); }
});

app.post('/api/sms-marketing/verify-ref', async (req, res) => {
  try {
    const { reference, telephone, smsCount } = req.body;
    if (!reference || reference.length < 5) return res.json({ valid: false, error: 'Reference trop courte' });
    const ref = reference.toUpperCase().trim();
    if (db) {
      const existing = await db.collection('sms_refs_utilisees').findOne({ reference: ref });
      if (existing) return res.json({ valid: false, error: 'Reference deja utilisee' });
      await db.collection('sms_refs_utilisees').insertOne({ reference: ref, telephone, smsCount: parseInt(smsCount) || 0, utiliseeAt: new Date() });
    }
    res.json({ valid: true });
  } catch(e) { res.status(500).json({ valid: false, error: e.message }); }
});

app.post('/api/sms-marketing/generate-code', async (req, res) => {
  try {
    const { telephone, smsCount, pack, montant, notes } = req.body;
    const code = 'PST-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (db) await db.collection('sms_codes').insertOne({ code, telephone, smsCount: parseInt(smsCount) || 0, pack: pack || '', montant: parseInt(montant) || 0, notes: notes || '', statut: 'actif', utilise: false, createdAt: new Date(), expireAt });
    res.json({ success: true, code, expireAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms-marketing/verify-code', async (req, res) => {
  try {
    const { code, telephone, smsCount } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Code requis' });
    if (!db) return res.json({ valid: false, error: 'DB indisponible' });
    const codeDoc = await db.collection('sms_codes').findOne({ code: code.toUpperCase().trim(), statut: 'actif', utilise: false, expireAt: { $gt: new Date() } });
    if (!codeDoc) return res.json({ valid: false, error: 'Code invalide ou expire' });
    await db.collection('sms_codes').updateOne({ code: code.toUpperCase().trim() }, { $set: { utilise: true, utiliseAt: new Date(), utilisePar: telephone } });
    res.json({ valid: true, smsCount: codeDoc.smsCount, pack: codeDoc.pack });
  } catch(e) { res.status(500).json({ valid: false, error: e.message }); }
});

app.get('/api/sms-marketing/codes', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('sms_codes').find({}).sort({ createdAt: -1 }).limit(100).toArray());
  } catch(e) { res.json([]); }
});

app.delete('/api/sms-marketing/codes/:code', async (req, res) => {
  try {
    if (db) await db.collection('sms_codes').updateOne({ code: req.params.code }, { $set: { statut: 'revoque' } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms-marketing/refs', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('sms_refs_utilisees').find({}).sort({ utiliseeAt: -1 }).limit(100).toArray());
  } catch(e) { res.json([]); }
});

app.delete('/api/sms-marketing/refs/:ref', async (req, res) => {
  try {
    if (db) await db.collection('sms_refs_utilisees').deleteOne({ reference: req.params.ref.toUpperCase() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════
// ZAMA ROUTES — TOUTES UNIQUES
// ════════════════════════════════════════════

// Register user
app.post('/api/zama/register', async (req, res) => {
  try {
    if (db) await db.collection('zama_users').updateOne({ phone: req.body.phone }, { $set: { ...req.body, updated_at: new Date() } }, { upsert: true });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// KYC
app.post('/api/zama/kyc', async (req, res) => {
  try {
    const { user_id, doc_type, doc_num, dob, nationality, photo_recto, photo_verso, photo_selfie } = req.body;
    if (db) {
      await db.collection('zama_users').updateOne({ id: user_id }, { $set: { kyc: true, kyc_pending: true, kyc_submitted_at: new Date(), kyc_data: { doc_type, doc_num, dob, nationality }, kyc_photos: { recto: photo_recto || null, verso: photo_verso || null, selfie: photo_selfie || null } } }, { upsert: true });
    }
    await sendAdminEmail('ZAMA KYC — Nouveau dossier: ' + (doc_num || user_id), '<h2>Nouveau KYC ZAMA</h2><p><strong>User:</strong> ' + user_id + '</p><p><strong>Doc:</strong> ' + doc_type + ' N° ' + doc_num + '</p>');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/zama/kyc/approve', async (req, res) => {
  try {
    const { user_id, approved } = req.body;
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Non autorise' });
    if (db) await db.collection('zama_users').updateOne({ id: user_id }, { $set: { kyc: approved, kyc_pending: false, kyc_approved: approved, kyc_reviewed_at: new Date() } });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/zama/kyc/pending', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const users = await db.collection('zama_users').find({ kyc_pending: true }).sort({ kyc_submitted_at: -1 }).toArray();
    res.json(users.map(u => { const { _id, ...r } = u; delete r.password; return r; }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Create order
app.post('/api/zama/create', async (req, res) => {
  try {
    const { src_currency, amount, rate_fcfa, net_fcfa, receiver_name, receiver_phone, receiver_mm, sender_name, sender_email, message, user_id } = req.body;
    const orderId = 'ZAMA-' + Date.now();
    const amountUSD = src_currency === 'USD' ? parseFloat(amount) : parseFloat((amount * 606 / (rate_fcfa || 606)).toFixed(2));

    const order = { order_id: orderId, src_currency, amount, rate_fcfa, net_fcfa, receiver_name, receiver_phone, receiver_mm, sender_name, sender_email, message, user_id: user_id || null, status: 'pending', created_at: new Date() };
    if (db) await db.collection('zama_orders').insertOne(order);

    // Générer URL izichangePay
    let paymentUrl = null;
    try {
      const iziData = await generateIziPayUrl({ amount: amountUSD, orderId, senderName: sender_name || 'Client ZAMA', senderEmail: sender_email || '' });
      paymentUrl = iziData?.url || iziData?.data?.url || null;
    } catch(e) { console.log('[iziPay]', e.message); }

    // Email admin
    await sendAdminEmail(
      'ZAMA — Nouvelle commande ' + orderId,
      '<h2>Nouvelle commande ZAMA</h2>' +
      '<p><strong>Ref:</strong> ' + orderId + '</p>' +
      '<p><strong>Montant:</strong> ' + amount + ' ' + src_currency + '</p>' +
      '<p><strong>Destinataire reçoit:</strong> ' + (net_fcfa || 0).toLocaleString('fr-FR') + ' FCFA via ' + receiver_mm + '</p>' +
      '<p><strong>Destinataire:</strong> ' + receiver_name + ' · ' + receiver_phone + '</p>' +
      '<p><strong>Expediteur:</strong> ' + sender_name + ' · ' + sender_email + '</p>'
    );

    // Email confirmation expéditeur
    if (sender_email) {
      await sendAdminEmail(
        'ZAMA — Confirmation REF: ' + orderId,
        '<div style="font-family:Arial;max-width:500px;padding:24px">' +
        '<h2 style="color:#F59E0B">ZAMA — Confirmation</h2>' +
        '<p>Bonjour ' + sender_name + ',</p><p>Votre demande est enregistrée.</p>' +
        '<p><strong>Réf:</strong> ' + orderId + '</p>' +
        '<p><strong>Destinataire reçoit:</strong> ' + (net_fcfa || 0).toLocaleString('fr-FR') + ' FCFA</p>' +
        '<p style="color:#F59E0B">ZAMA by PST Telecom</p></div>'
      );
    }

    res.json({ success: true, order_id: orderId, payment_url: paymentUrl, net_fcfa });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Status
app.get('/api/zama/status/:orderId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'pending', order_id: req.params.orderId });
    const order = await db.collection('zama_orders').findOne({ order_id: req.params.orderId });
    if (!order) return res.json({ status: 'not_found' });
    const { _id, ...safe } = order;
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// IPN
app.post('/api/zama/ipn', async (req, res) => {
  try {
    const payload = req.body;
    const memo = payload.memo || payload.data?.memo || '';
    const orderId = memo.replace('ZAMA-', '').trim();
    const status = payload.status || payload.data?.status;
    console.log('[ZAMA IPN] order:', orderId, 'status:', status);
    if ((status === 'completed' || status === 'confirmed') && orderId && db) {
      const order = await db.collection('zama_orders').findOne({ order_id: orderId });
      if (order && order.status === 'pending') {
        await db.collection('zama_orders').updateOne({ order_id: orderId }, { $set: { status: 'paid', paid_at: new Date(), ipn_data: payload } });
        await sendAdminEmail(
          'ZAMA ✅ Paiement recu! ' + orderId,
          '<h2 style="color:green">Paiement confirme!</h2>' +
          '<p><strong>Ref:</strong> ' + orderId + '</p>' +
          '<p><strong>ACTION: Envoyer ' + (order.net_fcfa || 0).toLocaleString('fr-FR') + ' FCFA sur ' + order.receiver_phone + ' via ' + order.receiver_mm + '</strong></p>'
        );
        try {
          const at = getAT();
          if (at) {
            const phone = order.receiver_phone.startsWith('+') ? order.receiver_phone : '+221' + order.receiver_phone;
            await at.SMS.send({ to: [phone], message: 'ZAMA: Vous allez recevoir ' + (order.net_fcfa || 0).toLocaleString() + ' FCFA. Ref: ' + orderId + '. PST Telecom', from: 'PST' });
          }
        } catch(e) {}
      }
    }
    res.json({ received: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Pay redirects
app.get('/api/zama/pay-success', async (req, res) => {
  const { order } = req.query;
  if (order && db) await db.collection('zama_orders').updateOne({ order_id: order }, { $set: { status: 'paid', paid_at: new Date() } }).catch(() => {});
  res.redirect('https://pst-telecom-production.up.railway.app/zama?paid=' + (order || ''));
});
app.get('/api/zama/pay-cancel', (req, res) => res.redirect('https://pst-telecom-production.up.railway.app/zama?cancelled=' + (req.query.order || '')));
app.get('/api/zama/pay-failed', (req, res) => res.redirect('https://pst-telecom-production.up.railway.app/zama?failed=' + (req.query.order || '')));

// Admin — orders
app.get('/api/zama/orders', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const orders = await db.collection('zama_orders').find({}).sort({ created_at: -1 }).limit(200).toArray();
    res.json(orders.map(o => { const { _id, ...r } = o; return r; }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin — users
app.get('/api/zama/users', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const users = await db.collection('zama_users').find({}).sort({ created: -1 }).limit(200).toArray();
    res.json(users.map(u => { const { _id, ...r } = u; delete r.password; return r; }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get address (pour feature Recevoir)
app.post('/api/zama/get-address', async (req, res) => {
  try {
    const { coin, orderId } = req.body;
    const cleanCoin = (coin || 'usdt.trc20').toLowerCase();
    const oid = orderId || 'RECV-' + Date.now();
    const toSign = { coin: cleanCoin, amount: '1', orderId: oid };
    const signature = iziSign(toSign);
    try {
      const resp = await iziClient.post('/api/payements/address', { coin: cleanCoin, orderId: oid }, { headers: { 'x-api-key': IZIPAY_API_KEY, 'x-signature': signature } });
      if (resp.data?.address) return res.json({ address: resp.data.address, coin: cleanCoin });
    } catch(e) { console.log('[get-address]', e.response?.data || e.message); }
    res.json({ error: 'Adresse non disponible pour le moment — la whitelist Railway est en attente' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Contact
app.post('/api/zama/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (db) await db.collection('zama_contacts').insertOne({ name, email, message, createdAt: new Date() });
    await sendAdminEmail('ZAMA — Contact: ' + name, '<p><strong>De:</strong> ' + name + ' (' + email + ')</p><p>' + message + '</p>');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── DÉMARRAGE ──────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('\n🚀 PST — Pure Smart Telecom');
    console.log('📡 Backend actif sur port', PORT);
    console.log('💾 MongoDB:', db ? 'connecte' : 'mode memoire');
  });
});
