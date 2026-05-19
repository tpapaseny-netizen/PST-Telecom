// ============================================
// PST — Pure Smart Telecom
// Backend API — Africa's Talking (Sénégal)
// ============================================

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const AfricasTalking = require('africastalking');

const app = express();
app.use(cors({ origin: ['https://www.sensms.com', 'https://sensms.com', 'https://zama-sn.com', 'https://www.zama-sn.com', 'https://pst-telecom.vercel.app'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Configuration ──────────────────────────
const at = AfricasTalking({
  apiKey:   process.env.AT_API_KEY   || 'atsk_4cc283ea904f64552c636f8cc32a0290b693bb9ec19d42151bb0708be692aa07dd5d94c5',
  username: process.env.AT_USERNAME  || 'sandbox',
});

const voice = at.VOICE;
const sms   = at.SMS;

// ── Forfaits PST ───────────────────────────
const FORFAITS = {
  starter:  { name: 'Starter',  price: 2000,  minutes: 60,   numeros: 1 },
  smart:    { name: 'Smart',    price: 5000,  minutes: 200,  numeros: 1 },
  business: { name: 'Business', price: 15000, minutes: 9999, numeros: 5 },
};

// ── Base de données en mémoire ─────────────
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

  const user = {
    userId, nom, prenom, telephone, forfait,
    numeroVirtuel,
    minutesRestantes: FORFAITS[forfait].minutes,
    actif: false,
    dateInscription:   new Date().toISOString(),
    dateRenouvellement: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };

  db.users[userId] = user;

  // Envoyer un SMS de bienvenue via Africa's Talking
  try {
    await sms.send({
      to:      [telephone],
      message: `Bienvenue sur PST ! Votre compte est créé. Numéro virtuel : ${numeroVirtuel}. Activez votre forfait ${FORFAITS[forfait].name} pour commencer à appeler.`,
      from:    'PST',
    });
  } catch (e) {
    console.log('SMS sandbox:', e.message);
  }

  res.json({ success: true, userId, numeroVirtuel,
    message: `Compte PST créé ! Forfait ${FORFAITS[forfait].name} en attente de paiement.` });
});

// GET profil
app.get('/api/users/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });
  res.json(user);
});

// ══════════════════════════════════════════
// 2. APPELS VOIX — Africa's Talking
// ══════════════════════════════════════════

// POST /api/calls/make — déclencher un appel sortant
app.post('/api/calls/make', async (req, res) => {
  const { userId, numeroDestination } = req.body;
  const user = db.users[userId];

  if (!user || !user.actif) {
    return res.status(403).json({ error: 'Compte inactif. Payez votre forfait.' });
  }
  if (user.minutesRestantes <= 0) {
    return res.status(403).json({ error: 'Plus de minutes. Renouvelez votre forfait.' });
  }

  try {
    const result = await voice.call({
      callFrom: '+12025551234', // numéro sandbox AT
      callTo:   [numeroDestination],
    });

    const callId = 'CALL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.calls[callId] = {
      callId, userId,
      numeroDestination,
      direction: 'sortant',
      statut:    'initié',
      debut:     new Date().toISOString(),
    };

    res.json({ success: true, callId, result,
      message: `Appel vers ${numeroDestination} initié !` });

  } catch (err) {
    // Mode sandbox — simuler l'appel
    const callId = 'CALL-DEMO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    db.calls[callId] = {
      callId, userId, numeroDestination,
      direction: 'sortant', statut: 'demo',
      debut: new Date().toISOString(),
    };
    res.json({ success: true, callId, demo: true,
      message: `[SANDBOX] Appel simulé vers ${numeroDestination}` });
  }
});

// POST /api/calls/incoming — webhook appel entrant (Africa's Talking appelle cette URL)
app.post('/api/calls/incoming', (req, res) => {
  const { callerNumber, destinationNumber } = req.body;

  // Trouver l'abonné PST par son numéro virtuel
  const user = Object.values(db.users).find(u =>
    u.numeroVirtuel.replace(/\s/g, '') === destinationNumber
  );

  // Répondre avec une action XML Africa's Talking
  let xml;
  if (user && user.actif) {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Bienvenue chez PST Pure Smart Telecom. Connexion en cours.</Say>
  <Dial phoneNumbers="${user.telephone}" ringbackTone="https://www.soundjay.com/phone/phone-calling-1.mp3"/>
</Response>`;
  } else {
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Ce numéro PST n'est pas disponible pour le moment. Veuillez réessayer plus tard.</Say>
</Response>`;
  }

  res.type('application/xml').send(xml);
});

// POST /api/calls/status — webhook fin d'appel
app.post('/api/calls/status', (req, res) => {
  const { callSessionState, durationInSeconds, callerNumber } = req.body;

  if (callSessionState === 'Completed' && durationInSeconds) {
    const dureeMin = Math.ceil(parseInt(durationInSeconds) / 60);
    // Trouver et mettre à jour l'appel
    const call = Object.values(db.calls).find(c =>
      c.numeroDestination === callerNumber && c.statut === 'initié'
    );
    if (call) {
      call.statut = 'terminé';
      call.duree  = durationInSeconds + 's';
      call.fin    = new Date().toISOString();
      const user = db.users[call.userId];
      if (user) user.minutesRestantes = Math.max(0, user.minutesRestantes - dureeMin);
    }
  }

  res.sendStatus(200);
});

