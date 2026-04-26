// PST — Pure Smart Telecom v4.0
// MongoDB Atlas — Données persistantes

const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const AfricasTalking = require('africastalking');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY  || 'sandbox',
  username: process.env.AT_USERNAME || 'sandbox',
});
const sms = at.SMS;

const FORFAITS = {
  starter:  { name: 'Starter',  price: 2990,  minutes: 200,  numeros: 1 },
  smart:    { name: 'Smart',    price: 5990,  minutes: 300,  numeros: 1 },
  business: { name: 'Business', price: 15990, minutes: 9999, numeros: 5 },
};
const MONTANTS = { 2990: 'starter', 5990: 'smart', 15990: 'business' };

// ── MongoDB ────────────────────────────────
let db;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('pst_telecom');
    console.log('✅ MongoDB connecté');
    // Créer les index
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });
    await db.collection('users').createIndex({ telephone: 1 });
  } catch(err) {
    console.error('❌ MongoDB erreur:', err.message);
  }
}

function users()    { return db.collection('users'); }
function payments() { return db.collection('payments'); }
function calls()    { return db.collection('calls'); }

// ══════════════════════════════════════════
// 1. ABONNÉS
// ══════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
  const { nom, prenom, telephone, forfait } = req.body;
  if (!nom || !telephone || !forfait || !FORFAITS[forfait]) {
    return res.status(400).json({ error: 'Données manquantes' });
  }
  const userId = 'PST-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const numeroVirtuel = '+221 77 ' +
    Math.floor(100 + Math.random() * 900) + ' ' +
    Math.floor(10  + Math.random() * 90)  + ' ' +
    Math.floor(10  + Math.random() * 90);

  const user = {
    userId, nom, prenom: prenom || '', telephone, forfait, numeroVirtuel,
    minutesRestantes: FORFAITS[forfait].minutes,
    minutesTotal: FORFAITS[forfait].minutes,
    actif: false,
    notes: '',
    dateInscription: new Date(),
    dateRenouvellement: new Date(Date.now() + 30*24*3600*1000),
    historiquePaiements: [],
  };

  await users().insertOne(user);

  try {
    await sms.send({
      to: [telephone],
      message: `Bienvenue sur PST ! Numéro : ${numeroVirtuel}. Payez ${FORFAITS[forfait].price} FCFA : https://pst-telecom-production.up.railway.app/api/payer/${userId}`,
      from: 'PST',
    });
  } catch(e) { console.log('SMS:', e.message); }

  res.json({
    success: true, userId, numeroVirtuel,
    message: `Compte PST créé !`,
    lienPaiement: `https://pst-telecom-production.up.railway.app/api/payer/${userId}`,
  });
});

app.get('/api/users', async (req, res) => {
  const liste = await users().find({}).sort({ dateInscription: -1 }).toArray();
  res.json(liste);
});

app.get('/api/users/:userId', async (req, res) => {
  const user = await users().findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.json(user);
});

app.put('/api/users/:userId', async (req, res) => {
  const { nom, prenom, telephone, forfait, actif, minutesRestantes, notes } = req.body;
  const update = {};
  if (nom) update.nom = nom;
  if (prenom !== undefined) update.prenom = prenom;
  if (telephone) update.telephone = telephone;
  if (forfait && FORFAITS[forfait]) update.forfait = forfait;
  if (typeof actif === 'boolean') update.actif = actif;
  if (minutesRestantes !== undefined) update.minutesRestantes = parseInt(minutesRestantes);
  if (notes !== undefined) update.notes = notes;
  await users().updateOne({ userId: req.params.userId }, { $set: update });
  const user = await users().findOne({ userId: req.params.userId });
  res.json({ success: true, user });
});

