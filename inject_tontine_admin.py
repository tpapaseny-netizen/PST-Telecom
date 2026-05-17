# inject_tontine_admin.py
# Injecte les routes admin tontine dans server-at.js
# Meme modele que l'epargne : cotisations pending, distributions pending, tous les comptes tontine

import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

ROUTES = r"""
// ══════════════════════════════════════════════════════════════════
// ZAMA TONTINE — ADMIN : Cotisations + Distributions + Vue comptes
// ══════════════════════════════════════════════════════════════════

// ── Soumettre une cotisation (en attente validation admin) ─────────
app.post('/api/zama/tontine/:tontine_id/cotiser-demande', async (req, res) => {
  try {
    const { phone, methode, reference } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    const membre = ton.membres && ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Non membre de cette tontine' });

    const cotisation_id = 'COTIS-' + Date.now();
    const cotisation = {
      cotisation_id,
      tontine_id: req.params.tontine_id,
      tontine_nom: ton.nom,
      phone,
      montant_fcfa: ton.cotisation_fcfa,
      methode: methode || 'Wave',
      reference: reference || '',
      statut: 'en_attente',
      created_at: new Date()
    };
    await db.collection('zama_cotisations').insertOne(cotisation);

    // Email aux admins
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      const base = 'https://pst-telecom-production.up.railway.app';
      const lv = base + '/api/zama/tontine/admin/valider-cotisation/' + cotisation_id + '?token=pst-admin-2026';
      const lr = base + '/api/zama/tontine/admin/rejeter-cotisation/' + cotisation_id + '?token=pst-admin-2026';
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
        subject: 'ZAMA Tontine — Cotisation a valider (' + ton.cotisation_fcfa + ' FCFA)',
        html: '<h2 style="color:#F5B014">ZAMA — Nouvelle cotisation tontine</h2>' +
          '<p><b>Tontine:</b> ' + ton.nom + '</p>' +
          '<p><b>Membre:</b> ' + phone + '</p>' +
          '<p><b>Montant:</b> ' + ton.cotisation_fcfa + ' FCFA</p>' +
          '<p><b>Methode:</b> ' + (methode || 'Wave') + '</p>' +
          '<p><b>Reference:</b> ' + (reference || 'non fournie') + '</p>' +
          '<p><b>Verifiez la reference dans votre dashboard ' + (methode || 'Wave') + ' avant de valider.</b></p>' +
          '<br><a href="' + lv + '" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px">VALIDER</a>' +
          '<a href="' + lr + '" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">REJETER</a>'
      });
    } catch(e) { console.log('[ZAMA EMAIL ERR]', e.message); }

    // SMS sandbox
    await zamaSendSMS(phone, 'ZAMA Tontine: Votre cotisation de ' + ton.cotisation_fcfa + ' FCFA pour "' + ton.nom + '" est en attente de validation (sous 1h max).');

    res.json({ ok: true, cotisation_id, message: 'Cotisation soumise — validation admin sous 1h max' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: cotisations en attente ───────────────────────────────────
app.get('/api/zama/tontine/admin/cotisations-pending', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const list = await db.collection('zama_cotisations').find({ statut: 'en_attente' }).sort({ created_at: -1 }).toArray();
    res.json({ cotisations: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider une cotisation ────────────────────────────────────
app.get('/api/zama/tontine/admin/valider-cotisation/:cotisation_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const cotis = await db.collection('zama_cotisations').findOne({ cotisation_id: req.params.cotisation_id });
    if (!cotis) return res.status(404).json({ error: 'Cotisation introuvable' });
    if (cotis.statut !== 'en_attente') return res.status(400).json({ error: 'Deja traitee' });

    // Marquer le membre comme ayant cotise dans la tontine
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: cotis.tontine_id });
    if (ton) {
      // Enregistrer paiement du membre
      await db.collection('zama_tontines').updateOne(
        { tontine_id: cotis.tontine_id, 'membres.phone': cotis.phone },
        { $set: { 'membres.$.a_paye': true, 'membres.$.paye_at': new Date() } }
      );
      // Ajouter au journal des cotisations
      await db.collection('zama_tontines').updateOne(
        { tontine_id: cotis.tontine_id },
        { $push: { cotisations_journal: { phone: cotis.phone, montant: cotis.montant_fcfa, date: new Date(), cotisation_id: cotis.cotisation_id } } }
      );
      // Verifier si tous ont paye -> distribution automatique
      const tonFresh = await db.collection('zama_tontines').findOne({ tontine_id: cotis.tontine_id });
      const membres_actifs = (tonFresh.membres || []).filter(m => m.statut === 'actif');
      const tous_payes = membres_actifs.every(m => m.a_paye);
      if (tous_payes && tonFresh.beneficiaire_actuel) {
        // Creer une distribution en attente
        const dist_id = 'DIST-' + Date.now();
        await db.collection('zama_distributions').insertOne({
          distribution_id: dist_id,
          tontine_id: cotis.tontine_id,
          tontine_nom: tonFresh.nom,
          beneficiaire_phone: tonFresh.beneficiaire_actuel,
          montant_brut: tonFresh.cotisation_fcfa * membres_actifs.length,
          frais_pct: 1,
          montant_frais: Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.01),
          montant_net: Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99),
          statut: 'en_attente',
          created_at: new Date()
        });
        // Email admins pour distribution
        try {
          const nodemailer = require('nodemailer');
          const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
          const base = 'https://pst-telecom-production.up.railway.app';
          const lv = base + '/api/zama/tontine/admin/valider-distribution/' + dist_id + '?token=pst-admin-2026';
          const lr = base + '/api/zama/tontine/admin/rejeter-distribution/' + dist_id + '?token=pst-admin-2026';
          await t.sendMail({
            from: process.env.GMAIL_USER,
            to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
            subject: 'ZAMA Tontine — Distribution a effectuer ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99) + ' FCFA',
            html: '<h2 style="color:#F5B014">ZAMA — Distribution tontine prete</h2>' +
              '<p>Tous les membres ont cotise pour <b>' + tonFresh.nom + '</b></p>' +
              '<p><b>Beneficiaire:</b> ' + tonFresh.beneficiaire_actuel + '</p>' +
              '<p><b>Montant brut:</b> ' + (tonFresh.cotisation_fcfa * membres_actifs.length) + ' FCFA</p>' +
              '<p><b>Frais ZAMA (1%):</b> ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.01) + ' FCFA</p>' +
              '<p><b>A virer au beneficiaire:</b> ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99) + ' FCFA</p>' +
              '<p>Virez via Wave/OM puis cliquez VALIDER.</p>' +
              '<br><a href="' + lv + '" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px">DISTRIBUTION EFFECTUEE</a>' +
              '<a href="' + lr + '" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">ANNULER</a>'
          });
        } catch(e2) {}
      }
    }

    await db.collection('zama_cotisations').updateOne(
      { cotisation_id: req.params.cotisation_id },
      { $set: { statut: 'valide', valide_at: new Date() } }
    );

    await zamaSendSMS(cotis.phone, 'ZAMA Tontine: Votre cotisation de ' + cotis.montant_fcfa + ' FCFA pour "' + cotis.tontine_nom + '" a ete validee. Merci!');

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#22c55e">Cotisation validee!</h2><p>' + cotis.phone + ' — ' + cotis.montant_fcfa + ' FCFA</p><p>SMS envoye au membre.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: rejeter une cotisation ────────────────────────────────────
app.get('/api/zama/tontine/admin/rejeter-cotisation/:cotisation_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const cotis = await db.collection('zama_cotisations').findOne({ cotisation_id: req.params.cotisation_id });
    if (!cotis) return res.status(404).json({ error: 'Cotisation introuvable' });
    await db.collection('zama_cotisations').updateOne(
      { cotisation_id: req.params.cotisation_id },
      { $set: { statut: 'rejete', rejete_at: new Date() } }
    );
    await zamaSendSMS(cotis.phone, 'ZAMA Tontine: Votre cotisation de ' + cotis.montant_fcfa + ' FCFA a ete rejetee. Reference invalide. Contactez le support ZAMA.');
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#ef4444">Cotisation rejetee</h2><p>SMS envoye au membre.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: distributions en attente ─────────────────────────────────
app.get('/api/zama/tontine/admin/distributions-pending', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const list = await db.collection('zama_distributions').find({ statut: 'en_attente' }).sort({ created_at: -1 }).toArray();
    res.json({ distributions: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider une distribution ─────────────────────────────────
app.get('/api/zama/tontine/admin/valider-distribution/:distribution_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const dist = await db.collection('zama_distributions').findOne({ distribution_id: req.params.distribution_id });
    if (!dist) return res.status(404).json({ error: 'Distribution introuvable' });
    if (dist.statut !== 'en_attente') return res.status(400).json({ error: 'Deja traitee' });

    await db.collection('zama_distributions').updateOne(
      { distribution_id: req.params.distribution_id },
      { $set: { statut: 'distribue', distribue_at: new Date() } }
    );

    // Reset a_paye de tous les membres + passer au tour suivant
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: dist.tontine_id });
    if (ton) {
      const membres = ton.membres || [];
      const membres_reset = membres.map(m => ({ ...m, a_paye: false }));
      const tour_actuel = (ton.tour_actuel || 0) + 1;
      const membres_actifs = membres.filter(m => m.statut === 'actif');
      const terminee = tour_actuel >= membres_actifs.length;
      const prochain_ben = terminee ? null : membres_actifs[tour_actuel % membres_actifs.length]?.phone;
      await db.collection('zama_tontines').updateOne(
        { tontine_id: dist.tontine_id },
        { $set: { membres: membres_reset, tour_actuel, beneficiaire_actuel: prochain_ben, status: terminee ? 'termine' : 'actif' } }
      );
    }

    // SMS beneficiaire
    await zamaSendSMS(dist.beneficiaire_phone, 'ZAMA Tontine "' + dist.tontine_nom + '": Votre pot de ' + dist.montant_net + ' FCFA a ete vire sur votre compte Wave/OM. Felicitations!');

    // SMS tous les membres
    if (ton) {
      for (const m of (ton.membres || [])) {
        if (m.phone !== dist.beneficiaire_phone) {
          await zamaSendSMS(m.phone, 'ZAMA Tontine "' + dist.tontine_nom + '": Le pot de ' + dist.montant_net + ' FCFA a ete distribue a ' + dist.beneficiaire_phone + '. Prochain tour en cours.');
        }
      }
    }

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#22c55e">Distribution validee!</h2><p>' + dist.montant_net + ' FCFA -> ' + dist.beneficiaire_phone + '</p><p>SMS envoye a tous les membres.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: rejeter une distribution ─────────────────────────────────
app.get('/api/zama/tontine/admin/rejeter-distribution/:distribution_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    await db.collection('zama_distributions').updateOne(
      { distribution_id: req.params.distribution_id },
      { $set: { statut: 'annule', annule_at: new Date() } }
    );
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#ef4444">Distribution annulee</h2></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: tous les comptes tontine ──────────────────────────────────
app.get('/api/zama/tontine/admin/tous-comptes', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const tontines = await db.collection('zama_tontines').find({}).sort({ created_at: -1 }).toArray();
    const distributions = await db.collection('zama_distributions').find({ statut: 'distribue' }).toArray();
    const total_distribue = distributions.reduce((s, d) => s + (d.montant_net || 0), 0);
    const total_frais = distributions.reduce((s, d) => s + (d.montant_frais || 0), 0);
    const nb_actives = tontines.filter(t => t.status === 'actif').length;
    res.json({
      tontines,
      stats: {
        nb_tontines: tontines.length,
        nb_actives,
        total_distribue,
        total_frais,
        nb_distributions: distributions.length
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

"""

