// PST — Pure Smart Telecom v3.0
// Base de données persistante + Admin complet

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
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

// Base de données persistante sur disque
const DB_FILE = path.join(__dirname, 'pst-db.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch(e) {}
  return { users: {}, calls: {}, payments: {} };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(e) {}
}

let db = loadDB();

// ══════════════════════════════════════════
// API ABONNÉS
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

  db.users[userId] = {
    userId, nom, prenom, telephone, forfait, numeroVirtuel,
    minutesRestantes: FORFAITS[forfait].minutes,
    minutesTotal: FORFAITS[forfait].minutes,
    actif: false,
    dateInscription: new Date().toISOString(),
    dateRenouvellement: new Date(Date.now() + 30*24*3600*1000).toISOString(),
    historiquePaiements: [],
    notes: '',
  };
  saveDB(db);

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

app.get('/api/users/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.json(user);
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(db.users));
});

// Modifier un abonné
app.put('/api/users/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  const { nom, prenom, telephone, forfait, actif, minutesRestantes, notes } = req.body;
  if (nom) user.nom = nom;
  if (prenom) user.prenom = prenom;
  if (telephone) user.telephone = telephone;
  if (forfait && FORFAITS[forfait]) user.forfait = forfait;
  if (typeof actif === 'boolean') user.actif = actif;
  if (minutesRestantes !== undefined) user.minutesRestantes = parseInt(minutesRestantes);
  if (notes !== undefined) user.notes = notes;
  saveDB(db);
  res.json({ success: true, user });
});

// Activer un abonné
app.post('/api/users/:userId/activer', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  user.actif = true;
  user.minutesRestantes = FORFAITS[user.forfait].minutes;
  user.minutesTotal = FORFAITS[user.forfait].minutes;
  user.dateRenouvellement = new Date(Date.now() + 30*24*3600*1000).toISOString();
  user.historiquePaiements.push({
    date: new Date().toISOString(),
    montant: FORFAITS[user.forfait].price,
    forfait: user.forfait,
    methode: 'manuel',
  });
  saveDB(db);
  res.json({ success: true, user });
});

// Suspendre un abonné
app.post('/api/users/:userId/suspendre', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  user.actif = false;
  saveDB(db);
  res.json({ success: true });
});

// Supprimer un abonné
app.delete('/api/users/:userId', (req, res) => {
  if (!db.users[req.params.userId]) return res.status(404).json({ error: 'Introuvable' });
  delete db.users[req.params.userId];
  saveDB(db);
  res.json({ success: true });
});

// Ajouter des minutes
app.post('/api/users/:userId/minutes', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  const { minutes } = req.body;
  user.minutesRestantes += parseInt(minutes);
  user.minutesTotal += parseInt(minutes);
  saveDB(db);
  res.json({ success: true, minutesRestantes: user.minutesRestantes });
});

// ══════════════════════════════════════════
// WEBHOOK WAVE
// ══════════════════════════════════════════

app.post('/api/webhook/wave', async (req, res) => {
  try {
    const { amount, status, client_reference, transaction_id } = req.body;
    if (status !== 'succeeded' && status !== 'complete') return res.json({ received: true });
    const montant = parseInt(amount);
    const forfait = MONTANTS[montant];
    if (!forfait) return res.json({ received: true });
    const user = db.users[client_reference];
    if (!user) return res.json({ received: true });
    user.actif = true;
    user.forfait = forfait;
    user.minutesRestantes = FORFAITS[forfait].minutes;
    user.minutesTotal = FORFAITS[forfait].minutes;
    user.dateRenouvellement = new Date(Date.now() + 30*24*3600*1000).toISOString();
    user.historiquePaiements = user.historiquePaiements || [];
    user.historiquePaiements.push({ date: new Date().toISOString(), montant, forfait, methode: 'wave', transaction_id });
    db.payments[transaction_id || Date.now()] = { userId: user.userId, montant, forfait, statut: 'confirme', date: new Date().toISOString() };
    saveDB(db);
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

// PAIEMENT
app.get('/api/payer/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.redirect(`https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${FORFAITS[user.forfait].price}&client_reference=${user.userId}`);
});

// APPELS
app.get('/api/calls/history/:userId', (req, res) => {
  const appels = Object.values(db.calls || {}).filter(c => c.userId === req.params.userId).slice(0, 20);
  res.json(appels);
});

// STATS ADMIN
app.get('/api/admin/stats', (req, res) => {
  const users = Object.values(db.users);
  const payments = Object.values(db.payments || {});
  const revenus = payments.reduce((s, p) => s + (p.montant || 0), 0);
  res.json({
    totalAbonnes: users.length,
    abonnesActifs: users.filter(u => u.actif).length,
    abonnésSuspendus: users.filter(u => !u.actif && u.dateInscription).length,
    revenus, revenusFormate: revenus.toLocaleString('fr-FR') + ' FCFA',
    revenusMois: revenus,
  });
});

// ══════════════════════════════════════════
// PAGES HTML
// ══════════════════════════════════════════

app.get('/appel', (req, res) => {
  const appel = path.join(__dirname, 'appel.html');
  if (fs.existsSync(appel)) return res.sendFile(appel);
  res.send('<h1>PST Appel</h1><p>Fichier appel.html non trouvé</p>');
});

app.get('/admin', (req, res) => {
  const admin = path.join(__dirname, 'admin.html');
  if (fs.existsSync(admin)) return res.sendFile(admin);
  res.send('<h1>PST Admin</h1><p>Fichier admin.html non trouvé</p>');
});

app.get('/', (req, res) => {
  res.json({
    service: 'PST — Pure Smart Telecom v3.0',
    status: 'Online',
    db: `${Object.keys(db.users).length} abonnés`,
    pages: { admin: '/admin', appel: '/appel' },
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PST v3.0 — Port ${PORT} — DB persistante`));
module.exports = app;
