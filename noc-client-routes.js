
// ═══════════════════════════════════════════
// ROUTES NOC CLIENT — ESPACE PERSONNALISE
// ═══════════════════════════════════════════

// GET cameras d'un client specifique par son code abonne
app.get('/api/noc/cameras/client/:code', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const code = req.params.code;
    
    // Verifier que le code abonne existe
    const abonne = await db.collection('abonnes').findOne({ 
      $or: [
        { code: code },
        { codeClient: code },
        { token: code }
      ]
    });
    
    if (!abonne) return res.status(401).json({ error: 'Code invalide' });
    
    // Recuperer les cameras de ce client uniquement
    const clientName = abonne.nom || abonne.name || abonne.entreprise || '';
    const cameras = await db.collection('noc_cameras').find({
      $or: [
        { client: clientName },
        { clientCode: code },
        { clientId: abonne._id.toString() }
      ]
    }).sort({ createdAt: -1 }).toArray();
    
    res.json(cameras);
  } catch(e) { 
    console.error('NOC client cameras error:', e.message);
    res.json([]); 
  }
});

// Generer un lien NOC pour un client
app.get('/api/noc/lien/:clientCode', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { clientCode } = req.params;
    
    const abonne = await db.collection('abonnes').findOne({
      $or: [{ code: clientCode }, { codeClient: clientCode }]
    });
    
    if (!abonne) return res.status(404).json({ error: 'Client non trouve' });
    
    const lien = `https://pst-telecom-production.up.railway.app/noc?token=${clientCode}`;
    res.json({ 
      success: true, 
      lien,
      client: abonne.nom || abonne.name,
      code: clientCode
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Assigner une camera a un client specifique
app.put('/api/noc/cameras/:id/assigner', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    
    const { clientCode, clientName } = req.body;
    await db.collection('noc_cameras').updateOne(
      { _id: oid },
      { $set: { clientCode, client: clientName, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

