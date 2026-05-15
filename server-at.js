const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
app.get('/xlsx.js', (req, res) => { res.sendFile(require('path').join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')); });

// ─── MongoDB ───────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
const AT_API_KEY  = process.env.AT_API_KEY;
const AT_USERNAME = process.env.AT_USERNAME || 'sandbox';
const PORT        = process.env.PORT || 3001;
let db;

async function connectDB() {
  if (!MONGODB_URI) { console.warn('⚠️  MONGODB_URI manquant — mode mémoire activé'); return; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('pst_telecom');
    console.log('✅ MongoDB Atlas connecté');
  } catch (err) { console.error('❌ MongoDB erreur:', err.message); }
}

// ─── Africa's Talking ──────────────────────────────────────
function getAT() {
  if (!AT_API_KEY) return null;
  try { return require('africastalking')({ apiKey: AT_API_KEY, username: AT_USERNAME }); }
  catch { return null; }
}

// ─── Helpers ────────────────────────────────────────────────
const FORFAITS = {
  starter:  { nom: 'Starter',  minutes: 200,   prix: 2990  },
  smart:    { nom: 'Smart',    minutes: 300,   prix: 5990  },
  business: { nom: 'Business', minutes: 99999, prix: 15990 },
};
function genUserId() { return 'PST-' + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genNumero() {
  const prefixes = ['77','78','76','70'];
  const p = prefixes[Math.floor(Math.random()*prefixes.length)];
  const n = Math.floor(Math.random()*9000000)+1000000;
  return `+221 ${p} ${String(n).slice(0,3)} ${String(n).slice(3,5)} ${String(n).slice(5)}`;
}
async function getAbonnes() {
  if (db) return await db.collection('abonnes').find({}).sort({ createdAt: -1 }).toArray();
  return global._abonnes || [];
}
async function saveAbonne(a) {
  if (db) { await db.collection('abonnes').insertOne(a); }
  else { global._abonnes = global._abonnes || []; global._abonnes.push(a); }
}
async function updateAbonne(userId, update) {
  if (db) { await db.collection('abonnes').updateOne({ userId }, { $set: update }); }
  else { global._abonnes = (global._abonnes||[]).map(a => a.userId===userId ? {...a,...update} : a); }
}
async function deleteAbonne(userId) {
  if (db) { await db.collection('abonnes').deleteOne({ userId }); }
  else { global._abonnes = (global._abonnes||[]).filter(a => a.userId!==userId); }
}

// ═══════════════════════════════════════════════════════
// IZICHANGE PAY — SDK Officiel (fourni par izichange)
// ═══════════════════════════════════════════════════════
const IZIPAY_CONFIG = {
  domain:    process.env.IZIPAY_DOMAIN     || 'https://pay.izichange.com',
  apiKey:    process.env.IZIPAY_API_KEY    || '14|6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680',
  secretKey: process.env.IZIPAY_SECRET_KEY || 'kRx1HjF(WLp6BJ0FZ:Ty{#NmO0=9%fWO46]4A3k}',
};

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://pst-telecom-production.up.railway.app';

// ── SDK izichangePay officiel (payment.js) ──
function iziDataToString(data) {
  let s = '';
  for (const [key, value] of Object.entries(data)) {
    s += key + '=' + (Array.isArray(value) ? value.join('') : value);
  }
  return s;
}
function iziSign(data) {
  return crypto.createHmac('sha256', IZIPAY_CONFIG.secretKey).update(iziDataToString(data)).digest('hex');
}
async function iziRequest(endpoint, data, signature) {
  const response = await axios.post(IZIPAY_CONFIG.domain + endpoint, data, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-api-key': IZIPAY_CONFIG.apiKey,
      'x-signature': signature,
    },
    timeout: 15000,
  });
  return response.data;
}

// generatePayinRedirectUrlWithCustomer — lien de paiement avec données client
async function iziGeneratePaymentUrl({orderId, amountUSD, coin, acceptedCoins, firstname, lastname, email}) {
  try {
    // Toutes les cryptos disponibles chez izichange
    const allCoins = [
      'usdt.trc20','usdt.bep20','usdt.erc20','usdt.opbnb','usdt.ton',
      'usdc.trc20','usdc.bep20','usdc.erc20',
      'btc','btc.bep20',
      'eth','eth.bep20',
      'bnb','opbnb',
      'trx',
      'xrp.bep20','sol.bep20','ada.bep20','doge.bep20',
      'dot.bep20','shib.bep20','ltc',
      'busd.bep20','ton','twt.bep20'
    ];
    const toSign = {
      coin: coin || 'usdt.trc20',
      acceptedCoins: acceptedCoins || allCoins,
      amount: String(parseFloat(amountUSD).toFixed(2)),
      successUrl:  BASE_URL + '/api/zama/pay-success?order=' + orderId,
      canceledUrl: BASE_URL + '/api/zama/pay-cancel?order=' + orderId,
      failedUrl:   BASE_URL + '/api/zama/pay-failed?order=' + orderId,
    };
    const data = Object.assign({}, toSign, {
      firstname: firstname || 'Client',
      lastname:  lastname  || 'ZAMA',
      email:     email     || '',
      memo:      'ZAMA-' + orderId,
    });
    const signature = iziSign(toSign);
    console.log('[iziPay] Generating URL order=' + orderId + ' amount=$' + amountUSD + ' coins=' + allCoins.length);
    const result = await iziRequest('/api/payements/init_operation_with_customer_data', data, signature);
    console.log('[iziPay] Result:', JSON.stringify(result).slice(0, 300));
    return (result && result.data && result.data.url) ? result.data.url :
           (result && result.url) ? result.url : null;
  } catch(e) {
    if(e.response) console.error('[iziPay URL] HTTP', e.response.status, JSON.stringify(e.response.data));
    else console.error('[iziPay URL]', e.message);
    return null;
  }
}

// Fallback: adresse directe
async function iziGetAddress(coin) {
  try {
    const toSign = { coin };
    const signature = iziSign(toSign);
    const response = await axios.post(IZIPAY_CONFIG.domain + '/api/payements/address', { coin }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-api-key': IZIPAY_CONFIG.apiKey,
        'x-signature': signature,
      },
      timeout: 10000,
    });
    const data = response.data;
    if(data && data.status && data.data && data.data.address) return { address: data.data.address };
    if(data && data.address) return { address: data.address };
    return null;
  } catch(e) {
    if(e.response) console.error('[iziPay addr] HTTP', e.response.status, JSON.stringify(e.response.data));
    else console.error('[iziPay addr]', e.message);
    return null;
  }
}

function sendMail(to, subject, html) {
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    return t.sendMail({ from: `"PST Telecom" <${process.env.GMAIL_USER}>`, to, subject, html });
  } catch(e) { console.log('[mail]', e.message); }
}

// ─── ROUTES DE BASE ────────────────────────────────────────
app.get('/', (req, res) => res.redirect('https://pst-telecom.vercel.app'));

function authAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== (process.env.ADMIN_PASSWORD || 'pst-admin-2026')) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PST Admin</title><style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:sans-serif;background:#0d2137;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;}.box{background:#111c2a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:2rem;width:320px;text-align:center;}.logo{font-size:2rem;font-weight:900;color:#00c864;margin-bottom:0.5rem;}.sub{font-size:0.8rem;color:#7a8f9e;margin-bottom:2rem;}input{width:100%;padding:0.85rem;background:#0d2137;border:1.5px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:1rem;outline:none;margin-bottom:1rem;}.btn{width:100%;padding:0.85rem;background:#00c864;color:#0d2137;border:none;border-radius:8px;font-weight:700;font-size:1rem;cursor:pointer;}.err{color:#f44336;font-size:0.82rem;margin-top:0.75rem;display:none;}</style></head><body><div class="box"><div class="logo">PST</div><div class="sub">Dashboard Admin</div><input type="password" id="pwd" placeholder="Mot de passe admin" onkeydown="if(event.key==='Enter')login()"/><button class="btn" onclick="login()">Accéder →</button><div class="err" id="err">Mot de passe incorrect</div></div><script>function login(){const p=document.getElementById('pwd').value;if(p)window.location.href='/admin?token='+encodeURIComponent(p);else{document.getElementById('err').style.display='block';}}</script></body></html>`);
  }
  next();
}

