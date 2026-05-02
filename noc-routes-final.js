

// ═══════════════════════════════════════════════════════
// ROUTES NOC CENTER - PROPRES ET DEFINITIVES
// ═══════════════════════════════════════════════════════

// GET toutes les caméras NOC depuis MongoDB
app.get('/api/noc/cameras', async (req, res) => {
  try {
    const cams = db ? await db.collection('noc_cameras').find({}).sort({createdAt:-1}).toArray() : [];
    res.json(cams);
  } catch(e) { res.json([]); }
});

// GET liste clients NOC (noms distincts depuis les caméras)
app.get('/api/noc/clients', async (req, res) => {
  try {
    const cams = db ? await db.collection('noc_cameras').find({},{projection:{client:1}}).toArray() : [];
    const names = [...new Set(cams.map(c=>c.client).filter(Boolean))];
    res.json(names.map(n=>({name:n})));
  } catch(e) { res.json([]); }
});

// POST ajouter une caméra
app.post('/api/noc/cameras', async (req, res) => {
  try {
    const { client, name, url, type, location, zone, status } = req.body;
    if (!client || !name || !url) return res.status(400).json({ error: 'client, name et url requis' });
    const cam = { client, name, url, type: type||'embed', location: location||'', zone: zone||'', status: status||'online', createdAt: new Date() };
    if (db) {
      const r = await db.collection('noc_cameras').insertOne(cam);
      cam._id = r.insertedId;
    } else { cam._id = Date.now().toString(); }
    res.json({ success: true, camera: cam });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT modifier une caméra
app.put('/api/noc/cameras/:id', async (req, res) => {
  try {
    const { client, name, url, type, location, zone, status } = req.body;
    const update = { client, name, url, type: type||'embed', location: location||'', zone: zone||'', status: status||'online', updatedAt: new Date() };
    if (db) {
      const { ObjectId } = require('mongodb');
      let oid;
      try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({error:'ID invalide'}); }
      await db.collection('noc_cameras').updateOne({ _id: oid }, { $set: update });
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE supprimer une caméra DEFINITIVEMENT
app.delete('/api/noc/cameras/:id', async (req, res) => {
  try {
    if (db) {
      const { ObjectId } = require('mongodb');
      let oid;
      try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({error:'ID invalide'}); }
      const r = await db.collection('noc_cameras').deleteOne({ _id: oid });
      if (r.deletedCount === 0) return res.status(404).json({ error: 'Camera non trouvee' });
    }
    res.json({ success: true, deleted: req.params.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

