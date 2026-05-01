// À ajouter dans server-at.js juste avant // ─── DÉMARRAGE

// ═══════════════════════════════════════════════════════════════
// ROUTES PST SECURCAM
// ═══════════════════════════════════════════════════════════════

// Pages SecurCam
app.get('/securcam', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'securcam.html'));
});
app.get('/securcam-admin', authAdmin, (req, res) => {
  res.sendFile(require('path').join(__dirname, 'securcam-admin.html'));
});

// Login client SecurCam
app.post('/api/securcam/login', async (req, res) => {
  try {
    const { code, password } = req.body;
    if (!code || !password) return res.status(400).json({ error: 'Code et mot de passe requis' });
    if (!db) return res.status(503).json({ error: 'DB non disponible' });
    const client = await db.collection('securcam_clients').findOne({ code: code.toUpperCase().trim(), password });
    if (!client) return res.status(401).json({ success: false, error: 'Code ou mot de passe incorrect' });
    const cameras = await db.collection('securcam_cameras').find({ clientCode: client.code }).toArray();
    res.json({ success: true, client: { code: client.code, name: client.name, plan: client.plan }, cameras });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Liste clients SecurCam (admin)
app.get('/api/securcam/clients', async (req, res) => {
  try {
    if (!db) return res.json({ clients: [] });
    const clients = await db.collection('securcam_clients').find({}).toArray();
    const result = await Promise.all(clients.map(async c => {
      const cameras = await db.collection('securcam_cameras').find({ clientCode: c.code }).toArray();
      return { ...c, cameras };
    }));
    res.json({ clients: result });
  } catch(e) { res.json({ clients: [] }); }
});

// Créer client SecurCam (admin)
app.post('/api/securcam/clients', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    const client = { ...req.body, createdAt: new Date() };
    await db.collection('securcam_clients').insertOne(client);
    await db.collection('activity_logs').insertOne({ type: 'securcam', message: `Nouveau client SecurCam: ${client.name}`, createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Supprimer client SecurCam
app.delete('/api/securcam/clients/:code', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    await db.collection('securcam_clients').deleteOne({ code: req.params.code });
    await db.collection('securcam_cameras').deleteMany({ clientCode: req.params.code });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ajouter caméra
app.post('/api/securcam/cameras', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    const { clientCode, camera } = req.body;
    await db.collection('securcam_cameras').insertOne({ ...camera, clientCode, createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Supprimer caméra
app.delete('/api/securcam/cameras/:id', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    await db.collection('securcam_cameras').deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Demandes de devis SecurCam
app.post('/api/securcam/devis', async (req, res) => {
  try {
    if (db) await db.collection('securcam_devis').insertOne({ ...req.body, createdAt: new Date(), status: 'pending' });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/securcam/devis', async (req, res) => {
  try {
    if (!db) return res.json({ devis: [] });
    const devis = await db.collection('securcam_devis').find({}).sort({ createdAt: -1 }).toArray();
    res.json({ devis });
  } catch(e) { res.json({ devis: [] }); }
});

// Envoyer accès par SMS
app.post('/api/securcam/send-credentials', async (req, res) => {
  try {
    const { clientCode, telephone } = req.body;
    if (!db) return res.json({ success: true });
    const client = await db.collection('securcam_clients').findOne({ code: clientCode });
    if (!client) return res.status(404).json({ error: 'Client non trouvé' });
    const msg = `PST SecurCam — Vos accès:\nCode: ${client.code}\nMot de passe: ${client.password}\nPortail: pst-telecom-production.up.railway.app/securcam\nSupport: +221 77 152 09 59`;
    const at = getAT();
    if (at) await at.SMS.send({ to: [telephone], message: msg, from: 'PST-Telecom' });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Alertes SecurCam
app.post('/api/securcam/alert', async (req, res) => {
  try {
    if (db) await db.collection('securcam_alerts').insertOne({ ...req.body, createdAt: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/securcam/alerts', async (req, res) => {
  try {
    if (!db) return res.json({ alerts: [] });
    const { clientCode } = req.query;
    const query = clientCode ? { clientCode } : {};
    const alerts = await db.collection('securcam_alerts').find(query).sort({ createdAt: -1 }).limit(100).toArray();
    res.json({ alerts });
  } catch(e) { res.json({ alerts: [] }); }
});