app.get('/admin',         authAdmin, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/sms-marketing', (req, res) => res.sendFile(path.join(__dirname, 'sms-marketing.html')));
app.get('/appel',         (req, res) => res.sendFile(path.join(__dirname, 'appel.html')));
app.get('/dashboard',     (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/sms',           (req, res) => res.sendFile(path.join(__dirname, 'sms.html')));
app.get('/streaming',     (req, res) => res.sendFile(path.join(__dirname, 'streaming.html')));
app.get('/recharge',      (req, res) => res.sendFile(path.join(__dirname, 'recharge.html')));
app.get('/noc',           (req, res) => res.sendFile(path.join(__dirname, 'noc.html')));
app.get('/trax',          (req, res) => res.sendFile(path.join(__dirname, 'pst-trax.html')));
app.get('/trax-driver',   (req, res) => res.sendFile(path.join(__dirname, 'pst-trax-driver.html')));
app.get('/zama',          (req, res) => res.sendFile(path.join(__dirname, 'zama.html')));
app.get('/crypto-admin',  (req, res) => res.sendFile(path.join(__dirname, 'crypto-dashboard.html')));
app.get('/izipay-widget.js', (req, res) => { res.setHeader('Content-Type','application/javascript'); res.sendFile(__dirname+'/izipay-widget.js'); });

// ═══════════════════════════════════════════════
// PST-TRAX ROUTES
// ═══════════════════════════════════════════════
function normalizePhone(p) {
  let n = (p||'').replace(/\s/g,'').replace(/[^\d]/g,'');
  if(n.startsWith('221')) n=n.slice(3);
  return n;
}

app.post('/api/trax/login', async (req,res) => {
  try {
    const {phone,password}=req.body;
    if(!phone) return res.status(400).json({error:'Telephone requis'});
    const np=normalizePhone(phone);
    if(db){
      const user=await db.collection('trax_users').findOne({$or:[{phone:np},{phone:'+221'+np}]});
      if(!user) return res.status(404).json({error:'Compte introuvable'});
      if(user.password && user.password!==password) return res.status(401).json({error:'wrong_password'});
      return res.json({success:true,user:{id:user.id,name:user.name,phone:np,role:user.role,vid:user.vid,typeLabel:user.typeLabel,typeIcon:user.typeIcon}});
    }
    return res.status(503).json({error:'DB indisponible'});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/trax/reset-password', async (req,res) => {
  try {
    const {phone,newPassword}=req.body;
    if(!phone||!newPassword) return res.status(400).json({error:'Donnees manquantes'});
    const np=normalizePhone(phone);
    if(!db) return res.status(503).json({error:'DB indisponible'});
    const r=await db.collection('trax_users').updateOne({$or:[{phone:np},{phone:'+221'+np}]},{$set:{password:newPassword,updatedAt:new Date()}});
    if(r.matchedCount===0) return res.status(404).json({error:'Compte introuvable'});
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/trax/register', async (req,res) => {
  try {
    const {name,phone,role,vid,vType,password,vehicleId,driverName,type,ownerPhone}=req.body;
    // Register vehicle
    if(vehicleId){
      if(db) await db.collection('trax_vehicles').updateOne({vehicleId},{$set:{vehicleId,driverName,type:type||'moto',ownerPhone:ownerPhone||'',lastSeen:new Date(),status:'offline',cut:false}},{upsert:true});
      return res.json({success:true,vehicleId});
    }
    // Register user
    if(!phone||!name) return res.status(400).json({error:'Donnees manquantes'});
    const np=normalizePhone(phone);
    if(db){
      const ex=await db.collection('trax_users').findOne({$or:[{phone:np},{phone:'+221'+np}]});
      if(ex) return res.status(409).json({exists:true,error:'Numero deja inscrit'});
      const user={id:'U-'+Date.now(),name,phone:np,role,password:password||'',vid:vid||null,typeLabel:vType&&vType.label||null,typeIcon:vType&&vType.icon||null,createdAt:new Date()};
      await db.collection('trax_users').insertOne(user);
      return res.json({success:true,user:{id:user.id,name:user.name,phone:user.phone,role:user.role,vid:user.vid,typeLabel:user.typeLabel,typeIcon:user.typeIcon}});
    }
    return res.json({success:true,user:{id:'U-'+Date.now(),name,phone:np,role,vid}});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/trax/vehicles', async (req,res) => {
  try {
    if(db){ const v=await db.collection('trax_vehicles').find({}).toArray(); return res.json(v.map(x=>{delete x._id;return x;})); }
    res.json(Object.values(global._trax_vehicles||{}));
  }catch(e){res.json([]);}
});

app.post('/api/trax/vehicles', async (req,res) => {
  try {
    const v=req.body;
    if(!Array.isArray(v)) return res.status(400).json({error:'Format invalide'});
    if(db){ await db.collection('trax_vehicles').deleteMany({}); if(v.length>0) await db.collection('trax_vehicles').insertMany(v.map(x=>{delete x._id;return x;})); }
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/trax/position', async (req,res) => {
  try {
    const d=req.body;
    const vehicleId=d.vehicleId||d.id;
    const lat=d.lat, lng=d.lng;
    if(!vehicleId||!lat||!lng) return res.status(400).json({error:'Donnees manquantes'});
    let cut=false;
    if(db){
      await db.collection('trax_vehicles').updateOne(
        {$or:[{vehicleId},{id:vehicleId}]},
        {$set:{lat:parseFloat(lat),lng:parseFloat(lng),speed:d.speed||0,status:d.status||'online',lastSeen:d.lastSeen||Date.now(),driver:d.driver,phone:d.phone,driverName:d.driverName||d.driver,type:d.type||'moto'}},
        {upsert:true}
      );
      await db.collection('trax_positions').insertOne({vehicleId,lat:parseFloat(lat),lng:parseFloat(lng),speed:d.speed||0,status:d.status||'moving',createdAt:new Date()});
      const vehicle=await db.collection('trax_vehicles').findOne({$or:[{vehicleId},{id:vehicleId}]});
      if(vehicle) cut=vehicle.cut||false;
      const ninetyDaysAgo=new Date(Date.now()-90*24*60*60*1000);
      await db.collection('trax_positions').deleteMany({vehicleId,createdAt:{$lt:ninetyDaysAgo}});
    } else {
      global._trax_vehicles=global._trax_vehicles||{};
      global._trax_vehicles[vehicleId]={vehicleId,lat,lng,speed:d.speed||0,status:d.status||'online'};
    }
    res.json({success:true,cut});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/trax/vehicles/:vehicleId', async (req,res) => {
  try {
    if(db){ const v=await db.collection('trax_vehicles').findOne({vehicleId:req.params.vehicleId}); return res.json(v||{}); }
    res.json((global._trax_vehicles||{})[req.params.vehicleId]||{});
  }catch(e){res.json({});}
});

app.get('/api/trax/history/:vehicleId', async (req,res) => {
  try {
    const {hours=24}=req.query;
    const since=new Date(Date.now()-hours*60*60*1000);
    if(db){ const positions=await db.collection('trax_positions').find({vehicleId:req.params.vehicleId,createdAt:{$gte:since}}).sort({createdAt:1}).limit(1000).toArray(); return res.json(positions); }
    res.json([]);
  }catch(e){res.json([]);}
});

app.post('/api/trax/cut/:vehicleId', async (req,res) => {
  try {
    const {cut=true}=req.body;
    if(db) await db.collection('trax_vehicles').updateOne({vehicleId:req.params.vehicleId},{$set:{cut:!!cut,cutAt:new Date()}});
    else if(global._trax_vehicles&&global._trax_vehicles[req.params.vehicleId]) global._trax_vehicles[req.params.vehicleId].cut=!!cut;
    res.json({success:true,cut:!!cut});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/trax/commands/:vehicleId', async (req,res) => {
  try {
    if(db){
      const v=await db.collection('trax_vehicles').findOne({vehicleId:req.params.vehicleId});
      if(!v) return res.json({cut:false});
      res.json({cut:v.cut||false,message:v.pendingMessage||null});
      if(v.pendingMessage) await db.collection('trax_vehicles').updateOne({vehicleId:req.params.vehicleId},{$unset:{pendingMessage:''}});
    } else { res.json({cut:false}); }
  }catch(e){res.json({cut:false});}
});

app.post('/api/trax/message/:vehicleId', async (req,res) => {
  try {
    if(db) await db.collection('trax_vehicles').updateOne({vehicleId:req.params.vehicleId},{$set:{pendingMessage:req.body.message}});
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/trax/stats', async (req,res) => {
  try {
    if(db){
      const vehicles=await db.collection('trax_vehicles').find({}).toArray();
      res.json({total:vehicles.length,moving:vehicles.filter(v=>v.status==='moving').length,stopped:vehicles.filter(v=>v.status==='stopped').length,offline:vehicles.filter(v=>v.status==='offline').length,alert:vehicles.filter(v=>v.status==='alert').length});
    } else res.json({total:0,moving:0,stopped:0,offline:0,alert:0});
  }catch(e){res.json({total:0,moving:0,stopped:0,offline:0,alert:0});}
});

app.delete('/api/trax/vehicles/:vehicleId', async (req,res) => {
  try {
    if(db){ await db.collection('trax_vehicles').deleteOne({vehicleId:req.params.vehicleId}); await db.collection('trax_positions').deleteMany({vehicleId:req.params.vehicleId}); }
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});

// ═══════════════════════════════════════════════
// ABONNÉS / FORFAITS PST
// ═══════════════════════════════════════════════
app.get('/api/admin/stats', async (req, res) => {
  try {
    const abonnes = await getAbonnes();
    res.json({ total: abonnes.length, actifs: abonnes.filter(a=>a.statut==='actif').length, attente: abonnes.filter(a=>a.statut==='en_attente').length, revenus: abonnes.filter(a=>a.statut==='actif').reduce((s,a)=>s+(FORFAITS[a.forfait]?.prix||0),0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/abonnes', async (req, res) => {
  try { res.json(await getAbonnes()); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    if (!db) return res.json([]);
    res.json(await db.collection('abonnes').find({}).sort({createdAt:-1}).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait = 'smart' } = req.body;
    if (!nom || !telephone) return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
    const f = FORFAITS[forfait] || FORFAITS.smart;
    const abonne = { userId: genUserId(), nom, prenom, telephone, forfait, forfaitNom: f.nom, minutes: f.minutes, minutesUsees: 0, prix: f.prix, numeroVirtuel: genNumero(), statut: 'en_attente', createdAt: new Date(), updatedAt: new Date(), paiements: [] };
    await saveAbonne(abonne);
    const at = getAT();
    if (at) { try { await at.SMS.send({ to: telephone, message: `Bienvenue PST ! Forfait ${f.nom} en cours d'activation. ID: ${abonne.userId}`, from: 'PST' }); } catch(e){} }
    res.json({ success: true, userId: abonne.userId, numeroVirtuel: abonne.numeroVirtuel, lienWave: `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${f.prix}`, message: `Compte PST créé ! Forfait ${f.nom} — ${f.prix} FCFA` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/activer/:userId', async (req, res) => {
  try {
    await updateAbonne(req.params.userId, { statut: 'actif', activatedAt: new Date(), updatedAt: new Date() });
    res.json({ success: true, message: 'Abonné activé' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/suspendre/:userId', async (req, res) => {
  try { await updateAbonne(req.params.userId, { statut: 'suspendu', updatedAt: new Date() }); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/abonne/:userId', async (req, res) => {
  try {
    const { nom, prenom, telephone, forfait, minutesBonus } = req.body;
    const update = { updatedAt: new Date() };
    if (nom) update.nom = nom; if (prenom) update.prenom = prenom; if (telephone) update.telephone = telephone;
    if (forfait && FORFAITS[forfait]) { update.forfait = forfait; update.forfaitNom = FORFAITS[forfait].nom; update.prix = FORFAITS[forfait].prix; update.minutes = FORFAITS[forfait].minutes; }
    if (minutesBonus && db) { await db.collection('abonnes').updateOne({ userId: req.params.userId }, { $inc: { minutes: parseInt(minutesBonus) }, $set: update }); }
    else { await updateAbonne(req.params.userId, update); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/abonne/:userId', async (req, res) => {
  try { await deleteAbonne(req.params.userId); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// APPELS VONAGE
// ═══════════════════════════════════════════════
app.post('/api/appel/initier', async (req, res) => {
  try {
    const { userId, numeroDestination } = req.body;
    const abonnes = await getAbonnes();
    const abonne  = abonnes.find(a => a.userId === userId);
    if (!abonne) return res.status(404).json({ error: 'Abonné introuvable' });
    if (abonne.statut !== 'actif') return res.status(403).json({ error: 'Forfait non actif' });
    if (abonne.minutes !== 99999 && (abonne.minutesUsees||0) >= abonne.minutes) return res.status(403).json({ error: 'Minutes épuisées' });
    const VONAGE_KEY = process.env.VONAGE_API_KEY, VONAGE_SECRET = process.env.VONAGE_API_SECRET;
    if (VONAGE_KEY && VONAGE_SECRET) {
      try {
        const r = await fetch('https://api.nexmo.com/v1/calls', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${VONAGE_KEY}:${VONAGE_SECRET}`).toString('base64')}` }, body: JSON.stringify({ to: [{ type: 'phone', number: numeroDestination.replace(/\s/g,'') }], from: { type: 'phone', number: process.env.VONAGE_NUMBER||'12345678901' }, ncco: [{ action: 'talk', text: 'Appel PST Telecom. Connexion en cours.', language: 'fr-FR' }] }) });
        if (r.ok) { const data = await r.json(); if (db) await db.collection('abonnes').updateOne({ userId }, { $inc: { minutesUsees: 1 } }); return res.json({ success: true, callId: data.uuid||'VNG-'+Date.now(), type: 'real' }); }
      } catch(e) {}
    }
    res.json({ success: true, callId: 'CALL-DEMO-'+Math.random().toString(16).slice(2,8).toUpperCase(), type: 'sandbox', message: `[SANDBOX] Appel simulé vers ${numeroDestination}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════
// SMS VERIFICATION (5SIM)
// ═══════════════════════════════════════════════
const SMS_PACKS = { pack1:{points:5,prix:1000,label:'5 points'}, pack2:{points:12,prix:2000,label:'12 points'}, pack3:{points:30,prix:4500,label:'30 points'}, pack4:{points:70,prix:9000,label:'70 points'} };
const SMS_SERVICES = [
  {id:'whatsapp',nom:'WhatsApp',icon:'💬',prix_points:1},{id:'google',nom:'Google / Gmail',icon:'🔵',prix_points:1},
  {id:'facebook',nom:'Facebook',icon:'📘',prix_points:1},{id:'instagram',nom:'Instagram',icon:'📸',prix_points:1},
  {id:'tiktok',nom:'TikTok',icon:'🎵',prix_points:1},{id:'telegram',nom:'Telegram',icon:'✈️',prix_points:1},
  {id:'twitter',nom:'Twitter / X',icon:'🐦',prix_points:1},{id:'snapchat',nom:'Snapchat',icon:'👻',prix_points:1},
  {id:'microsoft',nom:'Microsoft',icon:'🪟',prix_points:2},{id:'apple',nom:'Apple',icon:'🍎',prix_points:2},
  {id:'amazon',nom:'Amazon',icon:'📦',prix_points:2},{id:'netflix',nom:'Netflix',icon:'🎬',prix_points:2},
  {id:'uber',nom:'Uber',icon:'🚗',prix_points:1},{id:'airbnb',nom:'Airbnb',icon:'🏠',prix_points:2},
  {id:'linkedin',nom:'LinkedIn',icon:'💼',prix_points:1},{id:'chatgpt',nom:'OpenAI/ChatGPT',icon:'🤖',prix_points:2},
  {id:'discord',nom:'Discord',icon:'🎮',prix_points:1},{id:'viber',nom:'Viber',icon:'📱',prix_points:1},
];

let fivesimServicesCache=null, fivesimCacheTime=0;
async function getFivesimServices() {
  const now=Date.now();
  if(fivesimServicesCache&&(now-fivesimCacheTime)<3600000) return fivesimServicesCache;
  const KEY=process.env.FIVESIM_API_KEY;
  if(!KEY) return null;
  try {
    const r=await fetch('https://5sim.net/v1/guest/products/any/any',{headers:{'Authorization':`Bearer ${KEY}`,'Accept':'application/json'}});
    if(!r.ok) return null;
    const data=await r.json();
    fivesimServicesCache=Object.entries(data).map(([id,info])=>({id,nom:id,logo:`https://www.google.com/s2/favicons?domain=${id}.com&sz=64`,prix_usd:info.Cost||0.01,count:info.Qty||0,prix_points:Math.max(1,Math.ceil((info.Cost||0.01)/0.04))})).filter(s=>s.count>0).sort((a,b)=>b.count-a.count);
    fivesimCacheTime=now;
    return fivesimServicesCache;
  } catch(e){ return null; }
}

app.get('/api/sms/services', async (req,res) => { const live=await getFivesimServices(); res.json(live||SMS_SERVICES); });
app.get('/api/sms/packs', (req,res) => res.json(SMS_PACKS));
app.post('/api/sms/acheter-points', async (req,res) => {
  try { const p=SMS_PACKS[req.body.pack]; if(!p) return res.status(400).json({error:'Pack invalide'}); res.json({success:true,lienWave:`https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=${p.prix}`,pack:p}); }
  catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/sms/confirmer-points', async (req,res) => {
  try {
    const {userId,pack}=req.body; const p=SMS_PACKS[pack]; if(!p) return res.status(400).json({error:'Pack invalide'});
    if(db) await db.collection('abonnes').updateOne({userId},{$inc:{pointsSMS:p.points},$push:{historiquePoints:{type:'achat',points:p.points,pack,date:new Date()}}});
    res.json({success:true,pointsAjoutes:p.points});
  } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/sms/demander-numero', async (req,res) => {
  try {
    const {userId,serviceId}=req.body;
    const service=SMS_SERVICES.find(s=>s.id===serviceId);
    if(!service) return res.status(400).json({error:'Service invalide'});
    const abonnes=await getAbonnes(); const abonne=abonnes.find(a=>a.userId===userId);
    if(!abonne) return res.status(404).json({error:'Abonné introuvable'});
    const points=abonne.pointsSMS||0;
    if(points<service.prix_points) return res.status(403).json({error:'Points insuffisants',pointsActuels:points,pointsNecessaires:service.prix_points});
    const KEY=process.env.FIVESIM_API_KEY;
    if(KEY){
      try {
        const r=await fetch(`https://5sim.net/v1/user/buy/activation/any/any/${service.id}`,{headers:{'Authorization':`Bearer ${KEY}`,'Accept':'application/json'}});
        if(r.ok){
          const data=await r.json();
          const activationId='FSIM-'+data.id; const expireAt=new Date(Date.now()+20*60*1000);
          if(db) await db.collection('abonnes').updateOne({userId},{$inc:{pointsSMS:-service.prix_points},$push:{activationsSMS:{activationId,fivesimId:data.id,serviceId,service:service.nom,icon:service.icon,numeroTemp:data.phone,expireAt,statut:'en_attente',smsRecu:null,createdAt:new Date()}}});
          return res.json({success:true,activationId,numeroTemp:data.phone,service:service.nom,expireAt,pointsRestants:points-service.prix_points});
        }
      } catch(e){}
    }
    const numeroTemp='+1'+Math.floor(2000000000+Math.random()*8000000000);
    const activationId='ACT-'+Math.random().toString(36).slice(2,10).toUpperCase();
    const expireAt=new Date(Date.now()+20*60*1000);
    if(db) await db.collection('abonnes').updateOne({userId},{$inc:{pointsSMS:-service.prix_points},$push:{activationsSMS:{activationId,serviceId,service:service.nom,icon:service.icon,numeroTemp,expireAt,statut:'en_attente',smsRecu:null,createdAt:new Date()}}});
    res.json({success:true,activationId,numeroTemp,service:service.nom,expireAt,pointsRestants:points-service.prix_points});
  } catch(err){res.status(500).json({error:err.message});}
});
app.get('/api/sms/verifier/:activationId', async (req,res) => {
  try {
    const {activationId}=req.params; const {userId}=req.query;
    if(!db) return res.json({activationId,statut:'en_attente',smsRecu:null});
    const abonne=await db.collection('abonnes').findOne({userId});
    if(!abonne) return res.status(404).json({error:'Abonné introuvable'});
    const activation=(abonne.activationsSMS||[]).find(a=>a.activationId===activationId);
    if(!activation) return res.status(404).json({error:'Activation introuvable'});
    if(activation.smsRecu) return res.json({activationId,statut:'recu',smsRecu:activation.smsRecu});
    const KEY=process.env.FIVESIM_API_KEY;
    if(KEY&&activation.fivesimId){
      try {
        const r=await fetch(`https://5sim.net/v1/user/check/${activation.fivesimId}`,{headers:{'Authorization':`Bearer ${KEY}`,'Accept':'application/json'}});
        if(r.ok){ const data=await r.json(); if(data.sms&&data.sms.length>0){ const smsText=data.sms[0].text; await db.collection('abonnes').updateOne({userId,'activationsSMS.activationId':activationId},{$set:{'activationsSMS.$.smsRecu':smsText,'activationsSMS.$.statut':'recu'}}); return res.json({activationId,statut:'recu',smsRecu:smsText}); } }
      } catch(e){}
    }
    res.json({activationId,statut:activation.statut,smsRecu:null});
  } catch(err){res.status(500).json({error:err.message});}
});
app.get('/api/admin/sms-stats', async (req,res) => {
  try {
    if(!db) return res.json({totalActivations:0,pointsVendus:0,revenusPoints:0});
    const abonnes=await db.collection('abonnes').find({}).toArray();
    let totalActivations=0,pointsVendus=0;
    abonnes.forEach(a=>{ totalActivations+=(a.activationsSMS||[]).length; (a.historiquePoints||[]).forEach(h=>{if(h.type==='achat')pointsVendus+=h.points;}); });
    res.json({totalActivations,pointsVendus,revenusPoints:Math.round(pointsVendus/5*1000)});
  } catch(err){res.status(500).json({error:err.message});}
});
app.get('/api/admin/activations', async (req,res) => {
  try {
    if(!db) return res.json([]);
    const abonnes=await db.collection('abonnes').find({}).toArray();
    const activations=[];
    abonnes.forEach(a=>{(a.activationsSMS||[]).forEach(act=>activations.push({...act,userId:a.userId,nom:a.nom,prenom:a.prenom}));});
    activations.sort((x,y)=>new Date(y.createdAt)-new Date(x.createdAt));
    res.json(activations.slice(0,100));
  } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/admin/ajouter-points', async (req,res) => {
  try {
    const {userId,points}=req.body; if(!db) return res.json({success:true});
    await db.collection('abonnes').updateOne({userId},{$inc:{pointsSMS:parseInt(points)},$push:{historiquePoints:{type:'admin',points:parseInt(points),date:new Date()}}});
    res.json({success:true});
  } catch(err){res.status(500).json({error:err.message});}
});

// ═══════════════════════════════════════════════
// SMS INSCRIPTION / CONNEXION
// ═══════════════════════════════════════════════
app.post('/api/sms/inscription', async (req,res) => {
  try {
    const {nom,telephone}=req.body; if(!nom||!telephone) return res.status(400).json({error:'Données manquantes'});
    if(db){ const exist=await db.collection('comptes_sms').findOne({telephone}); if(exist) return res.json({success:true,userId:exist.userId,nouveau:false}); }
    const userId='SMS-'+Math.random().toString(16).slice(2,10).toUpperCase();
    const compte={userId,nom,telephone,pointsSMS:0,type:'sms_only',createdAt:new Date(),activationsSMS:[],historiquePoints:[]};
    if(db) await db.collection('comptes_sms').insertOne(compte);
    res.json({success:true,userId,nouveau:true,message:`Compte SMS créé ! ID: ${userId}`});
  } catch(err){res.status(500).json({error:err.message});}
});
app.post('/api/sms/connexion', async (req,res) => {
  try {
    const {userId,telephone}=req.body; if(!db) return res.status(503).json({error:'DB non disponible'});
    let compte=await db.collection('comptes_sms').findOne({userId,telephone})||await db.collection('abonnes').findOne({userId,telephone});
    if(!compte) return res.status(404).json({error:'Compte introuvable'});
    res.json({success:true,compte});
  } catch(err){res.status(500).json({error:err.message});}
});
app.get('/api/sms/compte/:userId', async (req,res) => {
  try {
    if(!db) return res.status(503).json({error:'DB non disponible'});
    const compte=await db.collection('comptes_sms').findOne({userId:req.params.userId})||await db.collection('abonnes').findOne({userId:req.params.userId});
    if(!compte) return res.status(404).json({error:'Compte introuvable'});
    res.json({userId:compte.userId,nom:compte.nom,pointsSMS:compte.pointsSMS||0,type:compte.type||'abonne'});
  } catch(err){res.status(500).json({error:err.message});}
});

// ═══════════════════════════════════════════════
// PAIEMENTS (STRIPE / FLUTTERWAVE / WAVE)
// ═══════════════════════════════════════════════
app.post('/api/webhook/wave', async (req,res) => {
  try { const {amount,client_reference}=req.body; if(client_reference) await updateAbonne(client_reference,{statut:'actif',activatedAt:new Date(),updatedAt:new Date(),paiementWave:{amount,date:new Date()}}); res.json({success:true}); }
  catch(err){res.status(500).json({error:err.message});}
});

app.post('/api/paiement/stripe/creer', async (req,res) => {
  try {
    const {type,forfait,pack,userId,devise='usd'}=req.body;
    const STRIPE_SECRET=process.env.STRIPE_SECRET_KEY;
    if(!STRIPE_SECRET) return res.status(503).json({error:'Stripe non configuré'});
    const stripe=require('stripe')(STRIPE_SECRET);
    let montant,description,currency;
    if(devise==='xof'){ currency='xof'; if(type==='forfait'){const f=FORFAITS[forfait];montant=f.prix;description=`PST Forfait ${f.nom}`;}else{const p=SMS_PACKS[pack];montant=p.prix;description=`PST ${p.label} SMS`;} }
    else{ currency='usd'; if(type==='forfait'){const f=FORFAITS[forfait];montant=Math.round(f.prix/600*100);description=`PST Forfait ${f.nom}`;}else{const p=SMS_PACKS[pack];montant=Math.round(p.prix/600*100);description=`PST ${p.label} SMS`;} }
    const session=await stripe.checkout.sessions.create({payment_method_types:['card'],line_items:[{price_data:{currency,product_data:{name:description,description:'Pure Smart Telecom'},unit_amount:montant},quantity:1}],mode:'payment',success_url:`${BASE_URL}/dashboard?paiement=success&type=${type}&ref=${userId}`,cancel_url:`${BASE_URL}/dashboard?paiement=cancel`,metadata:{userId,type,forfait:forfait||'',pack:pack||''}});
    res.json({success:true,url:session.url,sessionId:session.id});
  } catch(err){res.status(500).json({error:err.message});}
});

app.post('/api/webhook/stripe', express.raw({type:'application/json'}), async (req,res) => {
  const STRIPE_SECRET=process.env.STRIPE_SECRET_KEY;
  if(!STRIPE_SECRET) return res.json({received:true});
  try {
    const stripe=require('stripe')(STRIPE_SECRET);
    let event;
    const WEBHOOK_SECRET=process.env.STRIPE_WEBHOOK_SECRET;
    if(WEBHOOK_SECRET) event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],WEBHOOK_SECRET);
    else event=JSON.parse(req.body);
    if(event.type==='checkout.session.completed'){
      const {userId,type,forfait,pack}=event.data.object.metadata;
      if(type==='forfait'&&userId) await updateAbonne(userId,{statut:'actif',activatedAt:new Date(),updatedAt:new Date()});
      else if(type==='sms'&&pack&&userId&&db){ const p=SMS_PACKS[pack]; if(p) await db.collection('abonnes').updateOne({userId},{$inc:{pointsSMS:p.points},$push:{historiquePoints:{type:'stripe',points:p.points,pack,date:new Date()}}}); }
    }
    res.json({received:true});
  } catch(err){res.status(400).json({error:err.message});}
});

app.get('/api/admin/payments', async (req,res) => {
  try { const payments=await db.collection('payments').find({}).sort({createdAt:-1}).toArray(); res.json(payments); } catch(e){res.json([]);}
});
app.post('/api/admin/payments', async (req,res) => {
  try {
    const {userId,montant,moyen,type,reference,statut}=req.body;
    if(!userId||!montant) return res.status(400).json({error:'userId et montant requis'});
    const payment={userId,montant:parseInt(montant),moyen:moyen||'wave',type:type||'forfait',reference:reference||'',statut:statut||'en_attente',createdAt:new Date()};
    const result=await db.collection('payments').insertOne(payment);
    await db.collection('activity_logs').insertOne({type:'paiement',message:`Paiement ${montant} FCFA pour ${userId} (${moyen})`,createdAt:new Date()});
    res.json({success:true,id:result.insertedId});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/payments/:id/validate', async (req,res) => {
  try {
    const payment=await db.collection('payments').findOne({_id:new ObjectId(req.params.id)});
    if(!payment) return res.status(404).json({error:'Paiement introuvable'});
    await db.collection('payments').updateOne({_id:new ObjectId(req.params.id)},{$set:{statut:'confirme',validatedAt:new Date()}});
    await db.collection('abonnes').updateOne({userId:payment.userId},{$set:{statut:'actif',activatedAt:new Date()}});
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/payments/:id', async (req,res) => {
  try { await db.collection('payments').deleteOne({_id:new ObjectId(req.params.id)}); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/flutterwave/confirm', async (req,res) => {
  try {
    const {tx_ref,userId,transaction_id}=req.body;
    const verify=await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,{headers:{Authorization:`Bearer ${process.env.FLW_SECRET_KEY}`}});
    const verifyData=await verify.json();
    if(verifyData.data&&verifyData.data.status==='successful'){
      await db.collection('payments').insertOne({userId,montant:verifyData.data.amount,moyen:'flutterwave_card',type:'forfait',reference:tx_ref,statut:'confirme',transaction_id,createdAt:new Date()});
      await db.collection('abonnes').updateOne({userId},{$set:{statut:'actif',activatedAt:new Date()}});
      res.json({success:true});
    } else res.status(400).json({error:'Paiement non vérifié'});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/flutterwave/webhook', async (req,res) => {
  try {
    const payload=req.body;
    if(payload.event==='charge.completed'&&payload.data.status==='successful'){
      const tx_ref=payload.data.tx_ref; const userId=tx_ref.split('-')[1];
      await db.collection('payments').insertOne({userId,montant:payload.data.amount,moyen:'flutterwave_card',type:'forfait',reference:tx_ref,statut:'confirme',createdAt:new Date()});
      await db.collection('abonnes').updateOne({userId},{$set:{statut:'actif',activatedAt:new Date()}});
    }
    res.sendStatus(200);
  } catch(e){res.sendStatus(500);}
});

// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════
const SUPER_ADMINS=['tpapaseny@ept.sn','papasenytoure@gmail.com'];
app.post('/api/admin/login', (req,res) => {
  const {email,password}=req.body;
  if(!email||!password) return res.status(400).json({error:'Email et mot de passe requis'});
  if(password!==(process.env.ADMIN_PASSWORD||'pst-admin-2026')) return res.status(403).json({error:'Mot de passe incorrect'});
  res.json({success:true,role:SUPER_ADMINS.includes(email.toLowerCase())?'super':'admin',name:email.split('@')[0]});
});
app.get('/api/admin/activity', async (req,res) => {
  try { const logs=await db.collection('activity_logs').find({}).sort({createdAt:-1}).limit(50).toArray(); res.json(logs.map(l=>({type:l.type,message:l.message,time:new Date(l.createdAt).toLocaleTimeString('fr-FR')}))); } catch(e){res.json([]);}
});
app.get('/api/admin/sms-users', async (req,res) => {
  try { res.json(await db.collection('sms_users').find({}).sort({createdAt:-1}).toArray()); } catch(e){res.json([]);}
});
app.post('/api/admin/users/:id/activate', async (req,res) => {
  try { await db.collection('abonnes').updateOne({userId:req.params.id},{$set:{statut:'actif'}}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/admin/users/:id/suspend', async (req,res) => {
  try { await db.collection('abonnes').updateOne({userId:req.params.id},{$set:{statut:'suspendu'}}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});
app.patch('/api/admin/users/:id', async (req,res) => {
  try { const {forfait,minutesBonus}=req.body; const update={$set:{}}; if(forfait)update.$set.forfait=forfait; if(minutesBonus)update.$inc={minutes:parseInt(minutesBonus)}; await db.collection('abonnes').updateOne({userId:req.params.id},update); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/admin/users/:id', async (req,res) => {
  try { await db.collection('abonnes').deleteOne({userId:req.params.id}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/content', async (req,res) => {
  try { const content=await db.collection('site_content').findOne({}); res.json(content||{}); } catch(e){res.json({});}
});
app.post('/api/admin/content', async (req,res) => {
  try { await db.collection('site_content').updateOne({},{$set:req.body},{upsert:true}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});

// ═══════════════════════════════════════════════
// SMS MARKETING
// ═══════════════════════════════════════════════
app.post('/api/sms-marketing/send', async (req,res) => {
  try {
    const {campagne,messages,sender,scheduled}=req.body;
    if(!messages||!messages.length) return res.status(400).json({error:'Aucun message'});
    const camp={campagne:campagne||'Campagne SMS',sender:sender||'PST-Telecom',total:messages.length,envoyes:0,echecs:0,statut:scheduled?'planifie':'en_cours',scheduledAt:scheduled?new Date(scheduled):null,createdAt:new Date()};
    const result=await db.collection('sms_campagnes').insertOne(camp);
    if(scheduled){ await db.collection('sms_campagnes').updateOne({_id:result.insertedId},{$set:{messages,statut:'planifie'}}); return res.json({success:true,campagneId:result.insertedId,statut:'planifie'}); }
    const AT=require('africastalking')({apiKey:process.env.AT_API_KEY,username:process.env.AT_USERNAME});
    const sms=AT.SMS; let envoyes=0,echecs=0;
    for(let i=0;i<messages.length;i+=50){
      const batch=messages.slice(i,i+50);
      for(const msg of batch){ try{ await sms.send({to:[msg.telephone],message:msg.message,from:sender||'PST-Telecom'}); envoyes++; }catch(e){echecs++;} }
      await new Promise(r=>setTimeout(r,200));
    }
    await db.collection('sms_campagnes').updateOne({_id:result.insertedId},{$set:{envoyes,echecs,statut:'termine',finishedAt:new Date()}});
    res.json({success:true,campagneId:result.insertedId,envoyes,echecs,total:messages.length});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/sms-marketing/campagnes', async (req,res) => {
  try { res.json(await db.collection('sms_campagnes').find({},{projection:{messages:0}}).sort({createdAt:-1}).limit(50).toArray()); } catch(e){res.json([]);}
});
app.get('/api/sms-marketing/stats', async (req,res) => {
  try { const c=await db.collection('sms_campagnes').find({}).toArray(); res.json({totalCampagnes:c.length,totalEnvoyes:c.reduce((s,x)=>s+(x.envoyes||0),0),totalEchecs:c.reduce((s,x)=>s+(x.echecs||0),0)}); } catch(e){res.json({totalCampagnes:0,totalEnvoyes:0,totalEchecs:0});}
});
app.post('/api/sms-marketing/verify-ref', async (req,res) => {
  try {
    const {reference,telephone,smsCount}=req.body;
    if(!reference||reference.length<5) return res.json({valid:false,error:'Référence trop courte'});
    const ref=reference.toUpperCase().trim();
    const existing=await db.collection('sms_refs_utilisees').findOne({reference:ref});
    if(existing) return res.json({valid:false,error:'Référence déjà utilisée'});
    await db.collection('sms_refs_utilisees').insertOne({reference:ref,telephone:telephone||'',smsCount:parseInt(smsCount)||0,statut:'utilise',utiliseeAt:new Date()});
    res.json({valid:true});
  } catch(e){res.status(500).json({valid:false,error:e.message});}
});
app.get('/api/sms-marketing/refs', async (req,res) => {
  try { res.json(await db.collection('sms_refs_utilisees').find({}).sort({utiliseeAt:-1}).limit(100).toArray()); } catch(e){res.json([]);}
});
app.delete('/api/sms-marketing/refs/:ref', async (req,res) => {
  try { await db.collection('sms_refs_utilisees').deleteOne({reference:req.params.ref.toUpperCase()}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/sms-marketing/generate-code', async (req,res) => {
  try {
    const {telephone,smsCount,pack,montant,notes}=req.body;
    const code='PST-'+Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
    const expireAt=new Date(Date.now()+7*24*60*60*1000);
    await db.collection('sms_codes').insertOne({code,telephone,smsCount:parseInt(smsCount)||0,pack:pack||'',montant:parseInt(montant)||0,notes:notes||'',statut:'actif',utilise:false,createdAt:new Date(),expireAt});
    res.json({success:true,code,expireAt});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/sms-marketing/verify-code', async (req,res) => {
  try {
    const {code,telephone,smsCount}=req.body;
    if(!code) return res.status(400).json({valid:false,error:'Code requis'});
    const codeDoc=await db.collection('sms_codes').findOne({code:code.toUpperCase().trim(),statut:'actif',utilise:false,expireAt:{$gt:new Date()}});
    if(!codeDoc) return res.json({valid:false,error:'Code invalide ou expiré'});
    await db.collection('sms_codes').updateOne({code:code.toUpperCase().trim()},{$set:{utilise:true,utiliseAt:new Date(),utilisePar:telephone}});
    res.json({valid:true,smsCount:codeDoc.smsCount,pack:codeDoc.pack});
  } catch(e){res.status(500).json({valid:false,error:e.message});}
});
app.get('/api/sms-marketing/codes', async (req,res) => {
  try { res.json(await db.collection('sms_codes').find({}).sort({createdAt:-1}).limit(100).toArray()); } catch(e){res.json([]);}
});
app.delete('/api/sms-marketing/codes/:code', async (req,res) => {
  try { await db.collection('sms_codes').updateOne({code:req.params.code},{$set:{statut:'revoque'}}); res.json({success:true}); } catch(e){res.status(500).json({error:e.message});}
});

// ═══════════════════════════════════════════════
// STREAMING / NOC / RECHARGE
// ═══════════════════════════════════════════════
app.get('/api/channels', async (req,res) => {
  try { const config=db?await db.collection('pst_stream_config').findOne({key:'channels'}):null; res.json({channels:config?config.channels:global._pst_channels||[]}); } catch(e){res.json({channels:[]});}
});
app.post('/api/channels', async (req,res) => {
  try {
    const {channels}=req.body;
    if(db) await db.collection('pst_stream_config').updateOne({key:'channels'},{$set:{channels,updatedAt:new Date()}},{upsert:true});
    else global._pst_channels=channels;
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/noc/agent/status', async (req,res) => {
  try { if(!db) return res.json({cameras:0,online:0,offline:0}); const cameras=await db.collection('cameras').find({}).toArray(); res.json({cameras:cameras.length,online:cameras.filter(c=>c.statut==='online').length,offline:cameras.filter(c=>c.statut!=='online').length}); } catch(e){res.json({cameras:0,online:0,offline:0});}
});
app.get('/api/recharge/stats', async (req,res) => {
  try { if(!db) return res.json({recharges:0,reussies:0,echecs:0,fcfa:0}); const r=await db.collection('recharges').find({}).toArray(); res.json({recharges:r.length,reussies:r.filter(x=>x.statut==='success').length,echecs:r.filter(x=>x.statut==='failed').length,fcfa:r.filter(x=>x.statut==='success').reduce((s,x)=>s+(x.montant||0),0)}); } catch(e){res.json({recharges:0,reussies:0,echecs:0,fcfa:0});}
});

// ═══════════════════════════════════════════════
// ZAMA — Bureau de change digital
// ═══════════════════════════════════════════════

// Register user
app.post('/api/zama/register', async (req,res) => {
  try {
    if(db) await db.collection('zama_users').updateOne({phone:req.body.phone},{$set:{...req.body,updated_at:new Date()}},{upsert:true});
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// KYC submission
app.post('/api/zama/kyc', async (req,res) => {
  try {
    const {user_id,doc_type,doc_num,dob,nationality,photo_recto,photo_verso,photo_selfie}=req.body;
    if(db) await db.collection('zama_users').updateOne({id:user_id},{$set:{kyc:true,kyc_pending:true,kyc_submitted_at:new Date(),kyc_data:{doc_type,doc_num,dob,nationality},kyc_photos:{recto:photo_recto||null,verso:photo_verso||null,selfie:photo_selfie||null}}},{upsert:true});
    try { await sendMail(process.env.GMAIL_USER,`🪪 KYC ZAMA — ${doc_num||user_id}`,`<h2>Nouveau KYC</h2><p>User: ${user_id}</p><p>Doc: ${doc_type} N°${doc_num}</p><p>DOB: ${dob}</p><p>Nationalité: ${nationality}</p>`); } catch(e){}
    res.json({success:true,message:'KYC soumis, vérification sous 24h'});
  } catch(e){res.status(500).json({error:e.message});}
});

// Approve KYC
app.post('/api/zama/kyc/approve', async (req,res) => {
  try {
    const token=req.headers['x-admin-token']||req.query.token;
    if(token!==(process.env.ADMIN_PASSWORD||'pst-admin-2026')) return res.status(403).json({error:'Non autorisé'});
    const {user_id,approved}=req.body;
    if(db) await db.collection('zama_users').updateOne({id:user_id},{$set:{kyc:approved,kyc_pending:false,kyc_approved:approved,kyc_reviewed_at:new Date()}});
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// Create order — adresse crypto immédiate
app.post('/api/zama/create', async (req,res) => {
  try {
    const {src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,sender_phone,message,user_id,coin}=req.body;
    if(!amount||!src_currency) return res.status(400).json({error:'Données manquantes'});
    const orderId='ZAMA-'+Date.now();
    const selectedCoin=coin||'usdt.trc20';
    const amountUSD=src_currency==='USD'?parseFloat(amount):parseFloat((amount/(rate_fcfa/606)).toFixed(2));
    const order={order_id:orderId,src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,sender_phone,message,user_id:user_id||null,status:'pending',crypto_coin:selectedCoin,created_at:new Date(),updated_at:new Date()};
    if(db) await db.collection('zama_orders').insertOne(order);
    // Générer URL de paiement via generatePayinRedirectUrlWithCustomer (SDK officiel)
    const paymentUrl=await iziGeneratePaymentUrl({
      orderId,amountUSD,coin:selectedCoin,
      acceptedCoins:['trx','usdt.trc20','usdt.bep20','btc','eth','bnb'],
      firstname:(sender_name||'Client').split(' ')[0],
      lastname:(sender_name||'ZAMA').split(' ').slice(1).join(' ')||'ZAMA',
      email:sender_email||'',
    });
    if(paymentUrl&&db) await db.collection('zama_orders').updateOne({order_id:orderId},{'$set':{payment_url:paymentUrl}});
    // Emails arrière-plan
    setImmediate(async()=>{
      try{await sendMail(process.env.GMAIL_USER,'ZAMA '+orderId,'<h2>Nouvelle commande ZAMA</h2><p>Ref: '+orderId+'</p><p>'+amount+' '+src_currency+' vers '+(net_fcfa||0).toLocaleString('fr-FR')+' FCFA</p><p>'+receiver_name+' - '+receiver_phone+'</p>'+(paymentUrl?'<p><a href="'+paymentUrl+'">Lien paiement izichange</a></p>':''));}catch(e){}
      if(sender_email){try{await sendMail(sender_email,'ZAMA Confirmation REF: '+orderId,'<div style="font-family:Arial;padding:24px"><h2 style="color:#F59E0B">ZAMA - Confirmation</h2><p>Bonjour '+sender_name+',</p><p>Ref: <strong>'+orderId+'</strong></p><p>Vous envoyez <strong>'+amount+' '+src_currency+'</strong></p><p>Destinataire recoit <strong style="color:#F59E0B">'+(net_fcfa||0).toLocaleString('fr-FR')+' FCFA</strong></p><p style="color:#F59E0B">ZAMA by PST Telecom</p></div>');}catch(e){}}
    });
    res.json({success:true,order_id:orderId,net_fcfa,payment_url:paymentUrl||('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402?memo=ZAMA-'+orderId)});
  } catch(e){console.error('[ZAMA create]',e.message); res.status(500).json({error:e.message});}
});
// Récupérer adresse crypto
app.post('/api/zama/get-address', async (req,res) => {
  try {
    const {coin,orderId}=req.body;
    if(!coin) return res.status(400).json({error:'coin requis'});
    const result=await iziGetAddress(coin);
    if(!result) return res.status(503).json({error:'Adresse indisponible'});
    if(orderId&&db) await db.collection('zama_orders').updateOne({order_id:orderId},{'$set':{crypto_address:result.address,crypto_coin:coin}});
    res.json({success:true,address:result.address,coin});
  } catch(e){res.status(500).json({error:e.message});}
});

// Historique réceptions d'un user
app.get('/api/zama/recv-history/:userId', async (req,res) => {
  try {
    if(!db) return res.json([]);
    const orders = await db.collection('zama_recv').find({user_id:req.params.userId}).sort({created_at:-1}).limit(20).toArray();
    res.json(orders.map(o=>{const{_id,...r}=o;return r;}));
  } catch(e){res.json([]);}
});

// Route sign — calcule signature HMAC sans exposer la secretKey au client
app.post('/api/zama/sign', (req,res) => {
  try {
    const {coin}=req.body;
    if(!coin) return res.status(400).json({error:'coin requis'});
    const key=process.env.IZIPAY_SECRET_KEY||'kRx1HjF(WLp6BJ0FZ:Ty{#NmO0=9%fWO46]4A3k}';
    const signature=crypto.createHmac('sha256',key).update('coin='+coin).digest('hex');
    res.json({success:true,signature});
  } catch(e){res.status(500).json({error:e.message});}
});

// Route save-address — sauvegarde adresse générée côté client
app.post('/api/zama/save-address', async (req,res) => {
  try {
    const {orderId,address,coin}=req.body;
    if(orderId&&db) await db.collection('zama_orders').updateOne({order_id:orderId},{'$set':{crypto_address:address,crypto_coin:coin}});
    res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// Status
app.get('/api/zama/status/:orderId', async (req,res) => {
  try {
    if(!db) return res.json({status:'pending',order_id:req.params.orderId});
    const order=await db.collection('zama_orders').findOne({order_id:req.params.orderId});
    if(!order) return res.json({status:'not_found'});
    const {_id,...safe}=order; res.json(safe);
  } catch(e){res.status(500).json({error:e.message});}
});

// IPN Webhook
app.post('/api/zama/ipn', async (req,res) => {
  try {
    const payload=req.body;
    console.log('[ZAMA IPN]',JSON.stringify(payload));
    const memo=payload.memo||payload.data?.memo||'';
    const orderId=memo.includes('ZAMA-')?memo.replace('ZAMA-','').trim():null;
    const status=(payload.status||payload.data?.status||'').toLowerCase();
    const isPaid=['completed','confirmed','paid','success'].includes(status);
    if(isPaid&&orderId&&db){
      const order=await db.collection('zama_orders').findOne({order_id:orderId});
      if(order&&order.status==='pending'){
        await db.collection('zama_orders').updateOne({order_id:orderId},{$set:{status:'paid',paid_at:new Date(),ipn_data:payload}});
        try { await sendMail(process.env.GMAIL_USER,`✅ PAIEMENT REÇU — ${orderId}`,`<h2 style="color:green">✅ Paiement confirmé!</h2><p><strong>Ref:</strong> ${orderId}</p><p><strong>Montant:</strong> ${order.amount} ${order.src_currency}</p><p><strong>Destinataire reçoit:</strong> ${(order.net_fcfa||0).toLocaleString('fr-FR')} FCFA</p><p><strong>Destinataire:</strong> ${order.receiver_name} · ${order.receiver_phone}</p><p style="color:red;font-weight:bold">⚡ ACTION: Envoyer ${(order.net_fcfa||0).toLocaleString('fr-FR')} FCFA sur ${order.receiver_phone} via ${order.receiver_mm==='wave'?'Wave':'Orange Money'}</p>`); } catch(e){}
        try { const at=getAT(); if(at){ const phone=order.receiver_phone.startsWith('+')?order.receiver_phone:'+221'+order.receiver_phone; await at.SMS.send({to:[phone],message:`ZAMA: Vous allez recevoir ${(order.net_fcfa||0).toLocaleString()} FCFA via ${order.receiver_mm==='wave'?'Wave':'Orange Money'}. Ref: ${orderId}. PST +221771520959`,from:'PST'}); } } catch(e){}
      }
    }
    res.json({received:true,order_id:orderId});
  } catch(e){res.status(500).json({error:e.message});}
});

// Redirections
app.get('/api/zama/pay-success', async (req,res) => {
  const {order}=req.query;
  if(order&&db) await db.collection('zama_orders').updateOne({order_id:order},{$set:{status:'paid',paid_at:new Date()}}).catch(()=>{});
  res.redirect(`${BASE_URL}/zama?paid=${order}`);
});
app.get('/api/zama/pay-cancel',  (req,res) => res.redirect(`${BASE_URL}/zama?cancelled=${req.query.order}`));
app.get('/api/zama/pay-failed',  (req,res) => res.redirect(`${BASE_URL}/zama?failed=${req.query.order}`));

// Admin orders
app.get('/api/zama/orders', async (req,res) => {
  try { if(!db) return res.json([]); const orders=await db.collection('zama_orders').find({}).sort({created_at:-1}).limit(200).toArray(); res.json(orders.map(o=>{const{_id,...r}=o;return r;})); } catch(e){res.status(500).json({error:e.message});}
});

// History by user
app.get('/api/zama/history/:userId', async (req,res) => {
  try { if(!db) return res.json([]); const orders=await db.collection('zama_orders').find({user_id:req.params.userId}).sort({created_at:-1}).limit(20).toArray(); res.json(orders.map(o=>{const{_id,...r}=o;return r;})); } catch(e){res.status(500).json({error:e.message});}
});

// Users
app.get('/api/zama/users', async (req,res) => {
  try { if(!db) return res.json([]); const users=await db.collection('zama_users').find({}).sort({created:-1}).limit(200).toArray(); res.json(users.map(u=>{const{_id,...r}=u;delete r.password;return r;})); } catch(e){res.status(500).json({error:e.message});}
});

// KYC pending
app.get('/api/zama/kyc/pending', async (req,res) => {
  try { if(!db) return res.json([]); const users=await db.collection('zama_users').find({kyc_pending:true}).sort({kyc_submitted_at:-1}).toArray(); res.json(users.map(u=>{const{_id,...r}=u;delete r.password;return r;})); } catch(e){res.status(500).json({error:e.message});}
});

// Contact
app.post('/api/zama/contact', async (req,res) => {
  try { const {name,email,message}=req.body; await sendMail(process.env.GMAIL_USER,`📩 Contact ZAMA de ${name}`,`<h3>${name} (${email})</h3><p>${message}</p>`); res.json({success:true}); }
  catch(e){res.status(500).json({error:e.message});}
});

// ─── DÉMARRAGE ──────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 PST — Pure Smart Telecom`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`💾 MongoDB: ${db ? 'connecté' : 'mode mémoire'}\n`);
  });
});