app.post('/api/users/:userId/activer', async (req, res) => {
  const user = await users().findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  const paiement = {
    date: new Date(), montant: FORFAITS[user.forfait].price,
    forfait: user.forfait, methode: 'manuel',
  };
  await users().updateOne({ userId: req.params.userId }, {
    $set: {
      actif: true,
      minutesRestantes: FORFAITS[user.forfait].minutes,
      minutesTotal: FORFAITS[user.forfait].minutes,
      dateRenouvellement: new Date(Date.now() + 30*24*3600*1000),
    },
    $push: { historiquePaiements: paiement },
  });
  await payments().insertOne({ userId: req.params.userId, ...paiement });
  res.json({ success: true });
});

app.post('/api/users/:userId/suspendre', async (req, res) => {
  await users().updateOne({ userId: req.params.userId }, { $set: { actif: false } });
  res.json({ success: true });
});

app.delete('/api/users/:userId', async (req, res) => {
  await users().deleteOne({ userId: req.params.userId });
  res.json({ success: true });
});

app.post('/api/users/:userId/minutes', async (req, res) => {
  const mins = parseInt(req.body.minutes);
  await users().updateOne({ userId: req.params.userId }, {
    $inc: { minutesRestantes: mins, minutesTotal: mins },
  });
  res.json({ success: true });
});

// ══════════════════════════════════════════
// 2. WEBHOOK WAVE
// ══════════════════════════════════════════

app.post('/api/webhook/wave', async (req, res) => {
  try {
    const { amount, status, client_reference, transaction_id } = req.body;
    if (status !== 'succeeded' && status !== 'complete') return res.json({ received: true });
    const montant = parseInt(amount);
    const forfait = MONTANTS[montant];
    if (!forfait) return res.json({ received: true });
    const user = await users().findOne({ userId: client_reference });
    if (!user) return res.json({ received: true });

    const paiement = { date: new Date(), montant, forfait, methode: 'wave', transaction_id };
    await users().updateOne({ userId: client_reference }, {
      $set: {
        actif: true, forfait,
        minutesRestantes: FORFAITS[forfait].minutes,
        minutesTotal: FORFAITS[forfait].minutes,
        dateRenouvellement: new Date(Date.now() + 30*24*3600*1000),
      },
      $push: { historiquePaiements: paiement },
    });
    await payments().insertOne({ userId: client_reference, ...paiement });

    try {
      await sms.send({
        to: [user.telephone],
        message: `PST: ${montant} FCFA reçu ! Forfait ${FORFAITS[forfait].name} activé. Numéro : ${user.numeroVirtuel}. Merci !`,
        from: 'PST',
      });
    } catch(e) {}
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════
// 3. PAIEMENT
// ══════════════════════════════════════════

app.get('/api/payer/:userId', async (req, res) => {
  const user = await users().findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.redirect(`https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${FORFAITS[user.forfait].price}&client_reference=${user.userId}`);
});

// ══════════════════════════════════════════
// 4. STATS ADMIN
// ══════════════════════════════════════════

app.get('/api/admin/stats', async (req, res) => {
  const total   = await users().countDocuments();
  const actifs  = await users().countDocuments({ actif: true });
  const paiList = await payments().find({}).toArray();
  const revenus = paiList.reduce((s, p) => s + (p.montant || 0), 0);
  res.json({
    totalAbonnes: total,
    abonnesActifs: actifs,
    abonnésSuspendus: total - actifs,
    revenus, revenusFormate: revenus.toLocaleString('fr-FR') + ' FCFA',
  });
});

// ══════════════════════════════════════════
// 5. PAGES HTML
// ══════════════════════════════════════════

app.get('/appel', (req, res) => {
  const f = path.join(__dirname, 'appel.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.send('<h1>PST Appel</h1>');
});

app.get('/admin', (req, res) => {
  const f = path.join(__dirname, 'admin.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  res.send('<h1>PST Admin</h1>');
});

app.get('/', (req, res) => {
  res.json({
    service: 'PST — Pure Smart Telecom v4.0',
    status: 'Online', db: 'MongoDB Atlas',
    pages: { admin: '/admin', appel: '/appel' },
  });
});

// ══════════════════════════════════════════
// 6. DÉMARRAGE
// ══════════════════════════════════════════

const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`PST v4.0 — Port ${PORT} — MongoDB Atlas`));
});

module.exports = app;
