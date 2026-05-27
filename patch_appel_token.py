with open('C:/Users/NDCHEIKH/Desktop/PST-Telecom/server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# La nouvelle route à injecter après la route Vonage existante
new_route = '''

// ═══════════════════════════════════════════════════════════
// ROUTES APPELS INFOBIP WEBRTC
// ═══════════════════════════════════════════════════════════
const INFOBIP_VOIP_KEY = '75a5af9fb5283bf136262f4f920d795a-5b0115bb-0f6f-4416-9f35-1c5f484efe0c';
const INFOBIP_VOIP_URL = 'https://y42xy1.api.infobip.com';

app.post("/api/appel/token", async(req, res) => {
  try {
    const { user_id, number } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requis' });

    // Générer un token WebRTC Infobip
    const identity = user_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const r = await fetch(INFOBIP_VOIP_URL + '/webrtc/1/token', {
      method: 'POST',
      headers: {
        'Authorization': 'App ' + INFOBIP_VOIP_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        identity: identity,
        displayName: number || identity,
        applicationId: 'default',
        capabilities: { recording: 'ALWAYS' },
        timeToLive: 43200
      })
    });

    if (r.ok) {
      const data = await r.json();
      return res.json({ token: data.token, identity });
    } else {
      const err = await r.text();
      console.error('[APPEL TOKEN] Infobip error:', err);
      return res.json({ token: null, error: 'Token Infobip indisponible' });
    }
  } catch(e) {
    console.error('[APPEL TOKEN]', e.message);
    res.json({ token: null, error: e.message });
  }
});

app.post("/api/appel/call", async(req, res) => {
  res.json({ success: true });
});

app.post("/api/appel/hangup", async(req, res) => {
  res.json({ success: true });
});
'''

# Injecter après la route Vonage
target = '// ═══════════════════════════════════════════════════════════\n// ROUTES SMS VERIFICATION (5SIM)'
if target in content:
    content = content.replace(target, new_route + '\n' + target)
    with open('C:/Users/NDCHEIKH/Desktop/PST-Telecom/server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS: Route /api/appel/token injectée')
else:
    print('ERREUR: Cible non trouvée')
