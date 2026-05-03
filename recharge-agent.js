
// ═══════════════════════════════════════════
// AGENT RECHARGE — RECHARGES AUTO 24H/24
// ═══════════════════════════════════════════

const ADMIN_PHONE = process.env.ADMIN_PHONE || '+221771520959';

// Traiter une recharge automatiquement
async function traiterRecharge(data) {
  try {
    const { telephone, montant, operateur, clientNom, reference } = data;
    
    if (!telephone || !montant) {
      return { success: false, error: 'telephone et montant requis' };
    }

    // Sauvegarder en DB
    let rechargeId = null;
    if (db) {
      const r = await db.collection('recharges').insertOne({
        telephone,
        montant: Number(montant),
        operateur: operateur || detecterOperateur(telephone),
        clientNom: clientNom || 'Client PST',
        reference: reference || '',
        statut: 'en_cours',
        createdAt: new Date()
      });
      rechargeId = r.insertedId;
    }

    // Envoyer la recharge via Africa's Talking
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });

    try {
      const result = await AT.AIRTIME.send({
        recipients: [{
          phoneNumber: telephone.startsWith('+') ? telephone : '+221' + telephone,
          amount: `XOF ${montant}`,
          currencyCode: 'XOF'
        }]
      });

      const statut = result.responses && result.responses[0].status === 'Sent' ? 'reussi' : 'echec';
      
      // Mettre a jour le statut
      if (db && rechargeId) {
        await db.collection('recharges').updateOne(
          { _id: rechargeId },
          { $set: { statut, finishedAt: new Date(), atResponse: result } }
        );
      }

      // Log activite
      if (db) {
        await db.collection('activity_logs').insertOne({
          type: 'recharge',
          message: `Recharge ${statut}: ${montant} FCFA vers ${telephone} (${operateur || detecterOperateur(telephone)})`,
          createdAt: new Date()
        });
      }

      // Alerter admin si echec
      if (statut === 'echec') {
        try {
          await AT.SMS.send({
            to: [ADMIN_PHONE],
            message: `PST ALERTE: Recharge echouee - ${montant}F vers ${telephone}. Verifiez le wallet AT.`,
            from: process.env.AT_USERNAME
          });
        } catch(e) {}
      }

      return { success: statut === 'reussi', statut, rechargeId };

    } catch(e) {
      // AT error - update DB
      if (db && rechargeId) {
        await db.collection('recharges').updateOne(
          { _id: rechargeId },
          { $set: { statut: 'echec', error: e.message, finishedAt: new Date() } }
        );
      }
      
      // Mode sandbox - simuler succes
      if (process.env.AT_USERNAME === 'sandbox') {
        if (db && rechargeId) {
          await db.collection('recharges').updateOne(
            { _id: rechargeId },
            { $set: { statut: 'simule', finishedAt: new Date() } }
          );
        }
        return { success: true, statut: 'simule', message: 'Mode sandbox - recharge simulee' };
      }
      
      return { success: false, error: e.message };
    }

  } catch(e) {
    console.error('Agent Recharge erreur:', e.message);
    return { success: false, error: e.message };
  }
}

function detecterOperateur(telephone) {
  const num = telephone.replace(/\D/g, '').slice(-9);
  const prefix = num.substring(0, 2);
  if (['77','78','71'].includes(prefix)) return 'Orange';
  if (['76'].includes(prefix)) return 'Free';
  if (['70'].includes(prefix)) return 'Expresso';
  return 'Inconnu';
}

// Stats recharges
async function getRechargeStats() {
  try {
    if (!db) return { total: 0, reussies: 0, echecs: 0, volume: 0 };
    const recharges = await db.collection('recharges').find({}).toArray();
    const total = recharges.length;
    const reussies = recharges.filter(r => r.statut === 'reussi' || r.statut === 'simule').length;
    const echecs = recharges.filter(r => r.statut === 'echec').length;
    const volume = recharges.reduce((s, r) => s + (Number(r.montant) || 0), 0);
    return { total, reussies, echecs, volume };
  } catch(e) {
    return { total: 0, reussies: 0, echecs: 0, volume: 0 };
  }
}

// API Routes Agent Recharge
app.post('/api/recharge/traiter', async (req, res) => {
  try {
    const result = await traiterRecharge(req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recharge/stats', async (req, res) => {
  try {
    const stats = await getRechargeStats();
    res.json(stats);
  } catch(e) { res.json({ total: 0, reussies: 0, echecs: 0, volume: 0 }); }
});

app.get('/api/recharge/historique', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const recharges = await db.collection('recharges')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(recharges);
  } catch(e) { res.json([]); }
});

console.log('Agent Recharge pret');

