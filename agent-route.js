
// ═══════════════════════════════════════════
// AGENT IA SIRA — PST SERVICE CLIENT
// ═══════════════════════════════════════════

app.get('/agent', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'agent.html'));
});

// Log les conversations de l'agent en DB
app.post('/api/agent/log', async (req, res) => {
  try {
    const { message, reply, service } = req.body;
    if (db) {
      await db.collection('agent_logs').insertOne({
        message, reply, service: service || 'general',
        createdAt: new Date()
      });
    }
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});

// Stats agent pour l'admin
app.get('/api/agent/stats', async (req, res) => {
  try {
    if (!db) return res.json({ total: 0, today: 0 });
    const total = await db.collection('agent_logs').countDocuments();
    const today = new Date(); today.setHours(0,0,0,0);
    const todayCount = await db.collection('agent_logs').countDocuments({ createdAt: { $gte: today } });
    res.json({ total, today: todayCount });
  } catch(e) { res.json({ total: 0, today: 0 }); }
});

