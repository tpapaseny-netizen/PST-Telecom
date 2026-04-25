// ============================================
// PST — Pure Smart Telecom v2.0
// Backend API — Wave Webhook Automatique 🔥
// ============================================

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const AfricasTalking = require('africastalking');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY  || 'sandbox',
  username: process.env.AT_USERNAME || 'sandbox',
});
const voice = at.VOICE;
const sms   = at.SMS;

const FORFAITS = {
  starter:  { name: 'Starter',  price: 2990,  minutes: 200,  numeros: 1 },
  smart:    { name: 'Smart',    price: 5990,  minutes: 300,  numeros: 1 },
  business: { name: 'Business', price: 15990, minutes: 9999, numeros: 5 },
};

const MONTANTS = { 2990: 'starter', 5990: 'smart', 15990: 'business' };

const db = { users: {}, calls: {}, payments: {} };

// ══════════════════════════════════════════
// 1. INSCRIPTION
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
    userId, nom, prenom, telephone, forfait,
    numeroVirtuel,
    minutesRestantes: FORFAITS[forfait].minutes,
    actif: false,
    dateInscription:    new Date().toISOString(),
    dateRenouvellement: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };

  try {
    await sms.send({
      to: [telephone],
      message: `Bienvenue sur PST ! Numéro virtuel : ${numeroVirtuel}. Payez votre forfait ${FORFAITS[forfait].name} (${FORFAITS[forfait].price} FCFA) pour commencer : https://pst-telecom-production.up.railway.app/api/payer/${userId}`,
      from: 'PST',
    });
  } catch (e) { console.log('SMS:', e.message); }

  res.json({
    success: true, userId, numeroVirtuel,
    message: `Compte PST créé ! Forfait ${FORFAITS[forfait].name} en attente de paiement.`,
    lienPaiement: `https://pst-telecom-production.up.railway.app/api/payer/${userId}`,
  });
});

app.get('/api/users/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.json(user);
});

// ══════════════════════════════════════════
// 2. WEBHOOK WAVE AUTOMATIQUE 🔥
// ══════════════════════════════════════════

app.post('/api/webhook/wave', async (req, res) => {
  console.log('📩 Webhook Wave:', JSON.stringify(req.body));
  try {
    const { amount, status, client_reference, transaction_id } = req.body;
    if (status !== 'succeeded' && status !== 'complete') {
      return res.json({ received: true });
    }

    const montant = parseInt(amount);
    const forfait = MONTANTS[montant];
    if (!forfait) return res.json({ received: true });

    const user = db.users[client_reference];
    if (!user) return res.json({ received: true });

    // ✅ ACTIVATION AUTOMATIQUE
    user.actif            = true;
    user.forfait          = forfait;
    user.minutesRestantes = FORFAITS[forfait].minutes;
    user.dateRenouvellement = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    db.payments[transaction_id || Date.now()] = {
      userId: user.userId, montant, forfait,
      statut: 'confirme', date: new Date().toISOString(),
    };

    // ✅ SMS AUTOMATIQUE
    try {
      await sms.send({
        to: [user.telephone],
        message: `✅ PST: Paiement de ${montant} FCFA confirmé ! Forfait ${FORFAITS[forfait].name} activé. ${FORFAITS[forfait].minutes === 9999 ? 'Appels illimités' : FORFAITS[forfait].minutes + ' minutes'}. Votre numéro : ${user.numeroVirtuel}. Merci !`,
        from: 'PST',
      });
    } catch (e) { console.log('SMS erreur:', e.message); }

    console.log(`✅ ${user.userId} activé - ${forfait}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook erreur:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════
// 3. LIEN PAIEMENT WAVE
// ══════════════════════════════════════════

app.get('/api/payer/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  const forfait = FORFAITS[user.forfait];
  const lien = `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${forfait.price}&client_reference=${user.userId}`;
  res.redirect(lien);
});

// ══════════════════════════════════════════
// 4. APPELS
// ══════════════════════════════════════════

app.post('/api/calls/make', async (req, res) => {
  const { userId, numeroDestination } = req.body;
  const user = db.users[userId];
  if (!user || !user.actif) return res.status(403).json({ error: 'Compte inactif' });
  if (user.minutesRestantes <= 0) return res.status(403).json({ error: 'Plus de minutes' });

  const callId = 'CALL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  db.calls[callId] = { callId, userId, numeroDestination, direction: 'sortant', debut: new Date().toISOString() };

  try {
    const result = await voice.call({ callFrom: '+12025551234', callTo: [numeroDestination] });
    res.json({ success: true, callId, result });
  } catch {
    res.json({ success: true, callId, demo: true, message: `Appel vers ${numeroDestination}` });
  }
});

app.post('/api/calls/incoming', (req, res) => {
  const { destinationNumber } = req.body;
  const user = Object.values(db.users).find(u => u.numeroVirtuel.replace(/\s/g,'') === destinationNumber);
  const xml = user && user.actif
    ? `<?xml version="1.0"?><Response><Say>PST Pure Smart Telecom.</Say><Dial phoneNumbers="${user.telephone}"/></Response>`
    : `<?xml version="1.0"?><Response><Say>Numéro non disponible.</Say></Response>`;
  res.type('application/xml').send(xml);
});

app.get('/api/calls/history/:userId', (req, res) => {
  res.json(Object.values(db.calls).filter(c => c.userId === req.params.userId).slice(0, 20));
});

// ══════════════════════════════════════════
// 5. ADMIN
// ══════════════════════════════════════════

app.get('/api/admin/stats', (req, res) => {
  const users    = Object.values(db.users);
  const payments = Object.values(db.payments);
  const revenus  = payments.reduce((s, p) => s + p.montant, 0);
  res.json({
    totalAbonnes:  users.length,
    abonnesActifs: users.filter(u => u.actif).length,
    totalAppels:   Object.values(db.calls).length,
    revenus:       revenus,
    revenusFormate: revenus.toLocaleString('fr-FR') + ' FCFA',
  });
});

app.get('/appel', (req, res) => {
  res.sendFile(__dirname + '/appel.html');
});

app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

app.get('/', (req, res) => {
  res.json({
    service: 'PST — Pure Smart Telecom v2.0',
    status:  '✅ Online',
    webhook_wave: 'POST /api/webhook/wave',
    forfaits: Object.entries(FORFAITS).map(([k,v]) => ({
      id: k, nom: v.name, prix: v.price + ' FCFA', minutes: v.minutes === 9999 ? 'Illimité' : v.minutes
    })),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`PST v2.0 — Port ${PORT} — Wave Webhook Automatique ✅`);
});

module.exports = app;
