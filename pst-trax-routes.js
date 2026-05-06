// ═══════════════════════════════════════════════════════
// PST-TRAX — Routes API Géolocalisation
// À coller dans server-at.js avant connectDB().then(
// ═══════════════════════════════════════════════════════

// ─── PAGE DASHBOARD PROPRIÉTAIRE ───────────────────────
app.get('/trax', (req, res) => {
  res.sendFile(path.join(__dirname, 'pst-trax.html'));
});

// ─── PAGE APP CHAUFFEUR ─────────────────────────────────
app.get('/trax-driver', (req, res) => {
  res.sendFile(path.join(__dirname, 'pst-trax-driver.html'));
});

// ─── ENREGISTRER UN VÉHICULE ────────────────────────────
app.post('/api/trax/register', async (req, res) => {
  try {
    const { vehicleId, driverName, type, ownerPhone } = req.body;
    if(!vehicleId) return res.status(400).json({ error: 'vehicleId requis' });

    if(db) {
      await db.collection('trax_vehicles').updateOne(
        { vehicleId },
        { $set: {
          vehicleId, driverName, type: type||'moto',
          ownerPhone: ownerPhone||'',
          lastSeen: new Date(),
          status: 'offline',
          cut: false
        }},
        { upsert: true }
      );
    }
    res.json({ success: true, vehicleId });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── RECEVOIR POSITION GPS ──────────────────────────────
app.post('/api/trax/position', async (req, res) => {
  try {
    const { vehicleId, driverName, type, lat, lng, speed, accuracy, status, distance, timestamp } = req.body;
    if(!vehicleId || !lat || !lng) return res.status(400).json({ error: 'Données manquantes' });

    const pos = {
      vehicleId, driverName, type: type||'moto',
      lat: parseFloat(lat), lng: parseFloat(lng),
      speed: parseInt(speed)||0,
      accuracy: parseFloat(accuracy)||0,
      status: status||'moving',
      distance: parseFloat(distance)||0,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    };

    let cut = false;

    if(db) {
      // Update vehicle current position
      await db.collection('trax_vehicles').updateOne(
        { vehicleId },
        { $set: {
          ...pos,
          lastSeen: new Date(),
          driverName: driverName||'Chauffeur',
          type: type||'moto'
        }},
        { upsert: true }
      );

      // Save position history
      await db.collection('trax_positions').insertOne({
        ...pos,
        createdAt: new Date()
      });

      // Check if vehicle is cut
      const vehicle = await db.collection('trax_vehicles').findOne({ vehicleId });
      if(vehicle) cut = vehicle.cut || false;

      // Auto-cleanup old positions (keep 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await db.collection('trax_positions').deleteMany({
        vehicleId,
        createdAt: { $lt: ninetyDaysAgo }
      });
    } else {
      // Memory fallback
      global._trax_vehicles = global._trax_vehicles || {};
      global._trax_vehicles[vehicleId] = pos;
    }

    res.json({ success: true, cut });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── LISTE TOUS LES VÉHICULES (dashboard) ───────────────
app.get('/api/trax/vehicles', async (req, res) => {
  try {
    if(db) {
      const vehicles = await db.collection('trax_vehicles').find({}).toArray();
      res.json(vehicles);
    } else {
      const mem = global._trax_vehicles || {};
      res.json(Object.values(mem));
    }
  } catch(e) {
    res.json([]);
  }
});

// ─── UN VÉHICULE SPÉCIFIQUE ─────────────────────────────
app.get('/api/trax/vehicles/:vehicleId', async (req, res) => {
  try {
    if(db) {
      const v = await db.collection('trax_vehicles').findOne({ vehicleId: req.params.vehicleId });
      res.json(v || {});
    } else {
      const mem = global._trax_vehicles || {};
      res.json(mem[req.params.vehicleId] || {});
    }
  } catch(e) {
    res.json({});
  }
});

// ─── HISTORIQUE POSITIONS ───────────────────────────────
app.get('/api/trax/history/:vehicleId', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    if(db) {
      const positions = await db.collection('trax_positions')
        .find({ vehicleId: req.params.vehicleId, createdAt: { $gte: since } })
        .sort({ createdAt: 1 })
        .limit(1000)
        .toArray();
      res.json(positions);
    } else {
      res.json([]);
    }
  } catch(e) {
    res.json([]);
  }
});

// ─── COUPER MOTEUR ──────────────────────────────────────
app.post('/api/trax/cut/:vehicleId', async (req, res) => {
  try {
    const { cut = true } = req.body;
    if(db) {
      await db.collection('trax_vehicles').updateOne(
        { vehicleId: req.params.vehicleId },
        { $set: { cut: !!cut, cutAt: new Date() } }
      );
    } else {
      if(global._trax_vehicles && global._trax_vehicles[req.params.vehicleId]) {
        global._trax_vehicles[req.params.vehicleId].cut = !!cut;
      }
    }
    res.json({ success: true, cut: !!cut });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── COMMANDES POUR LE CHAUFFEUR ────────────────────────
app.get('/api/trax/commands/:vehicleId', async (req, res) => {
  try {
    if(db) {
      const v = await db.collection('trax_vehicles').findOne({ vehicleId: req.params.vehicleId });
      if(!v) return res.json({ cut: false });
      res.json({ cut: v.cut || false, message: v.pendingMessage || null });

      // Clear pending message after sending
      if(v.pendingMessage) {
        await db.collection('trax_vehicles').updateOne(
          { vehicleId: req.params.vehicleId },
          { $unset: { pendingMessage: '' } }
        );
      }
    } else {
      const mem = global._trax_vehicles || {};
      const v = mem[req.params.vehicleId];
      res.json({ cut: v ? v.cut : false });
    }
  } catch(e) {
    res.json({ cut: false });
  }
});

// ─── ENVOYER MESSAGE AU CHAUFFEUR ───────────────────────
app.post('/api/trax/message/:vehicleId', async (req, res) => {
  try {
    const { message } = req.body;
    if(db) {
      await db.collection('trax_vehicles').updateOne(
        { vehicleId: req.params.vehicleId },
        { $set: { pendingMessage: message } }
      );
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── STATS GLOBALES TRAX ────────────────────────────────
app.get('/api/trax/stats', async (req, res) => {
  try {
    if(db) {
      const vehicles = await db.collection('trax_vehicles').find({}).toArray();
      const total = vehicles.length;
      const moving = vehicles.filter(v => v.status === 'moving').length;
      const stopped = vehicles.filter(v => v.status === 'stopped').length;
      const offline = vehicles.filter(v => v.status === 'offline').length;
      const alert = vehicles.filter(v => v.status === 'alert').length;
      res.json({ total, moving, stopped, offline, alert });
    } else {
      res.json({ total: 0, moving: 0, stopped: 0, offline: 0, alert: 0 });
    }
  } catch(e) {
    res.json({ total: 0, moving: 0, stopped: 0, offline: 0, alert: 0 });
  }
});

// ─── SUPPRIMER VÉHICULE ─────────────────────────────────
app.delete('/api/trax/vehicles/:vehicleId', async (req, res) => {
  try {
    if(db) {
      await db.collection('trax_vehicles').deleteOne({ vehicleId: req.params.vehicleId });
      await db.collection('trax_positions').deleteMany({ vehicleId: req.params.vehicleId });
    }
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
