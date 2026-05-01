
// ═══════════════════════════════════════════════════════════════
// ROUTES PST NOC CENTER
// ═══════════════════════════════════════════════════════════════

// Page NOC
app.get('/noc', authAdmin, (req, res) => {
  res.sendFile(require('path').join(__dirname, 'noc.html'));
});

// Toutes les caméras du NOC (tous clients confondus)
app.get('/api/noc/cameras', async (req, res) => {
  try {
    if (!db) return res.json({ cameras: [] });
    const cameras = await db.collection('noc_cameras').find({}).sort({ client: 1, name: 1 }).toArray();
    res.json({ cameras });
  } catch(e) { res.json({ cameras: [] }); }
});

// Ajouter caméra au NOC
app.post('/api/noc/cameras', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    await db.collection('noc_cameras').insertOne({ ...req.body, createdAt: new Date() });
    await db.collection('activity_logs').insertOne({ type: 'noc', message: `Caméra NOC ajoutée: ${req.body.name} — ${req.body.client}`, createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Supprimer caméra du NOC
app.delete('/api/noc/cameras/:id', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    await db.collection('noc_cameras').deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Stats NOC globales
app.get('/api/noc/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, online: 0, offline: 0, clients: 0 });
    const cameras = await db.collection('noc_cameras').find({}).toArray();
    const clients = [...new Set(cameras.map(c => c.client))].length;
    res.json({ total: cameras.length, online: cameras.filter(c=>c.online).length, offline: cameras.filter(c=>!c.online).length, clients });
  } catch(e) { res.json({ total: 0, online: 0, offline: 0, clients: 0 }); }
});

