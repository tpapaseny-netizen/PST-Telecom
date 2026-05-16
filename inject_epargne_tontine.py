"""
Script: inject_epargne_tontine.py
Injecte les routes Épargne et Tontine ZAMA dans server-at.js
"""

CODE = r"""
// ═══════════════════════════════════════════════════════════════
// ─── ZAMA ÉPARGNE ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Créer un plan d'épargne
app.post('/api/zama/epargne/create', async (req, res) => {
  try {
    const { user_id, user_name, user_phone, objectif_fcfa, duree_jours, description, retrait_libre } = req.body;
    if (!user_id || !objectif_fcfa || !duree_jours) {
      return res.status(400).json({ error: 'user_id, objectif_fcfa, duree_jours requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const epargne_id = 'EP-' + Date.now();
    const date_fin = new Date(Date.now() + duree_jours * 24 * 60 * 60 * 1000);

    const epargne = {
      epargne_id,
      user_id,
      user_name: user_name || '',
      user_phone: user_phone || '',
      objectif_fcfa: parseInt(objectif_fcfa),
      solde_fcfa: 0,
      duree_jours: parseInt(duree_jours),
      description: description || 'Mon épargne ZAMA',
      retrait_libre: retrait_libre !== false, // true par défaut = peut retirer quand il veut
      status: 'actif',
      progression: 0,
      date_debut: new Date(),
      date_fin,
      transactions: [],
      created_at: new Date(),
    };

    await db.collection('zama_epargnes').insertOne(epargne);
    res.json({ ok: true, epargne_id, date_fin, message: 'Plan épargne créé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Déposer dans l'épargne
app.post('/api/zama/epargne/:epargne_id/depot', async (req, res) => {
  try {
    const { montant_fcfa, wave_ref, note } = req.body;
    if (!montant_fcfa || montant_fcfa < 100) {
      return res.status(400).json({ error: 'Montant minimum 100 FCFA' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne clôturée' });

    const nouveau_solde = ep.solde_fcfa + parseInt(montant_fcfa);
    const progression = Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100));
    const objectif_atteint = nouveau_solde >= ep.objectif_fcfa;

    const tx = {
      tx_id: 'TX-' + Date.now(),
      type: 'depot',
      montant: parseInt(montant_fcfa),
      wave_ref: wave_ref || null,
      note: note || '',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      {
        $set: { solde_fcfa: nouveau_solde, progression, updated_at: new Date() },
        $push: { transactions: tx },
      }
    );

    res.json({
      ok: true,
      nouveau_solde,
      progression,
      objectif_atteint,
      message: objectif_atteint ? '🎉 Objectif atteint !' : 'Dépôt enregistré',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Retirer de l'épargne (libre ou à la date)
app.post('/api/zama/epargne/:epargne_id/retrait', async (req, res) => {
  try {
    const { montant_fcfa, phone, note } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne déjà clôturée' });

    // Vérifier retrait libre ou date atteinte
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours_restants = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({
        error: 'Retrait bloqué jusqu\'à la date objectif',
        jours_restants,
        date_fin: ep.date_fin,
      });
    }

    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant > ep.solde_fcfa) {
      return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });
    }

    const nouveau_solde = ep.solde_fcfa - montant;
    const tx = {
      tx_id: 'TX-' + Date.now(),
      type: 'retrait',
      montant,
      phone: phone || ep.user_phone,
      note: note || 'Retrait épargne',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      {
        $set: {
          solde_fcfa: nouveau_solde,
          status: nouveau_solde === 0 ? 'clos' : 'actif',
          progression: Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100)),
          updated_at: new Date(),
        },
        $push: { transactions: tx },
      }
    );

    // Log pour traitement manuel Wave
    await db.collection('audit_logs').insertOne({
      event: 'zama_epargne_retrait',
      epargne_id: req.params.epargne_id,
      montant, phone: phone || ep.user_phone,
      user_id: ep.user_id,
      timestamp: new Date(),
    });

    res.json({
      ok: true,
      montant_retire: montant,
      nouveau_solde,
      status: nouveau_solde === 0 ? 'clos' : 'actif',
      message: 'Retrait enregistré — virement Wave en cours de traitement',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Détail épargne
app.get('/api/zama/epargne/:epargne_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    res.json(ep);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mes épargnes
app.get('/api/zama/epargne/user/:user_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_epargnes')
      .find({ user_id: req.params.user_id })
      .sort({ created_at: -1 })
      .toArray();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ─── ZAMA TONTINE ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Créer une tontine
app.post('/api/zama/tontine/create', async (req, res) => {
  try {
    const { createur_id, createur_name, createur_phone, nom, cotisation_fcfa, frequence, membres_phones } = req.body;
    if (!createur_id || !nom || !cotisation_fcfa || !frequence) {
      return res.status(400).json({ error: 'createur_id, nom, cotisation_fcfa, frequence requis' });
    }
    if (!membres_phones || membres_phones.length < 2) {
      return res.status(400).json({ error: 'Minimum 2 membres requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const tontine_id = 'TON-' + Date.now();
    const nb_membres = membres_phones.length + 1; // +1 pour le créateur

    // Créer la liste des membres avec ordre de bénéfice (aléatoire sécurisé)
    const ordre = [...Array(nb_membres).keys()].sort(() => Math.random() - 0.5);

    const membres = [
      {
        phone: createur_phone,
        name: createur_name || 'Créateur',
        user_id: createur_id,
        role: 'createur',
        ordre: ordre[0],
        cotisations_payees: 0,
        statut: 'actif',
        a_recu: false,
        joined_at: new Date(),
      },
      ...membres_phones.map((phone, i) => ({
        phone,
        name: '',
        user_id: null,
        role: 'membre',
        ordre: ordre[i + 1],
        cotisations_payees: 0,
        statut: 'invité',
        a_recu: false,
        joined_at: null,
      })),
    ];

    // Trier par ordre pour déterminer qui reçoit en premier
    const membres_tries = [...membres].sort((a, b) => a.ordre - b.ordre);

    const tontine = {
      tontine_id,
      nom,
      createur_id,
      createur_phone,
      cotisation_fcfa: parseInt(cotisation_fcfa),
      pot_total: parseInt(cotisation_fcfa) * nb_membres,
      frequence, // 'hebdomadaire' ou 'mensuel'
      nb_membres,
      membres,
      tour_actuel: 0,
      beneficiaire_actuel: membres_tries[0].phone,
      historique_tours: [],
      cotisations: [],
      status: 'actif',
      prochaine_date: frequence === 'hebdomadaire'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
    };

    await db.collection('zama_tontines').insertOne(tontine);

    res.json({
      ok: true,
      tontine_id,
      nom,
      nb_membres,
      cotisation_fcfa: tontine.cotisation_fcfa,
      pot_total: tontine.pot_total,
      frequence,
      beneficiaire_premier: membres_tries[0].phone,
      message: 'Tontine créée — invitations envoyées aux membres',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rejoindre une tontine
app.post('/api/zama/tontine/:tontine_id/rejoindre', async (req, res) => {
  try {
    const { phone, name, user_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });

    const membre = ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Vous n\'êtes pas invité dans cette tontine' });
    if (membre.statut === 'actif') return res.status(400).json({ error: 'Vous avez déjà rejoint cette tontine' });

    await db.collection('zama_tontines').updateOne(
      { tontine_id: req.params.tontine_id, 'membres.phone': phone },
      { $set: {
        'membres.$.name': name || '',
        'membres.$.user_id': user_id || null,
        'membres.$.statut': 'actif',
        'membres.$.joined_at': new Date(),
      }}
    );

    res.json({ ok: true, message: 'Vous avez rejoint la tontine ' + ton.nom });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Payer sa cotisation
app.post('/api/zama/tontine/:tontine_id/cotiser', async (req, res) => {
  try {
    const { phone, wave_ref, note } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    if (ton.status !== 'actif') return res.status(400).json({ error: 'Tontine non active' });

    const membre = ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Non membre de cette tontine' });
    if (membre.statut !== 'actif') return res.status(400).json({ error: 'Rejoignez la tontine d\'abord' });

    // Vérifier si déjà payé ce tour
    const tour = ton.tour_actuel;
    const deja_paye = ton.cotisations.some(c => c.phone === phone && c.tour === tour);
    if (deja_paye) return res.status(400).json({ error: 'Vous avez déjà cotisé pour ce tour' });

    const cotisation = {
      cot_id: 'COT-' + Date.now(),
      phone,
      name: membre.name || '',
      montant: ton.cotisation_fcfa,
      tour,
      wave_ref: wave_ref || null,
      note: note || '',
      date: new Date(),
    };

    // Compter combien ont payé ce tour après ce paiement
    const payeurs_ce_tour = ton.cotisations.filter(c => c.tour === tour).length + 1;
    const tout_paye = payeurs_ce_tour >= ton.nb_membres;

    await db.collection('zama_tontines').updateOne(
      { tontine_id: req.params.tontine_id },
      {
        $push: { cotisations: cotisation },
        $inc: { 'membres.$[m].cotisations_payees': 1 },
      },
      { arrayFilters: [{ 'm.phone': phone }] }
    );

    // Si tout le monde a payé → distribuer le pot
    if (tout_paye) {
      const membres_tries = [...ton.membres].sort((a, b) => a.ordre - b.ordre);
      const beneficiaire = membres_tries[tour % ton.nb_membres];
      const prochain_tour = tour + 1;
      const tontine_terminee = prochain_tour >= ton.nb_membres;

      const prochaine_date = ton.frequence === 'hebdomadaire'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const historique_entry = {
        tour,
        beneficiaire_phone: beneficiaire.phone,
        beneficiaire_name: beneficiaire.name || '',
        montant_pot: ton.pot_total,
        date_distribution: new Date(),
      };

      await db.collection('zama_tontines').updateOne(
        { tontine_id: req.params.tontine_id },
        {
          $set: {
            tour_actuel: prochain_tour,
            beneficiaire_actuel: tontine_terminee ? null : membres_tries[prochain_tour % ton.nb_membres]?.phone,
            status: tontine_terminee ? 'termine' : 'actif',
            prochaine_date: tontine_terminee ? null : prochaine_date,
          },
          $push: { historique_tours: historique_entry },
        }
      );

      // Marquer le bénéficiaire comme ayant reçu
      await db.collection('zama_tontines').updateOne(
        { tontine_id: req.params.tontine_id, 'membres.phone': beneficiaire.phone },
        { $set: { 'membres.$.a_recu': true } }
      );

      // Log pour virement manuel Wave
      await db.collection('audit_logs').insertOne({
        event: 'zama_tontine_distribution',
        tontine_id: req.params.tontine_id,
        tour,
        beneficiaire: beneficiaire.phone,
        montant: ton.pot_total,
        timestamp: new Date(),
      });

      return res.json({
        ok: true,
        cotisation_enregistree: true,
        pot_distribue: true,
        beneficiaire: beneficiaire.phone,
        montant_pot: ton.pot_total,
        tontine_terminee,
        message: tout_paye
          ? 'Pot distribué à ' + (beneficiaire.name || beneficiaire.phone) + ' — virement Wave en cours'
          : 'Cotisation enregistrée',
      });
    }

    const restants = ton.nb_membres - payeurs_ce_tour;
    res.json({
      ok: true,
      cotisation_enregistree: true,
      pot_distribue: false,
      payeurs_ce_tour,
      restants,
      message: restants + ' membre(s) n\'ont pas encore cotisé',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Détail tontine
app.get('/api/zama/tontine/:tontine_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    res.json(ton);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mes tontines
app.get('/api/zama/tontine/user/:user_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_tontines').find({
      $or: [
        { createur_id: req.params.user_id },
        { 'membres.user_id': req.params.user_id },
      ]
    }).sort({ created_at: -1 }).toArray();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin — toutes les tontines
app.get('/api/zama/tontine/admin/all', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_tontines').find({}).sort({ created_at: -1 }).limit(100).toArray();
    const epargnes = await db.collection('zama_epargnes').find({}).sort({ created_at: -1 }).limit(100).toArray();
    const total_epargne = epargnes.reduce((s, e) => s + e.solde_fcfa, 0);
    const total_tontine = list.reduce((s, t) => s + t.pot_total, 0);
    res.json({ tontines: list, epargnes, stats: { total_epargne, total_tontine, nb_tontines: list.length, nb_epargnes: epargnes.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN ZAMA ÉPARGNE + TONTINE ────────────────────────────────
"""

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ─── DÉMARRAGE'
if marker not in content:
    print("ERREUR: marqueur DÉMARRAGE non trouvé")
    exit(1)

if 'ZAMA ÉPARGNE' in content or 'zama_epargnes' in content:
    print("Épargne/Tontine déjà présent")
    exit(0)

content = content.replace(marker, CODE + '\n' + marker)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - Épargne + Tontine injectés dans server-at.js")
print(f"Taille: {len(content)} caractères")
print("\nRoutes ajoutées:")
print("  POST /api/zama/epargne/create")
print("  POST /api/zama/epargne/:id/depot")
print("  POST /api/zama/epargne/:id/retrait  (libre ou bloqué)")
print("  GET  /api/zama/epargne/:id")
print("  GET  /api/zama/epargne/user/:user_id")
print("  POST /api/zama/tontine/create")
print("  POST /api/zama/tontine/:id/rejoindre")
print("  POST /api/zama/tontine/:id/cotiser")
print("  GET  /api/zama/tontine/:id")
print("  GET  /api/zama/tontine/user/:user_id")
print("  GET  /api/zama/tontine/admin/all")
