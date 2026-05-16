"""
Script: inject_pstpay.py
Injecte les routes PST Pay dans server-at.js avant le bloc DÉMARRAGE
"""

PSTPAY_CODE = r"""
// ═══════════════════════════════════════════════════════════════
// ─── PST PAY — Agrégateur de paiement Mobile Money ─────────────
// Concurrent InTouch/Kayzen · Wave + OM + Free + Visa
// ═══════════════════════════════════════════════════════════════

// ── Config PST Pay ──────────────────────────────────────────────
const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY  || 'PAYDUNYA_MASTER_KEY_ICI';
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY || 'PAYDUNYA_PRIVATE_KEY_ICI';
const PAYDUNYA_TOKEN       = process.env.PAYDUNYA_TOKEN       || 'PAYDUNYA_TOKEN_ICI';
const PAYDUNYA_MODE        = process.env.PAYDUNYA_MODE        || 'test'; // 'test' ou 'live'
const PAYDUNYA_BASE        = PAYDUNYA_MODE === 'live'
  ? 'https://app.paydunya.com/api/v1'
  : 'https://app.paydunya.com/sandbox-api/v1';

// Frais PST Pay (marges sur PayDunya)
const PSTPAY_FEES = {
  wave:   { payin: 0.030, payout: 0.025 },  // 3% payin, 2.5% payout
  om:     { payin: 0.030, payout: 0.025 },
  free:   { payin: 0.030, payout: 0.025 },
  visa:   { payin: 0.040, payout: null  },   // 4% carte
  mock:   { payin: 0.010, payout: 0.010 },   // mode test
};

// ── Helpers PST Pay ─────────────────────────────────────────────
function pstpayHeaders() {
  return {
    'Content-Type':          'application/json',
    'PAYDUNYA-MASTER-KEY':   PAYDUNYA_MASTER_KEY,
    'PAYDUNYA-PRIVATE-KEY':  PAYDUNYA_PRIVATE_KEY,
    'PAYDUNYA-TOKEN':        PAYDUNYA_TOKEN,
  };
}

function genApiKey() {
  return 'PST-' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

function genCheckoutToken() {
  return 'CHK-' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

function calcFees(amount, method) {
  const fee = PSTPAY_FEES[method] || PSTPAY_FEES.mock;
  const payin_fee  = Math.round(amount * fee.payin);
  const payout_fee = fee.payout ? Math.round(amount * fee.payout) : 0;
  const net        = amount - payin_fee;
  return { payin_fee, payout_fee, net, total_fee: payin_fee + payout_fee };
}

// ── Adaptateurs paiement ────────────────────────────────────────
async function payinMock(amount, method, phone, description, token) {
  // Simuler un paiement (mode dev sans API)
  return {
    success: true,
    transaction_id: 'MOCK-' + Date.now(),
    token,
    amount,
    method,
    status: 'pending',
    payment_url: null,
    message: 'Mode test — aucun vrai paiement effectué',
  };
}

async function payinPayDunya(amount, method, phone, description, token, returnUrl) {
  try {
    const body = {
      invoice: {
        total_amount: amount,
        description: description || 'Paiement PST Pay',
      },
      store: {
        name: 'PST Pay',
        tagline: 'Paiement sécurisé',
        postal_address: 'Touba, Sénégal',
        phone: '+221771520959',
      },
      actions: {
        cancel_url:  returnUrl || 'https://pst-telecom-production.up.railway.app/pay/cancel',
        return_url:  returnUrl || 'https://pst-telecom-production.up.railway.app/pay/success',
        callback_url:'https://pst-telecom-production.up.railway.app/api/pstpay/ipn',
      },
      custom_data: { token, method },
    };
    const resp = await fetch(PAYDUNYA_BASE + '/checkout-invoice/create', {
      method: 'POST',
      headers: pstpayHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.response_code === '00') {
      return {
        success: true,
        transaction_id: data.token,
        token,
        amount,
        method,
        status: 'pending',
        payment_url: data.response_text,
      };
    }
    throw new Error(data.response_text || 'PayDunya erreur');
  } catch (e) {
    throw new Error('PayDunya: ' + e.message);
  }
}

async function payoutPayDunya(amount, method, phone, name) {
  try {
    const body = {
      account_alias: phone,
      amount: String(amount),
      account_name: name || 'Client PST Pay',
    };
    const endpoint = method === 'wave'
      ? '/disburse/get-status/wave-senegal'
      : method === 'om'
      ? '/disburse/get-status/orange-money-senegal'
      : '/disburse/get-status/free-money-senegal';
    const resp = await fetch(PAYDUNYA_BASE + endpoint, {
      method: 'POST',
      headers: pstpayHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return { success: data.response_code === '00', data };
  } catch (e) {
    throw new Error('Payout PayDunya: ' + e.message);
  }
}

// ── Middleware auth marchand ─────────────────────────────────────
async function authMerchant(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Clé API manquante' });
  if (!db) return res.status(503).json({ error: 'DB indisponible' });
  const merchant = await db.collection('pstpay_merchants').findOne({ api_key: apiKey, active: true });
  if (!merchant) return res.status(403).json({ error: 'Clé API invalide' });
  req.merchant = merchant;
  next();
}

// ════════════════════════════════════════════════════════════════
// ── ROUTES MARCHANDS ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Inscription marchand
app.post('/api/pstpay/merchants/register', async (req, res) => {
  try {
    const { business_name, email, phone, country, webhook_url } = req.body;
    if (!business_name || !email || !phone) {
      return res.status(400).json({ error: 'business_name, email, phone requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const existing = await db.collection('pstpay_merchants').findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email déjà enregistré' });
    const merchant = {
      business_name,
      email,
      phone,
      country: country || 'SN',
      webhook_url: webhook_url || null,
      api_key: genApiKey(),
      active: true,
      kyc_verified: false,
      balance_fcfa: 0,
      total_volume: 0,
      total_transactions: 0,
      commission_rate: 0.03,
      created_at: new Date(),
    };
    await db.collection('pstpay_merchants').insertOne(merchant);
    await db.collection('audit_logs').insertOne({
      event: 'pstpay_merchant_registered',
      email, business_name,
      timestamp: new Date(),
    });
    res.json({
      ok: true,
      message: 'Compte marchand créé',
      api_key: merchant.api_key,
      business_name,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Profil marchand
app.get('/api/pstpay/merchants/me', authMerchant, async (req, res) => {
  const m = req.merchant;
  res.json({
    business_name: m.business_name,
    email: m.email,
    phone: m.phone,
    kyc_verified: m.kyc_verified,
    balance_fcfa: m.balance_fcfa,
    total_volume: m.total_volume,
    total_transactions: m.total_transactions,
    commission_rate: m.commission_rate,
    api_key: m.api_key,
    created_at: m.created_at,
  });
});

// ════════════════════════════════════════════════════════════════
// ── ROUTES CHECKOUT ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Créer un checkout
app.post('/api/pstpay/checkout', authMerchant, async (req, res) => {
  try {
    const {
      amount, currency, description,
      methods, success_url, cancel_url,
      customer_name, customer_phone, customer_email,
      metadata,
    } = req.body;

    if (!amount || amount < 200) {
      return res.status(400).json({ error: 'Montant minimum 200 FCFA' });
    }

    const token = genCheckoutToken();
    const fees  = calcFees(amount, (methods || ['wave'])[0]);

    const checkout = {
      token,
      merchant_id: req.merchant._id,
      merchant_name: req.merchant.business_name,
      amount: parseInt(amount),
      currency: currency || 'XOF',
      description: description || 'Paiement',
      methods: methods || ['wave', 'om', 'free'],
      success_url: success_url || req.merchant.webhook_url,
      cancel_url: cancel_url || null,
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      customer_email: customer_email || null,
      metadata: metadata || {},
      fees,
      status: 'pending',
      payment_method: null,
      paydunya_token: null,
      checkout_url: 'https://pst-telecom-production.up.railway.app/pay/' + token,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    };

    await db.collection('pstpay_checkouts').insertOne(checkout);

    res.json({
      ok: true,
      token,
      checkout_url: checkout.checkout_url,
      amount,
      currency: checkout.currency,
      fees,
      expires_at: checkout.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Initier un paiement sur un checkout
app.post('/api/pstpay/checkout/:token/pay', async (req, res) => {
  try {
    const { method, phone, return_url } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const checkout = await db.collection('pstpay_checkouts').findOne({ token: req.params.token });
    if (!checkout) return res.status(404).json({ error: 'Checkout introuvable' });
    if (checkout.status !== 'pending') return res.status(400).json({ error: 'Checkout déjà traité' });
    if (new Date() > checkout.expires_at) return res.status(400).json({ error: 'Checkout expiré' });

    const allowedMethods = checkout.methods || ['wave', 'om', 'free'];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ error: 'Méthode non acceptée: ' + method });
    }

    let result;
    if (PAYDUNYA_MASTER_KEY === 'PAYDUNYA_MASTER_KEY_ICI') {
      // Mode mock (API pas encore disponible)
      result = await payinMock(checkout.amount, method, phone, checkout.description, checkout.token);
    } else {
      result = await payinPayDunya(checkout.amount, method, phone, checkout.description, checkout.token, return_url);
    }

    await db.collection('pstpay_checkouts').updateOne(
      { token: req.params.token },
      { $set: {
        payment_method: method,
        customer_phone: phone || checkout.customer_phone,
        paydunya_token: result.transaction_id,
        status: 'processing',
        updated_at: new Date(),
      }}
    );

    res.json({
      ok: true,
      status: 'processing',
      payment_url: result.payment_url,
      transaction_id: result.transaction_id,
      message: result.message || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Statut d'un checkout
app.get('/api/pstpay/checkout/:token', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const checkout = await db.collection('pstpay_checkouts').findOne(
      { token: req.params.token },
      { projection: { _id: 0, paydunya_token: 0 } }
    );
    if (!checkout) return res.status(404).json({ error: 'Checkout introuvable' });
    res.json(checkout);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── WEBHOOK IPN PayDunya ─────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.post('/api/pstpay/ipn', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const data = JSON.parse(req.body.toString());
    const token = data.custom_data?.token || data.token;
    const status = (data.status || '').toLowerCase();
    const paid = ['completed', 'success', 'paid'].includes(status);

    console.log('[PST Pay IPN] token=' + token + ' status=' + status);

    if (!token || !db) return res.json({ ok: true });

    const checkout = await db.collection('pstpay_checkouts').findOne({ token });
    if (!checkout) return res.json({ ok: true });

    if (paid && checkout.status !== 'paid') {
      // Calculer commission marchand
      const fees = checkout.fees || calcFees(checkout.amount, checkout.payment_method || 'wave');

      await db.collection('pstpay_checkouts').updateOne(
        { token },
        { $set: { status: 'paid', paid_at: new Date(), ipn_data: data } }
      );

      // Créditer le marchand (net après frais)
      await db.collection('pstpay_merchants').updateOne(
        { _id: checkout.merchant_id },
        { $inc: {
          balance_fcfa: fees.net,
          total_volume: checkout.amount,
          total_transactions: 1,
        }}
      );

      // Log
      await db.collection('audit_logs').insertOne({
        event: 'pstpay_paid',
        token,
        amount: checkout.amount,
        net: fees.net,
        method: checkout.payment_method,
        merchant_id: checkout.merchant_id,
        timestamp: new Date(),
      });

      // Notifier le marchand via webhook
      if (checkout.success_url) {
        fetch(checkout.success_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment.success',
            token,
            amount: checkout.amount,
            net: fees.net,
            method: checkout.payment_method,
            customer_phone: checkout.customer_phone,
            metadata: checkout.metadata,
          }),
        }).catch(e => console.error('[PST Pay webhook]', e.message));
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[PST Pay IPN]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── PAYOUT (envoi vers wallet) ───────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.post('/api/pstpay/payout', authMerchant, async (req, res) => {
  try {
    const { amount, method, phone, name } = req.body;
    if (!amount || !method || !phone) {
      return res.status(400).json({ error: 'amount, method, phone requis' });
    }
    if (amount < 200) return res.status(400).json({ error: 'Minimum 200 FCFA' });

    const merchant = req.merchant;
    const fees = calcFees(amount, method);
    const total_debit = amount + fees.payout_fee;

    if (merchant.balance_fcfa < total_debit) {
      return res.status(400).json({
        error: 'Solde insuffisant',
        balance: merchant.balance_fcfa,
        needed: total_debit,
      });
    }

    // Débiter le marchand
    await db.collection('pstpay_merchants').updateOne(
      { _id: merchant._id },
      { $inc: { balance_fcfa: -total_debit } }
    );

    const payout_id = 'PO-' + Date.now();
    const payout = {
      payout_id,
      merchant_id: merchant._id,
      amount,
      method,
      phone,
      name: name || 'Bénéficiaire',
      fee: fees.payout_fee,
      total_debit,
      status: 'processing',
      created_at: new Date(),
    };

    await db.collection('pstpay_payouts').insertOne(payout);

    // Effectuer le payout
    let result;
    if (PAYDUNYA_MASTER_KEY === 'PAYDUNYA_MASTER_KEY_ICI') {
      result = { success: true, message: 'Mode test - payout simulé' };
    } else {
      result = await payoutPayDunya(amount, method, phone, name);
    }

    await db.collection('pstpay_payouts').updateOne(
      { payout_id },
      { $set: { status: result.success ? 'sent' : 'failed', result } }
    );

    await db.collection('audit_logs').insertOne({
      event: 'pstpay_payout',
      payout_id, amount, method, phone,
      merchant_id: merchant._id,
      timestamp: new Date(),
    });

    res.json({
      ok: result.success,
      payout_id,
      amount,
      method,
      phone,
      fee: fees.payout_fee,
      status: result.success ? 'sent' : 'failed',
      message: result.message || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── DASHBOARD MARCHAND ──────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Stats du marchand
app.get('/api/pstpay/stats', authMerchant, async (req, res) => {
  try {
    const merchant_id = req.merchant._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [all, month_data, payouts] = await Promise.all([
      db.collection('pstpay_checkouts').find({ merchant_id, status: 'paid' }).toArray(),
      db.collection('pstpay_checkouts').find({
        merchant_id, status: 'paid',
        paid_at: { $gte: startOfMonth }
      }).toArray(),
      db.collection('pstpay_payouts').find({ merchant_id }).sort({ created_at: -1 }).limit(10).toArray(),
    ]);

    const total_volume   = all.reduce((s, c) => s + c.amount, 0);
    const total_net      = all.reduce((s, c) => s + (c.fees?.net || 0), 0);
    const month_volume   = month_data.reduce((s, c) => s + c.amount, 0);
    const month_count    = month_data.length;

    // Répartition par méthode
    const by_method = {};
    all.forEach(c => {
      const m = c.payment_method || 'unknown';
      by_method[m] = (by_method[m] || 0) + c.amount;
    });

    res.json({
      balance_fcfa: req.merchant.balance_fcfa,
      total_transactions: all.length,
      total_volume,
      total_net,
      month_volume,
      month_count,
      by_method,
      recent_payouts: payouts.map(p => ({
        payout_id: p.payout_id,
        amount: p.amount,
        method: p.method,
        phone: p.phone,
        status: p.status,
        created_at: p.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Transactions du marchand
app.get('/api/pstpay/transactions', authMerchant, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const filter = { merchant_id: req.merchant._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.method) filter.payment_method = req.query.method;

    const [transactions, total] = await Promise.all([
      db.collection('pstpay_checkouts')
        .find(filter, { projection: { ipn_data: 0, paydunya_token: 0 } })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('pstpay_checkouts').countDocuments(filter),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── PAGE CHECKOUT (interface client) ────────────────────────────
// ════════════════════════════════════════════════════════════════

app.get('/pay/:token', async (req, res) => {
  try {
    if (!db) return res.status(503).send('Service indisponible');
    const checkout = await db.collection('pstpay_checkouts').findOne({ token: req.params.token });
    if (!checkout) return res.status(404).send('Paiement introuvable');

    const expired = new Date() > checkout.expires_at;
    const methods = checkout.methods || ['wave', 'om', 'free'];

    const methodLabels = { wave: 'Wave', om: 'Orange Money', free: 'Free Money', visa: 'Carte Visa' };
    const methodColors = { wave: '#1D9BF0', om: '#FF6600', free: '#00A859', visa: '#1A1F71' };
    const methodIcons  = {
      wave: '<svg viewBox="0 0 40 40" width="22" fill="none"><path d="M8 14h4l4 10 4-10h4l4 10 4-10h4" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      om:   '<svg viewBox="0 0 40 40" width="22" fill="none"><circle cx="20" cy="20" r="10" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="white"/></svg>',
      free: '<svg viewBox="0 0 40 40" width="22" fill="none"><path d="M10 20h20M20 10v20" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>',
      visa: '<svg viewBox="0 0 40 40" width="22" fill="none"><rect x="4" y="10" width="32" height="20" rx="4" stroke="white" stroke-width="2"/><path d="M4 18h32" stroke="white" stroke-width="2"/></svg>',
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#070D1A">
<title>Paiement — PST Pay</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:#070D1A;color:#E2E8F0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px 16px 40px;}
.card{background:#0D1525;border:1px solid rgba(255,255,255,.06);border-radius:20px;width:100%;max-width:420px;overflow:hidden;}
.top{background:linear-gradient(135deg,#C8860C,#F5B014,#FCD34D);padding:28px 24px;text-align:center;}
.top-lbl{font-size:11px;font-weight:700;color:rgba(0,0,0,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
.top-amt{font-size:44px;font-weight:800;color:#000;line-height:1;}
.top-desc{font-size:13px;color:rgba(0,0,0,.5);margin-top:6px;}
.top-merch{font-size:12px;font-weight:700;color:rgba(0,0,0,.6);margin-top:4px;}
.body{padding:24px;}
.lbl{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;}
.methods{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;}
.method-btn{display:flex;align-items:center;gap:14px;padding:16px 18px;border:2px solid rgba(255,255,255,.06);border-radius:14px;cursor:pointer;background:#111D30;transition:all .15s;}
.method-btn:active{transform:scale(.97);}
.method-btn.on{border-color:#F5B014;background:rgba(245,176,20,.08);}
.method-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.method-name{font-size:15px;font-weight:700;}
.method-sub{font-size:11px;color:#475569;margin-top:2px;}
.inp{width:100%;background:#111D30;border:1.5px solid rgba(255,255,255,.08);border-radius:10px;padding:13px 16px;color:#E2E8F0;font-size:14px;font-family:inherit;outline:none;margin-bottom:16px;}
.inp:focus{border-color:#F5B014;}
.inp::placeholder{color:#475569;}
.btn{width:100%;padding:16px;background:linear-gradient(135deg,#F5B014,#FCD34D);color:#000;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn:active{opacity:.85;}
.sec{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:#475569;margin-top:14px;}
.sec svg{width:12px;height:12px;stroke:#475569;fill:none;stroke-width:2;}
.logo-row{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;padding-top:4px;}
.logo-box{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#F5B014,#FCD34D);display:flex;align-items:center;justify-content:center;}
.logo-txt{font-size:16px;font-weight:800;color:#fff;letter-spacing:1px;}
.expired{text-align:center;padding:40px 20px;color:#EF4444;}
.success-box{text-align:center;padding:40px 20px;}
.spin{display:inline-block;width:20px;height:20px;border:3px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.fee-info{background:#111D30;border-radius:8px;padding:10px 14px;font-size:12px;color:#475569;margin-bottom:16px;display:flex;justify-content:space-between;}
.fee-info span{color:#94A3B8;}
</style>
</head>
<body>
<div class="logo-row">
  <div class="logo-box"><svg viewBox="0 0 40 40" width="22" fill="none"><ellipse cx="20" cy="27" rx="12" ry="10" fill="rgba(0,0,0,0.8)"/><circle cx="29" cy="14" r="7" fill="rgba(0,0,0,0.8)"/><circle cx="31" cy="13" r="1.5" fill="white"/></svg></div>
  <div class="logo-txt">PST Pay</div>
</div>
<div class="card">
  <div class="top">
    <div class="top-lbl">Montant à payer</div>
    <div class="top-amt">${checkout.amount.toLocaleString('fr-FR')} <span style="font-size:20px">FCFA</span></div>
    <div class="top-desc">${checkout.description || 'Paiement'}</div>
    <div class="top-merch">via ${checkout.merchant_name || 'Marchand'}</div>
  </div>
  <div class="body">
    ${expired || checkout.status === 'paid' ? `
      <div class="${checkout.status === 'paid' ? 'success-box' : 'expired'}">
        ${checkout.status === 'paid'
          ? '<div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:20px;font-weight:700;color:#22C55E">Paiement confirmé !</div>'
          : '<div style="font-size:48px;margin-bottom:12px">⏱</div><div style="font-size:18px;font-weight:700">Lien expiré</div><div style="font-size:13px;color:#475569;margin-top:8px">Ce lien de paiement a expiré. Contactez le marchand.</div>'
        }
      </div>
    ` : `
      <div class="lbl">Choisissez votre moyen de paiement</div>
      <div class="methods">
        ${methods.map((m, i) => `
        <div class="method-btn${i === 0 ? ' on' : ''}" onclick="selMethod('${m}',this)" data-method="${m}">
          <div class="method-ico" style="background:${methodColors[m] || '#333'}">${methodIcons[m] || ''}</div>
          <div>
            <div class="method-name">${methodLabels[m] || m}</div>
            <div class="method-sub">Paiement instantané · Sécurisé</div>
          </div>
        </div>`).join('')}
      </div>
      <div class="lbl">Votre numéro de téléphone</div>
      <input class="inp" type="tel" id="phone-inp" placeholder="+221 77 XXX XX XX" inputmode="tel" value="${checkout.customer_phone || ''}">
      <div class="fee-info">
        <span>Frais inclus</span>
        <span>${(checkout.fees?.payin_fee || 0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <button class="btn" id="pay-btn" onclick="doPay()">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Payer maintenant
      </button>
      <div class="sec">
        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Paiement sécurisé · PST Pay by PST Telecom
      </div>
    `}
  </div>
</div>
<script>
var _method = '${methods[0]}';
function selMethod(m, el) {
  document.querySelectorAll('.method-btn').forEach(function(b){b.classList.remove('on');});
  el.classList.add('on');
  _method = m;
}
async function doPay() {
  var phone = document.getElementById('phone-inp').value.trim();
  if(!phone){alert('Entrez votre numéro de téléphone');return;}
  var btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Traitement...';
  try {
    var res = await fetch('/api/pstpay/checkout/${checkout.token}/pay', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({method: _method, phone: phone})
    });
    var data = await res.json();
    if(data.ok) {
      if(data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        btn.innerHTML = '✅ Paiement en cours...';
        setTimeout(function(){ checkStatus(); }, 2000);
      }
    } else {
      alert(data.error || 'Erreur de paiement');
      btn.disabled = false;
      btn.innerHTML = 'Payer maintenant';
    }
  } catch(e) {
    alert('Erreur: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = 'Payer maintenant';
  }
}
async function checkStatus() {
  try {
    var res = await fetch('/api/pstpay/checkout/${checkout.token}');
    var data = await res.json();
    if(data.status === 'paid') {
      document.querySelector('.body').innerHTML = '<div class="success-box"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:20px;font-weight:700;color:#22C55E">Paiement confirmé !</div><div style="font-size:13px;color:#475569;margin-top:8px">Merci pour votre paiement.</div></div>';
      ${checkout.success_url ? `setTimeout(function(){window.location.href='${checkout.success_url}';},3000);` : ''}
    } else {
      setTimeout(checkStatus, 5000);
    }
  } catch(e) { setTimeout(checkStatus, 5000); }
}
</script>
</body>
</html>`;

    res.send(html);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ════════════════════════════════════════════════════════════════
// ── ADMIN PST PAY ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.get('/api/pstpay/admin/overview', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const [merchants, checkouts, payouts] = await Promise.all([
      db.collection('pstpay_merchants').countDocuments(),
      db.collection('pstpay_checkouts').find({ status: 'paid' }).toArray(),
      db.collection('pstpay_payouts').countDocuments(),
    ]);

    const total_volume = checkouts.reduce((s, c) => s + c.amount, 0);
    const total_fees   = checkouts.reduce((s, c) => s + (c.fees?.payin_fee || 0), 0);

    res.json({ merchants, paid_transactions: checkouts.length, total_volume, total_fees, total_payouts: payouts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pstpay/admin/merchants', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('pstpay_merchants').find({}, { projection: { api_key: 0 } }).sort({ created_at: -1 }).toArray();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN PST PAY ──────────────────────────────────────────────────
"""

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ─── DÉMARRAGE'
if marker not in content:
    print("ERREUR: marqueur DÉMARRAGE non trouvé")
    exit(1)

# Vérifier qu'on n'injecte pas deux fois
if 'PST PAY' in content:
    print("ATTENTION: PST Pay déjà présent dans server-at.js")
    exit(0)

content = content.replace(marker, PSTPAY_CODE + '\n' + marker)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - PST Pay injecte dans server-at.js")
print(f"Taille fichier: {len(content)} caracteres")
print("\nRoutes ajoutees:")
print("  POST /api/pstpay/merchants/register")
print("  GET  /api/pstpay/merchants/me")
print("  POST /api/pstpay/checkout")
print("  POST /api/pstpay/checkout/:token/pay")
print("  GET  /api/pstpay/checkout/:token")
print("  POST /api/pstpay/ipn")
print("  POST /api/pstpay/payout")
print("  GET  /api/pstpay/stats")
print("  GET  /api/pstpay/transactions")
print("  GET  /pay/:token  (page checkout)")
print("  GET  /api/pstpay/admin/overview")
print("  GET  /api/pstpay/admin/merchants")