// GET historique des appels
app.get('/api/calls/history/:userId', (req, res) => {
  const appels = Object.values(db.calls)
    .filter(c => c.userId === req.params.userId)
    .sort((a, b) => new Date(b.debut) - new Date(a.debut))
    .slice(0, 20);
  res.json(appels);
});

// ══════════════════════════════════════════
// 3. PAIEMENT — Wave Money
// ══════════════════════════════════════════

app.post('/api/payment/wave/initiate', async (req, res) => {
  const { userId } = req.body;
  const user = db.users[userId];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const forfait   = FORFAITS[user.forfait];
  const reference = 'PST-W-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  db.payments[reference] = {
    reference, userId, methode: 'wave',
    montant: forfait.price, forfait: user.forfait,
    statut: 'en_attente', createdAt: new Date().toISOString(),
  };

  try {
    const response = await fetch('https://api.wave.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WAVE_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        amount:           forfait.price,
        currency:         'XOF',
        success_url:      `${process.env.BASE_URL}/payment/success?ref=${reference}`,
        error_url:        `${process.env.BASE_URL}/payment/error`,
        client_reference: reference,
      }),
    });
    const data = await response.json();
    res.json({ success: true, reference, wave_launch_url: data.wave_launch_url });

  } catch {
    // Mode démo
    res.json({
      success: true, reference, demo: true,
      wave_launch_url: `wave://pay?amount=${forfait.price}&ref=${reference}`,
      message: `[DEMO] Paiement Wave de ${forfait.price.toLocaleString()} FCFA`,
    });
  }
});

// ══════════════════════════════════════════
// 4. PAIEMENT — Orange Money
// ══════════════════════════════════════════

app.post('/api/payment/orange/initiate', async (req, res) => {
  const { userId } = req.body;
  const user = db.users[userId];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const forfait   = FORFAITS[user.forfait];
  const reference = 'PST-OM-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  db.payments[reference] = {
    reference, userId, methode: 'orange_money',
    montant: forfait.price, forfait: user.forfait,
    statut: 'en_attente', createdAt: new Date().toISOString(),
  };

  res.json({
    success: true, reference, demo: true,
    payment_url: `https://payment.orange.sn/demo?amount=${forfait.price}&ref=${reference}`,
    message: `[DEMO] Paiement Orange Money de ${forfait.price.toLocaleString()} FCFA`,
  });
});

// POST /api/payment/confirm — confirmer un paiement
app.post('/api/payment/confirm', (req, res) => {
  const { reference } = req.body;
  const payment = db.payments[reference];
  if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

  payment.statut      = 'confirme';
  payment.confirmedAt = new Date().toISOString();

  const user = db.users[payment.userId];
  if (user) {
    user.actif             = true;
    user.minutesRestantes  = FORFAITS[payment.forfait].minutes;
    user.dateRenouvellement = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    // SMS de confirmation
    sms.send({
      to:      [user.telephone],
      message: `PST: Forfait ${FORFAITS[payment.forfait].name} activé ! Vous avez ${FORFAITS[payment.forfait].minutes} minutes. Appelez depuis l'app PST. Merci !`,
      from:    'PST',
    }).catch(() => {});
  }

  res.json({ success: true, message: 'Forfait activé !', userId: payment.userId });
});

// GET statut paiement
app.get('/api/payment/status/:reference', (req, res) => {
  const p = db.payments[req.params.reference];
  if (!p) return res.status(404).json({ error: 'Introuvable' });
  res.json(p);
});

// ══════════════════════════════════════════
// 5. SMS — Notifications
// ══════════════════════════════════════════

app.post('/api/sms/send', async (req, res) => {
  const { userId, message } = req.body;
  const user = db.users[userId];
  if (!user) return res.status(404).json({ error: 'Introuvable' });

  try {
    const result = await sms.send({
      to:      [user.telephone],
      message,
      from:    'PST',
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
// SEN-SMS AUTH ROUTES (db en memoire)
// ════════════════════════════════════════════════
if (!db.sensmsUsers) db.sensmsUsers = {};

app.post('/api/sensms/register', async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });
    const existing = Object.values(db.sensmsUsers).find(u => u.phone === phone);
    if (existing) return res.json({ success: false, error: 'Numero deja enregistre' });
    
    const crypto = require('crypto'); const hash = crypto.createHash('sha256').update(password).digest('hex');
    const id = 'sms_' + Date.now();
    db.sensmsUsers[id] = { id, name, phone, email: email || '', password: hash, createdAt: new Date() };
    res.json({ success: true, user: { id, name, phone, email: email || '' } });
  } catch (e) { res.json({ success: false, error: 'Erreur serveur' }); }
});

app.post('/api/sensms/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    const user = Object.values(db.sensmsUsers || {}).find(u => u.phone === identifier || u.email === identifier);
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    
    const crypto = require('crypto'); const ok = (crypto.createHash('sha256').update(password).digest('hex') === user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email } });
  } catch (e) { res.json({ success: false, error: 'Erreur serveur' }); }
});
// FIN SEN-SMS AUTH ROUTES

// ── Démarrage ──────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   PST — Pure Smart Telecom           ║
  ║   Backend Africa's Talking           ║
  ║   http://localhost:${PORT}              ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