TARGET = '// \u2500\u2500\u2500 D\u00c9MARRAGE'

if TARGET not in content:
    print('ERREUR: bloc DEMARRAGE non trouve')
    exit(1)

if '/api/zama/tontine/admin/cotisations-pending' in content:
    print('INFO: routes tontine admin deja presentes - mise a jour...')
    # Supprimer l'ancien bloc
    old_start = '// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\r\n// ZAMA TONTINE'
    if old_start in content:
        idx_start = content.index(old_start)
        idx_end = content.index(TARGET)
        content = content[:idx_start] + content[idx_end:]

content = content.replace(TARGET, ROUTES + TARGET)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('OK - Routes tontine admin injectees dans server-at.js')
print('Nouvelles routes:')
print('  POST /api/zama/tontine/:id/cotiser-demande')
print('  GET  /api/zama/tontine/admin/cotisations-pending')
print('  GET  /api/zama/tontine/admin/valider-cotisation/:id')
print('  GET  /api/zama/tontine/admin/rejeter-cotisation/:id')
print('  GET  /api/zama/tontine/admin/distributions-pending')
print('  GET  /api/zama/tontine/admin/valider-distribution/:id')
print('  GET  /api/zama/tontine/admin/rejeter-distribution/:id')
print('  GET  /api/zama/tontine/admin/tous-comptes')
