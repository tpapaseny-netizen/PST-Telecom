
// ═══════════════════════════════════════════
// AGENT NOC — SURVEILLANCE CAMERAS 24H/24
// ═══════════════════════════════════════════

const NOC_ALERT_PHONE = process.env.ADMIN_PHONE || '+221771520959';
let nocAgentTimer = null;
let cameraStatus = {}; // Track camera status in memory

// Start NOC agent when server starts
function startNocAgent() {
  console.log('🤖 Agent NOC démarré — surveillance toutes les 5 minutes');
  
  // Check immediately then every 5 minutes
  checkAllCameras();
  nocAgentTimer = setInterval(checkAllCameras, 5 * 60 * 1000);
}

async function checkAllCameras() {
  try {
    if (!db) return;
    const cameras = await db.collection('noc_cameras').find({ status: { $ne: 'disabled' } }).toArray();
    
    for (const cam of cameras) {
      const id = cam._id.toString();
      const url = cam.url || '';
      
      // Only check HTTP/HTTPS URLs (YouTube embeds, HLS)
      if (!url.startsWith('http')) continue;
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        // For YouTube embeds, check if the base URL responds
        const checkUrl = url.includes('youtube.com/embed') 
          ? 'https://www.youtube.com' 
          : url.split('?')[0];
        
        const resp = await fetch(checkUrl, { 
          method: 'HEAD', 
          signal: controller.signal 
        });
        clearTimeout(timeout);
        
        const isOnline = resp.status < 500;
        const wasOnline = cameraStatus[id] !== 'offline';
        
        if (!isOnline && wasOnline) {
          // Camera just went offline
          cameraStatus[id] = 'offline';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'offline', lastOffline: new Date() } }
          );
          await sendNocAlert('offline', cam);
          await logNocEvent('offline', cam);
          
        } else if (isOnline && !wasOnline) {
          // Camera came back online
          cameraStatus[id] = 'online';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'online', lastOnline: new Date() } }
          );
          await sendNocAlert('reconnect', cam);
          await logNocEvent('reconnect', cam);
        } else {
          cameraStatus[id] = isOnline ? 'online' : 'offline';
        }
        
      } catch(e) {
        // Timeout or network error = offline
        if (cameraStatus[id] !== 'offline') {
          cameraStatus[id] = 'offline';
          await db.collection('noc_cameras').updateOne(
            { _id: cam._id }, 
            { $set: { status: 'offline', lastOffline: new Date() } }
          );
          await sendNocAlert('offline', cam);
          await logNocEvent('offline', cam);
        }
      }
    }
  } catch(e) {
    console.error('Agent NOC erreur:', e.message);
  }
}

async function sendNocAlert(type, cam) {
  try {
    const AT = require('africastalking')({
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME
    });
    
    const msg = type === 'offline'
      ? `ALERTE PST NOC : Camera "${cam.name || 'Inconnue'}" chez ${cam.client || 'Client'} est HORS LIGNE ! Verifiez immediatement.`
      : `PST NOC : Camera "${cam.name || 'Inconnue'}" chez ${cam.client || 'Client'} est de nouveau EN LIGNE.`;
    
    await AT.SMS.send({
      to: [NOC_ALERT_PHONE],
      message: msg,
      from: process.env.AT_USERNAME
    });
    
    console.log(`Agent NOC SMS envoye: ${type} - ${cam.name}`);
  } catch(e) {
    console.error('Agent NOC SMS erreur:', e.message);
  }
}

async function logNocEvent(type, cam) {
  try {
    if (!db) return;
    await db.collection('noc_alerts').insertOne({
      type,
      cameraId: cam._id,
      cameraName: cam.name || 'Inconnue',
      client: cam.client || '',
      url: cam.url || '',
      createdAt: new Date()
    });
    await db.collection('activity_logs').insertOne({
      type: 'noc_alert',
      message: `Camera ${type === 'offline' ? 'HORS LIGNE' : 'RECONNECTEE'}: ${cam.name} (${cam.client})`,
      createdAt: new Date()
    });
  } catch(e) {}
}

// API routes for NOC agent
app.get('/api/noc/alerts', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const alerts = await db.collection('noc_alerts')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(alerts);
  } catch(e) { res.json([]); }
});

app.get('/api/noc/agent/status', async (req, res) => {
  try {
    if (!db) return res.json({ running: false, cameras: 0 });
    const total = await db.collection('noc_cameras').countDocuments();
    const offline = Object.values(cameraStatus).filter(s => s === 'offline').length;
    res.json({ 
      running: nocAgentTimer !== null,
      cameras: total,
      offline,
      online: total - offline,
      lastCheck: new Date().toISOString()
    });
  } catch(e) { res.json({ running: false }); }
});

app.post('/api/noc/agent/check-now', async (req, res) => {
  checkAllCameras();
  res.json({ success: true, message: 'Verification lancee' });
});

