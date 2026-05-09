// ═══════════════════════════════════════════════
// PST-TRAX ROUTES v3.1 — avec mot de passe
// ═══════════════════════════════════════════════

// Register new user
app.post('/api/trax/register', async (req, res) => {
  try {
    const { name, phone, role, vid, vType, password } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'Données manquantes' });

    if (db) {
      // Check if phone already exists
      const existing = await db.collection('trax_users').findOne({ phone });
      if (existing) {
        return res.status(409).json({ error: 'Ce numéro est déjà inscrit. Connectez-vous.', exists: true });
      }
      // Create new user
      const user = {
        id: 'U-' + Date.now(),
        name, phone, role,
        password: password || '',
        vid: vid || null,
        typeLabel: vType?.label || null,
        typeIcon: vType?.icon || null,
        createdAt: new Date()
      };
      await db.collection('trax_users').insertOne(user);
      // Return user without password
      const { password: _, ...safeUser } = user;
      return res.json({ success: true, user: safeUser });
    } else {
      const user = { id: 'U-'+Date.now(), name, phone, role, vid, typeLabel: vType?.label, typeIcon: vType?.icon };
      return res.json({ success: true, user });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Login
app.post('/api/trax/login', async (req, res) => {
  try {
    const { phone, password, role } = req.body;
    if (!phone) return res.status(400).json({ error: 'Téléphone requis' });

    if (db) {
      const user = await db.collection('trax_users').findOne({ phone });
      if (!user) return res.status(404).json({ error: 'Compte introuvable. Créez un compte.' });
      // Check password
      if (user.password && user.password !== password) {
        return res.status(401).json({ error: 'wrong_password' });
      }
      const { password: _, ...safeUser } = user;
      return res.json({ success: true, user: safeUser });
    } else {
      return res.status(404).json({ error: 'Service indisponible' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all vehicles
app.get('/api/trax/vehicles', async (req, res) => {
  try {
    if (db) {
      const vehicles = await db.collection('trax_vehicles').find({}).toArray();
      return res.json(vehicles);
    }
    res.json([]);
  } catch(e) { res.json([]); }
});

// Save all vehicles
app.post('/api/trax/vehicles', async (req, res) => {
  try {
    const vehicles = req.body;
    if (!Array.isArray(vehicles)) return res.status(400).json({ error: 'Format invalide' });
    if (db) {
      await db.collection('trax_vehicles').deleteMany({});
      if (vehicles.length > 0) await db.collection('trax_vehicles').insertMany(vehicles);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update vehicle position (from driver GPS)
app.post('/api/trax/position', async (req, res) => {
  try {
    const { id, driver, phone, lat, lng, speed, accuracy, status, lastSeen } = req.body;
    if (!id || !lat || !lng) return res.status(400).json({ error: 'Données GPS manquantes' });
    if (db) {
      await db.collection('trax_vehicles').updateOne(
        { id },
        { $set: { lat, lng, speed: speed||0, accuracy, status: status||'online', lastSeen: lastSeen||Date.now(), driver, phone } },
        { upsert: true }
      );
      // Save position history
      await db.collection('trax_history').insertOne({
        vehicleId: id, lat, lng, speed: speed||0, status, timestamp: new Date()
      });
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
