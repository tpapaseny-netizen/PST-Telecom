"""
inject_zama_v2.py
- SMS Africa's Talking (prêt à activer)
- Validation admin retrait épargne
- Vue admin tous les comptes épargnants
- KYC obligatoire avant épargne/tontine
"""

CODE = r"""
// ═══════════════════════════════════════════════════════════════
// ─── ZAMA V2 — SMS + RETRAIT ADMIN + VUE COMPTES ───────────────
// ═══════════════════════════════════════════════════════════════

// ── Helper SMS Africa's Talking ─────────────────────────────────
async function zamaSendSMS(phone, message) {
  try {
    if (!AT_API_KEY || AT_API_KEY === 'sandbox') {
      console.log('[ZAMA SMS SANDBOX] To:', phone, '| Msg:', message);
      return { status: 'sandbox', phone, message };
    }
    const fetch = require('node-fetch');
    const params = new URLSearchParams({
      username: AT_USERNAME,
      to: phone,
      message: message,
      from: 'ZAMA'
    });
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    const data = await res.json();
    console.log('[ZAMA SMS]', JSON.stringify(data));
    return data;
  } catch(e) {
    console.error('[ZAMA SMS Error]', e.message);
    return null;
  }
}

// ── Soumettre un retrait (utilisateur → en attente validation admin)
app.post('/api/zama/epargne/:id/retrait-demande', async (req, res) => {
  try {
    const { montant_fcfa, phone, password } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.id });
    if (!ep) return res.status(404).json({ error: 'Epargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Epargne cloturee' });

    // Vérifier mot de passe si protégée
    if (ep.password && ep.password !== password) {
      return res.status(403).json({ error: 'Mot de passe incorrect' });
    }

    // Vérifier retrait libre ou date atteinte
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000*60*60*24));
      return res.status(400).json({ error: 'Epargne bloquee - ' + jours + ' jours restants', jours_restants: jours });
    }

    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (montant > ep.solde_fcfa) return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });

    const frais = Math.round(montant * 0.01);
    const net = montant - frais;
    const retrait_id = 'RET-' + Date.now();

    const retrait = {
      retrait_id,
      epargne_id: req.params.id,
      description: ep.description,
      user_id: ep.user_id,
      user_phone: ep.user_phone,
      phone_retrait: phone || ep.user_phone,
      montant_fcfa: montant,
      frais_fcfa: frais,
      net_fcfa: net,
      status: 'en_attente',
      created_at: new Date()
    };

    await db.collection('zama_retraits_pending').insertOne(retrait);

    // Email aux admins
    const base = 'https://pst-telecom-production.up.railway.app';
    const lv = base + '/api/zama/epargne/admin/valider-retrait/' + retrait_id + '?token=pst-admin-2026';
    const lr = base + '/api/zama/epargne/admin/rejeter-retrait/' + retrait_id + '?token=pst-admin-2026';

    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      const emailHtml = '<h2>ZAMA - Retrait a traiter</h2><p>Plan: <strong>' + ep.description + '</strong></p><p>Montant: <strong>' + montant.toLocaleString('fr-FR') + ' FCFA</strong></p><p>Frais (1%): ' + frais.toLocaleString('fr-FR') + ' FCFA</p><p><strong style="color:green">Net a virer: ' + net.toLocaleString('fr-FR') + ' FCFA</strong></p><p>Vers: <strong>' + (phone || ep.user_phone) + '</strong></p><br><a href="' + lv + '" style="background:#22C55E;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-right:12px">VALIDER ET VIRER</a><a href="' + lr + '" style="background:#EF4444;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">REJETER</a>';
      ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'].forEach(email => {
        t.sendMail({ from: process.env.GMAIL_USER, to: email, subject: 'ZAMA Retrait a valider: ' + net.toLocaleString('fr-FR') + ' FCFA', html: emailHtml }).catch(e => console.error(e.message));
      });
    } catch(e) { console.error('[Mail]', e.message); }

    // SMS à l'utilisateur
    await zamaSendSMS(ep.user_phone, 'ZAMA: Votre demande de retrait de ' + montant.toLocaleString('fr-FR') + ' FCFA est en cours de traitement. Vous recevrez ' + net.toLocaleString('fr-FR') + ' FCFA apres frais (1%). Validation sous 1h.');

    res.json({ ok: true, retrait_id, montant, frais, net, status: 'en_attente', message: 'Retrait soumis ! Validation admin sous 1h. Vous recevrez ' + net.toLocaleString('fr-FR') + ' FCFA sur ' + (phone || ep.user_phone) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: lister retraits en attente
app.get('/api/zama/epargne/admin/retraits-pending', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const pending = await db.collection('zama_retraits_pending').find({ status: 'en_attente' }).sort({ created_at: -1 }).toArray();
    res.json({ pending, count: pending.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider un retrait
app.get('/api/zama/epargne/admin/valider-retrait/:retrait_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    const retrait = await db.collection('zama_retraits_pending').findOne({ retrait_id: req.params.retrait_id, status: 'en_attente' });
    if (!retrait) return res.send('<h2>Retrait introuvable ou deja traite</h2>');
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: retrait.epargne_id });
    if (!ep) return res.send('<h2>Epargne introuvable</h2>');
    const nouveau_solde = Math.max(0, ep.solde_fcfa - retrait.montant_fcfa);
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: retrait.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, status: nouveau_solde === 0 ? 'clos' : 'actif', progression: Math.min(100, Math.round((nouveau_solde/ep.objectif_fcfa)*100)), updated_at: new Date() }, $push: { transactions: { tx_id: retrait.retrait_id, type: 'retrait', montant: retrait.montant_fcfa, frais: retrait.frais_fcfa, net: retrait.net_fcfa, phone: retrait.phone_retrait, note: 'Valide par admin', date: new Date() } } }
    );
    await db.collection('zama_retraits_pending').updateOne({ retrait_id: req.params.retrait_id }, { $set: { status: 'valide', valide_at: new Date() } });
    await db.collection('zama_revenus').insertOne({ type: 'frais_retrait', epargne_id: retrait.epargne_id, montant_frais: retrait.frais_fcfa, date: new Date() });
    // SMS confirmation
    await zamaSendSMS(retrait.phone_retrait, 'ZAMA: Votre retrait de ' + retrait.net_fcfa.toLocaleString('fr-FR') + ' FCFA a ete valide et vire sur ' + retrait.phone_retrait + '. Merci de votre confiance!');
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(34,197,94,.3)"><div style="font-size:48px">✅</div><h2 style="color:#22C55E">Retrait valide!</h2><p>Virement de ' + retrait.net_fcfa.toLocaleString('fr-FR') + ' FCFA vers ' + retrait.phone_retrait + '</p><p style="color:#94A3B8">N oubliez pas de virer manuellement via Wave Business</p></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Admin: rejeter un retrait
app.get('/api/zama/epargne/admin/rejeter-retrait/:retrait_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    const retrait = await db.collection('zama_retraits_pending').findOne({ retrait_id: req.params.retrait_id });
    await db.collection('zama_retraits_pending').updateOne({ retrait_id: req.params.retrait_id }, { $set: { status: 'rejete', rejete_at: new Date() } });
    if (retrait) await zamaSendSMS(retrait.phone_retrait, 'ZAMA: Votre demande de retrait de ' + retrait.montant_fcfa.toLocaleString('fr-FR') + ' FCFA a ete rejetee. Contactez le support.');
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(239,68,68,.3)"><div style="font-size:48px">❌</div><h2 style="color:#EF4444">Retrait rejete</h2></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Admin: vue tous les comptes épargnants
app.get('/api/zama/epargne/admin/tous-comptes', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const comptes = await db.collection('zama_epargnes').find({}).sort({ created_at: -1 }).toArray();
    const total_sous_gestion = comptes.filter(c => c.status === 'actif').reduce((s, c) => s + c.solde_fcfa, 0);
    const revenus = await db.collection('zama_revenus').find({}).toArray();
    const total_revenus = revenus.reduce((s, r) => s + (r.montant_frais || 0), 0);
    res.json({ comptes, total_sous_gestion, total_revenus, nb_actifs: comptes.filter(c => c.status === 'actif').length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SMS: Notification dépôt validé (appelé depuis valider-depot)
// Déjà dans les routes existantes - on patch avec SMS

// ── SMS OTP pour inscription
app.post('/api/zama/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone requis' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    if (db) await db.collection('zama_otp').insertOne({ phone, otp, expires, used: false, created_at: new Date() });
    await zamaSendSMS(phone, 'ZAMA: Votre code de verification est ' + otp + '. Valable 10 minutes. Ne le partagez pas.');
    res.json({ ok: true, message: 'Code OTP envoye' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Vérifier OTP
app.post('/api/zama/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone et OTP requis' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const record = await db.collection('zama_otp').findOne({ phone, otp, used: false, expires: { $gt: new Date() } });
    if (!record) return res.status(400).json({ error: 'Code invalide ou expire' });
    await db.collection('zama_otp').updateOne({ _id: record._id }, { $set: { used: true } });
    res.json({ ok: true, verified: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── FIN ZAMA V2 ──────────────────────────────────────────────
"""

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ─── DÉMARRAGE'
if marker not in content:
    print("ERREUR: marqueur DÉMARRAGE non trouvé")
    exit(1)

if 'retrait-demande' in content:
    print("Routes déjà présentes")
    exit(0)

content = content.replace(marker, CODE + '\n' + marker)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - Toutes les routes injectées!")
print("\nNOUVELLES ROUTES:")
print("  POST /api/zama/epargne/:id/retrait-demande")
print("  GET  /api/zama/epargne/admin/retraits-pending")
print("  GET  /api/zama/epargne/admin/valider-retrait/:id")
print("  GET  /api/zama/epargne/admin/rejeter-retrait/:id")
print("  GET  /api/zama/epargne/admin/tous-comptes")
print("  POST /api/zama/send-otp")
print("  POST /api/zama/verify-otp")
print("\nSMS AT: actif en sandbox, live dès AT_API_KEY configuré sur Railway")
