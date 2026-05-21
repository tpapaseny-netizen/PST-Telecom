import re

with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

code = """
// ─── SEN-SMS — ENVOI BULK VIA INFOBIP ────────────────────────────────────────
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY || '31f52d00c3a4fbb92c00c72139556f43-e7142bf0-5334-471d-b7a3-4a8aa24c1492';
const INFOBIP_BASE_URL = 'https://y42xy1.api.infobip.com';
const INFOBIP_SENDER = 'SenSMS';

// Route envoi campagne Sen-SMS
app.post('/api/sen-sms/send', async (req, res) => {
  try {
    const { campagne, messages, sender, scheduled, total } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Aucun message fourni' });
    }

    const senderName = (sender || INFOBIP_SENDER).replace(/[^a-zA-Z0-9\-]/g, '').substring(0, 11) || INFOBIP_SENDER;

    // Construction du payload Infobip bulk
    const infobipMessages = messages.map(function(m) {
      const dest = { to: m.telephone.replace(/\s/g, '') };
      if (scheduled) dest.sendAt = new Date(scheduled).toISOString();
      return {
        from: senderName,
        destinations: [dest],
        text: m.message
      };
    });

    const payload = { messages: infobipMessages };

    const response = await fetch(INFOBIP_BASE_URL + '/sms/2/text/advanced', {
      method: 'POST',
      headers: {
        'Authorization': 'App ' + INFOBIP_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[SEN-SMS] Infobip error:', JSON.stringify(result));
      return res.status(response.status).json({ error: result.requestError || 'Erreur Infobip', details: result });
    }

    // Log MongoDB
    try {
      const db = client.db('pst_telecom');
      await db.collection('sen_sms_campagnes').insertOne({
        campagne: campagne || 'Sans nom',
        sender: senderName,
        total: messages.length,
        scheduled: scheduled || null,
        infobip_bulk_id: result.bulkId || null,
        messages_ids: (result.messages || []).map(function(m) { return m.messageId; }),
        created_at: new Date()
      });
    } catch(dbErr) {
      console.warn('[SEN-SMS] Log MongoDB echoue:', dbErr.message);
    }

    console.log('[SEN-SMS] Campagne envoyee:', messages.length, 'SMS | bulkId:', result.bulkId);
    res.json({ success: true, bulkId: result.bulkId, sent: messages.length, result: result });

  } catch(err) {
    console.error('[SEN-SMS] Erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Route statut campagne Sen-SMS
app.get('/api/sen-sms/status/:bulkId', async (req, res) => {
  try {
    const response = await fetch(INFOBIP_BASE_URL + '/sms/1/bulks/status?bulkId=' + req.params.bulkId, {
      headers: { 'Authorization': 'App ' + INFOBIP_API_KEY, 'Accept': 'application/json' }
    });
    const result = await response.json();
    res.json(result);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Route historique campagnes Sen-SMS (admin)
app.get('/api/sen-sms/campagnes', async (req, res) => {
  try {
    const db = client.db('pst_telecom');
    const campagnes = await db.collection('sen_sms_campagnes').find({}).sort({ created_at: -1 }).limit(50).toArray();
    res.json({ success: true, campagnes });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

"""

marker = "// \u2500\u2500\u2500 D\u00c9MARRAGE"
if marker in content:
    content = content.replace(marker, code + marker)
    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: routes Sen-SMS injectees avant DEMARRAGE")
else:
    print("ERREUR: marqueur DEMARRAGE non trouve")
