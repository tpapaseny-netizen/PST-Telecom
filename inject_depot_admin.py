"""
inject_depot_admin.py
Système de validation admin pour les dépôts épargne ZAMA
- Dépôt soumis → email envoyé aux 2 admins avec lien valider/rejeter
- Admin clique → dépôt crédité automatiquement
"""

CODE = r"""
// ═══════════════════════════════════════════════════════════════
// ─── ZAMA ÉPARGNE — DÉPÔTS + VALIDATION ADMIN ──────────────────
// ═══════════════════════════════════════════════════════════════

const ZAMA_ADMIN_EMAILS = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];
const ZAMA_FRAIS_RETRAIT  = 0.01;  // 1% sur chaque retrait
const ZAMA_INTERET_MENSUEL = 0.02; // 2% par mois

function sendAdminEmail(subject, html) {
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    ZAMA_ADMIN_EMAILS.forEach(email => {
      t.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html }).catch(e => {
        console.error('[ZAMA Email]', e.message);
      });
    });
  } catch(e) {
    console.error('[ZAMA Email]', e.message);
  }
}

// ── Soumettre un dépôt (utilisateur)
app.post('/api/zama/epargne/:epargne_id/depot-demande', async (req, res) => {
  try {
    const { montant_fcfa, wave_ref, methode, user_phone, user_name } = req.body;
    if (!montant_fcfa || montant_fcfa < 100) {
      return res.status(400).json({ error: 'Montant minimum 100 FCFA' });
    }
    if (!wave_ref || wave_ref.trim() === '') {
      return res.status(400).json({ error: 'Référence de transaction requise' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });

    const depot_id = 'DEP-' + Date.now();
    const depot = {
      depot_id,
      epargne_id: req.params.epargne_id,
      description: ep.description,
      user_id: ep.user_id,
      user_name: user_name || ep.user_name || '',
      user_phone: user_phone || ep.user_phone || '',
      montant_fcfa: parseInt(montant_fcfa),
      wave_ref: wave_ref.trim(),
      methode: methode || 'wave',
      status: 'en_attente',
      created_at: new Date(),
    };

    await db.collection('zama_depots_pending').insertOne(depot);

    // Envoyer email aux admins avec liens valider/rejeter
    const base = 'https://pst-telecom-production.up.railway.app';
    const lien_valider = base + '/api/zama/epargne/admin/valider-depot/' + depot_id + '?token=pst-admin-2026';
    const lien_rejeter = base + '/api/zama/epargne/admin/rejeter-depot/' + depot_id + '?token=pst-admin-2026';

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#FF6B00;padding:20px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:white;margin:0;font-size:24px">ZAMA</h1>
          <p style="color:rgba(255,255,255,.8);margin:4px 0 0">Nouveau dépôt à valider</p>
        </div>
        <div style="background:#0D1525;padding:24px;border-radius:0 0 8px 8px;color:#E2E8F0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#94A3B8">Plan épargne</td><td style="font-weight:bold">${ep.description}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Utilisateur</td><td>${depot.user_name || '--'} (${depot.user_phone})</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Montant</td><td style="font-size:20px;font-weight:bold;color:#F5B014">${parseInt(montant_fcfa).toLocaleString('fr-FR')} FCFA</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Méthode</td><td>${methode || 'Wave'}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Référence</td><td style="font-family:monospace;background:#1A2640;padding:4px 8px;border-radius:4px">${wave_ref}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">ID dépôt</td><td style="font-family:monospace;font-size:12px">${depot_id}</td></tr>
          </table>
          <div style="margin-top:24px;display:flex;gap:12px">
            <a href="${lien_valider}" style="display:inline-block;background:#22C55E;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
              ✅ VALIDER
            </a>
            <a href="${lien_rejeter}" style="display:inline-block;background:#EF4444;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin-left:12px">
              ❌ REJETER
            </a>
          </div>
          <p style="color:#475569;font-size:12px;margin-top:16px">
            Vérifiez la référence ${wave_ref} dans votre dashboard Wave Business avant de valider.
          </p>
        </div>
      </div>
    `;

    sendAdminEmail('ZAMA — Dépôt à valider: ' + parseInt(montant_fcfa).toLocaleString('fr-FR') + ' FCFA', emailHtml);

    res.json({
      ok: true,
      depot_id,
      status: 'en_attente',
      message: 'Dépôt soumis ! Les admins vont valider sous 24h.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Valider un dépôt (admin via lien email ou API)
app.get('/api/zama/epargne/admin/valider-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    if (!db) return res.status(503).send('DB indisponible');

    const depot = await db.collection('zama_depots_pending').findOne({
      depot_id: req.params.depot_id, status: 'en_attente'
    });
    if (!depot) return res.send('<h2>Dépôt introuvable ou déjà traité</h2>');

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: depot.epargne_id });
    if (!ep) return res.send('<h2>Épargne introuvable</h2>');

    const nouveau_solde = ep.solde_fcfa + depot.montant_fcfa;
    const progression = Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100));

    const tx = {
      tx_id: depot.depot_id,
      type: 'depot',
      montant: depot.montant_fcfa,
      wave_ref: depot.wave_ref,
      note: 'Validé par admin ZAMA',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: depot.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, progression, updated_at: new Date() }, $push: { transactions: tx } }
    );

    await db.collection('zama_depots_pending').updateOne(
      { depot_id: req.params.depot_id },
      { $set: { status: 'valide', valide_at: new Date() } }
    );

    // Notifier l'utilisateur par email si possible
    sendAdminEmail(
      'ZAMA — Dépôt validé: ' + depot.montant_fcfa.toLocaleString('fr-FR') + ' FCFA',
      '<h2>Dépôt validé</h2><p>' + depot.montant_fcfa.toLocaleString('fr-FR') + ' FCFA crédité sur ' + ep.description + '</p><p>Nouveau solde: ' + nouveau_solde.toLocaleString('fr-FR') + ' FCFA</p>'
    );

    res.send(`
      <html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(34,197,94,.3)">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#22C55E;margin:0 0 8px">Dépôt validé !</h2>
          <p style="color:#94A3B8">${depot.montant_fcfa.toLocaleString('fr-FR')} FCFA crédité</p>
          <p style="color:#94A3B8">Plan : ${ep.description}</p>
          <p style="color:#94A3B8">Nouveau solde : ${nouveau_solde.toLocaleString('fr-FR')} FCFA</p>
        </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ── Rejeter un dépôt (admin via lien email ou API)
app.get('/api/zama/epargne/admin/rejeter-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    if (!db) return res.status(503).send('DB indisponible');

    const depot = await db.collection('zama_depots_pending').findOne({
      depot_id: req.params.depot_id, status: 'en_attente'
    });
    if (!depot) return res.send('<h2>Dépôt introuvable ou déjà traité</h2>');

    await db.collection('zama_depots_pending').updateOne(
      { depot_id: req.params.depot_id },
      { $set: { status: 'rejete', rejete_at: new Date() } }
    );

    res.send(`
      <html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(239,68,68,.3)">
          <div style="font-size:48px;margin-bottom:16px">❌</div>
          <h2 style="color:#EF4444;margin:0 0 8px">Dépôt rejeté</h2>
          <p style="color:#94A3B8">Référence: ${depot.wave_ref}</p>
          <p style="color:#94A3B8">Montant: ${depot.montant_fcfa.toLocaleString('fr-FR')} FCFA</p>
        </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ── Liste dépôts en attente (admin dashboard)
app.get('/api/zama/epargne/admin/depots-pending', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const pending = await db.collection('zama_depots_pending').find({ status: 'en_attente' }).sort({ created_at: -1 }).toArray();
    res.json({ pending, count: pending.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Appliquer intérêts 2%/mois (admin)
app.post('/api/zama/epargne/admin/appliquer-interets', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const epargnes = await db.collection('zama_epargnes').find({ status: 'actif', solde_fcfa: { $gt: 0 } }).toArray();
    let total = 0, nb = 0;
    for (const ep of epargnes) {
      const interet = Math.round(ep.solde_fcfa * ZAMA_INTERET_MENSUEL);
      if (interet <= 0) continue;
      await db.collection('zama_epargnes').updateOne(
        { epargne_id: ep.epargne_id },
        { $inc: { solde_fcfa: interet }, $push: { transactions: { tx_id: 'INT-' + Date.now(), type: 'interet', montant: interet, note: 'Intérêts 2%/mois', date: new Date() } }, $set: { updated_at: new Date() } }
      );
      total += interet; nb++;
    }
    res.json({ ok: true, nb_comptes: nb, total_interets_fcfa: total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Retrait avec frais 1%
app.post('/api/zama/epargne/:epargne_id/retrait-v2', async (req, res) => {
  try {
    const { montant_fcfa, phone, password } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne clôturée' });
    if (ep.password && ep.password !== password) return res.status(403).json({ error: 'Mot de passe incorrect' });
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ error: 'Epargne bloquee ' + jours + ' jours restants', jours_restants: jours });
    }
    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant > ep.solde_fcfa) return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });
    const frais = Math.round(montant * ZAMA_FRAIS_RETRAIT);
    const net = montant - frais;
    const nouveau_solde = ep.solde_fcfa - montant;
    const tx = { tx_id: 'RET-' + Date.now(), type: 'retrait', montant, frais, net, phone: phone || ep.user_phone, date: new Date() };
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, status: nouveau_solde === 0 ? 'clos' : 'actif', progression: Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100)), updated_at: new Date() }, $push: { transactions: tx } }
    );
    // Notifier admin
    sendAdminEmail(
      'ZAMA — Retrait: ' + montant.toLocaleString('fr-FR') + ' FCFA',
      '<h2>Retrait épargne</h2><p>Plan: ' + ep.description + '</p><p>Montant: ' + montant.toLocaleString('fr-FR') + ' FCFA</p><p>Frais: ' + frais.toLocaleString('fr-FR') + ' FCFA</p><p>Net à virer: ' + net.toLocaleString('fr-FR') + ' FCFA</p><p>Vers: ' + (phone || ep.user_phone) + '</p>'
    );
    await db.collection('audit_logs').insertOne({ event: 'zama_retrait', epargne_id: req.params.epargne_id, montant, frais, net, phone: phone || ep.user_phone, timestamp: new Date() });
    res.json({ ok: true, montant_retire: montant, frais, montant_net: net, nouveau_solde, message: 'Retrait de ' + montant.toLocaleString('fr-FR') + ' FCFA — Frais 1% (' + frais.toLocaleString('fr-FR') + ' FCFA) — Vous recevez ' + net.toLocaleString('fr-FR') + ' FCFA' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN ZAMA ÉPARGNE ADMIN ────────────────────────────────────
"""

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ─── DÉMARRAGE'
if marker not in content:
    print("ERREUR: marqueur DÉMARRAGE non trouvé")
    exit(1)

if 'depot-demande' in content:
    print("Routes dépôt déjà présentes")
    exit(0)

content = content.replace(marker, CODE + '\n' + marker)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - Système validation admin injecté")
print("\nRoutes:")
print("  POST /api/zama/epargne/:id/depot-demande      → email aux 2 admins")
print("  GET  /api/zama/epargne/admin/valider-depot/:id → lien dans email")
print("  GET  /api/zama/epargne/admin/rejeter-depot/:id → lien dans email")
print("  GET  /api/zama/epargne/admin/depots-pending   → liste admin")
print("  POST /api/zama/epargne/admin/appliquer-interets → 2%/mois")
print("  POST /api/zama/epargne/:id/retrait-v2         → 1% frais")
