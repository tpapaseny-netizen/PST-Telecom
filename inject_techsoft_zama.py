import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

INJECTION = '''
// ════════════════════════════════════════════════
// TECHSOFT SMS — Envoi SMS via API HTTP
// ════════════════════════════════════════════════
const TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || '1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823';
const TECHSOFT_URL   = 'https://app.techsoft-sms.com/api/http/';

async function envoyerSMSTechsoft(telephone, message, senderId) {
  const sid = senderId || 'ZAMA';
  const tel = telephone.toString().replace(/\\s/g, '');
  const num = tel.startsWith('+') ? tel : (tel.startsWith('00') ? '+' + tel.slice(2) : '+221' + tel);
  const params = new URLSearchParams({
    token:     TECHSOFT_TOKEN,
    to:        num,
    from:      sid,
    message:   message,
    type:      'plain',
  });
  const resp = await fetch(TECHSOFT_URL + '?' + params.toString());
  const text = await resp.text();
  console.log('[Techsoft SMS] ' + num + ' -> ' + text);
  return text;
}

// ════════════════════════════════════════════════
// ZAMA OTP STORE (memoire)
// ════════════════════════════════════════════════
const zamaOtpStore = {};

// ════════════════════════════════════════════════
// ZAMA ROUTES
// ════════════════════════════════════════════════

// POST /api/zama/send-otp
app.post('/api/zama/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Telephone manquant' });
    const tel = phone.toString().replace(/\\s/g, '');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    zamaOtpStore[tel] = { code, expires: Date.now() + 10 * 60 * 1000 };
    let smsSent = false;
    try {
      await envoyerSMSTechsoft(tel, 'Votre code ZAMA : ' + code + '. Valable 10 min.', 'ZAMA');
      smsSent = true;
    } catch (e) {
      console.log('[ZAMA OTP] SMS error:', e.message);
    }
    res.json({ success: true, smsSent, code: smsSent ? undefined : code, message: smsSent ? 'OTP envoye par SMS' : 'OTP genere (SMS indisponible)' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/zama/verify-otp
app.post('/api/zama/verify-otp', (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.json({ success: false, error: 'Donnees manquantes' });
    let tel = phone.toString().replace(/\\s/g, '');
    if (tel.startsWith('+221')) tel = tel;
    else if (tel.startsWith('00221')) tel = '+' + tel.slice(2);
    else if (tel.length === 9) tel = '+221' + tel;
    const entry = zamaOtpStore[tel] || zamaOtpStore[phone.toString().replace(/\\s/g, '')];
    if (!entry) return res.json({ success: false, error: 'OTP introuvable, redemandez un code' });
    if (Date.now() > entry.expires) {
      delete zamaOtpStore[tel];
      return res.json({ success: false, error: 'OTP expire, redemandez un code' });
    }
    if (entry.code !== code.toString()) return res.json({ success: false, error: 'Code incorrect' });
    delete zamaOtpStore[tel];
    res.json({ success: true, message: 'Connexion ZAMA reussie', phone: tel });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/zama/create — creer une transaction izichangePay
app.post('/api/zama/create', async (req, res) => {
  try {
    const { amount, coin, phone } = req.body;
    if (!amount || !coin) return res.json({ success: false, error: 'Montant et crypto requis' });
    const orderId = 'ZAMA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const memo = 'ZAMA-' + orderId;
    const posUrl = 'https://app.izichangepay.com/pos?merchant=' + (process.env.IZIPAY_API_KEY || '14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680') + '&amount=' + amount + '&coin=' + coin + '&memo=' + memo;
    res.json({ success: true, orderId, posUrl, memo, amount, coin });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/zama/get-address
app.get('/api/zama/get-address', (req, res) => {
  const { coin } = req.query;
  const posUrl = 'https://app.izichangepay.com/pos?merchant=' + (process.env.IZIPAY_API_KEY || '14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680');
  res.json({ success: true, coin: coin || 'USDT', posUrl });
});

// POST /api/zama/contact
app.post('/api/zama/contact', (req, res) => {
  const { name, phone, email, message } = req.body;
  console.log('[ZAMA Contact]', { name, phone, email, message });
  res.json({ success: true, message: 'Message recu, nous vous repondrons bientot.' });
});

// FIN ZAMA ROUTES
'''

ANCHOR = '// FIN SEN-SMS AUTH ROUTES'

if ANCHOR in content:
    content = content.replace(ANCHOR, ANCHOR + '\n' + INJECTION)
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - Techsoft + ZAMA routes injectees avant le bloc Demarrage')
else:
    print('ERREUR - Ancre introuvable: ' + ANCHOR)
    print('Anchres disponibles:')
    for line in content.split('\n'):
        if '//' in line and ('FIN' in line or 'DÉMARRAGE' in line or 'Démarrage' in line):
            print('  ' + line.strip())
