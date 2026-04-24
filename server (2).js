// ============================================
// PST — Pure Smart Telecom
// Backend API — Node.js + Express
// ============================================

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ── Configuration ──────────────────────────
const CONFIG = {
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken:  process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER, // ex: +12015550123
  },
  wave: {
    apiKey: process.env.WAVE_API_KEY,
    baseUrl: 'https://api.wave.com/v1',
  },
  orangeMoney: {
    clientId:     process.env.ORANGE_CLIENT_ID,
    clientSecret: process.env.ORANGE_CLIENT_SECRET,
    baseUrl:      'https://api.orange.com/orange-money-webpay/sn/v1',
  },
};

const twilioClient = twilio(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);

// ── Base de données en mémoire (remplacer par PostgreSQL en prod) ──
const db = {
  users: {},       // userId -> user
  calls: {},       // callSid -> call
  payments: {},    // paymentRef -> payment
};

// ── Forfaits PST ───────────────────────────
const FORFAITS = {
  starter:  { name: 'Starter',  price: 2000,  minutes: 60,  numeros: 1 },
  smart:    { name: 'Smart',    price: 5000,  minutes: 200, numeros: 1 },
  business: { name: 'Business', price: 15000, minutes: 9999, numeros: 5 },
};

// ══════════════════════════════════════════
// 1. AUTH — Inscription / Connexion
// ══════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { nom, prenom, telephone, forfait } = req.body;

  if (!nom || !telephone || !forfait || !FORFAITS[forfait]) {
    return res.status(400).json({ error: 'Données manquantes ou forfait invalide' });
  }

  const userId = 'USR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

  // Acheter un numéro Twilio pour cet abonné
  let numeroVirtuel = null;
  try {
    const number = await twilioClient.incomingPhoneNumbers.create({
      phoneNumber: await getAvailableSNNumber(),
      friendlyName: `PST-${userId}`,
      voiceUrl: `${process.env.BASE_URL}/api/calls/incoming`,
    });
    numeroVirtuel = number.phoneNumber;
  } catch (err) {
    // En mode dev, on génère un numéro fictif
    numeroVirtuel = '+221 77 ' + Math.floor(100 + Math.random() * 900) + ' ' +
                   Math.floor(10 + Math.random() * 90) + ' ' +
                   Math.floor(10 + Math.random() * 90);
  }

  const user = {
    userId,
    nom,
    prenom,
    telephone,
    forfait,
    numeroVirtuel,
    minutesRestantes: FORFAITS[forfait].minutes,
    dateInscription: new Date().toISOString(),
    dateRenouvellement: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    actif: false, // devient true après paiement
  };

  db.users[userId] = user;

  res.json({
    success: true,
    userId,
    numeroVirtuel,
    message: `Compte PST créé. Procédez au paiement pour activer votre forfait ${FORFAITS[forfait].name}.`,
  });
});

// GET /api/users/:userId
app.get('/api/users/:userId', (req, res) => {
  const user = db.users[req.params.userId];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// ══════════════════════════════════════════
// 2. PAIEMENT — Wave Money
// ══════════════════════════════════════════

// POST /api/payment/wave/initiate
app.post('/api/payment/wave/initiate', async (req, res) => {
  const { userId, telephone } = req.body;
  const user = db.users[userId];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const forfait = FORFAITS[user.forfait];
  const reference = 'PST-W-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  try {
    // Appel API Wave réel
    const response = await fetch(`${CONFIG.wave.baseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.wave.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount:   forfait.price,
        currency: 'XOF',
        error_url:   `${process.env.BASE_URL}/payment/error`,
        success_url: `${process.env.BASE_URL}/payment/success?ref=${reference}`,
        client_reference: reference,
      }),
    });

    const data = await response.json();

    db.payments[reference] = {
      reference,
      userId,
      methode: 'wave',
      montant: forfait.price,
      forfait: user.forfait,
      statut: 'en_attente',
      createdAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      reference,
      wave_launch_url: data.wave_launch_url,
      message: 'Scannez le QR code ou cliquez le lien Wave pour payer',
    });

  } catch (err) {
    // Mode simulation (sans vraie clé Wave)
    const reference2 = 'PST-W-DEMO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    res.json({
      success: true,
      reference: reference2,
      wave_launch_url: `wave://pay?amount=${forfait.price}&ref=${reference2}`,
      demo: true,
      message: `[MODE DEMO] Paiement Wave simulé de ${forfait.price} FCFA`,
    });
  }
});

// ══════════════════════════════════════════
// 3. PAIEMENT — Orange Money
// ══════════════════════════════════════════

