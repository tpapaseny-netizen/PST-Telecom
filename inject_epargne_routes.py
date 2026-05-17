"""
inject_epargne_routes.py
Injecte les routes admin épargne dans server-at.js
"""

CODE = r"""
// ═══════════════════════════════════════════════════════════════
// ─── ZAMA ÉPARGNE — ROUTES ADMIN ────────────────────────────────
// ═══════════════════════════════════════════════════════════════

const ZAMA_FRAIS_RETRAIT   = 0.01;
const ZAMA_INTERET_MENSUEL = 0.02;
const ZAMA_ADMIN_EMAILS    = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];

function zamaSendMail(subject, htmlBody) {
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    ZAMA_ADMIN_EMAILS.forEach(email => {
      t.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html: htmlBody })
        .catch(e => console.error('[ZAMA Mail]', e.message));
    });
  } catch(e) { console.error('[ZAMA Mail]', e.message); }
}

// ── Soumettre un dépôt (utilisateur → en attente validation)
app.post('/api/zama/epargne/:id/depot-demande', async (req, res) => {
  try {
    const { montant_fcfa, wave_ref, methode, user_phone, user_name } = req.body;
    if (!montant_fcfa || montant_fcfa < 100) return res.status(400).json({ error: 'Montant minimum 100 FCFA' });
    if (!wave_ref || !wave_ref.trim()) return res.status(400).json({ error: 'Reference de transaction requise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.id });
    if (!ep) return res.status(404).json({ error: 'Epargne introuvable' });
    const depot_id = 'DEP-' + Date.now();
    const depot = {
      depot_id, epargne_id: req.params.id,
      description: ep.description,
      user_id: ep.user_id, user_name: user_name || ep.user_name || '',
      user_phone: user_phone || ep.user_phone || '',
      montant_fcfa: parseInt(montant_fcfa),
      wave_ref: wave_ref.trim(), methode: methode || 'wave',
      status: 'en_attente', created_at: new Date(),
    };
    await db.collection('zama_depots_pending').insertOne(depot);
    const base = 'https://pst-telecom-production.up.railway.app';
    const lv = base + '/api/zama/epargne/admin/valider-depot/' + depot_id + '?token=pst-admin-2026';
    const lr = base + '/api/zama/epargne/admin/rejeter-depot/' + depot_id + '?token=pst-admin-2026';
    zamaSendMail(
      'ZAMA Depot a valider: ' + parseInt(montant_fcfa).toLocaleString('fr-FR') + ' FCFA',
      '<h2>ZAMA - Depot a valider</h2><p>Plan: ' + ep.description + '</p><p>Montant: <strong>' + parseInt(montant_fcfa).toLocaleString('fr-FR') + ' FCFA</strong></p><p>Ref: <code>' + wave_ref + '</code></p><p>Tel: ' + (user_phone || '') + '</p><br><a href="' + lv + '" style="background:#22C55E;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-right:12px">VALIDER</a><a href="' + lr + '" style="background:#EF4444;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">REJETER</a>'
    );
    res.json({ ok: true, depot_id, status: 'en_attente', message: 'Depot soumis ! Validation admin sous 1h max.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Lister les dépôts en attente
app.get('/api/zama/epargne/admin/depots-pending', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const pending = await db.collection('zama_depots_pending')
      .find({ status: 'en_attente' }).sort({ created_at: -1 }).toArray();
    res.json({ pending, count: pending.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Valider un dépôt (GET pour clic depuis email)
app.get('/api/zama/epargne/admin/valider-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    const depot = await db.collection('zama_depots_pending').findOne({ depot_id: req.params.depot_id, status: 'en_attente' });
    if (!depot) return res.send('<h2>Depot introuvable ou deja traite</h2>');
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: depot.epargne_id });
    if (!ep) return res.send('<h2>Epargne introuvable</h2>');
    const nouveau_solde = ep.solde_fcfa + depot.montant_fcfa;
    const progression = Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100));
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: depot.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, progression, updated_at: new Date() }, $push: { transactions: { tx_id: depot.depot_id, type: 'depot', montant: depot.montant_fcfa, wave_ref: depot.wave_ref, note: 'Valide par admin', date: new Date() } } }
    );
    await db.collection('zama_depots_pending').updateOne({ depot_id: req.params.depot_id }, { $set: { status: 'valide', valide_at: new Date() } });
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px"><div style="font-size:48px">✅</div><h2 style="color:#22C55E">Depot valide!</h2><p>' + depot.montant_fcfa.toLocaleString('fr-FR') + ' FCFA credite sur ' + ep.description + '</p></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Rejeter un dépôt
app.get('/api/zama/epargne/admin/rejeter-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    await db.collection('zama_depots_pending').updateOne({ depot_id: req.params.depot_id }, { $set: { status: 'rejete', rejete_at: new Date() } });
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px"><div style="font-size:48px">❌</div><h2 style="color:#EF4444">Depot rejete</h2></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Retrait avec frais 1%
app.post('/api/zama/epargne/:id/retrait-v2', async (req, res) => {
  try {
    const { montant_fcfa, phone, password } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.id });
    if (!ep) return res.status(404).json({ error: 'Epargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Epargne cloturee' });
    if (ep.password && ep.password !== password) return res.status(403).json({ error: 'Mot de passe incorrect' });
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000*60*60*24));
      return res.status(400).json({ error: 'Epargne bloquee - ' + jours + ' jours restants', jours_restants: jours });
    }
    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant > ep.solde_fcfa) return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });
    const frais = Math.round(montant * ZAMA_FRAIS_RETRAIT);
    const net = montant - frais;
    const nouveau_solde = ep.solde_fcfa - montant;
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.id },
      { $set: { solde_fcfa: nouveau_solde, status: nouveau_solde === 0 ? 'clos' : 'actif', progression: Math.min(100, Math.round((nouveau_solde/ep.objectif_fcfa)*100)), updated_at: new Date() }, $push: { transactions: { tx_id: 'RET-'+Date.now(), type: 'retrait', montant, frais, net, phone: phone||ep.user_phone, date: new Date() } } }
    );
    zamaSendMail('ZAMA Retrait: ' + montant.toLocaleString('fr-FR') + ' FCFA', '<h2>Retrait epargne a traiter</h2><p>Plan: ' + ep.description + '</p><p>Montant: ' + montant.toLocaleString('fr-FR') + ' FCFA</p><p>Frais (1%): ' + frais.toLocaleString('fr-FR') + ' FCFA</p><p><strong>Net a virer: ' + net.toLocaleString('fr-FR') + ' FCFA</strong></p><p>Vers: ' + (phone||ep.user_phone) + '</p>');
    res.json({ ok: true, montant_retire: montant, frais, montant_net: net, nouveau_solde, message: 'Retrait de ' + montant.toLocaleString('fr-FR') + ' FCFA - Frais 1% (' + frais.toLocaleString('fr-FR') + ' FCFA) - Vous recevez ' + net.toLocaleString('fr-FR') + ' FCFA' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Appliquer intérêts 2%/mois
app.post('/api/zama/epargne/admin/appliquer-interets', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const epargnes = await db.collection('zama_epargnes').find({ status: 'actif', solde_fcfa: { $gt: 0 } }).toArray();
    let total = 0, nb = 0;
    for (const ep of epargnes) {
      const interet = Math.round(ep.solde_fcfa * ZAMA_INTERET_MENSUEL);
      if (interet <= 0) continue;
      await db.collection('zama_epargnes').updateOne(
        { epargne_id: ep.epargne_id },
        { $inc: { solde_fcfa: interet }, $push: { transactions: { tx_id: 'INT-'+Date.now(), type: 'interet', montant: interet, note: 'Interets 2%/mois', date: new Date() } }, $set: { updated_at: new Date() } }
      );
      total += interet; nb++;
    }
    res.json({ ok: true, nb_comptes: nb, total_interets_fcfa: total });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── FIN ROUTES ADMIN ÉPARGNE ─────────────────────────────────
"""

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ─── DÉMARRAGE'
if marker not in content:
    print("ERREUR: marqueur DÉMARRAGE non trouvé")
    exit(1)

if 'depots-pending' in content:
    print("Routes déjà présentes dans server-at.js")
    exit(0)

content = content.replace(marker, CODE + '\n' + marker)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - Routes admin épargne injectées!")
print("\nRoutes disponibles:")
print("  GET  /api/zama/epargne/admin/depots-pending?token=pst-admin-2026")
print("  GET  /api/zama/epargne/admin/valider-depot/:id?token=pst-admin-2026")
print("  GET  /api/zama/epargne/admin/rejeter-depot/:id?token=pst-admin-2026")
print("  POST /api/zama/epargne/:id/depot-demande")
print("  POST /api/zama/epargne/:id/retrait-v2")
print("  POST /api/zama/epargne/admin/appliquer-interets?token=pst-admin-2026")
