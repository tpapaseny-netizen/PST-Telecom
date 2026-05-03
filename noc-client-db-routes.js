
// ═══════════════════════════════════════════
// ROUTES NOC CLIENTS DB
// ═══════════════════════════════════════════

app.post('/api/noc/clients/creer', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { nom, telephone, email, forfait, code } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'nom et telephone requis' });
    
    const client = {
      nom, telephone, email: email || '',
      forfait: forfait || 'noc-starter',
      code: code || 'NOC-' + Date.now().toString(36).toUpperCase().slice(-6),
      statut: 'actif',
      createdAt: new Date()
    };
    
    const r = await db.collection('noc_clients').insertOne(client);
    client._id = r.insertedId;
    
    await db.collection('activity_logs').insertOne({
      type: 'noc_client',
      message: 'Nouveau client NOC: ' + nom + ' (' + client.code + ')',
      createdAt: new Date()
    });
    
    res.json({ success: true, code: client.code, client });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/noc/clients/liste', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const clients = await db.collection('noc_clients')
      .find({}).sort({ createdAt: -1 }).toArray();
    res.json(clients);
  } catch(e) { res.json([]); }
});

app.get('/api/noc/cameras/client/:code', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const code = req.params.code;
    const client = await db.collection('noc_clients').findOne({ code });
    if (!client) return res.status(401).json({ error: 'Code invalide' });
    const cameras = await db.collection('noc_cameras')
      .find({ $or: [{ client: client.nom }, { clientCode: code }] })
      .sort({ createdAt: -1 }).toArray();
    res.json(cameras);
  } catch(e) { res.json([]); }
});

app.delete('/api/noc/clients/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('noc_clients').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