// POST /api/payment/orange/initiate
app.post('/api/payment/orange/initiate', async (req, res) => {
  const { userId, telephone } = req.body;
  const user = db.users[userId];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const forfait = FORFAITS[user.forfait];
  const reference = 'PST-OM-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const orderId   = 'ORD-' + Date.now();

  try {
    // Étape 1: obtenir le token OAuth Orange
    const tokenResp = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(
          `${CONFIG.orangeMoney.clientId}:${CONFIG.orangeMoney.clientSecret}`
        ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = await tokenResp.json();

    // Étape 2: initier le paiement
    const payResp = await fetch(`${CONFIG.orangeMoney.baseUrl}/webpayment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_key:   process.env.ORANGE_MERCHANT_KEY,
        currency:       'OUV',
        order_id:       orderId,
        amount:         forfait.price,
        return_url:     `${process.env.BASE_URL}/payment/success?ref=${reference}`,
        cancel_url:     `${process.env.BASE_URL}/payment/cancel`,
        notif_url:      `${process.env.BASE_URL}/api/payment/orange/webhook`,
        lang:           'fr',
        reference:      reference,
      }),
    });
    const payData = await payResp.json();

    db.payments[reference] = {
      reference, userId, methode: 'orange_money',
      montant: forfait.price, forfait: user.forfait,
      statut: 'en_attente', createdAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      reference,
      payment_url: payData.payment_url,
    });

  } catch (err) {
    // Mode simulation
    res.json({
      success: true,
      reference,
      payment_url: `https://payment.orange.sn/demo?amount=${forfait.price}&ref=${reference}`,
      demo: true,
      message: `[MODE DEMO] Paiement Orange Money simulé de ${forfait.price} FCFA`,
    });
  }
});

// POST /api/payment/confirm — webhook de confirmation (Wave & Orange)
app.post('/api/payment/confirm', (req, res) => {
  const { reference } = req.body;
  const payment = db.payments[reference];
  if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });

  payment.statut = 'confirme';
  payment.confirmedAt = new Date().toISOString();

  // Activer le compte abonné
  const user = db.users[payment.userId];
  if (user) {
    user.actif = true;
    user.forfait = payment.forfait;
    user.minutesRestantes = FORFAITS[payment.forfait].minutes;
    user.dateRenouvellement = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  }

  res.json({ success: true, message: 'Forfait activé avec succès', userId: payment.userId });
});

// GET /api/payment/status/:reference
app.get('/api/payment/status/:reference', (req, res) => {
  const payment = db.payments[req.params.reference];
  if (!payment) return res.status(404).json({ error: 'Paiement introuvable' });
  res.json(payment);
});

// ══════════════════════════════════════════
// 4. APPELS — Twilio VoIP
// ══════════════════════════════════════════

// POST /api/calls/token — génère un token Twilio pour l'app
app.post('/api/calls/token', (req, res) => {
  const { userId } = req.body;
  const user = db.users[userId];
  if (!user || !user.actif) {
    return res.status(403).json({ error: 'Compte inactif ou introuvable' });
  }
  if (user.minutesRestantes <= 0) {
    return res.status(403).json({ error: 'Plus de minutes disponibles. Renouvelez votre forfait.' });
  }

  const AccessToken   = twilio.jwt.AccessToken;
  const VoiceGrant    = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });

  const token = new AccessToken(
    CONFIG.twilio.accountSid,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: userId }
  );
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity: userId });
});

// POST /api/calls/outgoing — TwiML pour appel sortant
app.post('/api/calls/outgoing', (req, res) => {
  const { To, userId } = req.body;
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const dial = twiml.dial({ callerId: CONFIG.twilio.phoneNumber, record: 'do-not-record' });
  dial.number(To);

  // Déduire les minutes
  const user = db.users[userId];
  if (user) {
    const callEntry = {
      callSid: 'CALL-' + crypto.randomBytes(4).toString('hex'),
      userId,
      to: To,
      direction: 'sortant',
      debut: new Date().toISOString(),
    };
    db.calls[callEntry.callSid] = callEntry;
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /api/calls/incoming — TwiML pour appel entrant
app.post('/api/calls/incoming', (req, res) => {
  const { To } = req.body;
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Trouver l'abonné propriétaire de ce numéro
  const user = Object.values(db.users).find(u => u.numeroVirtuel === To);

  if (user && user.actif) {
    const dial = twiml.dial();
    dial.client(user.userId);
  } else {
    twiml.say({ language: 'fr-FR' }, 'Ce numéro PST n\'est pas disponible pour le moment.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// POST /api/calls/status — webhook de fin d'appel (Twilio)
app.post('/api/calls/status', (req, res) => {
  const { CallSid, CallDuration, CallStatus } = req.body;
  const call = db.calls[CallSid];

  if (call && CallStatus === 'completed') {
    const dureeMin = Math.ceil(parseInt(CallDuration) / 60);
    call.duree = CallDuration + 's';
    call.statut = 'termine';
    call.fin = new Date().toISOString();

    const user = db.users[call.userId];
    if (user) {
      user.minutesRestantes = Math.max(0, user.minutesRestantes - dureeMin);
    }
  }

  res.sendStatus(200);
});

// GET /api/calls/history/:userId
app.get('/api/calls/history/:userId', (req, res) => {
  const appels = Object.values(db.calls)
    .filter(c => c.userId === req.params.userId)
    .sort((a, b) => new Date(b.debut) - new Date(a.debut))
    .slice(0, 20);
  res.json(appels);
});

// ══════════════════════════════════════════
// 5. HELPERS
// ══════════════════════════════════════════

async function getAvailableSNNumber() {
  // Cherche un numéro disponible au Sénégal
  // Twilio ne couvre pas encore le +221, donc on utilise un numéro US en prod
  try {
    const numbers = await twilioClient.availablePhoneNumbers('US').local.list({ limit: 1 });
    return numbers[0].phoneNumber;
  } catch {
    return process.env.TWILIO_PHONE_NUMBER;
  }
}

// ── Démarrage ──────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════╗
  ║   PST — Pure Smart Telecom       ║
  ║   Backend API démarré            ║
  ║   http://localhost:${PORT}          ║
  ╚══════════════════════════════════╝
  `);
});

module.exports = app;
