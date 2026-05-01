
// Modifier une caméra NOC
app.put('/api/noc/cameras/:id', async (req, res) => {
  try {
    if (!db) return res.json({ success: true });
    const { id } = req.params;
    await db.collection('noc_cameras').updateOne(
      { id },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

