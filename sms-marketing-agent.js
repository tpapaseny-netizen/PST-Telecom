
// ═══════════════════════════════════════════
// AGENT SMS MARKETING — CAMPAGNES AUTO
// ═══════════════════════════════════════════

const ADMIN_PHONE = process.env.ADMIN_PHONE || '+221771520959';

// Verifier et lancer une campagne automatiquement
async function lancerCampagneAuto(campagneId) {
  try {
    if (!db) return { success: false, error: 'DB non disponible' };
    
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(campagneId); } catch(e) { return { success: false, error: 'ID invalide' }; }
    
    const campagne = await db.collection('sms_campagnes').findOne({ _id: oid });
    if (!campagne) return { success: false, error: 'Campagne non trouvee' };
    if (campagne.statut === 'envoye') return { success: false, error: 'Deja envoyee' };
    
    // Marquer comme en cours
    await db.collection('sms_campagnes').updateOne(
      { _id: oid },
      { $set: { statut: 'en_cours', startedAt: new Date() } }
    );
    
    // Envoyer les SMS via Africa's Talking
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });
    
    const contacts = campagne.contacts || [];
    const message = campagne.message || '';
    const expediteur = campagne.expediteur || 'PST';
    
    let envoyes = 0;
    let echecs = 0;
    const batchSize = 50;
    
    // Envoyer par lots de 50
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      const numeros = batch.map(c => c.telephone || c).filter(Boolean);
      
      if (!numeros.length) continue;
      
      try {
        // Personnaliser le message pour chaque contact
        const msgs = batch.map(c => {
          let msg = message;
          if (typeof c === 'object') {
            msg = msg.replace(/{prenom}/g, c.prenom || '')
                     .replace(/{nom}/g, c.nom || '')
                     .replace(/{classe}/g, c.classe || '')
                     .replace(/{table}/g, c.table || '')
                     .replace(/{matricule}/g, c.matricule || '')
                     .replace(/{mention}/g, c.mention || '')
                     .replace(/{centre}/g, c.centre || '')
                     .replace(/{jury}/g, c.jury || '');
          }
          return { to: c.telephone || c, message: msg };
        });
        
        // Envoyer les SMS
        for (const m of msgs) {
          try {
            await AT.SMS.send({
              to: [m.to],
              message: m.message,
              from: expediteur
            });
            envoyes++;
          } catch(e) {
            echecs++;
          }
        }
        
        // Pause entre les lots
        await new Promise(r => setTimeout(r, 500));
        
      } catch(e) {
        echecs += numeros.length;
      }
    }
    
    // Marquer comme termine
    await db.collection('sms_campagnes').updateOne(
      { _id: oid },
      { $set: { statut: 'envoye', envoyes, echecs, finishedAt: new Date() } }
    );
    
    // Log activite
    await db.collection('activity_logs').insertOne({
      type: 'sms_campagne',
      message: `Campagne SMS terminee: ${envoyes} envoyes, ${echecs} echecs - ${campagne.nom || ''}`,
      createdAt: new Date()
    });
    
    // Alerter l'admin par SMS
    try {
      await AT.SMS.send({
        to: [ADMIN_PHONE],
        message: `PST SMS Marketing: Campagne "${campagne.nom || 'Sans nom'}" terminee. ${envoyes} SMS envoyes, ${echecs} echecs.`,
        from: process.env.AT_USERNAME
      });
    } catch(e) {}
    
    return { success: true, envoyes, echecs };
    
  } catch(e) {
    console.error('Agent SMS Marketing erreur:', e.message);
    return { success: false, error: e.message };
  }
}

// Sauvegarder une campagne en DB
async function sauvegarderCampagne(data) {
  try {
    if (!db) return null;
    const campagne = {
      nom: data.nom || 'Campagne PST',
      message: data.message,
      contacts: data.contacts || [],
      expediteur: data.expediteur || 'PST',
      pack: data.pack || 'starter',
      montant: data.montant || 0,
      reference: data.reference || '',
      statut: 'en_attente',
      createdAt: new Date()
    };
    const r = await db.collection('sms_campagnes').insertOne(campagne);
    campagne._id = r.insertedId;
    return campagne;
  } catch(e) {
    console.error('Sauvegarde campagne erreur:', e.message);
    return null;
  }
}

// Routes API Agent SMS Marketing
app.post('/api/sms-marketing/campagne/sauvegarder', async (req, res) => {
  try {
    const campagne = await sauvegarderCampagne(req.body);
    if (!campagne) return res.status(500).json({ error: 'Erreur sauvegarde' });
    res.json({ success: true, campagneId: campagne._id, campagne });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sms-marketing/campagne/lancer/:id', async (req, res) => {
  try {
    const result = await lancerCampagneAuto(req.params.id);
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/sms-marketing/campagnes', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const campagnes = await db.collection('sms_campagnes')
      .find({}, { projection: { contacts: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(campagnes);
  } catch(e) { res.json([]); }
});

app.get('/api/sms-marketing/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, envoyes: 0, en_attente: 0 });
    const campagnes = await db.collection('sms_campagnes').find({}).toArray();
    const total = campagnes.length;
    const envoyes = campagnes.filter(c => c.statut === 'envoye').length;
    const en_attente = campagnes.filter(c => c.statut === 'en_attente').length;
    const totalSMS = campagnes.reduce((s, c) => s + (c.envoyes || 0), 0);
    res.json({ total, envoyes, en_attente, totalSMS });
  } catch(e) { res.json({ total: 0, envoyes: 0, en_attente: 0, totalSMS: 0 }); }
});

app.delete('/api/sms-marketing/campagne/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('sms_campagnes').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

console.log('Agent SMS Marketing pret');

