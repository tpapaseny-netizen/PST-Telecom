
// ═══════════════════════════════════════════════════════════════
// ROUTES PST RTSP CONVERTER
// ═══════════════════════════════════════════════════════════════

const GO2RTC_URL = process.env.GO2RTC_URL || 'https://pst-rtsp.up.railway.app';

// Ajouter un stream RTSP
app.post('/api/rtsp/add', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name et url requis' });
    
    // Ajouter le stream dans go2rtc
    const r = await fetch(`${GO2RTC_URL}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`, {
      method: 'PUT'
    });
    
    if (r.ok) {
      // Sauvegarder en DB
      if (db) await db.collection('rtsp_streams').updateOne(
        { name },
        { $set: { name, url, hlsUrl: `${GO2RTC_URL}/api/stream.m3u8?src=${encodeURIComponent(name)}`, createdAt: new Date() } },
        { upsert: true }
      );
      res.json({ 
        success: true, 
        hlsUrl: `${GO2RTC_URL}/api/stream.m3u8?src=${encodeURIComponent(name)}`,
        webrtcUrl: `${GO2RTC_URL}/webrtc?src=${encodeURIComponent(name)}`
      });
    } else {
      res.status(500).json({ error: 'go2rtc non disponible' });
    }
  } catch(e) { 
    res.status(500).json({ error: e.message, note: 'Vérifiez que le service go2rtc est démarré' }); 
  }
});

// Lister tous les streams actifs
app.get('/api/rtsp/streams', async (req, res) => {
  try {
    // Depuis go2rtc
    const r = await fetch(`${GO2RTC_URL}/api/streams`);
    if (r.ok) {
      const streams = await r.json();
      return res.json({ streams, source: 'go2rtc' });
    }
    // Fallback depuis DB
    if (db) {
      const streams = await db.collection('rtsp_streams').find({}).toArray();
      return res.json({ streams, source: 'db' });
    }
    res.json({ streams: [], source: 'none' });
  } catch(e) { 
    res.json({ streams: [], error: e.message }); 
  }
});

// Supprimer un stream
app.delete('/api/rtsp/streams/:name', async (req, res) => {
  try {
    const { name } = req.params;
    await fetch(`${GO2RTC_URL}/api/streams?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (db) await db.collection('rtsp_streams').deleteOne({ name });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Proxy HLS — pour éviter les problèmes CORS
app.get('/api/rtsp/hls/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const r = await fetch(`${GO2RTC_URL}/api/stream.m3u8?src=${encodeURIComponent(name)}`);
    if (r.ok) {
      const content = await r.text();
      res.setHeader('Content-Type', 'application/x-mpegURL');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(content);
    } else {
      res.status(404).json({ error: 'Stream non trouvé' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Status go2rtc
app.get('/api/rtsp/status', async (req, res) => {
  try {
    const r = await fetch(`${GO2RTC_URL}/api`);
    if (r.ok) {
      const data = await r.json();
      res.json({ online: true, version: data.version, url: GO2RTC_URL });
    } else {
      res.json({ online: false });
    }
  } catch(e) { res.json({ online: false, error: e.message }); }
});

// URLs RTSP par marque (guide pour les clients)
app.get('/api/rtsp/guide', (req, res) => {
  res.json({
    brands: [
      { name: 'Hikvision', format: 'rtsp://admin:PASSWORD@IP:554/h264/ch1/main/av_stream', port: 554, cloud: 'Hik-Connect' },
      { name: 'Dahua', format: 'rtsp://admin:PASSWORD@IP:554/cam/realmonitor?channel=1&subtype=0', port: 554, cloud: 'DMSS' },
      { name: 'TP-Link Tapo', format: 'rtsp://USERNAME:PASSWORD@IP:554/stream1', port: 554, cloud: 'Tapo Cloud' },
      { name: 'Reolink', format: 'rtsp://admin:PASSWORD@IP:554/h264Preview_01_main', port: 554, cloud: 'Reolink Cloud' },
      { name: 'Axis', format: 'rtsp://root:PASSWORD@IP:554/axis-media/media.amp', port: 554, cloud: 'AXIS Cloud' },
      { name: 'Foscam', format: 'rtsp://admin:PASSWORD@IP:88/videoMain', port: 88, cloud: 'Foscam Cloud' },
      { name: 'Amcrest', format: 'rtsp://admin:PASSWORD@IP:554/cam/realmonitor', port: 554, cloud: 'Amcrest Cloud' },
      { name: 'Uniview', format: 'rtsp://admin:PASSWORD@IP:554/unicast/c1/s0/live', port: 554, cloud: 'UniCloud' },
      { name: 'Hanwha', format: 'rtsp://admin:PASSWORD@IP:554/profile2/media.smp', port: 554, cloud: 'Wisenet' },
      { name: 'Vivotek', format: 'rtsp://root:PASSWORD@IP:554/live.sdp', port: 554, cloud: 'Vivotek Cloud' },
      { name: 'Annke', format: 'rtsp://admin:PASSWORD@IP:554/H264/ch1/main/av_stream', port: 554, cloud: 'ANNKE Cloud' },
      { name: 'Zmodo', format: 'rtsp://admin:PASSWORD@IP:554/live', port: 554, cloud: 'Zmodo Cloud' },
    ]
  });
});

