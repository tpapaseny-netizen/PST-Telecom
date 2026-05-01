s = open('server-at.js', 'r', encoding='utf-8').read()

# Ajouter une route de synchronisation NOC -> SecurCam
patch = '''
// Sync NOC cameras vers SecurCam clients
app.post('/api/noc/sync', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, message: 'DB non disponible' });
    
    // Récupérer toutes les caméras NOC
    const nocCams = await db.collection('noc_cameras').find({}).toArray();
    
    // Grouper par client
    const clientsMap = {};
    nocCams.forEach(cam => {
      if (!clientsMap[cam.client]) {
        clientsMap[cam.client] = { cameras: [] };
      }
      clientsMap[cam.client].cameras.push(cam);
    });
    
    let synced = 0;
    for (const [clientName, data] of Object.entries(clientsMap)) {
      // Vérifier si le client existe déjà dans securcam_clients
      const existing = await db.collection('securcam_clients').findOne({ name: clientName });
      if (!existing) {
        // Créer le client automatiquement
        const code = 'PST-' + clientName.substring(0,6).toUpperCase().replace(/\\s/g,'') + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
        await db.collection('securcam_clients').insertOne({
          code, name: clientName, type: 'Client NOC',
          contact: clientName, tel: '', email: '',
          plan: 'starter', tarif: 0,
          password: 'pst2026', status: 'active',
          cameras: data.cameras,
          createdAt: new Date()
        });
        synced++;
      } else {
        // Mettre à jour les caméras
        await db.collection('securcam_clients').updateOne(
          { name: clientName },
          { $set: { cameras: data.cameras } }
        );
      }
      // Sync cameras dans securcam_cameras
      for (const cam of data.cameras) {
        await db.collection('securcam_cameras').updateOne(
          { id: cam.id },
          { $set: { ...cam, clientCode: existing?.code || clientName } },
          { upsert: true }
        );
      }
    }
    
    res.json({ success: true, synced, total: Object.keys(clientsMap).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Stats NOC globales améliorées
app.get('/api/noc/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, online: 0, offline: 0, clients: 0 });
    const cameras = await db.collection('noc_cameras').find({}).toArray();
    const clients = [...new Set(cameras.map(c => c.client))].length;
    const secCams = await db.collection('securcam_cameras').countDocuments();
    res.json({ 
      total: cameras.length, 
      online: cameras.filter(c=>c.online).length, 
      offline: cameras.filter(c=>!c.online).length, 
      clients,
      securcam_total: secCams
    });
  } catch(e) { res.json({ total: 0, online: 0, offline: 0, clients: 0 }); }
});
'''

if '// Sync NOC cameras' not in s:
    s = s.replace('// ─── DÉMARRAGE', patch + '\n// ─── DÉMARRAGE')
    open('server-at.js', 'w', encoding='utf-8').write(s)
    print('OK - routes sync ajoutées')
else:
    print('Sync déjà présent')
