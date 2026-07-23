const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
// ── En-têtes de sécurité HTTP (Couche 1) ──
app.use(function(_secReq, _secRes, _secNext){
  _secRes.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  _secRes.setHeader('X-Content-Type-Options', 'nosniff');
  _secRes.setHeader('X-Frame-Options', 'SAMEORIGIN');
  _secRes.setHeader('Referrer-Policy', 'no-referrer');
  _secRes.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  _secNext();
});
// ── Anti-abus / rate-limiting (Couche 3) — tolérant au partage d'IP (CGNAT) ──
const _rlMap = new Map();
function _rlIp(req){ return String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(); }
app.use(function(req, res, next){
  try{
    var pth = req.path || req.url || '';
    if (req.method === 'OPTIONS') return next();
    if (pth.indexOf('/socket.io') === 0) return next();
    var ip = _rlIp(req); var now = Date.now();
    var e = _rlMap.get(ip);
    if (!e || now - e.ws > 60000) { e = { ws: now, n: 0, a: 0 }; }
    e.n++;
    var isAuth = pth.indexOf('/api/penc/auth/') === 0 && req.method === 'POST';
    if (isAuth) e.a++;
    _rlMap.set(ip, e);
    if (_rlMap.size > 20000){ for (var k of _rlMap.keys()){ var v=_rlMap.get(k); if (now - v.ws > 60000) _rlMap.delete(k); } }
    if (isAuth && e.a > 30){ return res.status(429).json({ error: '🚫 Trop de tentatives. Réessaie dans une minute.' }); }
    if (e.n > 3000){ return res.status(429).json({ error: '🚫 Trop de requêtes. Réessaie dans une minute.' }); }
  }catch(_e){}
  next();
});

// ── Socket.io init (Penc temps réel) ──────────────────────
const http = require('http');
const { Server: IOServer } = require('socket.io');
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Reglages adaptes a un grand nombre de connexions simultanees : evite de garder des sockets
  // fantomes ouverts trop longtemps (chaque connexion inactive consomme de la memoire serveur).
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 2e6, // 2MB — evite qu'un client envoie des paquets socket enormes
  transports: ['websocket', 'polling']
});
// ══════════════ MISE À L'ÉCHELLE HORIZONTALE (Redis adapter) ══════════════
// Sans ceci, Socket.io ne fonctionne que sur UN SEUL serveur : deux instances de Penc
// ne peuvent pas se voir entre elles (message envoyé sur l'instance A jamais recu par
// quelqu'un connecte sur l'instance B). Le Redis adapter resout ca en partageant les
// evenements entre toutes les instances via Redis pub/sub.
// N'affecte RIEN si REDIS_URL n'est pas configuree (fonctionne exactement comme avant,
// en mode un seul serveur) — donc aucun risque a deployer ce changement des maintenant.
(async function _setupScaling(){
  const REDIS_URL = process.env.REDIS_URL;
  if(!REDIS_URL){
    console.log('[scaling] REDIS_URL non configuree — Penc tourne en mode "un seul serveur" (OK pour du trafic modere, mais ne peut PAS etre duplique sur plusieurs instances tant que ce n\'est pas ajoute)');
    return;
  }
  try{
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[scaling] Redis adapter actif — Penc peut maintenant tourner sur plusieurs instances en parallele');
  }catch(e){
    console.log('[scaling] Echec de connexion Redis (Penc continue en mode un seul serveur):', e.message);
  }
})();



app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.get('/ping', function(req,res){ res.set('Cache-Control','no-store'); res.status(200).type('text/plain').send('pong'); });
// ══ Sante / monitoring de charge : nombre de connexions temps reel + etat du pool BD ══
app.get('/health', function(req,res){
  try{
    var sockCount = (io && io.engine) ? io.engine.clientsCount : 0;
    var meetCount = (typeof _meetRooms!=='undefined') ? Object.keys(_meetRooms).length : 0;
    var pgStats = _pgPool ? { total: _pgPool.totalCount, idle: _pgPool.idleCount, waiting: _pgPool.waitingCount } : null;
    res.json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      socket_connections: sockCount,
      active_meetings: meetCount,
      db_pool: pgStats,
      redis_scaling: !!process.env.REDIS_URL
    });
  }catch(e){ res.status(500).json({ status:'error', error:e.message }); }
});
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
// ─── PWA — SW + manifest avec headers corrects ───────────────────────────────
app.get('/sw.js',(req,res)=>{ res.set({'Service-Worker-Allowed':'/','Cache-Control':'no-cache','Content-Type':'application/javascript'}); res.sendFile(require('path').join(__dirname,'sw.js')); });
app.get('/penc-manifest.json',(req,res)=>{ res.set({'Cache-Control':'no-cache','Content-Type':'application/manifest+json'}); res.sendFile(require('path').join(__dirname,'penc-manifest.json')); });

app.use(express.static(path.join(__dirname)));
const zamaOtpStore = {}; // OTP store ZAMA
app.get('/xlsx.js', (req, res) => { res.sendFile(require('path').join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')); });

// ─── CONFIG ────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://tpaseny_db_user:PstMongo2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0';
const AT_API_KEY       = process.env.AT_API_KEY;
const AT_USERNAME      = process.env.AT_USERNAME || 'sandbox';
// ─── ZAMA get-address (pour écran Recevoir) ───────────────
app.post('/api/zama/get-address', async (req, res) => {
  try {
    const { coin, orderId } = req.body;
    if (!coin) return res.status(400).json({ error: 'coin requis' });
    const meta = COIN_MAP && COIN_MAP[coin] ? COIN_MAP[coin] : { label: coin, network: coin };
    // Essayer adresse directe izichangePay
    let address = null;
    try {
      const iziResp = await iziGetAddress(coin);
      address = (iziResp && (iziResp.address || (iziResp.data && iziResp.data.address))) || null;
    } catch(e) {
      console.warn('[ZAMA get-address] iziGetAddress failed:', e.message);
    }
    if (address) {
      return res.json({ address, coin, network: meta.network || coin, label: meta.label || coin });
    }
    // Fallback: retourner POS URL comme redirect
    const posUrl = IZIPAY_POS + '?memo=' + (orderId || ('RECV-' + Date.now())) + '&coin=' + coin;
    return res.json({ address: null, redirect_url: posUrl, coin, label: meta.label || coin });
  } catch(e) {
    console.error('[ZAMA get-address]', e.message);
    res.status(500).json({ error: e.message });
  }
});


const PORT             = process.env.PORT || 3001;
const IZIPAY_API_KEY   = process.env.IZIPAY_API_KEY || '14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680';
const IZIPAY_IPN_SECRET = process.env.IZIPAY_IPN_SECRET || 'Pstdiama@1';
const IZIPAY_BASE      = 'https://pay.izichange.com/api';
const IZIPAY_POS       = 'https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402';

const COIN_MAP = {
  'usdt.trc20':  { coin: 'USDT', network: 'TRC20',  label: 'USDT TRC20'  },
  'usdt.bep20':  { coin: 'USDT', network: 'BEP20',  label: 'USDT BEP20'  },
  'usdt.erc20':  { coin: 'USDT', network: 'ERC20',  label: 'USDT ERC20'  },
  'usdt.ton':    { coin: 'USDT', network: 'TON',    label: 'USDT TON'    },
  'usdc.trc20':  { coin: 'USDC', network: 'TRC20',  label: 'USDC TRC20'  },
  'usdc.bep20':  { coin: 'USDC', network: 'BEP20',  label: 'USDC BEP20'  },
  'usdc.erc20':  { coin: 'USDC', network: 'ERC20',  label: 'USDC ERC20'  },
};

let db;
let client;

// ─── MongoDB ───────────────────────────────────────────────
async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return null; }
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("OK MongoDB Atlas connecte");
    return client.db('pst_telecom');
  } catch(err) { console.error("ERREUR MongoDB:", err.message); return null; }
}

// ══ CORS ══
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══ SEN-SMS AUTH ══
function senSmsAuth(req, res, next) {
  var token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Non authentifie' });
  try {
    var decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3');
    req.senSmsUser = decoded;
    next();
  } catch(e) { return res.status(401).json({ success: false, error: 'Token invalide' }); }
}


// ─── izichangePay helpers ──────────────────────────────────
function iziHeaders() {
  return { "Content-Type": "application/json", "Accept": "application/json", "X-API-KEY": IZIPAY_API_KEY };
}

async function createIziOrder({ coin_key, amount_usd, order_id, callback_url }) {
  const meta = COIN_MAP[coin_key] || COIN_MAP["usdt.trc20"];
  const body = { currency: meta.coin + "." + meta.network.toLowerCase(), order_id: order_id, amount: parseFloat(amount_usd).toFixed(2), description: "ZAMA Transfer " + order_id, callback_url };
  const resp = await fetch(IZIPAY_BASE + "/deposit/address", { method: "POST", headers: iziHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) { const err = await resp.text(); throw new Error("izichangePay: " + resp.status + " " + err); }
  return resp.json();
}

async function getIziOrder(izi_id) {
  const resp = await fetch(IZIPAY_BASE + "/transaction/" + izi_id, { headers: iziHeaders() });
  if (!resp.ok) throw new Error("izichangePay status: " + resp.status);
  return resp.json();
}

// ─── izichangePay legacy (pour /api/zama/create) ──────────
async function generateIziPayUrl({ amount, orderId, senderName, senderEmail }) {
  const baseUrl = "https://pst-telecom-production.up.railway.app";
  const toSign = {
    coin: "trx",
    acceptedCoins: ["trx", "usdt.trc20", "usdt.bep20", "btc", "eth", "bnb"],
    amount: String(amount),
    successUrl: baseUrl + "/api/zama/pay-success?order=" + orderId,
    canceledUrl: baseUrl + "/api/zama/pay-cancel?order=" + orderId,
    failedUrl: baseUrl + "/api/zama/pay-failed?order=" + orderId,
  };
  const str = Object.entries(toSign).map(([k,v]) => k + "=" + (Array.isArray(v) ? v.join("") : v)).join("");
  const signature = crypto.createHmac("sha256", IZIPAY_IPN_SECRET).update(str).digest("hex");
  const data = { ...toSign, firstname: (senderName||"").split(" ")[0]||"Client", lastname: (senderName||"").split(" ").slice(1).join(" ")||"", email: senderEmail||"", memo: orderId };
  try {
    const resp = await fetch("https://pay.izichange.com/api/payements/init_operation_with_customer_data", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": IZIPAY_API_KEY, "x-signature": signature }, body: JSON.stringify(data) });
    return resp.json();
  } catch(e) {
    return { url: IZIPAY_POS + "?memo=" + orderId };
  }
}

// ─── Africa's Talking ─────────────────────────────────────
function getAT() {
  if (!AT_API_KEY) return null;
  try { const AT = require("africastalking"); return AT({ apiKey: AT_API_KEY, username: AT_USERNAME }); }
  catch { return null; }
}

// ─── Helpers abonnés ──────────────────────────────────────
const FORFAITS = {
  starter:  { nom: "Starter",  minutes: 200,   prix: 2990  },
  smart:    { nom: "Smart",    minutes: 300,   prix: 5990  },
  business: { nom: "Business", minutes: 99999, prix: 15990 },
};
function genUserId() { return "PST-" + Math.random().toString(16).slice(2,10).toUpperCase(); }
function genNumero() {
  const p = ["77","78","76","70"][Math.floor(Math.random()*4)];
  const n = Math.floor(Math.random()*9000000)+1000000;
  return "+221 " + p + " " + String(n).slice(0,3) + " " + String(n).slice(3,5) + " " + String(n).slice(5);
}
async function getAbonnes() { if (db) return db.collection("abonnes").find({}).sort({createdAt:-1}).lean(); return global._abonnes||[]; }
async function saveAbonne(a) { if (db) await db.collection("abonnes").insertOne(a); else { global._abonnes=global._abonnes||[]; global._abonnes.push(a); } }
async function updateAbonne(userId, update) { if (db) await db.collection("abonnes").updateOne({userId},{$set:update}); else { global._abonnes=(global._abonnes||[]).map(a=>a.userId===userId?{...a,...update}:a); } }
async function deleteAbonne(userId) { if (db) await db.collection("abonnes").deleteOne({userId}); else { global._abonnes=(global._abonnes||[]).filter(a=>a.userId!==userId); } }

function normalizePhone(p) { let n=(p||"").replace(/\s/g,"").replace(/[^\d]/g,""); if(n.startsWith("221"))n=n.slice(3); return n; }

// ─── Auth admin ────────────────────────────────────────────
const SUPER_ADMINS = ["tpapaseny@ept.sn","papasenytoure@gmail.com"];
function authAdmin(req, res, next) {
  const token = req.query.token || req.headers["x-admin-token"];
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Pstdiama@1";
  if (token !== ADMIN_PASSWORD) {
    return res.send("<!DOCTYPE html><html><head><meta charset=UTF-8><title>PST Admin</title><style>body{font-family:sans-serif;background:#0d2137;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center}.box{background:#111c2a;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:2rem;width:320px;text-align:center}.logo{font-size:2rem;font-weight:900;color:#00c864;margin-bottom:.5rem}input{width:100%;padding:.85rem;background:#0d2137;border:1.5px solid rgba(255,255,255,.1);border-radius:8px;color:white;font-size:1rem;outline:none;margin-bottom:1rem}.btn{width:100%;padding:.85rem;background:#00c864;color:#0d2137;border:none;border-radius:8px;font-weight:700;cursor:pointer}</style></head><body><div class=box><div class=logo>PST</div><input type=password id=p placeholder=Mot de passe><button class=btn onclick=\"location.href='/admin?token='+p.value\">OK</button></div></body></html>");
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// ROUTES GENERALES
// ═══════════════════════════════════════════════════════════

// Routes pages HTML
app.get("/zama", (req,res) => res.sendFile(path.join(__dirname,"zama.html")));
app.get("/recharge", (req,res) => res.sendFile(path.join(__dirname,"recharge.html")));
app.get("/noc", (req,res) => res.sendFile(path.join(__dirname,"noc.html")));
app.get("/trax", (req,res) => res.sendFile(path.join(__dirname,"pst-trax.html")));
app.get("/transfer", (req,res) => res.sendFile(path.join(__dirname,"transfer.html")));

app.get("/admin", authAdmin, (req,res) => res.sendFile(path.join(__dirname,"admin.html")));
app.get("/sms-marketing", (req,res) => res.sendFile(path.join(__dirname,"sms-marketing.html")));
app.get("/sen-sms", (req,res) => res.sendFile(path.join(__dirname,"sen-sms.html")));
app.get("/appel", (req,res) => res.sendFile(path.join(__dirname,"appel.html")));
app.get("/dashboard", (req,res) => res.sendFile(path.join(__dirname,"dashboard.html")));
app.get("/sms", (req,res) => res.sendFile(path.join(__dirname,"sms.html")));
app.get("/streaming", (req,res) => res.sendFile(path.join(__dirname,"streaming.html")));
app.get("/recharge", (req,res) => res.sendFile(path.join(__dirname,"recharge.html")));
app.get("/noc", (req,res) => res.sendFile(path.join(__dirname,"noc.html")));
app.get("/trax", (req,res) => res.sendFile(path.join(__dirname,"pst-trax.html")));
app.get("/trax-driver", (req,res) => res.sendFile(path.join(__dirname,"pst-trax-driver.html")));
app.get("/zama", (req,res) => res.sendFile(path.join(__dirname,"zama.html")));
app.get("/sensms", (req,res) => res.sendFile(path.join(__dirname,"sensms.html")));
app.get("/senbet", (req,res) => res.sendFile(path.join(__dirname,"senbet.html")));
app.get("/zamin", (req,res) => res.sendFile(path.join(__dirname,"zamin.html")));
app.get("/crypto-admin", (req,res) => res.sendFile(path.join(__dirname,"crypto-dashboard.html")));
app.get("/izipay-widget.js", (req,res) => res.sendFile(path.join(__dirname,"izipay-widget.js")));

// ═══════════════════════════════════════════════════════════
// ROUTES NOC / RECHARGE / ADMIN STATS
// ═══════════════════════════════════════════════════════════
app.get("/api/noc/agent/status", async(req,res) => {
  try { if(!db) return res.json({cameras:0,online:0,offline:0}); const cams=await db.collection("cameras").find({}).lean(); res.json({cameras:cams.length,online:cams.filter(c=>c.statut==="online").length,offline:cams.filter(c=>c.statut!=="online").length}); }
  catch(e){res.json({cameras:0,online:0,offline:0});}
});
app.get("/api/recharge/stats", async(req,res) => {
  try { if(!db) return res.json({recharges:0,reussies:0,echecs:0,fcfa:0}); const r=await db.collection("recharges").find({}).lean(); res.json({recharges:r.length,reussies:r.filter(x=>x.statut==="success").length,echecs:r.filter(x=>x.statut==="failed").length,fcfa:r.filter(x=>x.statut==="success").reduce((s,x)=>s+(x.montant||0),0)}); }
  catch(e){res.json({recharges:0,reussies:0,echecs:0,fcfa:0});}
});
app.get("/api/admin/stats", async(req,res) => {
  try { const a=await getAbonnes(); res.json({total:a.length,actifs:a.filter(x=>x.statut==="actif").length,attente:a.filter(x=>x.statut==="en_attente").length,revenus:a.filter(x=>x.statut==="actif").reduce((s,x)=>s+(FORFAITS[x.forfait]?.prix||0),0)}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.get("/api/admin/abonnes", async(req,res) => { try{res.json(await getAbonnes());}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/admin/users", async(req,res) => { try{if(!db)return res.json([]); res.json(await db.collection("abonnes").find({}).sort({createdAt:-1}).toArray());}catch(e){res.json([]);} });
app.get("/api/admin/activity", async(req,res) => { try{const l=await db.collection("activity_logs").find({}).sort({createdAt:-1}).limit(50).lean(); res.json(l.map(x=>({type:x.type,message:x.message,time:new Date(x.createdAt).toLocaleTimeString("fr-FR")})));}catch(e){res.json([]);} });

// ═══════════════════════════════════════════════════════════
// ROUTES ABONNES
// ═══════════════════════════════════════════════════════════
app.post("/api/auth/register", async(req,res) => {
  try {
    const {nom,prenom,telephone,forfait="smart"}=req.body;
    if(!nom||!telephone) return res.status(400).json({error:"Nom et telephone obligatoires"});
    const f=FORFAITS[forfait]||FORFAITS.smart;
    const abonne={userId:genUserId(),nom,prenom,telephone,forfait,forfaitNom:f.nom,minutes:f.minutes,minutesUsees:0,prix:f.prix,numeroVirtuel:genNumero(),statut:"en_attente",createdAt:new Date(),updatedAt:new Date(),paiements:[]};
    await saveAbonne(abonne);
    const at=getAT(); if(at){try{await at.SMS.send({to:telephone,message:"Bienvenue PST! Forfait "+f.nom+" en cours d activation. ID: "+abonne.userId,from:"PST"});}catch(e){}}
    res.json({success:true,userId:abonne.userId,numeroVirtuel:abonne.numeroVirtuel,lienWave:"https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount="+f.prix,message:"Compte PST cree!"});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/admin/activer/:userId", async(req,res) => {
  try{await updateAbonne(req.params.userId,{statut:"actif",activatedAt:new Date(),updatedAt:new Date()}); res.json({success:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/admin/suspendre/:userId", async(req,res) => {
  try{await updateAbonne(req.params.userId,{statut:"suspendu",updatedAt:new Date()}); res.json({success:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.put("/api/admin/abonne/:userId", async(req,res) => {
  try{const{nom,prenom,telephone,forfait,minutesBonus}=req.body; const u={updatedAt:new Date()}; if(nom)u.nom=nom; if(prenom)u.prenom=prenom; if(telephone)u.telephone=telephone; if(forfait&&FORFAITS[forfait]){u.forfait=forfait;u.forfaitNom=FORFAITS[forfait].nom;u.prix=FORFAITS[forfait].prix;u.minutes=FORFAITS[forfait].minutes;} if(minutesBonus&&db){await db.collection("abonnes").updateOne({userId:req.params.userId},{$inc:{minutes:parseInt(minutesBonus)},$set:u});}else{await updateAbonne(req.params.userId,u);} res.json({success:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.delete("/api/admin/abonne/:userId", async(req,res) => {
  try{await deleteAbonne(req.params.userId); res.json({success:true});}
  catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/admin/login", (req,res) => {
  const{email,password}=req.body;
  if(!email||!password) return res.status(400).json({error:"Email et mot de passe requis"});
  if(password!==(process.env.ADMIN_PASSWORD||"Pstdiama@1")) return res.status(403).json({error:"Mot de passe incorrect"});
  res.json({success:true,role:SUPER_ADMINS.includes(email.toLowerCase())?"super":"admin",name:email.split("@")[0]});
});

// ═══════════════════════════════════════════════════════════
// ROUTES APPELS VONAGE
// ═══════════════════════════════════════════════════════════
app.post("/api/appel/initier", async(req,res) => {
  try {
    const{userId,numeroDestination}=req.body;
    const abonnes=await getAbonnes(); const abonne=abonnes.find(a=>a.userId===userId);
    if(!abonne) return res.status(404).json({error:"Abonne introuvable"});
    if(abonne.statut!=="actif") return res.status(403).json({error:"Forfait non actif"});
    const VK=process.env.VONAGE_API_KEY; const VS=process.env.VONAGE_API_SECRET;
    if(VK&&VS){try{const to=numeroDestination.replace(/\s/g,""); const cred=Buffer.from(VK+":"+VS).toString("base64"); const r=await fetch("https://api.nexmo.com/v1/calls",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic "+cred},body:JSON.stringify({to:[{type:"phone",number:to}],from:{type:"phone",number:process.env.VONAGE_NUMBER||"12345678901"},ncco:[{action:"talk",text:"Appel PST",language:"fr-FR"}]})}); if(r.ok){const d=await r.json(); return res.json({success:true,callId:d.uuid||"VNG-"+Date.now(),type:"real"});}}catch(e){}}
    res.json({success:true,callId:"CALL-DEMO-"+Math.random().toString(16).slice(2,8).toUpperCase(),type:"sandbox"});
  }catch(e){res.status(500).json({error:e.message});}
});



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

// ═══════════════════════════════════════════════════════════
// ROUTES SMS VERIFICATION (5SIM)
// ═══════════════════════════════════════════════════════════
const SMS_PACKS={pack1:{points:5,prix:1000,label:"5 points"},pack2:{points:12,prix:2000,label:"12 points"},pack3:{points:30,prix:4500,label:"30 points"},pack4:{points:70,prix:9000,label:"70 points"}};
function getServiceLogo(id){const k=id.toLowerCase().replace(/[^a-z0-9_]/g,""); const logos={uber:"uber.com",instagram:"instagram.com",google:"google.com",facebook:"facebook.com",whatsapp:"whatsapp.com",telegram:"telegram.org",tiktok:"tiktok.com",twitter:"twitter.com",snapchat:"snapchat.com",microsoft:"microsoft.com",apple:"apple.com",amazon:"amazon.com",netflix:"netflix.com",linkedin:"linkedin.com",discord:"discord.com",chatgpt:"openai.com"}; return logos[k]?"https://logo.clearbit.com/"+logos[k]:"https://www.google.com/s2/favicons?domain="+k+".com&sz=64";}
function getServiceNom(id){const n={google:"Google/Gmail",facebook:"Facebook",instagram:"Instagram",whatsapp:"WhatsApp",telegram:"Telegram",tiktok:"TikTok",twitter:"Twitter/X",snapchat:"Snapchat",microsoft:"Microsoft",apple:"Apple",amazon:"Amazon",netflix:"Netflix",uber:"Uber",airbnb:"Airbnb",linkedin:"LinkedIn",discord:"Discord",chatgpt:"ChatGPT"}; return n[id.toLowerCase()]||(id.charAt(0).toUpperCase()+id.slice(1).replace(/_/g," "));}
let fivesimCache=null, fivesimCacheTime=0;
async function getFivesimServices(){
  const now=Date.now(); if(fivesimCache&&(now-fivesimCacheTime)<3600000)return fivesimCache;
  const KEY=process.env.FIVESIM_API_KEY; if(!KEY)return null;
  try{const r=await fetch("https://5sim.net/v1/guest/products/any/any",{headers:{"Authorization":"Bearer "+KEY,"Accept":"application/json"}}); if(!r.ok)return null; const d=await r.json(); const s=Object.entries(d).map(([id,info])=>({id,nom:getServiceNom(id),logo:getServiceLogo(id),prix_usd:info.Cost||0.01,count:info.Qty||0,prix_points:Math.max(1,Math.ceil((info.Cost||0.01)/0.04))})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count); fivesimCache=s; fivesimCacheTime=now; return s;}
  catch(e){return null;}
}
app.get("/api/sms/services", async(req,res)=>{ const l=await getFivesimServices(); if(l)return res.json(l); res.json([{id:"whatsapp",nom:"WhatsApp",icon:"💬",prix_points:1},{id:"google",nom:"Google",icon:"🔵",prix_points:1},{id:"telegram",nom:"Telegram",icon:"✈️",prix_points:1}]); });
app.get("/api/sms/packs", (req,res)=>res.json(SMS_PACKS));
app.post("/api/sms/acheter-points", async(req,res)=>{ const p=SMS_PACKS[req.body.pack]; if(!p)return res.status(400).json({error:"Pack invalide"}); res.json({success:true,lienWave:"https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount="+p.prix,pack:p}); });
app.post("/api/sms/confirmer-points", async(req,res)=>{ try{const p=SMS_PACKS[req.body.pack]; if(!p)return res.status(400).json({error:"Pack invalide"}); if(db)await db.collection("abonnes").updateOne({userId:req.body.userId},{$inc:{pointsSMS:p.points},$push:{historiquePoints:{type:"achat",points:p.points,pack:req.body.pack,date:new Date()}}}); res.json({success:true,pointsAjoutes:p.points});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/sms/demander-numero", async(req,res)=>{ try{const{userId,serviceId}=req.body; const KEY=process.env.FIVESIM_API_KEY; if(KEY){try{const r=await fetch("https://5sim.net/v1/user/buy/activation/any/any/"+serviceId,{headers:{"Authorization":"Bearer "+KEY,"Accept":"application/json"}}); if(r.ok){const d=await r.json(); const actId="FSIM-"+d.id; const exp=new Date(Date.now()+20*60*1000); if(db)await db.collection("abonnes").updateOne({userId},{$inc:{pointsSMS:-1},$push:{activationsSMS:{activationId:actId,fivesimId:d.id,serviceId,numeroTemp:d.phone,expireAt:exp,statut:"en_attente",smsRecu:null,createdAt:new Date()}}}); return res.json({success:true,activationId:actId,numeroTemp:d.phone,expireAt:exp});}}catch(e){}} const num="+1"+Math.floor(2000000000+Math.random()*8000000000); const aId="ACT-"+Math.random().toString(36).slice(2,10).toUpperCase(); const exp=new Date(Date.now()+20*60*1000); if(db)await db.collection("abonnes").updateOne({userId},{$inc:{pointsSMS:-1},$push:{activationsSMS:{activationId:aId,serviceId,numeroTemp:num,expireAt:exp,statut:"en_attente",smsRecu:null,createdAt:new Date()}}}); res.json({success:true,activationId:aId,numeroTemp:num,expireAt:exp});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/sms/verifier/:activationId", async(req,res)=>{ try{if(!db)return res.json({statut:"en_attente",smsRecu:null}); const{userId}=req.query; const abonne=await db.collection("abonnes").findOne({userId}); if(!abonne)return res.status(404).json({error:"Abonne introuvable"}); const act=(abonne.activationsSMS||[]).find(a=>a.activationId===req.params.activationId); if(!act)return res.status(404).json({error:"Activation introuvable"}); if(act.smsRecu)return res.json({statut:"recu",smsRecu:act.smsRecu}); const KEY=process.env.FIVESIM_API_KEY; if(KEY&&act.fivesimId){try{const r=await fetch("https://5sim.net/v1/user/check/"+act.fivesimId,{headers:{"Authorization":"Bearer "+KEY,"Accept":"application/json"}}); if(r.ok){const d=await r.json(); if(d.sms&&d.sms.length>0){const txt=d.sms[0].text; await db.collection("abonnes").updateOne({userId,"activationsSMS.activationId":req.params.activationId},{$set:{"activationsSMS.$.smsRecu":txt,"activationsSMS.$.statut":"recu"}}); return res.json({statut:"recu",smsRecu:txt});}}}catch(e){}} res.json({statut:act.statut,smsRecu:null});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/sms/inscription", async(req,res)=>{ try{const{nom,telephone}=req.body; if(!nom||!telephone)return res.status(400).json({error:"Donnees manquantes"}); if(db){const ex=await db.collection("comptes_sms").findOne({telephone}); if(ex)return res.json({success:true,userId:ex.userId,nouveau:false});} const userId="SMS-"+Math.random().toString(16).slice(2,10).toUpperCase(); if(db)await db.collection("comptes_sms").insertOne({userId,nom,telephone,pointsSMS:0,type:"sms_only",createdAt:new Date(),activationsSMS:[],historiquePoints:[]}); res.json({success:true,userId,nouveau:true});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/sms/connexion", async(req,res)=>{ try{if(!db)return res.status(503).json({error:"DB indisponible"}); const{userId,telephone}=req.body; let c=await db.collection("comptes_sms").findOne({userId,telephone}); if(!c)c=await db.collection("abonnes").findOne({userId,telephone}); if(!c)return res.status(404).json({error:"Compte introuvable"}); res.json({success:true,compte:c});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/sms/compte/:userId", async(req,res)=>{ try{if(!db)return res.status(503).json({error:"DB indisponible"}); let c=await db.collection("comptes_sms").findOne({userId:req.params.userId})||await db.collection("abonnes").findOne({userId:req.params.userId}); if(!c)return res.status(404).json({error:"Compte introuvable"}); res.json({userId:c.userId,nom:c.nom,pointsSMS:c.pointsSMS||0});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES SMS MARKETING
// ═══════════════════════════════════════════════════════════
app.post("/api/sms-marketing/send", async(req,res)=>{ try{const{campagne,messages,sender,scheduled}=req.body; if(!messages||!messages.length)return res.status(400).json({error:"Aucun message"}); const senderName=sender||"PST-Telecom";
  const camp={campagne:campagne||"Campagne SMS",sender:senderName,total:messages.length,envoyes:0,echecs:0,statut:scheduled?"planifie":"en_cours",scheduledAt:scheduled?new Date(scheduled):null,createdAt:new Date()}; const result=await db.collection("sms_campagnes").insertOne(camp); if(scheduled){await db.collection("sms_campagnes").updateOne({_id:result.insertedId},{$set:{messages,statut:"planifie"}}); return res.json({success:true,statut:"planifie"});}
  // Envoi via Infobip
  let envoyes=0,echecs=0;
  for(const msg of messages){
    try{
      const ph=msg.telephone.startsWith("+")?msg.telephone:"+221"+msg.telephone;
      const r=await fetch(INFOBIP_BASE_URL+"/sms/2/text/advanced",{
        method:"POST",
        headers:{
          "Authorization":"App "+INFOBIP_API_KEY,
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify({messages:[{from:INFOBIP_SENDER,destinations:[{to:ph}],text:msg.message}]})
      });
      if(r.ok){envoyes++;}else{echecs++;}
    }catch(e){echecs++;}
  }
  await db.collection("sms_campagnes").updateOne({_id:result.insertedId},{$set:{envoyes,echecs,statut:"termine",finishedAt:new Date()}}); res.json({success:true,envoyes,echecs,total:messages.length});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/sms-marketing/campagnes", async(req,res)=>{ try{const c=await db.collection("sms_campagnes").find({},{projection:{messages:0}}).sort({createdAt:-1}).limit(50).lean(); res.json(c);}catch(e){res.json([]);} });
app.get("/api/sms-marketing/stats", async(req,res)=>{ try{const c=await db.collection("sms_campagnes").find({}).lean(); res.json({totalCampagnes:c.length,totalEnvoyes:c.reduce((s,x)=>s+(x.envoyes||0),0),totalEchecs:c.reduce((s,x)=>s+(x.echecs||0),0)});}catch(e){res.json({totalCampagnes:0,totalEnvoyes:0,totalEchecs:0});} });
app.post("/api/sms-marketing/verify-ref", async(req,res)=>{ try{const{reference,telephone,smsCount}=req.body; if(!reference||reference.length<5)return res.json({valid:false,error:"Reference trop courte"}); const ref=reference.toUpperCase().trim(); const ex=await db.collection("sms_refs_utilisees").findOne({reference:ref}); if(ex)return res.json({valid:false,error:"Reference deja utilisee"}); await db.collection("sms_refs_utilisees").insertOne({reference:ref,telephone,smsCount:parseInt(smsCount)||0,utiliseeAt:new Date()}); res.json({valid:true});}catch(e){res.status(500).json({valid:false,error:e.message});} });
app.post("/api/sms-marketing/generate-code", async(req,res)=>{ try{const{telephone,smsCount,pack,montant,notes}=req.body; const code="PST-"+Math.random().toString(36).slice(2,6).toUpperCase()+"-"+Math.random().toString(36).slice(2,6).toUpperCase(); const expireAt=new Date(Date.now()+7*24*60*60*1000); await db.collection("sms_codes").insertOne({code,telephone,smsCount:parseInt(smsCount)||0,pack:pack||"",montant:parseInt(montant)||0,notes:notes||"",statut:"actif",utilise:false,createdAt:new Date(),expireAt}); res.json({success:true,code,expireAt});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/sms-marketing/verify-code", async(req,res)=>{ try{const{code,telephone,smsCount}=req.body; if(!code)return res.status(400).json({valid:false,error:"Code requis"}); const doc=await db.collection("sms_codes").findOne({code:code.toUpperCase().trim(),statut:"actif",utilise:false,expireAt:{$gt:new Date()}}); if(!doc)return res.json({valid:false,error:"Code invalide ou expire"}); await db.collection("sms_codes").updateOne({code:code.toUpperCase().trim()},{$set:{utilise:true,utiliseAt:new Date(),utilisePar:telephone}}); res.json({valid:true,smsCount:doc.smsCount,pack:doc.pack});}catch(e){res.status(500).json({valid:false,error:e.message});} });
app.get("/api/sms-marketing/codes", async(req,res)=>{ try{res.json(await db.collection("sms_codes").find({}).sort({createdAt:-1}).limit(100).toArray());}catch(e){res.json([]);} });
app.delete("/api/sms-marketing/codes/:code", async(req,res)=>{ try{await db.collection("sms_codes").updateOne({code:req.params.code},{$set:{statut:"revoque"}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/sms-marketing/refs", async(req,res)=>{ try{res.json(await db.collection("sms_refs_utilisees").find({}).sort({utiliseeAt:-1}).limit(100).toArray());}catch(e){res.json([]);} });
app.delete("/api/sms-marketing/refs/:ref", async(req,res)=>{ try{await db.collection("sms_refs_utilisees").deleteOne({reference:req.params.ref.toUpperCase()}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES PAIEMENTS / STRIPE / FLUTTERWAVE
// ═══════════════════════════════════════════════════════════
app.get("/api/admin/payments", async(req,res)=>{ try{res.json(await db.collection("payments").find({}).sort({createdAt:-1}).toArray());}catch(e){res.json([]);} });
app.post("/api/admin/payments", async(req,res)=>{ try{const{userId,montant,moyen,type,reference,statut}=req.body; if(!userId||!montant)return res.status(400).json({error:"userId et montant requis"}); const r=await db.collection("payments").insertOne({userId,montant:parseInt(montant),moyen:moyen||"wave",type:type||"forfait",reference:reference||"",statut:statut||"en_attente",createdAt:new Date()}); res.json({success:true,id:r.insertedId});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/admin/payments/:id/validate", async(req,res)=>{ try{const pay=await db.collection("payments").findOne({_id:new ObjectId(req.params.id)}); if(!pay)return res.status(404).json({error:"Paiement introuvable"}); await db.collection("payments").updateOne({_id:new ObjectId(req.params.id)},{$set:{statut:"confirme",validatedAt:new Date()}}); await db.collection("abonnes").updateOne({userId:pay.userId},{$set:{statut:"actif",activatedAt:new Date()}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.delete("/api/admin/payments/:id", async(req,res)=>{ try{await db.collection("payments").deleteOne({_id:new ObjectId(req.params.id)}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/flutterwave/confirm", async(req,res)=>{ try{const{tx_ref,userId,transaction_id}=req.body; const FLW=process.env.FLW_SECRET_KEY; const v=await fetch("https://api.flutterwave.com/v3/transactions/"+transaction_id+"/verify",{headers:{Authorization:"Bearer "+FLW}}); const vd=await v.json(); if(vd.data&&vd.data.status==="successful"){await db.collection("payments").insertOne({userId,montant:vd.data.amount,moyen:"flutterwave_card",type:"forfait",reference:tx_ref,statut:"confirme",transaction_id,createdAt:new Date()}); await db.collection("abonnes").updateOne({userId},{$set:{statut:"actif",activatedAt:new Date()}}); res.json({success:true});}else{res.status(400).json({error:"Paiement non verifie"});}}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/flutterwave/webhook", async(req,res)=>{ try{const p=req.body; if(p.event==="charge.completed"&&p.data.status==="successful"){const userId=p.data.tx_ref.split("-")[1]; await db.collection("payments").insertOne({userId,montant:p.data.amount,moyen:"flutterwave_card",type:"forfait",reference:p.data.tx_ref,statut:"confirme",createdAt:new Date()}); await db.collection("abonnes").updateOne({userId},{$set:{statut:"actif",activatedAt:new Date()}});} res.sendStatus(200);}catch(e){res.sendStatus(500);} });
app.post("/api/paiement/stripe/creer", async(req,res)=>{ try{const{type,forfait,pack,userId,devise="usd"}=req.body; const SK=process.env.STRIPE_SECRET_KEY; if(!SK)return res.status(503).json({error:"Stripe non configure"}); const stripe=require("stripe")(SK); let montant,description,currency; if(devise==="xof"){currency="xof"; if(type==="forfait"){const f=FORFAITS[forfait]; if(!f)return res.status(400).json({error:"Forfait invalide"}); montant=f.prix; description="PST Forfait "+f.nom;}else{const p=SMS_PACKS[pack]; if(!p)return res.status(400).json({error:"Pack invalide"}); montant=p.prix; description="PST "+p.label+" SMS";}}else{currency="usd"; if(type==="forfait"){const f=FORFAITS[forfait]; if(!f)return res.status(400).json({error:"Forfait invalide"}); montant=Math.round(f.prix/600*100); description="PST Forfait "+f.nom;}else{const p=SMS_PACKS[pack]; if(!p)return res.status(400).json({error:"Pack invalide"}); montant=Math.round(p.prix/600*100); description="PST "+p.label+" SMS";}} const session=await stripe.checkout.sessions.create({payment_method_types:["card"],line_items:[{price_data:{currency,product_data:{name:description},unit_amount:montant},quantity:1}],mode:"payment",success_url:"https://pst-telecom-production.up.railway.app/dashboard?paiement=success&ref="+userId,cancel_url:"https://pst-telecom-production.up.railway.app/dashboard?paiement=cancel",metadata:{userId,type,forfait:forfait||"",pack:pack||""}}); res.json({success:true,url:session.url,sessionId:session.id});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/webhook/stripe", express.raw({type:"application/json"}), async(req,res)=>{ const sig=req.headers["stripe-signature"]; const SK=process.env.STRIPE_SECRET_KEY; if(!SK)return res.json({received:true}); try{const stripe=require("stripe")(SK); let event; if(process.env.STRIPE_WEBHOOK_SECRET){event=stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);}else{event=JSON.parse(req.body);} if(event.type==="checkout.session.completed"){const s=event.data.object; const{userId,type,forfait,pack}=s.metadata; if(type==="forfait"&&userId)await updateAbonne(userId,{statut:"actif",activatedAt:new Date(),updatedAt:new Date()}); else if(type==="sms"&&pack&&userId){const p=SMS_PACKS[pack]; if(p&&db)await db.collection("abonnes").updateOne({userId},{$inc:{pointsSMS:p.points}});}} res.json({received:true});}catch(e){res.status(400).json({error:e.message});} });
app.post("/api/webhook/wave", async(req,res)=>{ try{const{amount,client_reference}=req.body; if(client_reference)await updateAbonne(client_reference,{statut:"actif",activatedAt:new Date(),updatedAt:new Date(),paiementWave:{amount,date:new Date()}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES PST STREAM
// ═══════════════════════════════════════════════════════════
app.get("/api/channels", async(req,res)=>{ try{if(!db)return res.json({channels:global._pst_channels||[]}); const c=await db.collection("pst_stream_config").findOne({key:"channels"}); res.json({channels:c?c.channels:[]});}catch(e){res.json({channels:[]});} });
app.post("/api/channels", async(req,res)=>{ try{const{channels}=req.body; if(!db){global._pst_channels=channels; return res.json({success:true});} await db.collection("pst_stream_config").updateOne({key:"channels"},{$set:{channels,updatedAt:new Date()}},{upsert:true}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES PST-TRAX
// ═══════════════════════════════════════════════════════════
app.post("/api/trax/register", async(req,res)=>{ try{const{name,phone,role,vid,vType,password}=req.body; if(!phone||!name)return res.status(400).json({error:"Donnees manquantes"}); const np=normalizePhone(phone); if(db){const ex=await db.collection("trax_users").findOne({$or:[{phone:np},{phone:"+221"+np}]}); if(ex)return res.status(409).json({exists:true,error:"Numero deja inscrit"}); const user={id:"U-"+Date.now(),name,phone:np,role,password:password||"",vid:vid||null,typeLabel:vType&&vType.label||null,typeIcon:vType&&vType.icon||null,createdAt:new Date()}; await db.collection("trax_users").insertOne(user); return res.json({success:true,user:{id:user.id,name:user.name,phone:user.phone,role:user.role,vid:user.vid,typeLabel:user.typeLabel}});} res.json({success:true,user:{id:"U-"+Date.now(),name,phone:np,role,vid}});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/trax/login", async(req,res)=>{ try{const{phone,password}=req.body; if(!phone)return res.status(400).json({error:"Telephone requis"}); const np=normalizePhone(phone); if(db){const user=await db.collection("trax_users").findOne({$or:[{phone:np},{phone:"+221"+np}]}); if(!user)return res.status(404).json({error:"Compte introuvable"}); if(user.password&&user.password!==password)return res.status(401).json({error:"wrong_password"}); return res.json({success:true,user:{id:user.id,name:user.name,phone:np,role:user.role,vid:user.vid,typeLabel:user.typeLabel}});} res.status(503).json({error:"DB indisponible"});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/trax/reset-password", async(req,res)=>{ try{const{phone,newPassword}=req.body; if(!phone||!newPassword)return res.status(400).json({error:"Donnees manquantes"}); const np=normalizePhone(phone); if(!db)return res.status(503).json({error:"DB indisponible"}); const r=await db.collection("trax_users").updateOne({$or:[{phone:np},{phone:"+221"+np}]},{$set:{password:newPassword,updatedAt:new Date()}}); if(r.matchedCount===0)return res.status(404).json({error:"Compte introuvable"}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/vehicles", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").find({}).lean(); return res.json(v.map(x=>{const{_id,...r}=x;return r;}));} res.json([]);}catch(e){res.json([]);} });
app.post("/api/trax/vehicles", async(req,res)=>{ try{const v=req.body; if(!Array.isArray(v))return res.status(400).json({error:"Format invalide"}); if(db){await db.collection("trax_vehicles").deleteMany({}); if(v.length>0){const clean=v.map(x=>{const{_id,...r}=x;return r;}); await db.collection("trax_vehicles").insertMany(clean);}} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/trax/position", async(req,res)=>{ try{const d=req.body; if(!d.id||!d.lat||!d.lng)return res.status(400).json({error:"GPS manquant"}); if(db)await db.collection("trax_vehicles").updateOne({id:d.id},{$set:{lat:d.lat,lng:d.lng,speed:d.speed||0,status:d.status||"online",lastSeen:d.lastSeen||Date.now(),driver:d.driver,phone:d.phone}},{upsert:true}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/vehicles/:vehicleId", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").findOne({vehicleId:req.params.vehicleId}); return res.json(v||{});} res.json({});}catch(e){res.json({});} });
app.get("/api/trax/history/:vehicleId", async(req,res)=>{ try{const{hours=24}=req.query; const since=new Date(Date.now()-hours*60*60*1000); if(db){const p=await db.collection("trax_positions").find({vehicleId:req.params.vehicleId,createdAt:{$gte:since}}).sort({createdAt:1}).limit(1000).lean(); return res.json(p);} res.json([]);}catch(e){res.json([]);} });
app.post("/api/trax/cut/:vehicleId", async(req,res)=>{ try{const{cut=true}=req.body; if(db)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$set:{cut:!!cut,cutAt:new Date()}}); res.json({success:true,cut:!!cut});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/commands/:vehicleId", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").findOne({vehicleId:req.params.vehicleId}); if(!v)return res.json({cut:false}); const r={cut:v.cut||false,message:v.pendingMessage||null}; if(v.pendingMessage)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$unset:{pendingMessage:""}}); return res.json(r);} res.json({cut:false});}catch(e){res.json({cut:false});} });
app.post("/api/trax/message/:vehicleId", async(req,res)=>{ try{if(db)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$set:{pendingMessage:req.body.message}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/stats", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").find({}).lean(); return res.json({total:v.length,moving:v.filter(x=>x.status==="moving").length,stopped:v.filter(x=>x.status==="stopped").length,offline:v.filter(x=>x.status==="offline").length,alert:v.filter(x=>x.status==="alert").length});} res.json({total:0,moving:0,stopped:0,offline:0,alert:0});}catch(e){res.json({total:0,moving:0,stopped:0,offline:0,alert:0});} });
app.delete("/api/trax/vehicles/:vehicleId", async(req,res)=>{ try{if(db){await db.collection("trax_vehicles").deleteOne({vehicleId:req.params.vehicleId}); await db.collection("trax_positions").deleteMany({vehicleId:req.params.vehicleId});} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES ZAMA
// ═══════════════════════════════════════════════════════════

// Register / KYC / Users
app.post("/api/zama/register", async(req,res)=>{ try{
  const existant=db?await db.collection("zama_users").findOne({phone:req.body.phone}):null;
  if(db)await db.collection("zama_users").updateOne({phone:req.body.phone},{$set:{...req.body,updated_at:new Date()}},{upsert:true});
  // SMS bienvenue — uniquement si nouveau compte
  if(!existant&&req.body.phone){
    try{
      const ph=req.body.phone.startsWith("+")?req.body.phone:"+221"+req.body.phone;
      const nm=req.body.prenom||req.body.nom||"Client";
      const msg="Bienvenue sur ZAMA, "+nm+"! Votre compte bureau de change est cree. Echangez vos devises facilement sur zama-sn.com";
      envoyerSMSInfobip(ph,msg).catch(function(){});
    }catch(e){}
  }
  res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/kyc", async(req,res)=>{ try{const{user_id,doc_type,doc_num,dob,nationality,photo_recto,photo_verso,photo_selfie}=req.body; const kycData={kyc:true,kyc_pending:true,kyc_submitted_at:new Date(),kyc_data:{doc_type,doc_num,dob,nationality},kyc_photos:{recto:photo_recto||null,verso:photo_verso||null,selfie:photo_selfie||null}}; if(db)await db.collection("zama_users").updateOne({id:user_id},{$set:kycData},{upsert:true}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA KYC — "+doc_num,html:"<h2>Nouveau KYC ZAMA</h2><p>User: "+user_id+"</p><p>Doc: "+doc_type+" "+doc_num+"</p>"});}catch(e){} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/kyc/approve", async(req,res)=>{ try{const{user_id,approved}=req.body; const token=req.headers["x-admin-token"]||req.query.token; if(token!==(process.env.ADMIN_PASSWORD||"Pstdiama@1"))return res.status(403).json({error:"Non autorise"}); if(db)await db.collection("zama_users").updateOne({id:user_id},{$set:{kyc:approved,kyc_pending:false,kyc_approved:approved,kyc_reviewed_at:new Date()}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.get("/api/zama/users", async(req,res)=>{ try{if(!db)return res.json([]); const u=await db.collection("zama_users").find({}).sort({created:-1}).limit(200).lean(); res.json(u.map(x=>{const{_id,...r}=x; delete r.password; return r;}));}catch(e){res.status(500).json({error:e.message});} });

app.get("/api/zama/kyc/pending", async(req,res)=>{ try{if(!db)return res.json([]); const u=await db.collection("zama_users").find({kyc_pending:true}).sort({kyc_submitted_at:-1}).lean(); res.json(u.map(x=>{const{_id,...r}=x; delete r.password; return r;}));}catch(e){res.status(500).json({error:e.message});} });

// Create order
app.post("/api/zama/create", async(req,res)=>{ try{const{src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,message,user_id}=req.body; const orderId="ZAMA-"+Date.now(); const amtUSD=src_currency==="USD"?amount:parseFloat((amount*(rate_fcfa/606)).toFixed(2)); const paymentUrl = "https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402?memo=" + orderId; console.log("[ZAMA] POS URL:", paymentUrl); if(db)await db.collection("zama_orders").insertOne({order_id:orderId,src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,message,user_id:user_id||null,status:"pending",created_at:new Date(),updated_at:new Date()}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Nouvelle commande: "+orderId,html:"<h2>Commande ZAMA</h2><p>"+amount+" "+src_currency+" → "+net_fcfa+" FCFA</p><p>Destinataire: "+receiver_name+" "+receiver_phone+" ("+receiver_mm+")</p>"});}catch(e){} // SMS confirmation commande au sender
  if(sender_name&&receiver_phone){
    try{
      var smsPhone=receiver_phone.startsWith("+")?receiver_phone:"+221"+receiver_phone;
      var smsMsg="ZAMA: Votre demande d'echange de "+amount+" "+src_currency+" vers "+net_fcfa.toLocaleString()+" FCFA a ete recue. Ref: "+orderId+". Votre destinataire sera notifie a reception.";
      envoyerSMSInfobip(smsPhone,smsMsg).catch(function(){});
    }catch(e){}
  }
  res.json({success:true,order_id:orderId,payment_url:paymentUrl,net_fcfa});}catch(e){res.status(500).json({error:e.message});} });

// Status (commande standard)
app.get("/api/zama/status/:orderId", async(req,res)=>{ try{if(!db)return res.json({status:"pending",order_id:req.params.orderId}); const o=await db.collection("zama_orders").findOne({order_id:req.params.orderId}); if(!o)return res.json({status:"not_found"}); const{_id,...r}=o; res.json(r);}catch(e){res.status(500).json({error:e.message});} });

// Orders admin
app.get("/api/zama/orders", async(req,res)=>{ try{if(!db)return res.json([]); const o=await db.collection("zama_orders").find({}).sort({created_at:-1}).limit(200).lean(); res.json(o.map(x=>{const{_id,...r}=x;return r;}));}catch(e){res.status(500).json({error:e.message});} });

// History user
app.get("/api/zama/history/:userId", async(req,res)=>{ try{if(!db)return res.json([]); const o=await db.collection("zama_orders").find({user_id:req.params.userId}).sort({created_at:-1}).limit(20).lean(); res.json(o.map(x=>{const{_id,...r}=x;return r;}));}catch(e){res.status(500).json({error:e.message});} });

// Contact
app.post("/api/zama/contact", async(req,res)=>{ try{const{name,email,message}=req.body; if(db)await db.collection("zama_contacts").insertOne({name,email,message,created_at:new Date()}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Contact: "+name,html:"<p>De: "+name+" ("+email+")</p><p>"+message+"</p>"});}catch(e){} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// IPN standard
app.post("/api/zama/ipn", async(req,res)=>{ try{const p=req.body; const memo=p.memo||p.data?.memo||""; const orderId=memo.replace("ZAMA-","").trim()||p.order_id||p.external_id; if(orderId&&db){await db.collection("zama_orders").updateOne({order_id:orderId},{$set:{status:"paid",paid_at:new Date(),ipn_data:p}}); const o=await db.collection("zama_orders").findOne({order_id:orderId}); if(o){try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Paiement recu: "+orderId,html:"<h2 style=color:green>Paiement confirme!</h2><p>"+o.net_fcfa+" FCFA → "+o.receiver_phone+" ("+o.receiver_mm+")</p>"});}catch(e){}// SMS receiver
      try{
        const rPh=o.receiver_phone?o.receiver_phone.startsWith("+")?o.receiver_phone:"+221"+o.receiver_phone:null;
        if(rPh){
          const mL=o.receiver_mm==="wave"?"Wave":"Orange Money";
          const smsR="ZAMA: Vous allez recevoir "+o.net_fcfa.toLocaleString()+" FCFA sur votre "+mL+". Ref: "+orderId+". Merci de votre confiance.";
          envoyerSMSInfobip(rPh,smsR).catch(function(){});
        }
      }catch(e){}}} res.json({received:true,order_id:orderId});}catch(e){res.status(500).json({error:e.message});} });

// Redirections paiement
app.get("/api/zama/pay-success", async(req,res)=>{ const{order}=req.query; if(order&&db)await db.collection("zama_orders").updateOne({order_id:order},{$set:{status:"paid",paid_at:new Date()}}).catch(()=>{}); res.redirect("https://pst-telecom-production.up.railway.app/zama?paid="+order); });
app.get("/api/zama/pay-cancel", (req,res)=>res.redirect("https://pst-telecom-production.up.railway.app/zama?cancelled="+req.query.order));
app.get("/api/zama/pay-failed", (req,res)=>res.redirect("https://pst-telecom-production.up.railway.app/zama?failed="+req.query.order));

// ─── ZAMA CRYPTO NATIF (doc officielle izichangePay) ───────
// Signature: HMAC-SHA256 de "coin=<coin>" avec secretKey
// Endpoint adresse: POST /api/payements/address
// Endpoint URL redirect: POST /api/payements/generate_url

function iziSign(dataObj) {
  let str = "";
  for (const [k, v] of Object.entries(dataObj)) {
    str += k + "=" + (Array.isArray(v) ? v.join("") : v);
  }
  return crypto.createHmac("sha256", IZIPAY_IPN_SECRET).update(str).digest("hex");
}

async function iziGetAddress(coin) {
  const toSign = { coin };
  const signature = iziSign(toSign);
  const resp = await fetch("https://pay.izichange.com/api/payements/address", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-api-key": IZIPAY_API_KEY,
      "x-signature": signature,
    },
    body: JSON.stringify({ coin }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("izichangePay " + resp.status + ": " + txt);
  }
  return resp.json();
}

async function iziGetRedirectUrl(options) {
  const { coin, acceptedCoins, amount, orderId, senderName, senderEmail } = options;
  const baseUrl = "https://pst-telecom-production.up.railway.app";
  const toSign = {
    coin: coin || "trx",
    acceptedCoins: acceptedCoins || ["trx", "usdt.trc20", "usdt.bep20"],
    amount: String(parseFloat(amount).toFixed(2)),
    successUrl: baseUrl + "/api/zama/pay-success?order=" + orderId,
    canceledUrl: baseUrl + "/api/zama/pay-cancel?order=" + orderId,
    failedUrl: baseUrl + "/api/zama/pay-failed?order=" + orderId,
  };
  const signature = iziSign(toSign);
  const body = {
    ...toSign,
    firstname: (senderName || "").split(" ")[0] || "Client",
    lastname: (senderName || "").split(" ").slice(1).join(" ") || "",
    email: senderEmail || "",
    memo: orderId,
  };
  const resp = await fetch("https://pay.izichange.com/api/payements/init_operation_with_customer_data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-api-key": IZIPAY_API_KEY,
      "x-signature": signature,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("izichangePay redirect " + resp.status + ": " + txt);
  }
  return resp.json();
}

app.post("/api/zama/crypto/create", async(req, res) => {
  try {
    const { coin_key, amount, src_currency, rate_usd, order_id, receiver_name, receiver_phone, receiver_mm, sender_name, sender_email, net_fcfa } = req.body;
    if (!coin_key || !amount || !order_id) return res.status(400).json({ error: "Champs requis manquants" });

    const meta = COIN_MAP[coin_key] || COIN_MAP["usdt.trc20"];
    const iziCoin = coin_key;
    const rateToUsd = parseFloat(rate_usd) || 1;
    const amount_usd = (parseFloat(amount) * rateToUsd).toFixed(2);

    let address = null;
    let redirectUrl = null;

    // 1. Essayer adresse directe via API izichangePay
    try {
      const iziResp = await iziGetAddress(iziCoin);
      address = iziResp && (iziResp.address || (iziResp.data && iziResp.data.address)) || null;
      console.log("[ZAMA crypto] iziGetAddress:", address ? "OK addr=" + address : "no address", JSON.stringify(iziResp).slice(0, 200));
    } catch (e) {
      console.error("[ZAMA crypto] iziGetAddress failed:", e.message);
    }

    // 2. Si pas d'adresse — essayer URL redirect
    if (!address) {
      try {
        const urlResp = await iziGetRedirectUrl({
          coin: iziCoin, acceptedCoins: [iziCoin],
          amount: amount_usd, orderId: order_id,
          senderName: sender_name || "Client", senderEmail: sender_email || "",
        });
        redirectUrl = (urlResp && (urlResp.url || (urlResp.data && urlResp.data.url))) || null;
        console.log("[ZAMA crypto] iziGetRedirectUrl:", redirectUrl ? "OK" : "no url", JSON.stringify(urlResp).slice(0, 200));
      } catch (e) {
        console.error("[ZAMA crypto] iziGetRedirectUrl failed:", e.message);
      }
    }

    // 3. Fallback: POS URL direct (toujours disponible)
    if (!address && !redirectUrl) {
      redirectUrl = IZIPAY_POS + "?memo=" + order_id + "&coin=" + iziCoin + "&amount=" + amount_usd;
      console.log("[ZAMA crypto] Fallback POS URL:", redirectUrl);
    }

    // Sauvegarder en DB
    if (db) {
      await db.collection("zama_orders").updateOne(
        { order_id },
        { $set: {
          izi_address: address, izi_redirect_url: redirectUrl,
          izi_coin: iziCoin, izi_network: meta.network,
          coin_key, amount_usd, receiver_name, receiver_phone, receiver_mm,
          sender_name, sender_email, net_fcfa,
          status: "crypto_pending", updated_at: new Date()
        }, $setOnInsert: { order_id, src_currency: src_currency || "USD", amount: parseFloat(amount), created_at: new Date() }},
        { upsert: true }
      );
    }

    if (address) {
      return res.json({ ok: true, address, amount_crypto: amount_usd, coin: iziCoin, network: meta.network, label: meta.label, coin_key });
    } else {
      return res.json({ ok: true, address: null, redirect_url: redirectUrl, coin: iziCoin, network: meta.network, label: meta.label, coin_key });
    }
  } catch (e) {
    console.error("[ZAMA crypto/create]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/zama/crypto/status/:order_id", async(req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB indisponible" });
    const doc = await db.collection("zama_orders").findOne({ order_id: req.params.order_id });
    if (!doc) return res.status(404).json({ error: "Ordre introuvable", status: "not_found" });
    res.json({
      order_id: req.params.order_id,
      status: doc.status || "pending",
      address: doc.izi_address,
      amount_crypto: doc.izi_amount || doc.amount_usd,
      coin: doc.izi_coin,
      network: doc.izi_network,
      net_fcfa: doc.net_fcfa,
      confirmations: 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/zama/crypto/ipn", express.raw({ type: "application/json" }), async(req, res) => {
  try {
    const body_raw = req.body.toString();
    const data = JSON.parse(body_raw);
    const order_id = data.external_id || data.order_id || data.memo?.replace("ZAMA-", "");
    const status = (data.status || "").toLowerCase();
    const paid = ["paid", "completed", "confirmed", "success"].includes(status);
    console.log("[ZAMA IPN]", order_id, status);
    if (order_id && db && paid) {
      await db.collection("zama_orders").updateOne({ order_id }, { $set: { status: "paid", paid_at: new Date(), ipn_data: data } });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════════════════════════
// ─── PST PAY — Agrégateur de paiement Mobile Money ─────────────
// Concurrent InTouch/Kayzen · Wave + OM + Free + Visa
// ═══════════════════════════════════════════════════════════════

// ── Config PST Pay ──────────────────────────────────────────────
const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY  || 'PAYDUNYA_MASTER_KEY_ICI';
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY || 'PAYDUNYA_PRIVATE_KEY_ICI';
const PAYDUNYA_TOKEN       = process.env.PAYDUNYA_TOKEN       || 'PAYDUNYA_TOKEN_ICI';
const PAYDUNYA_MODE        = process.env.PAYDUNYA_MODE        || 'test'; // 'test' ou 'live'
const PAYDUNYA_BASE        = PAYDUNYA_MODE === 'live'
  ? 'https://app.paydunya.com/api/v1'
  : 'https://app.paydunya.com/sandbox-api/v1';

// Frais PST Pay (marges sur PayDunya)
const PSTPAY_FEES = {
  wave:   { payin: 0.030, payout: 0.025 },  // 3% payin, 2.5% payout
  om:     { payin: 0.030, payout: 0.025 },
  free:   { payin: 0.030, payout: 0.025 },
  visa:   { payin: 0.040, payout: null  },   // 4% carte
  mock:   { payin: 0.010, payout: 0.010 },   // mode test
};

// ── Helpers PST Pay ─────────────────────────────────────────────
function pstpayHeaders() {
  return {
    'Content-Type':          'application/json',
    'PAYDUNYA-MASTER-KEY':   PAYDUNYA_MASTER_KEY,
    'PAYDUNYA-PRIVATE-KEY':  PAYDUNYA_PRIVATE_KEY,
    'PAYDUNYA-TOKEN':        PAYDUNYA_TOKEN,
  };
}

function genApiKey() {
  return 'PST-' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

function genCheckoutToken() {
  return 'CHK-' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

function calcFees(amount, method) {
  const fee = PSTPAY_FEES[method] || PSTPAY_FEES.mock;
  const payin_fee  = Math.round(amount * fee.payin);
  const payout_fee = fee.payout ? Math.round(amount * fee.payout) : 0;
  const net        = amount - payin_fee;
  return { payin_fee, payout_fee, net, total_fee: payin_fee + payout_fee };
}

// ── Adaptateurs paiement ────────────────────────────────────────
async function payinMock(amount, method, phone, description, token) {
  // Simuler un paiement (mode dev sans API)
  return {
    success: true,
    transaction_id: 'MOCK-' + Date.now(),
    token,
    amount,
    method,
    status: 'pending',
    payment_url: null,
    message: 'Mode test — aucun vrai paiement effectué',
  };
}

async function payinPayDunya(amount, method, phone, description, token, returnUrl) {
  try {
    const body = {
      invoice: {
        total_amount: amount,
        description: description || 'Paiement PST Pay',
      },
      store: {
        name: 'PST Pay',
        tagline: 'Paiement sécurisé',
        postal_address: 'Touba, Sénégal',
        phone: '+221771520959',
      },
      actions: {
        cancel_url:  returnUrl || 'https://pst-telecom-production.up.railway.app/pay/cancel',
        return_url:  returnUrl || 'https://pst-telecom-production.up.railway.app/pay/success',
        callback_url:'https://pst-telecom-production.up.railway.app/api/pstpay/ipn',
      },
      custom_data: { token, method },
    };
    const resp = await fetch(PAYDUNYA_BASE + '/checkout-invoice/create', {
      method: 'POST',
      headers: pstpayHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.response_code === '00') {
      return {
        success: true,
        transaction_id: data.token,
        token,
        amount,
        method,
        status: 'pending',
        payment_url: data.response_text,
      };
    }
    throw new Error(data.response_text || 'PayDunya erreur');
  } catch (e) {
    throw new Error('PayDunya: ' + e.message);
  }
}

async function payoutPayDunya(amount, method, phone, name) {
  try {
    const body = {
      account_alias: phone,
      amount: String(amount),
      account_name: name || 'Client PST Pay',
    };
    const endpoint = method === 'wave'
      ? '/disburse/get-status/wave-senegal'
      : method === 'om'
      ? '/disburse/get-status/orange-money-senegal'
      : '/disburse/get-status/free-money-senegal';
    const resp = await fetch(PAYDUNYA_BASE + endpoint, {
      method: 'POST',
      headers: pstpayHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return { success: data.response_code === '00', data };
  } catch (e) {
    throw new Error('Payout PayDunya: ' + e.message);
  }
}

// ── Middleware auth marchand ─────────────────────────────────────
async function authMerchant(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Clé API manquante' });
  if (!db) return res.status(503).json({ error: 'DB indisponible' });
  const merchant = await db.collection('pstpay_merchants').findOne({ api_key: apiKey, active: true });
  if (!merchant) return res.status(403).json({ error: 'Clé API invalide' });
  req.merchant = merchant;
  next();
}

// ════════════════════════════════════════════════════════════════
// ── ROUTES MARCHANDS ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Inscription marchand
app.post('/api/pstpay/merchants/register', async (req, res) => {
  try {
    const { business_name, email, phone, country, webhook_url } = req.body;
    if (!business_name || !email || !phone) {
      return res.status(400).json({ error: 'business_name, email, phone requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const existing = await db.collection('pstpay_merchants').findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email déjà enregistré' });
    const merchant = {
      business_name,
      email,
      phone,
      country: country || 'SN',
      webhook_url: webhook_url || null,
      api_key: genApiKey(),
      active: true,
      kyc_verified: false,
      balance_fcfa: 0,
      total_volume: 0,
      total_transactions: 0,
      commission_rate: 0.03,
      created_at: new Date(),
    };
    await db.collection('pstpay_merchants').insertOne(merchant);
    await db.collection('audit_logs').insertOne({
      event: 'pstpay_merchant_registered',
      email, business_name,
      timestamp: new Date(),
    });
    res.json({
      ok: true,
      message: 'Compte marchand créé',
      api_key: merchant.api_key,
      business_name,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Profil marchand
app.get('/api/pstpay/merchants/me', authMerchant, async (req, res) => {
  const m = req.merchant;
  res.json({
    business_name: m.business_name,
    email: m.email,
    phone: m.phone,
    kyc_verified: m.kyc_verified,
    balance_fcfa: m.balance_fcfa,
    total_volume: m.total_volume,
    total_transactions: m.total_transactions,
    commission_rate: m.commission_rate,
    api_key: m.api_key,
    created_at: m.created_at,
  });
});

// ════════════════════════════════════════════════════════════════
// ── ROUTES CHECKOUT ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Créer un checkout
app.post('/api/pstpay/checkout', authMerchant, async (req, res) => {
  try {
    const {
      amount, currency, description,
      methods, success_url, cancel_url,
      customer_name, customer_phone, customer_email,
      metadata,
    } = req.body;

    if (!amount || amount < 200) {
      return res.status(400).json({ error: 'Montant minimum 200 FCFA' });
    }

    const token = genCheckoutToken();
    const fees  = calcFees(amount, (methods || ['wave'])[0]);

    const checkout = {
      token,
      merchant_id: req.merchant._id,
      merchant_name: req.merchant.business_name,
      amount: parseInt(amount),
      currency: currency || 'XOF',
      description: description || 'Paiement',
      methods: methods || ['wave', 'om', 'free'],
      success_url: success_url || req.merchant.webhook_url,
      cancel_url: cancel_url || null,
      customer_name: customer_name || null,
      customer_phone: customer_phone || null,
      customer_email: customer_email || null,
      metadata: metadata || {},
      fees,
      status: 'pending',
      payment_method: null,
      paydunya_token: null,
      checkout_url: 'https://pst-telecom-production.up.railway.app/pay/' + token,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    };

    await db.collection('pstpay_checkouts').insertOne(checkout);

    res.json({
      ok: true,
      token,
      checkout_url: checkout.checkout_url,
      amount,
      currency: checkout.currency,
      fees,
      expires_at: checkout.expires_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Initier un paiement sur un checkout
app.post('/api/pstpay/checkout/:token/pay', async (req, res) => {
  try {
    const { method, phone, return_url } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const checkout = await db.collection('pstpay_checkouts').findOne({ token: req.params.token });
    if (!checkout) return res.status(404).json({ error: 'Checkout introuvable' });
    if (checkout.status !== 'pending') return res.status(400).json({ error: 'Checkout déjà traité' });
    if (new Date() > checkout.expires_at) return res.status(400).json({ error: 'Checkout expiré' });

    const allowedMethods = checkout.methods || ['wave', 'om', 'free'];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ error: 'Méthode non acceptée: ' + method });
    }

    let result;
    if (PAYDUNYA_MASTER_KEY === 'PAYDUNYA_MASTER_KEY_ICI') {
      // Mode mock (API pas encore disponible)
      result = await payinMock(checkout.amount, method, phone, checkout.description, checkout.token);
    } else {
      result = await payinPayDunya(checkout.amount, method, phone, checkout.description, checkout.token, return_url);
    }

    await db.collection('pstpay_checkouts').updateOne(
      { token: req.params.token },
      { $set: {
        payment_method: method,
        customer_phone: phone || checkout.customer_phone,
        paydunya_token: result.transaction_id,
        status: 'processing',
        updated_at: new Date(),
      }}
    );

    res.json({
      ok: true,
      status: 'processing',
      payment_url: result.payment_url,
      transaction_id: result.transaction_id,
      message: result.message || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Statut d'un checkout
app.get('/api/pstpay/checkout/:token', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const checkout = await db.collection('pstpay_checkouts').findOne(
      { token: req.params.token },
      { projection: { _id: 0, paydunya_token: 0 } }
    );
    if (!checkout) return res.status(404).json({ error: 'Checkout introuvable' });
    res.json(checkout);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── WEBHOOK IPN PayDunya ─────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.post('/api/pstpay/ipn', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const data = JSON.parse(req.body.toString());
    const token = data.custom_data?.token || data.token;
    const status = (data.status || '').toLowerCase();
    const paid = ['completed', 'success', 'paid'].includes(status);

    console.log('[PST Pay IPN] token=' + token + ' status=' + status);

    if (!token || !db) return res.json({ ok: true });

    const checkout = await db.collection('pstpay_checkouts').findOne({ token });
    if (!checkout) return res.json({ ok: true });

    if (paid && checkout.status !== 'paid') {
      // Calculer commission marchand
      const fees = checkout.fees || calcFees(checkout.amount, checkout.payment_method || 'wave');

      await db.collection('pstpay_checkouts').updateOne(
        { token },
        { $set: { status: 'paid', paid_at: new Date(), ipn_data: data } }
      );

      // Créditer le marchand (net après frais)
      await db.collection('pstpay_merchants').updateOne(
        { _id: checkout.merchant_id },
        { $inc: {
          balance_fcfa: fees.net,
          total_volume: checkout.amount,
          total_transactions: 1,
        }}
      );

      // Log
      await db.collection('audit_logs').insertOne({
        event: 'pstpay_paid',
        token,
        amount: checkout.amount,
        net: fees.net,
        method: checkout.payment_method,
        merchant_id: checkout.merchant_id,
        timestamp: new Date(),
      });

      // Notifier le marchand via webhook
      if (checkout.success_url) {
        fetch(checkout.success_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment.success',
            token,
            amount: checkout.amount,
            net: fees.net,
            method: checkout.payment_method,
            customer_phone: checkout.customer_phone,
            metadata: checkout.metadata,
          }),
        }).catch(e => console.error('[PST Pay webhook]', e.message));
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[PST Pay IPN]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── PAYOUT (envoi vers wallet) ───────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.post('/api/pstpay/payout', authMerchant, async (req, res) => {
  try {
    const { amount, method, phone, name } = req.body;
    if (!amount || !method || !phone) {
      return res.status(400).json({ error: 'amount, method, phone requis' });
    }
    if (amount < 200) return res.status(400).json({ error: 'Minimum 200 FCFA' });

    const merchant = req.merchant;
    const fees = calcFees(amount, method);
    const total_debit = amount + fees.payout_fee;

    if (merchant.balance_fcfa < total_debit) {
      return res.status(400).json({
        error: 'Solde insuffisant',
        balance: merchant.balance_fcfa,
        needed: total_debit,
      });
    }

    // Débiter le marchand
    await db.collection('pstpay_merchants').updateOne(
      { _id: merchant._id },
      { $inc: { balance_fcfa: -total_debit } }
    );

    const payout_id = 'PO-' + Date.now();
    const payout = {
      payout_id,
      merchant_id: merchant._id,
      amount,
      method,
      phone,
      name: name || 'Bénéficiaire',
      fee: fees.payout_fee,
      total_debit,
      status: 'processing',
      created_at: new Date(),
    };

    await db.collection('pstpay_payouts').insertOne(payout);

    // Effectuer le payout
    let result;
    if (PAYDUNYA_MASTER_KEY === 'PAYDUNYA_MASTER_KEY_ICI') {
      result = { success: true, message: 'Mode test - payout simulé' };
    } else {
      result = await payoutPayDunya(amount, method, phone, name);
    }

    await db.collection('pstpay_payouts').updateOne(
      { payout_id },
      { $set: { status: result.success ? 'sent' : 'failed', result } }
    );

    await db.collection('audit_logs').insertOne({
      event: 'pstpay_payout',
      payout_id, amount, method, phone,
      merchant_id: merchant._id,
      timestamp: new Date(),
    });

    res.json({
      ok: result.success,
      payout_id,
      amount,
      method,
      phone,
      fee: fees.payout_fee,
      status: result.success ? 'sent' : 'failed',
      message: result.message || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── DASHBOARD MARCHAND ──────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

// Stats du marchand
app.get('/api/pstpay/stats', authMerchant, async (req, res) => {
  try {
    const merchant_id = req.merchant._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [all, month_data, payouts] = await Promise.all([
      db.collection('pstpay_checkouts').find({ merchant_id, status: 'paid' }).toArray(),
      db.collection('pstpay_checkouts').find({
        merchant_id, status: 'paid',
        paid_at: { $gte: startOfMonth }
      }).toArray(),
      db.collection('pstpay_payouts').find({ merchant_id }).sort({ created_at: -1 }).limit(10).toArray(),
    ]);

    const total_volume   = all.reduce((s, c) => s + c.amount, 0);
    const total_net      = all.reduce((s, c) => s + (c.fees?.net || 0), 0);
    const month_volume   = month_data.reduce((s, c) => s + c.amount, 0);
    const month_count    = month_data.length;

    // Répartition par méthode
    const by_method = {};
    all.forEach(c => {
      const m = c.payment_method || 'unknown';
      by_method[m] = (by_method[m] || 0) + c.amount;
    });

    res.json({
      balance_fcfa: req.merchant.balance_fcfa,
      total_transactions: all.length,
      total_volume,
      total_net,
      month_volume,
      month_count,
      by_method,
      recent_payouts: payouts.map(p => ({
        payout_id: p.payout_id,
        amount: p.amount,
        method: p.method,
        phone: p.phone,
        status: p.status,
        created_at: p.created_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Transactions du marchand
app.get('/api/pstpay/transactions', authMerchant, async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const filter = { merchant_id: req.merchant._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.method) filter.payment_method = req.query.method;

    const [transactions, total] = await Promise.all([
      db.collection('pstpay_checkouts')
        .find(filter, { projection: { ipn_data: 0, paydunya_token: 0 } })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('pstpay_checkouts').countDocuments(filter),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── PAGE CHECKOUT (interface client) ────────────────────────────
// ════════════════════════════════════════════════════════════════

app.get('/pay/:token', async (req, res) => {
  try {
    if (!db) return res.status(503).send('Service indisponible');
    const checkout = await db.collection('pstpay_checkouts').findOne({ token: req.params.token });
    if (!checkout) return res.status(404).send('Paiement introuvable');

    const expired = new Date() > checkout.expires_at;
    const methods = checkout.methods || ['wave', 'om', 'free'];

    const methodLabels = { wave: 'Wave', om: 'Orange Money', free: 'Free Money', visa: 'Carte Visa' };
    const methodColors = { wave: '#1D9BF0', om: '#FF6600', free: '#00A859', visa: '#1A1F71' };
    const methodIcons  = {
      wave: '<svg viewBox="0 0 40 40" width="22" fill="none"><path d="M8 14h4l4 10 4-10h4l4 10 4-10h4" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      om:   '<svg viewBox="0 0 40 40" width="22" fill="none"><circle cx="20" cy="20" r="10" stroke="white" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="white"/></svg>',
      free: '<svg viewBox="0 0 40 40" width="22" fill="none"><path d="M10 20h20M20 10v20" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>',
      visa: '<svg viewBox="0 0 40 40" width="22" fill="none"><rect x="4" y="10" width="32" height="20" rx="4" stroke="white" stroke-width="2"/><path d="M4 18h32" stroke="white" stroke-width="2"/></svg>',
    };

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#070D1A">
<title>Paiement — PST Pay</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{background:#070D1A;color:#E2E8F0;font-family:'Inter',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px 16px 40px;}
.card{background:#0D1525;border:1px solid rgba(255,255,255,.06);border-radius:20px;width:100%;max-width:420px;overflow:hidden;}
.top{background:linear-gradient(135deg,#C8860C,#F5B014,#FCD34D);padding:28px 24px;text-align:center;}
.top-lbl{font-size:11px;font-weight:700;color:rgba(0,0,0,.5);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
.top-amt{font-size:44px;font-weight:800;color:#000;line-height:1;}
.top-desc{font-size:13px;color:rgba(0,0,0,.5);margin-top:6px;}
.top-merch{font-size:12px;font-weight:700;color:rgba(0,0,0,.6);margin-top:4px;}
.body{padding:24px;}
.lbl{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px;}
.methods{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;}
.method-btn{display:flex;align-items:center;gap:14px;padding:16px 18px;border:2px solid rgba(255,255,255,.06);border-radius:14px;cursor:pointer;background:#111D30;transition:all .15s;}
.method-btn:active{transform:scale(.97);}
.method-btn.on{border-color:#F5B014;background:rgba(245,176,20,.08);}
.method-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.method-name{font-size:15px;font-weight:700;}
.method-sub{font-size:11px;color:#475569;margin-top:2px;}
.inp{width:100%;background:#111D30;border:1.5px solid rgba(255,255,255,.08);border-radius:10px;padding:13px 16px;color:#E2E8F0;font-size:14px;font-family:inherit;outline:none;margin-bottom:16px;}
.inp:focus{border-color:#F5B014;}
.inp::placeholder{color:#475569;}
.btn{width:100%;padding:16px;background:linear-gradient(135deg,#F5B014,#FCD34D);color:#000;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn:active{opacity:.85;}
.sec{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;color:#475569;margin-top:14px;}
.sec svg{width:12px;height:12px;stroke:#475569;fill:none;stroke-width:2;}
.logo-row{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;padding-top:4px;}
.logo-box{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#F5B014,#FCD34D);display:flex;align-items:center;justify-content:center;}
.logo-txt{font-size:16px;font-weight:800;color:#fff;letter-spacing:1px;}
.expired{text-align:center;padding:40px 20px;color:#EF4444;}
.success-box{text-align:center;padding:40px 20px;}
.spin{display:inline-block;width:20px;height:20px;border:3px solid rgba(0,0,0,.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
.fee-info{background:#111D30;border-radius:8px;padding:10px 14px;font-size:12px;color:#475569;margin-bottom:16px;display:flex;justify-content:space-between;}
.fee-info span{color:#94A3B8;}
</style>
</head>
<body>
<div class="logo-row">
  <div class="logo-box"><svg viewBox="0 0 40 40" width="22" fill="none"><ellipse cx="20" cy="27" rx="12" ry="10" fill="rgba(0,0,0,0.8)"/><circle cx="29" cy="14" r="7" fill="rgba(0,0,0,0.8)"/><circle cx="31" cy="13" r="1.5" fill="white"/></svg></div>
  <div class="logo-txt">PST Pay</div>
</div>
<div class="card">
  <div class="top">
    <div class="top-lbl">Montant à payer</div>
    <div class="top-amt">${checkout.amount.toLocaleString('fr-FR')} <span style="font-size:20px">FCFA</span></div>
    <div class="top-desc">${checkout.description || 'Paiement'}</div>
    <div class="top-merch">via ${checkout.merchant_name || 'Marchand'}</div>
  </div>
  <div class="body">
    ${expired || checkout.status === 'paid' ? `
      <div class="${checkout.status === 'paid' ? 'success-box' : 'expired'}">
        ${checkout.status === 'paid'
          ? '<div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:20px;font-weight:700;color:#22C55E">Paiement confirmé !</div>'
          : '<div style="font-size:48px;margin-bottom:12px">⏱</div><div style="font-size:18px;font-weight:700">Lien expiré</div><div style="font-size:13px;color:#475569;margin-top:8px">Ce lien de paiement a expiré. Contactez le marchand.</div>'
        }
      </div>
    ` : `
      <div class="lbl">Choisissez votre moyen de paiement</div>
      <div class="methods">
        ${methods.map((m, i) => `
        <div class="method-btn${i === 0 ? ' on' : ''}" onclick="selMethod('${m}',this)" data-method="${m}">
          <div class="method-ico" style="background:${methodColors[m] || '#333'}">${methodIcons[m] || ''}</div>
          <div>
            <div class="method-name">${methodLabels[m] || m}</div>
            <div class="method-sub">Paiement instantané · Sécurisé</div>
          </div>
        </div>`).join('')}
      </div>
      <div class="lbl">Votre numéro de téléphone</div>
      <input class="inp" type="tel" id="phone-inp" placeholder="+221 77 XXX XX XX" inputmode="tel" value="${checkout.customer_phone || ''}">
      <div class="fee-info">
        <span>Frais inclus</span>
        <span>${(checkout.fees?.payin_fee || 0).toLocaleString('fr-FR')} FCFA</span>
      </div>
      <button class="btn" id="pay-btn" onclick="doPay()">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Payer maintenant
      </button>
      <div class="sec">
        <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Paiement sécurisé · PST Pay by PST Telecom
      </div>
    `}
  </div>
</div>
<script>
var _method = '${methods[0]}';
function selMethod(m, el) {
  document.querySelectorAll('.method-btn').forEach(function(b){b.classList.remove('on');});
  el.classList.add('on');
  _method = m;
}
async function doPay() {
  var phone = document.getElementById('phone-inp').value.trim();
  if(!phone){alert('Entrez votre numéro de téléphone');return;}
  var btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Traitement...';
  try {
    var res = await fetch('/api/pstpay/checkout/${checkout.token}/pay', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({method: _method, phone: phone})
    });
    var data = await res.json();
    if(data.ok) {
      if(data.payment_url) {
        window.location.href = data.payment_url;
      } else {
        btn.innerHTML = '✅ Paiement en cours...';
        setTimeout(function(){ checkStatus(); }, 2000);
      }
    } else {
      alert(data.error || 'Erreur de paiement');
      btn.disabled = false;
      btn.innerHTML = 'Payer maintenant';
    }
  } catch(e) {
    alert('Erreur: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = 'Payer maintenant';
  }
}
async function checkStatus() {
  try {
    var res = await fetch('/api/pstpay/checkout/${checkout.token}');
    var data = await res.json();
    if(data.status === 'paid') {
      document.querySelector('.body').innerHTML = '<div class="success-box"><div style="font-size:48px;margin-bottom:12px">✅</div><div style="font-size:20px;font-weight:700;color:#22C55E">Paiement confirmé !</div><div style="font-size:13px;color:#475569;margin-top:8px">Merci pour votre paiement.</div></div>';
      ${checkout.success_url ? `setTimeout(function(){window.location.href='${checkout.success_url}';},3000);` : ''}
    } else {
      setTimeout(checkStatus, 5000);
    }
  } catch(e) { setTimeout(checkStatus, 5000); }
}
</script>
</body>
</html>`;

    res.send(html);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ════════════════════════════════════════════════════════════════
// ── ADMIN PST PAY ────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════

app.get('/api/pstpay/admin/overview', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const [merchants, checkouts, payouts] = await Promise.all([
      db.collection('pstpay_merchants').countDocuments(),
      db.collection('pstpay_checkouts').find({ status: 'paid' }).toArray(),
      db.collection('pstpay_payouts').countDocuments(),
    ]);

    const total_volume = checkouts.reduce((s, c) => s + c.amount, 0);
    const total_fees   = checkouts.reduce((s, c) => s + (c.fees?.payin_fee || 0), 0);

    res.json({ merchants, paid_transactions: checkouts.length, total_volume, total_fees, total_payouts: payouts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/pstpay/admin/merchants', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('pstpay_merchants').find({}, { projection: { api_key: 0 } }).sort({ created_at: -1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN PST PAY ──────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════
// ─── ZAMA ÉPARGNE ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Créer un plan d'épargne
app.post('/api/zama/epargne/create', async (req, res) => {
  try {
    const { user_id, user_name, user_phone, objectif_fcfa, duree_jours, description, retrait_libre } = req.body;
    if (!user_id || !objectif_fcfa || !duree_jours) {
      return res.status(400).json({ error: 'user_id, objectif_fcfa, duree_jours requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const epargne_id = 'EP-' + Date.now();
    const date_fin = new Date(Date.now() + duree_jours * 24 * 60 * 60 * 1000);

    const epargne = {
      epargne_id,
      user_id,
      user_name: user_name || '',
      user_phone: user_phone || '',
      objectif_fcfa: parseInt(objectif_fcfa),
      solde_fcfa: 0,
      duree_jours: parseInt(duree_jours),
      description: description || 'Mon épargne ZAMA',
      retrait_libre: retrait_libre !== false, // true par défaut = peut retirer quand il veut
      status: 'actif',
      progression: 0,
      date_debut: new Date(),
      date_fin,
      transactions: [],
      created_at: new Date(),
    };

    await db.collection('zama_epargnes').insertOne(epargne);
    res.json({ ok: true, epargne_id, date_fin, message: 'Plan épargne créé' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Déposer dans l'épargne
app.post('/api/zama/epargne/:epargne_id/depot', async (req, res) => {
  try {
    const { montant_fcfa, wave_ref, note } = req.body;
    if (!montant_fcfa || montant_fcfa < 100) {
      return res.status(400).json({ error: 'Montant minimum 100 FCFA' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne clôturée' });

    const nouveau_solde = ep.solde_fcfa + parseInt(montant_fcfa);
    const progression = Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100));
    const objectif_atteint = nouveau_solde >= ep.objectif_fcfa;

    const tx = {
      tx_id: 'TX-' + Date.now(),
      type: 'depot',
      montant: parseInt(montant_fcfa),
      wave_ref: wave_ref || null,
      note: note || '',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      {
        $set: { solde_fcfa: nouveau_solde, progression, updated_at: new Date() },
        $push: { transactions: tx },
      }
    );

    res.json({
      ok: true,
      nouveau_solde,
      progression,
      objectif_atteint,
      message: objectif_atteint ? '🎉 Objectif atteint !' : 'Dépôt enregistré',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Retirer de l'épargne (libre ou à la date)
app.post('/api/zama/epargne/:epargne_id/retrait', async (req, res) => {
  try {
    const { montant_fcfa, phone, note } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne déjà clôturée' });

    // Vérifier retrait libre ou date atteinte
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours_restants = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({
        error: 'Retrait bloqué jusqu\'à la date objectif',
        jours_restants,
        date_fin: ep.date_fin,
      });
    }

    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant > ep.solde_fcfa) {
      return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });
    }

    const nouveau_solde = ep.solde_fcfa - montant;
    const tx = {
      tx_id: 'TX-' + Date.now(),
      type: 'retrait',
      montant,
      phone: phone || ep.user_phone,
      note: note || 'Retrait épargne',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      {
        $set: {
          solde_fcfa: nouveau_solde,
          status: nouveau_solde === 0 ? 'clos' : 'actif',
          progression: Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100)),
          updated_at: new Date(),
        },
        $push: { transactions: tx },
      }
    );

    // Log pour traitement manuel Wave
    await db.collection('audit_logs').insertOne({
      event: 'zama_epargne_retrait',
      epargne_id: req.params.epargne_id,
      montant, phone: phone || ep.user_phone,
      user_id: ep.user_id,
      timestamp: new Date(),
    });

    res.json({
      ok: true,
      montant_retire: montant,
      nouveau_solde,
      status: nouveau_solde === 0 ? 'clos' : 'actif',
      message: 'Retrait enregistré — virement Wave en cours de traitement',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Détail épargne
app.get('/api/zama/epargne/:epargne_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    res.json(ep);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mes épargnes
app.get('/api/zama/epargne/user/:user_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_epargnes')
      .find({ user_id: req.params.user_id })
      .sort({ created_at: -1 })
      .lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ─── ZAMA TONTINE ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════

// Créer une tontine
app.post('/api/zama/tontine/create', async (req, res) => {
  try {
    const { createur_id, createur_name, createur_phone, nom, cotisation_fcfa, frequence, membres_phones } = req.body;
    if (!createur_id || !nom || !cotisation_fcfa || !frequence) {
      return res.status(400).json({ error: 'createur_id, nom, cotisation_fcfa, frequence requis' });
    }
    if (!membres_phones || membres_phones.length < 2) {
      return res.status(400).json({ error: 'Minimum 2 membres requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const tontine_id = 'TON-' + Date.now();
    const nb_membres = membres_phones.length + 1; // +1 pour le créateur

    // Créer la liste des membres avec ordre de bénéfice (aléatoire sécurisé)
    const ordre = [...Array(nb_membres).keys()].sort(() => Math.random() - 0.5);

    const membres = [
      {
        phone: createur_phone,
        name: createur_name || 'Créateur',
        user_id: createur_id,
        role: 'createur',
        ordre: ordre[0],
        cotisations_payees: 0,
        statut: 'actif',
        a_recu: false,
        joined_at: new Date(),
      },
      ...membres_phones.map((phone, i) => ({
        phone,
        name: '',
        user_id: null,
        role: 'membre',
        ordre: ordre[i + 1],
        cotisations_payees: 0,
        statut: 'invité',
        a_recu: false,
        joined_at: null,
      })),
    ];

    // Trier par ordre pour déterminer qui reçoit en premier
    const membres_tries = [...membres].sort((a, b) => a.ordre - b.ordre);

    const tontine = {
      tontine_id,
      nom,
      createur_id,
      createur_phone,
      cotisation_fcfa: parseInt(cotisation_fcfa),
      pot_total: parseInt(cotisation_fcfa) * nb_membres,
      frequence, // 'hebdomadaire' ou 'mensuel'
      nb_membres,
      membres,
      tour_actuel: 0,
      beneficiaire_actuel: membres_tries[0].phone,
      historique_tours: [],
      cotisations: [],
      status: 'actif',
      prochaine_date: frequence === 'hebdomadaire'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
    };

    await db.collection('zama_tontines').insertOne(tontine);

    res.json({
      ok: true,
      tontine_id,
      nom,
      nb_membres,
      cotisation_fcfa: tontine.cotisation_fcfa,
      pot_total: tontine.pot_total,
      frequence,
      beneficiaire_premier: membres_tries[0].phone,
      message: 'Tontine créée — invitations envoyées aux membres',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rejoindre une tontine
app.post('/api/zama/tontine/:tontine_id/rejoindre', async (req, res) => {
  try {
    const { phone, name, user_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });

    const membre = ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Vous n\'êtes pas invité dans cette tontine' });
    if (membre.statut === 'actif') return res.status(400).json({ error: 'Vous avez déjà rejoint cette tontine' });

    await db.collection('zama_tontines').updateOne(
      { tontine_id: req.params.tontine_id, 'membres.phone': phone },
      { $set: {
        'membres.$.name': name || '',
        'membres.$.user_id': user_id || null,
        'membres.$.statut': 'actif',
        'membres.$.joined_at': new Date(),
      }}
    );

    res.json({ ok: true, message: 'Vous avez rejoint la tontine ' + ton.nom });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Payer sa cotisation
app.post('/api/zama/tontine/:tontine_id/cotiser', async (req, res) => {
  try {
    const { phone, wave_ref, note } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    if (ton.status !== 'actif') return res.status(400).json({ error: 'Tontine non active' });

    const membre = ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Non membre de cette tontine' });
    if (membre.statut !== 'actif') return res.status(400).json({ error: 'Rejoignez la tontine d\'abord' });

    // Vérifier si déjà payé ce tour
    const tour = ton.tour_actuel;
    const deja_paye = ton.cotisations.some(c => c.phone === phone && c.tour === tour);
    if (deja_paye) return res.status(400).json({ error: 'Vous avez déjà cotisé pour ce tour' });

    const cotisation = {
      cot_id: 'COT-' + Date.now(),
      phone,
      name: membre.name || '',
      montant: ton.cotisation_fcfa,
      tour,
      wave_ref: wave_ref || null,
      note: note || '',
      date: new Date(),
    };

    // Compter combien ont payé ce tour après ce paiement
    const payeurs_ce_tour = ton.cotisations.filter(c => c.tour === tour).length + 1;
    const tout_paye = payeurs_ce_tour >= ton.nb_membres;

    await db.collection('zama_tontines').updateOne(
      { tontine_id: req.params.tontine_id },
      {
        $push: { cotisations: cotisation },
        $inc: { 'membres.$[m].cotisations_payees': 1 },
      },
      { arrayFilters: [{ 'm.phone': phone }] }
    );

    // Si tout le monde a payé → distribuer le pot
    if (tout_paye) {
      const membres_tries = [...ton.membres].sort((a, b) => a.ordre - b.ordre);
      const beneficiaire = membres_tries[tour % ton.nb_membres];
      const prochain_tour = tour + 1;
      const tontine_terminee = prochain_tour >= ton.nb_membres;

      const prochaine_date = ton.frequence === 'hebdomadaire'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const historique_entry = {
        tour,
        beneficiaire_phone: beneficiaire.phone,
        beneficiaire_name: beneficiaire.name || '',
        montant_pot: ton.pot_total,
        date_distribution: new Date(),
      };

      await db.collection('zama_tontines').updateOne(
        { tontine_id: req.params.tontine_id },
        {
          $set: {
            tour_actuel: prochain_tour,
            beneficiaire_actuel: tontine_terminee ? null : membres_tries[prochain_tour % ton.nb_membres]?.phone,
            status: tontine_terminee ? 'termine' : 'actif',
            prochaine_date: tontine_terminee ? null : prochaine_date,
          },
          $push: { historique_tours: historique_entry },
        }
      );

      // Marquer le bénéficiaire comme ayant reçu
      await db.collection('zama_tontines').updateOne(
        { tontine_id: req.params.tontine_id, 'membres.phone': beneficiaire.phone },
        { $set: { 'membres.$.a_recu': true } }
      );

      // Log pour virement manuel Wave
      await db.collection('audit_logs').insertOne({
        event: 'zama_tontine_distribution',
        tontine_id: req.params.tontine_id,
        tour,
        beneficiaire: beneficiaire.phone,
        montant: ton.pot_total,
        timestamp: new Date(),
      });

      return res.json({
        ok: true,
        cotisation_enregistree: true,
        pot_distribue: true,
        beneficiaire: beneficiaire.phone,
        montant_pot: ton.pot_total,
        tontine_terminee,
        message: tout_paye
          ? 'Pot distribué à ' + (beneficiaire.name || beneficiaire.phone) + ' — virement Wave en cours'
          : 'Cotisation enregistrée',
      });
    }

    const restants = ton.nb_membres - payeurs_ce_tour;
    res.json({
      ok: true,
      cotisation_enregistree: true,
      pot_distribue: false,
      payeurs_ce_tour,
      restants,
      message: restants + ' membre(s) n\'ont pas encore cotisé',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Détail tontine
app.get('/api/zama/tontine/:tontine_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    res.json(ton);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mes tontines
app.get('/api/zama/tontine/user/:user_id', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_tontines').find({
      $or: [
        { createur_id: req.params.user_id },
        { 'membres.user_id': req.params.user_id },
      ]
    }).sort({ created_at: -1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin — toutes les tontines
app.get('/api/zama/tontine/admin/all', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const list = await db.collection('zama_tontines').find({}).sort({ created_at: -1 }).limit(100).lean();
    const epargnes = await db.collection('zama_epargnes').find({}).sort({ created_at: -1 }).limit(100).lean();
    const total_epargne = epargnes.reduce((s, e) => s + e.solde_fcfa, 0);
    const total_tontine = list.reduce((s, t) => s + t.pot_total, 0);
    res.json({ tontines: list, epargnes, stats: { total_epargne, total_tontine, nb_tontines: list.length, nb_epargnes: epargnes.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN ZAMA ÉPARGNE + TONTINE ────────────────────────────────


// ═══════════════════════════════════════════════════════════════
// ─── ZAMA ÉPARGNE — DÉPÔTS + VALIDATION ADMIN ──────────────────
// ═══════════════════════════════════════════════════════════════

const ZAMA_ADMIN_EMAILS = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];
const ZAMA_FRAIS_RETRAIT  = 0.01;  // 1% sur chaque retrait
const ZAMA_INTERET_MENSUEL = 0.02; // 2% par mois

function sendAdminEmail(subject, html) {
  try {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    ZAMA_ADMIN_EMAILS.forEach(email => {
      t.sendMail({ from: process.env.GMAIL_USER, to: email, subject, html }).catch(e => {
        console.error('[ZAMA Email]', e.message);
      });
    });
  } catch(e) {
    console.error('[ZAMA Email]', e.message);
  }
}

// ── Soumettre un dépôt (utilisateur)
app.post('/api/zama/epargne/:epargne_id/depot-demande', async (req, res) => {
  try {
    const { montant_fcfa, wave_ref, methode, user_phone, user_name } = req.body;
    if (!montant_fcfa || montant_fcfa < 100) {
      return res.status(400).json({ error: 'Montant minimum 100 FCFA' });
    }
    if (!wave_ref || wave_ref.trim() === '') {
      return res.status(400).json({ error: 'Référence de transaction requise' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });

    const depot_id = 'DEP-' + Date.now();
    const depot = {
      depot_id,
      epargne_id: req.params.epargne_id,
      description: ep.description,
      user_id: ep.user_id,
      user_name: user_name || ep.user_name || '',
      user_phone: user_phone || ep.user_phone || '',
      montant_fcfa: parseInt(montant_fcfa),
      wave_ref: wave_ref.trim(),
      methode: methode || 'wave',
      status: 'en_attente',
      created_at: new Date(),
    };

    await db.collection('zama_depots_pending').insertOne(depot);

    // Envoyer email aux admins avec liens valider/rejeter
    const base = 'https://pst-telecom-production.up.railway.app';
    const lien_valider = base + '/api/zama/epargne/admin/valider-depot/' + depot_id + '?token=pst-admin-2026';
    const lien_rejeter = base + '/api/zama/epargne/admin/rejeter-depot/' + depot_id + '?token=pst-admin-2026';

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#FF6B00;padding:20px;border-radius:8px 8px 0 0;text-align:center">
          <h1 style="color:white;margin:0;font-size:24px">ZAMA</h1>
          <p style="color:rgba(255,255,255,.8);margin:4px 0 0">Nouveau dépôt à valider</p>
        </div>
        <div style="background:#0D1525;padding:24px;border-radius:0 0 8px 8px;color:#E2E8F0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#94A3B8">Plan épargne</td><td style="font-weight:bold">${ep.description}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Utilisateur</td><td>${depot.user_name || '--'} (${depot.user_phone})</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Montant</td><td style="font-size:20px;font-weight:bold;color:#F5B014">${parseInt(montant_fcfa).toLocaleString('fr-FR')} FCFA</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Méthode</td><td>${methode || 'Wave'}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">Référence</td><td style="font-family:monospace;background:#1A2640;padding:4px 8px;border-radius:4px">${wave_ref}</td></tr>
            <tr><td style="padding:8px 0;color:#94A3B8">ID dépôt</td><td style="font-family:monospace;font-size:12px">${depot_id}</td></tr>
          </table>
          <div style="margin-top:24px;display:flex;gap:12px">
            <a href="${lien_valider}" style="display:inline-block;background:#22C55E;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px">
              ✅ VALIDER
            </a>
            <a href="${lien_rejeter}" style="display:inline-block;background:#EF4444;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin-left:12px">
              ❌ REJETER
            </a>
          </div>
          <p style="color:#475569;font-size:12px;margin-top:16px">
            Vérifiez la référence ${wave_ref} dans votre dashboard Wave Business avant de valider.
          </p>
        </div>
      </div>
    `;

    sendAdminEmail('ZAMA — Dépôt à valider: ' + parseInt(montant_fcfa).toLocaleString('fr-FR') + ' FCFA', emailHtml);

    res.json({
      ok: true,
      depot_id,
      status: 'en_attente',
      message: 'Dépôt soumis ! Les admins vont valider sous 24h.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Valider un dépôt (admin via lien email ou API)
app.get('/api/zama/epargne/admin/valider-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    if (!db) return res.status(503).send('DB indisponible');

    const depot = await db.collection('zama_depots_pending').findOne({
      depot_id: req.params.depot_id, status: 'en_attente'
    });
    if (!depot) return res.send('<h2>Dépôt introuvable ou déjà traité</h2>');

    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: depot.epargne_id });
    if (!ep) return res.send('<h2>Épargne introuvable</h2>');

    const nouveau_solde = ep.solde_fcfa + depot.montant_fcfa;
    const progression = Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100));

    const tx = {
      tx_id: depot.depot_id,
      type: 'depot',
      montant: depot.montant_fcfa,
      wave_ref: depot.wave_ref,
      note: 'Validé par admin ZAMA',
      date: new Date(),
    };

    await db.collection('zama_epargnes').updateOne(
      { epargne_id: depot.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, progression, updated_at: new Date() }, $push: { transactions: tx } }
    );

    await db.collection('zama_depots_pending').updateOne(
      { depot_id: req.params.depot_id },
      { $set: { status: 'valide', valide_at: new Date() } }
    );

    // Notifier l'utilisateur par email si possible
    sendAdminEmail(
      'ZAMA — Dépôt validé: ' + depot.montant_fcfa.toLocaleString('fr-FR') + ' FCFA',
      '<h2>Dépôt validé</h2><p>' + depot.montant_fcfa.toLocaleString('fr-FR') + ' FCFA crédité sur ' + ep.description + '</p><p>Nouveau solde: ' + nouveau_solde.toLocaleString('fr-FR') + ' FCFA</p>'
    );

    res.send(`
      <html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(34,197,94,.3)">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2 style="color:#22C55E;margin:0 0 8px">Dépôt validé !</h2>
          <p style="color:#94A3B8">${depot.montant_fcfa.toLocaleString('fr-FR')} FCFA crédité</p>
          <p style="color:#94A3B8">Plan : ${ep.description}</p>
          <p style="color:#94A3B8">Nouveau solde : ${nouveau_solde.toLocaleString('fr-FR')} FCFA</p>
        </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ── Rejeter un dépôt (admin via lien email ou API)
app.get('/api/zama/epargne/admin/rejeter-depot/:depot_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    if (!db) return res.status(503).send('DB indisponible');

    const depot = await db.collection('zama_depots_pending').findOne({
      depot_id: req.params.depot_id, status: 'en_attente'
    });
    if (!depot) return res.send('<h2>Dépôt introuvable ou déjà traité</h2>');

    await db.collection('zama_depots_pending').updateOne(
      { depot_id: req.params.depot_id },
      { $set: { status: 'rejete', rejete_at: new Date() } }
    );

    res.send(`
      <html><head><meta charset="UTF-8"></head>
      <body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(239,68,68,.3)">
          <div style="font-size:48px;margin-bottom:16px">❌</div>
          <h2 style="color:#EF4444;margin:0 0 8px">Dépôt rejeté</h2>
          <p style="color:#94A3B8">Référence: ${depot.wave_ref}</p>
          <p style="color:#94A3B8">Montant: ${depot.montant_fcfa.toLocaleString('fr-FR')} FCFA</p>
        </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Erreur: ' + e.message);
  }
});

// ── Liste dépôts en attente (admin dashboard)
app.get('/api/zama/epargne/admin/depots-pending', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const pending = await db.collection('zama_depots_pending').find({ status: 'en_attente' }).sort({ created_at: -1 }).lean();
    res.json({ pending, count: pending.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Appliquer intérêts 2%/mois (admin)
app.post('/api/zama/epargne/admin/appliquer-interets', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const epargnes = await db.collection('zama_epargnes').find({ status: 'actif', solde_fcfa: { $gt: 0 } }).lean();
    let total = 0, nb = 0;
    for (const ep of epargnes) {
      const interet = Math.round(ep.solde_fcfa * ZAMA_INTERET_MENSUEL);
      if (interet <= 0) continue;
      await db.collection('zama_epargnes').updateOne(
        { epargne_id: ep.epargne_id },
        { $inc: { solde_fcfa: interet }, $push: { transactions: { tx_id: 'INT-' + Date.now(), type: 'interet', montant: interet, note: 'Intérêts 2%/mois', date: new Date() } }, $set: { updated_at: new Date() } }
      );
      total += interet; nb++;
    }
    res.json({ ok: true, nb_comptes: nb, total_interets_fcfa: total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Retrait avec frais 1%
app.post('/api/zama/epargne/:epargne_id/retrait-v2', async (req, res) => {
  try {
    const { montant_fcfa, phone, password } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.epargne_id });
    if (!ep) return res.status(404).json({ error: 'Épargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Épargne clôturée' });
    if (ep.password && ep.password !== password) return res.status(403).json({ error: 'Mot de passe incorrect' });
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ error: 'Epargne bloquee ' + jours + ' jours restants', jours_restants: jours });
    }
    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant > ep.solde_fcfa) return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });
    const frais = Math.round(montant * ZAMA_FRAIS_RETRAIT);
    const net = montant - frais;
    const nouveau_solde = ep.solde_fcfa - montant;
    const tx = { tx_id: 'RET-' + Date.now(), type: 'retrait', montant, frais, net, phone: phone || ep.user_phone, date: new Date() };
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: req.params.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, status: nouveau_solde === 0 ? 'clos' : 'actif', progression: Math.min(100, Math.round((nouveau_solde / ep.objectif_fcfa) * 100)), updated_at: new Date() }, $push: { transactions: tx } }
    );
    // Notifier admin
    sendAdminEmail(
      'ZAMA — Retrait: ' + montant.toLocaleString('fr-FR') + ' FCFA',
      '<h2>Retrait épargne</h2><p>Plan: ' + ep.description + '</p><p>Montant: ' + montant.toLocaleString('fr-FR') + ' FCFA</p><p>Frais: ' + frais.toLocaleString('fr-FR') + ' FCFA</p><p>Net à virer: ' + net.toLocaleString('fr-FR') + ' FCFA</p><p>Vers: ' + (phone || ep.user_phone) + '</p>'
    );
    await db.collection('audit_logs').insertOne({ event: 'zama_retrait', epargne_id: req.params.epargne_id, montant, frais, net, phone: phone || ep.user_phone, timestamp: new Date() });
    res.json({ ok: true, montant_retire: montant, frais, montant_net: net, nouveau_solde, message: 'Retrait de ' + montant.toLocaleString('fr-FR') + ' FCFA — Frais 1% (' + frais.toLocaleString('fr-FR') + ' FCFA) — Vous recevez ' + net.toLocaleString('fr-FR') + ' FCFA' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN ZAMA ÉPARGNE ADMIN ────────────────────────────────────


// ═══════════════════════════════════════════════════════════════
// ─── ZAMA V2 — SMS + RETRAIT ADMIN + VUE COMPTES ───────────────
// ═══════════════════════════════════════════════════════════════

// ── Helper SMS Africa's Talking ─────────────────────────────────
async function zamaSendSMS(phone, message) {
  // Utilise Infobip (remplace Africa's Talking)
  return envoyerSMSInfobip(phone, message);
}
// zamaSendSMS_legacy supprimée

// ── Soumettre un retrait (utilisateur → en attente validation admin)
app.post('/api/zama/epargne/:id/retrait-demande', async (req, res) => {
  try {
    const { montant_fcfa, phone, password } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: req.params.id });
    if (!ep) return res.status(404).json({ error: 'Epargne introuvable' });
    if (ep.status === 'clos') return res.status(400).json({ error: 'Epargne cloturee' });

    // Vérifier mot de passe si protégée
    if (ep.password && ep.password !== password) {
      return res.status(403).json({ error: 'Mot de passe incorrect' });
    }

    // Vérifier retrait libre ou date atteinte
    const date_ok = new Date() >= new Date(ep.date_fin);
    if (!ep.retrait_libre && !date_ok) {
      const jours = Math.ceil((new Date(ep.date_fin) - new Date()) / (1000*60*60*24));
      return res.status(400).json({ error: 'Epargne bloquee - ' + jours + ' jours restants', jours_restants: jours });
    }

    const montant = montant_fcfa ? parseInt(montant_fcfa) : ep.solde_fcfa;
    if (montant <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (montant > ep.solde_fcfa) return res.status(400).json({ error: 'Solde insuffisant', solde: ep.solde_fcfa });

    // Frais selon plan et échéance
    const est_echeance = ep.date_fin ? new Date() >= new Date(ep.date_fin) : true;
    let frais_pct;
    if (ep.plan_type && ep.plan_type !== 'libre') {
      // Plan bloqué : 0% à échéance, frais_anticipe avant
      frais_pct = est_echeance ? 0 : (ep.frais_anticipe || 0.02);
    } else {
      // Plan libre : toujours 1%
      frais_pct = ep.frais_retrait || 0.01;
    }
    const frais = Math.round(montant * frais_pct);
    const net = montant - frais;
    const retrait_id = 'RET-' + Date.now();

    const retrait = {
      retrait_id,
      epargne_id: req.params.id,
      description: ep.description,
      user_id: ep.user_id,
      user_phone: ep.user_phone,
      phone_retrait: phone || ep.user_phone,
      montant_fcfa: montant,
      frais_pct,
      frais_fcfa: frais,
      net_fcfa: net,
      est_echeance,
      status: 'en_attente',
      created_at: new Date()
    };

    await db.collection('zama_retraits_pending').insertOne(retrait);

    // Email aux admins
    const base = 'https://pst-telecom-production.up.railway.app';
    const lv = base + '/api/zama/epargne/admin/valider-retrait/' + retrait_id + '?token=pst-admin-2026';
    const lr = base + '/api/zama/epargne/admin/rejeter-retrait/' + retrait_id + '?token=pst-admin-2026';

    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      const emailHtml = '<h2>ZAMA - Retrait a traiter</h2><p>Plan: <strong>' + ep.description + '</strong></p><p>Montant: <strong>' + montant.toLocaleString('fr-FR') + ' FCFA</strong></p><p>Frais (1%): ' + frais.toLocaleString('fr-FR') + ' FCFA</p><p><strong style="color:green">Net a virer: ' + net.toLocaleString('fr-FR') + ' FCFA</strong></p><p>Vers: <strong>' + (phone || ep.user_phone) + '</strong></p><br><a href="' + lv + '" style="background:#22C55E;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin-right:12px">VALIDER ET VIRER</a><a href="' + lr + '" style="background:#EF4444;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">REJETER</a>';
      ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'].forEach(email => {
        t.sendMail({ from: process.env.GMAIL_USER, to: email, subject: 'ZAMA Retrait a valider: ' + net.toLocaleString('fr-FR') + ' FCFA', html: emailHtml }).catch(e => console.error(e.message));
      });
    } catch(e) { console.error('[Mail]', e.message); }

    // SMS à l'utilisateur
    await zamaSendSMS(ep.user_phone, 'ZAMA: Votre demande de retrait de ' + montant.toLocaleString('fr-FR') + ' FCFA est en cours de traitement. Vous recevrez ' + net.toLocaleString('fr-FR') + ' FCFA apres frais (1%). Validation sous 1h.');

    res.json({ ok: true, retrait_id, montant, frais, net, status: 'en_attente', message: 'Retrait soumis ! Validation admin sous 1h. Vous recevrez ' + net.toLocaleString('fr-FR') + ' FCFA sur ' + (phone || ep.user_phone) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: lister retraits en attente
app.get('/api/zama/epargne/admin/retraits-pending', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const pending = await db.collection('zama_retraits_pending').find({ status: 'en_attente' }).sort({ created_at: -1 }).lean();
    res.json({ pending, count: pending.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider un retrait
app.get('/api/zama/epargne/admin/valider-retrait/:retrait_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    const retrait = await db.collection('zama_retraits_pending').findOne({ retrait_id: req.params.retrait_id, status: 'en_attente' });
    if (!retrait) return res.send('<h2>Retrait introuvable ou deja traite</h2>');
    const ep = await db.collection('zama_epargnes').findOne({ epargne_id: retrait.epargne_id });
    if (!ep) return res.send('<h2>Epargne introuvable</h2>');
    const nouveau_solde = Math.max(0, ep.solde_fcfa - retrait.montant_fcfa);
    await db.collection('zama_epargnes').updateOne(
      { epargne_id: retrait.epargne_id },
      { $set: { solde_fcfa: nouveau_solde, status: nouveau_solde === 0 ? 'clos' : 'actif', progression: Math.min(100, Math.round((nouveau_solde/ep.objectif_fcfa)*100)), updated_at: new Date() }, $push: { transactions: { tx_id: retrait.retrait_id, type: 'retrait', montant: retrait.montant_fcfa, frais: retrait.frais_fcfa, net: retrait.net_fcfa, phone: retrait.phone_retrait, note: 'Valide par admin', date: new Date() } } }
    );
    await db.collection('zama_retraits_pending').updateOne({ retrait_id: req.params.retrait_id }, { $set: { status: 'valide', valide_at: new Date() } });
    await db.collection('zama_revenus').insertOne({ type: 'frais_retrait', epargne_id: retrait.epargne_id, montant_frais: retrait.frais_fcfa, date: new Date() });
    // SMS confirmation
    await zamaSendSMS(retrait.phone_retrait, 'ZAMA: Votre retrait de ' + retrait.net_fcfa.toLocaleString('fr-FR') + ' FCFA a ete valide et vire sur ' + retrait.phone_retrait + '. Merci de votre confiance!');
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(34,197,94,.3)"><div style="font-size:48px">✅</div><h2 style="color:#22C55E">Retrait valide!</h2><p>Virement de ' + retrait.net_fcfa.toLocaleString('fr-FR') + ' FCFA vers ' + retrait.phone_retrait + '</p><p style="color:#94A3B8">N oubliez pas de virer manuellement via Wave Business</p></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Admin: rejeter un retrait
app.get('/api/zama/epargne/admin/rejeter-retrait/:retrait_id', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).send('Non autorise');
    if (!db) return res.status(503).send('DB indisponible');
    const retrait = await db.collection('zama_retraits_pending').findOne({ retrait_id: req.params.retrait_id });
    await db.collection('zama_retraits_pending').updateOne({ retrait_id: req.params.retrait_id }, { $set: { status: 'rejete', rejete_at: new Date() } });
    if (retrait) await zamaSendSMS(retrait.phone_retrait, 'ZAMA: Votre demande de retrait de ' + retrait.montant_fcfa.toLocaleString('fr-FR') + ' FCFA a ete rejetee. Contactez le support.');
    res.send('<html><body style="font-family:Arial;background:#070D1A;color:#E2E8F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;background:#0D1525;padding:40px;border-radius:16px;border:1px solid rgba(239,68,68,.3)"><div style="font-size:48px">❌</div><h2 style="color:#EF4444">Retrait rejete</h2></div></body></html>');
  } catch(e) { res.status(500).send('Erreur: ' + e.message); }
});

// ── Admin: vue tous les comptes épargnants
app.get('/api/zama/epargne/admin/tous-comptes', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const comptes = await db.collection('zama_epargnes').find({}).sort({ created_at: -1 }).lean();
    const total_sous_gestion = comptes.filter(c => c.status === 'actif').reduce((s, c) => s + c.solde_fcfa, 0);
    const revenus = await db.collection('zama_revenus').find({}).lean();
    const total_revenus = revenus.reduce((s, r) => s + (r.montant_frais || 0), 0);
    res.json({ comptes, total_sous_gestion, total_revenus, nb_actifs: comptes.filter(c => c.status === 'actif').length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SMS: Notification dépôt validé (appelé depuis valider-depot)
// Déjà dans les routes existantes - on patch avec SMS

// ── SMS OTP pour inscription
// [Route send-otp remplacee par version email ligne 3095]

// ── Vérifier OTP
app.post('/api/zama/verify-otp', async (req, res) => {
  try {
    const { phone, otp, code } = req.body;
    const otpCode = otp || code;
    if (!phone || !otpCode) return res.status(400).json({ error: 'Phone et OTP requis' });
    // Normaliser le numéro — essayer toutes les variantes
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const phShort = ph.replace('+221', ''); // sans indicatif

    // Verifier d'abord dans zamaOtpStore (en memoire — nouvelle route email)
    // Chercher avec +221xxx ET sans indicatif pour compatibilité
    const storeEntry = zamaOtpStore[ph] || zamaOtpStore[phShort] || zamaOtpStore['+221' + phShort];
    const storeKey = zamaOtpStore[ph] ? ph : (zamaOtpStore[phShort] ? phShort : '+221' + phShort);
    if (storeEntry) {
      if (Date.now() > storeEntry.expireAt) {
        delete zamaOtpStore[storeKey];
        return res.json({ valid: false, verified: false, error: 'Code expire' });
      }
      if (storeEntry.code === otpCode.trim()) {
        delete zamaOtpStore[storeKey];
        console.log('[ZAMA OTP] Verification OK pour', ph);
        return res.json({ ok: true, valid: true, verified: true });
      }
      return res.json({ valid: false, verified: false, error: 'Code incorrect' });
    }

    // Fallback: verifier dans MongoDB (ancienne route)
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const record = await db.collection('zama_otp').findOne({ phone: ph, otp: otpCode, used: false, expires: { $gt: new Date() } });
    if (!record) return res.status(400).json({ valid: false, verified: false, error: 'Code invalide ou expire' });
    await db.collection('zama_otp').updateOne({ _id: record._id }, { $set: { used: true } });
    res.json({ ok: true, valid: true, verified: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── FIN ZAMA V2 ──────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════
// ZAMA TONTINE — ADMIN : Cotisations + Distributions + Vue comptes
// ══════════════════════════════════════════════════════════════════

// ── Soumettre une cotisation (en attente validation admin) ─────────
app.post('/api/zama/tontine/:tontine_id/cotiser-demande', async (req, res) => {
  try {
    const { phone, methode, reference } = req.body;
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: req.params.tontine_id });
    if (!ton) return res.status(404).json({ error: 'Tontine introuvable' });
    const membre = ton.membres && ton.membres.find(m => m.phone === phone);
    if (!membre) return res.status(403).json({ error: 'Non membre de cette tontine' });

    const cotisation_id = 'COTIS-' + Date.now();
    const cotisation = {
      cotisation_id,
      tontine_id: req.params.tontine_id,
      tontine_nom: ton.nom,
      phone,
      montant_fcfa: ton.cotisation_fcfa,
      methode: methode || 'Wave',
      reference: reference || '',
      statut: 'en_attente',
      created_at: new Date()
    };
    await db.collection('zama_cotisations').insertOne(cotisation);

    // Email aux admins
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      const base = 'https://pst-telecom-production.up.railway.app';
      const lv = base + '/api/zama/tontine/admin/valider-cotisation/' + cotisation_id + '?token=pst-admin-2026';
      const lr = base + '/api/zama/tontine/admin/rejeter-cotisation/' + cotisation_id + '?token=pst-admin-2026';
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
        subject: 'ZAMA Tontine — Cotisation a valider (' + ton.cotisation_fcfa + ' FCFA)',
        html: '<h2 style="color:#F5B014">ZAMA — Nouvelle cotisation tontine</h2>' +
          '<p><b>Tontine:</b> ' + ton.nom + '</p>' +
          '<p><b>Membre:</b> ' + phone + '</p>' +
          '<p><b>Montant:</b> ' + ton.cotisation_fcfa + ' FCFA</p>' +
          '<p><b>Methode:</b> ' + (methode || 'Wave') + '</p>' +
          '<p><b>Reference:</b> ' + (reference || 'non fournie') + '</p>' +
          '<p><b>Verifiez la reference dans votre dashboard ' + (methode || 'Wave') + ' avant de valider.</b></p>' +
          '<br><a href="' + lv + '" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px">VALIDER</a>' +
          '<a href="' + lr + '" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">REJETER</a>'
      });
    } catch(e) { console.log('[ZAMA EMAIL ERR]', e.message); }

    // SMS sandbox
    await zamaSendSMS(phone, 'ZAMA Tontine: Votre cotisation de ' + ton.cotisation_fcfa + ' FCFA pour "' + ton.nom + '" est en attente de validation (sous 1h max).');

    res.json({ ok: true, cotisation_id, message: 'Cotisation soumise — validation admin sous 1h max' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: cotisations en attente ───────────────────────────────────
app.get('/api/zama/tontine/admin/cotisations-pending', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const list = await db.collection('zama_cotisations').find({ statut: 'en_attente' }).sort({ created_at: -1 }).lean();
    res.json({ cotisations: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider une cotisation ────────────────────────────────────
app.get('/api/zama/tontine/admin/valider-cotisation/:cotisation_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const cotis = await db.collection('zama_cotisations').findOne({ cotisation_id: req.params.cotisation_id });
    if (!cotis) return res.status(404).json({ error: 'Cotisation introuvable' });
    if (cotis.statut !== 'en_attente') return res.status(400).json({ error: 'Deja traitee' });

    // Marquer le membre comme ayant cotise dans la tontine
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: cotis.tontine_id });
    if (ton) {
      // Enregistrer paiement du membre
      await db.collection('zama_tontines').updateOne(
        { tontine_id: cotis.tontine_id, 'membres.phone': cotis.phone },
        { $set: { 'membres.$.a_paye': true, 'membres.$.paye_at': new Date() } }
      );
      // Ajouter au journal des cotisations
      await db.collection('zama_tontines').updateOne(
        { tontine_id: cotis.tontine_id },
        { $push: { cotisations_journal: { phone: cotis.phone, montant: cotis.montant_fcfa, date: new Date(), cotisation_id: cotis.cotisation_id } } }
      );
      // Verifier si tous ont paye -> distribution automatique
      const tonFresh = await db.collection('zama_tontines').findOne({ tontine_id: cotis.tontine_id });
      const membres_actifs = (tonFresh.membres || []).filter(m => m.statut === 'actif');
      const tous_payes = membres_actifs.every(m => m.a_paye);
      if (tous_payes && tonFresh.beneficiaire_actuel) {
        // Creer une distribution en attente
        const dist_id = 'DIST-' + Date.now();
        await db.collection('zama_distributions').insertOne({
          distribution_id: dist_id,
          tontine_id: cotis.tontine_id,
          tontine_nom: tonFresh.nom,
          beneficiaire_phone: tonFresh.beneficiaire_actuel,
          montant_brut: tonFresh.cotisation_fcfa * membres_actifs.length,
          frais_pct: 1,
          montant_frais: Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.01),
          montant_net: Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99),
          statut: 'en_attente',
          created_at: new Date()
        });
        // Email admins pour distribution
        try {
          const nodemailer = require('nodemailer');
          const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
          const base = 'https://pst-telecom-production.up.railway.app';
          const lv = base + '/api/zama/tontine/admin/valider-distribution/' + dist_id + '?token=pst-admin-2026';
          const lr = base + '/api/zama/tontine/admin/rejeter-distribution/' + dist_id + '?token=pst-admin-2026';
          await t.sendMail({
            from: process.env.GMAIL_USER,
            to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
            subject: 'ZAMA Tontine — Distribution a effectuer ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99) + ' FCFA',
            html: '<h2 style="color:#F5B014">ZAMA — Distribution tontine prete</h2>' +
              '<p>Tous les membres ont cotise pour <b>' + tonFresh.nom + '</b></p>' +
              '<p><b>Beneficiaire:</b> ' + tonFresh.beneficiaire_actuel + '</p>' +
              '<p><b>Montant brut:</b> ' + (tonFresh.cotisation_fcfa * membres_actifs.length) + ' FCFA</p>' +
              '<p><b>Frais ZAMA (1%):</b> ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.01) + ' FCFA</p>' +
              '<p><b>A virer au beneficiaire:</b> ' + Math.round(tonFresh.cotisation_fcfa * membres_actifs.length * 0.99) + ' FCFA</p>' +
              '<p>Virez via Wave/OM puis cliquez VALIDER.</p>' +
              '<br><a href="' + lv + '" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px">DISTRIBUTION EFFECTUEE</a>' +
              '<a href="' + lr + '" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">ANNULER</a>'
          });
        } catch(e2) {}
      }
    }

    await db.collection('zama_cotisations').updateOne(
      { cotisation_id: req.params.cotisation_id },
      { $set: { statut: 'valide', valide_at: new Date() } }
    );

    await zamaSendSMS(cotis.phone, 'ZAMA Tontine: Votre cotisation de ' + cotis.montant_fcfa + ' FCFA pour "' + cotis.tontine_nom + '" a ete validee. Merci!');

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#22c55e">Cotisation validee!</h2><p>' + cotis.phone + ' — ' + cotis.montant_fcfa + ' FCFA</p><p>SMS envoye au membre.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: rejeter une cotisation ────────────────────────────────────
app.get('/api/zama/tontine/admin/rejeter-cotisation/:cotisation_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const cotis = await db.collection('zama_cotisations').findOne({ cotisation_id: req.params.cotisation_id });
    if (!cotis) return res.status(404).json({ error: 'Cotisation introuvable' });
    await db.collection('zama_cotisations').updateOne(
      { cotisation_id: req.params.cotisation_id },
      { $set: { statut: 'rejete', rejete_at: new Date() } }
    );
    await zamaSendSMS(cotis.phone, 'ZAMA Tontine: Votre cotisation de ' + cotis.montant_fcfa + ' FCFA a ete rejetee. Reference invalide. Contactez le support ZAMA.');
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#ef4444">Cotisation rejetee</h2><p>SMS envoye au membre.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: distributions en attente ─────────────────────────────────
app.get('/api/zama/tontine/admin/distributions-pending', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const list = await db.collection('zama_distributions').find({ statut: 'en_attente' }).sort({ created_at: -1 }).lean();
    res.json({ distributions: list });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: valider une distribution ─────────────────────────────────
app.get('/api/zama/tontine/admin/valider-distribution/:distribution_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const dist = await db.collection('zama_distributions').findOne({ distribution_id: req.params.distribution_id });
    if (!dist) return res.status(404).json({ error: 'Distribution introuvable' });
    if (dist.statut !== 'en_attente') return res.status(400).json({ error: 'Deja traitee' });

    await db.collection('zama_distributions').updateOne(
      { distribution_id: req.params.distribution_id },
      { $set: { statut: 'distribue', distribue_at: new Date() } }
    );

    // Reset a_paye de tous les membres + passer au tour suivant
    const ton = await db.collection('zama_tontines').findOne({ tontine_id: dist.tontine_id });
    if (ton) {
      const membres = ton.membres || [];
      const membres_reset = membres.map(m => ({ ...m, a_paye: false }));
      const tour_actuel = (ton.tour_actuel || 0) + 1;
      const membres_actifs = membres.filter(m => m.statut === 'actif');
      const terminee = tour_actuel >= membres_actifs.length;
      const prochain_ben = terminee ? null : membres_actifs[tour_actuel % membres_actifs.length]?.phone;
      await db.collection('zama_tontines').updateOne(
        { tontine_id: dist.tontine_id },
        { $set: { membres: membres_reset, tour_actuel, beneficiaire_actuel: prochain_ben, status: terminee ? 'termine' : 'actif' } }
      );
    }

    // SMS beneficiaire
    await zamaSendSMS(dist.beneficiaire_phone, 'ZAMA Tontine "' + dist.tontine_nom + '": Votre pot de ' + dist.montant_net + ' FCFA a ete vire sur votre compte Wave/OM. Felicitations!');

    // SMS tous les membres
    if (ton) {
      for (const m of (ton.membres || [])) {
        if (m.phone !== dist.beneficiaire_phone) {
          await zamaSendSMS(m.phone, 'ZAMA Tontine "' + dist.tontine_nom + '": Le pot de ' + dist.montant_net + ' FCFA a ete distribue a ' + dist.beneficiaire_phone + '. Prochain tour en cours.');
        }
      }
    }

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#22c55e">Distribution validee!</h2><p>' + dist.montant_net + ' FCFA -> ' + dist.beneficiaire_phone + '</p><p>SMS envoye a tous les membres.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: rejeter une distribution ─────────────────────────────────
app.get('/api/zama/tontine/admin/rejeter-distribution/:distribution_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    await db.collection('zama_distributions').updateOne(
      { distribution_id: req.params.distribution_id },
      { $set: { statut: 'annule', annule_at: new Date() } }
    );
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#ef4444">Distribution annulee</h2></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: tous les comptes tontine ──────────────────────────────────
app.get('/api/zama/tontine/admin/tous-comptes', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    const tontines = await db.collection('zama_tontines').find({}).sort({ created_at: -1 }).lean();
    const distributions = await db.collection('zama_distributions').find({ statut: 'distribue' }).lean();
    const total_distribue = distributions.reduce((s, d) => s + (d.montant_net || 0), 0);
    const total_frais = distributions.reduce((s, d) => s + (d.montant_frais || 0), 0);
    const nb_actives = tontines.filter(t => t.status === 'actif').length;
    res.json({
      tontines,
      stats: {
        nb_tontines: tontines.length,
        nb_actives,
        total_distribue,
        total_frais,
        nb_distributions: distributions.length
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── ZAMA Username — vérifier unicité + mettre à jour ────────────────
app.post('/api/zama/username/check', async (req, res) => {
  try {
    const { username, user_id } = req.body;
    if (!username || username.length < 3) return res.status(400).json({ error: 'Username trop court' });
    const clean = username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
    if (!db) return res.json({ available: true, username: clean });
    const existing = await db.collection('zama_users').findOne({ username: clean });
    if (existing && existing.id !== user_id) {
      return res.json({ available: false, username: clean });
    }
    res.json({ available: true, username: clean });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/zama/username/update', async (req, res) => {
  try {
    const { phone, username } = req.body;
    if (!phone || !username) return res.status(400).json({ error: 'Données manquantes' });
    const clean = username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
    if (clean.length < 3) return res.status(400).json({ error: 'Username trop court' });
    if (!db) return res.json({ ok: true, username: clean });
    // Vérifier unicité
    const existing = await db.collection('zama_users').findOne({ username: clean });
    if (existing && existing.phone !== phone) {
      return res.status(409).json({ error: '@' + clean + ' est déjà pris' });
    }
    await db.collection('zama_users').updateOne(
      { phone },
      { $set: { username: clean, updated_at: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, username: clean });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ══════════════════════════════════════════════════════════════════
// ZAMA ÉPARGNE — Plans avec intérêts (Libre, 3m, 6m, 1an)
// ══════════════════════════════════════════════════════════════════

// Plans disponibles
const ZAMA_PLANS = {
  // frais_retrait = a echeance | frais_anticipe = avant echeance
  libre:      { nom: 'Libre',   taux_annuel: 0,    duree_jours: 0,   frais_retrait: 0.01,  frais_anticipe: 0.01 },
  trois_mois: { nom: '3 Mois',  taux_annuel: 0.01,  duree_jours: 90,  frais_retrait: 0,     frais_anticipe: 0.02 },
  six_mois:   { nom: '6 Mois',  taux_annuel: 0.025, duree_jours: 180, frais_retrait: 0,     frais_anticipe: 0.03 },
  un_an:      { nom: '1 An',    taux_annuel: 0.05,  duree_jours: 365, frais_retrait: 0,     frais_anticipe: 0.04 },
};

// Créer un plan épargne avec type
app.post('/api/zama/epargne/plan/create', async (req, res) => {
  try {
    const { user_id, user_name, user_phone, objectif_fcfa, description, plan_type, password } = req.body;
    if (!user_id || !objectif_fcfa || !plan_type) {
      return res.status(400).json({ error: 'user_id, objectif_fcfa, plan_type requis' });
    }
    const plan = ZAMA_PLANS[plan_type];
    if (!plan) return res.status(400).json({ error: 'Plan invalide. Choisissez: libre, trois_mois, six_mois, un_an' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    // Vérifier KYC si objectif > 100 000 FCFA
    if (parseInt(objectif_fcfa) > 100000) {
      const u = await db.collection('zama_users').findOne({ id: user_id });
      if (!u || !u.kyc || u.kyc_pending) {
        return res.status(403).json({ error: 'KYC requis pour un objectif > 100 000 FCFA' });
      }
    }

    const epargne_id = 'EP-' + Date.now();
    const date_debut = new Date();
    const date_fin = plan.duree_jours > 0
      ? new Date(Date.now() + plan.duree_jours * 24 * 60 * 60 * 1000)
      : null;

    const epargne = {
      epargne_id,
      user_id,
      user_name: user_name || '',
      user_phone: user_phone || '',
      objectif_fcfa: parseInt(objectif_fcfa),
      solde_fcfa: 0,
      interets_cumules: 0,
      plan_type,
      plan_nom: plan.nom,
      taux_annuel: plan.taux_annuel,
      taux_mensuel: parseFloat((plan.taux_annuel / 12).toFixed(6)),
      description: description || 'Mon épargne ZAMA',
      retrait_libre: plan_type === 'libre',
      frais_retrait: plan.frais_retrait,
      frais_anticipe: plan.frais_anticipe,
      password: password || null,
      status: 'actif',
      progression: 0,
      date_debut,
      date_fin,
      date_prochain_interet: new Date(date_debut.getFullYear(), date_debut.getMonth() + 1, date_debut.getDate()),
      transactions: [],
      historique_interets: [],
      created_at: new Date(),
    };

    await db.collection('zama_epargnes').insertOne(epargne);

    // SMS de bienvenue
    if (user_phone) {
      const taux_str = plan.taux_annuel > 0 ? ' - Taux ' + (plan.taux_annuel * 100).toFixed(1) + '%/an' : '';
      await zamaSendSMS(user_phone,
        'ZAMA Epargne: Plan "' + plan.nom + '" cree' + taux_str + '. Objectif: ' +
        parseInt(objectif_fcfa).toLocaleString('fr-FR') + ' FCFA. Commencez a deposer!'
      );
    }

    res.json({ ok: true, epargne_id, date_fin, plan, message: 'Plan ' + plan.nom + ' créé avec succès' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Appliquer les intérêts mensuels sur tous les plans actifs (cron ou admin)
app.post('/api/zama/epargne/admin/appliquer-interets-plans', async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const maintenant = new Date();
    // Trouver tous les plans avec intérêts dont la date d'intérêt est passée
    const epargnes = await db.collection('zama_epargnes').find({
      status: 'actif',
      taux_annuel: { $gt: 0 },
      solde_fcfa: { $gt: 0 },
      date_prochain_interet: { $lte: maintenant }
    }).lean();

    let traites = 0;
    let total_interets = 0;

    for (const ep of epargnes) {
      const interet = Math.round(ep.solde_fcfa * ep.taux_mensuel);
      if (interet < 1) continue;

      const prochaine_date = new Date(ep.date_prochain_interet);
      prochaine_date.setMonth(prochaine_date.getMonth() + 1);

      await db.collection('zama_epargnes').updateOne(
        { epargne_id: ep.epargne_id },
        {
          $inc: { solde_fcfa: interet, interets_cumules: interet },
          $set: { date_prochain_interet: prochaine_date },
          $push: {
            historique_interets: {
              date: maintenant,
              montant: interet,
              solde_avant: ep.solde_fcfa,
              taux: ep.taux_mensuel
            }
          }
        }
      );

      // SMS notification
      if (ep.user_phone) {
        await zamaSendSMS(ep.user_phone,
          'ZAMA Epargne "' + ep.description + '": ' + interet.toLocaleString('fr-FR') +
          ' FCFA d\'interets credites! Nouveau solde: ' +
          (ep.solde_fcfa + interet).toLocaleString('fr-FR') + ' FCFA.'
        );
      }

      traites++;
      total_interets += interet;
    }

    res.json({ ok: true, traites, total_interets, message: traites + ' plans mis à jour' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats publiques des plans (pour affichage frontend)
app.get('/api/zama/epargne/plans', (req, res) => {
  res.json({ plans: ZAMA_PLANS });
});


// ══════════════════════════════════════════════════════════════════
// ZAMA CONFIG — Textes modifiables depuis l'admin
// ══════════════════════════════════════════════════════════════════

// Config par défaut
const ZAMA_CONFIG_DEFAULT = {
  epargne_carte_tag: "Jusqu'a 5%/an",
  epargne_carte_sous: "0% frais a l'echeance",
  epargne_vitrine_titre: "Faites fructifier votre argent",
  epargne_vitrine_sous: "Des plans d'epargne adaptes a vos objectifs. Vos fonds restent disponibles, vos interets tombent chaque mois.",
  epargne_badge: "NOUVEAU",
  tontine_carte_sous: "Cotisez en groupe",
};

// GET config publique
app.get('/api/zama/config', async (req, res) => {
  try {
    if (!db) return res.json(ZAMA_CONFIG_DEFAULT);
    const cfg = await db.collection('zama_config').findOne({ key: 'main' });
    res.json(cfg ? { ...ZAMA_CONFIG_DEFAULT, ...cfg.data } : ZAMA_CONFIG_DEFAULT);
  } catch(e) { res.json(ZAMA_CONFIG_DEFAULT); }
});

// POST config (admin seulement)
app.post('/api/zama/config', async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorise' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'data requis' });
    await db.collection('zama_config').updateOne(
      { key: 'main' },
      { $set: { key: 'main', data, updated_at: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, message: 'Configuration sauvegardee' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ══════════════════════════════════════════════════════════════════
// ZAMA PRÊT — Module crédit lié à l'épargne
// ══════════════════════════════════════════════════════════════════

// Paramètres prêt
const PRET_TAUX_MENSUEL = 0.03;       // 3% par mois
const PRET_MAX_MULTIPLICATEUR = 2;    // max 2x l'épargne
const PRET_EPARGNE_MIN = 30000;       // 30 000 FCFA minimum
const PRET_DUREE_MAX = 3;             // 3 mois maximum

// Demande de prêt
app.post('/api/zama/pret/demander', async (req, res) => {
  try {
    const { user_id, user_name, user_phone, montant_fcfa, duree_mois, motif } = req.body;
    if (!user_id || !montant_fcfa || !duree_mois) {
      return res.status(400).json({ error: 'user_id, montant_fcfa, duree_mois requis' });
    }
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    // Vérifier KYC
    const u = await db.collection('zama_users').findOne({ id: user_id });
    if (!u || !u.kyc || u.kyc_pending) {
      return res.status(403).json({ error: 'KYC requis pour obtenir un prêt', kyc_required: true });
    }

    // Vérifier épargne suffisante
    const epargnes = await db.collection('zama_epargnes').find({
      user_id, status: 'actif'
    }).lean();
    const total_epargne = epargnes.reduce((s, e) => s + (e.solde_fcfa || 0), 0);

    if (total_epargne < PRET_EPARGNE_MIN) {
      return res.status(400).json({
        error: 'Épargne insuffisante. Minimum ' + PRET_EPARGNE_MIN.toLocaleString('fr-FR') + ' FCFA requis',
        epargne_actuelle: total_epargne,
        epargne_requise: PRET_EPARGNE_MIN
      });
    }

    const montant_max = total_epargne * PRET_MAX_MULTIPLICATEUR;
    if (parseInt(montant_fcfa) > montant_max) {
      return res.status(400).json({
        error: 'Montant trop élevé. Maximum autorisé: ' + Math.floor(montant_max).toLocaleString('fr-FR') + ' FCFA (2x votre épargne)',
        montant_max: Math.floor(montant_max)
      });
    }

    if (parseInt(duree_mois) > PRET_DUREE_MAX) {
      return res.status(400).json({ error: 'Durée maximum ' + PRET_DUREE_MAX + ' mois' });
    }

    // Vérifier pas de prêt en cours
    const pret_actif = await db.collection('zama_prets').findOne({
      user_id, status: { $in: ['en_attente', 'actif'] }
    });
    if (pret_actif) {
      return res.status(400).json({ error: 'Vous avez déjà un prêt en cours. Remboursez-le d\'abord.' });
    }

    // Calcul
    const montant = parseInt(montant_fcfa);
    const duree = parseInt(duree_mois);
    const interets_total = Math.round(montant * PRET_TAUX_MENSUEL * duree);
    const total_a_rembourser = montant + interets_total;
    const mensualite = Math.round(total_a_rembourser / duree);
    const date_echeance = new Date(Date.now() + duree * 30 * 24 * 60 * 60 * 1000);

    const pret_id = 'PRET-' + Date.now();
    const pret = {
      pret_id,
      user_id,
      user_name: user_name || '',
      user_phone: user_phone || '',
      montant_fcfa: montant,
      duree_mois: duree,
      taux_mensuel: PRET_TAUX_MENSUEL,
      interets_total,
      total_a_rembourser,
      mensualite,
      solde_restant: total_a_rembourser,
      motif: motif || '',
      epargne_caution: total_epargne,
      status: 'en_attente', // en_attente → actif → rembourse / defaut
      date_echeance,
      remboursements: [],
      created_at: new Date(),
    };

    await db.collection('zama_prets').insertOne(pret);

    // SMS utilisateur
    await zamaSendSMS(user_phone,
      'ZAMA Pret: Votre demande de ' + montant.toLocaleString('fr-FR') +
      ' FCFA sur ' + duree + ' mois est en cours d\'examen. ' +
      'Mensualite: ' + mensualite.toLocaleString('fr-FR') + ' FCFA. Reponse sous 24h.'
    );

    // Email admins
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      const base = 'https://pst-telecom-production.up.railway.app';
      const lv = base + '/api/zama/pret/admin/approuver/' + pret_id + '?token=pst-admin-2026';
      const lr = base + '/api/zama/pret/admin/rejeter/' + pret_id + '?token=pst-admin-2026';
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
        subject: 'ZAMA Pret — Nouvelle demande ' + montant.toLocaleString('fr-FR') + ' FCFA',
        html: '<h2 style="color:#F5B014">ZAMA — Nouvelle demande de prêt</h2>' +
          '<p><b>Client:</b> ' + (user_name || user_id) + ' — ' + user_phone + '</p>' +
          '<p><b>Montant demandé:</b> ' + montant.toLocaleString('fr-FR') + ' FCFA</p>' +
          '<p><b>Durée:</b> ' + duree + ' mois</p>' +
          '<p><b>Mensualité:</b> ' + mensualite.toLocaleString('fr-FR') + ' FCFA</p>' +
          '<p><b>Total à rembourser:</b> ' + total_a_rembourser.toLocaleString('fr-FR') + ' FCFA</p>' +
          '<p><b>Intérêts (3%/mois):</b> ' + interets_total.toLocaleString('fr-FR') + ' FCFA</p>' +
          '<p><b>Épargne caution:</b> ' + total_epargne.toLocaleString('fr-FR') + ' FCFA</p>' +
          '<p><b>Motif:</b> ' + (motif || 'Non précisé') + '</p>' +
          '<p><b>Échéance:</b> ' + date_echeance.toLocaleDateString('fr-FR') + '</p>' +
          '<br><a href="' + lv + '" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-right:12px">✅ APPROUVER</a>' +
          '<a href="' + lr + '" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">❌ REJETER</a>'
      });
    } catch(e) { console.log('[PRET EMAIL]', e.message); }

    res.json({ ok: true, pret_id, mensualite, total_a_rembourser, interets_total, date_echeance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: approuver un prêt
app.get('/api/zama/pret/admin/approuver/:pret_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    const pret = await db.collection('zama_prets').findOne({ pret_id: req.params.pret_id });
    if (!pret) return res.status(404).send('Prêt introuvable');
    if (pret.status !== 'en_attente') return res.send('<h2>Déjà traité</h2>');

    await db.collection('zama_prets').updateOne(
      { pret_id: req.params.pret_id },
      { $set: { status: 'actif', approuve_at: new Date() } }
    );

    await zamaSendSMS(pret.user_phone,
      'ZAMA Pret APPROUVE! ' + pret.montant_fcfa.toLocaleString('fr-FR') +
      ' FCFA vires sur votre compte Wave/OM sous 1h. ' +
      'Mensualite: ' + pret.mensualite.toLocaleString('fr-FR') +
      ' FCFA/mois pendant ' + pret.duree_mois + ' mois. Echeance: ' +
      new Date(pret.date_echeance).toLocaleDateString('fr-FR') + '.'
    );

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#22c55e">✅ Prêt approuvé!</h2><p>' + pret.user_name + ' — ' + pret.montant_fcfa.toLocaleString('fr-FR') + ' FCFA</p><p>SMS envoyé au client. Virez les fonds via Wave/OM.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: rejeter un prêt
app.get('/api/zama/pret/admin/rejeter/:pret_id', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).send('Non autorisé');
    const pret = await db.collection('zama_prets').findOne({ pret_id: req.params.pret_id });
    if (!pret) return res.status(404).send('Prêt introuvable');

    await db.collection('zama_prets').updateOne(
      { pret_id: req.params.pret_id },
      { $set: { status: 'rejete', rejete_at: new Date() } }
    );

    await zamaSendSMS(pret.user_phone,
      'ZAMA: Votre demande de pret de ' + pret.montant_fcfa.toLocaleString('fr-FR') +
      ' FCFA a ete rejetee. Augmentez votre epargne et reessayez. Support: support@zama.sn'
    );

    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2 style="color:#ef4444">Prêt rejeté</h2><p>SMS envoyé au client.</p></body></html>');
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Enregistrer un remboursement
app.post('/api/zama/pret/:pret_id/rembourser', async (req, res) => {
  try {
    const { montant_fcfa, methode, reference } = req.body;
    const pret = await db.collection('zama_prets').findOne({ pret_id: req.params.pret_id });
    if (!pret) return res.status(404).json({ error: 'Prêt introuvable' });
    if (pret.status !== 'actif') return res.status(400).json({ error: 'Prêt non actif' });

    const remb_id = 'REMB-' + Date.now();
    const montant = parseInt(montant_fcfa);
    const nouveau_solde = Math.max(0, pret.solde_restant - montant);
    const rembourse = nouveau_solde === 0;

    await db.collection('zama_prets').updateOne(
      { pret_id: req.params.pret_id },
      {
        $set: {
          solde_restant: nouveau_solde,
          status: rembourse ? 'rembourse' : 'actif'
        },
        $push: {
          remboursements: {
            remb_id, montant, methode: methode || 'Wave',
            reference: reference || '', date: new Date(), statut: 'en_attente'
          }
        }
      }
    );

    // Email admin pour valider le remboursement
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      await t.sendMail({
        from: process.env.GMAIL_USER,
        to: 'tpapaseny@ept.sn,papasenytoure@gmail.com',
        subject: 'ZAMA Pret — Remboursement recu ' + montant.toLocaleString('fr-FR') + ' FCFA',
        html: '<h2>Remboursement reçu</h2>' +
          '<p><b>Client:</b> ' + pret.user_name + ' (' + pret.user_phone + ')</p>' +
          '<p><b>Montant:</b> ' + montant.toLocaleString('fr-FR') + ' FCFA via ' + (methode || 'Wave') + '</p>' +
          '<p><b>Référence:</b> ' + (reference || 'non fournie') + '</p>' +
          '<p><b>Solde restant:</b> ' + nouveau_solde.toLocaleString('fr-FR') + ' FCFA</p>' +
          (rembourse ? '<p style="color:green"><b>🎉 PRÊT TOTALEMENT REMBOURSÉ!</b></p>' : '')
      });
    } catch(e) {}

    await zamaSendSMS(pret.user_phone,
      'ZAMA Pret: Remboursement de ' + montant.toLocaleString('fr-FR') +
      ' FCFA recu. Solde restant: ' + nouveau_solde.toLocaleString('fr-FR') + ' FCFA.' +
      (rembourse ? ' Pret solde! Merci.' : '')
    );

    res.json({ ok: true, solde_restant: nouveau_solde, rembourse, remb_id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mes prêts
app.get('/api/zama/pret/user/:user_id', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const prets = await db.collection('zama_prets').find({ user_id: req.params.user_id }).sort({ created_at: -1 }).lean();
    res.json(prets.map(p => { const { _id, ...r } = p; return r; }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Admin: tous les prêts
app.get('/api/zama/pret/admin/tous', async (req, res) => {
  try {
    if (req.query.token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.json({ prets: [], stats: {} });
    const prets = await db.collection('zama_prets').find({}).sort({ created_at: -1 }).limit(100).lean();
    const en_attente = prets.filter(p => p.status === 'en_attente').length;
    const actifs = prets.filter(p => p.status === 'actif').length;
    const total_encours = prets.filter(p => p.status === 'actif').reduce((s, p) => s + p.solde_restant, 0);
    const total_interets = prets.filter(p => p.status === 'rembourse').reduce((s, p) => s + p.interets_total, 0);
    res.json({ prets: prets.map(p => { const { _id, ...r } = p; return r; }), stats: { en_attente, actifs, total_encours, total_interets } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Éligibilité prêt
app.get('/api/zama/pret/eligibilite/:user_id', async (req, res) => {
  try {
    if (!db) return res.json({ eligible: false, raison: 'DB indisponible' });
    const u = await db.collection('zama_users').findOne({ id: req.params.user_id });
    if (!u || !u.kyc || u.kyc_pending) return res.json({ eligible: false, raison: 'KYC requis', kyc_required: true });
    const epargnes = await db.collection('zama_epargnes').find({ user_id: req.params.user_id, status: 'actif' }).lean();
    const total = epargnes.reduce((s, e) => s + (e.solde_fcfa || 0), 0);
    const pret_actif = await db.collection('zama_prets').findOne({ user_id: req.params.user_id, status: { $in: ['en_attente', 'actif'] } });
    if (pret_actif) return res.json({ eligible: false, raison: 'Prêt en cours actif', pret_actif: pret_actif.pret_id });
    if (total < PRET_EPARGNE_MIN) return res.json({ eligible: false, raison: 'Épargne insuffisante', epargne_actuelle: total, epargne_requise: PRET_EPARGNE_MIN });
    res.json({ eligible: true, epargne_total: total, montant_max: Math.floor(total * PRET_MAX_MULTIPLICATEUR) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ─── INFOBIP SMS (ZAMA) ────────────────────────────────────────────────────
const INFOBIP_API_KEY = '31f52d00c3a4fbb92c00c72139556f43-e7142bf0-5334-471d-b7a3-4a8aa24c1492';
const INFOBIP_SENDER  = 'ZAMA';
const INFOBIP_BASE_URL = 'https://y42xy1.api.infobip.com';

async function envoyerSMSInfobip(telephone, message) {
  try {
    const response = await fetch(INFOBIP_BASE_URL + '/sms/2/text/advanced', {
      method: 'POST',
      headers: {
        'Authorization': 'App ' + INFOBIP_API_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      body: JSON.stringify({
        messages: [{
          from: INFOBIP_SENDER,
          destinations: [{ to: telephone }],
          text: message
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[Infobip] Erreur HTTP ' + response.status + ':', JSON.stringify(data));
      return { success: false, error: data };
    }
    const status = data.messages && data.messages[0] ? data.messages[0].status : {};
    console.log('[Infobip] SMS envoyé à ' + telephone + ' | Status: ' + (status.name || 'OK'));
    return { success: true, data };
  } catch (err) {
    console.error('[Infobip] Exception:', err.message);
    return { success: false, error: err.message };
  }
}

// Route test SMS Infobip (admin uniquement)
app.post('/api/infobip/test-sms', async (req, res) => {
  const { telephone, message, token } = req.body;
  if (token !== 'pst-admin-2026') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  if (!telephone || !message) {
    return res.status(400).json({ error: 'telephone et message requis' });
  }
  const result = await envoyerSMSInfobip(telephone, message);
  res.json(result);
});

// Route SMS ZAMA — confirmation de transaction
app.post('/api/zama/sms-confirmation', async (req, res) => {
  const { telephone, montant, devise_source, devise_cible, reference } = req.body;
  if (!telephone || !montant || !devise_source || !devise_cible || !reference) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }
  const msg = 'ZAMA: Votre echange de ' + montant + ' ' + devise_source
            + ' vers ' + devise_cible
            + ' (Ref: ' + reference + ') est confirme. Merci de votre confiance.';
  const result = await envoyerSMSInfobip(telephone, msg);
  res.json(result);
});

// Route SMS ZAMA — OTP / code de verification
app.post('/api/zama/sms-otp', async (req, res) => {
  const { telephone, code } = req.body;
  if (!telephone || !code) {
    return res.status(400).json({ error: 'telephone et code requis' });
  }
  const msg = 'ZAMA: Votre code de verification est ' + code
            + '. Valable 10 minutes. Ne le partagez jamais.';
  const result = await envoyerSMSInfobip(telephone, msg);
  res.json(result);
});
// ─── FIN INFOBIP SMS ────────────────────────────────────────────────────────


// Route SMS notification de connexion ZAMA
app.post('/api/zama/login-notify', async(req, res) => {
  try {
    const { phone, prenom } = req.body;
    if (!phone) return res.json({ success: false });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const nm = prenom || 'Client';
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const msg = 'ZAMA: Connexion a votre compte detectee a ' + now + '. Si ce n\'est pas vous, changez votre mot de passe immediatement sur zama-sn.com';
    envoyerSMSInfobip(ph, msg).catch(function() {});
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ─── ZAMA OTP CONNEXION + DELETE USER ──────────────────────────────────────

// Stockage OTP en mémoire (clé: phone, valeur: {code, expireAt})

// Envoyer OTP connexion
app.post('/api/zama/send-otp', async(req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numero requis' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    zamaOtpStore[ph] = { code, expireAt };

    // Chercher l'email de l'utilisateur dans MongoDB
    let emailSent = false;
    if (db) {
      const user = await db.collection('zama_users').findOne({ phone: ph });
      if (user && user.email) {
        try {
          const nodemailer = require('nodemailer');
          const t = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
          });
          await t.sendMail({
            from: process.env.GMAIL_USER,
            to: user.email,
            subject: 'ZAMA — Votre code de connexion',
            html: '<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;background:#070D1A;color:#fff;border-radius:12px">' +
              '<h2 style="color:#F59E0B">🔐 Code de connexion ZAMA</h2>' +
              '<p>Bonjour ' + (user.prenom || '') + ',</p>' +
              '<p>Votre code de connexion est :</p>' +
              '<div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#131F2E;border-radius:8px;color:#F59E0B">' + code + '</div>' +
              '<p style="color:#888;font-size:12px;margin-top:16px">Valable 10 minutes. Ne le partagez jamais.</p>' +
              '<p style="color:#888;font-size:11px">ZAMA — Bureau de Change Digital | zama-sn.com</p>' +
              '</div>'
          });
          emailSent = true;
          console.log('[ZAMA OTP] Code envoye par email a ' + user.email);
        } catch (emailErr) {
          console.warn('[ZAMA OTP] Email echoue:', emailErr.message);
        }
      }
    }

    // Fallback SMS Infobip si pas d email
    let smsSent = false;
    if (!emailSent) {
      try {
        const msg = 'ZAMA: Votre code de connexion est ' + code + '. Valable 10 minutes. Ne le partagez jamais.';
        await envoyerSMSInfobip(ph, msg);
        smsSent = true;
        console.log('[ZAMA OTP] Code envoye par SMS a ' + ph);
      } catch (smsErr) {
        console.warn('[ZAMA OTP] SMS echoue:', smsErr.message);
      }
    }

    // Toujours retourner le code dans la reponse — affiche dans l'app si email/SMS echouent
    const bothFailed = !emailSent && !smsSent;

    res.json({ success: true, method: emailSent ? 'email' : (smsSent ? 'sms' : 'fallback'), code: code });
  } catch (e) {
    console.error('[ZAMA OTP]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// [verify-otp: route consolidee ligne 2224 — doublon supprime]

// Supprimer un utilisateur ZAMA (admin)
app.delete('/api/zama/user', async(req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== (process.env.ADMIN_PASSWORD || 'Pstdiama@1')) {
      return res.status(403).json({ error: 'Non autorise' });
    }
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    if (db) {
      await db.collection('zama_users').deleteOne({ $or: [{ phone: ph }, { phone: phone }] });
    }
    res.json({ success: true, message: 'Utilisateur supprime: ' + ph });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ─── FIN ZAMA OTP CONNEXION + DELETE USER ──────────────────────────────────


// ─── SEN-SMS — ENVOI BULK VIA INFOBIP

// Route envoi campagne Sen-SMS
app.post('/api/sen-sms/send', async (req, res) => {
  try {
    var messages = req.body.messages || [];
    var sender = req.body.sender || 'SenSMS';
    var campagne = req.body.campagne || 'Campagne';
    if (!messages.length) return res.json({ success: false, error: 'Aucun message' });

    var TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || '1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823';
    var results = [];
    var errors = 0;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      try {
        var url = 'https://app.techsoft-sms.com/api/http/' +
          '?token=' + encodeURIComponent(TECHSOFT_TOKEN) +
          '&to=' + encodeURIComponent(msg.telephone) +
          '&message=' + encodeURIComponent(msg.message) +
          '&sender_id=' + encodeURIComponent(sender.substring(0, 11));
        var r = await fetch(url);
        var txt = await r.text();
        results.push({ telephone: msg.telephone, status: txt });
        if (txt.includes('ERROR') || txt.includes('error')) errors++;
      } catch(e) {
        errors++;
        results.push({ telephone: msg.telephone, status: 'error: ' + e.message });
      }
    }

    // Sauvegarder la campagne en MongoDB
    if (db) {
      try {
        var userId = req.body.userId || 'anonymous';
        var campDoc = {
          userId: userId,
          campagne: campagne,
          sender: sender,
          total: messages.length,
          envoyes: messages.length - errors,
          echecs: errors,
          statut: errors === 0 ? 'success' : (errors === messages.length ? 'failed' : 'partial'),
          messages: messages.slice(0, 5), // garder les 5 premiers pour aperçu
          createdAt: new Date()
        };
        await db.collection('sensms_campaigns').insertOne(campDoc);
      } catch(dbErr) { console.error('Save campaign error:', dbErr.message); }
    }

    res.json({
      success: true,
      sent: messages.length - errors,
      errors: errors,
      total: messages.length,
      results: results.slice(0, 10)
    });
  } catch(e) {
    console.error('SEN-SMS send error:', e);
    res.json({ success: false, error: e.message });
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
    const campagnes = await db.collection('sen_sms_campagnes').find({}).sort({ created_at: -1 }).limit(50).lean();
    res.json({ success: true, campagnes });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});


// ================================================
// SEN-SMS AUTH (MongoDB)
// ================================================

// === SENSMS ROUTES ===
var SensmsUser = null;


// ── DÉMARRAGE ─────────────────────────────

// ═══════════════════════════════════════════════════════════════
// ─── JSONBIN.IO — Stockage persistant SenSMS (remplace MongoDB)
// ═══════════════════════════════════════════════════════════════
const JSONBIN_MASTER_KEY = process.env.JSONBIN_MASTER_KEY || "$2a$10$6wx4e4ryFO7kXX.tUIBfIeM.BRERmrVlVwqDk/Qj3be1hF5gsUg1O";
const JSONBIN_BASE = "https://api.jsonbin.io/v3";

// IDs des bins (créés automatiquement au premier démarrage, puis sauvegardés en vars Render)
let BINS = {
  users:     process.env.JSONBIN_USERS_BIN     || null,
  campaigns: process.env.JSONBIN_CAMPAIGNS_BIN || null,
  contacts:  process.env.JSONBIN_CONTACTS_BIN  || null,
  penc_users:  process.env.JSONBIN_PENC_USERS_BIN  || null,
  penc_convs:  process.env.JSONBIN_PENC_CONVS_BIN  || null,
  penc_msgs:   process.env.JSONBIN_PENC_MSGS_BIN   || null,
  penc_status: process.env.JSONBIN_PENC_STATUS_BIN || null,
  penc_push:   process.env.JSONBIN_PENC_PUSH_BIN   || null
};

async function jbGet(binId) {
  if (!binId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_MASTER_KEY },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) { console.error('jbGet error:', res.status, 'bin:', binId, '| Check JSONBIN_MASTER_KEY + bin IDs dans Render'); return null; }
    const data = await res.json();
    return data.record;
  } catch(e) {
    console.error("jbGet exception:", e.message, "binId:", binId);
    return null;
  }
}

async function jbSet(binId, record) {
  if (!binId) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(record),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) console.error("jbSet error:", res.status, binId);
    return res.ok;
  } catch(e) {
    console.error("jbSet exception:", e.message, "binId:", binId);
    return false;
  }
}

async function jbCreate(name, initialData) {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY,
        "X-Bin-Name": name,
        "X-Bin-Private": "true"
      },
      body: JSON.stringify(initialData)
    });
    const data = await res.json();
    return data.metadata?.id || null;
  } catch(e) { return null; }
}

async function initJSONBins() {
  console.log("📦 Initialisation JSONBin SenSMS...");
  if (!BINS.users) {
    BINS.users = await jbCreate("sensms_users", { users: [] });
    if (BINS.users) console.log("✅ Bin users créé:", BINS.users);
  }
  if (!BINS.campaigns) {
    BINS.campaigns = await jbCreate("sensms_campaigns", { campaigns: [] });
    if (BINS.campaigns) console.log("✅ Bin campaigns créé:", BINS.campaigns);
  }
  if (!BINS.contacts) {
    BINS.contacts = await jbCreate("sensms_contacts", { contacts: [] });
    if (BINS.contacts) console.log("✅ Bin contacts créé:", BINS.contacts);
  }
  if (!BINS.penc_users)  { BINS.penc_users  = await jbCreate("penc_users",  { users: [] });    if (BINS.penc_users)  console.log("✅ Bin penc_users créé:",  BINS.penc_users); }
  if (!BINS.penc_convs)  { BINS.penc_convs  = await jbCreate("penc_convs",  { convs: [] });    if (BINS.penc_convs)  console.log("✅ Bin penc_convs créé:",  BINS.penc_convs); }
  if (!BINS.penc_msgs)   { BINS.penc_msgs   = await jbCreate("penc_msgs",   { msgs: [] });     if (BINS.penc_msgs)   console.log("✅ Bin penc_msgs créé:",   BINS.penc_msgs); }
  if (!BINS.penc_status) { BINS.penc_status = await jbCreate("penc_status", { statuses: [] }); if (BINS.penc_status) console.log("✅ Bin penc_status créé:", BINS.penc_status); }
  if (!BINS.penc_push)   { BINS.penc_push   = await jbCreate("penc_push",   { subs: [] });     if (BINS.penc_push)   console.log("✅ Bin penc_push créé:",   BINS.penc_push); }
  console.log("📦 JSONBin BINS IDs:", JSON.stringify(BINS));
  console.log("⚠️  IMPORTANT: Ajoute ces IDs comme variables Render pour ne pas les perdre !");
  console.log("   JSONBIN_USERS_BIN =", BINS.users);
  console.log("   JSONBIN_CAMPAIGNS_BIN =", BINS.campaigns);
  console.log("   JSONBIN_CONTACTS_BIN =", BINS.contacts);
  console.log("   JSONBIN_PENC_USERS_BIN =", BINS.penc_users);
  console.log("   JSONBIN_PENC_CONVS_BIN =", BINS.penc_convs);
  console.log("   JSONBIN_PENC_MSGS_BIN =", BINS.penc_msgs);
  console.log("   JSONBIN_PENC_STATUS_BIN =", BINS.penc_status);
  console.log("   JSONBIN_PENC_PUSH_BIN =", BINS.penc_push);
}

initJSONBins().catch(console.error);

// ─── PENC PUSH (web-push) ───────────────────────────────────
let webpush = null;
try {
  webpush = require('web-push');
  const VPUB = process.env.VAPID_PUBLIC_KEY || '';
  const VPRIV = process.env.VAPID_PRIVATE_KEY || '';
  if (VPUB && VPRIV) { webpush.setVapidDetails('mailto:papasenytoure@gmail.com', VPUB, VPRIV); console.log('✅ web-push configuré'); }
  else { webpush = null; console.log('⚠️ VAPID manquant — push désactivé'); }
} catch (e) { webpush = null; console.log('⚠️ web-push non installé — push désactivé:', e.message); }
async function fetchWithTimeout(url,ms){
  const ac=new AbortController(); const t=setTimeout(()=>ac.abort(),ms);
  try{ const r=await fetch(url,{signal:ac.signal}); clearTimeout(t); return r; }catch(e){ clearTimeout(t); throw e; }
}
async function getGeoForIp(rawIp){
  const ip=(rawIp||'').replace('::ffff:','').split(',')[0].trim();
  if(!ip||ip==='unknown'||ip.startsWith('10.')||ip.startsWith('172.')||ip==='::1') return null;
  const geoSvcs=[
    {url:'https://ipwho.is/'+ip, parse:function(d){return d.success&&d.country?{country:d.country,city:d.city||'',region:d.region||'',code:d.country_code||''}:null;}},
    {url:'https://ipapi.co/'+ip+'/json/', parse:function(d){return d.country_name?{country:d.country_name,city:d.city||'',region:d.region||'',code:d.country_code||''}:null;}},
    {url:'http://ip-api.com/json/'+ip, parse:function(d){return d.status==='success'?{country:d.country,city:d.city||'',region:d.regionName||'',code:d.countryCode||''}:null;}}
  ];
  for(var i=0;i<geoSvcs.length;i++){
    try{
      var g=await fetchWithTimeout(geoSvcs[i].url,3000).then(function(r){return r.json();}).then(geoSvcs[i].parse);
      if(g) return g;
    }catch(e){}
  }
  return null;
}
async function pencPushSubs()      { const d = await jbGet(BINS.penc_push); return (d && Array.isArray(d.subs)) ? d.subs : []; }
async function pencSavePushSubs(a) { return jbSet(BINS.penc_push, { subs: a }); }
async function pencSecLog(type, req, extra) {
  try {
    if (!_pgPool) return;
    extra = extra || {};
    const ip = (req && req.headers && (req.headers['x-forwarded-for']||'').split(',')[0].trim()) || (req && req.ip) || '';
    const ua = (req && req.headers && req.headers['user-agent']) || '';
    const id = 'sec_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_security_logs(id, type, user_id, identifier, ip, user_agent, detail, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id, type, (extra.user_id||null), (extra.identifier||null), ip, String(ua).slice(0,300), (extra.detail||null)]);
  } catch(e) {}
}
async function sendPencPush(userId, payload) {
  if (!webpush) return;
  try {
    // Respecter le mute par conversation : ne pas notifier si l'utilisateur a coupé cette discussion
    if (payload && payload.conv_id && typeof _pgPool !== 'undefined' && _pgPool) {
      try {
        const _mc = await _pgPool.query('SELECT 1 FROM penc_muted_convs WHERE user_id=$1 AND conv_id=$2', [userId, payload.conv_id]);
        if (_mc.rowCount > 0) return;
      } catch (_me) {}
    }
    const subs = await pencPushSubs();
    const mine = subs.filter(x => x.user_id === userId);
    for (const sb of mine) {
      try { await webpush.sendNotification(sb.subscription, JSON.stringify(payload)); }
      catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          const all = await pencPushSubs();
          await pencSavePushSubs(all.filter(z => !(z.subscription && sb.subscription && z.subscription.endpoint === sb.subscription.endpoint)));
        }
      }
    }
  } catch (e) { console.error('sendPencPush:', e.message); }
}
// ── Notifications DeglouFM en digest : plutôt qu'une push par commentaire (spam garanti sur
// une station active), on regroupe tous les commentaires arrivés dans une fenêtre de 45s en
// UNE SEULE notification ("3 nouveaux commentaires sur RFM Dakar"). État en mémoire (perdu au
// redémarrage du serveur — acceptable, ce n'est qu'un délai de notification, pas une perte de donnée). ──
const _radNotifDebounce = {};
const RAD_NOTIF_DEBOUNCE_MS = 45000;
function _radQueueCommentNotif(stationId, authorId, authorName, stationName) {
  let entry = _radNotifDebounce[stationId];
  if (!entry) entry = _radNotifDebounce[stationId] = { count: 0, lastAuthorName: authorName, stationName, excludeIds: new Set() };
  entry.count += 1;
  entry.lastAuthorName = authorName;
  entry.stationName = stationName;
  entry.excludeIds.add(authorId);
  if (!entry.timer) {
    entry.timer = setTimeout(async function () {
      const e = _radNotifDebounce[stationId];
      delete _radNotifDebounce[stationId];
      if (!e || !_pgPool) return;
      try {
        const notifyRows = await _pgPool.query(
          `SELECT user_id FROM penc_radio_fans WHERE station_id=$1
           UNION SELECT DISTINCT user_id FROM penc_radio_comments WHERE station_id=$1`,
          [stationId]
        );
        const body = e.count === 1
          ? (e.lastAuthorName || 'Quelqu\u2019un') + ' a comment\u00e9 sur ' + e.stationName
          : e.count + ' nouveaux commentaires sur ' + e.stationName;
        const targets = notifyRows.rows.map(function (r) { return r.user_id; }).filter(function (t) { return !e.excludeIds.has(t); });
        targets.forEach(function (t) {
          sendPencPush(t, { title: 'DeglouFM', body: body, tag: 'radio-comment-' + stationId, url: '/messager?radio=' + stationId }).catch(function () {});
        });
      } catch (err) {}
    }, RAD_NOTIF_DEBOUNCE_MS);
  }
}
function _pencDur(sec){ sec=Math.max(0,Math.round(sec||0)); var m=Math.floor(sec/60), s=sec%60; return m+':'+(s<10?'0':'')+s; }
function pencMsgBody(type, content, duration){
  if(type==='voice') return 'Message vocal'+((duration&&duration>0)?' '+_pencDur(duration):'');
  if(type==='image') return 'A envoyé une photo 📷';
  if(type==='video') return 'A envoyé une vidéo 🎬';
  if(type==='money') return '💸 '+(content||'Transfert');
  if(type==='sticker') return content||'Sticker';
  return (content||'').slice(0,50);
}

// ═══════════════════════════════════════════════════════════════
// ─── ROUTES SENSMS (JSONBin — persistant sans MongoDB)
// ═══════════════════════════════════════════════════════════════

// Inscription SenSMS
app.post("/api/sen-sms/register", async (req, res) => {
  try {
    // Accepter les deux formats (frontend envoie: nom, organisation, telephone, email, password)
    const nom = req.body.nom || req.body.name || "";
    const org = req.body.organisation || req.body.org || "";
    const phone = req.body.telephone || req.body.phone || "";
    const email = req.body.email || "";
    const password = req.body.password || "";

    if (!email || !password) return res.json({ success: false, error: "Email et mot de passe requis" });
    if (password.length < 6) return res.json({ success: false, error: "Mot de passe trop court (6 caractères minimum)" });

    const db = await jbGet(BINS.users) || { users: [] };
    const exists = db.users.find(u => u.email === email || (phone && u.phone === phone));
    if (exists) return res.json({ success: false, error: "Compte déjà existant avec cet email ou téléphone" });

    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");
    const newUser = {
      id: Date.now().toString(),
      nom: nom || email.split("@")[0],
      organisation: org,
      phone: phone, telephone: phone,
      email: email,
      password: hashedPw,
      credits: 0,
      role: "user",
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    await jbSet(BINS.users, db);

    const { password: _pw, ...userSafe } = newUser;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error("SenSMS register error:", e.message, e.stack);
    res.json({ success: false, error: "Erreur serveur: " + e.message });
  }
});

// Connexion SenSMS
app.post("/api/sen-sms/login", async (req, res) => {
  try {
    // Frontend envoie: email + password (champ identifier ou email)
    const identifier = req.body.identifier || req.body.email || "";
    const password = req.body.password || "";
    if (!identifier || !password) return res.json({ success: false, error: "Email et mot de passe requis" });

    const db = await jbGet(BINS.users) || { users: [] };
    const nodeCrypto = require("crypto");
    const hashedPw = nodeCrypto.createHash("sha256").update(password + "pst2026salt").digest("hex");

    const user = db.users.find(u =>
      (u.email === identifier || u.phone === identifier) && u.password === hashedPw
    );
    if (!user) return res.json({ success: false, error: "Email ou mot de passe incorrect" });

    // Génération token JWT maison
    const jwtSecret = process.env.JWT_SECRET || "pst-jwt-2026-xK9mPq7nR3";
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      id: user.id, phone: user.phone, role: user.role,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7
    })).toString("base64url");
    const sig = nodeCrypto.createHmac("sha256", jwtSecret).update(header + "." + payload).digest("base64url");
    const token = header + "." + payload + "." + sig;

    const { password: _pw, ...userSafe } = user;
    res.json({ success: true, user: userSafe, token });
  } catch(e) {
    console.error("SenSMS login error:", e.message, e.stack);
    res.json({ success: false, error: "Erreur serveur: " + e.message });
  }
});

// Profil SenSMS (par token)
app.get("/api/sen-sms/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return res.json({ success: false, error: "Non authentifié" });

    const parts = token.split(".");
    if (parts.length !== 3) return res.json({ success: false, error: "Token invalide" });

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.json({ success: false, error: "Session expirée" });
    }

    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === payload.id);
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable" });

    const { password: _pw, ...userSafe } = user;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    res.json({ success: false, error: "Token invalide" });
  }
});

// Envoyer SMS (Techsoft)
app.post("/api/sen-sms/send", async (req, res) => {
  try {
    const { recipients, message, sender_id } = req.body;
    if (!recipients || !message) return res.json({ success: false, error: "Destinataires et message requis" });

    const TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || "1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823";
    const phones = Array.isArray(recipients) ? recipients : recipients.split(",").map(p => p.trim());
    const results = [];

    for (const phone of phones) {
      try {
        const response = await fetch("https://app.techsoft-sms.com/api/http/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${TECHSOFT_TOKEN}`
          },
          body: JSON.stringify({
            recipient: phone,
            sender_id: sender_id || "SenSMS",
            message,
            type: "plain"
          })
        });
        const data = await response.json();
        results.push({ phone, status: data.status || "sent", response: data });
      } catch(e) {
        results.push({ phone, status: "error", error: e.message });
      }
    }

    // Historique campagne dans JSONBin
    const cdb = await jbGet(BINS.campaigns) || { campaigns: [] };
    cdb.campaigns.push({
      id: Date.now().toString(),
      message,
      sender_id: sender_id || "SenSMS",
      recipients: phones,
      sent: results.filter(r => r.status !== "error").length,
      failed: results.filter(r => r.status === "error").length,
      sentAt: new Date().toISOString()
    });
    if (cdb.campaigns.length > 500) cdb.campaigns = cdb.campaigns.slice(-500);
    await jbSet(BINS.campaigns, cdb);

    res.json({ success: true, results, total: phones.length,
      sent: results.filter(r => r.status !== "error").length });
  } catch(e) {
    console.error("SenSMS send error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// Historique campagnes
app.get("/api/sen-sms/campaigns", async (req, res) => {
  try {
    const db = await jbGet(BINS.campaigns) || { campaigns: [] };
    res.json({ success: true, campaigns: [...db.campaigns].reverse().slice(0, 100) });
  } catch(e) {
    res.json({ success: false, campaigns: [] });
  }
});

// Contacts — ajouter
app.post("/api/sen-sms/contacts", async (req, res) => {
  try {
    const { name, phone, group } = req.body;
    if (!phone) return res.json({ success: false, error: "Téléphone requis" });
    const db = await jbGet(BINS.contacts) || { contacts: [] };
    const exists = db.contacts.find(c => c.phone === phone);
    if (exists) return res.json({ success: false, error: "Contact déjà existant" });
    db.contacts.push({
      id: Date.now().toString(),
      name: name || "", phone,
      group: group || "default",
      createdAt: new Date().toISOString()
    });
    await jbSet(BINS.contacts, db);
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Contacts — liste
app.get("/api/sen-sms/contacts", async (req, res) => {
  try {
    const db = await jbGet(BINS.contacts) || { contacts: [] };
    res.json({ success: true, contacts: db.contacts });
  } catch(e) {
    res.json({ success: false, contacts: [] });
  }
});

// Admin — liste users
app.get("/api/sen-sms/admin/users", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-admin-token"];
    const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
    if (token !== adminPwd) return res.status(403).json({ success: false, error: "Non autorisé" });
    const db = await jbGet(BINS.users) || { users: [] };
    const safe = db.users.map(u => { const { password: _, ...s } = u; return s; });
    res.json({ success: true, users: safe, total: safe.length });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// Admin — ajouter crédits
app.post("/api/sen-sms/admin/credits", async (req, res) => {
  try {
    const { token, userId, credits } = req.body;
    const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
    if (token !== adminPwd) return res.status(403).json({ success: false, error: "Non autorisé" });
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable" });
    user.credits = (user.credits || 0) + parseInt(credits || 0);
    await jbSet(BINS.users, db);
    res.json({ success: true, newCredits: user.credits });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

// ⚡ Récupérer les IDs des bins (à sauvegarder dans Render)
app.get("/api/sen-sms/bins", async (req, res) => {
  const token = req.query.token;
  const adminPwd = process.env.ADMIN_PASSWORD || "pst-admin-2026";
  if (token !== adminPwd) return res.status(403).json({ error: "Non autorisé" });
  res.json({ success: true, bins: BINS,
    message: "Sauvegarde ces IDs dans les variables Render !" });
});


connectDB().then((dbInstance) => {
  db = dbInstance;
  


app.get('/api/sen-sms/me', senSmsAuth, async (req, res) => {
  try {
    const userId = String(req.senSmsUser.id || req.senSmsUser._id || '');
    const db = await jbGet(BINS.users) || { users: [] };
    const user = db.users.find(u => String(u.id) === userId);
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    const { password: _, ...userSafe } = user;
    res.json({ success: true, user: userSafe });
  } catch(e) {
    console.error('sen-sms/me error:', e.message);
    res.json({ success: false, error: 'Erreur serveur' });
  }
});


app.get('/messager', (req, res) => {
  res.sendFile(__dirname + '/messager.html');
});


// ════════════════════════════════════════════════════════════
// ─── PENC MESSAGING APP — ROUTES BACKEND (JSONBin) ──────────
// ════════════════════════════════════════════════════════════

const jwt_penc = require('jsonwebtoken');
let bcrypt_penc=null;
try{ bcrypt_penc=require('bcryptjs'); }catch(e){ console.log('⚠️ bcryptjs non installé - routes Penc auth dégradées'); }
let _webauthn=null;
try{ _webauthn=require('@simplewebauthn/server'); console.log('✅ WebAuthn (biométrie) prêt'); }catch(e){ console.log('⚠️ @simplewebauthn/server non installé — biométrie désactivée (npm install @simplewebauthn/server)'); }
const PENC_SECRET = process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3';

// ── Middleware auth Penc ──────────────────────────────────────
function pencAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.pencUser = jwt_penc.verify(h.slice(7), PENC_SECRET);
    if (typeof _pencBlocked!=='undefined' && _pencBlocked.has(String(req.pencUser.userId))) return res.status(403).json({ error: 'compte_restreint', restricted:true });
    if (req.pencUser.sid && typeof _pencRevokedSids!=='undefined' && _pencRevokedSids.has(req.pencUser.sid)) return res.status(401).json({ error: 'session_revoked' });
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

// ════════════════════════════════════════════════════════════
// ─── PENC MEDIA STORAGE — Cloudflare R2 (remplace Cloudinary) ──
// ════════════════════════════════════════════════════════════
// Stockage brut sur R2 (S3-compatible). Filigrane, rognage vidéo et
// conversion mp3 reconstruits ici côté serveur (sharp + ffmpeg) pour
// remplacer à l'identique les transformations à la volée de Cloudinary.
// Photos/vidéos de CHAT gardent le filigrane pseudo (comme avant).
// Statuts gardent uniquement le rognage vidéo (aucun filigrane, comme avant).
let _r2Client = null, _r2Ready = false;
try {
  const { S3Client } = require('@aws-sdk/client-s3');
  if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_ENDPOINT) {
    _r2Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
    });
    _r2Ready = true;
    console.log('✅ R2 client prêt (bucket ' + process.env.R2_BUCKET_NAME + ')');
  } else {
    console.log('⚠️ R2 non configuré (variables manquantes) — routes media/* désactivées');
  }
} catch (eR2) { console.error('⚠️ @aws-sdk/client-s3 non installé :', eR2.message); }

const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_PUBLIC = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

function r2Key(type, userId, ext) {
  const folders = {
    photo: 'penc/images', video: 'penc/videos', voice: 'penc/voice',
    sticker: 'penc/stickers', avatar: 'penc/avatars', group_icon: 'penc/groups',
    kyc: 'penc/verif', status_photo: 'penc/status', status_video: 'penc/status',
    channel: 'penc/channel', file: 'penc/docs', ad: 'penc/ads', wallpaper: 'penc/wallpapers', key_backup: 'penc/keybackup', listing: 'penc/listings'
  };
  const folder = folders[type] || 'penc/misc';
  const safeExt = String(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  // Sauvegarde de clé : chemin fixe par utilisateur (écrase la précédente à chaque sauvegarde, pas d'accumulation)
  if (type === 'key_backup') return folder + '/' + userId + '.' + safeExt;
  return folder + '/' + userId + '/' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + safeExt;
}

async function r2PresignPut(key, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType || 'application/octet-stream' });
  return await getSignedUrl(_r2Client, cmd, { expiresIn: 300 });
}
async function r2GetBuffer(key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const res = await _r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
}
async function r2PutBuffer(key, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await _r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return R2_PUBLIC + '/' + key;
}
// Upload en flux depuis un fichier disque — jamais chargé entièrement en RAM (contrairement à
// r2PutBuffer). Indispensable pour les gros fichiers (discours de plusieurs heures, parfois
// plusieurs centaines de Mo) sur un serveur à mémoire partagée avec la messagerie Penc.
async function r2PutFile(key, filePath, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const fs = require('fs');
  const size = fs.statSync(filePath).size;
  const stream = fs.createReadStream(filePath);
  await _r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: stream, ContentType: contentType, ContentLength: size }));
  return R2_PUBLIC + '/' + key;
}
async function r2DeleteObject(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await _r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
}
// ── Synthèse vocale (texte → audio) via l'endpoint TTS non-officiel de Google Translate.
// Gratuit, aucune clé API à configurer, mais NON garanti (service non-officiel, pourrait
// changer ou se faire limiter). Limite ~200 caractères par appel — largement suffisant pour
// une annonce de titre. Retourne le buffer MP3 généré. ──
async function _generateTTS(text, lang) {
  const https = require('https');
  const q = encodeURIComponent(String(text).slice(0, 200));
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${q}&tl=${lang || 'fr'}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (resp) => {
      if (resp.statusCode !== 200) { reject(new Error('TTS HTTP ' + resp.statusCode)); return; }
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
      resp.on('error', reject);
    }).on('error', reject);
  });
}
async function _generateAndStoreTTS(text, keyPrefix) {
  const buffer = await _generateTTS(text);
  const key = keyPrefix + '_' + Date.now() + '.mp3';
  const url = await r2PutBuffer(key, buffer, 'audio/mpeg');
  // Durée exacte via ffprobe sur le buffer fraîchement uploadé (plus fiable que d'estimer).
  let duration = 0;
  try { const meta = await _ffprobeMeta(url, 10000); duration = Math.round((meta && meta.format && meta.format.duration) || 0); } catch (_d) {}
  return { url, duration_seconds: duration || 3 };
}

// ── Logo du filigrane : préchargé une fois, mis en cache mémoire ──
let _wmLogoBuf = null, _wmLogoTried = false;
async function _loadWatermarkLogo() {
  if (_wmLogoBuf || _wmLogoTried) return _wmLogoBuf;
  _wmLogoTried = true;
  try {
    const resp = await fetch('https://res.cloudinary.com/dkuekfrh9/image/upload/w_200/penc_watermark_blue_zxcyro.png');
    const ab = await resp.arrayBuffer();
    _wmLogoBuf = Buffer.from(ab);
    console.log('✅ Logo filigrane Penc chargé en mémoire');
  } catch (e) { console.error('⚠️ Logo filigrane introuvable :', e.message); }
  return _wmLogoBuf;
}
if (_r2Ready) _loadWatermarkLogo();

function _wmCleanUsername(raw) {
  const u = String(raw || 'penc').replace(/[,\/\\]/g, '').trim();
  return u || 'penc';
}

// ── Filigrane PHOTO (sharp) : logo haut-gauche + pseudo bas-gauche ──
async function _wmPhoto(buffer, username) {
  const sharp = require('sharp');
  const logo = await _loadWatermarkLogo();
  let img = sharp(buffer).rotate();
  const meta = await img.metadata();
  const W = meta.width || 1080, H = meta.height || 1080;
  const composites = [];
  if (logo) {
    try {
      const logoW = Math.max(20, Math.round(W * 0.11));
      const logoBuf = await sharp(logo).resize({ width: logoW }).png().toBuffer();
      composites.push({ input: logoBuf, left: Math.round(W * 0.03), top: Math.round(H * 0.03) });
    } catch (eL) { console.error('filigrane logo photo:', eL.message); }
  }
  const uname = _wmCleanUsername(username);
  const text = '@' + uname + '_Penc';
  const fontSize = Math.max(14, Math.round(H * 0.035));
  const svgW = Math.min(W - 20, Math.ceil(fontSize * text.length * 0.62) + 20);
  const svgH = Math.ceil(fontSize * 1.6);
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
    <text x="2" y="${Math.round(fontSize * 1.05)}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" stroke="black" stroke-width="${Math.max(1, Math.round(fontSize * 0.05))}" paint-order="stroke" style="text-shadow:0 0 6px rgba(0,0,0,.9)">${escaped}</text>
  </svg>`;
  composites.push({ input: Buffer.from(svg), left: Math.round(W * 0.03), top: Math.max(0, H - Math.round(H * 0.04) - svgH) });
  return await img.composite(composites).jpeg({ quality: 90 }).toBuffer();
}

// ── Filigrane + rognage VIDÉO (ffmpeg) ──
function _ffmpegBin() {
  const ffmpeg = require('fluent-ffmpeg');
  try { ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path); } catch (e) {}
  return ffmpeg;
}
async function _ffprobeMeta(inputPath, timeoutMs) {
  const ffmpeg = _ffmpegBin();
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = timeoutMs ? setTimeout(() => { if (!done) { done = true; reject(new Error('ffprobe timeout après ' + Math.round(timeoutMs/1000) + 's — ce lien ne pointe probablement pas vers un fichier audio direct')); } }, timeoutMs) : null;
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      err ? reject(err) : resolve(data);
    });
  });
}
async function _wmVideoTrim(inputPath, outputPath, username, trim, withWatermark) {
  const ffmpeg = _ffmpegBin();
  const os = require('os'), pathMod = require('path'), fs = require('fs');
  const probe = await _ffprobeMeta(inputPath);
  const vs = (probe.streams || []).find(s => s.codec_type === 'video') || {};
  const W = vs.width || 720, H = vs.height || 1280;
  let cmd = ffmpeg(inputPath);
  if (trim && (trim.start > 0 || trim.end)) {
    cmd = cmd.setStartTime(trim.start || 0);
    if (trim.end) cmd = cmd.setDuration(Math.max(0.5, trim.end - (trim.start || 0)));
  }
  let logoTmpPath = null;
  if (withWatermark) {
    const uname = _wmCleanUsername(username);
    const text = ('@' + uname + '_Penc').replace(/\\/g, '').replace(/:/g, '\\:').replace(/'/g, "\\'");
    const fontSize = Math.max(14, Math.round(H * 0.042));
    const logoBuf = await _loadWatermarkLogo();
    if (logoBuf) {
      logoTmpPath = pathMod.join(os.tmpdir(), 'wmlogo_' + Date.now() + '.png');
      fs.writeFileSync(logoTmpPath, logoBuf);
      cmd = cmd.input(logoTmpPath);
      const logoW = Math.max(20, Math.round(W * 0.13));
      const filters = [
        '[1:v]scale=' + logoW + ':-1[logo]',
        '[0:v][logo]overlay=x=' + Math.round(W * 0.03) + ':y=' + Math.round(H * 0.03) + '[v1]',
        "[v1]drawtext=text='" + text + "':fontcolor=white:fontsize=" + fontSize + ":borderw=3:bordercolor=black@0.6:x=" + Math.round(W * 0.03) + ":y=h-" + Math.round(H * 0.04) + "-th[v2]"
      ];
      cmd = cmd.complexFilter(filters, 'v2');
    } else {
      cmd = cmd.videoFilters(["drawtext=text='" + text + "':fontcolor=white:fontsize=" + fontSize + ":borderw=3:bordercolor=black@0.6:x=" + Math.round(W * 0.03) + ":y=h-" + Math.round(H * 0.04) + "-th"]);
    }
  }
  return new Promise((resolve, reject) => {
    var _outOpts = ['-c:v libx264', '-preset veryfast', '-crf 23', '-c:a aac', '-movflags +faststart'];
    // '0:a?' doit être passé en option -map brute (pas via complexFilter, qui traiterait
    // ce texte comme un label de filtre invalide et ferait planter ffmpeg avec code 1).
    // Le '?' rend l'audio optionnel : aucune erreur si la vidéo source n'a pas de piste audio.
    if (withWatermark && logoTmpPath) { _outOpts.unshift('-map', '0:a?'); }
    cmd.outputOptions(_outOpts)
      .on('end', () => { try { if (logoTmpPath) fs.unlinkSync(logoTmpPath); } catch (e) {} resolve(); })
      .on('error', (err) => { try { if (logoTmpPath) fs.unlinkSync(logoTmpPath); } catch (e) {} reject(err); })
      .save(outputPath);
  });
}

// ── Conversion vocale → mp3 (ffmpeg) ──
async function _voiceToMp3(inputPath, outputPath) {
  const ffmpeg = _ffmpegBin();
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath).audioCodec('libmp3lame').audioBitrate('128k')
      .on('end', resolve).on('error', reject).save(outputPath);
  });
}

// ══════════════ REPLAY DEGLOUFM (PREMIUM) ══════════════
// Enregistre en continu, par tranches d'1h, les stations marquées replay_enabled=true.
// Chaque tranche est uploadée sur R2 puis référencée en base ; une purge horaire supprime
// tout ce qui dépasse 48h (rétention volontairement courte pour maîtriser le stockage).
// LIMITE CONNUE : si le serveur redémarre/s'endort (Render Free), l'enregistrement en cours
// s'arrête et laisse un trou — pas de solution miracle sans un serveur qui tourne 24/7.
const RAD_REPLAY_RETENTION_HOURS = 48;
// ⚠️ Flux radio en boucle coupé le 21/07/2026 pour protéger la messagerie Penc pendant que le
// plan Render reste sur Free (512 Mo) — repasser à false une fois l'upgrade payé.
// Réactivé le 21/07/2026 après upgrade Render vers Standard (2 Go de RAM, contre 512 Mo avant)
// — largement assez de marge maintenant pour ce que ce flux consomme.
const RAD_LIVE_STREAM_DISABLED = false;
// Architecture "un seul ffmpeg par station, partagé entre tous les auditeurs" — voir
// _radBroadcasts plus bas. RAD_MAX_CONCURRENT_STREAMS plafonne maintenant le nombre TOTAL
// d'auditeurs simultanés (toutes stations confondues), pas le nombre de processus ffmpeg.
// Relevé le 21/07/2026 après upgrade RAM (2 Go) — assez généreux pour ne jamais gêner de vrais
// auditeurs, tout en gardant un plafond au cas où, vu l'historique de plantages de la nuit.
const RAD_MAX_CONCURRENT_STREAMS = 20;
setInterval(() => {
  try{ const mu=process.memoryUsage(); var _nbBroadcasts=Object.keys(_radBroadcasts||{}).length; var _nbListeners=Object.values(_radBroadcasts||{}).reduce(function(s,x){return s+x.listenerCount;},0); console.log('[memoire] base — RAM: '+Math.round(mu.rss/1024/1024)+' Mo (heap: '+Math.round(mu.heapUsed/1024/1024)+' Mo), diffusions radio actives: '+_nbBroadcasts+', auditeurs: '+_nbListeners); }catch(_e){}
}, 5*60000);
let _radRecordingLoops = {}; // station_id -> true pendant que la boucle tourne

async function _radRecordOneHour(station) {
  const os = require('os'), pathMod = require('path'), fs = require('fs');
  const startedAt = new Date();
  const tmpFile = pathMod.join(os.tmpdir(), 'radrec_' + station.id + '_' + Date.now() + '.mp3');
  const ffmpeg = _ffmpegBin();
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try {
      ffmpeg(station.stream_url)
        .inputOptions(['-re'])
        .audioCodec('libmp3lame').audioBitrate('64k').noVideo()
        .duration(3600)
        .on('error', (err) => { console.error('[radio-replay] ffmpeg', station.name, ':', err.message); finish(); })
        .on('end', finish)
        .save(tmpFile);
    } catch (e) { console.error('[radio-replay] exception', e.message); finish(); }
    setTimeout(finish, 3700 * 1000); // filet de sécurité si ffmpeg ne se termine jamais
  });
  try {
    if (fs.existsSync(tmpFile)) {
      const stat = fs.statSync(tmpFile);
      if (stat.size > 200000) { // ignore les tranches quasi-vides (flux tombé dès le départ)
        const buffer = fs.readFileSync(tmpFile);
        const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);
        const key = 'penc/radio-replay/' + station.id + '/' + startedAt.getTime() + '.mp3';
        const url = await r2PutBuffer(key, buffer, 'audio/mpeg');
        const id = 'rrec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        if (_pgPool) {
          await _pgPool.query(
            'INSERT INTO penc_radio_recordings(id,station_id,started_at,duration_seconds,file_url,file_key) VALUES($1,$2,$3,$4,$5,$6)',
            [id, station.id, startedAt, durationSec, url, key]
          );
        }
        console.log('[radio-replay]', station.name, '- tranche enregistrée (' + durationSec + 's)');
      }
    }
  } catch (e) { console.error('[radio-replay] upload:', e.message); }
  try { fs.unlinkSync(tmpFile); } catch (_e) {}
}

async function _radRecordingLoop(station) {
  if (_radRecordingLoops[station.id]) return;
  _radRecordingLoops[station.id] = true;
  while (true) {
    try {
      // Revérifie à chaque tour que le replay est toujours activé pour cette station (admin peut désactiver)
      const chk = _pgPool ? await _pgPool.query('SELECT replay_enabled, active, stream_url, name FROM penc_radio_stations WHERE id=$1', [station.id]) : { rows: [] };
      if (!chk.rows.length || !chk.rows[0].replay_enabled || !chk.rows[0].active) { delete _radRecordingLoops[station.id]; return; }
      station.stream_url = chk.rows[0].stream_url; station.name = chk.rows[0].name;
      await _radRecordOneHour(station);
    } catch (e) {
      console.error('[radio-replay] boucle', station.name, ':', e.message);
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

async function _radStartReplayRecordings() {
  try {
    if (!_pgPool || !_r2Ready) return;
    const r = await _pgPool.query('SELECT id, name, stream_url FROM penc_radio_stations WHERE replay_enabled=true AND active=true');
    r.rows.forEach(st => { if (!_radRecordingLoops[st.id]) _radRecordingLoop(st); });
  } catch (e) { console.error('[radio-replay] démarrage:', e.message); }
}
// Vérifie toutes les 5 minutes si de nouvelles stations ont été activées pour le replay.
setInterval(_radStartReplayRecordings, 5 * 60000);
setTimeout(_radStartReplayRecordings, 15000);

// Purge horaire : supprime les tranches de plus de 48h (base + fichiers R2).
setInterval(async () => {
  try {
    if (!_pgPool) return;
    const old = await _pgPool.query("SELECT id, file_key FROM penc_radio_recordings WHERE started_at < NOW() - INTERVAL '" + RAD_REPLAY_RETENTION_HOURS + " hours'");
    for (const rec of old.rows) {
      try { await r2DeleteObject(rec.file_key); } catch (_d) {}
      try { await _pgPool.query('DELETE FROM penc_radio_recordings WHERE id=$1', [rec.id]); } catch (_dd) {}
    }
    if (old.rows.length) console.log('[radio-replay] purge :', old.rows.length, 'tranche(s) supprimée(s)');
  } catch (e) {}
}, 3600000);

// ── Récupère le pseudo pour le filigrane (depuis PostgreSQL) ──
async function _pencUsernameFor(userId) {
  try {
    if (_pgPool) {
      const r = await _pgPool.query('SELECT username, full_name FROM penc_users WHERE id=$1', [userId]);
      if (r.rows[0]) return r.rows[0].username || r.rows[0].full_name || 'penc';
    }
  } catch (e) {}
  return 'penc';
}

// ── Route 1 : demande d'URL présignée pour upload direct vers R2 ──
app.post('/api/penc/media/presign', pencAuth, async (req, res) => {
  try {
    console.log('[media/presign] reçu type=' + req.body.type + ' user=' + req.pencUser.userId + ' r2Ready=' + _r2Ready);
    if (!_r2Ready) { console.error('[media/presign] R2 non configuré (_r2Ready=false)'); return res.status(500).json({ error: 'R2 non configuré côté serveur' }); }
    const type = req.body.type;
    const allowed = ['photo', 'video', 'voice', 'sticker', 'avatar', 'group_icon', 'kyc', 'status_photo', 'status_video', 'channel', 'file', 'ad', 'wallpaper', 'key_backup', 'listing'];
    if (!allowed.includes(type)) { console.error('[media/presign] REJET type invalide reçu="' + type + '" (types connus par CE serveur: ' + allowed.join(',') + ')'); return res.status(400).json({ error: 'type media invalide' }); }
    const mime = req.body.mime || 'application/octet-stream';
    const ext = req.body.ext || 'bin';
    const key = r2Key(type, req.pencUser.userId, ext);
    const uploadUrl = await r2PresignPut(key, mime);
    console.log('[media/presign] OK key=' + key);
    res.json({ success: true, uploadUrl, key, publicUrl: R2_PUBLIC + '/' + key });
  } catch (e) { console.error('[media/presign] ERREUR:', e.message, e.stack); res.status(500).json({ error: e.message }); }
});

// ── Route 2 : traitement post-upload (filigrane / rognage / conversion mp3) ──
// ── Garde-fou mémoire : chaque vidéo traitée charge son buffer entier en RAM (30-40 Mo) + lance
// un processus ffmpeg. Deux vidéos traitées EN MÊME TEMPS (ex: deux envois rapprochés) peuvent
// suffire à dépasser les 512 Mo du plan Render gratuit et faire planter TOUT le serveur (messagerie
// comprise). On limite à 1 traitement vidéo à la fois ; les suivants attendent leur tour au lieu
// de s'exécuter en parallèle. Coût : un léger délai supplémentaire si deux vidéos arrivent en
// même temps, largement préférable à un plantage complet du service.
let _videoProcessingActive = false;
const _videoProcessingQueue = [];
async function _acquireVideoSlot(){
  if(!_videoProcessingActive){ _videoProcessingActive = true; return; }
  await new Promise(resolve => _videoProcessingQueue.push(resolve));
}
function _releaseVideoSlot(){
  if(_videoProcessingQueue.length){ const next = _videoProcessingQueue.shift(); next(); }
  else { _videoProcessingActive = false; }
}
app.post('/api/penc/media/process', pencAuth, async (req, res) => {
  const os = require('os'), pathMod = require('path'), fs = require('fs');
  let tmpFiles = [];
  const _t0 = Date.now();
  const _isVideo = (req.body && (req.body.type === 'video' || req.body.type === 'status_video'));
  if(_isVideo) await _acquireVideoSlot();
  try {
    console.log('[media/process] reçu type=' + req.body.type + ' key=' + req.body.key + ' user=' + req.pencUser.userId);
    if (!_r2Ready) { console.error('[media/process] R2 non configuré'); return res.status(500).json({ error: 'R2 non configuré côté serveur' }); }
    const { key, type, trim } = req.body;
    if (!key || !type) return res.status(400).json({ error: 'paramètres manquants' });

    if (type === 'photo') {
      console.log('[media/process] photo: téléchargement depuis R2...');
      const buf = await r2GetBuffer(key);
      console.log('[media/process] photo: ' + buf.length + ' octets récupérés, filigrane en cours...');
      const username = await _pencUsernameFor(req.pencUser.userId);
      const out = await _wmPhoto(buf, username);
      console.log('[media/process] photo: filigrane OK, ré-upload...');
      const url = await r2PutBuffer(key, out, 'image/jpeg');
      console.log('[media/process] photo: TERMINÉ en ' + (Date.now() - _t0) + 'ms -> ' + url);
      return res.json({ success: true, url });
    }

    if (type === 'video' || type === 'status_video') {
      console.log('[media/process] video: téléchargement depuis R2...');
      const buf = await r2GetBuffer(key);
      console.log('[media/process] video: ' + buf.length + ' octets récupérés');
      const tmpIn = pathMod.join(os.tmpdir(), 'vin_' + Date.now() + '.mp4');
      const tmpOut = pathMod.join(os.tmpdir(), 'vout_' + Date.now() + '.mp4');
      tmpFiles = [tmpIn, tmpOut];
      fs.writeFileSync(tmpIn, buf);
      const withWatermark = (type === 'video'); // statuts : rognage seul, pas de filigrane (comme avant)
      const username = withWatermark ? await _pencUsernameFor(req.pencUser.userId) : null;
      console.log('[media/process] video: lancement ffmpeg (watermark=' + withWatermark + ')...');
      await _wmVideoTrim(tmpIn, tmpOut, username, trim, withWatermark);
      console.log('[media/process] video: ffmpeg OK, ré-upload...');
      const outBuf = fs.readFileSync(tmpOut);
      const url = await r2PutBuffer(key, outBuf, 'video/mp4');
      tmpFiles.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
      console.log('[media/process] video: TERMINÉ en ' + (Date.now() - _t0) + 'ms -> ' + url);
      return res.json({ success: true, url });
    }

    if (type === 'voice') {
      console.log('[media/process] voice: téléchargement depuis R2...');
      const buf = await r2GetBuffer(key);
      console.log('[media/process] voice: ' + buf.length + ' octets récupérés, conversion mp3...');
      const tmpIn = pathMod.join(os.tmpdir(), 'ain_' + Date.now());
      const tmpOut = pathMod.join(os.tmpdir(), 'aout_' + Date.now() + '.mp3');
      tmpFiles = [tmpIn, tmpOut];
      fs.writeFileSync(tmpIn, buf);
      await _voiceToMp3(tmpIn, tmpOut);
      console.log('[media/process] voice: conversion OK, ré-upload...');
      const outBuf = fs.readFileSync(tmpOut);
      const mp3Key = key.replace(/\.[a-z0-9]+$/i, '.mp3');
      const url = await r2PutBuffer(mp3Key, outBuf, 'audio/mpeg');
      tmpFiles.forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
      console.log('[media/process] voice: TERMINÉ en ' + (Date.now() - _t0) + 'ms -> ' + url);
      return res.json({ success: true, url });
    }

    return res.status(400).json({ error: 'type inconnu pour traitement' });
  } catch (e) {
    console.error('[media/process] ERREUR après ' + (Date.now() - _t0) + 'ms:', e.message, e.stack);
    tmpFiles.forEach(p => { try { require('fs').unlinkSync(p); } catch (_e) {} });
    res.status(500).json({ error: e.message });
  } finally {
    if(_isVideo) _releaseVideoSlot();
  }
});

// ── Stockage JSONBin Penc (remplace MongoDB) ──────────────────
async function pencUsers(){
  const d=await jbGet(BINS.penc_users);
  if(!d) return [];
  if(Array.isArray(d)) return d;
  if(Array.isArray(d.users)) return d.users;
  return [];
}
async function pencSaveUsers(a){
  if(!Array.isArray(a)||a.length===0){
    console.error('🚫 pencSaveUsers BLOQUÉ: tentative de vider la base');
    return;
  }
  return jbSet(BINS.penc_users,{users:a});
}
async function pencConvs(){
  // Filet de sécurité global : peu importe l'appelant, ne JAMAIS taper sur JSONBin tant que
  // PostgreSQL fonctionne — le bin penc_convs est en erreur 403 permanente et martelait les
  // logs (et consommait du temps réseau) à chaque appel, même depuis un endroit de secours
  // censé ne s'exécuter que si PostgreSQL est indisponible.
  if(_pgPool) return [];
  try{ const _st=new Error().stack.split('\n')[2]||''; console.log('[pencConvs-appelant]', _st.trim()); }catch(_se){}
  const d=await jbGet(BINS.penc_convs);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.convs)?d.convs:[];
}
async function pencSaveConvs(a)   { return jbSet(BINS.penc_convs,  { convs: a }); }
async function pencMsgs(){const d=await jbGet(BINS.penc_msgs);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.msgs)?d.msgs:[];}
async function pencSaveMsgs(a)    { return jbSet(BINS.penc_msgs,   { msgs: a }); }
async function pencStatuses(){const d=await jbGet(BINS.penc_status);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.statuses)?d.statuses:[];}
async function pencSaveStatuses(a){ return jbSet(BINS.penc_status, { statuses: a }); }
const pencStrip = u => { if (!u) return null; const { password, password_hash, totp_secret, ...s } = u; return s; };

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════

// GET /api/penc/admin/diagnostic
app.get('/api/penc/admin/diagnostic',async(req,res)=>{
  if((req.headers['x-admin-token']||''!==process.env.ADMIN_PASSWORD)) return res.status(403).json({error:'Non autorisé'});
  const u=await pencUsers(); const c=await pencConvs(); const m=await pencMsgs();
  res.json({bins:BINS,counts:{users:u.length,convs:c.length,msgs:m.length},
    users:u.slice(0,10).map(x=>({id:x.id,phone:x.phone,email:x.email,username:x.username}))});
});

// ════════════════════════════════════════════════════════════
// ══  PENC — AUTH POSTGRESQL (persistance garantie)  ════════
// ════════════════════════════════════════════════════════════
let _pgPool = null;
(async function initPgPenc(){
  if(!process.env.DATABASE_URL){ console.log('⚠️ DATABASE_URL non défini — auth Penc sur JSONBin seulement'); return; }
  try{
    const { Pool } = require('pg');
    // Reglages du pool adaptes a une charge importante :
    // - max : nombre de connexions simultanees vers Postgres. A ajuster selon le plan de la BD
    //   (verifie la limite "max connections" de ton offre Render Postgres et reste EN DESSOUS).
    // - idleTimeoutMillis : ferme les connexions inactives pour ne pas gaspiller le quota.
    // - connectionTimeoutMillis : echoue vite plutot que de faire attendre un utilisateur indéfiniment
    //   si la base est saturee (mieux vaut une erreur claire qu'un app qui parait figee).
    const PG_POOL_MAX = parseInt(process.env.PG_POOL_MAX || '20', 10);
    _pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: PG_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    _pgPool.on('error', function(err){ console.error('[pgPool] erreur inattendue sur une connexion inactive:', err.message); });
    console.log('[pgPool] initialise avec max='+PG_POOL_MAX+' connexions simultanees');
    await _pgPool.query(`
      CREATE TABLE IF NOT EXISTS penc_users (
        id          TEXT PRIMARY KEY,
        full_name   TEXT NOT NULL,
        username    TEXT UNIQUE NOT NULL,
        phone       TEXT UNIQUE NOT NULL,
        email       TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        avatar_url  TEXT,
        bio         TEXT DEFAULT '',
        is_online   BOOLEAN DEFAULT FALSE,
        last_seen   TIMESTAMPTZ DEFAULT NOW(),
        last_ip     TEXT,
        geo         JSONB DEFAULT '{}',
        total_time_seconds INTEGER DEFAULT 0,
        is_admin    BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pu_phone    ON penc_users(phone);
      CREATE INDEX IF NOT EXISTS idx_pu_email    ON penc_users(LOWER(email));
      CREATE INDEX IF NOT EXISTS idx_pu_username ON penc_users(LOWER(username));
      CREATE TABLE IF NOT EXISTS penc_conversations (
        id           TEXT PRIMARY KEY,
        participants JSONB NOT NULL DEFAULT '[]',
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS penc_messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id       TEXT NOT NULL,
        type            TEXT DEFAULT 'text',
        content         TEXT DEFAULT '',
        media_url       TEXT,
        duration        INTEGER,
        reply_to        TEXT,
        deleted_for_all BOOLEAN DEFAULT FALSE,
        delivered_at    TIMESTAMPTZ,
        read_at         TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS reply_to TEXT;
      -- Convertir JSONB→TEXT si la colonne était déjà JSONB
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='penc_messages' AND column_name='reply_to' AND data_type='jsonb') THEN
          ALTER TABLE penc_messages ALTER COLUMN reply_to TYPE TEXT USING reply_to::TEXT;
        END IF;
      END $$;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS deleted_for_all BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS client_id TEXT;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS view_once BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS view_once_consumed BOOLEAN DEFAULT FALSE;
      CREATE UNIQUE INDEX IF NOT EXISTS penc_msg_client ON penc_messages(client_id) WHERE client_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_pm_conv    ON penc_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_pm_created ON penc_messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pc_updated ON penc_conversations(updated_at DESC);
      CREATE TABLE IF NOT EXISTS penc_statuses (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        type        TEXT DEFAULT 'text',
        media_url   TEXT,
        text_content TEXT,
        bg_color    TEXT DEFAULT '#050D18',
        caption     TEXT,
        duration    INTEGER DEFAULT 10,
        reactions   JSONB DEFAULT '[]',
        views       JSONB DEFAULT '[]',
        view_ips    JSONB DEFAULT '[]',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
        view_log    JSONB DEFAULT '[]'
      );
      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS view_log JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 10;
      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;
      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT NULL;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS status_privacy TEXT DEFAULT 'everyone';
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS status_privacy_list JSONB DEFAULT '[]';
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS profile_hide_info BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS referral_code TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS referred_by TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS key_backup_at TIMESTAMPTZ;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS balance INTEGER DEFAULT 0;
      ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS penc_webauthn_credentials (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        public_key    TEXT NOT NULL,
        counter       BIGINT DEFAULT 0,
        device_label  TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_user ON penc_webauthn_credentials(user_id);
      CREATE TABLE IF NOT EXISTS penc_listings (
        id            TEXT PRIMARY KEY,
        seller_id     TEXT NOT NULL,
        title         TEXT NOT NULL,
        description   TEXT DEFAULT '',
        price         BIGINT DEFAULT 0,
        currency      TEXT DEFAULT 'FCFA',
        category      TEXT DEFAULT 'autre',
        location      TEXT DEFAULT '',
        media_urls    JSONB DEFAULT '[]',
        status        TEXT DEFAULT 'active',
        views_count   INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_listings_seller ON penc_listings(seller_id);
      CREATE INDEX IF NOT EXISTS idx_listings_category ON penc_listings(category);
      CREATE INDEX IF NOT EXISTS idx_listings_status ON penc_listings(status);
      CREATE INDEX IF NOT EXISTS idx_listings_created ON penc_listings(created_at DESC);
      CREATE TABLE IF NOT EXISTS penc_listing_reports (
        id            TEXT PRIMARY KEY,
        listing_id    TEXT NOT NULL,
        reporter_id   TEXT NOT NULL,
        reason        TEXT NOT NULL,
        description   TEXT DEFAULT '',
        status        TEXT DEFAULT 'open',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_lreports_status ON penc_listing_reports(status);
      CREATE TABLE IF NOT EXISTS penc_radio_stations (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        stream_url    TEXT NOT NULL,
        logo_url      TEXT,
        country       TEXT DEFAULT '',
        category      TEXT DEFAULT '',
        sort_order    INTEGER DEFAULT 0,
        active        BOOLEAN DEFAULT TRUE,
        featured      BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE penc_radio_stations ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_radio_stations ADD COLUMN IF NOT EXISTS replay_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_radio_stations ADD COLUMN IF NOT EXISTS coming_soon BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_radio_stations ALTER COLUMN stream_url DROP NOT NULL;
      CREATE TABLE IF NOT EXISTS penc_radio_recordings (
        id TEXT PRIMARY KEY, station_id TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL,
        duration_seconds INTEGER DEFAULT 0, file_url TEXT NOT NULL, file_key TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rrecording_station ON penc_radio_recordings(station_id, started_at);
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS radio_premium BOOLEAN DEFAULT false;
      CREATE TABLE IF NOT EXISTS penc_radio_premium_requests (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, reference TEXT, proof_url TEXT,
        status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rprem_user ON penc_radio_premium_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_radio_country ON penc_radio_stations(country);
      CREATE INDEX IF NOT EXISTS idx_radio_active ON penc_radio_stations(active);
      CREATE TABLE IF NOT EXISTS penc_radio_reports (
        id            TEXT PRIMARY KEY,
        station_id    TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rreport_station ON penc_radio_reports(station_id);
      ALTER TABLE penc_radio_reports ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
      CREATE TABLE IF NOT EXISTS penc_radio_listens (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        station_id    TEXT NOT NULL,
        started_at    TIMESTAMPTZ DEFAULT NOW(),
        ended_at      TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_rlisten_station ON penc_radio_listens(station_id);
      CREATE INDEX IF NOT EXISTS idx_rlisten_user ON penc_radio_listens(user_id);
      ALTER TABLE penc_radio_listens ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ DEFAULT NOW();
      CREATE TABLE IF NOT EXISTS penc_radio_fans (
        station_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (station_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS penc_radio_comments (
        id TEXT PRIMARY KEY, station_id TEXT NOT NULL, user_id TEXT NOT NULL,
        content TEXT NOT NULL, reply_to TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE penc_radio_comments ADD COLUMN IF NOT EXISTS reply_to TEXT;
      ALTER TABLE penc_radio_comments ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT false;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS radio_banned BOOLEAN DEFAULT false;
      CREATE TABLE IF NOT EXISTS penc_radio_shares (
        id TEXT PRIMARY KEY, station_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rshare_station ON penc_radio_shares(station_id);
      CREATE TABLE IF NOT EXISTS penc_radio_programs (
        id TEXT PRIMARY KEY, station_id TEXT NOT NULL, name TEXT NOT NULL,
        kind TEXT DEFAULT 'emission', days TEXT, start_hour INTEGER NOT NULL, start_minute INTEGER NOT NULL DEFAULT 0,
        end_hour INTEGER NOT NULL, end_minute INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rprog_station ON penc_radio_programs(station_id);
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS business_name TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS business_description TEXT;
      ALTER TABLE penc_listings ADD COLUMN IF NOT EXISTS is_catalog_item BOOLEAN DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS penc_sticker_packs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, price_fcfa INTEGER DEFAULT 0, preview_url TEXT,
        sticker_urls JSONB DEFAULT '[]', active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS penc_sticker_purchases (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pack_id TEXT NOT NULL, reference TEXT,
        status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stickerpurch_user ON penc_sticker_purchases(user_id);
      -- ── Penc Pay : intégration IzichangePay (paiements crypto -> monnaie locale).
      -- Admin-only pour l'instant (phase de test) — pas encore exposé aux utilisateurs. ──
      CREATE TABLE IF NOT EXISTS penc_pay_transactions (
        id TEXT PRIMARY KEY, intent_id TEXT UNIQUE, merchant_reference TEXT,
        created_by TEXT, currency TEXT DEFAULT 'XOF', amount_requested TEXT,
        accepted_coins JSONB DEFAULT '[]', status TEXT DEFAULT 'created',
        payment_url TEXT, metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_izipay_intent ON penc_pay_transactions(intent_id);
      CREATE INDEX IF NOT EXISTS idx_izipay_ref ON penc_pay_transactions(merchant_reference);
      CREATE TABLE IF NOT EXISTS penc_radio_playlist_tracks (
        id TEXT PRIMARY KEY, station_id TEXT NOT NULL, title TEXT NOT NULL,
        file_url TEXT NOT NULL, duration_seconds INTEGER NOT NULL DEFAULT 0, sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rplaylist_station ON penc_radio_playlist_tracks(station_id, sort_order);
      ALTER TABLE penc_radio_stations ADD COLUMN IF NOT EXISTS jingle_url TEXT;
      ALTER TABLE penc_radio_stations ADD COLUMN IF NOT EXISTS jingle_duration_seconds INTEGER DEFAULT 0;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS announcement_url TEXT;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS announcement_duration_seconds INTEGER DEFAULT 0;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS normalized_url TEXT;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS normalize_status TEXT DEFAULT 'pending';
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS normalize_error TEXT;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS event_date DATE;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS location TEXT;
      ALTER TABLE penc_radio_playlist_tracks ADD COLUMN IF NOT EXISTS context_note TEXT;
      CREATE INDEX IF NOT EXISTS idx_rcom_station ON penc_radio_comments(station_id);
      CREATE TABLE IF NOT EXISTS penc_radio_comment_likes (
        comment_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (comment_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rcomlike_comment ON penc_radio_comment_likes(comment_id);
      CREATE TABLE IF NOT EXISTS penc_radio_comment_reports (
        id TEXT PRIMARY KEY, comment_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rcomreport_comment ON penc_radio_comment_reports(comment_id);
      ALTER TABLE penc_radio_comment_reports ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
      CREATE TABLE IF NOT EXISTS penc_radio_station_reactions (
        station_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (station_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_rreact_station ON penc_radio_station_reactions(station_id);
      CREATE TABLE IF NOT EXISTS penc_radio_reminders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, station_id TEXT NOT NULL,
        hour INTEGER NOT NULL, minute INTEGER NOT NULL, days TEXT, active BOOLEAN DEFAULT true,
        last_sent_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rrem_user ON penc_radio_reminders(user_id);
      CREATE TABLE IF NOT EXISTS penc_listing_likes (
        listing_id TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (listing_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS penc_legal_pages (
        key         TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        html        TEXT NOT NULL,
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_by  TEXT
      );
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS moderator BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified_type TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
      ALTER TABLE penc_ads ADD COLUMN IF NOT EXISTS owner_id TEXT;
      ALTER TABLE penc_ads ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;
      CREATE INDEX IF NOT EXISTS idx_ps_user    ON penc_statuses(user_id);
      CREATE INDEX IF NOT EXISTS idx_ps_expires ON penc_statuses(expires_at);
      CREATE TABLE IF NOT EXISTS penc_channels (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS penc_friendships (
        id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        recipient TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pf_recipient ON penc_friendships(recipient);
      CREATE INDEX IF NOT EXISTS idx_pf_pair ON penc_friendships(requester,recipient);
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS valid_views INTEGER DEFAULT 0;
      ALTER TABLE penc_friendships ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      CREATE TABLE IF NOT EXISTS penc_status_comments (
        id TEXT PRIMARY KEY,
        status_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_psc_status ON penc_status_comments(status_id);
      CREATE TABLE IF NOT EXISTS penc_reports (id TEXT PRIMARY KEY, reporter_id TEXT, target_type TEXT, target_id TEXT, target_user_id TEXT, reason TEXT, content_snapshot TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS idx_prep_status ON penc_reports(status);
      CREATE TABLE IF NOT EXISTS penc_verif_requests (id TEXT PRIMARY KEY, user_id TEXT, doc_url TEXT, doc_url2 TEXT, type TEXT, note TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS idx_pvr_status ON penc_verif_requests(status);
      CREATE TABLE IF NOT EXISTS penc_security_logs (id TEXT PRIMARY KEY, type TEXT, user_id TEXT, identifier TEXT, ip TEXT, user_agent TEXT, detail TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS penc_call_ratings (id TEXT PRIMARY KEY, rater_id TEXT, peer_id TEXT, call_type TEXT, rating INTEGER, comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS penc_isolations (id TEXT PRIMARY KEY, user_a TEXT, user_b TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS idx_psl_created ON penc_security_logs(created_at);
      CREATE TABLE IF NOT EXISTS penc_sessions (sid TEXT PRIMARY KEY, user_id TEXT, ua TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), last_seen TIMESTAMPTZ DEFAULT NOW(), revoked BOOLEAN DEFAULT FALSE);
      CREATE TABLE IF NOT EXISTS penc_pinned_convs (user_id TEXT NOT NULL, conv_id TEXT NOT NULL, pinned_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, conv_id));
      CREATE TABLE IF NOT EXISTS penc_muted_convs (user_id TEXT NOT NULL, conv_id TEXT NOT NULL, muted_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, conv_id));
      CREATE TABLE IF NOT EXISTS penc_message_reactions (message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (message_id, user_id));
      CREATE TABLE IF NOT EXISTS penc_saved_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, message_id TEXT, conv_id TEXT, sender_name TEXT, type TEXT, content TEXT, media_url TEXT, saved_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS penc_conv_folders (user_id TEXT NOT NULL, folder_name TEXT NOT NULL, PRIMARY KEY (user_id, folder_name));
      CREATE TABLE IF NOT EXISTS penc_conv_folder_items (user_id TEXT NOT NULL, folder_name TEXT NOT NULL, conv_id TEXT NOT NULL, PRIMARY KEY (user_id, folder_name, conv_id));
      CREATE TABLE IF NOT EXISTS penc_conv_ephemeral (conv_id TEXT PRIMARY KEY, duration_seconds INTEGER NOT NULL, set_by TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS penc_media_views (message_id TEXT NOT NULL, user_id TEXT NOT NULL, viewed_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (message_id, user_id));
      CREATE INDEX IF NOT EXISTS idx_psess_user ON penc_sessions(user_id);
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS public_key TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS key_backup TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false;
      CREATE TABLE IF NOT EXISTS penc_ads (
        id TEXT PRIMARY KEY,
        title TEXT,
        type TEXT DEFAULT 'text',
        media_url TEXT,
        bg_color TEXT DEFAULT '#0E8C7C',
        link_url TEXT,
        duration INT DEFAULT 8,
        cpv_fcfa INT DEFAULT 5,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS penc_ad_revenue (
        id TEXT PRIMARY KEY,
        ad_id TEXT,
        viewer_id TEXT,
        total INT, creator_share INT, penc_share INT, reserve_share INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO penc_ads(id,title,type,bg_color,duration,cpv_fcfa,active) VALUES('ad_demo','Votre publicité ici — Annoncez sur Penc','text','#0E8C7C',8,5,TRUE) ON CONFLICT(id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS penc_polls (
        id TEXT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_by TEXT,
        channel_id TEXT,
        conversation_id TEXT,
        type VARCHAR(20) DEFAULT 'single' CHECK (type IN ('single','multiple','rating')),
        status VARCHAR(10) DEFAULT 'draft' CHECK (status IN ('draft','active','closed')),
        is_anonymous BOOLEAN DEFAULT FALSE,
        show_results_before_vote BOOLEAN DEFAULT FALSE,
        starts_at TIMESTAMPTZ DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        total_votes INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS penc_poll_options (
        id TEXT PRIMARY KEY,
        poll_id TEXT REFERENCES penc_polls(id) ON DELETE CASCADE,
        option_text VARCHAR(255) NOT NULL,
        votes_count INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS penc_poll_votes (
        id TEXT PRIMARY KEY,
        poll_id TEXT REFERENCES penc_polls(id) ON DELETE CASCADE,
        option_id TEXT,
        user_id TEXT,
        ip_address VARCHAR(50),
        voted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(poll_id, user_id, option_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ppoll_status  ON penc_polls(status);
      CREATE INDEX IF NOT EXISTS idx_ppopt_poll    ON penc_poll_options(poll_id);
      CREATE INDEX IF NOT EXISTS idx_ppvote_poll   ON penc_poll_votes(poll_id);
      CREATE INDEX IF NOT EXISTS idx_ppvote_user   ON penc_poll_votes(poll_id, user_id);
      CREATE TABLE IF NOT EXISTS penc_scheduled_messages (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'message',
        conversation_id TEXT,
        sender_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        content TEXT,
        media_url TEXT,
        duration INTEGER,
        scheduled_for TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_psched_due    ON penc_scheduled_messages(status, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_psched_sender ON penc_scheduled_messages(sender_id, status);
      ALTER TABLE penc_scheduled_messages ADD COLUMN IF NOT EXISTS meta JSONB;
    `);
    console.log('✅ PostgreSQL Penc connecté — tables users/convs/messages prêtes');
    try{ await _pgPool.query("INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,bio,created_at) VALUES('penc_official','Penc','penc_officiel','+00000000000',NULL,'-','https://penc-messagerie.com/penc-icon-192.png','Compte officiel Penc',NOW()) ON CONFLICT(id) DO UPDATE SET full_name='Penc', avatar_url='https://penc-messagerie.com/penc-icon-192.png', bio='Compte officiel Penc'"); console.log('✅ Compte officiel Penc pret'); }catch(eOff){ console.error('Penc official:', eOff.message); }
    // Station "Sonko Archives FM" — créée automatiquement au démarrage, en état "Bientôt disponible"
    // (pas de flux en direct pour l'instant). Id fixe + ON CONFLICT DO NOTHING : n'écrase jamais
    // une modification faite depuis l'admin par la suite (nom, logo, flux une fois prêt, etc.).
    // "country" = 'Penc Originals' (pas un vrai pays) : c'est une station propre à Penc, elle a
    // donc sa propre case dans "Radios par pays" au lieu d'être noyée dans la liste du Sénégal.
    try{
      await _pgPool.query(
        `INSERT INTO penc_radio_stations(id,name,stream_url,logo_url,country,category,featured,replay_enabled,coming_soon)
         VALUES('rad_sonko_archives_fm','Sonko Archives FM','','','Penc Originals','Archives',false,false,true)
         ON CONFLICT (id) DO NOTHING`
      );
      // Si la station existait déjà avec l'ancien pays 'Sénégal' (déploiement précédent), on la
      // fait basculer — sans écraser un nom/logo/flux que l'admin aurait déjà personnalisé.
      await _pgPool.query(`UPDATE penc_radio_stations SET country='Penc Originals' WHERE id='rad_sonko_archives_fm' AND country='Sénégal'`);
      console.log('✅ Station Sonko Archives FM prête (Bientôt disponible)');
    }catch(eSAF){ console.error('Sonko Archives FM seed:', eSAF.message); }
    // v11 : reparation GLOBALE des noms au demarrage (comptes Google restes 'Utilisateur' —
    // ils ne repassent jamais par /auth/google tant que leur jeton est valide, donc on repare ici).
    try{
      const _nr=await _pgPool.query("UPDATE penc_users SET full_name = initcap(btrim(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g'))) WHERE email IS NOT NULL AND position('@' in email)>1 AND (full_name IS NULL OR btrim(full_name)='' OR lower(btrim(full_name)) IN ('utilisateur','utilisateur penc','user'))");
      if(_nr.rowCount>0) console.log('✅ Noms repares au demarrage (via email): '+_nr.rowCount);
    }catch(eNr){ console.error('repair noms email:', eNr.message); }
    try{
      const _nr2=await _pgPool.query("UPDATE penc_users SET full_name = initcap(btrim(regexp_replace(username,'[._-]+',' ','g'))) WHERE (email IS NULL OR position('@' in email)<=1) AND username IS NOT NULL AND btrim(username)<>'' AND (full_name IS NULL OR btrim(full_name)='' OR lower(btrim(full_name)) IN ('utilisateur','utilisateur penc','user'))");
      if(_nr2.rowCount>0) console.log('✅ Noms repares au demarrage (via pseudo): '+_nr2.rowCount);
    }catch(eNr2){}
    // v16 : NETTOYAGE des debris de l'ere des comptes fantomes
    try{
      const _d1=await _pgPool.query("DELETE FROM penc_conversations WHERE jsonb_array_length(participants)<2 OR participants->>0 = participants->>1");
      if(_d1.rowCount>0) console.log('\u{1F9F9} Conversations avec soi-meme supprimees: '+_d1.rowCount);
    }catch(eD1){ console.error('cleanup self-convs:', eD1.message); }
    try{
      const _d2=await _pgPool.query("DELETE FROM penc_conversations c WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.participants) p WHERE NOT EXISTS (SELECT 1 FROM penc_users u WHERE u.id=p))");
      if(_d2.rowCount>0) console.log('\u{1F9F9} Conversations fantomes supprimees: '+_d2.rowCount);
    }catch(eD2){ console.error('cleanup ghost-convs:', eD2.message); }
    try{
      const _d3=await _pgPool.query("DELETE FROM penc_friendships f WHERE f.requester=f.recipient OR NOT EXISTS(SELECT 1 FROM penc_users u WHERE u.id=f.requester) OR NOT EXISTS(SELECT 1 FROM penc_users u2 WHERE u2.id=f.recipient)");
      if(_d3.rowCount>0) console.log('\u{1F9F9} Amities fantomes supprimees: '+_d3.rowCount);
    }catch(eD3){ console.error('cleanup ghost-friendships:', eD3.message); }
    try{
      const _pr=await _pgPool.query("UPDATE penc_users SET phone='g_'||id WHERE phone=''");
      if(_pr.rowCount>0) console.log('\u2705 Telephones vides repares (comptes Google): '+_pr.rowCount);
    }catch(ePr){ console.error('repair phones:', ePr.message); }
    try{ await _pgPool.query(`CREATE TABLE IF NOT EXISTS penc_meetings ( code TEXT PRIMARY KEY, title TEXT DEFAULT '', host TEXT NOT NULL, scheduled_at TIMESTAMPTZ, approval BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW() )`); }catch(eM1){}
    try{ await _pgPool.query(`CREATE TABLE IF NOT EXISTS penc_meet_ratings ( id TEXT PRIMARY KEY, code TEXT, user_id TEXT, stars INTEGER, comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW() )`); }catch(eM2){}
    try{ await _pgPool.query(`CREATE TABLE IF NOT EXISTS penc_meet_history ( id TEXT PRIMARY KEY, code TEXT, title TEXT, host TEXT, participant TEXT, joined_at TIMESTAMPTZ DEFAULT NOW(), left_at TIMESTAMPTZ )`); }catch(eM3){}
    try{ await _pgPool.query(`CREATE TABLE IF NOT EXISTS penc_transcripts ( url_hash TEXT PRIMARY KEY, text TEXT, created_at TIMESTAMPTZ DEFAULT NOW() )`); }catch(eM4){}
    // Migrer les users JSONBin existants vers PostgreSQL (une seule fois)
    const r=await _pgPool.query('SELECT COUNT(*) FROM penc_users');
    if(parseInt(r.rows[0].count)===0){
      const jbUsers=await pencUsers();
      if(jbUsers.length>0){
        console.log('🔄 Migration '+jbUsers.length+' users JSONBin → PostgreSQL...');
        for(const u of jbUsers){
          try{
            await _pgPool.query(
              'INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,bio,is_admin,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
              [u.id||'u_'+Date.now(),u.full_name||'',u.username||'',u.phone||'',u.email||null,u.password||'',u.avatar_url||null,u.bio||'',PENC_ADMIN_EMAILS.includes((u.email||'').toLowerCase()),u.created_at||new Date().toISOString()]
            );
          }catch(e){ /* doublon ignoré */ }
        }
        console.log('✅ Migration terminée');
      }
    }
  }catch(e){ console.error('❌ PostgreSQL Penc erreur:', e.message); _pgPool=null; }
})();

// ── Helpers PostgreSQL ──────────────────────────────────────
function pgRow(row){ if(!row) return null;
  return { id:row.id, full_name:row.full_name, username:row.username, phone:row.phone,
           email:row.email, password:row.password_hash, avatar_url:row.avatar_url,
           bio:row.bio||'', is_admin:row.is_admin||false,
           is_online:row.is_online, last_seen:row.last_seen, geo:row.geo||{},
           total_time_seconds:row.total_time_seconds||0, valid_views:row.valid_views||0, totp_enabled:row.totp_enabled||false, created_at:row.created_at };
}
async function pgFindUser(field, value){
  if(!_pgPool) return null;
  const q=field==='email'?'SELECT * FROM penc_users WHERE LOWER(email)=LOWER($1)'
          :field==='username'?'SELECT * FROM penc_users WHERE LOWER(username)=LOWER($1)'
          :'SELECT * FROM penc_users WHERE '+field+'=$1';
  const r=await _pgPool.query(q,[value]); return pgRow(r.rows[0]||null);
}
async function pgFindUsersByIds(ids){
  if(!_pgPool || !ids || !ids.length) return [];
  const r=await _pgPool.query('SELECT * FROM penc_users WHERE id = ANY($1)',[ids]);
  return r.rows.map(pgRow);
}
async function pgCreateUser(u){
  const r=await _pgPool.query(
    'INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,is_admin,referral_code,referred_by,balance,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *',
    [u.id,u.full_name,u.username,u.phone,u.email||null,u.password_hash,u.avatar_url||null,u.is_admin||false,u.referral_code||null,u.referred_by||null,u.balance||0]
  ); return pgRow(r.rows[0]);
}
async function pgUpdateUser(id,fields){
  if(!_pgPool) return;
  const sets=[]; const vals=[]; let n=1;
  Object.entries(fields).forEach(([k,v])=>{ sets.push(k+'=$'+n); vals.push(v); n++; });
  vals.push(id);
  await _pgPool.query('UPDATE penc_users SET '+sets.join(',')+'  WHERE id=$'+n,vals);
}
async function pgAllUsers(){
  if(!_pgPool) return null;
  const r=await _pgPool.query('SELECT * FROM penc_users ORDER BY created_at DESC');
  return r.rows.map(pgRow);
}
// Fusion PostgreSQL + JSONBin : garantit que TOUT utilisateur (meme cree quand PG etait indisponible) apparait
async function pgAllUsersMerged(){
  if(!_pgPool){ try{ return await pencUsers()||[]; }catch(_){ return []; } }
  const pg=await pgAllUsers()||[];
  let jb=[]; try{ jb=await pencUsers()||[]; }catch(_){}
  if(!jb.length) return pg;
  const ids=new Set(pg.map(u=>String(u.id)));
  const phones=new Set(pg.map(u=>String((u.phone||'')).trim()).filter(Boolean));
  const extra=jb.filter(u=>u&&u.id&&!ids.has(String(u.id))&&!(u.phone&&phones.has(String(u.phone).trim()))).map(u=>({
    id:u.id, full_name:u.full_name||u.username||'Utilisateur', username:u.username||'', phone:u.phone||'', email:u.email||null,
    password:u.password||u.password_hash||'', avatar_url:u.avatar_url||null, bio:u.bio||'', is_admin:!!u.is_admin,
    created_at:u.created_at||null, valid_views:u.valid_views||0
  }));
  return pg.concat(extra);
}

// ── Helpers PG conversations & messages ─────────────────
async function pgGetConvs(userId){
  if(!_pgPool) return [];
  const r=await _pgPool.query(
    'SELECT * FROM penc_conversations WHERE participants @> $1 ORDER BY updated_at DESC',
    [JSON.stringify([userId])]
  );
  return r.rows;
}
async function pgGetOrCreateConv(uid1,uid2){
  if(!_pgPool) return null;
  // Chercher conv existante
  const r=await _pgPool.query(
    'SELECT * FROM penc_conversations WHERE participants @> $1 AND participants @> $2',
    [JSON.stringify([uid1]),JSON.stringify([uid2])]
  );
  if(r.rows.length) return r.rows[0];
  // Créer nouvelle conv
  const id='conv_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const ins=await _pgPool.query(
    'INSERT INTO penc_conversations(id,participants,updated_at) VALUES($1,$2,NOW()) RETURNING *',
    [id,JSON.stringify([uid1,uid2])]
  );
  return ins.rows[0];
}
async function pgGetMessages(convId, limit=100){
  if(!_pgPool) return [];
  const r=await _pgPool.query(
    'SELECT * FROM penc_messages WHERE conversation_id=$1 ORDER BY created_at ASC LIMIT $2',
    [convId, limit]
  );
  return r.rows;
}
async function pgSaveMessage(msg){
  if(!_pgPool) return null;
  const r=await _pgPool.query(
    'INSERT INTO penc_messages(id,conversation_id,sender_id,type,content,media_url,duration,reply_to,created_at,deleted_for_all,pending,client_id,expires_at,view_once) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11,$12,$13) RETURNING *',
    [msg.id,msg.conversation_id,msg.sender_id,msg.type||'text',msg.content||'',msg.media_url||null,msg.duration||null,msg.reply_to?JSON.stringify(msg.reply_to):null,msg.created_at||new Date().toISOString(),msg.pending||false,msg.client_id||null,msg.expires_at||null,msg.view_once||false]
  );
  // Mettre à jour updated_at de la conv
  await _pgPool.query('UPDATE penc_conversations SET updated_at=NOW() WHERE id=$1',[msg.conversation_id]);
  return r.rows[0];
}
// Réservation ATOMIQUE d'un client_id avant toute diffusion socket — sans ça, deux envois
// concurrents (ex: l'émission directe + la relance de la file hors-ligne pendant qu'un
// vocal/média lent est encore en cours) peuvent chacun passer la vérification "existe déjà ?"
// avant que l'autre n'ait fini d'insérer, et diffuser chacun sa propre copie du message
// (doublon visible côté client, un seul des deux survit en base — d'où le doublon qui
// "disparaît" seulement après rechargement complet). ON CONFLICT rend cette course impossible :
// une seule des deux requêtes peut gagner la ligne, l'autre reçoit `null` (= doublon avéré).
async function pgClaimMessage(msg){
  if(!_pgPool) return null;
  const r=await _pgPool.query(
    'INSERT INTO penc_messages(id,conversation_id,sender_id,type,content,media_url,duration,reply_to,created_at,deleted_for_all,pending,client_id,expires_at,view_once) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11,$12,$13) ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO NOTHING RETURNING *',
    [msg.id,msg.conversation_id,msg.sender_id,msg.type||'text',msg.content||'',msg.media_url||null,msg.duration||null,msg.reply_to?JSON.stringify(msg.reply_to):null,msg.created_at||new Date().toISOString(),msg.pending||false,msg.client_id||null,msg.expires_at||null,msg.view_once||false]
  );
  if(r.rows[0]){ await _pgPool.query('UPDATE penc_conversations SET updated_at=NOW() WHERE id=$1',[msg.conversation_id]); return r.rows[0]; }
  return null; // conflit = un autre envoi avec le même client_id a déjà gagné la course
}
// ==== Message d'accueil Penc (complet) + relance apres absence ====
function _pencWelcomeText(fullName){
  return "Bienvenue sur Penc, "+fullName+" ! \uD83C\uDF89 Ta messagerie mondiale gratuite : \uD83D\uDCAC messages priv\u00e9s & groupes, \uD83C\uDFA4 vocaux, \uD83D\uDCDE\uD83C\uDFA5 appels audio & vid\u00e9o, \uD83D\uDCF8 statuts \u00e9ph\u00e9m\u00e8res, \uD83D\uDCE1 canaux, \uD83D\uDCFB radio DeglouFM en direct, \uD83D\uDCB8 transferts d'argent. R\u00e9ponds \u00e0 ce message pour toute question. \u2014 L'\u00e9quipe Penc \uD83D\uDC9A";
}
function _pencWelcomeBackText(fullName){
  return "Contente\u2026 non, content de te revoir sur Penc"+(fullName?(", "+fullName):"")+" ! \uD83D\uDC4B Pendant ton absence, tes messages, tes appels, tes statuts et la radio DeglouFM en direct t'attendent. Jette un \u0153il \u00e0 tes conversations en attente. \u2014 L'\u00e9quipe Penc \uD83D\uDC99";
}
async function _sendPencOfficialDM(uid, text, pushTitle, pushBody, tag){
  try{
    if(!_pgPool || !uid || String(uid)==='penc_official') return;
    const _conv = await pgGetOrCreateConv('penc_official', uid);
    if(!_conv) return;
    const _msg = { id:'msg_'+Date.now()+Math.random().toString(36).slice(2), conversation_id:_conv.id, sender_id:'penc_official', type:'text', content:text, created_at:new Date().toISOString() };
    let _sender={ id:'penc_official', full_name:'Penc' }; try{ const _pu=await pgFindUser('id','penc_official'); if(_pu) _sender=pencStrip(_pu); }catch(_){}
    const _full = Object.assign({}, _msg, { sender:_sender });
    try{ io.to('penc:'+_conv.id).emit('message:new',_full); }catch(_){}
    try{ io.to('user:'+String(uid)).emit('message:new',_full); }catch(_){}
    try{ await pgSaveMessage({ id:_msg.id, conversation_id:_conv.id, sender_id:'penc_official', type:'text', content:text, created_at:_msg.created_at }); }catch(_){}
    try{ if(typeof webpush!=='undefined' && webpush){ await sendPencPush(uid,{title:pushTitle,body:pushBody,tag:tag,url:'/messager?conv='+_conv.id,conv_id:_conv.id}); } }catch(_){}
  }catch(_e){}
}
// ==== Programmation de contenu : messages texte (phase 1/4) ====
async function _firePencScheduledMessage(row){
  try{
    const msg = {
      id: 'msg_'+Date.now()+Math.random().toString(36).slice(2),
      conversation_id: row.conversation_id, sender_id: row.sender_id,
      type: row.type||'text', content: row.content||null,
      media_url: row.media_url||null, media_duration: row.duration||null,
      created_at: new Date().toISOString(), read_at:null
    };
    let sender = { id: row.sender_id };
    try{ const u=await pgFindUser('id',row.sender_id); if(u) sender=pencStrip(u); }catch(_){}
    const fullMsg = { ...msg, sender };
    try{ io.to('penc:'+row.conversation_id).emit('message:new', fullMsg); }catch(_){}
    let parts=[];
    try{
      const cr=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[row.conversation_id]);
      parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants)?cr.rows[0].participants:JSON.parse(cr.rows[0].participants||'[]')) : [];
      parts.forEach(function(pid){ if(String(pid)!==String(row.sender_id)) io.to('user:'+pid).emit('message:new', fullMsg); });
    }catch(_){}
    try{ await pgSaveMessage({ id:msg.id, conversation_id:msg.conversation_id, sender_id:msg.sender_id, type:msg.type, content:msg.content||'', media_url:msg.media_url||null, duration:msg.media_duration||null, created_at:msg.created_at }); }catch(e){ console.error('scheduled persist:', e.message); }
    try{
      if(typeof webpush!=='undefined' && webpush){
        const pbody = (typeof msg.content==='string' && msg.content.indexOf('PENC_E2E_v1:')===0) ? '\uD83D\uDD12 Nouveau message' : pencMsgBody(msg.type, msg.content, msg.media_duration);
        const ptitle = (sender && sender.full_name) ? sender.full_name : 'Nouveau message';
        for(const rid of parts){ if(String(rid)!==String(row.sender_id)){ try{ await sendPencPush(rid,{title:ptitle,body:pbody,tag:'penc-'+row.conversation_id,url:'/messager?conv='+row.conversation_id,conv_id:row.conversation_id}); }catch(_pp){} } }
      }
    }catch(_){}
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='sent', sent_at=NOW() WHERE id=$1", [row.id]);
  }catch(e){
    console.error('scheduled fire:', e.message);
    try{ await _pgPool.query("UPDATE penc_scheduled_messages SET status='failed' WHERE id=$1", [row.id]); }catch(_){}
  }
}
async function _pencScheduledMessagesTick(){
  if(!_pgPool) return;
  try{
    const r = await _pgPool.query("UPDATE penc_scheduled_messages SET status='sending' WHERE id IN (SELECT id FROM penc_scheduled_messages WHERE status='pending' AND kind='message' AND scheduled_for<=NOW() ORDER BY scheduled_for ASC LIMIT 25) RETURNING *");
    for(const row of r.rows){ await _firePencScheduledMessage(row); }
  }catch(e){ console.error('scheduler tick:', e.message); }
}
setInterval(_pencScheduledMessagesTick, 30000);
// ==== Programmation de contenu : statuts (phase 3/4) ====
async function _firePencScheduledStatus(row){
  try{
    let meta = row.meta || {};
    if(typeof meta === 'string'){ try{ meta = JSON.parse(meta); }catch(_){ meta = {}; } }
    const expireH = (typeof meta.expire_hours==='number' && meta.expire_hours>0) ? meta.expire_hours : 24;
    const status = {
      id: 'st_'+Date.now()+Math.random().toString(36).slice(2),
      user_id: row.sender_id, type: row.type||'text',
      media_url: row.media_url||null, media_urls: meta.media_urls||null,
      text_content: row.content||null,
      bg_color: meta.bg_color||'#050D18', caption: meta.caption||null,
      duration: row.duration||(row.type==='video'?0:10),
      reactions: [], views: [], view_ips: [],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now()+expireH*3600000).toISOString()
    };
    if(_pgPool){ await pgSaveStatus(status); }
    try{
      const _fr=await _pgPool.query("SELECT requester,recipient FROM penc_friendships WHERE status='accepted' AND (requester=$1 OR recipient=$1)",[row.sender_id]);
      const _fids=_fr.rows.map(function(x){ return String(x.requester)===String(row.sender_id)?x.recipient:x.requester; });
      let _an='Un ami'; try{ const _au=await _pgPool.query('SELECT full_name,username FROM penc_users WHERE id=$1',[row.sender_id]); if(_au.rows[0]) _an=_au.rows[0].full_name||_au.rows[0].username||'Un ami'; }catch(_e9){}
      _fids.forEach(function(fid){ try{ emitToUsers(String(fid),'status:new',{status_id:status.id, author_id:row.sender_id, author_name:_an}); }catch(_e10){} });
    }catch(_eF){}
    try{
      if(typeof webpush!=='undefined' && webpush){
        let author=null;
        const ar=await _pgPool.query('SELECT full_name,username FROM penc_users WHERE id=$1',[row.sender_id]); author=ar.rows[0];
        const aname=author?(author.full_name||author.username||'Quelqu\'un'):'Quelqu\'un';
        const partners=new Set();
        const cr=await _pgPool.query('SELECT participants FROM penc_conversations');
        for(const crow of cr.rows){ const parts=Array.isArray(crow.participants)?crow.participants:JSON.parse(crow.participants||'[]'); if(parts.includes(row.sender_id)) parts.forEach(p=>{ if(p!==row.sender_id) partners.add(p); }); }
        const ppayload={ title:aname, body:'A publi\u00e9 un nouveau statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-status-'+row.sender_id, data:{ type:'status', user_id:row.sender_id, url:'/' } };
        partners.forEach(uid=>{ sendPencPush(uid, ppayload); });
      }
    }catch(_ePush){}
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='sent', sent_at=NOW() WHERE id=$1", [row.id]);
  }catch(e){
    console.error('scheduled status fire:', e.message);
    try{ await _pgPool.query("UPDATE penc_scheduled_messages SET status='failed' WHERE id=$1", [row.id]); }catch(_){}
  }
}
async function _pencScheduledStatusTick(){
  if(!_pgPool) return;
  try{
    const r = await _pgPool.query("UPDATE penc_scheduled_messages SET status='sending' WHERE id IN (SELECT id FROM penc_scheduled_messages WHERE status='pending' AND kind='status' AND scheduled_for<=NOW() ORDER BY scheduled_for ASC LIMIT 25) RETURNING *");
    for(const row of r.rows){ await _firePencScheduledStatus(row); }
  }catch(e){ console.error('scheduler statut tick:', e.message); }
}
setInterval(_pencScheduledStatusTick, 30000);
// ==== Programmation de contenu : canaux/broadcast (phase 4/4) ====
async function _firePencScheduledChannelPost(row){
  try{
    const channels = await pencChannels();
    const ch = channels.find(function(x){ return x.id === row.conversation_id; });
    if(!ch){ await _pgPool.query("UPDATE penc_scheduled_messages SET status='failed' WHERE id=$1",[row.id]); return; }
    const post = { id:'p_'+Date.now(), sender_id: row.sender_id, content: row.content||'', type: row.type||'text',
      media_url: row.media_url||null, created_at: new Date().toISOString(), reactions:{} };
    if(!ch.posts) ch.posts=[];
    ch.posts.push(post);
    await pencSaveChannels(channels);
    if(global._pencIo){
      (ch.followers||[]).forEach(function(fid){ global._pencIo.to('user:'+fid).emit('channel:post',{channel_id:ch.id,post:post}); });
    }
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='sent', sent_at=NOW() WHERE id=$1", [row.id]);
  }catch(e){
    console.error('scheduled channel post fire:', e.message);
    try{ await _pgPool.query("UPDATE penc_scheduled_messages SET status='failed' WHERE id=$1", [row.id]); }catch(_){}
  }
}
async function _pencScheduledChannelTick(){
  if(!_pgPool) return;
  try{
    const r = await _pgPool.query("UPDATE penc_scheduled_messages SET status='sending' WHERE id IN (SELECT id FROM penc_scheduled_messages WHERE status='pending' AND kind='channel_post' AND scheduled_for<=NOW() ORDER BY scheduled_for ASC LIMIT 25) RETURNING *");
    for(const row of r.rows){ await _firePencScheduledChannelPost(row); }
  }catch(e){ console.error('scheduler canal tick:', e.message); }
}
setInterval(_pencScheduledChannelTick, 30000);
// GET /api/penc/check-username — vérif dispo username (public)
app.get('/api/penc/check-username', async (req, res) => {
  try {
    const u = ((req.query.u||'')+'').trim();
    if (!u || u.length < 2) return res.json({ available: false });
    let taken = false;
    if (_pgPool) { taken = !!(await pgFindUser('username', u)); }
    else { const users = await pencUsers(); taken = users.some(x => (x.username||'').toLowerCase() === u.toLowerCase()); }
    res.json({ available: !taken });
  } catch (e) { res.json({ available: true }); }
});
// POST /api/penc/auth/register
// ══════════════ VERIFICATION EMAIL OBLIGATOIRE A L'INSCRIPTION ══════════════
const _pencSignupPending = new Map(); // email (lowercase) -> { code, expiresAt, attempts }
async function _pencSendSignupEmail(email, code){
  try{
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if(!RESEND_API_KEY){ console.log('[signup-email] ECHEC: RESEND_API_KEY non configuree'); return false; }
    const ctrl = new AbortController();
    const timeoutId = setTimeout(function(){ ctrl.abort(); }, 8000);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Penc <no-reply@penc-messagerie.com>',
        to: [email],
        subject: 'Penc — Vérifiez votre adresse email',
        html: _pencEmailShell(
          'Bienvenue sur Penc !',
          '<p style="margin:0 0 18px;color:#333;font-size:15px;line-height:1.6;">Bonjour,</p>'+
          '<p style="margin:0 0 22px;color:#333;font-size:15px;line-height:1.6;">Merci de rejoindre Penc. Pour confirmer que cette adresse email vous appartient bien, voici votre code de vérification :</p>'+
          '<div style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#F0F5FF;color:#12388C;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 28px;border-radius:14px;border:1px solid #D6E4FF;">'+code+'</span></div>'+
          '<p style="margin:0 0 6px;color:#666;font-size:14px;line-height:1.6;">Ce code est valable pendant <b>10 minutes</b>.</p>'+
          '<p style="margin:0;color:#999;font-size:13px;line-height:1.6;">Si vous n\'êtes pas à l\'origine de cette inscription, ignorez simplement cet email.</p>'
        )
      }),
      signal: ctrl.signal
    });
    clearTimeout(timeoutId);
    const ok = r.ok;
    console.log('[signup-email]', email, '->', ok ? 'OK' : ('ECHEC HTTP '+r.status));
    return ok;
  }catch(e){ console.log('[signup-email] EXCEPTION:', email, '->', e.message); return false; }
}
// POST /api/penc/auth/register/email/send — envoie un code de verification a l'email saisi (avant inscription)
app.post('/api/penc/auth/register/email/send', async (req, res) => {
  try{
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
    if(_pgPool){
      const existing = await pgFindUser('email', email);
      if(existing) return res.status(400).json({ error: '⚠️ Cet email existe déjà. Connecte-toi.' });
    }
    const code = String(Math.floor(100000+Math.random()*900000));
    _pencSignupPending.set(email, { code, expiresAt: Date.now()+10*60*1000, attempts:0 });
    setTimeout(function(){ const p=_pencSignupPending.get(email); if(p && p.code===code){ _pencSignupPending.delete(email); } }, 10*60*1000);
    const sent = await _pencSendSignupEmail(email, code);
    if(!sent) return res.status(500).json({ error: 'Envoi impossible, réessaie dans un instant' });
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// POST /api/penc/auth/register/email/verify — verifie le code, renvoie un jeton temporaire (10 min) a fournir a /register
app.post('/api/penc/auth/register/email/verify', async (req, res) => {
  try{
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const code = String((req.body && req.body.code) || '').trim();
    if(!email || !code) return res.status(400).json({ error: 'Données manquantes' });
    const p = _pencSignupPending.get(email);
    if(!p || p.expiresAt < Date.now()) return res.status(400).json({ error: 'Code invalide ou expiré' });
    p.attempts = (p.attempts||0)+1;
    if(p.attempts > 5){ _pencSignupPending.delete(email); return res.status(429).json({ error: 'Trop de tentatives, redemande un code' }); }
    if(p.code !== code) return res.status(400).json({ error: 'Code incorrect' });
    _pencSignupPending.delete(email);
    const token = jwt_penc.sign({ email:email, purpose:'signup_email_verified' }, PENC_SECRET, { expiresIn:'15m' });
    res.json({ success:true, email_verify_token: token });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/auth/register', async (req, res) => {
  try {
    const { full_name, username, phone, email, password, email_verify_token } = req.body;
    if (!full_name||!username||!phone||!password)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe min. 6 caractères' });
    // Si un email est fourni, il doit avoir été vérifié au préalable via /register/email/verify
    if (email) {
      if (!email_verify_token) return res.status(400).json({ error: 'Email non vérifié' });
      let payload;
      try{ payload = jwt_penc.verify(email_verify_token, PENC_SECRET); }catch(e){ return res.status(400).json({ error: 'Vérification email expirée, recommence' }); }
      if (!payload || payload.purpose !== 'signup_email_verified' || String(payload.email||'').toLowerCase() !== String(email).trim().toLowerCase()) {
        return res.status(400).json({ error: 'Email non vérifié' });
      }
    }
    if (full_name.length>120 || username.length>60 || (email && String(email).length>160) || password.length>200)
      return res.status(400).json({ error: 'Champs trop longs' });

    // ── Vérification unicité PostgreSQL (source de vérité) ──
    if (_pgPool) {
      const byPhone = await pgFindUser('phone', phone);
      if (byPhone) return res.status(400).json({ error: '⚠️ Ce numéro existe déjà. Connecte-toi.' });
      if (email) {
        const byEmail = await pgFindUser('email', email);
        if (byEmail) return res.status(400).json({ error: '⚠️ Cet email existe déjà. Connecte-toi.' });
      }
      const byUser = await pgFindUser('username', username);
      if (byUser) return res.status(400).json({ error: '⚠️ Ce username est pris.' });
    } else {
      // Fallback JSONBin
      const users = await pencUsers();
      if (users.some(u => u.phone === phone))
        return res.status(400).json({ error: '⚠️ Ce numéro existe déjà. Connecte-toi.' });
      if (email && users.some(u => (u.email||'').toLowerCase() === email.toLowerCase()))
        return res.status(400).json({ error: '⚠️ Cet email existe déjà. Connecte-toi.' });
      if (users.some(u => (u.username||'').toLowerCase() === username.toLowerCase()))
        return res.status(400).json({ error: '⚠️ Ce username est pris.' });
    }

    const hash = bcrypt_penc ? await bcrypt_penc.hash(password, 12) : password;
    const uid = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const isAdmin = PENC_ADMIN_EMAILS.includes((email||'').toLowerCase());
    const myRefCode = (username||'penc').toLowerCase().replace(/[^a-z0-9]/g,'');
    // ── Parrainage : si un code valide est fourni, le nouveau membre ET son parrain reçoivent un bonus ──
    const { referral_code } = req.body;
    let referrerUser = null;
    if (referral_code && _pgPool) {
      try { const rr = await _pgPool.query('SELECT id, balance FROM penc_users WHERE referral_code=$1', [String(referral_code).trim()]); referrerUser = rr.rows[0] || null; } catch(_re){}
    }
    const REFERRAL_BONUS = 200; // FCFA, pour le filleul ET le parrain
    const newUser = { id:uid, full_name, username, phone, email:email||null,
      password_hash:hash, avatar_url:null, bio:'', is_admin:isAdmin,
      referral_code: myRefCode, referred_by: referrerUser ? referrerUser.id : null,
      balance: referrerUser ? REFERRAL_BONUS : 0 };

    // ── Sauvegarder PostgreSQL (prioritaire) ──
    if (_pgPool) {
      await pgCreateUser(newUser);
    } else {
      // Fallback JSONBin
      const users = await pencUsers();
      users.push({...newUser, password:hash});
      await pencSaveUsers(users);
    }

    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: uid, sid: _sid }, PENC_SECRET, { expiresIn: '7d' });
    _pencCreateSession(uid, _sid, req).catch(function(){});
    const safe = pencStrip({...newUser,password:hash});
    // Créditer le parrain (le filleul a déjà son bonus inclus dans newUser.balance)
    if (referrerUser && _pgPool) {
      try {
        await _pgPool.query('UPDATE penc_users SET balance = COALESCE(balance,0) + $1 WHERE id=$2', [REFERRAL_BONUS, referrerUser.id]);
        try { await _sendPencOfficialDM(referrerUser.id, '🎉 '+full_name+' a rejoint Penc grâce à ton lien de parrainage ! +'+REFERRAL_BONUS+' F ajoutés à ton solde.', 'Penc', 'Parrainage réussi !', 'penc-referral'); } catch(_rd){}
      } catch(_ru){}
    }
    // Notifier les utilisateurs connectés
    setImmediate(async function(){
      try{
        const welcomeMsg = '🎉 '+full_name+' vient de rejoindre Penc !';
        pencOnline.forEach(function(sid){
          io.to(sid).emit('penc:welcome',{message:welcomeMsg});
        });
        try{ if(_pgPool){ const _ar=await _pgPool.query("SELECT id FROM penc_users WHERE LOWER(email) = ANY($1)",[PENC_ADMIN_EMAILS]); _ar.rows.forEach(function(a){ emitToUsers(String(a.id),'admin:newuser',{id:uid, full_name:full_name, email:email||'', phone:phone}); }); } }catch(e4){}
        try{ if(_pgPool){ await _sendPencOfficialDM(uid, _pencWelcomeText(full_name), 'Penc', 'Bienvenue sur Penc ! \ud83c\udf89', 'penc-welcome'); } }catch(eWel){}
      }catch(e2){}
    });
    res.json({ user: Object.assign({}, safe, { is_admin: isAdmin }), token: tok });
  } catch(e) {
    console.error('register:', e.message);
    if(e.code==='23505') { // PostgreSQL unique violation
      const field=e.constraint||'';
      const msg=field.includes('phone')?'Ce num\u00e9ro est pris.':field.includes('email')?'Cet email est pris.':'Ce compte existe d\u00e9j\u00e0.';
      return res.status(400).json({error: '⚠️ '+msg+' Connecte-toi.'});
    }
    res.status(500).json({ error: 'Erreur serveur: '+e.message });
  }
});

// ── Anti-force brute (Couche 2) : 5 echecs => blocage 15 min ──
const _msgFloodMap = new Map(); // userId -> {count, windowStart}
function _pencMsgFlood(userId){
  try{
    const now = Date.now(), WINDOW = 10000, LIMIT = 20;
    let e = _msgFloodMap.get(userId);
    if(!e || now - e.windowStart > WINDOW){ e = { count:0, windowStart:now }; }
    e.count++;
    _msgFloodMap.set(userId, e);
    if(_msgFloodMap.size > 5000){ for(const k of _msgFloodMap.keys()){ _msgFloodMap.delete(k); if(_msgFloodMap.size<=4000) break; } }
    return e.count > LIMIT;
  }catch(e){ return false; }
}
const _pencFails = new Map();
function _pencBruteKey(req, id){ const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(); return ip+'|'+String(id||'').toLowerCase(); }
function _pencBruteBlocked(req, id){ const e=_pencFails.get(_pencBruteKey(req,id)); if(e&&e.until&&e.until>Date.now()) return Math.ceil((e.until-Date.now())/60000); return 0; }
function _pencBruteFail(req, id){ const k=_pencBruteKey(req,id); const now=Date.now(); let e=_pencFails.get(k); if(!e||(e.first&&now-e.first>15*60*1000)) e={n:0,first:now,until:0}; e.n++; if(e.n>=5){ e.until=now+15*60*1000; } _pencFails.set(k,e); if(_pencFails.size>5000){ for(const kk of _pencFails.keys()){ _pencFails.delete(kk); if(_pencFails.size<=4000) break; } } try{ const ipOnly=_pencBruteKey(req,'').split('|')[0]; let a=_pencIpFails.get(ipOnly); if(!a||now-a.first>5*60*1000) a={n:0,first:now,alerted:false}; a.n++; if(a.n>10 && !a.alerted){ a.alerted=true; _pencSecurityAlert(ipOnly,a.n); } _pencIpFails.set(ipOnly,a); }catch(_){} }
function _pencBruteOk(req, id){ _pencFails.delete(_pencBruteKey(req,id)); }
// ── Sessions & révocation (Couche 4) ──
const _pencRevokedSids = new Set();
const _pencIpFails = new Map();
async function _pencLoadRevoked(){ try{ if(!_pgPool) return; const r=await _pgPool.query("SELECT sid FROM penc_sessions WHERE revoked=TRUE"); r.rows.forEach(function(x){ _pencRevokedSids.add(x.sid); }); }catch(e){} }
function _pencNewSid(){ return 's_'+Date.now()+'_'+Math.random().toString(36).slice(2,10); }
// ═══ Verrou d'appareil : un compte déjà connecté sur un appareil ne peut en ajouter un nouveau
// que par liaison QR — jamais par simple email/mot de passe (exigence explicite du produit). ═══
async function _pencDeviceLockCheck(userId, req){
  try{
    if(!_pgPool) return {blocked:false};
    const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0,300);
    const r = await _pgPool.query('SELECT ua FROM penc_sessions WHERE user_id=$1 AND revoked=FALSE', [userId]);
    if(!r.rows.length) return {blocked:false}; // aucun appareil actif -> première connexion, toujours autorisée
    const sameDevice = r.rows.some(function(row){ return String(row.ua||'')===ua; });
    if(sameDevice) return {blocked:false}; // reconnexion sur un appareil déjà connu -> autorisée
    return {blocked:true};
  }catch(e){ return {blocked:false}; } // en cas de doute technique, ne jamais bloquer l'accès par erreur
}
async function _pencCreateSession(uid, sid, req){
  try{
    const ip=(req&&req.headers&&String(req.headers['x-forwarded-for']||'').split(',')[0].trim())||'';
    const ua=(req&&req.headers&&req.headers['user-agent'])||'';
    let isNew=false;
    if(_pgPool){
      try{ const ex=await _pgPool.query("SELECT 1 FROM penc_sessions WHERE user_id=$1 AND ua=$2 AND revoked=FALSE LIMIT 1",[uid,String(ua).slice(0,300)]); isNew=(ex.rowCount===0); }catch(_){}
      try{ await _pgPool.query("INSERT INTO penc_sessions(sid,user_id,ua,ip) VALUES($1,$2,$3,$4) ON CONFLICT (sid) DO NOTHING",[sid,uid,String(ua).slice(0,300),ip]); }catch(_){}
    }
    return { isNew:isNew };
  }catch(e){ return { isNew:false }; }
}
async function _pencSecurityAlert(ip, n){
  try{
    if(!_pgPool) return;
    const r=await _pgPool.query("SELECT id FROM penc_users WHERE LOWER(email) = ANY($1)",[PENC_ADMIN_EMAILS]);
    r.rows.forEach(function(a){ try{ emitToUsers(String(a.id),'admin:security_alert',{ip:ip,count:n,time:new Date().toISOString()}); }catch(_){} });
  }catch(e){}
}
setTimeout(function(){ try{ _pencLoadRevoked(); }catch(e){} }, 9000);
// Recharge periodique (toutes les 60s) : essentiel des qu'il y a plusieurs instances derriere un
// equilibreur de charge — sans ca, une session revoquee sur le serveur A resterait valide sur le
// serveur B indefiniment (l'instance B n'apprend la revocation qu'au demarrage sinon).
setInterval(function(){ try{ _pencLoadRevoked(); }catch(e){} }, 60000);

// ══════════════ MOT DE PASSE OUBLIÉ (réel, connecté serveur + SMS/email) ══════════════
// NOTE: n'utilise JAMAIS les routes /api/sen-sms/* existantes (règle absolue : ne jamais
// toucher au code SenSMS). Appel direct et indépendant de l'API Techsoft ici.
const _pencForgotPending = new Map(); // userId -> { code, expiresAt, attempts, channel }
function _pencForgotKey(userId){ return String(userId); }
async function _pencSendResetSMS(phone, code){
  try{
    const TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || '1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823';
    const url = 'https://app.techsoft-sms.com/api/http/' +
      '?token=' + encodeURIComponent(TECHSOFT_TOKEN) +
      '&to=' + encodeURIComponent(phone) +
      '&message=' + encodeURIComponent('Penc - Votre code de reinitialisation est : ' + code + ' (valable 10 min)') +
      '&sender_id=' + encodeURIComponent('Penc');
    const r = await fetch(url);
    const txt = await r.text();
    const ok = !/error/i.test(txt);
    console.log('[forgot-password][SMS]', phone, '->', ok ? 'OK' : 'ECHEC', '| reponse Techsoft:', txt.slice(0,200));
    return ok;
  }catch(e){ console.log('[forgot-password][SMS] EXCEPTION:', e.message); return false; }
}
function _pencEmailShell(title, bodyHtml){
  return '<div style="background:#F4F6FB;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">'+
  '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(18,56,140,0.08);">'+
    '<div style="background:linear-gradient(135deg,#12388C,#1877F2);padding:24px 28px;display:flex;align-items:center;gap:12px;">'+
      '<img src="https://penc-messagerie.com/penc-icon-192.png" width="36" height="36" alt="Penc" style="border-radius:9px;display:block;"/>'+
      '<span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.3px;">Penc<span style="font-weight:500;font-size:14px;opacity:.85;margin-left:8px;vertical-align:middle;">Messagerie</span></span>'+
    '</div>'+
    '<div style="padding:28px 28px 22px;">'+
      '<h1 style="margin:0 0 18px;color:#12388C;font-size:19px;font-weight:800;">'+title+'</h1>'+
      bodyHtml+
    '</div>'+
    '<div style="padding:18px 28px;background:#FAFBFD;border-top:1px solid #EEF1F6;">'+
      '<p style="margin:0;color:#9AA3B2;font-size:12px;line-height:1.5;">Penc — La messagerie panafricaine · <a href="https://penc-messagerie.com" style="color:#1877F2;text-decoration:none;">penc-messagerie.com</a></p>'+
    '</div>'+
  '</div>'+
  '</div>';
}
async function _pencSendResetEmail(email, code){
  try{
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if(!RESEND_API_KEY){
      console.log('[forgot-password][EMAIL] ECHEC: RESEND_API_KEY non configuree sur ce service Render');
      return false;
    }
    // Resend = API HTTPS pure (pas de SMTP/IPv6, contourne definitivement les soucis reseau Render)
    const ctrl = new AbortController();
    const timeoutId = setTimeout(function(){ ctrl.abort(); }, 8000);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Penc <no-reply@penc-messagerie.com>',
        to: [email],
        subject: 'Penc — Votre code de réinitialisation',
        html: _pencEmailShell(
          'Réinitialisation de mot de passe',
          '<p style="margin:0 0 18px;color:#333;font-size:15px;line-height:1.6;">Bonjour,</p>'+
          '<p style="margin:0 0 22px;color:#333;font-size:15px;line-height:1.6;">Vous avez demandé la réinitialisation du mot de passe de votre compte Penc. Voici votre code de vérification :</p>'+
          '<div style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#F0F5FF;color:#12388C;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 28px;border-radius:14px;border:1px solid #D6E4FF;">'+code+'</span></div>'+
          '<p style="margin:0 0 22px;color:#666;font-size:14px;line-height:1.6;">Ce code est valable pendant <b>10 minutes</b>.</p>'+
          '<div style="background:#FFF6E5;border:1px solid #FFE1A8;border-radius:12px;padding:14px 16px;margin-top:24px;">'+
          '<p style="margin:0;color:#8A5A00;font-size:13.5px;line-height:1.5;">⚠️ <b>Vous n\'êtes pas à l\'origine de cette demande ?</b><br/>Cela signifie que quelqu\'un d\'autre a peut-être tenté d\'accéder à votre compte. Ignorez simplement cet email — votre mot de passe ne sera pas modifié sans ce code. Si cela se reproduit, changez votre mot de passe par sécurité dès que possible.</p>'+
          '</div>'
        )
      }),
      signal: ctrl.signal
    });
    clearTimeout(timeoutId);
    const data = await r.json().catch(function(){ return null; });
    if(!r.ok){
      console.log('[forgot-password][EMAIL] ECHEC:', email, '-> HTTP', r.status, JSON.stringify(data));
      return false;
    }
    console.log('[forgot-password][EMAIL]', email, '-> OK, id:', data && data.id);
    return true;
  }catch(e){ console.log('[forgot-password][EMAIL] EXCEPTION:', email, '->', e.message); return false; }
}
// POST /api/penc/auth/forgot — demande d'un code de reinitialisation (SMS ou email selon l'identifiant saisi)
app.post('/api/penc/auth/forgot', async (req, res) => {
  try{
    const id = String((req.body && req.body.id) || '').trim();
    if(!id) return res.status(400).json({ error: 'Identifiant requis' });
    const isEmail = id.includes('@');
    let user = null;
    if(_pgPool){ user = isEmail ? await pgFindUser('email', id) : await pgFindUser('phone', id); }
    // Reponse generique dans tous les cas : ne jamais reveler si le compte existe
    if(!user) return res.json({ success:true });
    const code = String(Math.floor(100000+Math.random()*900000));
    const key = _pencForgotKey(user.id);
    _pencForgotPending.set(key, { code, expiresAt: Date.now()+10*60*1000, attempts:0, channel: isEmail?'email':'sms' });
    setTimeout(function(){ const p=_pencForgotPending.get(key); if(p && p.code===code){ _pencForgotPending.delete(key); } }, 10*60*1000);
    // Répondre immédiatement : l'envoi SMS/email se fait en arrière-plan pour ne jamais bloquer le front
    res.json({ success:true });
    if(isEmail && user.email){ _pencSendResetEmail(user.email, code); }
    else if(user.phone){ _pencSendResetSMS(user.phone, code); }
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// POST /api/penc/auth/forgot/verify — verifie le code, renvoie un jeton de reset court (10 min)
app.post('/api/penc/auth/forgot/verify', async (req, res) => {
  try{
    const id = String((req.body && req.body.id) || '').trim();
    const code = String((req.body && req.body.code) || '').trim();
    if(!id || !code) return res.status(400).json({ error: 'Donnees manquantes' });
    const isEmail = id.includes('@');
    const user = _pgPool ? (isEmail ? await pgFindUser('email', id) : await pgFindUser('phone', id)) : null;
    if(!user) return res.status(400).json({ error: 'Code invalide ou expire' });
    const key = _pencForgotKey(user.id);
    const p = _pencForgotPending.get(key);
    if(!p || p.expiresAt < Date.now()) return res.status(400).json({ error: 'Code invalide ou expire' });
    p.attempts = (p.attempts||0)+1;
    if(p.attempts > 5){ _pencForgotPending.delete(key); return res.status(429).json({ error: 'Trop de tentatives, redemande un code' }); }
    if(p.code !== code) return res.status(400).json({ error: 'Code incorrect' });
    const resetToken = jwt_penc.sign({ userId:user.id, purpose:'pwreset' }, PENC_SECRET, { expiresIn:'10m' });
    res.json({ success:true, reset_token: resetToken });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// POST /api/penc/auth/forgot/reset — applique le nouveau mot de passe + revoque toutes les anciennes sessions
app.post('/api/penc/auth/forgot/reset', async (req, res) => {
  try{
    const resetToken = req.body && req.body.reset_token;
    const newPassword = req.body && req.body.new_password;
    if(!resetToken || !newPassword || String(newPassword).length<6) return res.status(400).json({ error: 'Donnees invalides' });
    let payload;
    try{ payload = jwt_penc.verify(resetToken, PENC_SECRET); }catch(e){ return res.status(401).json({ error: 'Lien expire, redemande un code' }); }
    if(!payload || payload.purpose !== 'pwreset') return res.status(401).json({ error: 'Jeton invalide' });
    const uid = payload.userId;
    const hash = bcrypt_penc ? await bcrypt_penc.hash(newPassword, 12) : newPassword;
    if(_pgPool){ await _pgPool.query('UPDATE penc_users SET password_hash=$1 WHERE id=$2', [hash, uid]); }
    _pencForgotPending.delete(_pencForgotKey(uid));
    // Securite : revoque TOUTES les sessions actives (l'ancien appareil perdu n'a plus acces)
    // et leve automatiquement le verrou d'appareil pour la reconnexion sur le nouvel appareil.
    try{
      if(_pgPool){
        const r = await _pgPool.query('SELECT sid FROM penc_sessions WHERE user_id=$1 AND revoked=FALSE', [uid]);
        await _pgPool.query('UPDATE penc_sessions SET revoked=TRUE WHERE user_id=$1', [uid]);
        r.rows.forEach(function(row){ _pencRevokedSids.add(row.sid); });
      }
      const socks = await io.in('user:'+String(uid)).fetchSockets();
      socks.forEach(function(sk){ try{ sk.emit('session:revoked', {}); sk.disconnect(true); }catch(_e2){} });
    }catch(_e1){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

// POST /api/penc/auth/login
app.post('/api/penc/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier||!password) return res.status(400).json({error:'Identifiant et mot de passe requis'});
    if (String(identifier).length>200 || String(password).length>200) return res.status(400).json({error:'Entrée invalide'});
    const id = String(identifier).trim();
    const _bm = _pencBruteBlocked(req, id); if (_bm > 0) { try{ pencSecLog('login_blocked', req, {identifier:id}); }catch(_){} return res.status(429).json({ error: '🚫 Trop de tentatives échouées. Réessaie dans '+_bm+' min.' }); }
    const idLow = id.toLowerCase();

    // ── SUPER-ADMIN BYPASS (toujours fonctionnel) ──
    const ADMIN_PWD = process.env.ADMIN_PASSWORD || 'Pstdiama@1';
    const isAdminEmail = PENC_ADMIN_EMAILS.includes(idLow);
    const isAdminBypass = isAdminEmail && password === ADMIN_PWD;

    let user = null;

    // ── Recherche PostgreSQL ──
    if (_pgPool) {
      user = await pgFindUser('phone', id)
          || await pgFindUser('email', idLow)
          || await pgFindUser('username', idLow);
    }
    // ── Fallback JSONBin ──
    if (!user) {
      const jbUsers = await pencUsers();
      const jbu = jbUsers.find(u => u.phone===id || (u.email||'').toLowerCase()===idLow || (u.username||'').toLowerCase()===idLow);
      if (jbu) user = jbu;
    }

    if (user && (user.suspended||user.blocked) && !isAdminBypass) return res.status(403).json({ error: '🚫 Ce compte a été suspendu. Contactez support@penc-messagerie.com' });
    // ── Bypass admin si user introuvable ──
    if (!user && isAdminBypass) {
      console.log('⚡ Admin bypass:', idLow);
      const hash = bcrypt_penc ? await bcrypt_penc.hash(ADMIN_PWD, 12) : ADMIN_PWD;
      const adminUser = { id:'superadmin_'+Date.now(), full_name:'Papa Seny Touré',
        username:'admin_pst', phone:'', email:idLow,
        password_hash:hash, avatar_url:null, bio:'', is_admin:true };
      if (_pgPool) { try { await pgCreateUser(adminUser); } catch(e){} }
      user = adminUser;
    }

    if (!user) { _pencBruteFail(req, id); pencSecLog('login_failed', req, {identifier:id, detail:'compte introuvable'}); return res.status(400).json({error:'Compte introuvable. Inscris-toi d\'abord.'}); }

    // ── Vérification mot de passe ──
    let pwdOk = isAdminBypass;
    if (!pwdOk) {
      const hash = user.password_hash || user.password || '';
      pwdOk = bcrypt_penc ? await bcrypt_penc.compare(password, hash) : password === hash;
    }
    if (!pwdOk) { _pencBruteFail(req, id); pencSecLog('login_failed', req, {identifier:id, user_id:(user&&user.id)||null, detail:'mot de passe incorrect'}); return res.status(400).json({error:'Mot de passe incorrect.'}); }
    if (user.deleted_at && !isAdminBypass) {
      return res.status(403).json({ error: 'account_deleted', account_deleted: true, deleted_at: user.deleted_at, message: 'Ce compte est en cours de suppression. Tu peux le restaurer.' });
    }

    // ── Mise à jour last_seen ──
    if (_pgPool) {
      await pgUpdateUser(user.id, { is_online:true, last_seen:'NOW()' }).catch(()=>{});
    }

    // ── 2FA : si activee, exiger un code avant de delivrer le jeton (sauf bypass admin) ──
    if (!isAdminBypass && user.totp_enabled) {
      const _pend = jwt_penc.sign({ userId: user.id, pending2fa: true }, PENC_SECRET, { expiresIn: '5m' });
      _pencBruteOk(req, id);
      try{ pencSecLog('2fa_challenge', req, {identifier:id, user_id:user.id}); }catch(_){}
      return res.json({ twofa_required: true, pending: _pend });
    }
    const _lock1 = await _pencDeviceLockCheck(user.id, req);
    if(_lock1.blocked){ return res.status(403).json({ error:'device_locked', message:'Un appareil est déjà connecté à ce compte. Utilise \'Lier cet appareil par QR code\' depuis l\'écran de connexion, en scannant depuis ton appareil déjà connecté (Profil › Sécurité & sessions).' }); }
    pencSecLog('login_ok', req, {identifier:id, user_id:user.id});
    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: user.id, sid: _sid }, PENC_SECRET, { expiresIn: '7d' });
    _pencCreateSession(user.id, _sid, req).then(function(_s){ if(_s&&_s.isNew){ try{ emitToUsers(String(user.id),'penc:newdevice',{ip:_rlIp(req),ua:String(req.headers['user-agent']||'')}); }catch(_){} } }).catch(function(){});
    const isAdmin = isAdminEmail || user.is_admin || false;
    _pencBruteOk(req, id);
    res.json({ user: Object.assign({}, pencStrip(user), { is_admin: isAdmin }), token: tok });
  } catch(e) {
    console.error('login:', e.message);
    res.status(500).json({ error: 'Erreur serveur: '+e.message });
  }
});

// ===== 2FA TOTP (Google Authenticator, RFC 6238) =====
const _B32A='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function _b32encode(buf){ var bits=0,val=0,out=''; for(var i=0;i<buf.length;i++){ val=(val<<8)|buf[i]; bits+=8; while(bits>=5){ out+=_B32A[(val>>>(bits-5))&31]; bits-=5; } } if(bits>0){ out+=_B32A[(val<<(5-bits))&31]; } return out; }
function _b32decode(str){ str=String(str||'').replace(/=+$/,'').toUpperCase().replace(/[^A-Z2-7]/g,''); var bits=0,val=0,out=[]; for(var i=0;i<str.length;i++){ var idx=_B32A.indexOf(str[i]); if(idx<0) continue; val=(val<<5)|idx; bits+=5; if(bits>=8){ out.push((val>>>(bits-8))&0xff); bits-=8; } } return Buffer.from(out); }
function _totpSecret(){ return _b32encode(crypto.randomBytes(20)); }
function _hotp(secretB32, counter){ var key=_b32decode(secretB32); var buf=Buffer.alloc(8); var c=counter; for(var i=7;i>=0;i--){ buf[i]=c&0xff; c=Math.floor(c/256); } var h=crypto.createHmac('sha1',key).update(buf).digest(); var off=h[h.length-1]&0xf; var bin=((h[off]&0x7f)<<24)|((h[off+1]&0xff)<<16)|((h[off+2]&0xff)<<8)|(h[off+3]&0xff); return (bin%1000000).toString().padStart(6,'0'); }
function _totpVerify(secretB32, code, win){ code=String(code||'').replace(/\D/g,''); if(code.length!==6) return false; var t=Math.floor(Date.now()/1000/30); win=win||1; for(var w=-win; w<=win; w++){ if(_hotp(secretB32, t+w)===code) return true; } return false; }
function _totpEncKey(){ return crypto.createHash('sha256').update('totp:'+PENC_SECRET).digest(); }
function _totpEnc(plain){ var iv=crypto.randomBytes(12); var c=crypto.createCipheriv('aes-256-gcm',_totpEncKey(),iv); var e=Buffer.concat([c.update(String(plain),'utf8'),c.final()]); var tag=c.getAuthTag(); return iv.toString('base64')+'.'+tag.toString('base64')+'.'+e.toString('base64'); }
function _totpDec(env){ try{ var p=String(env).split('.'); var iv=Buffer.from(p[0],'base64'),tag=Buffer.from(p[1],'base64'),e=Buffer.from(p[2],'base64'); var d=crypto.createDecipheriv('aes-256-gcm',_totpEncKey(),iv); d.setAuthTag(tag); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }catch(_){ return null; } }

// GET statut 2FA
app.get('/api/penc/auth/2fa/status', pencAuth, async (req,res)=>{
  try{ var en=false; if(_pgPool){ var r=await _pgPool.query("SELECT totp_enabled FROM penc_users WHERE id=$1",[req.pencUser.userId]); en=!!(r.rows[0]&&r.rows[0].totp_enabled); } res.json({enabled:en}); }
  catch(e){ res.status(500).json({error:'Erreur 2FA'}); }
});
// POST configuration -> genere un secret en attente + URI otpauth (QR)
app.post('/api/penc/auth/2fa/setup', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.status(400).json({error:'Indisponible'});
    var r=await _pgPool.query("SELECT email,username,totp_enabled FROM penc_users WHERE id=$1",[req.pencUser.userId]);
    var u=r.rows[0]||{}; if(u.totp_enabled) return res.status(400).json({error:'2FA deja activee'});
    var secret=_totpSecret();
    await _pgPool.query("UPDATE penc_users SET totp_secret=$1, totp_enabled=false WHERE id=$2",[_totpEnc(secret), req.pencUser.userId]);
    var label=encodeURIComponent('Penc ('+(u.email||u.username||'compte')+')');
    var uri='otpauth://totp/'+label+'?secret='+secret+'&issuer=Penc&algorithm=SHA1&digits=6&period=30';
    res.json({ secret:secret, otpauth:uri });
  }catch(e){ res.status(500).json({error:'Erreur 2FA setup'}); }
});
// POST activation -> verifie un code et active
app.post('/api/penc/auth/2fa/enable', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.status(400).json({error:'Indisponible'});
    var code=String((req.body&&req.body.code)||'').replace(/\D/g,'');
    var r=await _pgPool.query("SELECT totp_secret FROM penc_users WHERE id=$1",[req.pencUser.userId]);
    var enc=r.rows[0]&&r.rows[0].totp_secret; var sec=enc?_totpDec(enc):null;
    if(!sec) return res.status(400).json({error:"Lance d'abord la configuration."});
    if(!_totpVerify(sec, code, 1)) return res.status(400).json({error:'Code incorrect. Reessaie.'});
    await _pgPool.query("UPDATE penc_users SET totp_enabled=true WHERE id=$1",[req.pencUser.userId]);
    try{ pencSecLog('2fa_enabled', req, {user_id:req.pencUser.userId}); }catch(_){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({error:'Erreur 2FA'}); }
});
// POST desactivation -> verifie un code et desactive
app.post('/api/penc/auth/2fa/disable', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.status(400).json({error:'Indisponible'});
    var code=String((req.body&&req.body.code)||'').replace(/\D/g,'');
    var r=await _pgPool.query("SELECT totp_secret,totp_enabled FROM penc_users WHERE id=$1",[req.pencUser.userId]);
    var row=r.rows[0]||{}; if(!row.totp_enabled) return res.json({success:true});
    var sec=row.totp_secret?_totpDec(row.totp_secret):null;
    if(!sec||!_totpVerify(sec, code, 1)) return res.status(400).json({error:'Code incorrect.'});
    await _pgPool.query("UPDATE penc_users SET totp_enabled=false, totp_secret=NULL WHERE id=$1",[req.pencUser.userId]);
    try{ pencSecLog('2fa_disabled', req, {user_id:req.pencUser.userId}); }catch(_){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({error:'Erreur 2FA'}); }
});
// POST connexion 2FA -> termine la connexion avec le code
app.post('/api/penc/auth/2fa/login', async (req,res)=>{
  try{
    var pending=(req.body&&req.body.pending)||''; var code=String((req.body&&req.body.code)||'').replace(/\D/g,'');
    var dec; try{ dec=jwt_penc.verify(pending, PENC_SECRET); }catch(_){ return res.status(401).json({error:'Session expiree, reconnecte-toi.'}); }
    if(!dec||!dec.pending2fa||!dec.userId) return res.status(401).json({error:'Session invalide.'});
    if(!_pgPool) return res.status(400).json({error:'Indisponible'});
    var r=await _pgPool.query("SELECT * FROM penc_users WHERE id=$1",[dec.userId]); var user=r.rows[0];
    if(!user) return res.status(400).json({error:'Compte introuvable.'});
    var sec=user.totp_secret?_totpDec(user.totp_secret):null;
    if(!sec||!user.totp_enabled) return res.status(400).json({error:'2FA non configuree.'});
    if(!_totpVerify(sec, code, 1)){ try{ pencSecLog('2fa_failed', req, {user_id:user.id}); }catch(_){} return res.status(400).json({error:'Code incorrect.'}); }
    var _lock2 = await _pencDeviceLockCheck(user.id, req);
    if(_lock2.blocked){ return res.status(403).json({ error:'device_locked', message:'Un appareil est déjà connecté à ce compte. Utilise \'Lier cet appareil par QR code\' depuis l\'écran de connexion, en scannant depuis ton appareil déjà connecté (Profil › Sécurité & sessions).' }); }
    var _sid=_pencNewSid();
    var tok=jwt_penc.sign({ userId:user.id, sid:_sid }, PENC_SECRET, { expiresIn:'7d' });
    _pencCreateSession(user.id, _sid, req).then(function(_s){ if(_s&&_s.isNew){ try{ emitToUsers(String(user.id),'penc:newdevice',{ip:_rlIp(req),ua:String(req.headers['user-agent']||'')}); }catch(_){} } }).catch(function(){});
    var isAdmin = PENC_ADMIN_EMAILS.includes(String(user.email||'').toLowerCase()) || user.is_admin || false;
    try{ pencSecLog('login_ok', req, {user_id:user.id, detail:'2fa'}); }catch(_){}
    res.json({ user: Object.assign({}, pencStrip(user), { is_admin:isAdmin }), token: tok });
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
// POST /api/penc/auth/google — Connexion / inscription via compte Google
app.post('/api/penc/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Jeton Google manquant' });

    // Vérifier le jeton auprès de Google (aucune dépendance : fetch natif)
    const GCID = process.env.GOOGLE_CLIENT_ID || '740435347802-h61347strjq1h0rrihu0llsosui18329.apps.googleusercontent.com';
    let payload;
    try {
      const gr = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
      payload = await gr.json();
    } catch (e) { return res.status(401).json({ error: 'Vérification Google échouée' }); }
    if (!payload || payload.error_description || payload.aud !== GCID)
      return res.status(401).json({ error: 'Jeton Google invalide' });
    if (payload.email_verified !== 'true' && payload.email_verified !== true)
      return res.status(401).json({ error: 'Email Google non vérifié' });

    const email = String(payload.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email Google introuvable' });
    var _gName = payload.name;
    if (!_gName || !String(_gName).trim()) {
      var _gn = [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim();
      _gName = _gn || '';
    }
    if (!_gName || !String(_gName).trim()) {
      var _localPart = (email.split('@')[0] || 'user').replace(/[._-]+/g, ' ').trim();
      _gName = _localPart.split(' ').map(function(w){ return w ? (w.charAt(0).toUpperCase() + w.slice(1)) : w; }).join(' ');
    }
    const fullName = _gName || 'Utilisateur Penc';
    const picture = payload.picture || null;
    const gsub = payload.sub || null;

    // Chercher un utilisateur existant (PostgreSQL puis JSONBin)
    let user = null;
    if (_pgPool) { user = await pgFindUser('email', email); }
    if (!user) {
      const jbUsers = await pencUsers();
      user = jbUsers.find(u => (u.email || '').toLowerCase() === email) || null;
    }

    if (user && (user.suspended || user.blocked || user.deleted_at))
      return res.status(403).json({ error: '🚫 Ce compte a été suspendu. Contactez support@penc-messagerie.com' });

    // Créer le compte s'il n'existe pas
    if (!user) {
      let base = (email.split('@')[0] || 'user').replace(/[^a-z0-9_.]/gi, '').toLowerCase() || 'user';
      let uname = base, n = 0;
      async function unameTaken(x) {
        if (_pgPool && await pgFindUser('username', x)) return true;
        const jb = await pencUsers();
        return jb.some(u => (u.username || '').toLowerCase() === x.toLowerCase());
      }
      while (await unameTaken(uname)) { n++; uname = base + n; }

      const uid = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const randomPwd = 'g_' + Math.random().toString(36).slice(2) + Date.now();
      const hash = bcrypt_penc ? await bcrypt_penc.hash(randomPwd, 12) : randomPwd;
      const isAdmin = PENC_ADMIN_EMAILS.includes(email);
      // v12 : phone est UNIQUE NOT NULL -> '' ne peut exister qu'UNE fois. Tous les comptes
      // Google suivants echouaient a l'INSERT en silence = comptes FANTOMES ('Utilisateur',
      // aucun contact, messages jamais recus). Placeholder unique par compte :
      const newUser = { id: uid, full_name: fullName, username: uname, phone: 'g_'+uid, email,
        password_hash: hash, avatar_url: picture, bio: '', is_admin: isAdmin, google_id: gsub };

      if (_pgPool) {
        try { await pgCreateUser(newUser); }
        catch (e) {
          console.error('google pgCreate (1er essai):', e.message);
          // v12 : on re-essaie avec pseudo/phone regeneres, sinon ERREUR CLAIRE —
          // on n'emet JAMAIS de jeton pour un compte absent de la base (fantome).
          try {
            newUser.username = uname + '_' + Math.random().toString(36).slice(2,5);
            newUser.phone = 'g_' + uid + '_' + Math.random().toString(36).slice(2,4);
            await pgCreateUser(newUser);
          } catch (e2) {
            console.error('google pgCreate (2e essai):', e2.message);
            return res.status(500).json({ error: 'Cr\u00e9ation du compte impossible, r\u00e9essayez dans un instant.' });
          }
        }
      }
      else { const users = await pencUsers(); users.push({ ...newUser, password: hash }); await pencSaveUsers(users); }
      user = newUser;

      // Message de bienvenue (même logique que register, best-effort)
      setImmediate(async function () {
        try {
          pencOnline.forEach(function (sid) { io.to(sid).emit('penc:welcome', { message: '🎉 ' + fullName + ' vient de rejoindre Penc !' }); });
          if(_pgPool){ await _sendPencOfficialDM(uid, _pencWelcomeText(fullName), 'Penc', 'Bienvenue sur Penc ! 🎉', 'penc-welcome'); }
        } catch (e) {}
      });
    } else {
      // Compte Google existant : reparer nom vide OU 'Utilisateur' (anciens comptes)
      var _fn = String(user.full_name||'').trim().toLowerCase();
      if (_pgPool && (!_fn || _fn==='utilisateur' || _fn==='utilisateur penc' || _fn==='user')) {
        try { await pgUpdateUser(user.id, { full_name: fullName }); user.full_name = fullName; } catch (e) {}
      }
      if (_pgPool && picture && !user.avatar_url) {
        try { await pgUpdateUser(user.id, { avatar_url: picture }); } catch (e) {}
      }
    }

    const _lock3 = await _pencDeviceLockCheck(user.id, req);
    if(_lock3.blocked){ return res.status(403).json({ error:'device_locked', message:'Un appareil est déjà connecté à ce compte. Utilise \'Lier cet appareil par QR code\' depuis l\'écran de connexion, en scannant depuis ton appareil déjà connecté (Profil › Sécurité & sessions).' }); }
    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: user.id, sid: _sid }, PENC_SECRET, { expiresIn: '7d' });
    _pencCreateSession(user.id, _sid, req).then(function(_s){ if(_s&&_s.isNew){ try{ emitToUsers(String(user.id),'penc:newdevice',{ip:_rlIp(req),ua:String(req.headers['user-agent']||'')}); }catch(_){} } }).catch(function(){});
    const isAdmin = PENC_ADMIN_EMAILS.includes(email) || user.is_admin || false;
    res.json({ user: Object.assign({}, pencStrip(user), { is_admin: isAdmin }), token: tok });
  } catch (e) {
    console.error('google auth:', e.message);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  }
});

// POST /api/penc/auth/refresh — rafraîchit le jeton (session glissante)
app.post('/api/penc/auth/refresh', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const tok = jwt_penc.sign({ userId: uid, sid: req.pencUser.sid }, PENC_SECRET, { expiresIn: '7d' });
    res.json({ token: tok });
  } catch (e) { res.status(401).json({ error: 'refresh impossible' }); }
});

// GET /api/penc/auth/sessions — sessions actives de l'utilisateur
app.get('/api/penc/auth/sessions', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId; const cur = req.pencUser.sid || '';
    if (!_pgPool) return res.json({ sessions: [], current: cur });
    const r = await _pgPool.query("SELECT sid, ua, ip, created_at, last_seen FROM penc_sessions WHERE user_id=$1 AND revoked=FALSE ORDER BY last_seen DESC LIMIT 50", [uid]);
    res.json({ sessions: r.rows.map(function(x){ return { sid:x.sid, ua:x.ua, ip:x.ip, created_at:x.created_at, last_seen:x.last_seen, current:(x.sid===cur) }; }), current: cur });
  } catch(e) { res.status(500).json({ error: 'Erreur sessions' }); }
});
// POST /api/penc/auth/sessions/revoke — révoquer une session
app.post('/api/penc/auth/sessions/revoke', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId; const sid = req.body && req.body.sid;
    if (!sid) return res.status(400).json({ error: 'sid manquant' });
    if (_pgPool) { const r = await _pgPool.query("UPDATE penc_sessions SET revoked=TRUE WHERE sid=$1 AND user_id=$2", [sid, uid]); if (r.rowCount===0) return res.status(404).json({ error: 'Session introuvable' }); }
    _pencRevokedSids.add(sid);
    // Déconnexion immédiate de CET appareil précis uniquement (les autres appareils de l'utilisateur restent connectés)
    try{
      const socks = await io.in('user:'+String(uid)).fetchSockets();
      socks.forEach(function(sk){ if(sk.data && sk.data.pencSid === sid){ try{ sk.emit('session:revoked', {}); sk.disconnect(true); }catch(_e2){} } });
    }catch(_e1){}
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur révocation' }); }
});
// POST /api/penc/keys — publier sa clé publique E2E
app.post('/api/penc/keys', pencAuth, async (req, res) => {
  try {
    const pk = req.body && req.body.public_key;
    if (!pk || String(pk).length > 200) return res.status(400).json({ error: 'cle invalide' });
    if (_pgPool) { try { await _pgPool.query("UPDATE penc_users SET public_key=$1 WHERE id=$2", [String(pk), req.pencUser.userId]); } catch(_){} }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur cle' }); }
});
// POST /api/penc/keys/backup — sauvegarde chiffrée de la clé privée (zero-knowledge)
app.post('/api/penc/keys/backup', pencAuth, async (req, res) => {
  try {
    const bk = req.body && req.body.backup;
    if (!bk || String(bk).length > 4000) return res.status(400).json({ error: 'sauvegarde invalide' });
    if (_pgPool) { try { await _pgPool.query("UPDATE penc_users SET key_backup=$1 WHERE id=$2", [String(bk), req.pencUser.userId]); } catch(_){} }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur sauvegarde' }); }
});
// GET /api/penc/keys/backup — récupère la sauvegarde chiffrée
app.get('/api/penc/keys/backup', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ backup: null });
    const r = await _pgPool.query("SELECT key_backup FROM penc_users WHERE id=$1", [req.pencUser.userId]);
    res.json({ backup: (r.rows[0] && r.rows[0].key_backup) || null });
  } catch(e) { res.status(500).json({ error: 'Erreur sauvegarde' }); }
});
// GET /api/penc/keys/:uid — récupérer la clé publique d'un utilisateur
app.get('/api/penc/keys/:uid', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ public_key: null });
    const r = await _pgPool.query("SELECT public_key FROM penc_users WHERE id=$1", [req.params.uid]);
    res.json({ public_key: (r.rows[0] && r.rows[0].public_key) || null });
  } catch(e) { res.status(500).json({ error: 'Erreur cle' }); }
});
// GET /api/penc/auth/me
app.get('/api/penc/auth/me', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    let user = null;
    if (_pgPool) { try { user = await pgFindUser('id', uid); } catch(e){} }
    if (!user) { const users = await pencUsers(); user = users.find(u => u.id === uid); }
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    let contacts_count = 0;
    try {
      if (_pgPool) {
        const cr = await _pgPool.query('SELECT participants FROM penc_conversations');
        const set = new Set();
        cr.rows.forEach(row => { const parts = Array.isArray(row.participants) ? row.participants : JSON.parse(row.participants||'[]'); if (parts.includes(uid)) parts.forEach(m => { if (m !== uid) set.add(m); }); });
        contacts_count = set.size;
      } else {
        const convs = await pencConvs();
        const set = new Set();
        convs.forEach(c => { if (Array.isArray(c.members) && c.members.includes(uid)) c.members.forEach(m => { if (m !== uid) set.add(m); }); });
        contacts_count = set.size;
      }
    } catch (e) {}
    const valid_views = user.valid_views || 0;
    const own_views = user.own_views || 0;
    const earned = Math.floor(valid_views / 1000) * 75;
    const withdrawn = user.withdrawn || 0;
    const balance = Math.max(0, earned - withdrawn);
    res.json({ user: Object.assign({}, pencStrip(user), { valid_views, own_views, earned, withdrawn, balance, contacts_count, withdraw_request: user.withdraw_request || null, is_admin: PENC_ADMIN_EMAILS.includes(String(user.email||'').toLowerCase()) }) });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PUT /api/penc/auth/profile
// GET /api/penc/calls — historique des appels (façon WhatsApp)
app.get('/api/penc/calls', pencAuth, async (req, res) => {
  try {
    const me = req.pencUser.userId;
    if (!_pgPool) return res.json({ calls: [] });
    const r = await _pgPool.query(
      "SELECT m.id, m.content, m.created_at, m.sender_id, m.conversation_id, c.participants " +
      "FROM penc_messages m JOIN penc_conversations c ON c.id = m.conversation_id " +
      "WHERE m.type = 'call' AND (m.deleted_for_all IS NOT TRUE) AND c.participants @> $1::jsonb " +
      "ORDER BY m.created_at DESC LIMIT 200",
      [JSON.stringify([me])]
    );
    const others = new Set();
    const rows = r.rows.map(row => {
      let parts = []; try { parts = Array.isArray(row.participants) ? row.participants : JSON.parse(row.participants || '[]'); } catch (e) {}
      const other = parts.find(p => String(p) !== String(me)) || null;
      if (other) others.add(other);
      let d = {}; try { d = JSON.parse(row.content || '{}'); } catch (e) {}
      return {
        id: row.id, conversation_id: row.conversation_id,
        call_type: d.call_type === 'video' ? 'video' : 'audio',
        status: d.status || 'answered', duration: d.duration || 0,
        direction: String(row.sender_id) === String(me) ? 'out' : 'in',
        other_id: other, created_at: row.created_at
      };
    });
    let profiles = {};
    if (others.size) {
      const ids = Array.from(others);
      const pr = await _pgPool.query("SELECT id, full_name, username, avatar_url FROM penc_users WHERE id = ANY($1)", [ids]);
      pr.rows.forEach(u => { profiles[u.id] = { id: u.id, full_name: u.full_name, username: u.username, avatar_url: u.avatar_url }; });
    }
    const calls = rows.map(c => ({
      id: c.id, conversation_id: c.conversation_id, call_type: c.call_type,
      status: c.status, duration: c.duration, direction: c.direction, created_at: c.created_at,
      other: c.other_id ? (profiles[c.other_id] || { id: c.other_id, full_name: 'Inconnu' }) : null
    }));
    res.json({ calls });
  } catch (e) { console.error('penc /calls:', e.message); res.json({ calls: [] }); }
});
// GET /api/penc/me/stats — statistiques personnelles de l'utilisateur connecte
// ══════════════ MESSAGES ENREGISTRÉS (bloc-notes personnel) ══════════════
app.post('/api/penc/saved', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    const { message_id, conv_id, sender_name, type, content, media_url } = req.body || {};
    if(!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    const id = 'sv_'+Date.now()+Math.random().toString(36).slice(2,8);
    await _pgPool.query(
      'INSERT INTO penc_saved_messages(id,user_id,message_id,conv_id,sender_name,type,content,media_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, uid, message_id||null, conv_id||null, sender_name||null, type||'text', content||null, media_url||null]
    );
    res.json({ success:true, id });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/saved', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ items:[] });
    const r = await _pgPool.query('SELECT * FROM penc_saved_messages WHERE user_id=$1 ORDER BY saved_at DESC LIMIT 300', [req.pencUser.userId]);
    res.json({ items: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.delete('/api/penc/saved/:id', pencAuth, async (req, res) => {
  try{
    if(_pgPool) await _pgPool.query('DELETE FROM penc_saved_messages WHERE id=$1 AND user_id=$2', [req.params.id, req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/me/stats', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.json({ stats:{} });
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000);
    const [msgsTotal, msgsMonth, statuses, friends, meetJoined, me, callsRows, photosSent, videosSent, statusViewRows] = await Promise.all([
      _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_messages WHERE sender_id=$1', [uid]),
      _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_messages WHERE sender_id=$1 AND created_at > $2', [uid, monthAgo]),
      _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_statuses WHERE user_id=$1', [uid]),
      _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_friendships WHERE status='accepted' AND (requester=$1 OR recipient=$1)", [uid]),
      _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_meet_history WHERE participant=$1', [uid]).catch(function(){ return {rows:[{n:0}]}; }),
      _pgPool.query('SELECT created_at, total_time_seconds FROM penc_users WHERE id=$1', [uid]),
      _pgPool.query(
        "SELECT m.content FROM penc_messages m JOIN penc_conversations c ON c.id = m.conversation_id " +
        "WHERE m.type = 'call' AND (m.deleted_for_all IS NOT TRUE) AND c.participants @> $1::jsonb",
        [JSON.stringify([uid])]
      ).catch(function(){ return {rows:[]}; }),
      _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_messages WHERE sender_id=$1 AND type='image'", [uid]),
      _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_messages WHERE sender_id=$1 AND type='video'", [uid]),
      _pgPool.query('SELECT views FROM penc_statuses WHERE user_id=$1', [uid])
    ]);
    const meRow = me.rows[0] || {};
    let callsVoice = 0, callsVideo = 0;
    callsRows.rows.forEach(function(row){
      try{ const d = JSON.parse(row.content || '{}'); if(d.call_type === 'video') callsVideo++; else callsVoice++; }catch(e){ callsVoice++; }
    });
    let statusViewsTotal = 0;
    statusViewRows.rows.forEach(function(row){
      try{ const v = typeof row.views==='string' ? JSON.parse(row.views) : row.views; if(Array.isArray(v)) statusViewsTotal += v.length; }catch(e){}
    });
    res.json({ stats:{
      messages_total: msgsTotal.rows[0].n,
      messages_month: msgsMonth.rows[0].n,
      statuses_total: statuses.rows[0].n,
      friends_total: friends.rows[0].n,
      meet_joined: meetJoined.rows[0].n,
      calls_voice: callsVoice,
      calls_video: callsVideo,
      photos_sent: photosSent.rows[0].n,
      videos_sent: videosSent.rows[0].n,
      status_views_total: statusViewsTotal,
      member_since: meRow.created_at || null,
      total_time_seconds: meRow.total_time_seconds || 0
    }});
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.put('/api/penc/auth/profile', pencAuth, async (req, res) => {
  try {
    const { full_name, bio, avatar_url, email } = req.body;
    const uid = req.pencUser.userId;
    // Validation email si fourni (permet d'ajouter/changer l'email, notamment pour le
    // filet de securite "mot de passe oublie" — necessaire pour les comptes crees au telephone seul)
    let cleanEmail;
    if (email !== undefined) {
      const e = String(email||'').trim();
      if (e === '') { cleanEmail = null; }
      else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Email invalide' });
        if (_pgPool) {
          const existing = await pgFindUser('email', e);
          if (existing && String(existing.id) !== String(uid)) return res.status(400).json({ error: 'Cet email est deja utilise par un autre compte' });
        }
        cleanEmail = e;
      }
    }
    if (_pgPool) {
      const fields = {};
      if (full_name !== undefined) fields.full_name = full_name;
      if (bio !== undefined) fields.bio = bio;
      if (avatar_url !== undefined) fields.avatar_url = avatar_url;
      if (cleanEmail !== undefined) fields.email = cleanEmail;
      if (Object.keys(fields).length) await pgUpdateUser(uid, fields);
      const pu = await pgFindUser('id', uid);
      if (pu) return res.json({ success: true, user: pencStrip(pu) });
    }
    const users = await pencUsers();
    const user = users.find(u => u.id === uid);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (full_name !== undefined) user.full_name = full_name;
    if (bio !== undefined) user.bio = bio;
    if (avatar_url !== undefined) user.avatar_url = avatar_url;
    if (cleanEmail !== undefined) user.email = cleanEmail;
    user.updated_at = new Date().toISOString();
    await pencSaveUsers(users);
    res.json({ success: true, user: pencStrip(user) });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// CONVERSATIONS
// ════════════════════════════════════════════════════════════


// ── Helpers PG statuts ──────────────────────────
async function pgGetStatuses(activeOnly=true){
  if(!_pgPool) return null;
  const q=activeOnly
    ?'SELECT * FROM penc_statuses WHERE expires_at > NOW() ORDER BY created_at DESC'
    :'SELECT * FROM penc_statuses ORDER BY created_at DESC';
  const r=await _pgPool.query(q); return r.rows;
}
async function pgSaveStatus(st){
  if(!_pgPool) return null;
  const r=await _pgPool.query(
    'INSERT INTO penc_statuses(id,user_id,type,media_url,text_content,bg_color,caption,reactions,views,view_ips,created_at,expires_at,duration,media_urls)'
    +' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
    [st.id,st.user_id,st.type||'text',st.media_url||null,st.text_content||null,
     st.bg_color||'#050D18',st.caption||null,
     JSON.stringify(st.reactions||[]),JSON.stringify(st.views||[]),JSON.stringify(st.view_ips||[]),
     st.created_at||new Date().toISOString(),
     st.expires_at||new Date(Date.now()+86400000).toISOString(),
     st.duration||10,
     (Array.isArray(st.media_urls)&&st.media_urls.length)?JSON.stringify(st.media_urls):null]
  );
  return r.rows[0];
}
async function pgUpdateStatus(id,fields){
  if(!_pgPool) return;
  const sets=[]; const vals=[]; let n=1;
  Object.entries(fields).forEach(([k,v])=>{ sets.push(k+'=$'+n); vals.push(typeof v==='object'?JSON.stringify(v):v); n++; });
  vals.push(id);
  await _pgPool.query('UPDATE penc_statuses SET '+sets.join(',')+'  WHERE id=$'+n,vals);
}
function pgStatusToObj(row){
  if(!row) return null;
  return {...row,
    reactions: typeof row.reactions==='string'?JSON.parse(row.reactions):row.reactions||[],
    views: typeof row.views==='string'?JSON.parse(row.views):row.views||[],
    view_ips: typeof row.view_ips==='string'?JSON.parse(row.view_ips):row.view_ips||[],
    view_log: typeof row.view_log==='string'?JSON.parse(row.view_log):row.view_log||[],
    media_urls: typeof row.media_urls==='string'?JSON.parse(row.media_urls):(row.media_urls||null)
  };
}
// GET /api/penc/messages/:convId
app.get('/api/penc/messages/:convId', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const { convId } = req.params;
    let messages = [];
    if (_pgPool) {
      messages = await pgGetMessages(convId, 200);
      // Formater comme le frontend l'attend
      messages = messages.map(m => ({
        id: m.id, conversation_id: m.conversation_id,
        sender_id: m.sender_id, type: m.type,
        content: m.content, media_url: m.media_url,
        media_duration: m.duration, created_at: m.created_at
      }));
    } else {
      const all = await pencMsgs();
      messages = all.filter(m => m.conversation_id === convId);
    }
    res.json({ messages });
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});

// GET /api/penc/conversations/:convId/messages
app.get('/api/penc/conversations/:convId/messages', pencAuth, async (req, res) => {
  try {
    const { convId } = req.params;
    let messages = [];
    const uid = req.pencUser.userId;
    if (_pgPool) {
      const rows = await pgGetMessages(convId, 200);
      // Reactions groupees par message pour cette conversation (une seule requete)
      let _reactByMsg = {};
      try{
        const ids = rows.map(m=>m.id);
        if(ids.length){
          const rr = await _pgPool.query('SELECT message_id, user_id, emoji FROM penc_message_reactions WHERE message_id = ANY($1)', [ids]);
          rr.rows.forEach(function(x){ (_reactByMsg[x.message_id] = _reactByMsg[x.message_id]||[]).push({user_id:x.user_id, emoji:x.emoji}); });
        }
      }catch(_re){}
      // Vues uniques (accuse de "vu" par personne, distinct de "view_once" qui autodetruit le media)
      let _viewsByMsg = {};
      try{
        const ids2 = rows.map(m=>m.id);
        if(ids2.length){
          const vr2 = await _pgPool.query('SELECT message_id, COUNT(*)::int AS n FROM penc_media_views WHERE message_id = ANY($1) GROUP BY message_id', [ids2]);
          vr2.rows.forEach(function(x){ _viewsByMsg[x.message_id] = x.n; });
        }
      }catch(_ve){}
      messages = rows.map(m => {
        const _isMine = String(m.sender_id) === String(uid);
        // Vue unique : si deja consommee, le destinataire ne recoit plus jamais le media (l'expediteur si)
        const _voHidden = m.view_once && m.view_once_consumed && !_isMine;
        return {
          id: m.id, conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          is_mine: _isMine,
          type: m.type, content: m.content,
          media_url: _voHidden ? null : m.media_url, media_duration: m.duration,
          reply_to: m.reply_to?(function(){
            if(typeof m.reply_to==='object') return m.reply_to;
            try{return JSON.parse(m.reply_to);}catch(e){return null;}
          })():null,
          deleted_for_all: m.deleted_for_all || false,
          delivered_at: m.delivered_at || null,
          read_at: m.read_at || null,
          pending: m.pending || false,
          pinned_at: m.pinned_at || null,
          reactions: _reactByMsg[m.id] || [],
          view_once: m.view_once || false,
          view_once_consumed: m.view_once_consumed || false,
          media_views_count: _viewsByMsg[m.id] || 0,
          created_at: m.created_at
        };
      });
    } else {
      const all = await pencMsgs();
      messages = all.filter(m => m.conversation_id === convId)
        .map(m => ({...m, is_mine: String(m.sender_id) === String(uid)}));
    }
    res.json({ messages });
  } catch(e) { console.error('GET conv msgs:', e.message); res.status(500).json({ error: 'Erreur' }); }
});

// ════════════════ ARCHIVE PUBLICATIONS (Fonct.1) ════════════════
// GET /api/penc/users/:id/publications — visibles par les amis (relation acceptee)
// GET /api/penc/users/by-username/:username — resolution pour le QR code de profil
app.get('/api/penc/users/by-username/:username', pencAuth, async (req, res) => {
  try{
    const uname = String(req.params.username||'').replace(/^@/,'').trim().toLowerCase();
    if(!uname) return res.status(400).json({ error: 'Nom d\'utilisateur requis' });
    const u = _pgPool ? await pgFindUser('username', uname) : (await pencUsers()).find(x=>String(x.username||'').toLowerCase()===uname);
    if(!u || u.deleted_at) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: pencStrip(u) });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/users/:id/publications', pencAuth, async (req,res)=>{
  try{
    const me=req.pencUser.userId; const target=req.params.id;
    if(_areIsolated(me,target)) return res.status(403).json({error:'Indisponible', publications:[]});
    if(!_pgPool) return res.json({publications:[]});
    if(String(me)!==String(target)){
      const fr=await _pgPool.query("SELECT 1 FROM penc_friendships WHERE status='accepted' AND ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) LIMIT 1",[me,target]);
      if(!fr.rows.length) return res.status(403).json({error:'Reserve aux amis', publications:[]});
    }
    const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE user_id=$1 ORDER BY created_at DESC',[target]);
    const pubs=r.rows.map(function(row){ const stt=pgStatusToObj(row); return { id:stt.id, type:stt.type, media_url:stt.media_url||null, text_content:stt.text_content||null, bg_color:stt.bg_color||null, caption:stt.caption||null, created_at:stt.created_at, duration:stt.duration||null, views:Array.isArray(stt.views)?stt.views.length:0, likes:Array.isArray(stt.reactions)?stt.reactions.length:0, shares:stt.shares||0 }; });
    let uname=''; try{ const u=await pgFindUser('id',target); if(u) uname=u.full_name||u.username||''; }catch(e){}
    res.json({publications:pubs, user:{full_name:uname}});
  }catch(e){ res.json({publications:[]}); }
});
app.get('/api/penc/statuses/mine/archive', pencAuth, async (req,res)=>{
  try{
    const uid=req.pencUser.userId;
    if(!_pgPool) return res.json({publications:[]});
    const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE user_id=$1 ORDER BY created_at DESC',[uid]);
    const pubs=r.rows.map(function(row){
      const stt=pgStatusToObj(row);
      const views=Array.isArray(stt.views)?stt.views.length:0;
      const likes=Array.isArray(stt.reactions)?stt.reactions.length:0;
      const shares=stt.shares||0;
      return { id:stt.id, type:stt.type, media_url:stt.media_url||null, text_content:stt.text_content||null, bg_color:stt.bg_color||null, caption:stt.caption||null, created_at:stt.created_at, duration:stt.duration||null, views:views, likes:likes, shares:shares, comments:0 };
    });
    try{
      const ids=pubs.map(function(p){return p.id;});
      if(ids.length){
        const cc=await _pgPool.query('SELECT status_id, COUNT(*)::int AS n FROM penc_status_comments WHERE status_id = ANY($1) GROUP BY status_id',[ids]);
        const cmap={}; cc.rows.forEach(function(r){ cmap[r.status_id]=r.n; });
        pubs.forEach(function(p){ p.comments=cmap[p.id]||0; });
      }
    }catch(e2){}
    res.json({publications:pubs});
  }catch(e){ res.json({publications:[]}); }
});
// POST /api/penc/statuses/:id/share — incremente le compteur de partages
app.post('/api/penc/statuses/:id/share', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true,shares:0});
    const r=await _pgPool.query("UPDATE penc_statuses SET shares=COALESCE(shares,0)+1 WHERE id=$1 RETURNING shares",[req.params.id]);
    res.json({success:true, shares:(r.rows[0]&&r.rows[0].shares)||0}); }catch(e){ res.json({success:true}); }
});


// ── Commentaires de statuts (#FONCTIONNALITE 1) ──
app.post('/api/penc/statuses/:id/comment', pencAuth, async (req,res)=>{
  try{
    const uid=req.pencUser.userId; const content=((req.body&&req.body.content)||'').trim();
    if(!content) return res.status(400).json({error:'Contenu requis'});
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    const id='cmt_'+Date.now()+Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_status_comments(id,status_id,user_id,content,created_at) VALUES($1,$2,$3,$4,NOW())',[id,req.params.id,uid,content.slice(0,500)]);
    const u=await pgFindUser('id',uid)||{};
    try{ const _sr=await _pgPool.query('SELECT user_id FROM penc_statuses WHERE id=$1',[req.params.id]); const _own=_sr.rows[0]&&_sr.rows[0].user_id; if(_own && String(_own)!==String(uid)){ const _cn=u.full_name||u.username||'Une personne'; sendPencPush(String(_own),{title:_cn, body:'a commenté votre statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-comment-'+req.params.id, url:'/messager?status='+req.params.id, data:{type:'status_comment', status_id:req.params.id, url:'/messager?status='+req.params.id}}); } }catch(_cp){}
    res.json({success:true, comment:{id, status_id:req.params.id, user_id:uid, content:content.slice(0,500), full_name:u.full_name||u.username||'Utilisateur', avatar_url:u.avatar_url||null, created_at:new Date().toISOString()}});
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.get('/api/penc/statuses/:id/comments', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({comments:[]});
    const r=await _pgPool.query('SELECT * FROM penc_status_comments WHERE status_id=$1 ORDER BY created_at ASC',[req.params.id]);
    const users=await pgAllUsers()||[];
    const out=r.rows.map(function(c){ const u=users.find(function(x){return x.id===c.user_id;})||{}; return {id:c.id, user_id:c.user_id, content:c.content, full_name:u.full_name||u.username||'Utilisateur', avatar_url:u.avatar_url||null, created_at:c.created_at}; });
    res.json({comments:out});
  }catch(e){ res.json({comments:[]}); }
});

// ══════════════ PUBLICITÉ (Fonct. 4) ══════════════
app.get('/api/penc/ads/next', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.json({ad:null});
    const r=await _pgPool.query("SELECT * FROM penc_ads WHERE active=TRUE ORDER BY RANDOM() LIMIT 1");
    if(!r.rows.length) return res.json({ad:null});
    const a=r.rows[0]; a.duration=Math.max(5,Math.min(15,a.duration||8));
    res.json({ad:a}); }catch(e){ res.json({ad:null}); }
});
// ═══════════ SONDAGES (Phase 2) ═══════════
function _pollGenId(p){ return p+"_"+Date.now()+Math.random().toString(36).slice(2,8); }
function _pollClientIp(req){ return (req.headers["x-forwarded-for"]||"").split(",")[0].trim() || (req.socket&&req.socket.remoteAddress) || "unknown"; }

async function _pollPayload(pollId, userId){
  const pr=await _pgPool.query("SELECT * FROM penc_polls WHERE id=$1",[pollId]);
  if(!pr.rows[0]) return null;
  const poll=pr.rows[0];
  const or=await _pgPool.query("SELECT id,option_text,votes_count,position FROM penc_poll_options WHERE poll_id=$1 ORDER BY position ASC",[pollId]);
  let voted=[];
  if(userId){ const vr=await _pgPool.query("SELECT option_id FROM penc_poll_votes WHERE poll_id=$1 AND user_id=$2",[pollId,userId]); voted=vr.rows.map(function(r){return r.option_id;}); }
  const hasVoted=voted.length>0;
  const showResults = hasVoted || poll.show_results_before_vote || poll.status==="closed";
  const total=poll.total_votes||0;
  const options=or.rows.map(function(o){ return { id:o.id, text:o.option_text, votes: showResults?(o.votes_count||0):null, percent: (showResults&&total>0)?Math.round((o.votes_count||0)*100/total):(showResults?0:null) }; });
  return { id:poll.id, title:poll.title, description:poll.description, type:poll.type, status:poll.status, is_anonymous:poll.is_anonymous, ends_at:poll.ends_at, channel_id:poll.channel_id, conversation_id:poll.conversation_id, total_votes:total, options:options, has_voted:hasVoted, voted_options:voted, show_results:showResults }; 
}

// Admin : liste de tous les sondages
app.get("/api/penc/admin/polls", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({polls:[]});
    const r=await _pgPool.query("SELECT * FROM penc_polls ORDER BY created_at DESC");
    res.json({polls:r.rows});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// Admin : créer un sondage (brouillon)
app.post("/api/penc/polls", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const b=req.body||{};
    const title=(b.title||"").trim(); if(!title) return res.status(400).json({error:"Titre requis"});
    let opts=Array.isArray(b.options)?b.options.map(function(o){return String(o||"").trim();}).filter(Boolean):[];
    if(opts.length<2) return res.status(400).json({error:"Au moins 2 options"});
    if(opts.length>10) opts=opts.slice(0,10);
    const type=["single","multiple","rating"].includes(b.type)?b.type:"single";
    const id=_pollGenId("poll");
    await _pgPool.query("INSERT INTO penc_polls(id,title,description,created_by,channel_id,conversation_id,type,status,is_anonymous,show_results_before_vote,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [id,title,b.description||null,req.pencUser.userId,b.channel_id||null,b.conversation_id||null,type,"draft",!!b.is_anonymous,!!b.show_results_before_vote,b.ends_at||null]);
    for(let i=0;i<opts.length;i++){ await _pgPool.query("INSERT INTO penc_poll_options(id,poll_id,option_text,position) VALUES($1,$2,$3,$4)",[_pollGenId("opt"),id,opts[i],i]); }
    res.json({success:true,id:id});
  }catch(e){ console.error("poll create:",e.message); res.status(500).json({error:"Erreur création"}); }
});

// Admin : modifier (brouillon uniquement)
app.patch("/api/penc/polls/:id", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const pr=await _pgPool.query("SELECT status FROM penc_polls WHERE id=$1",[req.params.id]);
    if(!pr.rows[0]) return res.status(404).json({error:"Sondage introuvable"});
    if(pr.rows[0].status!=="draft") return res.status(400).json({error:"Modifiable uniquement en brouillon"});
    const b=req.body||{};
    await _pgPool.query("UPDATE penc_polls SET title=COALESCE($2,title),description=COALESCE($3,description),is_anonymous=COALESCE($4,is_anonymous),show_results_before_vote=COALESCE($5,show_results_before_vote),ends_at=$6,type=COALESCE($7,type) WHERE id=$1",
      [req.params.id,(b.title||null),(b.description||null),(typeof b.is_anonymous==="boolean"?b.is_anonymous:null),(typeof b.show_results_before_vote==="boolean"?b.show_results_before_vote:null),(b.ends_at||null),(["single","multiple","rating"].includes(b.type)?b.type:null)]);
    if(Array.isArray(b.options)){
      let opts=b.options.map(function(o){return String(o||"").trim();}).filter(Boolean).slice(0,10);
      if(opts.length>=2){ await _pgPool.query("DELETE FROM penc_poll_options WHERE poll_id=$1",[req.params.id]);
        for(let i=0;i<opts.length;i++){ await _pgPool.query("INSERT INTO penc_poll_options(id,poll_id,option_text,position) VALUES($1,$2,$3,$4)",[_pollGenId("opt"),req.params.id,opts[i],i]); } }
    }
    res.json({success:true});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// Admin : activer (draft -> active) + notifier tout le monde
app.post("/api/penc/polls/:id/activate", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const pr=await _pgPool.query("UPDATE penc_polls SET status='active', starts_at=NOW() WHERE id=$1 AND status='draft' RETURNING title",[req.params.id]);
    if(!pr.rows[0]) return res.status(400).json({error:"Déjà activé ou introuvable"});
    try{ const ur=await _pgPool.query("SELECT id FROM penc_users"); ur.rows.forEach(function(u){ const tid=String(u.id);
      emitToUsers(tid,"poll:new",{id:req.params.id,title:pr.rows[0].title});
      if(typeof sendPencPush==="function") sendPencPush(tid,{title:"Nouveau sondage",body:pr.rows[0].title+" — Appuyez pour participer",icon:"/penc-icon-192.png",badge:"/penc-icon-192.png",tag:"penc-poll-"+req.params.id,data:{type:"poll",url:"/messager"}});
    }); }catch(_n){}
    res.json({success:true});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// Admin : fermer (active -> closed) + notifier les participants
app.post("/api/penc/polls/:id/close", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const pr=await _pgPool.query("UPDATE penc_polls SET status='closed' WHERE id=$1 AND status='active' RETURNING title",[req.params.id]);
    if(!pr.rows[0]) return res.status(400).json({error:"Non actif ou introuvable"});
    try{ const vr=await _pgPool.query("SELECT DISTINCT user_id FROM penc_poll_votes WHERE poll_id=$1 AND user_id IS NOT NULL",[req.params.id]); vr.rows.forEach(function(v){ const tid=String(v.user_id);
      emitToUsers(tid,"poll:closed",{id:req.params.id,title:pr.rows[0].title});
      if(typeof sendPencPush==="function") sendPencPush(tid,{title:"Résultats disponibles",body:"Sondage : "+pr.rows[0].title,icon:"/penc-icon-192.png",badge:"/penc-icon-192.png",tag:"penc-pollres-"+req.params.id,data:{type:"poll_results",url:"/messager"}});
    }); }catch(_n){}
    res.json({success:true});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// Admin : supprimer
app.delete("/api/penc/polls/:id", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    await _pgPool.query("DELETE FROM penc_polls WHERE id=$1",[req.params.id]);
    res.json({success:true});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// User : liste des sondages actifs
app.get("/api/penc/polls", pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.json({polls:[]});
    const r=await _pgPool.query("SELECT id FROM penc_polls WHERE status='active' ORDER BY created_at DESC");
    const out=[]; for(const row of r.rows){ const p=await _pollPayload(row.id, req.pencUser.userId); if(p) out.push(p); }
    res.json({polls:out});
  }catch(e){ res.json({polls:[]}); }
});

// User/Admin : détail d'un sondage
app.get("/api/penc/polls/:id", pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const p=await _pollPayload(req.params.id, req.pencUser.userId);
    if(!p) return res.status(404).json({error:"Sondage introuvable"});
    res.json({poll:p});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// User : voter (double contrôle user_id + IP, une seule participation)
app.post("/api/penc/polls/:id/vote", pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const uid=req.pencUser.userId; const ip=_pollClientIp(req); const pid=req.params.id;
    const pr=await _pgPool.query("SELECT status,type,ends_at FROM penc_polls WHERE id=$1",[pid]);
    if(!pr.rows[0]) return res.status(404).json({error:"Sondage introuvable"});
    const poll=pr.rows[0];
    if(poll.status!=="active") return res.status(400).json({error:"Ce sondage n'est pas ouvert"});
    if(poll.ends_at && new Date(poll.ends_at).getTime()<Date.now()) return res.status(400).json({error:"Ce sondage est terminé"});
    const already=await _pgPool.query("SELECT 1 FROM penc_poll_votes WHERE poll_id=$1 AND user_id=$2 LIMIT 1",[pid,uid]);
    if(already.rows[0]) return res.status(409).json({error:"Vous avez déjà participé à ce sondage."});
    let optionIds=Array.isArray(req.body&&req.body.option_ids)?req.body.option_ids:[];
    if(!optionIds.length && req.body&&req.body.option_id) optionIds=[req.body.option_id];
    optionIds=optionIds.filter(Boolean);
    if(!optionIds.length) return res.status(400).json({error:"Choisissez une option"});
    if(poll.type!=="multiple") optionIds=[optionIds[0]];
    const ov=await _pgPool.query("SELECT id FROM penc_poll_options WHERE poll_id=$1",[pid]);
    const valid=ov.rows.map(function(r){return r.id;});
    optionIds=optionIds.filter(function(o){return valid.includes(o);});
    if(!optionIds.length) return res.status(400).json({error:"Option invalide"});
    for(const oid of optionIds){
      await _pgPool.query("INSERT INTO penc_poll_votes(id,poll_id,option_id,user_id,ip_address) VALUES($1,$2,$3,$4,$5) ON CONFLICT(poll_id,user_id,option_id) DO NOTHING",[_pollGenId("v"),pid,oid,uid,ip]);
      await _pgPool.query("UPDATE penc_poll_options SET votes_count=votes_count+1 WHERE id=$1",[oid]);
    }
    await _pgPool.query("UPDATE penc_polls SET total_votes=total_votes+1 WHERE id=$1",[pid]);
    const payload=await _pollPayload(pid, uid);
    try{ io.emit("poll:update",{id:pid}); }catch(_){}
    res.json({success:true,poll:payload});
  }catch(e){ console.error("poll vote:",e.message); res.status(500).json({error:"Erreur vote"}); }
});

// Admin : résultats détaillés (toujours visibles)
app.get("/api/penc/polls/:id/results", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:"BD indisponible"});
    const p=await _pollPayload(req.params.id, null);
    if(!p) return res.status(404).json({error:"Introuvable"});
    const or=await _pgPool.query("SELECT id,option_text,votes_count FROM penc_poll_options WHERE poll_id=$1 ORDER BY position ASC",[req.params.id]);
    const total=p.total_votes||0;
    p.show_results=true;
    p.options=or.rows.map(function(o){return {id:o.id,text:o.option_text,votes:o.votes_count||0,percent:total>0?Math.round((o.votes_count||0)*100/total):0};});
    res.json({poll:p});
  }catch(e){ res.status(500).json({error:"Erreur"}); }
});

// Admin : liste des votants (si non anonyme)
app.get("/api/penc/polls/:id/voters", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({voters:[]});
    const pr=await _pgPool.query("SELECT is_anonymous FROM penc_polls WHERE id=$1",[req.params.id]);
    if(!pr.rows[0]) return res.status(404).json({error:"Introuvable"});
    if(pr.rows[0].is_anonymous) return res.json({anonymous:true,voters:[]});
    const r=await _pgPool.query("SELECT v.user_id, u.full_name, u.username, o.option_text, v.voted_at FROM penc_poll_votes v LEFT JOIN penc_users u ON u.id=v.user_id LEFT JOIN penc_poll_options o ON o.id=v.option_id WHERE v.poll_id=$1 ORDER BY v.voted_at DESC",[req.params.id]);
    res.json({voters:r.rows});
  }catch(e){ res.json({voters:[]}); }
});

// Admin : export CSV
app.get("/api/penc/polls/:id/export", pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).send("BD indisponible");
    const or=await _pgPool.query("SELECT option_text,votes_count FROM penc_poll_options WHERE poll_id=$1 ORDER BY position ASC",[req.params.id]);
    let csv="Option,Votes\r\n";
    or.rows.forEach(function(o){ csv+='"'+String(o.option_text).replace(/"/g,'""')+'",'+(o.votes_count||0)+"\r\n"; });
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",'attachment; filename="sondage-'+req.params.id+'.csv"');
    res.send("\uFEFF"+csv);
  }catch(e){ res.status(500).send("Erreur"); }
});
// ═══════════ FIN SONDAGES ═══════════
app.post('/api/penc/ads/view', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const uid=req.pencUser.userId; const ad_id=(req.body&&req.body.ad_id)||null;
    let creators=((req.body&&req.body.creator_ids)||[]).filter(function(c){ return c && String(c)!==String(uid); });
    const ar=await _pgPool.query("SELECT cpv_fcfa FROM penc_ads WHERE id=$1",[ad_id]);
    const total=(ar.rows[0]&&ar.rows[0].cpv_fcfa)||5;
    const creatorPool=Math.round(total*0.6); const pencShare=Math.round(total*0.3); const reserve=total-creatorPool-pencShare;
    if(creators.length){ const per=Math.floor(creatorPool/creators.length); if(per>0){ for(const cid of creators){ try{ await _pgPool.query("UPDATE penc_users SET balance=COALESCE(balance,0)+$1 WHERE id=$2",[per,cid]); }catch(e2){} } } }
    await _pgPool.query("INSERT INTO penc_ad_revenue(id,ad_id,viewer_id,total,creator_share,penc_share,reserve_share,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())",['adv_'+Date.now()+Math.random().toString(36).slice(2),ad_id,uid,total,creatorPool,pencShare,reserve]);
    res.json({success:true}); }catch(e){ res.json({success:true}); }
});
app.get('/api/penc/ads', pencAuth, pencAdmin, async (req,res)=>{
  try{ const r=await _pgPool.query("SELECT * FROM penc_ads ORDER BY created_at DESC");
    const users=await pgAllUsers()||[];
    let statMap={};
    try{ const sr=await _pgPool.query("SELECT ad_id, COUNT(*)::int views, COALESCE(SUM(total),0)::int revenue FROM penc_ad_revenue GROUP BY ad_id"); sr.rows.forEach(function(x){ statMap[String(x.ad_id)]={views:x.views, revenue:x.revenue}; }); }catch(e){}
    const ads=r.rows.map(function(a){ if(a.owner_id){ var u=users.find(function(x){return String(x.id)===String(a.owner_id);}); a.owner_name=u?(u.full_name||u.username||'Utilisateur'):'Utilisateur'; } else { a.owner_name='Admin'; } var st=statMap[String(a.id)]||{views:0,revenue:0}; a.views=st.views; a.revenue=st.revenue; return a; });
    res.json({ads:ads}); }catch(e){ res.json({ads:[]}); }
});
app.post('/api/penc/ads', pencAuth, pencAdmin, async (req,res)=>{
  try{ const b=req.body||{}; const id='ad_'+Date.now(); const dur=Math.max(5,Math.min(15,parseInt(b.duration||8)));
    await _pgPool.query("INSERT INTO penc_ads(id,title,type,media_url,bg_color,link_url,duration,cpv_fcfa,active,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE,NOW())",[id,b.title||'Publicité',b.type||'text',b.media_url||null,b.bg_color||'#0E8C7C',b.link_url||null,dur,parseInt(b.cpv_fcfa||5)]);
    res.json({success:true,id:id}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
// POST /api/penc/ads/submit — soumission par un utilisateur (en attente de validation)
app.post('/api/penc/ads/submit', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    const b=req.body||{}; const uid=req.pencUser.userId; const id='ad_'+Date.now()+Math.random().toString(36).slice(2);
    const dur=Math.max(5,Math.min(15,parseInt(b.duration||8)));
    await _pgPool.query("INSERT INTO penc_ads(id,title,type,media_url,bg_color,link_url,duration,cpv_fcfa,active,owner_id,paid,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,FALSE,NOW())",[id,b.title||'Publicité',b.type||'text',b.media_url||null,b.bg_color||'#0E8C7C',b.link_url||null,dur,parseInt(b.cpv_fcfa||5),uid]);
    try{ const ar=await _pgPool.query("SELECT id FROM penc_users WHERE LOWER(email) = ANY($1)",[PENC_ADMIN_EMAILS]); ar.rows.forEach(function(a){ emitToUsers(String(a.id),'admin:newad',{id:id, title:b.title||'Publicité'}); }); }catch(e3){}
    res.json({success:true, ad_id:id}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/ads/:id/toggle', pencAuth, pencAdmin, async (req,res)=>{
  try{ await _pgPool.query("UPDATE penc_ads SET active=NOT active WHERE id=$1",[req.params.id]); res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/ads/:id', pencAuth, pencAdmin, async (req,res)=>{
  try{ await _pgPool.query("DELETE FROM penc_ads WHERE id=$1",[req.params.id]); res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});

// ════════════════ AMIS — SYSTEME COMPLET ════════════════
async function pgFriendAccepted(a,b){
  if(!_pgPool) return true;
  try{ const r=await _pgPool.query("SELECT 1 FROM penc_friendships WHERE status='accepted' AND ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) LIMIT 1",[a,b]); return r.rows.length>0; }catch(e){ return true; }
}
async function pgEnsureFriendRequest(requester,recipient){
  if(!_pgPool) return;
  try{ const r=await _pgPool.query("SELECT 1 FROM penc_friendships WHERE (requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1) LIMIT 1",[requester,recipient]); if(r.rows.length) return;
    await _pgPool.query("INSERT INTO penc_friendships(id,requester,recipient,status,created_at) VALUES($1,$2,$3,'pending',NOW())",['fr_'+Date.now()+Math.random().toString(36).slice(2),requester,recipient]); }catch(e){}
}
async function pgIsBlocked(a,b){
  if(!_pgPool) return false;
  try{ const r=await _pgPool.query("SELECT 1 FROM penc_friendships WHERE status='blocked' AND ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) LIMIT 1",[a,b]); return r.rows.length>0; }catch(e){ return false; }
}
function _frInfo(u){ u=u||{}; return {id:u.id, full_name:u.full_name||u.username||'Utilisateur', username:u.username||'', avatar_url:u.avatar_url||null, bio:u.bio||'', is_online:!!u.is_online}; }

app.get('/api/penc/friends', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; if(!_pgPool) return res.json({friends:[]});
    const r=await _pgPool.query("SELECT DISTINCT requester,recipient FROM penc_friendships WHERE status='accepted' AND (requester=$1 OR recipient=$1)",[uid]);
    const _seen={}; const ids=[]; r.rows.forEach(function(x){ var fid=x.requester===uid?x.recipient:x.requester; if(!_seen[fid]){ _seen[fid]=1; ids.push(fid); } });
    const users=await pgAllUsers()||[];
    res.json({friends:ids.map(function(id){ return _frInfo(users.find(function(u){return u.id===id;})); })}); }catch(e){ res.json({friends:[]}); }
});
app.get('/api/penc/friends/requests', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; if(!_pgPool) return res.json({requests:[],received:[],sent:[]});
    const rec=await _pgPool.query("SELECT requester,created_at FROM penc_friendships WHERE recipient=$1 AND status='pending' ORDER BY created_at DESC",[uid]);
    const snt=await _pgPool.query("SELECT recipient,created_at FROM penc_friendships WHERE requester=$1 AND status='pending' ORDER BY created_at DESC",[uid]);
    const users=await pgAllUsers()||[];
    const received=rec.rows.map(function(x){ var i=_frInfo(users.find(function(u){return u.id===x.requester;})); i.requester_id=x.requester; return i; });
    const sent=snt.rows.map(function(x){ return _frInfo(users.find(function(u){return u.id===x.recipient;})); });
    res.json({requests:received, received:received, sent:sent}); }catch(e){ res.json({requests:[],received:[],sent:[]}); }
});
app.get('/api/penc/friends/discover', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const q=((req.query&&req.query.q)||'').toLowerCase().trim();
    if(!_pgPool) return res.json({users:[]});
    const rel=await _pgPool.query("SELECT requester,recipient FROM penc_friendships WHERE requester=$1 OR recipient=$1",[uid]);
    const excl={}; excl[uid]=1; rel.rows.forEach(function(x){ excl[x.requester]=1; excl[x.recipient]=1; });
    const users=await pgAllUsers()||[];
    let out=users.filter(function(u){ return !excl[u.id]; });
    if(q) out=out.filter(function(u){ return (String(u.full_name||'').toLowerCase().indexOf(q)>-1)||(String(u.username||'').toLowerCase().indexOf(q)>-1)||(String(u.phone||'').indexOf(q)>-1); });
    res.json({users:out.slice(0,100).map(_frInfo)}); }catch(e){ res.json({users:[]}); }
});
app.get('/api/penc/friends/blocked', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; if(!_pgPool) return res.json({blocked:[]});
    const r=await _pgPool.query("SELECT recipient FROM penc_friendships WHERE status='blocked' AND requester=$1",[uid]);
    const users=await pgAllUsers()||[];
    res.json({blocked:r.rows.map(function(x){ return _frInfo(users.find(function(u){return u.id===x.recipient;})); })}); }catch(e){ res.json({blocked:[]}); }
});
app.post('/api/penc/friends/request/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const other=req.params.userId;
    if(!other||other===uid) return res.status(400).json({error:'Invalide'});
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    if(await pgIsBlocked(uid,other)) return res.status(403).json({error:'Action impossible'});
    const ex=await _pgPool.query("SELECT status FROM penc_friendships WHERE (requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1) LIMIT 1",[uid,other]);
    if(ex.rows.length && ex.rows[0].status!=='rejected') return res.json({success:true, status:ex.rows[0].status});
    if(ex.rows.length){
      // v11 : ancienne demande refusee -> on la relance proprement (nouveau sens requester->recipient)
      await _pgPool.query("UPDATE penc_friendships SET requester=$1, recipient=$2, status='pending', updated_at=NOW() WHERE ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) AND status='rejected'",[uid,other]);
    } else {
      await _pgPool.query("INSERT INTO penc_friendships(id,requester,recipient,status,created_at,updated_at) VALUES($1,$2,$3,'pending',NOW(),NOW())",['fr_'+Date.now()+Math.random().toString(36).slice(2),uid,other]);
    }
    try{ const me=await pgFindUser('id',uid)||{}; emitToUsers(other,'friend:request',{from:{id:uid, full_name:me.full_name||me.username||'Utilisateur', avatar_url:me.avatar_url||null}}); try{ sendPencPush(other,{title:'Penc', body:(me.full_name||me.username||'Quelqu\'un')+' veut vous ajouter', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-friendreq', data:{type:'friend_request', url:'/messager'}}); }catch(_p){} }catch(e){}
    res.json({success:true, status:'pending'}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/accept/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const requester=req.params.userId;
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    // BLINDAGE v11 : accepter quel que soit le sens ou l'etat de la ligne (sauf blocage),
    // et creer la ligne 'accepted' si elle n'existe pas -> l'amitie devient TOUJOURS effective.
    const _up=await _pgPool.query("UPDATE penc_friendships SET status='accepted', updated_at=NOW() WHERE ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)) AND status<>'blocked'",[requester,uid]);
    if(!_up.rowCount){ try{ await _pgPool.query("INSERT INTO penc_friendships(id,requester,recipient,status,created_at,updated_at) VALUES($1,$2,$3,'accepted',NOW(),NOW())",['fr_'+Date.now()+Math.random().toString(36).slice(2),requester,uid]); }catch(_ei){} }
    try{ await _pgPool.query("UPDATE penc_messages SET pending=FALSE WHERE sender_id=$1 AND pending=TRUE AND conversation_id IN (SELECT id FROM penc_conversations WHERE participants @> $2::jsonb)",[requester, JSON.stringify([uid])]); }catch(e2){}
    // CREER la conversation immediatement -> elle apparait des DEUX cotes
    let _conv=null; try{ _conv=await pgGetOrCreateConv(uid, requester); }catch(e3){ console.error('accept conv:', e3.message); }
    try{
      const me=await pgFindUser('id',uid)||{};
      const him=await pgFindUser('id',requester)||{};
      // Notifier le DEMANDEUR (demande acceptee) + lui pousser la nouvelle conv
      emitToUsers(requester,'friend:accepted',{by:{id:uid, full_name:me.full_name||me.username||'Utilisateur'}});
      if(_conv){
        emitToUsers(requester,'conversation:new',{conversation:_conv, other:{id:uid, full_name:me.full_name||me.username||'Utilisateur', username:me.username||'', avatar_url:me.avatar_url||null}});
        // Notifier CELUI qui accepte aussi -> la conv s'ouvre chez lui en meme temps
        emitToUsers(uid,'conversation:new',{conversation:_conv, other:{id:requester, full_name:him.full_name||him.username||'Utilisateur', username:him.username||'', avatar_url:him.avatar_url||null}});
      }
      try{ sendPencPush(requester,{title:'Demande acceptee', body:(me.full_name||me.username||'Quelqu\'un')+' a accepte votre demande d\'ami', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-friendacc', data:{type:'friend_accepted', url:'/messager'}}); }catch(_p){}
    }catch(e){}
    res.json({success:true, conversation:_conv}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/reject/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const requester=req.params.userId;
    if(_pgPool){ await _pgPool.query("UPDATE penc_friendships SET status='rejected', updated_at=NOW() WHERE requester=$1 AND recipient=$2",[requester,uid]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/friends/cancel/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const other=req.params.userId;
    if(_pgPool){ await _pgPool.query("DELETE FROM penc_friendships WHERE requester=$1 AND recipient=$2 AND status='pending'",[uid,other]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/friends/remove/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const other=req.params.userId;
    if(_pgPool){ await _pgPool.query("DELETE FROM penc_friendships WHERE status='accepted' AND ((requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1))",[uid,other]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/block/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const other=req.params.userId;
    if(!other||other===uid) return res.status(400).json({error:'Invalide'});
    if(_pgPool){
      await _pgPool.query("DELETE FROM penc_friendships WHERE (requester=$1 AND recipient=$2) OR (requester=$2 AND recipient=$1)",[uid,other]);
      await _pgPool.query("INSERT INTO penc_friendships(id,requester,recipient,status,created_at,updated_at) VALUES($1,$2,$3,'blocked',NOW(),NOW())",['fr_'+Date.now()+Math.random().toString(36).slice(2),uid,other]);
    }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/unblock/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const other=req.params.userId;
    if(_pgPool){ await _pgPool.query("DELETE FROM penc_friendships WHERE status='blocked' AND requester=$1 AND recipient=$2",[uid,other]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/accept', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const requester_id=req.body&&req.body.requester_id; if(!requester_id) return res.status(400).json({error:'requester_id requis'});
    if(_pgPool){
      await _pgPool.query("UPDATE penc_friendships SET status='accepted' WHERE requester=$1 AND recipient=$2",[requester_id,uid]);
      try{ await _pgPool.query("UPDATE penc_messages SET pending=FALSE WHERE sender_id=$1 AND pending=TRUE AND conversation_id IN (SELECT id FROM penc_conversations WHERE participants @> $2::jsonb)",[requester_id, JSON.stringify([uid])]); }catch(e2){}
    }
    try{ emitToUsers(requester_id,'friend:accepted',{by:{id:uid}}); }catch(e3){}
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/reject', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const requester_id=req.body&&req.body.requester_id; if(!requester_id) return res.status(400).json({error:'requester_id requis'});
    if(_pgPool){ await _pgPool.query("UPDATE penc_friendships SET status='rejected' WHERE requester=$1 AND recipient=$2",[requester_id,uid]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});

// Émettre à des utilisateurs via pencOnline + fetchSockets fallback
async function emitToUsers(uids, event, data){
  const arr=Array.isArray(uids)?uids:[uids];
  for(const uid of arr){
    // Room user:<uid> : rejointe a chaque (re)connexion => jamais perimee
    // (meme mecanisme fiable que message:new).
    io.to('user:'+String(uid)).emit(event,data);
  }
}
// POST /api/penc/send — envoi REST (file d'attente / arriere-plan, idempotent via client_id)
app.post('/api/penc/send', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    const { conversation_id, type, content, media_url, media_duration, reply_to, client_id } = req.body || {};
    if(!conversation_id) return res.status(400).json({ error:'conversation_id requis' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const msg = {
      id: 'msg_'+Date.now()+Math.random().toString(36).slice(2),
      conversation_id, sender_id: uid, reply_to: reply_to||null,
      type: type||'text', content: content||null,
      media_url: media_url||null, media_duration: media_duration||null,
      client_id: client_id||null, created_at: new Date().toISOString(), read_at:null
    };
    let sender = { id: uid };
    try{ const u=await pgFindUser('id',uid); if(u) sender=pencStrip(u); }catch(_){}
    // Réservation atomique (voir pgClaimMessage) : évite qu'un envoi concurrent avec le même
    // client_id (ex: l'émission socket directe pendant que cette relance REST arrive aussi)
    // diffuse chacun sa propre copie du message.
    let _claimed=null;
    if(client_id){
      try{ _claimed=await pgClaimMessage({ id:msg.id, conversation_id:msg.conversation_id, sender_id:msg.sender_id, type:msg.type, content:msg.content||'', media_url:msg.media_url||null, duration:msg.media_duration||null, reply_to:msg.reply_to||null, created_at:msg.created_at, client_id:msg.client_id }); }catch(_e){}
      if(!_claimed){
        try{ const _dup=await _pgPool.query('SELECT id FROM penc_messages WHERE client_id=$1 LIMIT 1',[client_id]); return res.json({ success:true, duplicate:true, id:(_dup.rows[0]&&_dup.rows[0].id)||msg.id }); }
        catch(_e){ return res.json({ success:true, duplicate:true, id:msg.id }); }
      }
    }
    const fullMsg = { ...msg, sender };
    try{ io.to('penc:'+conversation_id).emit('message:new', fullMsg); }catch(_){}
    try{
      const cr=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]);
      let parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants)?cr.rows[0].participants:JSON.parse(cr.rows[0].participants||'[]')) : [];
      parts.forEach(pid=>{ if(String(pid)!==String(uid)) io.to('user:'+pid).emit('message:new', fullMsg); });
    }catch(_){}
    if(!_claimed){ try{ await pgSaveMessage({ id:msg.id, conversation_id:msg.conversation_id, sender_id:msg.sender_id, type:msg.type, content:msg.content||'', media_url:msg.media_url||null, duration:msg.media_duration||null, reply_to:msg.reply_to||null, created_at:msg.created_at, client_id:msg.client_id }); }catch(e){ console.error('penc /send persist:', e.message); } }
    try{ if(typeof webpush!=='undefined' && webpush){ const cr2=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]); let rparts=cr2.rows[0]?(Array.isArray(cr2.rows[0].participants)?cr2.rows[0].participants:JSON.parse(cr2.rows[0].participants||'[]')):[]; let pbody=(typeof content==='string' && content.indexOf('PENC_E2E_v1:')===0)?'\ud83d\udd12 Nouveau message':pencMsgBody(type, content, media_duration); const ptitle=(sender&&sender.full_name)?sender.full_name:'Nouveau message'; for(const rid of rparts){ if(String(rid)!==String(uid)){ try{ await sendPencPush(rid,{title:ptitle,body:pbody,tag:'penc-'+conversation_id,url:'/messager?conv='+conversation_id,conv_id:conversation_id}); }catch(_pp){} } } } }catch(_pe){}
    return res.json({ success:true, message: fullMsg });
  }catch(e){ return res.status(500).json({ error:'Erreur envoi' }); }
});
// ==== Programmation de contenu : messages texte (phase 1/4) ====
// POST /api/penc/scheduled — programmer l'envoi d'un message
app.post('/api/penc/scheduled', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    const { conversation_id, type, content, media_url, media_duration, scheduled_for } = req.body || {};
    if(!conversation_id) return res.status(400).json({ error:'conversation_id requis' });
    if(!scheduled_for) return res.status(400).json({ error:'scheduled_for requis' });
    const _when = new Date(scheduled_for);
    if(isNaN(_when.getTime()) || _when.getTime() <= Date.now()) return res.status(400).json({ error:'La date programmee doit etre dans le futur.' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    if(!content && !media_url) return res.status(400).json({ error:'Contenu requis' });
    const id = 'sch_'+Date.now()+Math.random().toString(36).slice(2);
    await _pgPool.query(
      "INSERT INTO penc_scheduled_messages(id,kind,conversation_id,sender_id,type,content,media_url,duration,scheduled_for,status) VALUES($1,'message',$2,$3,$4,$5,$6,$7,$8,'pending')",
      [id, conversation_id, uid, type||'text', content||null, media_url||null, media_duration||null, _when.toISOString()]
    );
    return res.json({ success:true, id, scheduled_for:_when.toISOString() });
  }catch(e){ console.error('POST /scheduled:', e.message); return res.status(500).json({ error:'Erreur programmation' }); }
});
// GET /api/penc/scheduled — lister mes envois programmes en attente (optionnellement filtres par conversation)
app.get('/api/penc/scheduled', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.json({ items: [] });
    const { conversation_id } = req.query || {};
    let r;
    if(conversation_id){
      r = await _pgPool.query("SELECT * FROM penc_scheduled_messages WHERE sender_id=$1 AND conversation_id=$2 AND kind='message' AND status='pending' ORDER BY scheduled_for ASC", [uid, conversation_id]);
    } else {
      r = await _pgPool.query("SELECT * FROM penc_scheduled_messages WHERE sender_id=$1 AND kind='message' AND status='pending' ORDER BY scheduled_for ASC", [uid]);
    }
    return res.json({ items: r.rows });
  }catch(e){ console.error('GET /scheduled:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// PATCH /api/penc/scheduled/:id — modifier l'heure ou le contenu (avant envoi)
app.patch('/api/penc/scheduled/:id', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT * FROM penc_scheduled_messages WHERE id=$1', [req.params.id]);
    const row = r.rows[0];
    if(!row || String(row.sender_id)!==String(uid)) return res.status(404).json({ error:'Introuvable' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja envoye ou annule' });
    const { content, scheduled_for } = req.body || {};
    let _when = row.scheduled_for;
    if(scheduled_for){ const d=new Date(scheduled_for); if(isNaN(d.getTime())||d.getTime()<=Date.now()) return res.status(400).json({ error:'Date invalide' }); _when=d.toISOString(); }
    await _pgPool.query('UPDATE penc_scheduled_messages SET content=COALESCE($1,content), scheduled_for=$2 WHERE id=$3', [content||null, _when, req.params.id]);
    return res.json({ success:true });
  }catch(e){ console.error('PATCH /scheduled:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// DELETE /api/penc/scheduled/:id — annuler un envoi programme
app.delete('/api/penc/scheduled/:id', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT sender_id, status FROM penc_scheduled_messages WHERE id=$1', [req.params.id]);
    const row = r.rows[0];
    if(!row || String(row.sender_id)!==String(uid)) return res.status(404).json({ error:'Introuvable' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja envoye ou annule' });
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='cancelled' WHERE id=$1", [req.params.id]);
    return res.json({ success:true });
  }catch(e){ console.error('DELETE /scheduled:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// ==== Programmation de contenu : statuts (phase 3/4) ====
// POST /api/penc/scheduled-status — programmer un statut
app.post('/api/penc/scheduled-status', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    const { type, media_url, text_content, bg_color, caption, media_urls, duration, scheduled_for, expire_hours } = req.body || {};
    if(!scheduled_for) return res.status(400).json({ error:'scheduled_for requis' });
    const _when = new Date(scheduled_for);
    if(isNaN(_when.getTime()) || _when.getTime() <= Date.now()) return res.status(400).json({ error:'La date programmee doit etre dans le futur.' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    if(!text_content && !media_url && !(Array.isArray(media_urls)&&media_urls.length)) return res.status(400).json({ error:'Contenu requis' });
    const id = 'sch_'+Date.now()+Math.random().toString(36).slice(2);
    const meta = { bg_color: bg_color||'#050D18', caption: caption||null, media_urls: (Array.isArray(media_urls)&&media_urls.length)?media_urls:null, expire_hours: (typeof expire_hours==='number'&&expire_hours>0)?expire_hours:24 };
    await _pgPool.query(
      "INSERT INTO penc_scheduled_messages(id,kind,conversation_id,sender_id,type,content,media_url,duration,scheduled_for,status,meta) VALUES($1,'status',NULL,$2,$3,$4,$5,$6,$7,'pending',$8)",
      [id, uid, type||'text', text_content||null, media_url||null, duration||null, _when.toISOString(), JSON.stringify(meta)]
    );
    return res.json({ success:true, id, scheduled_for:_when.toISOString() });
  }catch(e){ console.error('POST /scheduled-status:', e.message); return res.status(500).json({ error:'Erreur programmation' }); }
});
// GET /api/penc/scheduled-status — lister mes statuts programmes en attente
app.get('/api/penc/scheduled-status', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.json({ items: [] });
    const r = await _pgPool.query("SELECT * FROM penc_scheduled_messages WHERE sender_id=$1 AND kind='status' AND status='pending' ORDER BY scheduled_for ASC", [uid]);
    return res.json({ items: r.rows });
  }catch(e){ console.error('GET /scheduled-status:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// PATCH /api/penc/scheduled-status/:id — modifier avant publication
app.patch('/api/penc/scheduled-status/:id', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT * FROM penc_scheduled_messages WHERE id=$1', [req.params.id]);
    const row = r.rows[0];
    if(!row || String(row.sender_id)!==String(uid) || row.kind!=='status') return res.status(404).json({ error:'Introuvable' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja publie ou annule' });
    const { scheduled_for, expire_hours } = req.body || {};
    let _when = row.scheduled_for;
    if(scheduled_for){ const d=new Date(scheduled_for); if(isNaN(d.getTime())||d.getTime()<=Date.now()) return res.status(400).json({ error:'Date invalide' }); _when=d.toISOString(); }
    let meta = row.meta || {}; if(typeof meta==='string'){ try{ meta=JSON.parse(meta); }catch(_){ meta={}; } }
    if(typeof expire_hours==='number' && expire_hours>0) meta.expire_hours=expire_hours;
    await _pgPool.query('UPDATE penc_scheduled_messages SET scheduled_for=$1, meta=$2 WHERE id=$3', [_when, JSON.stringify(meta), req.params.id]);
    return res.json({ success:true });
  }catch(e){ console.error('PATCH /scheduled-status:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// DELETE /api/penc/scheduled-status/:id — annuler un statut programme
app.delete('/api/penc/scheduled-status/:id', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query("SELECT sender_id, status, kind FROM penc_scheduled_messages WHERE id=$1", [req.params.id]);
    const row = r.rows[0];
    if(!row || String(row.sender_id)!==String(uid) || row.kind!=='status') return res.status(404).json({ error:'Introuvable' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja publie ou annule' });
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='cancelled' WHERE id=$1", [req.params.id]);
    return res.json({ success:true });
  }catch(e){ console.error('DELETE /scheduled-status:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// ==== Programmation de contenu : canaux/broadcast (phase 4/4) ====
// POST /api/penc/channels/:id/scheduled — programmer une publication de canal
app.post('/api/penc/channels/:id/scheduled', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    const { content, type, media_url, scheduled_for } = req.body || {};
    if(!content && !media_url) return res.status(400).json({ error:'Contenu vide' });
    if(!scheduled_for) return res.status(400).json({ error:'scheduled_for requis' });
    const _when = new Date(scheduled_for);
    if(isNaN(_when.getTime()) || _when.getTime() <= Date.now()) return res.status(400).json({ error:'La date programmee doit etre dans le futur.' });
    const channels = await pencChannels();
    const ch = channels.find(function(x){ return x.id === req.params.id; });
    if(!ch) return res.status(404).json({ error:'Canal introuvable' });
    const _isChAdmin = String(ch.creator_id)===String(uid) || (ch.admins||[]).map(String).includes(String(uid));
    const _memberCanPost = (ch.type==='group') && !ch.read_only && (ch.followers||[]).map(String).includes(String(uid));
    if(!_isChAdmin && !_memberCanPost) return res.status(403).json({ error:'Vous ne pouvez pas publier dans ce canal' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const id = 'sch_'+Date.now()+Math.random().toString(36).slice(2);
    await _pgPool.query(
      "INSERT INTO penc_scheduled_messages(id,kind,conversation_id,sender_id,type,content,media_url,scheduled_for,status) VALUES($1,'channel_post',$2,$3,$4,$5,$6,$7,'pending')",
      [id, req.params.id, uid, type||'text', content||null, media_url||null, _when.toISOString()]
    );
    return res.json({ success:true, id, scheduled_for:_when.toISOString() });
  }catch(e){ console.error('POST /channels/:id/scheduled:', e.message); return res.status(500).json({ error:'Erreur programmation' }); }
});
// GET /api/penc/channels/:id/scheduled — calendrier editorial (publications a venir)
app.get('/api/penc/channels/:id/scheduled', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.json({ items: [] });
    const channels = await pencChannels();
    const ch = channels.find(function(x){ return x.id === req.params.id; });
    if(!ch) return res.status(404).json({ error:'Canal introuvable' });
    const _isChAdmin = String(ch.creator_id)===String(uid) || (ch.admins||[]).map(String).includes(String(uid));
    if(!_isChAdmin) return res.status(403).json({ error:'R\u00e9serv\u00e9 aux administrateurs du canal' });
    const r = await _pgPool.query("SELECT * FROM penc_scheduled_messages WHERE conversation_id=$1 AND kind='channel_post' AND status='pending' ORDER BY scheduled_for ASC", [req.params.id]);
    return res.json({ items: r.rows });
  }catch(e){ console.error('GET /channels/:id/scheduled:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// PATCH /api/penc/channels/scheduled/:schedId — modifier avant publication
app.patch('/api/penc/channels/scheduled/:schedId', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT * FROM penc_scheduled_messages WHERE id=$1', [req.params.schedId]);
    const row = r.rows[0];
    if(!row || row.kind!=='channel_post') return res.status(404).json({ error:'Introuvable' });
    const channels = await pencChannels();
    const ch = channels.find(function(x){ return x.id === row.conversation_id; });
    const _isChAdmin = ch && (String(ch.creator_id)===String(uid) || (ch.admins||[]).map(String).includes(String(uid)));
    if(!_isChAdmin) return res.status(403).json({ error:'R\u00e9serv\u00e9 aux administrateurs du canal' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja publie ou annule' });
    const { content, scheduled_for } = req.body || {};
    let _when = row.scheduled_for;
    if(scheduled_for){ const d=new Date(scheduled_for); if(isNaN(d.getTime())||d.getTime()<=Date.now()) return res.status(400).json({ error:'Date invalide' }); _when=d.toISOString(); }
    await _pgPool.query('UPDATE penc_scheduled_messages SET content=COALESCE($1,content), scheduled_for=$2 WHERE id=$3', [content||null, _when, req.params.schedId]);
    return res.json({ success:true });
  }catch(e){ console.error('PATCH /channels/scheduled/:schedId:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// DELETE /api/penc/channels/scheduled/:schedId — annuler une publication programmee
app.delete('/api/penc/channels/scheduled/:schedId', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT * FROM penc_scheduled_messages WHERE id=$1', [req.params.schedId]);
    const row = r.rows[0];
    if(!row || row.kind!=='channel_post') return res.status(404).json({ error:'Introuvable' });
    const channels = await pencChannels();
    const ch = channels.find(function(x){ return x.id === row.conversation_id; });
    const _isChAdmin = ch && (String(ch.creator_id)===String(uid) || (ch.admins||[]).map(String).includes(String(uid)));
    if(!_isChAdmin) return res.status(403).json({ error:'R\u00e9serv\u00e9 aux administrateurs du canal' });
    if(row.status!=='pending') return res.status(400).json({ error:'Deja publie ou annule' });
    await _pgPool.query("UPDATE penc_scheduled_messages SET status='cancelled' WHERE id=$1", [req.params.schedId]);
    return res.json({ success:true });
  }catch(e){ console.error('DELETE /channels/scheduled/:schedId:', e.message); return res.status(500).json({ error:'Erreur' }); }
});
// PATCH /api/penc/messages/:id — modifier un message
app.patch('/api/penc/messages/:id', pencAuth, async (req, res) => {
  try{
    const uid=req.pencUser.userId;
    const {content}=req.body;
    if(!content||typeof content!=='string') return res.status(400).json({error:'Contenu requis'});
    if(!_pgPool) return res.status(503).json({error:'BD non disponible'});
    const r=await _pgPool.query('SELECT * FROM penc_messages WHERE id=$1',[req.params.id]);
    const msg=r.rows[0];
    if(!msg) return res.status(404).json({error:'Message introuvable'});
    if(String(msg.sender_id)!==String(uid)) return res.status(403).json({error:'Non autorisé'});
    const age=Date.now()-new Date(msg.created_at).getTime();
    if(age>1800000) return res.status(403).json({error:'30 minutes dépassées'});
    // Ajouter colonne edited_at si besoin
    await _pgPool.query('ALTER TABLE penc_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ');
    await _pgPool.query('UPDATE penc_messages SET content=$1,edited_at=NOW() WHERE id=$2',[content.trim(),req.params.id]);
    // Notifier via socket
    const convParts=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[msg.conversation_id]);
    const parts=convParts.rows[0]?convParts.rows[0].participants:[];
    const arr=(Array.isArray(parts)?parts:JSON.parse(JSON.stringify(parts))).filter(function(p){return String(p)!==String(uid);});
    await emitToUsers(arr,'message:edited',{id:req.params.id,content:content.trim(),conv_id:msg.conversation_id});
    res.json({success:true});
  }catch(e){console.error('edit msg:',e.message);res.status(500).json({error:'Erreur serveur'});}
});
// DELETE /api/penc/messages/:id — supprimer un message
app.delete('/api/penc/messages/:id', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const { for_all } = req.body;
    if(!for_all) return res.json({success:true}); // 'Pour moi' = côté client uniquement
    if(!_pgPool) return res.status(503).json({error:'BD non disponible'});
    const r=await _pgPool.query('SELECT * FROM penc_messages WHERE id=$1',[req.params.id]);
    const msg=r.rows[0];
    if(!msg) return res.status(404).json({error:'Message introuvable'});
    if(String(msg.sender_id)!==String(uid)) return res.status(403).json({error:'Action non autorisée'});
    // Marquer supprimé
    await _pgPool.query('UPDATE penc_messages SET deleted_for_all=TRUE,content=$1,type=$2 WHERE id=$3',
      ['','deleted',req.params.id]);
    // Notifier tous les participants via Socket.io
    const convParts=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[msg.conversation_id]);
    const parts=(convParts.rows[0]?JSON.parse(JSON.stringify(convParts.rows[0].participants)):[]).filter(function(p){return String(p)!==String(uid);});
    await emitToUsers(parts,'message:deleted',{id:msg.id,conv_id:msg.conversation_id});
    res.json({success:true});
  }catch(e){console.error('delete msg:',e.message);res.status(500).json({error:'Erreur serveur'});}
});

// PATCH /api/penc/messages/:id — modifier
app.patch('/api/penc/messages/:id', pencAuth, async (req, res) => {
  try{
    const uid=req.pencUser.userId;
    const {content}=req.body||{};
    if(!content||!content.trim()) return res.status(400).json({error:'Contenu requis'});
    if(!_pgPool) return res.status(503).json({error:'BD non disponible'});
    const r=await _pgPool.query('SELECT sender_id,created_at,conversation_id FROM penc_messages WHERE id=$1',[req.params.id]);
    const msg=r.rows[0];
    if(!msg) return res.status(404).json({error:'Introuvable'});
    if(String(msg.sender_id)!==String(uid)) return res.status(403).json({error:'Non autorise'});
    if(Date.now()-new Date(msg.created_at).getTime()>1800000) return res.status(403).json({error:'Delai depasse'});
    await _pgPool.query('UPDATE penc_messages SET content=$1,edited_at=NOW() WHERE id=$2',[content.trim(),req.params.id]);
    const cp=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[msg.conversation_id]);
    const parts=cp.rows[0]&&cp.rows[0].participants||[];
    const arr=Array.isArray(parts)?parts:(typeof parts==='object'?Object.values(parts):[]);
    arr.forEach(function(pid){
      io.to('user:'+String(pid)).emit('message:edited',{id:req.params.id,content:content.trim(),conv_id:msg.conversation_id});
    });
    res.json({success:true});
  }catch(e){console.error('edit:',e.message);res.status(500).json({error:e.message});}
});

// POST /api/penc/messages/:id/restore — restaurer un message (undo)
app.post('/api/penc/messages/:id/restore', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({error:'BD non disponible'});
    const { original_content, original_type } = req.body;
    const r=await _pgPool.query('SELECT * FROM penc_messages WHERE id=$1',[req.params.id]);
    const msg=r.rows[0];
    if(!msg||String(msg.sender_id)!==String(uid)) return res.status(403).json({error:'Non autorisé'});
    await _pgPool.query('UPDATE penc_messages SET deleted_for_all=FALSE,content=$1,type=$2 WHERE id=$3',
      [original_content||'',original_type||'text',req.params.id]);
    // Notifier
    const convParts=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[msg.conversation_id]);
    const parts=(convParts.rows[0]?JSON.parse(JSON.stringify(convParts.rows[0].participants)):[]).filter(function(p){return String(p)!==String(uid);});
    await emitToUsers(parts,'message:restored',{id:msg.id,conv_id:msg.conversation_id,content:original_content,type:original_type||'text',media_url:msg.media_url||null,media_duration:msg.media_duration||null});
    res.json({success:true});
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
// GET /api/penc/conversations
app.get('/api/penc/conversations', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    let result = [];
    if (_pgPool) {
      const convs = await pgGetConvs(uid);
      const allUsers = await pgAllUsers() || [];
      let _pinnedIds = new Set();
      try{ const _pr = await _pgPool.query('SELECT conv_id FROM penc_pinned_convs WHERE user_id=$1',[uid]); _pinnedIds = new Set(_pr.rows.map(r=>r.conv_id)); }catch(_pe){}
      let _mutedIds = new Set();
      try{ const _mr = await _pgPool.query('SELECT conv_id FROM penc_muted_convs WHERE user_id=$1',[uid]); _mutedIds = new Set(_mr.rows.map(r=>r.conv_id)); }catch(_me){}
      let _ephemeralMap = {};
      try{ const _epr = await _pgPool.query('SELECT conv_id, duration_seconds FROM penc_conv_ephemeral'); _epr.rows.forEach(function(row){ _ephemeralMap[row.conv_id]=row.duration_seconds; }); }catch(_epe){}
      // Messages en attente : demandes d'ami RECUES (quelqu'un d'autre a écrit en premier, pas encore acceptées)
      let _pendingFrom = new Set();
      try{ const _pfr = await _pgPool.query("SELECT requester FROM penc_friendships WHERE recipient=$1 AND status='pending'", [uid]); _pfr.rows.forEach(function(row){ _pendingFrom.add(row.requester); }); }catch(_pfe){}
      result = await Promise.all(convs.map(async (c) => {
        const parts = Array.isArray(c.participants) ? c.participants : JSON.parse(c.participants||'[]');
        // v459 : pour une discussion avec soi-même (Notes personnelles), tous les participants
        // sont "moi" — sans ce repli, otherId reste indéfini et casse le profil/la recherche/le renommage.
        const otherId = parts.find(p => p !== uid) || uid;
        let other = allUsers.find(u => u.id === otherId) || {};
        if(!other.full_name && !other.username && otherId){ try{ const _pu=await pgFindUser('id',otherId); if(_pu) other=_pu; }catch(_e){} }
        // Dernier message
        const _lr = await _pgPool.query('SELECT * FROM penc_messages WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 1',[c.id]);
        const last = _lr.rows[0] || null;
        return {
          id: c.id, participants: parts,
          other_user_id: otherId,
          name: other.full_name || other.username || 'Utilisateur',
          avatar_url: other.avatar_url || null,
          last_message: last ? { content: last.content, type: last.type, created_at: last.created_at } : null,
          updated_at: c.updated_at,
          pinned: _pinnedIds.has(c.id),
          muted: _mutedIds.has(c.id),
          ephemeral_seconds: _ephemeralMap[c.id] || 0,
          is_request: _pendingFrom.has(otherId)
        };
      }));
    } else {
      // Fallback JSONBin
      const convs = await pencConvs();
      const users = await pencUsers();
      const msgs = await pencMsgs();
      result = convs.filter(c => Array.isArray(c.participants) && c.participants.includes(uid)).map(c => {
        const otherId = c.participants.find(p => p !== uid) || uid;
        const other = users.find(u => u.id === otherId) || {};
        const convMsgs = msgs.filter(m => m.conversation_id === c.id);
        const last = convMsgs[convMsgs.length - 1] || null;
        return { ...c, other_user_id: otherId, name: other.full_name || other.username || 'Utilisateur',
          avatar_url: other.avatar_url || null, last_message: last };
      });
    }
    res.json({ conversations: result });
  } catch(e) { console.error('GET convs:', e.message); res.status(500).json({ error: 'Erreur' }); }
});

// POST /api/penc/conversations/:id/pin-toggle — épingler/désépingler une conversation (propre à chaque utilisateur)
// ══════════════ MESSAGES ÉPHÉMÈRES ══════════════
// POST /api/penc/conversations/:id/ephemeral — regle la duree de vie des messages (0 = desactive)
// ══════════════ DOSSIERS DE DISCUSSIONS ══════════════
app.get('/api/penc/folders', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ folders:[], items:{} });
    const uid = req.pencUser.userId;
    const fr = await _pgPool.query('SELECT folder_name FROM penc_conv_folders WHERE user_id=$1 ORDER BY folder_name', [uid]);
    console.log('[folders] lecture pour', uid, '->', fr.rows.length, 'dossier(s) trouve(s)');
    const ir = await _pgPool.query('SELECT folder_name, conv_id FROM penc_conv_folder_items WHERE user_id=$1', [uid]);
    const items = {};
    ir.rows.forEach(function(row){ (items[row.folder_name]=items[row.folder_name]||[]).push(row.conv_id); });
    res.json({ folders: fr.rows.map(function(r){return r.folder_name;}), items: items });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/folders', pencAuth, async (req, res) => {
  try{
    const name = String((req.body && req.body.name) || '').trim().slice(0,40);
    if(!name) return res.status(400).json({ error: 'Nom de dossier requis' });
    if(!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    await _pgPool.query('INSERT INTO penc_conv_folders(user_id,folder_name) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.pencUser.userId, name]);
    const _verif = await _pgPool.query('SELECT 1 FROM penc_conv_folders WHERE user_id=$1 AND folder_name=$2', [req.pencUser.userId, name]);
    console.log('[folders] cree pour', req.pencUser.userId, '->', name, '| verifie en base:', _verif.rowCount>0);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.delete('/api/penc/folders/:name', pencAuth, async (req, res) => {
  try{
    if(_pgPool){
      const uid = req.pencUser.userId, name = req.params.name;
      await _pgPool.query('DELETE FROM penc_conv_folder_items WHERE user_id=$1 AND folder_name=$2', [uid, name]);
      await _pgPool.query('DELETE FROM penc_conv_folders WHERE user_id=$1 AND folder_name=$2', [uid, name]);
    }
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/folders/:name/toggle', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId, name = req.params.name;
    const convId = req.body && req.body.conv_id;
    if(!convId) return res.status(400).json({ error: 'conv_id requis' });
    if(!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    const ex = await _pgPool.query('SELECT 1 FROM penc_conv_folder_items WHERE user_id=$1 AND folder_name=$2 AND conv_id=$3', [uid, name, convId]);
    if(ex.rowCount>0){
      await _pgPool.query('DELETE FROM penc_conv_folder_items WHERE user_id=$1 AND folder_name=$2 AND conv_id=$3', [uid, name, convId]);
      return res.json({ success:true, added:false });
    }
    await _pgPool.query('INSERT INTO penc_conv_folder_items(user_id,folder_name,conv_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [uid, name, convId]);
    res.json({ success:true, added:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/conversations/:id/ephemeral', pencAuth, async (req, res) => {
  try{
    const convId = req.params.id;
    const duration = parseInt((req.body && req.body.duration_seconds) || 0, 10);
    if(!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    if(duration <= 0){
      await _pgPool.query('DELETE FROM penc_conv_ephemeral WHERE conv_id=$1', [convId]);
    } else {
      await _pgPool.query(
        'INSERT INTO penc_conv_ephemeral(conv_id,duration_seconds,set_by) VALUES($1,$2,$3) ON CONFLICT (conv_id) DO UPDATE SET duration_seconds=$2, set_by=$3, updated_at=NOW()',
        [convId, duration, req.pencUser.userId]
      );
    }
    // Informe tous les participants en temps reel
    try{
      const cr = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1', [convId]);
      const parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants) ? cr.rows[0].participants : JSON.parse(cr.rows[0].participants||'[]')) : [];
      emitToUsers(parts, 'conversation:ephemeral', { conv_id:convId, duration_seconds:duration>0?duration:0 });
    }catch(_e){}
    res.json({ success:true, duration_seconds: duration>0?duration:0 });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Nettoyage periodique des messages expires (toutes les 5 minutes)
setInterval(async function(){
  try{
    if(!_pgPool) return;
    const r = await _pgPool.query("SELECT id, conversation_id FROM penc_messages WHERE expires_at IS NOT NULL AND expires_at < NOW() AND deleted_for_all IS NOT TRUE");
    if(!r.rows.length) return;
    const byConv = {};
    r.rows.forEach(function(row){ (byConv[row.conversation_id]=byConv[row.conversation_id]||[]).push(row.id); });
    await _pgPool.query("UPDATE penc_messages SET deleted_for_all=TRUE WHERE expires_at IS NOT NULL AND expires_at < NOW()");
    for(const convId of Object.keys(byConv)){
      try{
        const cr = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1', [convId]);
        const parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants) ? cr.rows[0].participants : JSON.parse(cr.rows[0].participants||'[]')) : [];
        emitToUsers(parts, 'message:expired', { conv_id:convId, message_ids:byConv[convId] });
      }catch(_e2){}
    }
    console.log('[ephemeral] ' + r.rows.length + ' message(s) expire(s) supprime(s)');
  }catch(e){ console.log('[ephemeral] erreur nettoyage:', e.message); }
}, 5*60*1000);
app.post('/api/penc/conversations/:id/mute-toggle', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId; const convId = req.params.id;
    if(!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    const ex = await _pgPool.query('SELECT 1 FROM penc_muted_convs WHERE user_id=$1 AND conv_id=$2',[uid,convId]);
    if(ex.rowCount>0){
      await _pgPool.query('DELETE FROM penc_muted_convs WHERE user_id=$1 AND conv_id=$2',[uid,convId]);
      return res.json({ success:true, muted:false });
    }
    await _pgPool.query('INSERT INTO penc_muted_convs(user_id,conv_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[uid,convId]);
    res.json({ success:true, muted:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/conversations/:id/pin-toggle', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId; const convId = req.params.id;
    if(!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    const ex = await _pgPool.query('SELECT 1 FROM penc_pinned_convs WHERE user_id=$1 AND conv_id=$2',[uid,convId]);
    if(ex.rowCount>0){
      await _pgPool.query('DELETE FROM penc_pinned_convs WHERE user_id=$1 AND conv_id=$2',[uid,convId]);
      return res.json({ success:true, pinned:false });
    }
    const cnt = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_pinned_convs WHERE user_id=$1',[uid]);
    if((cnt.rows[0]&&cnt.rows[0].n||0)>=5) return res.status(400).json({ error:'Maximum 5 conversations épinglées.' });
    await _pgPool.query('INSERT INTO penc_pinned_convs(user_id,conv_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[uid,convId]);
    res.json({ success:true, pinned:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// POST /api/penc/conversations/direct
app.post('/api/penc/conversations/direct', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const { target_user_id } = req.body;
    if (!target_user_id) return res.status(400).json({ error: 'target_user_id requis' });
    if (_pgPool) {
      const conv = await pgGetOrCreateConv(uid, target_user_id);
      const allUsers = await pgAllUsers() || [];
      const other = allUsers.find(u => u.id === target_user_id) || {};
      return res.json({ conversation: {
        id: conv.id,
        participants: Array.isArray(conv.participants) ? conv.participants : JSON.parse(conv.participants||'[]'),
        other_user_id: target_user_id,
        name: other.full_name || other.username || 'Utilisateur',
        avatar_url: other.avatar_url || null
      }});
    }
    // Fallback JSONBin
    const convs = await pencConvs();
    let conv = convs.find(c => Array.isArray(c.participants) && c.participants.includes(uid) && c.participants.includes(target_user_id));
    if (!conv) {
      conv = { id:'conv_'+Date.now(), participants:[uid,target_user_id], created_at:new Date().toISOString() };
      convs.push(conv); await pencSaveConvs(convs);
    }
    const users = await pencUsers();
    const other = users.find(u => u.id === target_user_id) || {};
    res.json({ conversation: { ...conv, other_user_id: target_user_id, name: other.full_name || other.username || 'Utilisateur', avatar_url: other.avatar_url || null }});
  } catch(e) { console.error('POST direct:', e.message); res.status(500).json({ error: 'Erreur' }); }
});

// GET /api/penc/conversations/:id/messages
app.get('/api/penc/conversations/:id/messages', pencAuth, async (req, res) => {
  try {
    // Corrige un décalage critique : l'envoi (/api/penc/send) écrit déjà les messages dans
    // PostgreSQL (table penc_messages), mais cette lecture allait encore chercher dans JSONBin
    // (bin séparé, jamais mis à jour par les nouveaux envois) — les messages semblaient donc
    // "disparaître" à chaque réouverture de conversation. On lit maintenant directement dans
    // PostgreSQL, là où les messages sont réellement stockés.
    if (!_pgPool) { console.log('[msgs-read] _pgPool indisponible pour conv=' + req.params.id); return res.status(503).json({ error: 'Base de données indisponible, réessaie dans quelques secondes' }); }
    console.log('[msgs-read] requête pour conv=' + req.params.id + ' par user=' + req.pencUser.userId);
    const r = await _pgPool.query(
      `SELECT * FROM penc_messages WHERE conversation_id=$1 AND (deleted_for_all IS NOT TRUE)
       ORDER BY created_at DESC LIMIT 100`, [req.params.id]
    );
    console.log('[msgs-read] conv=' + req.params.id + ' -> ' + r.rows.length + ' message(s) trouvé(s) en PostgreSQL');
    let rows = r.rows.slice().reverse(); // chronologique (ancien -> récent) comme avant
    // Filet de sécurité TEMPORAIRE pendant l'instabilité mémoire du serveur : si _pgPool était
    // indisponible au moment précis d'un envoi, le message a pu atterrir dans l'ancien JSONBin
    // (repli existant dans le code d'envoi). On fusionne ici pour ne perdre aucun message tant
    // que les plantages serveur ne sont pas résolus — à retirer une fois le serveur stabilisé.
    try {
      const existingIds = new Set(rows.map(m => m.id));
      const jbMsgs = await pencMsgs();
      const strayMsgs = jbMsgs.filter(m => m.conversation_id === req.params.id && !existingIds.has(m.id));
      if (strayMsgs.length) { console.log('[msgs-read] conv=' + req.params.id + ' -> ' + strayMsgs.length + ' message(s) retrouvé(s) dans JSONBin (absents de PostgreSQL !)'); rows = rows.concat(strayMsgs).sort((a,b) => new Date(a.created_at) - new Date(b.created_at)); }
    } catch (_jbe) { console.log('[msgs-read] échec lecture JSONBin de secours:', _jbe.message); }
    const senderIds = [...new Set(rows.map(m => m.sender_id))];
    const users = await pgFindUsersByIds(senderIds);
    const byId = new Map(users.map(u => [String(u.id), pencStrip(u)]));
    const enriched = rows.map(m => ({ ...m, sender: byId.get(String(m.sender_id)) || { id: m.sender_id } }));
    res.json({ messages: enriched });
  } catch (e) { console.error('penc msgs:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// CONTACTS / SEARCH
// ════════════════════════════════════════════════════════════

// GET /api/penc/contacts/search?q=
app.get('/api/penc/contacts/search', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const q = String(req.query.q || '').trim();
    let results = [];
    if (_pgPool) {
      if (q) {
        const ql = '%' + q.toLowerCase() + '%';
        const r = await _pgPool.query(
          'SELECT * FROM penc_users WHERE id!=$1 AND (LOWER(full_name) LIKE $2 OR LOWER(username) LIKE $2 OR phone LIKE $3) LIMIT 50',
          [uid, ql, '%'+q+'%']
        );
        results = r.rows.map(pgRow).map(pencStrip);
      } else {
        // Sans query: retourner tous les utilisateurs (PG + JSONBin)
        const all = await pgAllUsersMerged() || [];
        results = all.filter(u => u.id !== uid).map(pencStrip);
      }
    } else {
      const users = await pencUsers();
      const ql = q.toLowerCase();
      results = users.filter(u => u.id !== uid && (!ql ||
        (u.full_name||'').toLowerCase().includes(ql) ||
        (u.username||'').toLowerCase().includes(ql) ||
        (u.phone||'').includes(q)
      )).map(pencStrip);
    }
    results = results.filter(function(u){ return !_areIsolated(uid, u.id); });
    res.json({ users: results, contacts: results });
  } catch(e) { console.error('search:', e.message); res.status(500).json({ error: 'Erreur' }); }
});

// GET /api/penc/debug/online — qui est connecté
app.get('/api/penc/debug/online', async (req,res)=>{
  try{
    const sockets=await io.fetchSockets();
    const list=sockets.map(s=>({
      uid:(s.data.pencUserId||'?').slice(0,20),
      sid:s.id.slice(0,8),
      inMap:pencOnline.has(s.data.pencUserId)
    }));
    res.json({sockets:list,count:list.length,mapSize:pencOnline.size});
  }catch(e){res.json({error:e.message});}
});

// GET /api/penc/health — diagnostic public
app.get('/api/penc/health', async (req,res)=>{
  try{
    // Corrige un appel inconditionnel à JSONBin (probablement appelé très souvent si c'est
    // l'endpoint de health-check de Render) qui martelait un bin en erreur 403 en continu.
    let userCount = 0, convCount = 0, channelCount = 0;
    if (_pgPool) {
      try { const ur = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_users'); userCount = ur.rows[0].n; } catch (e) {}
      try { const cr = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_conversations'); convCount = cr.rows[0].n; } catch (e) {}
      try { channelCount = (await pencChannels()).length; } catch (e) {}
    } else {
      try { userCount = (await pencUsers()).length; } catch (e) {}
      try { convCount = (await pencConvs()).length; } catch (e) {}
      try { channelCount = (await pencChannels()).length; } catch (e) {}
    }
    res.json({status:'ok',users:userCount,convs:convCount,channels:channelCount,
      bins:{penc_users:!!BINS.penc_users,penc_convs:!!BINS.penc_convs,penc_channels:!!JSONBIN_PENC_CHANNELS_BIN}});
  }catch(e){res.json({status:'error',msg:e.message});}
});

// GET /api/penc/contacts
// POST /api/penc/contacts/match — fait correspondre une liste de numeros de telephone (importes localement
// depuis le carnet d'adresses du telephone, jamais stockes cote serveur) aux comptes Penc existants.
app.post('/api/penc/contacts/match', pencAuth, async (req, res) => {
  try{
    const phones = Array.isArray(req.body && req.body.phones) ? req.body.phones : [];
    if(!phones.length) return res.json({ matches: [] });
    if(!_pgPool) return res.json({ matches: [] });
    // Normalisation simple : ne garder que les chiffres (+ prefixe)
    const norm = function(p){ return String(p||'').replace(/[^0-9+]/g,''); };
    const normalized = Array.from(new Set(phones.map(norm).filter(function(p){ return p.length>=8; }))).slice(0, 1000);
    if(!normalized.length) return res.json({ matches: [] });
    const r = await _pgPool.query(
      "SELECT id, full_name, username, phone, avatar_url FROM penc_users WHERE phone = ANY($1) AND id != $2 AND deleted_at IS NULL",
      [normalized, req.pencUser.userId]
    );
    res.json({ matches: r.rows, matched_phones: r.rows.map(function(u){ return u.phone; }) });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/contacts', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    // PostgreSQL + JSONBin fusionnes (tous les utilisateurs)
    const users = await pgAllUsersMerged();
    let friendSet=new Set();
    try{
      if(_pgPool){
        const fr=await _pgPool.query("SELECT requester,recipient FROM penc_friendships WHERE status='accepted' AND (requester=$1 OR recipient=$1)",[uid]);
        fr.rows.forEach(function(row){ friendSet.add(row.requester===uid?row.recipient:row.requester); });
      }
    }catch(_fe){}
    const contacts = users.filter(u => u.id !== uid).map(function(u){
      const s = pencStrip(u);
      if(s.profile_hide_info && !friendSet.has(u.id)){ s.bio=''; s.phone=''; }
      return s;
    });
    res.json({ contacts });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// STATUSES
// ════════════════════════════════════════════════════════════

// GET /api/penc/statuses
// v14 : statuts d'UN utilisateur precis, lus directement en base — fiable depuis les profils,
// meme si la personne n'est pas encore amie (verification avant d'accepter une demande).
app.get('/api/penc/statuses/of/:userId', pencAuth, async (req, res) => {
  try {
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    const uid = req.pencUser.userId;
    const target = req.params.userId;
    try{ const _m=await _pgPool.query("SELECT 1 FROM penc_users WHERE id=$1 AND muted_until IS NOT NULL AND muted_until > NOW()",[target]); if(_m.rows.length) return res.json({statuses:[]}); }catch(_e){}
    // v15 : HISTORIQUE COMPLET — les 30 derniers statuts de la personne, actifs ET expires
    const _sq = await _pgPool.query("SELECT * FROM penc_statuses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",[target]);
    const rows = _sq.rows;
    const allUsers = await pgAllUsers()||[];
    const u = allUsers.find(x=>String(x.id)===String(target));
    const user = u?{id:u.id,full_name:(u.full_name||u.username||'Utilisateur'),username:u.username||'',avatar_url:u.avatar_url||null}:{id:target,full_name:'Utilisateur',username:''};
    const _cut = Date.now()-86400000;
    const statuses = rows.map(pgStatusToObj).map(x=>({...x,user,viewed:(x.views||[]).includes(uid),active:new Date(x.created_at).getTime()>=_cut}));
    res.json({statuses});
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.get('/api/penc/statuses', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const allUsers = _pgPool ? (await pgAllUsers()||[]) : await pencUsers();
    const vLookup = id2 => { const u=allUsers.find(x=>x.id===id2); return u?{id:u.id,full_name:(u.full_name||u.username||'Utilisateur'),username:u.username||'',avatar_url:u.avatar_url||null}:{id:id2,full_name:'Utilisateur',username:''}; };
    let statuses=[], mine=[];
    if(_pgPool){
      const rows=await pgGetStatuses(true);
      statuses=rows.map(pgStatusToObj).filter(s=>s.user_id!==uid).map(s=>({...s,user:vLookup(s.user_id),viewed:(s.views||[]).includes(uid)}));
      mine=rows.map(pgStatusToObj).filter(s=>s.user_id===uid).map(s=>{
        const reactBy={}; (s.reactions||[]).forEach(r=>{ if(r&&r.user_id) reactBy[r.user_id]=r.emoji; });
        const log=Array.isArray(s.view_log)?s.view_log:[]; const seen={}; const viewers=[];
        log.forEach(v=>{ if(v&&v.user_id&&!seen[v.user_id]){ seen[v.user_id]=1; const u=vLookup(v.user_id); viewers.push({user_id:v.user_id,full_name:u.full_name,username:u.username,avatar_url:u.avatar_url,viewed_at:v.at||null,reaction:reactBy[v.user_id]||null}); } });
        (s.views||[]).forEach(id=>{ if(id&&!seen[id]){ seen[id]=1; const u=vLookup(id); viewers.push({user_id:id,full_name:u.full_name,username:u.username,avatar_url:u.avatar_url,viewed_at:null,reaction:reactBy[id]||null}); } });
        viewers.sort((a,b)=>new Date(b.viewed_at||0)-new Date(a.viewed_at||0));
        return {...s,user:vLookup(uid),viewed:false,viewers};
      });
    } else {
      const cutoff=Date.now()-86400000;
      const all=await pencStatuses();
      statuses=all.filter(s=>new Date(s.created_at).getTime()>=cutoff&&s.user_id!==uid).map(s=>({...s,user:vLookup(s.user_id),viewed:(s.views||[]).includes(uid)}));
      mine=all.filter(s=>s.user_id===uid&&new Date(s.created_at).getTime()>=cutoff).map(s=>({...s,user:vLookup(uid)}));
    }
    const meUser=vLookup(uid);
    try{ if(_pgPool){ const _mr=await _pgPool.query("SELECT id FROM penc_users WHERE muted_until IS NOT NULL AND muted_until > NOW()"); const _muted={}; _mr.rows.forEach(function(r){ _muted[String(r.id)]=1; }); statuses=statuses.filter(function(s){ return !_muted[String(s.user_id)]; }); } }catch(_me){}
    // Confidentialité des statuts : chaque auteur choisit qui peut voir ses statuts
    // (tout le monde / amis uniquement / tous sauf certains / uniquement certains).
    try{
      if(_pgPool && statuses.length){
        const authorIds=[...new Set(statuses.map(s=>s.user_id))];
        const pr=await _pgPool.query("SELECT id, status_privacy, status_privacy_list FROM penc_users WHERE id = ANY($1)",[authorIds]);
        const privMap={}; pr.rows.forEach(function(row){ privMap[row.id]={mode:row.status_privacy||'everyone', list:row.status_privacy_list||[]}; });
        const filtered=[];
        for(const s of statuses){
          const p=privMap[s.user_id]||{mode:'everyone',list:[]};
          if(p.mode==='everyone'){ filtered.push(s); continue; }
          if(p.mode==='friends'){ if(await pgFriendAccepted(uid,s.user_id)) filtered.push(s); continue; }
          if(p.mode==='except'){ if(!(p.list||[]).includes(uid)) filtered.push(s); continue; }
          if(p.mode==='only'){ if((p.list||[]).includes(uid)) filtered.push(s); continue; }
          filtered.push(s);
        }
        statuses=filtered;
      }
    }catch(_pe){ console.error('filtre confidentialite statuts:', _pe.message); }
    res.json({statuses,mine,me:meUser});
  }catch(e){console.error('GET statuses:',e.message);res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/penc/statuses
// POST /api/penc/settings/privacy — confidentialité des statuts + visibilité des infos de profil
// GET /api/penc/referral/mine — mon code de parrainage + nombre de filleuls
// POST /api/penc/messages/:id/pin — épingler/désépingler un message dans sa discussion
app.post('/api/penc/messages/:id/pin', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    if(!_pgPool) return res.status(503).json({error:'BD non disponible'});
    const r=await _pgPool.query('SELECT * FROM penc_messages WHERE id=$1',[req.params.id]);
    const msg=r.rows[0];
    if(!msg) return res.status(404).json({error:'Message introuvable'});
    const convR=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[msg.conversation_id]);
    const parts=(convR.rows[0]?JSON.parse(JSON.stringify(convR.rows[0].participants)):[]).map(String);
    if(!parts.includes(String(uid))) return res.status(403).json({error:'Action non autorisée'});
    const pin = !msg.pinned_at;
    // Un seul message épinglé à la fois par discussion — on désépingle l'ancien
    if(pin) await _pgPool.query('UPDATE penc_messages SET pinned_at=NULL WHERE conversation_id=$1',[msg.conversation_id]);
    await _pgPool.query('UPDATE penc_messages SET pinned_at=$1 WHERE id=$2',[pin?new Date():null, req.params.id]);
    await emitToUsers(parts,'message:pinned',{conv_id:msg.conversation_id, message_id:req.params.id, pinned:pin});
    res.json({success:true, pinned:pin});
  }catch(e){console.error('pin msg:',e.message);res.status(500).json({error:'Erreur serveur'});}
});

// ══════════════ BIOMÉTRIE (WebAuthn : empreinte / Face ID) ══════════════
const PENC_RP_ID = process.env.PENC_RP_ID || 'penc-messagerie.com';
const PENC_RP_NAME = 'Penc';
const PENC_ORIGINS = ['https://penc-messagerie.com', 'https://www.penc-messagerie.com'];
var _webauthnChallenges = {}; // clé: userId (enregistrement) ou "login:"+phone/username (connexion)

app.post('/api/penc/webauthn/register-options', pencAuth, async (req, res) => {
  try{
    if(!_webauthn) return res.status(503).json({ error:'Biométrie non disponible côté serveur' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const uid = req.pencUser.userId;
    const cr = await _pgPool.query('SELECT id FROM penc_webauthn_credentials WHERE user_id=$1',[uid]);
    const u = await pgFindUser('id', uid);
    const options = await _webauthn.generateRegistrationOptions({
      rpName: PENC_RP_NAME, rpID: PENC_RP_ID,
      userID: Buffer.from(String(uid)), userName: (u&&u.username)||'penc',
      userDisplayName: (u&&u.full_name)||'Utilisateur Penc',
      attestationType: 'none',
      excludeCredentials: cr.rows.map(function(c){ return { id: c.id, type:'public-key' }; }),
      authenticatorSelection: { residentKey:'preferred', userVerification:'preferred', authenticatorAttachment:'platform' }
    });
    _webauthnChallenges[uid] = options.challenge;
    res.json(options);
  }catch(e){ console.error('webauthn register-options:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/webauthn/register-verify', pencAuth, async (req, res) => {
  try{
    if(!_webauthn || !_pgPool) return res.status(503).json({ error:'Biométrie non disponible' });
    const uid = req.pencUser.userId;
    const expectedChallenge = _webauthnChallenges[uid];
    if(!expectedChallenge) return res.status(400).json({ error:'Session expirée, recommence' });
    const verification = await _webauthn.verifyRegistrationResponse({
      response: req.body, expectedChallenge, expectedOrigin: PENC_ORIGINS, expectedRPID: PENC_RP_ID
    });
    if(!verification.verified || !verification.registrationInfo) return res.status(400).json({ error:'Vérification échouée' });
    const { credential } = verification.registrationInfo;
    await _pgPool.query(
      'INSERT INTO penc_webauthn_credentials(id,user_id,public_key,counter,device_label) VALUES($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
      [credential.id, uid, Buffer.from(credential.publicKey).toString('base64'), credential.counter||0, (req.body.deviceLabel||'Cet appareil')]
    );
    delete _webauthnChallenges[uid];
    res.json({ success:true });
  }catch(e){ console.error('webauthn register-verify:', e.message); res.status(500).json({ error:'Vérification échouée' }); }
});

app.post('/api/penc/webauthn/login-options', async (req, res) => {
  try{
    if(!_webauthn || !_pgPool) return res.status(503).json({ error:'Biométrie non disponible' });
    const { identifier } = req.body; // téléphone, username ou email
    if(!identifier) return res.status(400).json({ error:'Identifiant requis' });
    let u = await pgFindUser('phone', identifier) || await pgFindUser('username', identifier) || await pgFindUser('email', identifier);
    if(!u) return res.status(404).json({ error:'Compte introuvable' });
    const cr = await _pgPool.query('SELECT id FROM penc_webauthn_credentials WHERE user_id=$1',[u.id]);
    if(!cr.rows.length) return res.status(400).json({ error:'Aucune biométrie enregistrée pour ce compte' });
    const options = await _webauthn.generateAuthenticationOptions({
      rpID: PENC_RP_ID, userVerification:'preferred',
      allowCredentials: cr.rows.map(function(c){ return { id: c.id, type:'public-key' }; })
    });
    _webauthnChallenges['login:'+u.id] = options.challenge;
    res.json({ options, userId: u.id });
  }catch(e){ console.error('webauthn login-options:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/webauthn/login-verify', async (req, res) => {
  try{
    if(!_webauthn || !_pgPool) return res.status(503).json({ error:'Biométrie non disponible' });
    const { userId, response } = req.body;
    const expectedChallenge = _webauthnChallenges['login:'+userId];
    if(!expectedChallenge) return res.status(400).json({ error:'Session expirée, recommence' });
    const cr = await _pgPool.query('SELECT * FROM penc_webauthn_credentials WHERE id=$1 AND user_id=$2',[response.id, userId]);
    const stored = cr.rows[0];
    if(!stored) return res.status(400).json({ error:'Identifiant biométrique inconnu' });
    const verification = await _webauthn.verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: PENC_ORIGINS, expectedRPID: PENC_RP_ID,
      credential: { id: stored.id, publicKey: Buffer.from(stored.public_key,'base64'), counter: Number(stored.counter)||0 }
    });
    if(!verification.verified) return res.status(400).json({ error:'Vérification échouée' });
    await _pgPool.query('UPDATE penc_webauthn_credentials SET counter=$1 WHERE id=$2',[verification.authenticationInfo.newCounter, stored.id]);
    delete _webauthnChallenges['login:'+userId];
    const u = await pgFindUser('id', userId);
    if(!u) return res.status(404).json({ error:'Compte introuvable' });
    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: u.id, sid: _sid }, PENC_SECRET, { expiresIn:'7d' });
    _pencCreateSession(u.id, _sid, req).catch(function(){});
    const isAdmin = PENC_ADMIN_EMAILS.includes((u.email||'').toLowerCase());
    res.json({ user: Object.assign({}, pencStrip(u), { is_admin: isAdmin }), token: tok });
  }catch(e){ console.error('webauthn login-verify:', e.message); res.status(500).json({ error:'Vérification échouée' }); }
});

app.get('/api/penc/webauthn/status', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ enabled:false, available: !!_webauthn });
    const cr = await _pgPool.query('SELECT id, device_label, created_at FROM penc_webauthn_credentials WHERE user_id=$1',[req.pencUser.userId]);
    res.json({ enabled: cr.rows.length>0, available: !!_webauthn, devices: cr.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.delete('/api/penc/webauthn/:credId', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    await _pgPool.query('DELETE FROM penc_webauthn_credentials WHERE id=$1 AND user_id=$2',[req.params.credId, req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

// ══════════════ SAUVEGARDE CLOUD DE LA CLÉ E2E (automatique) ══════════════
// Ne sauvegarde QUE la clé secrète de chiffrement (petite, critique, non-récupérable si perdue) —
// les messages eux-mêmes sont déjà en sécurité côté serveur PostgreSQL, aucune duplication inutile.
// ══════════════ PETITES ANNONCES COMMUNAUTAIRES ══════════════
const LISTING_CATEGORIES = ['electronique','vehicules','immobilier','mode','maison','services','emploi','autre'];

app.post('/api/penc/listings', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const uid = req.pencUser.userId;
    let { title, description, price, category, location, media_urls } = req.body;
    title = String(title||'').trim().slice(0,120);
    if(!title) return res.status(400).json({ error:'Titre requis' });
    description = String(description||'').trim().slice(0,2000);
    price = Math.max(0, parseInt(price,10)||0);
    category = LISTING_CATEGORIES.includes(category) ? category : 'autre';
    location = String(location||'').trim().slice(0,100);
    media_urls = Array.isArray(media_urls) ? media_urls.slice(0,6) : [];
    const id = 'lst_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query(
      'INSERT INTO penc_listings(id,seller_id,title,description,price,category,location,media_urls) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, uid, title, description, price, category, location, JSON.stringify(media_urls)]
    );
    const r = await _pgPool.query('SELECT * FROM penc_listings WHERE id=$1',[id]);
    res.json({ success:true, listing:r.rows[0] });
  }catch(e){ console.error('listings create:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/listings', pencAuth, async (req, res) => {
  try{
    // Ne JAMAIS renvoyer "reussi mais vide" quand la base n'est pas prete (ex: juste apres un
    // redemarrage/plantage) — sinon le client ne peut pas distinguer "vraiment aucune annonce"
    // d'un echec de connexion temporaire, et affiche "Aucune annonce" a tort.
    if(!_pgPool) return res.status(503).json({ error:'Base de données indisponible, réessaie dans quelques secondes' });
    const { category, q, min_price, max_price, cursor } = req.query;
    const conds = ["status='active'"]; const vals = []; let n=1;
    if(category && LISTING_CATEGORIES.includes(category)){ conds.push('category=$'+(n++)); vals.push(category); }
    if(q){ conds.push('(title ILIKE $'+(n)+' OR description ILIKE $'+(n)+')'); vals.push('%'+String(q).slice(0,80)+'%'); n++; }
    if(min_price){ conds.push('price >= $'+(n++)); vals.push(parseInt(min_price,10)||0); }
    if(max_price){ conds.push('price <= $'+(n++)); vals.push(parseInt(max_price,10)||0); }
    if(cursor){ conds.push('created_at < $'+(n++)); vals.push(new Date(cursor)); }
    const sql = 'SELECT l.*, u.full_name as seller_name, u.username as seller_username, u.avatar_url as seller_avatar FROM penc_listings l JOIN penc_users u ON u.id=l.seller_id WHERE '+conds.join(' AND ')+' ORDER BY created_at DESC LIMIT 30';
    const r = await _pgPool.query(sql, vals);
    res.json({ listings: r.rows, categories: LISTING_CATEGORIES });
  }catch(e){ console.error('listings list:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/listings/mine', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ listings:[] });
    const r = await _pgPool.query('SELECT * FROM penc_listings WHERE seller_id=$1 ORDER BY created_at DESC',[req.pencUser.userId]);
    res.json({ listings: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/listings/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(404).json({ error:'Introuvable' });
    const r = await _pgPool.query('SELECT l.*, u.full_name as seller_name, u.username as seller_username, u.avatar_url as seller_avatar, u.phone as seller_phone FROM penc_listings l JOIN penc_users u ON u.id=l.seller_id WHERE l.id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({ error:'Annonce introuvable' });
    if(String(r.rows[0].seller_id)!==String(req.pencUser.userId)){
      await _pgPool.query('UPDATE penc_listings SET views_count=views_count+1 WHERE id=$1',[req.params.id]);
    }
    const lc = await _pgPool.query('SELECT COUNT(*) FROM penc_listing_likes WHERE listing_id=$1',[req.params.id]);
    const myLike = await _pgPool.query('SELECT 1 FROM penc_listing_likes WHERE listing_id=$1 AND user_id=$2',[req.params.id, req.pencUser.userId]);
    const listing = { ...r.rows[0], likes_count: parseInt(lc.rows[0].count,10)||0, liked_by_me: myLike.rows.length>0 };
    res.json({ listing });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.patch('/api/penc/listings/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT seller_id FROM penc_listings WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({ error:'Introuvable' });
    if(String(r.rows[0].seller_id)!==String(req.pencUser.userId)) return res.status(403).json({ error:'Action non autorisée' });
    const { status, price, title, description } = req.body;
    const fields=[]; const vals=[]; let n=1;
    if(status && ['active','sold','expired'].includes(status)){ fields.push('status=$'+(n++)); vals.push(status); }
    if(price!==undefined){ fields.push('price=$'+(n++)); vals.push(Math.max(0,parseInt(price,10)||0)); }
    if(title){ fields.push('title=$'+(n++)); vals.push(String(title).trim().slice(0,120)); }
    if(description!==undefined){ fields.push('description=$'+(n++)); vals.push(String(description).trim().slice(0,2000)); }
    if(!fields.length) return res.json({ success:true });
    fields.push('updated_at=NOW()');
    vals.push(req.params.id);
    await _pgPool.query('UPDATE penc_listings SET '+fields.join(', ')+' WHERE id=$'+n, vals);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.delete('/api/penc/listings/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const r = await _pgPool.query('SELECT seller_id FROM penc_listings WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({ error:'Introuvable' });
    if(String(r.rows[0].seller_id)!==String(req.pencUser.userId)) return res.status(403).json({ error:'Action non autorisée' });
    await _pgPool.query('DELETE FROM penc_listings WHERE id=$1',[req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/keybackup/status', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ exists:false });
    const r=await _pgPool.query('SELECT key_backup_at FROM penc_users WHERE id=$1',[req.pencUser.userId]);
    res.json({ exists: !!(r.rows[0]&&r.rows[0].key_backup_at), at: r.rows[0]&&r.rows[0].key_backup_at });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/keybackup/mark', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ success:true });
    await _pgPool.query('UPDATE penc_users SET key_backup_at=NOW() WHERE id=$1',[req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/referral/mine', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ code:null, count:0 });
    const uid = req.pencUser.userId;
    const r=await _pgPool.query('SELECT referral_code, username FROM penc_users WHERE id=$1',[uid]);
    let code=r.rows[0]&&r.rows[0].referral_code;
    const uname = (r.rows[0]&&r.rows[0].username) || 'penc';
    const cleanCode = uname.toLowerCase().replace(/[^a-z0-9]/g,'');
    // Compte créé avant l'existence du parrainage (ou ancien format tronqué/aléatoire) : on aligne
    // le code sur le nom d'utilisateur exact, pour que tout reste cohérent et mémorable.
    if(!code || code !== cleanCode){
      code = cleanCode;
      try{ await _pgPool.query('UPDATE penc_users SET referral_code=$1 WHERE id=$2',[code, uid]); }
      catch(_dup){ code = code + Math.random().toString(36).slice(2,4); await _pgPool.query('UPDATE penc_users SET referral_code=$1 WHERE id=$2',[code, uid]); }
    }
    let count=0;
    if(code){ const cr=await _pgPool.query('SELECT COUNT(*) FROM penc_users WHERE referred_by=$1',[uid]); count=parseInt(cr.rows[0].count,10)||0; }
    res.json({ code, count, bonus_per_filleul:200 });
  }catch(e){ console.error('referral/mine:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/settings/privacy', pencAuth, async (req, res) => {
  try{
    const uid=req.pencUser.userId;
    const { status_privacy, status_privacy_list, profile_hide_info } = req.body;
    const validModes=['everyone','friends','except','only'];
    if(status_privacy && !validModes.includes(status_privacy)) return res.status(400).json({ error:'Mode de confidentialité invalide' });
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const fields=[]; const vals=[]; let i=1;
    if(status_privacy!==undefined){ fields.push('status_privacy=$'+(i++)); vals.push(status_privacy); }
    if(status_privacy_list!==undefined){ fields.push('status_privacy_list=$'+(i++)); vals.push(JSON.stringify(Array.isArray(status_privacy_list)?status_privacy_list:[])); }
    if(profile_hide_info!==undefined){ fields.push('profile_hide_info=$'+(i++)); vals.push(!!profile_hide_info); }
    if(!fields.length) return res.json({ success:true });
    vals.push(uid);
    await _pgPool.query('UPDATE penc_users SET '+fields.join(', ')+' WHERE id=$'+i, vals);
    res.json({ success:true });
  }catch(e){ console.error('settings/privacy:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// GET /api/penc/settings/privacy — récupérer mes préférences actuelles
app.get('/api/penc/settings/privacy', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ status_privacy:'everyone', status_privacy_list:[], profile_hide_info:false });
    const r=await _pgPool.query('SELECT status_privacy, status_privacy_list, profile_hide_info FROM penc_users WHERE id=$1',[req.pencUser.userId]);
    const row=r.rows[0]||{};
    res.json({ status_privacy:row.status_privacy||'everyone', status_privacy_list:row.status_privacy_list||[], profile_hide_info:!!row.profile_hide_info });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/statuses', pencAuth, async (req, res) => {
  try {
    const { type, media_url, text_content, bg_color, caption, duration, media_urls } = req.body;
    const _mu = Array.isArray(media_urls)?media_urls.filter(function(u){return !!u;}).slice(0,10):null;
    const status = {
      id: 'st_'+Date.now()+Math.random().toString(36).slice(2),
      user_id: req.pencUser.userId, type: type||'text',
      media_url: (_mu&&_mu.length)?_mu[0]:(media_url||null), media_urls: (_mu&&_mu.length>1)?_mu:null, text_content: text_content||null,
      bg_color: bg_color||'#050D18', caption: caption||null,
      duration: (typeof duration==='number'&&duration>0&&duration<=60)?Math.round(duration):(type==='video'?0:10),
      reactions: [], views: [], view_ips: [],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now()+86400000).toISOString()
    };
    if(_pgPool){
      await pgSaveStatus(status);
    } else {
      const statuses=await pencStatuses(); statuses.push(status); await pencSaveStatuses(statuses);
    }
    // Notifier les amis en temps reel (cliquable) — Fonct. 6
    try {
      if(_pgPool){
        const _fr=await _pgPool.query("SELECT requester,recipient FROM penc_friendships WHERE status='accepted' AND (requester=$1 OR recipient=$1)",[req.pencUser.userId]);
        const _fids=_fr.rows.map(function(x){ return String(x.requester)===String(req.pencUser.userId)?x.recipient:x.requester; });
        let _an='Un ami'; try{ const _au=await _pgPool.query('SELECT full_name,username FROM penc_users WHERE id=$1',[req.pencUser.userId]); if(_au.rows[0]) _an=_au.rows[0].full_name||_au.rows[0].username||'Un ami'; }catch(_e9){}
        _fids.forEach(function(fid){ try{ emitToUsers(String(fid),'status:new',{status_id:status.id, author_id:req.pencUser.userId, author_name:_an}); }catch(_e10){} });
      }
    } catch(_eF){}
    // Push « a publié un statut » aux contacts (personnes avec qui l'auteur a une conversation)
    try {
      if (webpush) {
        let author=null;
        if(_pgPool){ const ar=await _pgPool.query('SELECT full_name,username FROM penc_users WHERE id=$1',[req.pencUser.userId]); author=ar.rows[0]; }
        else { author=(await pencUsers()).find(u=>u.id===req.pencUser.userId); }
        const aname=author?(author.full_name||author.username||'Quelqu\'un'):'Quelqu\'un';
        const partners=new Set();
        if(_pgPool){
          const cr=await _pgPool.query('SELECT participants FROM penc_conversations');
          for(const row of cr.rows){ const parts=Array.isArray(row.participants)?row.participants:JSON.parse(row.participants||'[]'); if(parts.includes(req.pencUser.userId)) parts.forEach(p=>{ if(p!==req.pencUser.userId) partners.add(p); }); }
        } else {
          const convs=await pencConvs();
          for(const c of convs){ const parts=c.participants||c.members||[]; if(parts.includes(req.pencUser.userId)) parts.forEach(p=>{ if(p!==req.pencUser.userId) partners.add(p); }); }
        }
        const ppayload={ title:aname, body:'A publié un nouveau statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-status-'+req.pencUser.userId, data:{ type:'status', user_id:req.pencUser.userId, url:'/' } };
        partners.forEach(uid=>{ sendPencPush(uid, ppayload); });
      }
    } catch(e){ console.error('push statut:', e.message); }
    res.json({status,success:true});
  }catch(e){console.error('POST status:',e.message);res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/penc/statuses/:id/view
app.post('/api/penc/statuses/:id/view', pencAuth, async (req, res) => {
  try {
    const uid=req.pencUser.userId;
    const xf=(req.headers['x-forwarded-for']||'').split(',')[0].trim();
    const ip=xf||(req.socket&&req.socket.remoteAddress)||'unknown';
    let ownerId=null, newValidView=false;
    if(_pgPool){
      const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE id=$1',[req.params.id]);
      if(!r.rows[0]) return res.json({success:true});
      const st=pgStatusToObj(r.rows[0]);
      ownerId=st.user_id;
      if(st.user_id!==uid){
        if(!st.views.includes(uid)) st.views.push(uid);
        if(!st.view_ips.includes(ip)){ st.view_ips.push(ip); newValidView=true; }   // anti-fraude : 1 IP = 1 vue valide
        st.view_log=Array.isArray(st.view_log)?st.view_log:[];
        if(!st.view_log.find(function(v){return v&&v.user_id===uid;})) st.view_log.push({user_id:uid, at:new Date().toISOString()});
        await pgUpdateStatus(req.params.id,{views:st.views,view_ips:st.view_ips,view_log:st.view_log});
      }
    } else {
      const statuses=await pencStatuses();
      const st=statuses.find(x=>x.id===req.params.id);
      if(st && st.user_id!==uid){
        st.views=st.views||[]; st.view_ips=st.view_ips||[];
        if(!st.views.includes(uid)) st.views.push(uid);
        if(!st.view_ips.includes(ip)){ st.view_ips.push(ip); newValidView=true; }
        ownerId=st.user_id;
        await pencSaveStatuses(statuses);
      }
    }
    // Monetisation : 1 vue valide par IP unique creditee a l'auteur (jamais soi-meme)
    if(newValidView && ownerId && ownerId!==uid){
      try{
        if(_pgPool){ await _pgPool.query('UPDATE penc_users SET valid_views=COALESCE(valid_views,0)+1 WHERE id=$1',[ownerId]); }
        else { const users=await pencUsers(); const owner=users.find(u=>u.id===ownerId); if(owner){ owner.valid_views=(owner.valid_views||0)+1; await pencSaveUsers(users); } }
      }catch(_){}
    }
    res.json({success:true});
  }catch(e){res.json({success:true});}
});

// ════════════════════════════════════════════════════════════
// POST /api/penc/push/subscribe
app.post('/api/penc/push/subscribe', pencAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'subscription requise' });
    const uid = req.pencUser.userId;
    const subs = await pencPushSubs();
    const others = subs.filter(s => !(s.subscription && s.subscription.endpoint === subscription.endpoint));
    others.push({ user_id: uid, subscription, created_at: new Date().toISOString() });
    await pencSavePushSubs(others);
    res.json({ success: true });
  } catch (e) { console.error('penc push sub:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/rewards/withdraw
app.post('/api/penc/rewards/withdraw', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const users = await pencUsers();
    const user = users.find(u => u.id === uid);
    if (!user) return res.status(404).json({ error: 'Introuvable' });
    const valid_views = user.valid_views || 0;
    const earned = Math.floor(valid_views / 1000) * 75;
    const balance = Math.max(0, earned - (user.withdrawn || 0));
    const convs = await pencConvs();
    const set = new Set();
    convs.forEach(c => { if (Array.isArray(c.members) && c.members.includes(uid)) c.members.forEach(m => { if (m !== uid) set.add(m); }); });
    const contacts_count = set.size;
    if (contacts_count < 100) return res.status(400).json({ error: 'Il faut au moins 100 contacts (' + contacts_count + '/100)' });
    if (balance < 500) return res.status(400).json({ error: 'Retrait minimum 500 F (solde ' + balance + ' F)' });
    user.withdraw_request = { amount: balance, requested_at: new Date().toISOString(), status: 'pending', phone: (req.body && req.body.phone) || user.phone || '' };
    user.reward_pending = true;
    await pencSaveUsers(users);
    console.log('💸 DEMANDE DE RETRAIT: ' + (user.username || uid) + ' -> ' + balance + ' F');
    res.json({ success: true, amount: balance });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── PENC ADMIN ─────────────────────────────────────────────
const PENC_ADMIN_EMAILS = ['tpapaseny@ept.sn', 'papasenytoure@gmail.com'];
// Reparation globale : comptes au nom vide (souvent d'anciennes inscriptions Google)
app.post('/api/penc/admin/repair-names', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    let me = null; try { me = await pgFindUser('id', uid); } catch(_) {}
    const isAdmin = me && (me.is_admin || PENC_ADMIN_EMAILS.includes(String(me.email||'').toLowerCase()));
    if (!isAdmin) return res.status(403).json({ error: 'Reserve aux administrateurs' });
    if (!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    function deriveName(username, email){
      var nm = '';
      if (username && String(username).trim()) { nm = String(username).replace(/[._-]+/g, ' ').trim(); }
      else if (email) { nm = String(email).split('@')[0].replace(/[._-]+/g, ' ').trim(); }
      nm = nm.split(' ').map(function(w){ return w ? (w.charAt(0).toUpperCase()+w.slice(1)) : w; }).join(' ').trim();
      return nm || 'Utilisateur Penc';
    }
    // PostgreSQL UNIQUEMENT (base principale penc-db). Un nom est 'a reparer'
    // s'il est vide OU s'il vaut litteralement Utilisateur / Utilisateur Penc / User.
    var badName = "(full_name IS NULL OR TRIM(full_name)='' OR LOWER(TRIM(full_name)) IN ('utilisateur','utilisateur penc','user'))";
    var fixed = 0;
    var r = await _pgPool.query('SELECT id, username, email, full_name FROM penc_users WHERE ' + badName);
    for (const row of r.rows) {
      var nm = deriveName(row.username, row.email);
      try { await _pgPool.query('UPDATE penc_users SET full_name=$1 WHERE id=$2', [nm, row.id]); fixed++; } catch(_) {}
    }
    return res.json({ success: true, fixed: fixed, total: r.rows.length });
  } catch (e) { console.error('repair-names:', e.message); return res.status(500).json({ error: 'Erreur: ' + e.message }); }
});
// ── Modération admin des petites annonces ──
app.get('/api/penc/admin/listings', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ listings:[] });
    const r = await _pgPool.query('SELECT l.*, u.full_name as seller_name, u.username as seller_username, u.phone as seller_phone FROM penc_listings l JOIN penc_users u ON u.id=l.seller_id ORDER BY l.created_at DESC LIMIT 200');
    res.json({ listings: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ══════════════ RADIO PENC (auto-hébergée, remplace progressivement DeglouFM/Base44) ══════════════
// Accès en lecture réservé aux admins tant que le catalogue de stations n'est pas complet.
app.get('/api/penc/radio/stations', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ stations:[] });
    const r = await _pgPool.query('SELECT * FROM penc_radio_stations WHERE active=true ORDER BY country, sort_order, name');
    // Le catalogue s'ouvre à tous dès qu'il contient au moins une station — plus besoin de
    // débloquer manuellement un flag admin une fois les radios ajoutées. S'il redevenait
    // vide (toutes désactivées), l'écran retombe proprement en mode "réservé aux admins"
    // plutôt que de montrer une liste vide aux utilisateurs.
    if(!r.rows.length){
      let u = null; try{ u = await pgFindUser('id', req.pencUser.userId); }catch(_pu){}
      const isAdmin = !!(u && PENC_ADMIN_EMAILS.includes(String(u.email||'').toLowerCase()));
      if(!isAdmin) return res.json({ stations:[], admin_only:true });
    }
    res.json({ stations: r.rows });
  }catch(e){ console.error('radio stations:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/admin/radio/stations', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ stations:[] });
    const r = await _pgPool.query('SELECT * FROM penc_radio_stations ORDER BY country, sort_order, name');
    res.json({ stations: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/stations', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    let { name, stream_url, logo_url, country, category, featured, replay_enabled, coming_soon } = req.body;
    name = String(name||'').trim().slice(0,80);
    stream_url = String(stream_url||'').trim().slice(0,500);
    if(!name || (!stream_url && !coming_soon)) return res.status(400).json({ error:'Nom et URL du flux requis (sauf si "Bientôt disponible" est coché)' });
    const id = 'rad_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query(
      'INSERT INTO penc_radio_stations(id,name,stream_url,logo_url,country,category,featured,replay_enabled,coming_soon) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, name, stream_url||'', logo_url||null, String(country||'').trim().slice(0,60), String(category||'').trim().slice(0,60), !!featured, !!replay_enabled, !!coming_soon]
    );
    res.json({ success:true, id });
  }catch(e){ console.error('radio add:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.patch('/api/penc/admin/radio/stations/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { name, stream_url, logo_url, country, category, active, sort_order, featured, replay_enabled, coming_soon } = req.body;
    const fields=[]; const vals=[]; let n=1;
    if(name!==undefined){ fields.push('name=$'+(n++)); vals.push(String(name).trim().slice(0,80)); }
    if(stream_url!==undefined){ fields.push('stream_url=$'+(n++)); vals.push(String(stream_url).trim().slice(0,500)); }
    if(logo_url!==undefined){ fields.push('logo_url=$'+(n++)); vals.push(logo_url||null); }
    if(country!==undefined){ fields.push('country=$'+(n++)); vals.push(String(country).trim().slice(0,60)); }
    if(category!==undefined){ fields.push('category=$'+(n++)); vals.push(String(category).trim().slice(0,60)); }
    if(active!==undefined){ fields.push('active=$'+(n++)); vals.push(!!active); }
    if(sort_order!==undefined){ fields.push('sort_order=$'+(n++)); vals.push(parseInt(sort_order,10)||0); }
    if(featured!==undefined){ fields.push('featured=$'+(n++)); vals.push(!!featured); }
    if(replay_enabled!==undefined){ fields.push('replay_enabled=$'+(n++)); vals.push(!!replay_enabled); }
    if(coming_soon!==undefined){ fields.push('coming_soon=$'+(n++)); vals.push(!!coming_soon); }
    if(!fields.length) return res.json({ success:true });
    vals.push(req.params.id);
    await _pgPool.query('UPDATE penc_radio_stations SET '+fields.join(', ')+' WHERE id=$'+n, vals);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Grille des programmes (admin) : nom de l'émission, créneau horaire, jours concernés.
// "kind" distingue un journal ('journal') d'une émission classique, pour un affichage adapté
// ("🗞️ Journal en cours" vs "🎙️ [Nom de l'émission]"). ──
app.get('/api/penc/admin/radio/stations/:id/programs', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ programs: [] });
    const r = await _pgPool.query('SELECT * FROM penc_radio_programs WHERE station_id=$1 ORDER BY start_hour, start_minute',[req.params.id]);
    res.json({ programs: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/stations/:id/programs', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { name, kind, days, start_hour, start_minute, end_hour, end_minute } = req.body || {};
    const sh=parseInt(start_hour,10), sm=parseInt(start_minute,10)||0, eh=parseInt(end_hour,10), em=parseInt(end_minute,10)||0;
    if(!name || isNaN(sh) || isNaN(eh)) return res.status(400).json({ error:'Nom et horaires requis' });
    const id = 'rprog_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query(
      'INSERT INTO penc_radio_programs(id,station_id,name,kind,days,start_hour,start_minute,end_hour,end_minute) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, req.params.id, String(name).trim().slice(0,80), (kind==='journal'?'journal':'emission'), (days?String(days):null), sh, sm, eh, em]
    );
    res.json({ success:true, id });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.delete('/api/penc/admin/radio/programs/:id', pencAuth, pencAdmin, async (req, res) => {
  try{ if(_pgPool) await _pgPool.query('DELETE FROM penc_radio_programs WHERE id=$1',[req.params.id]); res.json({ success:true }); }
  catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Programme en cours pour une station (public) — heure serveur = heure Sénégal (GMT+0), pas de
// conversion de fuseau nécessaire, comme pour les rappels.
app.get('/api/penc/radio/stations/:id/current-program', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ program: null });
    const now = new Date();
    const nowMinutes = now.getUTCHours()*60 + now.getUTCMinutes();
    const wd = now.getUTCDay();
    const r = await _pgPool.query('SELECT * FROM penc_radio_programs WHERE station_id=$1',[req.params.id]);
    let current = null;
    for(const p of r.rows){
      if(p.days){ const list=String(p.days).split(',').map(x=>parseInt(x,10)); if(!list.includes(wd)) continue; }
      const startM = p.start_hour*60+p.start_minute, endM = p.end_hour*60+p.end_minute;
      const inRange = startM <= endM ? (nowMinutes>=startM && nowMinutes<endM) : (nowMinutes>=startM || nowMinutes<endM); // gere les creneaux qui passent minuit
      if(inRange){ current = p; break; }
    }
    res.json({ program: current });
  }catch(e){ res.json({ program: null }); }
});
// ── Construction de la liste "habillée" (jingle + annonce + piste, pour chaque piste) — partagée
// entre le direct (ffmpeg) et le calcul "en ce moment" ci-dessous, pour ne jamais désynchroniser
// les deux. ──
async function _radBuildTrackList(stationId) {
  const station = (await _pgPool.query('SELECT jingle_url, jingle_duration_seconds FROM penc_radio_stations WHERE id=$1', [stationId])).rows[0];
  const rawTracks = (await _pgPool.query('SELECT * FROM penc_radio_playlist_tracks WHERE station_id=$1 ORDER BY sort_order, created_at', [stationId])).rows;
  const tracks = [];
  rawTracks.forEach(t => {
    if (station && station.jingle_url && station.jingle_duration_seconds > 0) tracks.push({ file_url: station.jingle_url, duration_seconds: station.jingle_duration_seconds, kind: 'jingle' });
    if (t.announcement_url && t.announcement_duration_seconds > 0) tracks.push({ file_url: t.announcement_url, duration_seconds: t.announcement_duration_seconds, kind: 'announcement', track: t });
    tracks.push(Object.assign({ kind: 'track' }, t));
  });
  const totalDuration = tracks.reduce((s, t) => s + (t.duration_seconds || 0), 0);
  return { station, rawTracks, tracks, totalDuration };
}
// ── Calcule ce qui devrait être "en ce moment" sur une station, à partir de l'horloge serveur —
// sans jamais démarrer ffmpeg (léger, appelable souvent par les auditeurs pour la barre de
// progression). Utilise exactement le même calcul que le direct, donc toujours cohérent avec lui. ──
async function _radComputeNowPlaying(stationId) {
  const { tracks, totalDuration } = await _radBuildTrackList(stationId);
  if (!tracks.length || totalDuration <= 0) return null;
  const elapsed = (Date.now() / 1000) % totalDuration;
  let acc = 0, current = null, offset = 0;
  for (let i = 0; i < tracks.length; i++) {
    const d = tracks[i].duration_seconds || 0;
    if (elapsed < acc + d) { current = tracks[i]; offset = elapsed - acc; break; }
    acc += d;
  }
  if (!current) return null;
  let track = current.kind === 'track' ? current : current.track;
  if (!track) {
    // Jingle générique (pas rattaché à une piste précise) : on annonce la piste qui arrive.
    const idx = tracks.indexOf(current);
    for (let i = idx; i < tracks.length; i++) { if (tracks[i].kind === 'track') { track = tracks[i]; break; } }
  }
  if (!track) return null;
  return {
    track_id: track.id, title: track.title, event_date: track.event_date, location: track.location, context_note: track.context_note,
    duration_seconds: track.duration_seconds,
    elapsed_seconds: current.kind === 'track' ? Math.round(offset) : 0,
    is_intro: current.kind !== 'track'
  };
}
app.get('/api/penc/radio/stations/:id/now-playing', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ now_playing: null });
    const np = await _radComputeNowPlaying(req.params.id);
    res.json({ now_playing: np });
  }catch(e){ res.json({ now_playing: null }); }
});
// ── Catalogue consultable d'une station (façon bibliothèque de podcasts) : uniquement les pistes
// prêtes (normalisées), avec un lien de lecture direct (pas via le flux /live) — permet à
// l'auditeur de choisir précisément un discours plutôt que d'attendre qu'il repasse. ──
app.get('/api/penc/radio/stations/:id/catalogue', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ tracks: [] });
    const r = await _pgPool.query(
      "SELECT id, title, duration_seconds, event_date, location, context_note, normalized_url, file_url FROM penc_radio_playlist_tracks WHERE station_id=$1 AND normalize_status='ready' ORDER BY event_date NULLS LAST, sort_order, created_at",
      [req.params.id]
    );
    const tracks = r.rows.map(t => ({ id:t.id, title:t.title, duration_seconds:t.duration_seconds, event_date:t.event_date, location:t.location, context_note:t.context_note, play_url:t.normalized_url || t.file_url }));
    res.json({ tracks });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Playlist en boucle (radio "maison") : liste de pistes jouées les unes après les autres,
// indéfiniment, comme une vraie station. ──
app.get('/api/penc/admin/radio/stations/:id/playlist', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ tracks: [] });
    const r = await _pgPool.query('SELECT * FROM penc_radio_playlist_tracks WHERE station_id=$1 ORDER BY sort_order, created_at',[req.params.id]);
    res.json({ tracks: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Lien YouTube : on extrait l'audio et on l'héberge nous-mêmes sur R2 — un lien de flux
// YouTube brut expire au bout de quelques heures, ce qui casserait la radio en boucle.
// Partagée entre l'ajout ET la modification d'une piste (avant, seule la modification n'avait
// pas cette étape, donc coller un nouveau lien YouTube en "Modifier" échouait systématiquement).
async function _radResolveYouTube(fileUrl, trackIdForKey){
  if(!/youtube\.com\/watch|youtu\.be\//.test(fileUrl)) return fileUrl;
  const ytdl = require('@distube/ytdl-core');
  if(!ytdl.validateURL(fileUrl)) throw new Error('Lien YouTube invalide');
  // En-têtes proches d'un vrai navigateur — sans ça YouTube bloque très vite les requêtes
  // du serveur avec une erreur 429 (trop de requêtes), les identifiant comme un robot.
  const ytdlOpts = { requestOptions: { headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8'
  } } };
  let info = null, lastErr = null;
  // Jusqu'à 4 tentatives avec des délais croissants — un 429 YouTube est un vrai cooldown
  // de rate-limit (pas juste un raté ponctuel), 2-4s ne suffisent presque jamais à passer.
  const _ytDelays = [5000, 15000, 30000];
  for(let attempt = 1; attempt <= 4; attempt++){
    try{ info = await ytdl.getInfo(fileUrl, ytdlOpts); break; }
    catch(_gi){ lastErr = _gi; console.error('[radio-playlist] tentative ' + attempt + '/4 échouée:', _gi.message); if(attempt < 4) await new Promise(r => setTimeout(r, _ytDelays[attempt - 1])); }
  }
  if(!info) throw lastErr || new Error('extraction impossible après 4 tentatives');
  console.log('[radio-playlist] extraction audio YouTube en cours:', fileUrl);
  // Écrit directement sur disque au fil de l'eau — JAMAIS tout en mémoire. Un discours de
  // plusieurs heures peut peser plusieurs centaines de Mo ; les accumuler entièrement en RAM
  // avant l'upload (comme avant) risquait de faire déborder la mémoire du serveur — partagée
  // avec la messagerie Penc — et provoquer exactement le genre de plantage déjà vécu par le passé.
  const fs = require('fs'), os = require('os'), pathMod = require('path');
  const tmpPath = pathMod.join(os.tmpdir(), 'radyt_' + trackIdForKey + '_' + Date.now() + '.m4a');
  const audioStream = ytdl.downloadFromInfo(info, Object.assign({ filter:'audioonly', quality:'highestaudio' }, ytdlOpts));
  try{
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpPath);
      audioStream.pipe(file);
      audioStream.on('error', (e) => { file.close(); reject(e); });
      file.on('error', reject);
      file.on('finish', () => file.close(resolve));
    });
    const key = 'penc/radio-yt/' + trackIdForKey + '_' + Date.now() + '.m4a';
    const url = await r2PutFile(key, tmpPath, 'audio/mp4'); // upload en flux, toujours pas de RAM
    console.log('[radio-playlist] audio YouTube extrait et hébergé sur R2:', url);
    return url;
  } finally {
    try{ fs.unlinkSync(tmpPath); }catch(_ul){}
  }
}
app.post('/api/penc/admin/radio/stations/:id/playlist', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const title = String((req.body && req.body.title) || '').trim().slice(0,120);
    const rawUrl = String((req.body && req.body.file_url) || '').trim();
    if(!title || !rawUrl) return res.status(400).json({ error:'Titre et URL du fichier requis' });
    // Piège fréquent détecté tout de suite (rapide, pas besoin d'attendre le traitement complet).
    if(/\/embed\/|player\.cloudinary\.com|player\.vimeo\.com/.test(rawUrl)){
      return res.status(400).json({ error:'Ce lien pointe vers un lecteur intégré, pas vers le fichier audio direct. Sur Cloudinary : ouvre le fichier dans la médiathèque puis "Copy URL" (le lien doit finir par .mp3, .m4a ou .wav).' });
    }
    const eventDate = (req.body && req.body.event_date) ? String(req.body.event_date).slice(0,10) : null;
    const location = (req.body && req.body.location) ? String(req.body.location).trim().slice(0,120) : null;
    const contextNote = (req.body && req.body.context_note) ? String(req.body.context_note).trim().slice(0,500) : null;
    const maxOrder = await _pgPool.query('SELECT COALESCE(MAX(sort_order),0) AS m FROM penc_radio_playlist_tracks WHERE station_id=$1',[req.params.id]);
    const id = 'rtrk_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    // Insertion IMMÉDIATE avec durée=0 et statut 'pending' — l'admin n'attend plus l'extraction
    // YouTube (jusqu'à ~50s de retries), la détection de durée, ni la génération de l'annonce
    // vocale : tout ça part en arrière-plan juste après. Avant, ces 3 étapes bloquaient la
    // réponse HTTP l'une après l'autre, d'où la lenteur ressentie à l'ajout.
    await _pgPool.query(
      'INSERT INTO penc_radio_playlist_tracks(id,station_id,title,file_url,duration_seconds,sort_order,normalize_status,event_date,location,context_note) VALUES($1,$2,$3,$4,0,$5,\'pending\',$6,$7,$8)',
      [id, req.params.id, title, rawUrl, (parseInt(maxOrder.rows[0].m,10)||0)+1, eventDate, location, contextNote]
    );
    res.json({ success:true, id, processing:true });
    _radEnqueueProcess(() => _radProcessNewTrackFull(id, req.params.id, title, rawUrl));
  }catch(e){ console.error('playlist add:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.delete('/api/penc/admin/radio/playlist/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ success:true });
    const t = await _pgPool.query('SELECT announcement_url FROM penc_radio_playlist_tracks WHERE id=$1',[req.params.id]);
    await _pgPool.query('DELETE FROM penc_radio_playlist_tracks WHERE id=$1',[req.params.id]);
    if(t.rows[0] && t.rows[0].announcement_url && t.rows[0].announcement_url.indexOf(R2_PUBLIC) === 0){
      try{ await r2DeleteObject(t.rows[0].announcement_url.slice(R2_PUBLIC.length + 1)); }catch(_rd){}
    }
    res.json({ success:true });
  }
  catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Modifier une piste existante (titre et/ou lien). Si le lien change, on réinitialise le statut
// de normalisation et on relance le pré-traitement en arrière-plan (nouvelle durée détectée).
app.patch('/api/penc/admin/radio/playlist/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const cur = await _pgPool.query('SELECT * FROM penc_radio_playlist_tracks WHERE id=$1',[req.params.id]);
    if(!cur.rows.length) return res.status(404).json({ error:'Piste introuvable' });
    const track = cur.rows[0];
    const title = String((req.body && req.body.title) || track.title).trim().slice(0,120);
    const fileUrl = String((req.body && req.body.file_url) || track.file_url).trim();
    if(!title || !fileUrl) return res.status(400).json({ error:'Titre et URL du fichier requis' });
    const urlChanged = fileUrl !== track.file_url;
    const eventDate = (req.body && 'event_date' in req.body) ? (req.body.event_date ? String(req.body.event_date).slice(0,10) : null) : track.event_date;
    const location = (req.body && 'location' in req.body) ? (req.body.location ? String(req.body.location).trim().slice(0,120) : null) : track.location;
    const contextNote = (req.body && 'context_note' in req.body) ? (req.body.context_note ? String(req.body.context_note).trim().slice(0,500) : null) : track.context_note;
    // Métadonnées + titre appliqués tout de suite (rapide). Si le lien change, on repart sur le
    // même pipeline complet en arrière-plan que pour un ajout — pas d'attente ici non plus.
    await _pgPool.query(
      'UPDATE penc_radio_playlist_tracks SET title=$1, file_url=$2, event_date=$3, location=$4, context_note=$5'
      + (urlChanged ? ", duration_seconds=0, normalized_url=NULL, normalize_status='pending', normalize_error=NULL" : '')
      + ' WHERE id=$6',
      [title, fileUrl, eventDate, location, contextNote, req.params.id]
    );
    if(urlChanged){
      res.json({ success:true, renormalizing:true });
      _radEnqueueProcess(() => _radProcessNewTrackFull(req.params.id, track.station_id, title, fileUrl));
      return;
    }
    res.json({ success:true, renormalizing:false });
  }catch(e){ console.error('playlist patch:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// Réordonner les pistes d'une station : reçoit la liste complète des IDs dans le nouvel ordre
// souhaité et réécrit sort_order en conséquence (façon "glisser-déposer" côté client, même si
// l'UI utilise de simples flèches haut/bas plutôt qu'un vrai drag pour rester simple et fiable).
app.patch('/api/penc/admin/radio/stations/:id/playlist/reorder', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const order = Array.isArray(req.body && req.body.track_ids) ? req.body.track_ids : null;
    if(!order || !order.length) return res.status(400).json({ error:'Liste d\u2019ordre requise' });
    await Promise.all(order.map((trackId, i) =>
      _pgPool.query('UPDATE penc_radio_playlist_tracks SET sort_order=$1 WHERE id=$2 AND station_id=$3', [i, trackId, req.params.id])
    ));
    res.json({ success:true });
  }catch(e){ console.error('playlist reorder:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// Jingle de la station ("Vous écoutez X sur DeglouFM de Penc...") — inséré automatiquement
// avant CHAQUE piste par le flux en boucle, comme un vrai habillage radio.
app.post('/api/penc/admin/radio/stations/:id/jingle', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const url = String((req.body && req.body.jingle_url) || '').trim();
    if(!url){
      await _pgPool.query('UPDATE penc_radio_stations SET jingle_url=NULL, jingle_duration_seconds=0 WHERE id=$1',[req.params.id]);
      return res.json({ success:true, removed:true });
    }
    if(/\/embed\/|player\.cloudinary\.com|player\.vimeo\.com|youtube\.com\/watch|youtu\.be\//.test(url)){
      return res.status(400).json({ error:'Ce lien pointe vers un lecteur intégré, pas vers le fichier audio direct.' });
    }
    let duration = 0;
    try{ const meta = await _ffprobeMeta(url, 10000); duration = Math.round((meta && meta.format && meta.format.duration) || 0); }
    catch(_pf){ return res.status(400).json({ error:'Impossible de lire ce fichier audio (' + _pf.message + ') — vérifie le lien direct.' }); }
    if(!duration || duration < 1) return res.status(400).json({ error:'Durée introuvable pour ce fichier' });
    await _pgPool.query('UPDATE penc_radio_stations SET jingle_url=$1, jingle_duration_seconds=$2 WHERE id=$3',[url, duration, req.params.id]);
    res.json({ success:true, duration_seconds: duration });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Flux audio public en boucle infinie — c'est CETTE url qu'on colle comme "URL du flux" de
// la station. Pas de pencAuth : un lecteur <audio> ne peut pas envoyer de jeton, exactement
// comme n'importe quel flux radio classique (public par nature). La position dans la boucle est
// calculée à partir de l'heure serveur, pour que quiconque se connecte tombe "en direct" au bon
// endroit de la playlist, comme une vraie radio. ──
// ═══ Diffusion partagée : UN SEUL processus ffmpeg par station, peu importe le nombre
// d'auditeurs — leurs connexions se branchent toutes sur le même flux (comme une vraie radio
// Icecast), au lieu d'un processus ffmpeg par personne qui saturait le CPU (un seul cœur sur
// le plan Standard) dès que plusieurs personnes écoutaient en même temps. ═══
const { PassThrough } = require('stream');
const _radBroadcasts = {}; // stationId -> { hub: PassThrough, cmd, listenerCount, stopTimer }

function _radStopBroadcast(stationId) {
  const b = _radBroadcasts[stationId];
  if (!b) return;
  try { clearTimeout(b.stopTimer); } catch (_t) {}
  try { b.cmd.kill('SIGKILL'); } catch (_k) {}
  try { b.hub.end(); } catch (_h) {}
  delete _radBroadcasts[stationId];
  console.log('[radio-live] diffusion arrêtée (plus aucun auditeur) — station=' + stationId);
}

async function _radDownloadToFile(url, destPath, stallTimeoutMs) {
  const https = require('https');
  const fs = require('fs');
  // Timeout de BLOCAGE (pas de durée totale) : réinitialisé à chaque paquet reçu. Un discours
  // de plusieurs heures peut légitimement prendre du temps sur une connexion modeste — seule
  // une vraie connexion morte (aucune donnée pendant stallTimeoutMs) doit faire échouer.
  stallTimeoutMs = stallTimeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let settled = false;
    let stallTimer = null;
    function onStall() {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch (_d) {}
      file.close(() => {}); fs.unlink(destPath, () => {});
      reject(new Error('téléchargement bloqué (aucune donnée reçue depuis ' + Math.round(stallTimeoutMs / 1000) + 's) — connexion probablement morte'));
    }
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        // Suivre une redirection simple (R2/CDN en font parfois une).
        if (settled) return;
        settled = true; clearTimeout(stallTimer);
        file.close(); fs.unlink(destPath, () => {});
        return _radDownloadToFile(resp.headers.location, destPath, stallTimeoutMs).then(resolve).catch(reject);
      }
      if (resp.statusCode !== 200) {
        if (settled) return;
        settled = true; clearTimeout(stallTimer);
        file.close(); fs.unlink(destPath, () => {}); return reject(new Error('HTTP ' + resp.statusCode));
      }
      resp.on('data', () => { clearTimeout(stallTimer); stallTimer = setTimeout(onStall, stallTimeoutMs); });
      resp.pipe(file);
      file.on('finish', () => { if (settled) return; settled = true; clearTimeout(stallTimer); file.close(() => resolve(destPath)); });
    });
    stallTimer = setTimeout(onStall, stallTimeoutMs);
    req.on('error', (err) => { if (settled) return; settled = true; clearTimeout(stallTimer); file.close(); fs.unlink(destPath, () => {}); reject(err); });
  });
}
let _radFfmpegPath = 'ffmpeg';
try { _radFfmpegPath = require('@ffmpeg-installer/ffmpeg').path; } catch (_fpn) {}
// Normalise une piste locale vers un MP3 standard (même codec/débit/fréquence pour toutes les
// pistes — indispensable pour le démuxeur concat). timeoutMs généreux par défaut : un discours
// de plusieurs heures peut prendre du temps à réencoder.
async function _radNormalizeTrack(srcPath, outPath, timeoutMs) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile(_radFfmpegPath, ['-y', '-i', srcPath, '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '96k', outPath], { timeout: timeoutMs || 600000, maxBuffer: 1024 * 1024 * 20 }, (err) => {
      if (err) return reject(err);
      resolve(outPath);
    });
  });
}
// ── Cache disque local des pistes déjà téléchargées/normalisées : évite de tout refaire à
// CHAQUE redémarrage de diffusion (dernier auditeur parti puis quelqu'un revient). Survit tant
// que le processus Render tourne (perdu uniquement à un redéploiement/redémarrage du service). ──
function _radCacheDir() {
  const os = require('os'), pathMod = require('path'), fs = require('fs');
  const d = pathMod.join(os.tmpdir(), 'radcache');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_c) {}
  return d;
}
function _radCacheKey(url) { return require('crypto').createHash('md5').update(String(url)).digest('hex'); }
// ── Pré-normalisation en arrière-plan : appelée juste après l'ajout d'une piste à la playlist
// (ou au rattrapage démarrage serveur). Télécharge + encode UNE FOIS, hors du chemin d'écoute,
// et publie le résultat sur R2 — le direct n'a plus qu'à télécharger un fichier déjà prêt. ──
// ── Téléchargement + normalisation UNE FOIS (piste déjà résolue : file_url direct connu, durée
// déjà en base) — publie sur R2 et marque normalize_status='ready'. Utilisée en interne par
// _radProcessNewTrackFull, et par le rattrapage pour les anciennes pistes déjà résolues. ──
async function _radDownloadAndNormalizeOnly(trackId, fileUrl, stationId) {
  const fs = require('fs'), os = require('os'), pathMod = require('path');
  const workDir = pathMod.join(os.tmpdir(), 'radprenorm_' + trackId);
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_rm) {}
  fs.mkdirSync(workDir, { recursive: true });
  try {
    if (_pgPool) { try { await _pgPool.query("UPDATE penc_radio_playlist_tracks SET normalize_status='running' WHERE id=$1", [trackId]); } catch (_us) {} }
    const ext = (String(fileUrl).match(/\.(mp3|m4a|wav|webm|mp4)(\?|$)/i) || [, 'mp3'])[1].toLowerCase();
    const rawPath = pathMod.join(workDir, 'raw.' + ext);
    const normPath = pathMod.join(workDir, 'norm.mp3');
    console.log('[radio-playlist] traitement démarré — piste=' + trackId + ' station=' + stationId);
    await _radDownloadToFile(fileUrl, rawPath, 60000);
    const sizeMo = Math.round((fs.statSync(rawPath).size || 0) / 1024 / 1024);
    console.log('[radio-playlist] téléchargement terminé (' + sizeMo + ' Mo) — encodage en cours — piste=' + trackId);
    // Timeout d'encodage généreux (jusqu'à 45 min) pour les très longs discours (2h+).
    await _radNormalizeTrack(rawPath, normPath, 2700000);
    const key = 'penc/radio-normalized/' + trackId + '.mp3';
    const url = await r2PutFile(key, normPath, 'audio/mpeg');
    if (_pgPool) await _pgPool.query('UPDATE penc_radio_playlist_tracks SET normalized_url=$1, normalize_status=$2, normalize_error=NULL WHERE id=$3', [url, 'ready', trackId]);
    // Alimente aussi le cache disque local tout de suite : le tout premier auditeur n'aura même
    // pas besoin de retélécharger la version normalisée depuis R2.
    try { fs.copyFileSync(normPath, pathMod.join(_radCacheDir(), _radCacheKey(url) + '.mp3')); } catch (_cc) {}
    try { const mu = process.memoryUsage(); console.log('[radio-playlist] traitement terminé — piste=' + trackId + ' RAM: ' + Math.round(mu.rss / 1024 / 1024) + ' Mo'); } catch (_ml2) { console.log('[radio-playlist] traitement terminé — piste=' + trackId); }
  } catch (e) {
    console.error('[radio-playlist] traitement ÉCHEC — piste=' + trackId + ':', e.message);
    if (_pgPool) { try { await _pgPool.query('UPDATE penc_radio_playlist_tracks SET normalize_status=$1, normalize_error=$2 WHERE id=$3', ['failed', String(e.message).slice(0, 300), trackId]); } catch (_ue) {} }
    throw e;
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_rmf) {}
  }
}
// ── Pipeline complet pour une piste TOUT JUSTE ajoutée : la réponse HTTP à l'admin est déjà
// partie (ajout quasi-instantané) — ceci tourne entièrement en arrière-plan. Résout YouTube si
// besoin, détecte la durée, génère l'annonce vocale, PUIS télécharge+normalise. Tout échec est
// enregistré sur la piste (normalize_status='failed' + message) plutôt que silencieusement perdu. ──
// ── File d'attente séquentielle pour tout traitement lourd de piste radio (téléchargement +
// encodage, extraction YouTube) : une seule tâche à la fois, jamais en parallèle. Avant ça,
// ajouter plusieurs discours coup sur coup lançait autant de traitements simultanés — chacun
// pouvant consommer beaucoup de RAM (extraction YouTube, ffmpeg) — sur un serveur qui partage sa
// mémoire avec la messagerie Penc. Une tâche qui échoue n'empêche pas les suivantes de tourner. ──
let _radProcessQueue = Promise.resolve();
function _radEnqueueProcess(taskFn) {
  const run = () => taskFn().catch(e => console.error('[radio-playlist] tâche en file échouée:', e.message));
  _radProcessQueue = _radProcessQueue.then(run, run); // continue même si la tâche précédente a levé une erreur
  return _radProcessQueue;
}
async function _radProcessNewTrackFull(trackId, stationId, title, rawUrl) {
  try {
    if (_pgPool) { try { await _pgPool.query("UPDATE penc_radio_playlist_tracks SET normalize_status='running' WHERE id=$1", [trackId]); } catch (_us) {} }
    let fileUrl = rawUrl;
    try { fileUrl = await _radResolveYouTube(fileUrl, trackId); }
    catch (_yt) { throw new Error('YouTube : ' + _yt.message + ' — réessaie dans quelques minutes, ou utilise un lien direct.'); }
    if (/\/embed\/|player\.cloudinary\.com|player\.vimeo\.com/.test(fileUrl)) {
      throw new Error('Ce lien pointe vers un lecteur intégré, pas vers le fichier audio direct.');
    }
    let duration = 0;
    try { const meta = await _ffprobeMeta(fileUrl, 30000); duration = Math.round((meta && meta.format && meta.format.duration) || 0); }
    catch (_pf) { throw new Error('Impossible de lire ce fichier audio — vérifie que le lien est direct et accessible publiquement.'); }
    if (!duration || duration < 1) throw new Error('Durée introuvable pour ce fichier');
    // Annonce vocale automatique du titre ("Vous écoutez maintenant : <titre>") — générée une
    // seule fois à l'ajout, puis réutilisée en boucle (pas régénérée à chaque diffusion).
    let announcementUrl = null, announcementDuration = 0;
    try {
      const ann = await _generateAndStoreTTS('Vous écoutez maintenant : ' + title, 'penc/radio-tts/' + stationId);
      announcementUrl = ann.url; announcementDuration = ann.duration_seconds;
    } catch (_tts) { console.error('TTS annonce (non bloquant):', _tts.message); }
    if (_pgPool) await _pgPool.query(
      'UPDATE penc_radio_playlist_tracks SET file_url=$1, duration_seconds=$2, announcement_url=$3, announcement_duration_seconds=$4 WHERE id=$5',
      [fileUrl, duration, announcementUrl, announcementDuration, trackId]
    );
    await _radDownloadAndNormalizeOnly(trackId, fileUrl, stationId);
  } catch (e) {
    console.error('[radio-playlist] traitement complet ÉCHEC — piste=' + trackId + ':', e.message);
    if (_pgPool) { try { await _pgPool.query('UPDATE penc_radio_playlist_tracks SET normalize_status=$1, normalize_error=$2 WHERE id=$3', ['failed', String(e.message).slice(0, 300), trackId]); } catch (_ue) {} }
  }
}
// ── Rattrapage au démarrage serveur : traite toute piste jamais finalisée (ancienne piste, ou
// tentative précédente échouée/interrompue par un redéploiement). Séquentiel, pas en parallèle,
// pour ne pas saturer le seul cœur CPU disponible. Une piste avec durée déjà connue n'a besoin
// que du téléchargement+normalisation ; une piste neuve (durée=0) repart sur le pipeline complet. ──
async function _radBackfillNormalization() {
  try {
    if (!_pgPool) return;
    const r = await _pgPool.query("SELECT id, file_url, station_id, title, duration_seconds FROM penc_radio_playlist_tracks WHERE normalized_url IS NULL AND (normalize_status IS NULL OR normalize_status <> 'running') ORDER BY created_at");
    if (!r.rows.length) return;
    console.log('[radio-playlist] rattrapage : ' + r.rows.length + ' piste(s) à traiter');
    for (const t of r.rows) {
      try {
        if (t.duration_seconds > 0) await _radEnqueueProcess(() => _radDownloadAndNormalizeOnly(t.id, t.file_url, t.station_id));
        else await _radEnqueueProcess(() => _radProcessNewTrackFull(t.id, t.station_id, t.title, t.file_url));
      }
      catch (_bf) { console.error('[radio-playlist] rattrapage échec — piste=' + t.id + ':', _bf.message); }
    }
  } catch (e) { console.error('[radio-playlist] rattrapage erreur:', e.message); }
}
setTimeout(_radBackfillNormalization, 20000);

async function _radStartBroadcast(stationId) {
  const { rawTracks, tracks, totalDuration } = await _radBuildTrackList(stationId);
  if (!rawTracks.length || totalDuration <= 0) return null;

  const fs = require('fs'), os = require('os'), pathMod = require('path');
  // Correctif SIGSEGV : passer des URLs HTTPS directement dans la liste du démuxeur concat
  // fait planter cette version de ffmpeg (bug bas niveau, reproductible à chaque fois, avec ou
  // sans -ss). On travaille donc uniquement avec des chemins de fichiers locaux.
  const workDir = pathMod.join(os.tmpdir(), 'radwork_' + stationId);
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_rm) {}
  fs.mkdirSync(workDir, { recursive: true });
  const localTracks = []; // { path, duration } — duration de la piste réellement mise en cache
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    // Priorité à la version déjà normalisée (encodée une fois à l'ajout, stockée sur R2) — le
    // direct n'a alors qu'à la télécharger, sans jamais relancer ffmpeg dessus.
    const sourceUrl = t.normalized_url || t.file_url;
    const cachePath = pathMod.join(_radCacheDir(), _radCacheKey(sourceUrl) + '.mp3');
    try {
      if (fs.existsSync(cachePath) && (fs.statSync(cachePath).size || 0) > 2048) {
        // Déjà téléchargée/normalisée lors d'une diffusion précédente sur cette instance — pas
        // besoin de tout refaire à chaque redémarrage (dernier auditeur parti puis quelqu'un
        // revient) : c'est ÇA qui bloquait le direct plusieurs minutes sur les longs discours.
        localTracks.push({ path: cachePath, duration: t.duration_seconds || 0 });
        continue;
      }
      const ext = (String(sourceUrl).match(/\.(mp3|m4a|wav|webm|mp4)(\?|$)/i) || [, 'mp3'])[1].toLowerCase();
      const dest = pathMod.join(workDir, 'track_' + i + '_raw.' + ext);
      // Timeout de BLOCAGE (60s sans donnée), pas de plafond sur la durée totale — un discours
      // de 2h+ peut légitimement prendre du temps sur une connexion modeste.
      await _radDownloadToFile(sourceUrl, dest, 60000);
      const sizeKo = Math.round((fs.statSync(dest).size || 0) / 1024);
      if (sizeKo < 2) throw new Error('fichier suspicieusement petit (' + sizeKo + ' Ko), probablement une erreur au téléchargement');
      if (t.normalized_url) {
        // Déjà au bon format (encodé lors de l'ajout) — pas besoin de repasser par ffmpeg ici.
        fs.renameSync(dest, cachePath);
      } else {
        // Piste jamais pré-normalisée (ancienne piste, ou pré-traitement encore en cours/échoué) :
        // on retombe sur l'ancien chemin — transcodage à la volée, timeout généreux (20 min).
        await _radNormalizeTrack(dest, cachePath, 1200000);
        try { fs.unlinkSync(dest); } catch (_ud) {}
      }
      localTracks.push({ path: cachePath, duration: t.duration_seconds || 0 });
    } catch (_dl) { console.error('[radio-live] piste ignorée (' + (t.title || 'sans titre') + '):', sourceUrl, '—', _dl.message); }
  }
  if (!localTracks.length) { console.error('[radio-live] aucune piste téléchargeable pour station=' + stationId); return null; }

  // ── Synchronisation horloge serveur : calcule où la diffusion "devrait en être" en ce moment,
  // comme une vraie radio 24h/24 — pour que tout le monde tombe au même endroit en se connectant,
  // qu'il soit le premier auditeur depuis des heures ou le dixième. On fait tourner ffmpeg
  // UNIQUEMENT quand il y a au moins un auditeur (pas de processus 24/7 permanent, qui avait
  // causé l'incident mémoire du 21/07) ; la rotation ci-dessous donne exactement le même résultat
  // perçu par l'auditeur — une infinité de cette liste réordonnée équivaut à la vraie playlist qui
  // aurait tourné sans interruption depuis toujours. ──
  const loopDuration = localTracks.reduce((s, x) => s + (x.duration || 0), 0);
  let startIdx = 0, seekOffset = 0;
  if (loopDuration > 0) {
    const elapsed = (Date.now() / 1000) % loopDuration;
    let acc = 0;
    for (let i = 0; i < localTracks.length; i++) {
      const d = localTracks[i].duration || 0;
      if (elapsed < acc + d) { startIdx = i; seekOffset = Math.max(0, elapsed - acc); break; }
      acc += d;
    }
  }
  const rotated = localTracks.slice(startIdx).concat(localTracks.slice(0, startIdx));

  const listFile = pathMod.join(workDir, 'playlist.txt');
  const listContent = rotated.map(x => "file '" + x.path.replace(/'/g, "'\\''") + "'").join('\n');
  fs.writeFileSync(listFile, listContent);

  const hub = new PassThrough();
  let ffmpegPath = 'ffmpeg';
  try { ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; } catch (_fp) {}
  const { spawn } = require('child_process');
  const args = [];
  if (seekOffset > 0.5) args.push('-ss', seekOffset.toFixed(2));
  args.push(
    '-stream_loop', '-1',
    '-f', 'concat', '-safe', '0',
    '-i', listFile,
    '-acodec', 'libmp3lame', '-b:a', '96k',
    '-vn',
    '-f', 'mp3',
    'pipe:1'
  );
  const cmd = spawn(ffmpegPath, args);
  cmd.stdout.pipe(hub);
  let _lastStderr = '';
  cmd.stderr.on('data', d => { const s = d.toString(); _lastStderr = (_lastStderr + s).slice(-2000); if (/error|Error|Invalid|No such|Unsupported|Unable/.test(s)) console.error('[radio-live ffmpeg]', s.trim().slice(0, 300)); });
  cmd.on('error', (err) => { console.error('[radio-live] ffmpeg spawn erreur:', err.message); _radStopBroadcast(stationId); });
  cmd.on('exit', (code, signal) => { console.log('[radio-live] ffmpeg terminé — station=' + stationId + ' code=' + code + ' signal=' + signal + ' | dernières lignes stderr:\n' + _lastStderr.split('\n').slice(-10).join('\n')); try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_rm2) {} _radStopBroadcast(stationId); });

  const b = { hub, cmd, listenerCount: 0, stopTimer: null };
  _radBroadcasts[stationId] = b;
  try { const mu = process.memoryUsage(); console.log('[radio-live] nouvelle diffusion démarrée (pistes locales: ' + localTracks.length + '/' + tracks.length + ', position synchronisée à la piste #' + (startIdx + 1) + ' +' + Math.round(seekOffset) + 's) — station=' + stationId + ' RAM: ' + Math.round(mu.rss / 1024 / 1024) + ' Mo'); } catch (_ml) {}
  return b;
}

app.get('/api/penc/radio/live/:stationId.mp3', async (req, res) => {
  // Si quelqu'un ouvre CE lien directement dans son navigateur (au lieu que ce soit l'app Penc
  // qui le charge en arrière-plan pour jouer le son), on le redirige vers la page de la station
  // dans Penc plutôt que de lui montrer un lecteur audio brut. Un vrai navigateur qui NAVIGUE
  // vers une URL envoie "text/html" en tête de son en-tête Accept ; un élément <audio> qui
  // charge juste un fichier ne le fait presque jamais — c'est ce qui permet de distinguer les
  // deux cas sans casser la lecture réelle dans l'app.
  const acceptHeader = String(req.headers['accept'] || '');
  if (acceptHeader.split(',')[0].trim() === 'text/html') {
    return res.redirect(302, 'https://penc-messagerie.com/messager?radio=' + encodeURIComponent(req.params.stationId));
  }
  // ═══ COUPE-CIRCUIT TEMPORAIRE ═══ (repasser à true en cas de nouvel incident mémoire)
  if (RAD_LIVE_STREAM_DISABLED) {
    res.status(503).setHeader('Retry-After', '3600');
    return res.end();
  }
  try {
    if (!_pgPool) return res.status(503).end();
    const stationId = req.params.stationId;
    let b = _radBroadcasts[stationId];
    if (!b) {
      b = await _radStartBroadcast(stationId);
      if (!b) return res.status(404).end();
    } else if (b.stopTimer) {
      // Un auditeur revient juste après le départ du dernier — on annule l'arrêt programmé.
      clearTimeout(b.stopTimer); b.stopTimer = null;
    }
    // Garde-fou global sur le nombre total d'auditeurs (toutes stations confondues), pour
    // éviter un afflux massif imprévu — n'affecte PAS le nombre de processus ffmpeg (toujours 1
    // par station), seulement la bande passante/connexions ouvertes.
    const totalListeners = Object.values(_radBroadcasts).reduce((s, x) => s + x.listenerCount, 0);
    if (totalListeners >= RAD_MAX_CONCURRENT_STREAMS) {
      res.status(503).setHeader('Retry-After', '15');
      return res.end();
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Transfer-Encoding', 'chunked');
    b.hub.pipe(res, { end: false });
    b.listenerCount++;
    req.on('close', () => {
      try { b.hub.unpipe(res); } catch (_u) {}
      b.listenerCount = Math.max(0, b.listenerCount - 1);
      if (b.listenerCount === 0 && !b.stopTimer) {
        // Petit délai de grâce (30s) avant d'arrêter réellement ffmpeg, pour absorber les
        // reconnexions rapides (changement d'écran, coupure réseau brève) sans redémarrer le
        // flux à chaque fois.
        b.stopTimer = setTimeout(() => { if (b.listenerCount === 0) _radStopBroadcast(stationId); }, 30000);
      }
    });
  } catch (e) { console.error('radio live stream ERREUR:', e.message, '\n', e.stack); try { res.status(500).end(); } catch (_e3) {} }
});
app.delete('/api/penc/admin/radio/stations/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    await _pgPool.query('DELETE FROM penc_radio_stations WHERE id=$1',[req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

// ── Suivi des sessions d'écoute (pour les statistiques) ──
app.post('/api/penc/radio/listen/start', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ id:null });
    const id = 'lsn_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_radio_listens(id,user_id,station_id) VALUES($1,$2,$3)',[id, req.pencUser.userId, req.body.station_id]);
    res.json({ id });
  }catch(e){ res.json({ id:null }); }
});
app.post('/api/penc/radio/listen/end', pencAuth, async (req, res) => {
  try{
    if(!_pgPool || !req.body.id) return res.json({ success:true });
    await _pgPool.query("UPDATE penc_radio_listens SET ended_at=NOW(), duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (NOW()-started_at))::int) WHERE id=$1 AND user_id=$2",[req.body.id, req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.json({ success:true }); }
});
// ── Pouls régulier envoyé par le client tant qu'il écoute : sert à fermer proprement une session
// si l'auditeur ferme l'app/le téléphone brutalement sans jamais appeler /listen/end (ce qui
// laissait des sessions "ouvertes" indéfiniment, sans heure de sortie — c'est ce que Papa Seny
// avait remarqué). ──
app.post('/api/penc/radio/listen/heartbeat', pencAuth, async (req, res) => {
  try{
    if(!_pgPool || !req.body.id) return res.json({ success:true });
    await _pgPool.query("UPDATE penc_radio_listens SET last_heartbeat=NOW() WHERE id=$1 AND user_id=$2 AND ended_at IS NULL",[req.body.id, req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.json({ success:true }); }
});
// ── Variante pour navigator.sendBeacon (fermeture d'onglet/app) : sendBeacon ne peut pas fixer
// d'en-tête Authorization, donc pas de pencAuth ici — le token est vérifié manuellement depuis
// le corps de la requête. Best-effort uniquement ; le pouls régulier + la fermeture automatique
// après 90s d'inactivité couvrent déjà le cas où ce beacon n'arrive jamais. ──
app.post('/api/penc/radio/listen/beacon', async (req, res) => {
  try{
    if(!_pgPool || !req.body || !req.body.id || !req.body.token) return res.json({ success:true });
    let userId;
    try{ userId = jwt_penc.verify(req.body.token, PENC_SECRET).userId; }catch(_jv){ return res.json({ success:true }); }
    await _pgPool.query("UPDATE penc_radio_listens SET last_heartbeat=NOW() WHERE id=$1 AND user_id=$2 AND ended_at IS NULL",[req.body.id, userId]);
    res.json({ success:true });
  }catch(e){ res.json({ success:true }); }
});
// ── Fermeture automatique des sessions abandonnées : si aucun pouls depuis 90s, on considère
// l'écoute terminée au moment du dernier pouls reçu (heure de sortie réelle, pas le moment de
// ce nettoyage). Tourne toutes les 60s. ──
async function _radCloseStaleListenSessions(){
  try{
    if(!_pgPool) return;
    await _pgPool.query(
      "UPDATE penc_radio_listens SET ended_at=last_heartbeat, duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (last_heartbeat-started_at))::int) WHERE ended_at IS NULL AND last_heartbeat < NOW() - INTERVAL '90 seconds'"
    );
  }catch(e){ console.error('[radio-listen] nettoyage sessions échoué:', e.message); }
}
setInterval(_radCloseStaleListenSessions, 60000);
// ── Vue admin : sessions d'écoute récentes d'une station, avec heure d'entrée ET de sortie —
// pour vérifier concrètement le suivi des auditeurs. ──
app.get('/api/penc/admin/radio/stations/:id/sessions', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ sessions: [] });
    const limit = Math.min(200, parseInt(req.query.limit,10) || 100);
    const r = await _pgPool.query(
      `SELECT l.id, l.user_id, u.full_name, u.username, l.started_at, l.ended_at, l.last_heartbeat,
              COALESCE(l.duration_seconds, GREATEST(0,EXTRACT(EPOCH FROM (COALESCE(l.ended_at, l.last_heartbeat, NOW())-l.started_at))::int)) AS duration_seconds,
              (l.ended_at IS NULL) AS still_open
       FROM penc_radio_listens l LEFT JOIN penc_users u ON u.id=l.user_id
       WHERE l.station_id=$1 ORDER BY l.started_at DESC LIMIT $2`,
      [req.params.id, limit]
    );
    res.json({ sessions: r.rows });
  }catch(e){ console.error('radio sessions:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// Signalement d'une station qui ne démarre pas — notifie directement les admins Penc.
app.post('/api/penc/radio/comments/:id/report', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const commentId = req.params.id;
    const uid = req.pencUser.userId;
    const cm = await _pgPool.query('SELECT content, user_id FROM penc_radio_comments WHERE id=$1',[commentId]);
    if(!cm.rows.length) return res.status(404).json({ error:'Commentaire introuvable' });
    const id = 'rcrep_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_radio_comment_reports(id,comment_id,user_id) VALUES($1,$2,$3)',[id, commentId, uid]);
    try{
      let reporter='Un utilisateur';
      try{ const u=await pgFindUser('id', uid); if(u) reporter=pencStrip(u).full_name||reporter; }catch(_ru){}
      for(const adminEmail of PENC_ADMIN_EMAILS){
        try{
          const au = await pgFindUser('email', adminEmail);
          if(au) await sendPencPush(au.id, { title:'💬 Signalement commentaire', body: reporter+' signale un commentaire : "'+String(cm.rows[0].content).slice(0,80)+'"', tag:'penc-comment-report' });
        }catch(_pu){}
      }
    }catch(_notif){}
    res.json({ success:true });
  }catch(e){ console.error('radio comment report:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Réactions rapides (façon story) : une seule réaction active par utilisateur et par station,
// remplacée si on retape une autre émoji. ──
const RAD_REACTION_EMOJIS = ['🔥','😂','❤️','👏','😮'];
app.get('/api/penc/radio/stations/:id/reactions', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ counts:{}, my_reaction:null });
    const r = await _pgPool.query('SELECT emoji, COUNT(*) AS n FROM penc_radio_station_reactions WHERE station_id=$1 GROUP BY emoji',[req.params.id]);
    const counts = {}; r.rows.forEach(row => { counts[row.emoji] = parseInt(row.n,10)||0; });
    const mine = await _pgPool.query('SELECT emoji FROM penc_radio_station_reactions WHERE station_id=$1 AND user_id=$2',[req.params.id, req.pencUser.userId]);
    res.json({ counts, my_reaction: mine.rows[0] ? mine.rows[0].emoji : null });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/stations/:id/reaction', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const emoji = String((req.body && req.body.emoji) || '');
    if(!RAD_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ error:'Émoji invalide' });
    const uid = req.pencUser.userId, stationId = req.params.id;
    const mine = await _pgPool.query('SELECT emoji FROM penc_radio_station_reactions WHERE station_id=$1 AND user_id=$2',[stationId, uid]);
    let myReaction;
    if (mine.rows.length && mine.rows[0].emoji === emoji) {
      await _pgPool.query('DELETE FROM penc_radio_station_reactions WHERE station_id=$1 AND user_id=$2',[stationId, uid]);
      myReaction = null;
    } else {
      await _pgPool.query(
        `INSERT INTO penc_radio_station_reactions(station_id,user_id,emoji) VALUES($1,$2,$3)
         ON CONFLICT (station_id,user_id) DO UPDATE SET emoji=$3, created_at=NOW()`,
        [stationId, uid, emoji]
      );
      myReaction = emoji;
    }
    const r = await _pgPool.query('SELECT emoji, COUNT(*) AS n FROM penc_radio_station_reactions WHERE station_id=$1 GROUP BY emoji',[stationId]);
    const counts = {}; r.rows.forEach(row => { counts[row.emoji] = parseInt(row.n,10)||0; });
    try{ io.to('radio:'+stationId).emit('radio:reactions', { station_id: stationId, counts }); }catch(_e3){}
    res.json({ success:true, counts, my_reaction: myReaction });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Statistiques d'écoute personnelles. ──
app.get('/api/penc/radio/my-stats', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ total_seconds:0, month_seconds:0, distinct_stations:0, favorite:null });
    const uid = req.pencUser.userId;
    const tot = await _pgPool.query('SELECT COALESCE(SUM(duration_seconds),0) AS s, COUNT(DISTINCT station_id) AS n FROM penc_radio_listens WHERE user_id=$1',[uid]);
    const month = await _pgPool.query("SELECT COALESCE(SUM(duration_seconds),0) AS s FROM penc_radio_listens WHERE user_id=$1 AND started_at > date_trunc('month', NOW())",[uid]);
    const fav = await _pgPool.query(
      `SELECT s.name, SUM(l.duration_seconds) AS sec FROM penc_radio_listens l JOIN penc_radio_stations s ON s.id=l.station_id
       WHERE l.user_id=$1 GROUP BY s.id, s.name ORDER BY sec DESC LIMIT 1`, [uid]
    );
    res.json({
      total_seconds: parseInt(tot.rows[0].s,10)||0,
      distinct_stations: parseInt(tot.rows[0].n,10)||0,
      month_seconds: parseInt(month.rows[0].s,10)||0,
      favorite: fav.rows[0] ? fav.rows[0].name : null
    });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Rappels programmés ("me rappeler d'écouter X à HH:MM"). L'heure serveur (UTC) coïncide
// avec l'heure du Sénégal (GMT+0), donc pas de conversion de fuseau nécessaire. ──
app.get('/api/penc/radio/reminders', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ reminders:[] });
    const r = await _pgPool.query(
      `SELECT r.*, s.name AS station_name, s.logo_url FROM penc_radio_reminders r
       JOIN penc_radio_stations s ON s.id=r.station_id WHERE r.user_id=$1 AND r.active=true ORDER BY r.hour, r.minute`,
      [req.pencUser.userId]
    );
    res.json({ reminders: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/reminders', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { station_id, hour, minute, days } = req.body || {};
    const h = parseInt(hour,10), m = parseInt(minute,10);
    if(!station_id || isNaN(h) || h<0 || h>23 || isNaN(m) || m<0 || m>59) return res.status(400).json({ error:'Paramètres invalides' });
    const id = 'rrem_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_radio_reminders(id,user_id,station_id,hour,minute,days) VALUES($1,$2,$3,$4,$5,$6)',
      [id, req.pencUser.userId, station_id, h, m, (days ? String(days) : null)]);
    res.json({ success:true, id });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.delete('/api/penc/radio/reminders/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    await _pgPool.query('DELETE FROM penc_radio_reminders WHERE id=$1 AND user_id=$2',[req.params.id, req.pencUser.userId]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Vérifie chaque minute les rappels dus et envoie une notification push.
// Fenêtre de rattrapage de 2h : si le serveur dormait (Render Free) pile à l'heure prévue,
// le rappel n'est pas perdu — il part dès le réveil du serveur, tant qu'on est encore proche
// de l'heure demandée le même jour.
setInterval(async function(){
  try{
    if(!_pgPool) return;
    const now = new Date();
    const h = now.getUTCHours(), m = now.getUTCMinutes(), wd = now.getUTCDay();
    const today = now.toISOString().slice(0,10);
    const nowMinutes = h * 60 + m;
    const due = await _pgPool.query(
      `SELECT r.*, s.name AS station_name FROM penc_radio_reminders r JOIN penc_radio_stations s ON s.id=r.station_id
       WHERE r.active=true AND (r.last_sent_date IS NULL OR r.last_sent_date<>$1)`,
      [today]
    );
    for(const rem of due.rows){
      if(rem.days){ const list=String(rem.days).split(',').map(x=>parseInt(x,10)); if(!list.includes(wd)) continue; }
      const remMinutes = rem.hour * 60 + rem.minute;
      const delta = nowMinutes - remMinutes;
      if(delta < 0 || delta > 120) continue; // pas encore l'heure, ou trop tard pour rattraper aujourd'hui
      try{ await sendPencPush(rem.user_id, { title:'🔔 Rappel DeglouFM', body:'C\u2019est l\u2019heure d\u2019écouter '+rem.station_name+' !', tag:'radio-reminder-'+rem.id, url:'/messager?radio='+rem.station_id }); }catch(_sp){}
      try{ await _pgPool.query('UPDATE penc_radio_reminders SET last_sent_date=$1 WHERE id=$2',[today, rem.id]); }catch(_up){}
    }
  }catch(e){}
}, 60000);
app.post('/api/penc/radio/report', pencAuth, async (req, res) => {
  try{
    const station_id = String(req.body.station_id||'').trim();
    if(!station_id) return res.status(400).json({ error:'station_id requis' });
    let stationName = station_id;
    try{
      if(_pgPool){
        const id = 'rrep_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
        await _pgPool.query('INSERT INTO penc_radio_reports(id,station_id,user_id) VALUES($1,$2,$3)',[id, station_id, req.pencUser.userId]);
        const sr = await _pgPool.query('SELECT name FROM penc_radio_stations WHERE id=$1',[station_id]);
        if(sr.rows[0]) stationName = sr.rows[0].name;
      }
    }catch(_dbr){}
    try{
      let reporter='Un utilisateur';
      try{ const u=await pgFindUser('id', req.pencUser.userId); if(u) reporter=pencStrip(u).full_name||reporter; }catch(_ru){}
      for(const adminEmail of PENC_ADMIN_EMAILS){
        try{
          const au = await pgFindUser('email', adminEmail);
          if(au) await sendPencPush(au.id, { title:'📻 Signalement radio', body: reporter+' signale que "'+stationName+'" ne démarre pas.', tag:'penc-radio-report' });
        }catch(_pu){}
      }
    }catch(_notif){}
    res.json({ success:true });
  }catch(e){ console.error('radio report:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/admin/radio/stats', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ total_seconds:0, by_station:[], unique_listeners:0, daily:[] });
    const tot = await _pgPool.query('SELECT COALESCE(SUM(duration_seconds),0) as s, COUNT(DISTINCT user_id) as u FROM penc_radio_listens');
    const byStation = await _pgPool.query(
      `SELECT s.id, s.name, s.logo_url, s.country, COALESCE(SUM(l.duration_seconds),0) as total_seconds, COUNT(DISTINCT l.user_id) as unique_listeners, COUNT(l.id) as sessions
       FROM penc_radio_stations s LEFT JOIN penc_radio_listens l ON l.station_id=s.id
       GROUP BY s.id ORDER BY total_seconds DESC`
    );
    // Croissance : temps d'écoute cumulé et auditeurs uniques par jour, 30 derniers jours.
    const daily = await _pgPool.query(
      `SELECT date_trunc('day', started_at) AS day, COALESCE(SUM(duration_seconds),0) AS seconds, COUNT(DISTINCT user_id) AS listeners
       FROM penc_radio_listens WHERE started_at > NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day ASC`
    );
    res.json({
      total_seconds: parseInt(tot.rows[0].s,10)||0,
      unique_listeners: parseInt(tot.rows[0].u,10)||0,
      by_station: byStation.rows,
      daily: daily.rows.map(x => ({ day: x.day, seconds: parseInt(x.seconds,10)||0, listeners: parseInt(x.listeners,10)||0 }))
    });
  }catch(e){ console.error('radio stats:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Suivi détaillé par auditeur (demandé par l'admin) : pour chaque personne ayant écouté
// DeglouFM au moins une fois — nombre de radios différentes écoutées et temps total cumulé.
// Triable, sert de point d'entrée vers le détail par station (endpoint suivant). ──
app.get('/api/penc/admin/radio/listeners', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ listeners: [] });
    // Liste EXHAUSTIVE de tous les utilisateurs DeglouFM : union de ceux qui ont une session
    // d'écoute enregistrée, ceux qui ont mis "J'aime" (fan) sur une station, et ceux qui ont
    // commenté — un utilisateur peut apparaître dans l'un sans forcément avoir de temps
    // d'écoute mesuré (ex: like sans lecture complète, bug de tracking, etc.).
    const r = await _pgPool.query(
      `WITH all_users AS (
         SELECT user_id FROM penc_radio_listens
         UNION SELECT user_id FROM penc_radio_fans
         UNION SELECT user_id FROM penc_radio_comments
       )
       SELECT u.id, u.full_name, u.username, u.avatar_url, u.verified, u.radio_banned, u.radio_premium,
              COALESCE(l.stations_count,0) AS stations_count,
              COALESCE(l.total_seconds,0) AS total_seconds,
              COALESCE(f.fans_count,0) AS fans_count,
              COALESCE(c.comments_count,0) AS comments_count,
              GREATEST(l.last_listened, c.last_commented) AS last_activity
       FROM all_users au
       JOIN penc_users u ON u.id=au.user_id
       LEFT JOIN (SELECT user_id, COUNT(DISTINCT station_id) AS stations_count, SUM(duration_seconds) AS total_seconds, MAX(started_at) AS last_listened FROM penc_radio_listens GROUP BY user_id) l ON l.user_id=au.user_id
       LEFT JOIN (SELECT user_id, COUNT(*) AS fans_count FROM penc_radio_fans GROUP BY user_id) f ON f.user_id=au.user_id
       LEFT JOIN (SELECT user_id, COUNT(*) AS comments_count, MAX(created_at) AS last_commented FROM penc_radio_comments GROUP BY user_id) c ON c.user_id=au.user_id
       ORDER BY total_seconds DESC NULLS LAST, last_activity DESC NULLS LAST LIMIT 500`
    );
    res.json({ listeners: r.rows.map(x => ({
      ...x,
      stations_count: parseInt(x.stations_count,10)||0,
      total_seconds: parseInt(x.total_seconds,10)||0,
      fans_count: parseInt(x.fans_count,10)||0,
      comments_count: parseInt(x.comments_count,10)||0
    })) });
  }catch(e){ console.error('admin radio listeners:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
// Détail d'un auditeur : temps passé sur CHAQUE radio écoutée, plus le total global (redondant
// avec la liste ci-dessus mais utile en vue détail sans tout recharger).
app.get('/api/penc/admin/radio/listeners/:userId', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ user:null, total_seconds:0, by_station:[] });
    const uid = req.params.userId;
    const u = await pgFindUser('id', uid);
    const byStation = await _pgPool.query(
      `SELECT s.id, s.name, s.logo_url, s.country, SUM(l.duration_seconds) AS total_seconds, COUNT(l.id) AS sessions, MAX(l.started_at) AS last_listened
       FROM penc_radio_listens l JOIN penc_radio_stations s ON s.id=l.station_id
       WHERE l.user_id=$1 GROUP BY s.id ORDER BY total_seconds DESC`,
      [uid]
    );
    const totalSeconds = byStation.rows.reduce((sum,row) => sum + (parseInt(row.total_seconds,10)||0), 0);
    res.json({
      user: u ? { id:u.id, full_name:u.full_name, username:u.username, avatar_url:u.avatar_url, radio_banned:!!u.radio_banned, radio_premium:!!u.radio_premium } : null,
      total_seconds: totalSeconds,
      by_station: byStation.rows.map(x => ({ ...x, total_seconds: parseInt(x.total_seconds,10)||0, sessions: parseInt(x.sessions,10)||0 }))
    });
  }catch(e){ console.error('admin radio listener detail:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

// ── Modération : file d'attente des signalements (stations + commentaires) en un seul écran. ──
app.get('/api/penc/admin/radio/reports', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ station_reports:[], comment_reports:[] });
    const stationReports = await _pgPool.query(
      `SELECT r.id, r.station_id, r.user_id, r.created_at, s.name AS station_name, s.logo_url, u.full_name AS reporter_name
       FROM penc_radio_reports r JOIN penc_radio_stations s ON s.id=r.station_id LEFT JOIN penc_users u ON u.id=r.user_id
       WHERE r.resolved=false OR r.resolved IS NULL ORDER BY r.created_at DESC LIMIT 100`
    );
    const commentReports = await _pgPool.query(
      `SELECT r.id, r.comment_id, r.user_id, r.created_at, c.content, c.station_id, s.name AS station_name,
              cu.full_name AS comment_author, u.full_name AS reporter_name
       FROM penc_radio_comment_reports r
       LEFT JOIN penc_radio_comments c ON c.id=r.comment_id
       LEFT JOIN penc_radio_stations s ON s.id=c.station_id
       LEFT JOIN penc_users cu ON cu.id=c.user_id
       LEFT JOIN penc_users u ON u.id=r.user_id
       WHERE r.resolved=false OR r.resolved IS NULL ORDER BY r.created_at DESC LIMIT 100`
    );
    res.json({ station_reports: stationReports.rows, comment_reports: commentReports.rows });
  }catch(e){ console.error('admin radio reports:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/reports/station/:id/resolve', pencAuth, pencAdmin, async (req, res) => {
  try{ if(_pgPool) await _pgPool.query('UPDATE penc_radio_reports SET resolved=true WHERE id=$1',[req.params.id]); res.json({ success:true }); }
  catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/reports/comment/:id/resolve', pencAuth, pencAdmin, async (req, res) => {
  try{ if(_pgPool) await _pgPool.query('UPDATE penc_radio_comment_reports SET resolved=true WHERE id=$1',[req.params.id]); res.json({ success:true }); }
  catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Supprime le commentaire signalé ET marque tous ses signalements comme traités.
app.post('/api/penc/admin/radio/comments/:id/delete', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const commentId = req.params.id;
    const cm = await _pgPool.query('SELECT station_id FROM penc_radio_comments WHERE id=$1',[commentId]);
    await _pgPool.query('DELETE FROM penc_radio_comments WHERE id=$1',[commentId]);
    await _pgPool.query('UPDATE penc_radio_comment_reports SET resolved=true WHERE comment_id=$1',[commentId]);
    if(cm.rows.length){ try{ io.to('radio:'+cm.rows[0].station_id).emit('radio:comment-deleted', { id: commentId }); }catch(_e4){} }
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Bloque/débloque un utilisateur des commentaires DeglouFM (pas du compte Penc entier).
app.post('/api/penc/admin/radio/users/:userId/ban', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const banned = !!(req.body && req.body.banned);
    await _pgPool.query('UPDATE penc_users SET radio_banned=$1 WHERE id=$2',[banned, req.params.userId]);
    res.json({ success:true, banned });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/radio/favorites', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ stations:[] });
    const r = await _pgPool.query(
      `SELECT s.* FROM penc_radio_stations s JOIN penc_radio_fans f ON f.station_id=s.id WHERE f.user_id=$1 AND s.active=true ORDER BY f.created_at DESC`,
      [req.pencUser.userId]
    );
    res.json({ stations: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Replay premium : liste des tranches disponibles pour une station (48h glissantes). ──
app.get('/api/penc/radio/stations/:id/replay', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ recordings:[], premium:false });
    const u = await pgFindUser('id', req.pencUser.userId);
    const isPremium = !!(u && u.radio_premium);
    if(!isPremium) return res.json({ recordings:[], premium:false });
    const r = await _pgPool.query(
      'SELECT id, started_at, duration_seconds, file_url FROM penc_radio_recordings WHERE station_id=$1 ORDER BY started_at DESC LIMIT 60',
      [req.params.id]
    );
    res.json({ recordings: r.rows, premium:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Statut premium de l'utilisateur courant (pour afficher le bon écran côté client).
app.get('/api/penc/radio/premium/status', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ premium:false, pending:false });
    const u = await pgFindUser('id', req.pencUser.userId);
    let pending = false;
    try{ const p = await _pgPool.query("SELECT 1 FROM penc_radio_premium_requests WHERE user_id=$1 AND status='pending' LIMIT 1",[req.pencUser.userId]); pending = p.rows.length>0; }catch(_p){}
    res.json({ premium: !!(u && u.radio_premium), pending });
  }catch(e){ res.json({ premium:false, pending:false }); }
});
// Soumission d'une preuve de paiement Wave — validée manuellement par l'admin (pas de webhook
// automatique pour l'instant ; Paydunya/crypto viendront remplacer ce flux plus tard).
app.post('/api/penc/radio/premium/request', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const reference = String((req.body && req.body.reference) || '').trim().slice(0,200);
    const proofUrl = (req.body && req.body.proof_url) ? String(req.body.proof_url).slice(0,500) : null;
    if(!reference && !proofUrl) return res.status(400).json({ error:'Indique la référence du paiement Wave ou une capture d\u2019écran' });
    const uid = req.pencUser.userId;
    await _pgPool.query("UPDATE penc_radio_premium_requests SET status='cancelled' WHERE user_id=$1 AND status='pending'",[uid]);
    const id = 'rprem_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_radio_premium_requests(id,user_id,reference,proof_url) VALUES($1,$2,$3,$4)',[id, uid, reference||null, proofUrl]);
    try{
      let name='Un utilisateur';
      try{ const u=await pgFindUser('id', uid); if(u) name=u.full_name||name; }catch(_ru){}
      for(const adminEmail of PENC_ADMIN_EMAILS){
        try{ const au=await pgFindUser('email', adminEmail); if(au) await sendPencPush(au.id, { title:'💎 Demande Premium DeglouFM', body: name+' a envoyé une preuve de paiement Wave', tag:'radio-premium-request' }); }catch(_pu){}
      }
    }catch(_notif){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/admin/radio/premium-requests', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ requests:[] });
    const r = await _pgPool.query(
      `SELECT pr.*, u.full_name, u.username, u.avatar_url FROM penc_radio_premium_requests pr
       LEFT JOIN penc_users u ON u.id=pr.user_id WHERE pr.status='pending' ORDER BY pr.created_at DESC LIMIT 100`
    );
    res.json({ requests: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/premium-requests/:id/approve', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const rq = await _pgPool.query('SELECT user_id FROM penc_radio_premium_requests WHERE id=$1',[req.params.id]);
    if(!rq.rows.length) return res.status(404).json({ error:'Introuvable' });
    await _pgPool.query("UPDATE penc_radio_premium_requests SET status='approved' WHERE id=$1",[req.params.id]);
    await _pgPool.query('UPDATE penc_users SET radio_premium=true WHERE id=$1',[rq.rows[0].user_id]);
    try{ await sendPencPush(rq.rows[0].user_id, { title:'💎 Premium DeglouFM activé', body:'Tu peux maintenant réécouter les émissions passées.', tag:'radio-premium-activated' }); }catch(_sp){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/radio/premium-requests/:id/reject', pencAuth, pencAdmin, async (req, res) => {
  try{ if(_pgPool) await _pgPool.query("UPDATE penc_radio_premium_requests SET status='rejected' WHERE id=$1",[req.params.id]); res.json({ success:true }); }
  catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Activation/retrait manuel direct (sans passer par une demande) — pratique pour un abonné payé hors app.
app.post('/api/penc/admin/radio/users/:userId/premium', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const premium = !!(req.body && req.body.premium);
    await _pgPool.query('UPDATE penc_users SET radio_premium=$1 WHERE id=$2',[premium, req.params.userId]);
    if(premium){ try{ await sendPencPush(req.params.userId, { title:'💎 Premium DeglouFM activé', body:'Tu peux maintenant réécouter les émissions passées.', tag:'radio-premium-activated' }); }catch(_sp2){} }
    res.json({ success:true, premium });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Historique d'écoute personnel : dernières stations écoutées, une seule entrée par station
// (la plus récente), pour l'onglet "Récemment écoutées".
app.get('/api/penc/radio/recent', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ stations:[] });
    const r = await _pgPool.query(
      `SELECT s.*, MAX(l.started_at) AS last_listened
       FROM penc_radio_listens l JOIN penc_radio_stations s ON s.id=l.station_id
       WHERE l.user_id=$1 AND s.active=true
       GROUP BY s.id ORDER BY last_listened DESC LIMIT 20`,
      [req.pencUser.userId]
    );
    res.json({ stations: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Classement des auditeurs les plus fidèles d'une station (30 derniers jours, par temps d'écoute cumulé).
app.get('/api/penc/radio/stations/:id/top-listeners', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ listeners: [] });
    const r = await _pgPool.query(
      `SELECT u.id, u.full_name, u.username, u.avatar_url, u.verified, SUM(l.duration_seconds) AS total_seconds
       FROM penc_radio_listens l JOIN penc_users u ON u.id=l.user_id
       WHERE l.station_id=$1 AND l.started_at > NOW() - INTERVAL '30 days'
       GROUP BY u.id ORDER BY total_seconds DESC LIMIT 10`,
      [req.params.id]
    );
    res.json({ listeners: r.rows.map(x => ({ ...x, total_seconds: parseInt(x.total_seconds,10)||0 })) });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Recommandations par co-écoute : stations écoutées par les mêmes auditeurs que la station courante.
app.get('/api/penc/radio/stations/:id/similar', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ stations: [] });
    const r = await _pgPool.query(
      `SELECT s.*, COUNT(DISTINCT l2.user_id) AS shared_listeners
       FROM penc_radio_listens l1
       JOIN penc_radio_listens l2 ON l2.user_id=l1.user_id AND l2.station_id<>l1.station_id
       JOIN penc_radio_stations s ON s.id=l2.station_id
       WHERE l1.station_id=$1 AND s.active=true
       GROUP BY s.id ORDER BY shared_listeners DESC LIMIT 8`,
      [req.params.id]
    );
    res.json({ stations: r.rows });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/radio/stations/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(404).json({ error:'Introuvable' });
    const r = await _pgPool.query('SELECT * FROM penc_radio_stations WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({ error:'Station introuvable' });
    const fc = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_fans WHERE station_id=$1',[req.params.id]);
    const myFan = await _pgPool.query('SELECT 1 FROM penc_radio_fans WHERE station_id=$1 AND user_id=$2',[req.params.id, req.pencUser.userId]);
    // Auditeurs "en direct" : sessions actives commencées il y a moins de 3 minutes sans fin enregistrée
    const live = await _pgPool.query("SELECT COUNT(DISTINCT user_id) FROM penc_radio_listens WHERE station_id=$1 AND ended_at IS NULL AND started_at > NOW() - INTERVAL '3 minutes'",[req.params.id]);
    const cc = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_comments WHERE station_id=$1',[req.params.id]);
    const sc = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_shares WHERE station_id=$1',[req.params.id]);
    // Échantillon de fans pour la ligne "Untel et X autres personnes" (les plus récents en premier)
    const topFans = await _pgPool.query(
      `SELECT u.full_name, u.avatar_url FROM penc_radio_fans f JOIN penc_users u ON u.id=f.user_id
       WHERE f.station_id=$1 ORDER BY f.created_at DESC LIMIT 3`,
      [req.params.id]
    );
    res.json({ station: {
      ...r.rows[0], fans_count: parseInt(fc.rows[0].count,10)||0, is_fan: myFan.rows.length>0,
      live_listeners: parseInt(live.rows[0].count,10)||0, comments_count: parseInt(cc.rows[0].count,10)||0,
      share_count: parseInt(sc.rows[0].count,10)||0, top_fans: topFans.rows
    } });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/stations/:id/share', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const id = 'rsh_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_radio_shares(id,station_id,user_id) VALUES($1,$2,$3)',[id, req.params.id, req.pencUser.userId]);
    const sc = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_shares WHERE station_id=$1',[req.params.id]);
    res.json({ success:true, share_count: parseInt(sc.rows[0].count,10)||0 });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/stations/:id/fan', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const uid = req.pencUser.userId;
    const existing = await _pgPool.query('SELECT 1 FROM penc_radio_fans WHERE station_id=$1 AND user_id=$2',[req.params.id, uid]);
    let fan;
    if(existing.rows.length){ await _pgPool.query('DELETE FROM penc_radio_fans WHERE station_id=$1 AND user_id=$2',[req.params.id, uid]); fan=false; }
    else { await _pgPool.query('INSERT INTO penc_radio_fans(station_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id, uid]); fan=true; }
    const fc = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_fans WHERE station_id=$1',[req.params.id]);
    res.json({ success:true, fan, fans_count: parseInt(fc.rows[0].count,10)||0 });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/radio/stations/:id/comments', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ comments:[] });
    const uid = req.pencUser.userId;
    const before = req.query.before ? String(req.query.before) : null;
    const params = before ? [req.params.id, uid, before] : [req.params.id, uid];
    const r = await _pgPool.query(
      `SELECT c.*, COALESCE(u.full_name,'Utilisateur') AS full_name, u.username, u.avatar_url, u.verified,
              (SELECT COUNT(*) FROM penc_radio_comment_likes l WHERE l.comment_id=c.id) AS likes_count,
              EXISTS(SELECT 1 FROM penc_radio_comment_likes l2 WHERE l2.comment_id=c.id AND l2.user_id=$2) AS liked_by_me,
              rc.content AS reply_content, ru.full_name AS reply_name
       FROM penc_radio_comments c
       LEFT JOIN penc_users u ON u.id=c.user_id
       LEFT JOIN penc_radio_comments rc ON rc.id=c.reply_to
       LEFT JOIN penc_users ru ON ru.id=rc.user_id
       WHERE c.station_id=$1` + (before ? ' AND c.created_at < (SELECT created_at FROM penc_radio_comments WHERE id=$3)' : '') + `
       ORDER BY c.created_at DESC LIMIT 30`,
      params
    );
    res.json({ comments: r.rows, has_more: r.rows.length===30 });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Modifier son propre commentaire.
app.patch('/api/penc/radio/comments/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const content = String((req.body && req.body.content) || '').trim().slice(0,500);
    if(!content) return res.status(400).json({ error:'Message vide' });
    const cm = await _pgPool.query('SELECT user_id FROM penc_radio_comments WHERE id=$1',[req.params.id]);
    if(!cm.rows.length) return res.status(404).json({ error:'Commentaire introuvable' });
    if(cm.rows[0].user_id !== req.pencUser.userId) return res.status(403).json({ error:'Tu ne peux modifier que tes propres commentaires' });
    await _pgPool.query('UPDATE penc_radio_comments SET content=$1, edited=true WHERE id=$2',[content, req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// Supprimer son propre commentaire.
app.delete('/api/penc/radio/comments/:id', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const cm = await _pgPool.query('SELECT user_id, station_id FROM penc_radio_comments WHERE id=$1',[req.params.id]);
    if(!cm.rows.length) return res.status(404).json({ error:'Commentaire introuvable' });
    if(cm.rows[0].user_id !== req.pencUser.userId) return res.status(403).json({ error:'Tu ne peux supprimer que tes propres commentaires' });
    await _pgPool.query('DELETE FROM penc_radio_comments WHERE id=$1',[req.params.id]);
    try{ io.to('radio:'+cm.rows[0].station_id).emit('radio:comment-deleted', { id: req.params.id }); }catch(_e5){}
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/stations/:id/comments', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const content = String(req.body.content||'').trim().slice(0,500);
    if(!content) return res.status(400).json({ error:'Message vide' });
    const uid = req.pencUser.userId;
    try{ const banCheck = await _pgPool.query('SELECT radio_banned FROM penc_users WHERE id=$1',[uid]); if(banCheck.rows[0] && banCheck.rows[0].radio_banned) return res.status(403).json({ error:'Tu ne peux plus commenter sur DeglouFM.' }); }catch(_bc){}
    const replyTo = req.body.reply_to ? String(req.body.reply_to) : null;
    const id = 'rcm_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    const stationId = req.params.id;
    await _pgPool.query('INSERT INTO penc_radio_comments(id,station_id,user_id,content,reply_to) VALUES($1,$2,$3,$4,$5)',[id, stationId, uid, content, replyTo]);

    // Construire la charge diffusée en direct à tous les auditeurs de la station + réponse à l'appelant
    let author = null;
    try { author = await pgFindUser('id', uid); } catch(_a){}
    let replyPreview = null;
    if (replyTo) {
      try {
        const rc = await _pgPool.query('SELECT c.content, u.full_name FROM penc_radio_comments c JOIN penc_users u ON u.id=c.user_id WHERE c.id=$1',[replyTo]);
        if (rc.rows.length) replyPreview = { content: rc.rows[0].content, name: rc.rows[0].full_name };
      } catch(_r){}
    }
    const payload = {
      id, station_id: stationId, user_id: uid, content,
      created_at: new Date().toISOString(),
      full_name: author && author.full_name, username: author && author.username,
      avatar_url: author && author.avatar_url, verified: !!(author && author.verified),
      likes_count: 0, liked_by_me: false,
      reply_to: replyTo, reply_content: replyPreview && replyPreview.content, reply_name: replyPreview && replyPreview.name
    };
    try { io.to('radio:' + stationId).emit('radio:comment', payload); } catch(_e1){}

    // Notifier les fans + participants déjà présents dans la discussion (hors l'auteur) —
    // en digest groupé (voir _radQueueCommentNotif) plutôt qu'une push immédiate par commentaire.
    try {
      const stationRow = await _pgPool.query('SELECT name FROM penc_radio_stations WHERE id=$1',[stationId]);
      const stationName = (stationRow.rows[0] && stationRow.rows[0].name) || 'DeglouFM';
      _radQueueCommentNotif(stationId, uid, (author && author.full_name) || null, stationName);
    } catch(_n){}

    res.json({ success:true, comment: payload });
  }catch(e){ console.error('radio comment post:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/radio/comments/:id/like', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const uid = req.pencUser.userId;
    const commentId = req.params.id;
    const existing = await _pgPool.query('SELECT 1 FROM penc_radio_comment_likes WHERE comment_id=$1 AND user_id=$2', [commentId, uid]);
    let liked;
    if (existing.rowCount > 0) {
      await _pgPool.query('DELETE FROM penc_radio_comment_likes WHERE comment_id=$1 AND user_id=$2', [commentId, uid]);
      liked = false;
    } else {
      await _pgPool.query('INSERT INTO penc_radio_comment_likes(comment_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [commentId, uid]);
      liked = true;
    }
    const cnt = await _pgPool.query('SELECT COUNT(*) FROM penc_radio_comment_likes WHERE comment_id=$1', [commentId]);
    const likes_count = parseInt(cnt.rows[0].count, 10) || 0;
    try {
      const cm = await _pgPool.query('SELECT station_id FROM penc_radio_comments WHERE id=$1', [commentId]);
      if (cm.rows.length) io.to('radio:' + cm.rows[0].station_id).emit('radio:comment-like', { comment_id: commentId, likes_count });
    } catch(_e2){}
    res.json({ success:true, liked, likes_count });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/listings/:id/like', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const uid = req.pencUser.userId;
    const existing = await _pgPool.query('SELECT 1 FROM penc_listing_likes WHERE listing_id=$1 AND user_id=$2',[req.params.id, uid]);
    let liked;
    if(existing.rows.length){ await _pgPool.query('DELETE FROM penc_listing_likes WHERE listing_id=$1 AND user_id=$2',[req.params.id, uid]); liked=false; }
    else { await _pgPool.query('INSERT INTO penc_listing_likes(listing_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id, uid]); liked=true; }
    const cr = await _pgPool.query('SELECT COUNT(*) FROM penc_listing_likes WHERE listing_id=$1',[req.params.id]);
    res.json({ success:true, liked, likes_count: parseInt(cr.rows[0].count,10)||0 });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.post('/api/penc/listings/:id/report', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { reason, description } = req.body;
    if(!reason) return res.status(400).json({ error:'Motif requis' });
    const id = 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query(
      'INSERT INTO penc_listing_reports(id,listing_id,reporter_id,reason,description) VALUES($1,$2,$3,$4,$5)',
      [id, req.params.id, req.pencUser.userId, String(reason).slice(0,100), String(description||'').slice(0,1000)]
    );
    res.json({ success:true });
  }catch(e){ console.error('listing report:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.get('/api/penc/admin/listing-reports', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ reports:[] });
    const r = await _pgPool.query(
      `SELECT rp.*, l.title as listing_title, l.price, l.currency, l.status as listing_status, l.seller_id,
              us.full_name as seller_name, us.phone as seller_phone,
              ur.full_name as reporter_name, ur.phone as reporter_phone
       FROM penc_listing_reports rp
       JOIN penc_listings l ON l.id = rp.listing_id
       JOIN penc_users us ON us.id = l.seller_id
       JOIN penc_users ur ON ur.id = rp.reporter_id
       ORDER BY rp.status ASC, rp.created_at DESC LIMIT 100`
    );
    res.json({ reports: r.rows });
  }catch(e){ console.error('admin listing-reports:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

app.patch('/api/penc/admin/listing-reports/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const status = ['open','resolved','dismissed'].includes(req.body.status) ? req.body.status : 'resolved';
    await _pgPool.query('UPDATE penc_listing_reports SET status=$1 WHERE id=$2',[status, req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

app.delete('/api/penc/admin/listings/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    await _pgPool.query('DELETE FROM penc_listings WHERE id=$1',[req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ── Compte Business : libre-service, pas de validation admin requise (contrairement au badge
// vérifié) — un simple nom + description de boutique, activable/désactivable par l'utilisateur. ──
app.post('/api/penc/business/toggle', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { enabled, business_name, business_description } = req.body || {};
    const uid = req.pencUser.userId;
    if(enabled){
      const name = String(business_name||'').trim().slice(0,80);
      if(!name) return res.status(400).json({ error:'Nom de la boutique requis' });
      await _pgPool.query('UPDATE penc_users SET is_business=TRUE, business_name=$1, business_description=$2 WHERE id=$3',
        [name, String(business_description||'').trim().slice(0,300), uid]);
    } else {
      await _pgPool.query('UPDATE penc_users SET is_business=FALSE WHERE id=$1',[uid]);
    }
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/business/status', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ is_business:false });
    const u = await pgFindUser('id', req.pencUser.userId);
    res.json({ is_business: !!(u && u.is_business), business_name: u && u.business_name, business_description: u && u.business_description });
  }catch(e){ res.json({ is_business:false }); }
});
// Catalogue public d'une boutique : ses annonces actives, marquées comme "articles de catalogue"
// (une distinction volontaire — un vendeur particulier peut aussi publier des annonces normales
// sur Market sans que ça pollue sa vitrine boutique si elle existe).
app.get('/api/penc/business/:userId/catalog', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ catalog:null, listings:[] });
    const u = await pgFindUser('id', req.params.userId);
    if(!u || !u.is_business) return res.json({ catalog:null, listings:[] });
    const r = await _pgPool.query("SELECT * FROM penc_listings WHERE seller_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 100",[req.params.userId]);
    res.json({ catalog:{ business_name:u.business_name, business_description:u.business_description, avatar_url:u.avatar_url }, listings:r.rows });
  }catch(e){ res.json({ catalog:null, listings:[] }); }
});
// ── Stickers premium : packs vendus via Wave, débloqués après validation admin (même schéma que
// le Premium DeglouFM). Le sticker picker vérifie les packs achetés côté client. ──
app.get('/api/penc/sticker-packs', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ packs: [] });
    const uid = req.pencUser.userId;
    const packs = await _pgPool.query('SELECT * FROM penc_sticker_packs WHERE active=TRUE ORDER BY created_at DESC');
    const owned = await _pgPool.query("SELECT pack_id FROM penc_sticker_purchases WHERE user_id=$1 AND status='approved'",[uid]);
    const ownedIds = new Set(owned.rows.map(function(r){ return r.pack_id; }));
    res.json({ packs: packs.rows.map(function(p){ return { id:p.id, name:p.name, price_fcfa:p.price_fcfa, preview_url:p.preview_url, sticker_urls:(ownedIds.has(p.id)?p.sticker_urls:[]), owned: ownedIds.has(p.id) }; }) });
  }catch(e){ res.json({ packs: [] }); }
});
app.post('/api/penc/sticker-packs/:id/purchase', pencAuth, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const reference = String((req.body && req.body.reference) || '').trim();
    if(!reference) return res.status(400).json({ error:'Référence de paiement Wave requise' });
    const id = 'stkp_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_sticker_purchases(id,user_id,pack_id,reference,status) VALUES($1,$2,$3,$4,$5)',
      [id, req.pencUser.userId, req.params.id, reference, 'pending']);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/admin/sticker-packs', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ packs: [] });
    const r = await _pgPool.query('SELECT * FROM penc_sticker_packs ORDER BY created_at DESC');
    res.json({ packs: r.rows });
  }catch(e){ res.json({ packs: [] }); }
});
app.post('/api/penc/admin/sticker-packs', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error:'BD non disponible' });
    const { name, price_fcfa, preview_url, sticker_urls } = req.body || {};
    if(!name || !Array.isArray(sticker_urls) || !sticker_urls.length) return res.status(400).json({ error:'Nom et au moins un sticker requis' });
    const id = 'pack_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    await _pgPool.query('INSERT INTO penc_sticker_packs(id,name,price_fcfa,preview_url,sticker_urls) VALUES($1,$2,$3,$4,$5)',
      [id, String(name).trim().slice(0,80), parseInt(price_fcfa,10)||0, preview_url||null, JSON.stringify(sticker_urls)]);
    res.json({ success:true, id });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.get('/api/penc/admin/sticker-purchases', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ purchases: [] });
    const r = await _pgPool.query(`SELECT sp.*, u.full_name AS _name, u.username AS _un, pk.name AS _pack_name
       FROM penc_sticker_purchases sp LEFT JOIN penc_users u ON u.id=sp.user_id LEFT JOIN penc_sticker_packs pk ON pk.id=sp.pack_id
       WHERE sp.status='pending' ORDER BY sp.created_at DESC LIMIT 200`);
    res.json({ purchases: r.rows.map(function(x){ return { id:x.id, user_name:(x._name||x._un||'Utilisateur'), pack_name:x._pack_name||'', reference:x.reference, created_at:x.created_at }; }) });
  }catch(e){ res.json({ purchases: [] }); }
});
app.post('/api/penc/admin/sticker-purchases/:id/approve', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ success:true });
    await _pgPool.query("UPDATE penc_sticker_purchases SET status='approved' WHERE id=$1",[req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/sticker-purchases/:id/reject', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.json({ success:true });
    await _pgPool.query("UPDATE penc_sticker_purchases SET status='rejected' WHERE id=$1",[req.params.id]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── PENC PAY — Intégration IzichangePay (paiements crypto → monnaie locale) ──
// Phase de test : visible et pilotable UNIQUEMENT par les admins pour l'instant.
// Nécessite les variables d'environnement Render : IZIPAY_API_KEY, IZIPAY_WEBHOOK_SECRET
// (obtenues depuis le dashboard sandbox : https://dashboard.sandbox-pay.izichange.com)
// Nécessite aussi : npm install izichangepay-sdk
// ═══════════════════════════════════════════════════════════════════════════
let _izipay = null;
function _getIzipay() {
  if (_izipay) return _izipay;
  if (!process.env.IZIPAY_API_KEY) return null;
  try {
    const { IziPayClient } = require('izichangepay-sdk');
    _izipay = new IziPayClient({ apiKey: process.env.IZIPAY_API_KEY });
    return _izipay;
  } catch (e) { console.error('[penc-pay] SDK izichangepay-sdk non installé (npm install izichangepay-sdk):', e.message); return null; }
}
// Créer un paiement de test (admin uniquement pour l'instant)
app.post('/api/penc/admin/pay/create', pencAuth, pencAdmin, async (req, res) => {
  try {
    const client = _getIzipay();
    if (!client) return res.status(503).json({ error: 'IZIPAY_API_KEY manquante dans les variables Render, ou SDK non installé' });
    if (!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    const { amount, label, coins } = req.body || {};
    const amt = String(amount || '').trim();
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) return res.status(400).json({ error: 'Montant invalide' });
    const merchantRef = 'pencpay_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const intent = await client.paymentIntents.create({
      requestedCurrencyType: 'fiat',
      currencyRequested: 'XOF',
      amountRequested: amt, // chaîne décimale en unité majeure, jamais un nombre JSON
      acceptedCoins: (Array.isArray(coins) && coins.length) ? coins : ['USDT.TRC20', 'USDT.BEP20'],
      merchantReference: merchantRef,
      returnUrl: 'https://penc-messagerie.com/messager?open=pencpay',
      metadata: { label: String(label || '').slice(0, 100), createdBy: req.pencUser.userId },
    });
    const id = 'ppt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    await _pgPool.query(
      `INSERT INTO penc_pay_transactions(id, intent_id, merchant_reference, created_by, currency, amount_requested, accepted_coins, status, payment_url, metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, intent.id, merchantRef, req.pencUser.userId, 'XOF', amt, JSON.stringify(intent.acceptedCoins || []), intent.status || 'created', intent.paymentUrl, JSON.stringify({ label: label || '' })]
    );
    res.json({ success: true, intent_id: intent.id, payment_url: intent.paymentUrl, merchant_reference: merchantRef });
  } catch (e) { console.error('[penc-pay] create:', e.message); res.status(500).json({ error: e.message || 'Erreur serveur' }); }
});
// Historique des transactions (admin)
app.get('/api/penc/admin/pay/transactions', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ transactions: [] });
    const r = await _pgPool.query('SELECT * FROM penc_pay_transactions ORDER BY created_at DESC LIMIT 100');
    res.json({ transactions: r.rows });
  } catch (e) { res.json({ transactions: [] }); }
});
// Webhook IzichangePay — reçoit la confirmation de paiement (payment_intent.completed / expired / irregular)
// Utilise req.rawBody (capturé globalement au niveau de express.json(), voir plus haut dans le
// fichier) car le parseur JSON global consomme déjà le corps avant qu'un express.raw() posé ici
// n'ait la moindre chance de s'exécuter — sans ça la vérification de signature échouerait toujours.
app.post('/api/penc/pay/webhook', async (req, res) => {
  try {
    const client = _getIzipay();
    if (!client) return res.status(503).json({ error: 'IZIPAY non configuré' });
    let event;
    try {
      event = client.constructor.validateWebhook(
        req.rawBody,
        req.headers['x-izipay-signature'],
        process.env.IZIPAY_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('[penc-pay] webhook signature invalide:', err.message);
      return res.status(400).json({ error: err.message });
    }
    const data = event.data || {};
    if (_pgPool && data.intentId) {
      await _pgPool.query(
        "UPDATE penc_pay_transactions SET status=$1, updated_at=NOW() WHERE intent_id=$2",
        [event.type === 'payment_intent.completed' ? 'completed' : (event.type === 'payment_intent.expired' ? 'expired' : 'irregular'), data.intentId]
      );
      console.log('[penc-pay] webhook reçu:', event.type, 'intent=' + data.intentId, 'ref=' + (data.merchantReference || ''));
    }
    res.json({ received: true }); // accusé rapide, requis par IzichangePay
  } catch (e) { console.error('[penc-pay] webhook erreur:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

async function pencAdmin(req, res, next) {
  try {
    let u = null;
    if (_pgPool) { try { u = await pgFindUser('id', req.pencUser.userId); } catch(e){} }
    if (!u) { const users = await pencUsers(); u = users.find(x => x.id === req.pencUser.userId); }
    if (!u || !PENC_ADMIN_EMAILS.includes(String(u.email || '').toLowerCase())) return res.status(403).json({ error: 'Acces refuse' });
    req.pencAdminUser = u;
    next();
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
}
function pencContactsCount(convs, uid) {
  const set = new Set();
  convs.forEach(c => { if (Array.isArray(c.members) && c.members.includes(uid)) c.members.forEach(m => { if (m !== uid) set.add(m); }); });
  return set.size;
}
// ── Etape 3 : evaluations des appels ──────────────────────────
app.post('/api/penc/call/rate', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const uid=req.pencUser.userId;
    const r=parseInt((req.body&&req.body.rating),10);
    if(!(r>=1&&r<=5)) return res.status(400).json({error:'note invalide'});
    const ct=((req.body&&req.body.call_type)==='video')?'video':'audio';
    const peer=(req.body&&req.body.peer_id)?String(req.body.peer_id):null;
    const cm=((req.body&&req.body.comment)||'').toString().slice(0,500);
    await _pgPool.query('INSERT INTO penc_call_ratings(id,rater_id,peer_id,call_type,rating,comment,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW())',['cr_'+Date.now()+Math.random().toString(36).slice(2),uid,peer,ct,r,cm||null]);
    res.json({success:true});
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.get('/api/penc/admin/call-ratings', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({avg:0,count:0,per_user:[],history:[]});
    const from=(req.query.from||'').trim(); const to=(req.query.to||'').trim(); const user=(req.query.user||'').trim();
    let where=[]; let params=[]; let i=1;
    if(from){ where.push('cr.created_at >= $'+i); params.push(from); i++; }
    if(to){ where.push('cr.created_at <= $'+i); params.push(to+' 23:59:59'); i++; }
    if(user){ where.push('cr.rater_id = $'+i); params.push(user); i++; }
    const W = where.length?(' WHERE '+where.join(' AND ')):'';
    const g=await _pgPool.query('SELECT COALESCE(AVG(rating),0)::numeric(10,2) avg, COUNT(*)::int c FROM penc_call_ratings cr'+W, params);
    const pu=await _pgPool.query('SELECT cr.rater_id, COALESCE(AVG(cr.rating),0)::numeric(10,2) avg, COUNT(*)::int c, u.full_name, u.username FROM penc_call_ratings cr LEFT JOIN penc_users u ON u.id=cr.rater_id'+W+' GROUP BY cr.rater_id,u.full_name,u.username ORDER BY c DESC LIMIT 100', params);
    const h=await _pgPool.query('SELECT cr.id, cr.rating, cr.comment, cr.call_type, cr.created_at, u.full_name, u.username FROM penc_call_ratings cr LEFT JOIN penc_users u ON u.id=cr.rater_id'+W+' ORDER BY cr.created_at DESC LIMIT 100', params);
    res.json({
      avg: parseFloat(g.rows[0].avg)||0, count: g.rows[0].c||0,
      per_user: pu.rows.map(function(r){ return {user_id:r.rater_id, name:r.full_name||r.username||'?', username:r.username||'', avg:parseFloat(r.avg)||0, count:r.c||0}; }),
      history: h.rows.map(function(r){ return {id:r.id, rating:r.rating, comment:r.comment||'', call_type:r.call_type||'audio', created_at:r.created_at, name:r.full_name||r.username||'?', username:r.username||''}; })
    });
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
// ── Etape 6 : fiche detaillee par utilisateur ─────────────────
app.get('/api/penc/admin/user/:id/fiche', pencAuth, pencAdmin, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({error:'no_db'});
    const uid=String(req.params.id);
    const out={};
    let urow=null;
    try{ const r=await _pgPool.query('SELECT * FROM penc_users WHERE id=$1',[uid]); urow=r.rows[0]||null; }catch(e){}
    if(!urow) return res.status(404).json({error:'introuvable'});
    const geo=(urow.geo&&typeof urow.geo==='object')?urow.geo:{};
    const vv=urow.valid_views||0;
    out.info={ id:uid, full_name:urow.full_name||'', username:urow.username||'', phone:urow.phone||'', email:urow.email||'', avatar_url:urow.avatar_url||null, country:geo.country||'', city:geo.city||'', created_at:urow.created_at||null, last_seen:urow.last_seen||null, total_time_seconds:urow.total_time_seconds||0, status:(urow.deleted_at?'supprime':(urow.blocked?'bloque':(urow.suspended?'suspendu':'actif'))) };
    const msg={total:0,text:0,voice:0,voice_duration:0,image:0,video:0,file:0};
    try{
      const mr=await _pgPool.query("SELECT type, content, duration FROM penc_messages WHERE sender_id=$1 AND (deleted_for_all IS NOT TRUE)",[uid]);
      mr.rows.forEach(function(m){
        if(m.type==='call') return;
        msg.total++;
        if(m.type==='text') msg.text++;
        else if(m.type==='voice'||m.type==='audio'){ msg.voice++; msg.voice_duration+=(parseInt(m.duration,10)||0); }
        else if(m.type==='image') msg.image++;
        else if(m.type==='video') msg.video++;
        else if(m.type==='file'||m.type==='document') msg.file++;
      });
    }catch(e){}
    out.messaging=msg;
    const convPeer={};
    try{ const cr=await _pgPool.query("SELECT id, participants FROM penc_conversations WHERE participants @> $1::jsonb",[JSON.stringify([uid])]);
      cr.rows.forEach(function(c){ let p=c.participants; if(!Array.isArray(p)){ try{ p=JSON.parse(p||'[]'); }catch(e){ p=[]; } } const other=(p||[]).map(String).find(function(x){ return x!==uid; }); convPeer[String(c.id)]=other||null; });
    }catch(e){}
    const calls={emis:0,recus:0,manques:0,duree_sec:0,note_moyenne:0};
    const peerAgg={};
    try{
      const convIds=Object.keys(convPeer);
      if(convIds.length){
        const cm=await _pgPool.query("SELECT sender_id, content, conversation_id FROM penc_messages WHERE type='call' AND conversation_id = ANY($1)",[convIds]);
        cm.rows.forEach(function(m){
          let d={}; try{ d=JSON.parse(m.content||'{}'); }catch(e){}
          const isMine=(String(m.sender_id)===uid);
          const answered=(d.status==='answered');
          const dur=(typeof d.duration==='number')?d.duration:0;
          if(isMine){ calls.emis++; if(answered) calls.duree_sec+=dur; const peer=convPeer[String(m.conversation_id)]; if(peer){ if(!peerAgg[peer]) peerAgg[peer]={count:0,dur:0}; peerAgg[peer].count++; peerAgg[peer].dur+=(answered?dur:0); } }
          else { calls.recus++; if(!answered) calls.manques++; }
        });
      }
    }catch(e){}
    try{ const rr=await _pgPool.query("SELECT COALESCE(AVG(rating),0)::numeric(10,2) a FROM penc_call_ratings WHERE rater_id=$1",[uid]); calls.note_moyenne=parseFloat(rr.rows[0].a)||0; }catch(e){}
    const social={amis:0,envoyees:0,recues:0,bloques:0,amis_list:[],bloques_list:[]};
    const idNeeded=new Set();
    Object.keys(peerAgg).forEach(function(id){ idNeeded.add(id); });
    try{
      const fr=await _pgPool.query("SELECT requester, recipient, status FROM penc_friendships WHERE requester=$1 OR recipient=$1",[uid]);
      fr.rows.forEach(function(f){
        const other=(String(f.requester)===uid)?String(f.recipient):String(f.requester);
        if(f.status==='accepted'){ social.amis++; social.amis_list.push(other); idNeeded.add(other); }
        else if(f.status==='pending'){ if(String(f.requester)===uid) social.envoyees++; else social.recues++; }
        else if(f.status==='blocked'){ if(String(f.requester)===uid){ social.bloques++; social.bloques_list.push(other); idNeeded.add(other); } }
      });
    }catch(e){}
    const nameMap={};
    try{ const ids=Array.from(idNeeded); if(ids.length){ const nr=await _pgPool.query("SELECT id, full_name, username FROM penc_users WHERE id = ANY($1)",[ids]); nr.rows.forEach(function(u){ nameMap[String(u.id)]=u.full_name||u.username||'?'; }); } }catch(e){}
    social.amis_list=social.amis_list.slice(0,300).map(function(id){ return {id:id, name:nameMap[id]||'?'}; });
    social.bloques_list=social.bloques_list.map(function(id){ return {id:id, name:nameMap[id]||'?'}; });
    out.social=social;
    calls.top=Object.keys(peerAgg).map(function(id){ return {id:id, name:nameMap[id]||'?', count:peerAgg[id].count, duration:peerAgg[id].dur}; }).sort(function(a,b){ return b.count-a.count; }).slice(0,5);
    out.calls=calls;
    const content={statuts:0,vues:0,likes:0,gains_fcfa:Math.round((vv/1000)*75),canaux_crees:0,canaux_suivis:0};
    try{ const sr=await _pgPool.query("SELECT COUNT(*)::int n, COALESCE(SUM(COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(views)='array' THEN views ELSE '[]'::jsonb END),0)),0)::int v, COALESCE(SUM(COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(reactions)='array' THEN reactions ELSE '[]'::jsonb END),0)),0)::int l FROM penc_statuses WHERE user_id=$1",[uid]); content.statuts=sr.rows[0].n||0; content.vues=sr.rows[0].v||0; content.likes=sr.rows[0].l||0; }catch(e){}
    try{ const cc=await _pgPool.query("SELECT COUNT(*) FILTER (WHERE data->>'creator_id'=$1)::int created, COUNT(*) FILTER (WHERE data->'followers' @> to_jsonb($1::text))::int followed FROM penc_channels",[uid]); content.canaux_crees=cc.rows[0].created||0; content.canaux_suivis=cc.rows[0].followed||0; }catch(e){}
    out.content=content;
    res.json(out);
  }catch(e){ console.error('fiche', e.message); res.status(500).json({error:'Erreur serveur'}); }
});
// ── Etape 4 : isolation entre utilisateurs ────────────────────
app.post('/api/penc/admin/isolate', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const a=(req.body&&req.body.user_a)?String(req.body.user_a):null;
    let bs=(req.body&&req.body.user_ids)||[]; if(!Array.isArray(bs)) bs=[];
    if(!a||!bs.length) return res.status(400).json({error:'Selection invalide'});
    const adminId=req.pencUser.userId; let n=0;
    for(const b0 of bs){ const b=String(b0); if(!b||b===a) continue;
      const ex=await _pgPool.query('SELECT 1 FROM penc_isolations WHERE (user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1) LIMIT 1',[a,b]);
      if(ex.rows.length) continue;
      await _pgPool.query('INSERT INTO penc_isolations(id,user_a,user_b,created_by,created_at) VALUES($1,$2,$3,$4,NOW())',['iso_'+Date.now()+Math.random().toString(36).slice(2),a,b,adminId]); n++;
    }
    await _loadIso();
    res.json({success:true, created:n});
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.get('/api/penc/admin/isolations', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({isolations:[]});
    const r=await _pgPool.query("SELECT i.id, i.user_a, i.user_b, i.created_at, ua.full_name fa, ua.username una, ub.full_name fb, ub.username unb FROM penc_isolations i LEFT JOIN penc_users ua ON ua.id=i.user_a LEFT JOIN penc_users ub ON ub.id=i.user_b ORDER BY i.created_at DESC");
    res.json({isolations:r.rows.map(function(x){ return {id:x.id, a:{id:x.user_a,name:x.fa||x.una||'?'}, b:{id:x.user_b,name:x.fb||x.unb||'?'}, created_at:x.created_at}; })});
  }catch(e){ res.json({isolations:[]}); }
});
app.delete('/api/penc/admin/isolation/:id', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    await _pgPool.query('DELETE FROM penc_isolations WHERE id=$1',[req.params.id]);
    await _loadIso();
    res.json({success:true});
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
// ── Etape 2 : moderation temps reel ───────────────────────────
let _pencBlocked = new Set();
async function _loadBlocked(){
  try{ if(!_pgPool) return; const r=await _pgPool.query("SELECT id FROM penc_users WHERE suspended=TRUE OR blocked=TRUE OR deleted_at IS NOT NULL"); const set=new Set(); r.rows.forEach(function(x){ set.add(String(x.id)); }); _pencBlocked=set; }catch(e){ console.error('_loadBlocked', e.message); }
}
async function _forceLogout(userId, reason){
  try{ _pencBlocked.add(String(userId));
    try{ io.to('user:'+String(userId)).emit('admin:forcelogout', { reason: reason||'suspended' }); }catch(e){}
    try{ const socks=await io.in('user:'+String(userId)).fetchSockets(); socks.forEach(function(sk){ try{ sk.disconnect(true); }catch(_){} }); }catch(e){}
    try{ pencOnline.delete(String(userId)); }catch(e){}
  }catch(e){ console.error('_forceLogout', e.message); }
}
async function _purgeTrash(){
  try{ if(!_pgPool) return; const r=await _pgPool.query("SELECT id FROM penc_users WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '60 days'");
    for(const row of r.rows){ const uid=row.id;
      try{ await _pgPool.query('DELETE FROM penc_messages WHERE sender_id=$1',[uid]); }catch(e){}
      try{ await _pgPool.query('DELETE FROM penc_statuses WHERE user_id=$1',[uid]); }catch(e){}
      try{ await _pgPool.query('DELETE FROM penc_status_comments WHERE user_id=$1',[uid]); }catch(e){}
      try{ await _pgPool.query('DELETE FROM penc_friendships WHERE requester=$1 OR recipient=$1',[uid]); }catch(e){}
      try{ await _pgPool.query('DELETE FROM penc_users WHERE id=$1',[uid]); }catch(e){}
    }
    if(r.rows.length) console.log('[purge] '+r.rows.length+' compte(s) purge(s) apres 30j');
  }catch(e){ console.error('_purgeTrash', e.message); }
}
setTimeout(_loadBlocked, 8000); setInterval(_loadBlocked, 60000);
var _pencIso = new Set();
function _isoKey(a,b){ a=String(a); b=String(b); return a<b ? a+'|'+b : b+'|'+a; }
function _areIsolated(a,b){ try{ return _pencIso.has(_isoKey(a,b)); }catch(e){ return false; } }
async function _loadIso(){ try{ if(!_pgPool) return; const r=await _pgPool.query("SELECT user_a,user_b FROM penc_isolations"); const set=new Set(); r.rows.forEach(function(x){ set.add(_isoKey(x.user_a,x.user_b)); }); _pencIso=set; }catch(e){ console.error('_loadIso', e.message); } }
setTimeout(_loadIso, 9000); setInterval(_loadIso, 60000);
setTimeout(_purgeTrash, 20000); setInterval(_purgeTrash, 6*3600*1000);
app.get('/api/penc/admin/overview', pencAuth, pencAdmin, async (req, res) => {
  try {
    const users = await pgAllUsersMerged();
    let convs = [], statuses = [], msgsCount = 0;
    if (_pgPool) {
      try { const cr = await _pgPool.query('SELECT participants FROM penc_conversations'); convs = cr.rows.map(r => ({ members: Array.isArray(r.participants)?r.participants:JSON.parse(r.participants||'[]') })); } catch (e) {}
      try { const sr = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_statuses'); statuses = new Array(sr.rows[0].n); } catch (e) {}
      try { const mr = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_messages'); msgsCount = mr.rows[0].n; } catch (e) {}
    } else {
      try { convs = await pencConvs(); } catch (e) {}
      try { statuses = await pencStatuses(); } catch (e) {}
      try { msgsCount = (await pencMsgs()).length; } catch (e) {}
    }
    const enrich = (u) => { const vv = u.valid_views || 0; const earned = Math.floor(vv / 1000) * 75; const withdrawn = u.withdrawn || 0; return {
      id: u.id, full_name: (u.full_name && String(u.full_name).trim() && String(u.full_name).trim().toLowerCase()!=='utilisateur') ? u.full_name : (u.username || 'Utilisateur'), username: u.username, phone: u.phone, email: u.email || '', avatar_url: u.avatar_url || null,
      valid_views: vv, own_views: u.own_views || 0, earned, withdrawn, balance: Math.max(0, earned - withdrawn),
      contacts: pencContactsCount(convs, u.id), reward_pending: !!u.reward_pending, withdraw_request: u.withdraw_request || null, created_at: u.created_at,
      geo: u.geo || null, total_time_seconds: u.total_time_seconds || 0, last_seen: u.last_seen || null,
      msgs_sent:(_msgMap[String(u.id)]||0), is_moderator:!!(_modMap[String(u.id)]||{}).moderator, muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended, blocked:!!(_modMap[String(u.id)]||{}).blocked, verified:!!u.verified };
    };
    const _modMap={}; try{ if(_pgPool){ const _mq=await _pgPool.query('SELECT id, muted_until, suspended, moderator, blocked FROM penc_users'); _mq.rows.forEach(function(r){ _modMap[String(r.id)]={muted_until:r.muted_until||null, suspended:!!r.suspended, moderator:!!r.moderator, blocked:!!r.blocked}; }); } }catch(_e){}
    const _msgMap={}; try{ if(_pgPool){ const _qq=await _pgPool.query('SELECT sender_id, COUNT(*)::int c FROM penc_messages GROUP BY sender_id'); _qq.rows.forEach(function(r){ _msgMap[String(r.sender_id)]=r.c; }); } }catch(_e){}
    let _del=new Set(); try{ if(_pgPool){ const _dq=await _pgPool.query("SELECT id FROM penc_users WHERE deleted_at IS NOT NULL"); _dq.rows.forEach(function(r){ _del.add(String(r.id)); }); } }catch(_e){}
    const all = users.filter(function(u){ return !_del.has(String(u.id)); }).map(enrich);
    const withdrawals = all.filter(u => u.withdraw_request && u.withdraw_request.status === 'pending');
    const rewardAlerts = all.filter(u => u.reward_pending);
    const totalValidViews = all.reduce((a, u) => a + u.valid_views, 0);
    res.json({
      stats: { users: users.length, conversations: convs.length, statuses: statuses.length, messages: msgsCount, total_valid_views: totalValidViews },
      withdrawals, rewardAlerts,
      users: all.sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/analytics', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ series:{signups:[],messages:[],statuses:[],views:[]}, realtime:{online:0,messages_today:0,ad_revenue_month:0} });
    const dayCounts = async (table) => {
      const q = await _pgPool.query("SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') d, COUNT(*)::int c FROM " + table + " WHERE created_at >= NOW() - INTERVAL '29 days' GROUP BY d");
      const map = {}; q.rows.forEach(r => { map[r.d] = r.c; });
      const out = [];
      for (let i = 29; i >= 0; i--) { const key = new Date(Date.now() - i*86400000).toISOString().slice(0,10); out.push({ date: key, count: map[key] || 0 }); }
      return out;
    };
    let signups=[], messages=[], statuses=[], views=[];
    try { signups  = await dayCounts('penc_users'); } catch(e){}
    try { messages = await dayCounts('penc_messages'); } catch(e){}
    try { statuses = await dayCounts('penc_statuses'); } catch(e){}
    try { views    = await dayCounts('penc_ad_revenue'); } catch(e){}
    let messages_today = 0, ad_revenue_month = 0, online = 0;
    try { const t = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_messages WHERE created_at >= date_trunc('day', NOW())"); messages_today = t.rows[0].c; } catch(e){}
    try { const m = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int s FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW())"); ad_revenue_month = m.rows[0].s; } catch(e){}
    try { online = pencOnline.size; } catch(e){}
    res.json({ series:{signups,messages,statuses,views}, realtime:{online, messages_today, ad_revenue_month} });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/withdraw/approve', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    const users = await pencUsers();
    const u = users.find(x => x.id === user_id);
    if (!u || !u.withdraw_request) return res.status(404).json({ error: 'Aucune demande' });
    u.withdrawn = (u.withdrawn || 0) + (u.withdraw_request.amount || 0);
    u.withdraw_request.status = 'paid';
    u.withdraw_request.paid_at = new Date().toISOString();
    u.reward_pending = false;
    await pencSaveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/finance', pencAuth, pencAdmin, async (req, res) => {
  try {
    let allTime = { total:0, creators:0, penc:0, reserve:0 };
    let month   = { total:0, creators:0, penc:0, reserve:0 };
    let months = [];
    if (_pgPool) {
      try { const a = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p, COALESCE(SUM(reserve_share),0)::int r FROM penc_ad_revenue"); allTime = { total:a.rows[0].t, creators:a.rows[0].c, penc:a.rows[0].p, reserve:a.rows[0].r }; } catch(e){}
      try { const m = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p, COALESCE(SUM(reserve_share),0)::int r FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW())"); month = { total:m.rows[0].t, creators:m.rows[0].c, penc:m.rows[0].p, reserve:m.rows[0].r }; } catch(e){}
      try { const mm = await _pgPool.query("SELECT to_char(date_trunc('month', created_at),'YYYY-MM') m, COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months' GROUP BY m ORDER BY m"); months = mm.rows.map(function(x){ return { month:x.m, total:x.t, creators:x.c, penc:x.p }; }); } catch(e){}
    }
    const users = _pgPool ? (await pgAllUsers()||[]) : await pencUsers();
    const enrich = (u) => { const vv=u.valid_views||0; const earned=Math.floor(vv/1000)*75; const withdrawn=u.withdrawn||0; return { id:u.id, full_name:u.full_name, username:u.username, phone:u.phone, avatar_url:u.avatar_url||null, valid_views:vv, earned, withdrawn, balance:Math.max(0,earned-withdrawn), withdraw_request:u.withdraw_request||null }; };
    const all = users.map(enrich);
    const topCreators = all.filter(u=>u.earned>0).sort((a,b)=>b.earned-a.earned).slice(0,20);
    const pendingWithdrawals = all.filter(u=>u.withdraw_request && u.withdraw_request.status==='pending');
    const paidHistory = all.filter(u=>u.withdraw_request && u.withdraw_request.status==='paid').sort(function(a,b){ return new Date(b.withdraw_request.paid_at||0)-new Date(a.withdraw_request.paid_at||0); }).slice(0,50);
    const totalPaidOut = all.reduce((a,u)=>a+(u.withdrawn||0),0);
    res.json({ allTime, month, months, topCreators, pendingWithdrawals, paidHistory, totalPaidOut });
  } catch (e) { res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/withdraw/reject', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    const users = await pencUsers();
    const u = users.find(x => x.id === user_id);
    if (!u || !u.withdraw_request) return res.status(404).json({ error: 'Aucune demande' });
    u.withdraw_request.status = 'rejected';
    u.withdraw_request.rejected_at = new Date().toISOString();
    u.reward_pending = false;
    await pencSaveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/verified', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ ids: [] });
    const r = await _pgPool.query('SELECT id FROM penc_users WHERE verified=TRUE');
    res.json({ ids: r.rows.map(x => String(x.id)) });
  } catch (e) { res.json({ ids: [] }); }
});
app.post('/api/penc/admin/verify/:userId', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const v = !!(req.body && req.body.verified);
    const type = (req.body && req.body.type) || (v ? 'admin' : null);
    await _pgPool.query('UPDATE penc_users SET verified=$1, verified_type=$2, verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END WHERE id=$3', [v, type, req.params.userId]);
    try { emitToUsers(String(req.params.userId), 'penc:verified', { verified: v }); } catch(e){}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/verify/request', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const { doc_url, doc_url2, note, type } = req.body || {};
    if (!doc_url && (type||'id') !== 'subscription') return res.status(400).json({ error: 'Document requis' });
    const uid = req.pencUser.userId;
    await _pgPool.query("UPDATE penc_verif_requests SET status='cancelled' WHERE user_id=$1 AND status='pending'", [uid]);
    const id = 'vrq_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_verif_requests(id, user_id, doc_url, doc_url2, type, note, status, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id, uid, doc_url, (doc_url2||null), (type||'id'), (note||null), 'pending']);
    res.json({ success: true });
  } catch (e) { console.error('verify/request:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/verify/status', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ verified:false, pending:false });
    const uid = req.pencUser.userId;
    let verified = false;
    try { const u = await pgFindUser('id', uid); verified = !!(u && u.verified); } catch(e){}
    let pending = false;
    try { const r = await _pgPool.query("SELECT 1 FROM penc_verif_requests WHERE user_id=$1 AND status='pending' LIMIT 1",[uid]); pending = r.rows.length>0; } catch(e){}
    res.json({ verified, pending });
  } catch (e) { res.json({ verified:false, pending:false }); }
});
app.get('/api/penc/admin/verify-requests', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ requests: [] });
    const r = await _pgPool.query("SELECT vr.*, u.full_name AS _name, u.username AS _un, u.phone AS _phone, u.avatar_url AS _av, u.verified AS _verified FROM penc_verif_requests vr LEFT JOIN penc_users u ON u.id=vr.user_id WHERE vr.status='pending' ORDER BY vr.created_at DESC LIMIT 200");
    const requests = r.rows.map(function(x){ return { id:x.id, user_id:x.user_id, name:(x._name||x._un||'Utilisateur'), username:x._un||'', phone:x._phone||'', avatar_url:x._av||null, already_verified:!!x._verified, doc_url:x.doc_url, doc_url2:x.doc_url2, type:x.type, note:x.note, created_at:x.created_at }; });
    res.json({ requests });
  } catch (e) { res.json({ requests: [] }); }
});
app.post('/api/penc/admin/verify-requests/:id/approve', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const rq = await _pgPool.query('SELECT user_id FROM penc_verif_requests WHERE id=$1', [req.params.id]);
    if (!rq.rows.length) return res.status(404).json({ error: 'Introuvable' });
    const uid = rq.rows[0].user_id;
    await _pgPool.query("UPDATE penc_verif_requests SET status='approved' WHERE id=$1", [req.params.id]);
    await _pgPool.query("UPDATE penc_users SET verified=TRUE, verified_type='id', verified_at=NOW() WHERE id=$1", [uid]);
    try { emitToUsers(String(uid), 'penc:verified', { verified: true }); } catch(e){}
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/verify-requests/:id/reject', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    await _pgPool.query("UPDATE penc_verif_requests SET status='rejected' WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/broadcast', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { title, body, url } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'Message requis' });
    const data = { title: (title||'Penc'), body: String(body), url: (url||'/messager') };
    let liveCount = 0;
    try { liveCount = io.engine && io.engine.clientsCount || 0; } catch(e){}
    try { io.emit('penc:broadcast', data); } catch(e){}
    let sent = 0, total = 0;
    if (webpush) {
      const payload = JSON.stringify({ title: data.title, body: data.body, tag: 'penc-broadcast', url: data.url });
      const subs = await pencPushSubs(); total = subs.length;
      const dead = [];
      for (const sb of subs) {
        try { await webpush.sendNotification(sb.subscription, payload); sent++; }
        catch (err) { if (err && (err.statusCode===404||err.statusCode===410) && sb.subscription) dead.push(sb.subscription.endpoint); }
      }
      if (dead.length) { try { const all = await pencPushSubs(); await pencSavePushSubs(all.filter(z => !(z.subscription && dead.includes(z.subscription.endpoint)))); } catch(e){} }
    }
    res.json({ success: true, sent, total, liveCount });
  } catch (e) { console.error('broadcast:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
// POST /api/penc/admin/broadcast-email — diffusion email (annonces, rappels, mises a jour) via Resend
// GET /api/penc/email/unsubscribe — desinscription des emails groupes via lien signe dans l'email
app.get('/api/penc/email/unsubscribe', async (req, res) => {
  try{
    const token = req.query.token;
    if(!token) return res.status(400).send('Lien invalide.');
    let payload;
    try{ payload = jwt_penc.verify(String(token), PENC_SECRET); }catch(e){ return res.status(400).send('Lien invalide ou expire.'); }
    if(!payload || payload.purpose !== 'email_unsub') return res.status(400).send('Lien invalide.');
    if(_pgPool){ await _pgPool.query('UPDATE penc_users SET email_opt_out=TRUE WHERE id=$1', [payload.userId]); }
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#333;"><h2 style="color:#12388C;">Vous etes desinscrit</h2><p>Vous ne recevrez plus les emails groupes de Penc (annonces, rappels, mises a jour). Les emails de securite (reinitialisation de mot de passe) continueront de fonctionner normalement.</p></body></html>');
  }catch(e){ res.status(500).send('Erreur serveur.'); }
});
// Suivi des diffusions email : stocke les IDs Resend renvoyés pour vérifier ensuite la
// livraison réelle (délivré / rebond / etc.) via l'API Resend. En mémoire (perdu au redémarrage,
// suffisant pour un contrôle admin ponctuel juste après l'envoi).
var _bcastEmailStore = {};
app.post('/api/penc/admin/broadcast-email', pencAuth, pencAdmin, async (req, res) => {
  try{
    const { subject, message } = req.body || {};
    if(!subject || !String(subject).trim()) return res.status(400).json({ error: 'Sujet requis' });
    if(!message || !String(message).trim()) return res.status(400).json({ error: 'Message requis' });
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if(!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY non configuree' });
    if(!_pgPool) return res.status(500).json({ error: 'Base de donnees indisponible' });

    const r = await _pgPool.query("SELECT id, email, full_name FROM penc_users WHERE email IS NOT NULL AND email != '' AND COALESCE(email_opt_out,FALSE) = FALSE");
    // Filtrage des adresses mal formées : l'API Resend rejette le LOT ENTIER si une seule
    // adresse est invalide, donc on les écarte ici pour ne plus jamais bloquer tout le monde.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allRows = r.rows;
    const recipients = allRows.filter(function(u){ return EMAIL_RE.test(String(u.email||'').trim()); });
    const invalidCount = allRows.length - recipients.length;
    const invalidSamples = allRows.filter(function(u){ return !EMAIL_RE.test(String(u.email||'').trim()); }).slice(0,5).map(function(u){ return u.email; });
    if(invalidCount>0) console.log('[broadcast-email]', invalidCount, 'email(s) invalide(s) ignore(s), ex:', invalidSamples.join(', '));
    const total = recipients.length;
    if(!total) return res.json({ success:true, sent:0, total:0, invalid:invalidCount });

    // Corps HTML : le message est saisi en texte simple, converti en paragraphes
    const bodyHtml = String(message).split('\n').filter(function(l){ return l.trim(); })
      .map(function(l){ return '<p style="margin:0 0 14px;color:#333;font-size:15px;line-height:1.6;">'+l+'</p>'; }).join('');

    // Resend batch API : max 100 destinataires par appel — chaque email a son propre lien de desinscription
    let sent = 0;
    const chunkErrors = [];
    const resendIds = [];
    const CHUNK = 100;
    for(let i=0; i<recipients.length; i+=CHUNK){
      const chunk = recipients.slice(i, i+CHUNK);
      const payload = chunk.map(function(u){
        const unsubToken = jwt_penc.sign({ userId:u.id, purpose:'email_unsub' }, PENC_SECRET, { expiresIn:'365d' });
        const unsubUrl = 'https://api.penc-messagerie.com/api/penc/email/unsubscribe?token=' + encodeURIComponent(unsubToken);
        const footerHtml = bodyHtml + '<p style="margin:24px 0 0;color:#AAB2C0;font-size:11.5px;line-height:1.5;"><a href="'+unsubUrl+'" style="color:#AAB2C0;text-decoration:underline;">Se désinscrire de ces emails</a></p>';
        return { from:'Penc <no-reply@penc-messagerie.com>', to:[u.email], subject:String(subject), html:_pencEmailShell(String(subject), footerHtml) };
      });
      try{
        const rr = await fetch('https://api.resend.com/emails/batch', {
          method:'POST',
          headers:{ 'Authorization':'Bearer '+RESEND_API_KEY, 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
        if(rr.ok){
          sent += chunk.length;
          try{ const rd = await rr.json(); if(rd && Array.isArray(rd.data)){ rd.data.forEach(function(o){ if(o&&o.id) resendIds.push(o.id); }); } }catch(_rj){}
        }
        else{ const t = await rr.text().catch(function(){return '';}); console.log('[broadcast-email] ECHEC chunk', i, '-> HTTP', rr.status, t.slice(0,200)); chunkErrors.push('HTTP '+rr.status+' : '+t.slice(0,150)); }
      }catch(e){ console.log('[broadcast-email] EXCEPTION chunk', i, '->', e.message); chunkErrors.push(e.message); }
      // Petite pause entre les lots pour rester sous les limites de debit Resend
      if(i+CHUNK < recipients.length) await new Promise(function(res2){ setTimeout(res2, 600); });
    }
    console.log('[broadcast-email]', sent, '/', total, 'envoyes, sujet:', subject);
    const bcastId = crypto.randomBytes(8).toString('hex');
    _bcastEmailStore[bcastId] = { ids: resendIds, subject: String(subject), ts: Date.now() };
    res.json({ success:true, sent, total, invalid:invalidCount, errors: chunkErrors, broadcastId: bcastId });
  }catch(e){ console.error('broadcast-email:', e.message); res.status(500).json({ error:'Erreur serveur' }); }
});

// Vérification de la livraison réelle d'une diffusion email (statut Resend par destinataire)
app.get('/api/penc/admin/broadcast-email/status/:id', pencAuth, pencAdmin, async (req, res) => {
  try{
    const rec = _bcastEmailStore[req.params.id];
    if(!rec) return res.status(404).json({ error: 'Introuvable (serveur redémarré depuis l\'envoi, ou lien expiré)' });
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if(!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY non configuree' });
    const counts = { delivered:0, bounced:0, complained:0, sent:0, queued:0, other:0 };
    const ids = rec.ids.slice(0, 200); // limite de sécurité par vérification
    for(const id of ids){
      try{
        const rr = await fetch('https://api.resend.com/emails/'+id, { headers:{ 'Authorization':'Bearer '+RESEND_API_KEY } });
        if(rr.ok){
          const d = await rr.json();
          const st = (d && (d.last_event || d.status)) || 'unknown';
          if(st==='delivered') counts.delivered++;
          else if(st==='bounced') counts.bounced++;
          else if(st==='complained') counts.complained++;
          else if(st==='sent' || st==='delivery_delayed') counts.sent++;
          else if(st==='queued') counts.queued++;
          else counts.other++;
        } else counts.other++;
      }catch(_e){ counts.other++; }
    }
    res.json({ success:true, subject: rec.subject, total: rec.ids.length, checked: ids.length, counts, resendDashboard: 'https://resend.com/emails' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});
// GET /api/penc/legal — pages legales personnalisees (publique, utilisee par l'app pour surcharger les textes par defaut)
app.get('/api/penc/legal', async (req, res) => {
  try{
    if(!_pgPool) return res.json({ pages:{} });
    const r = await _pgPool.query('SELECT key, title, html FROM penc_legal_pages');
    const pages = {};
    r.rows.forEach(function(row){ pages[row.key] = { title: row.title, html: row.html }; });
    res.json({ pages });
  }catch(e){ res.json({ pages:{} }); }
});
// PUT /api/penc/admin/legal/:key — creer/mettre a jour une page legale
app.put('/api/penc/admin/legal/:key', pencAuth, pencAdmin, async (req, res) => {
  try{
    const key = req.params.key;
    const { title, html } = req.body || {};
    if(!title || !html) return res.status(400).json({ error: 'Titre et contenu requis' });
    if(!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    await _pgPool.query(
      'INSERT INTO penc_legal_pages(key,title,html,updated_at,updated_by) VALUES($1,$2,$3,NOW(),$4) ON CONFLICT (key) DO UPDATE SET title=$2, html=$3, updated_at=NOW(), updated_by=$4',
      [key, title, html, req.pencAdminUser && req.pencAdminUser.email || null]
    );
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// DELETE /api/penc/admin/legal/:key — revenir au texte par defaut integre a l'app
app.delete('/api/penc/admin/legal/:key', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(_pgPool) await _pgPool.query('DELETE FROM penc_legal_pages WHERE key=$1', [req.params.key]);
    res.json({ success:true });
  }catch(e){ res.status(500).json({ error:'Erreur serveur' }); }
});
// ══════════════ TABLEAU DE BORD APPELS / PENC MEET (admin) ══════════════
// ══════════════ TABLEAU DE BORD CROISSANCE (admin) ══════════════
app.get('/api/penc/admin/growth-dashboard', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error: 'BD indisponible' });
    const totalUsers = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE deleted_at IS NULL");
    const signups7 = await _pgPool.query("SELECT to_char(d.day,'YYYY-MM-DD') AS day, COUNT(u.id)::int AS n FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d(day) LEFT JOIN penc_users u ON u.created_at::date = d.day WHERE 1=1 GROUP BY d.day ORDER BY d.day");
    const signupsToday = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE created_at::date = CURRENT_DATE");
    const signupsWeek = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE created_at > NOW() - INTERVAL '7 days'");
    const signupsMonth = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE created_at > NOW() - INTERVAL '30 days'");
    const activeToday = await _pgPool.query("SELECT COUNT(DISTINCT user_id)::int AS n FROM penc_sessions WHERE last_seen > NOW() - INTERVAL '24 hours'");
    const activeWeek = await _pgPool.query("SELECT COUNT(DISTINCT user_id)::int AS n FROM penc_sessions WHERE last_seen > NOW() - INTERVAL '7 days'");
    const withEmail = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL");
    const deletedCount = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_users WHERE deleted_at IS NOT NULL");
    const langBreakdown = { note: 'Repartition par langue non suivie cote serveur (choix stocke localement sur l\'appareil).' };
    res.json({
      total_users: totalUsers.rows[0].n,
      signups_today: signupsToday.rows[0].n,
      signups_week: signupsWeek.rows[0].n,
      signups_month: signupsMonth.rows[0].n,
      active_today: activeToday.rows[0].n,
      active_week: activeWeek.rows[0].n,
      with_email: withEmail.rows[0].n,
      deleted_accounts: deletedCount.rows[0].n,
      signups_last_7_days: signups7.rows.map(function(r){ return { day: r.day, count: r.n }; })
    });
  }catch(e){ console.error('growth-dashboard:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/calls-dashboard', pencAuth, pencAdmin, async (req, res) => {
  try{
    if(!_pgPool) return res.status(503).json({ error: 'BD indisponible' });

    // ── Appels 1-a-1 (voix + video), stockes comme messages type='call' ──
    const callRows = await _pgPool.query("SELECT content, created_at FROM penc_messages WHERE type='call' AND (deleted_for_all IS NOT TRUE)");
    let voiceCount=0, videoCount=0, voiceSeconds=0, videoSeconds=0;
    let callsToday=0, callsWeek=0;
    const now = Date.now(), dayAgo = now-86400000, weekAgo = now-7*86400000;
    callRows.rows.forEach(function(row){
      let d={}; try{ d=JSON.parse(row.content||'{}'); }catch(_e){}
      const isVideo = d.call_type==='video';
      const dur = (d.status==='answered' && typeof d.duration==='number') ? d.duration : 0;
      if(isVideo){ videoCount++; videoSeconds+=dur; } else { voiceCount++; voiceSeconds+=dur; }
      const t = new Date(row.created_at).getTime();
      if(t>dayAgo) callsToday++;
      if(t>weekAgo) callsWeek++;
    });

    // ── Historique Penc Meet (table persistante) ──
    const meetHistRows = await _pgPool.query(
      "SELECT code, MAX(title) AS title, MAX(host) AS host, MIN(joined_at) AS started_at, MAX(COALESCE(left_at, joined_at)) AS ended_at, COUNT(DISTINCT participant)::int AS participants " +
      "FROM penc_meet_history GROUP BY code ORDER BY MIN(joined_at) DESC LIMIT 50"
    );
    const meetTotalSessions = await _pgPool.query("SELECT COUNT(DISTINCT code)::int AS n FROM penc_meet_history");
    const meetTotalJoins = await _pgPool.query("SELECT COUNT(*)::int AS n FROM penc_meet_history");

    // Noms complets pour l'historique (host + participants), en un seul aller-retour
    const hostIds = Array.from(new Set(meetHistRows.rows.map(function(r){return r.host;}).filter(Boolean)));
    let hostNames = {};
    if(hostIds.length){
      const hu = await _pgPool.query('SELECT id, full_name FROM penc_users WHERE id = ANY($1)', [hostIds]);
      hu.rows.forEach(function(u){ hostNames[u.id]=u.full_name; });
    }

    // ── Reunions Penc Meet EN COURS, en temps reel (mémoire serveur) ──
    const activeMeets = Object.keys(_meetRooms).map(function(code){
      const room = _meetRooms[code];
      const peerList = Object.values(room.peers||{}).map(function(p){ return p.name||'Participant'; });
      return {
        code: code,
        title: room.title || '(sans titre)',
        host: hostNames[room.host] || room.host || '?',
        participant_count: peerList.length,
        participants: peerList,
        started_at: new Date(room.createdAt).toISOString(),
        duration_seconds: Math.round((Date.now()-room.createdAt)/1000)
      };
    }).filter(function(m){ return m.participant_count > 0; });
    const activeTotalParticipants = activeMeets.reduce(function(a,m){ return a+m.participant_count; }, 0);

    res.json({
      calls: {
        voice_total: voiceCount, video_total: videoCount,
        voice_minutes: Math.round(voiceSeconds/60), video_minutes: Math.round(videoSeconds/60),
        total_minutes: Math.round((voiceSeconds+videoSeconds)/60),
        calls_today: callsToday, calls_week: callsWeek
      },
      meet: {
        total_sessions: (meetTotalSessions.rows[0]&&meetTotalSessions.rows[0].n)||0,
        total_joins: (meetTotalJoins.rows[0]&&meetTotalJoins.rows[0].n)||0,
        history: meetHistRows.rows.map(function(r){
          return {
            code: r.code, title: r.title||'(sans titre)', host: hostNames[r.host]||r.host||'?',
            participants: r.participants, started_at: r.started_at, ended_at: r.ended_at
          };
        }),
        active: activeMeets,
        active_count: activeMeets.length,
        active_total_participants: activeTotalParticipants
      }
    });
  }catch(e){ console.error('calls-dashboard:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/security', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] });
    let logs=[], failed_24h=0, errors_24h=0, suspended=[], moderators=[];
    try { const r = await _pgPool.query("SELECT * FROM penc_security_logs ORDER BY created_at DESC LIMIT 100"); logs = r.rows; } catch(e){}
    try { const f = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='login_failed' AND created_at >= NOW() - INTERVAL '24 hours'"); failed_24h = f.rows[0].c; } catch(e){}
    try { const ce = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='client_error' AND created_at >= NOW() - INTERVAL '24 hours'"); errors_24h = ce.rows[0].c; } catch(e){}
    try { const sq = await _pgPool.query("SELECT id, full_name, username, phone FROM penc_users WHERE suspended=TRUE LIMIT 100"); suspended = sq.rows; } catch(e){}
    try { const m = await _pgPool.query("SELECT id, full_name, username FROM penc_users WHERE moderator=TRUE LIMIT 100"); moderators = m.rows; } catch(e){}
    res.json({ logs, failed_24h, errors_24h, suspended, moderators });
  } catch (e) { res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] }); }
});
app.post('/api/penc/client-log', async (req, res) => {
  try {
    if (!_pgPool) return res.json({ ok: true });
    let uid = null;
    try { const a=(req.headers.authorization||'').replace('Bearer ',''); if(a){ const dec=jwt_penc.verify(a, PENC_SECRET); uid=dec&&dec.userId; } } catch(e){}
    const { message, detail } = req.body || {};
    if (!message) return res.json({ ok: true });
    const id='cer_'+Date.now()+Math.random().toString(36).slice(2);
    const ua=String(req.headers['user-agent']||'').slice(0,300);
    const ip=((req.headers['x-forwarded-for']||'').split(',')[0].trim())||req.ip||'';
    const det=String(message).slice(0,200)+(detail?(' | '+String(detail).slice(0,300)):'');
    await _pgPool.query('INSERT INTO penc_security_logs(id,type,user_id,identifier,ip,user_agent,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW())', [id,'client_error',uid,null,ip,ua,det]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: true }); }
});
// ── Modération admin (Fonct. 5) ──
app.get('/api/penc/admin/user/:id/statuses', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({statuses:[]});
    const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE user_id=$1 ORDER BY created_at DESC',[req.params.id]);
    const out=r.rows.map(function(row){ const s=pgStatusToObj(row); return {id:s.id, type:s.type, media_url:s.media_url||null, text_content:s.text_content||null, bg_color:s.bg_color||null, caption:s.caption||null, created_at:s.created_at, views:Array.isArray(s.views)?s.views.length:0, likes:Array.isArray(s.reactions)?s.reactions.length:0, shares:s.shares||0}; });
    res.json({statuses:out}); }catch(e){ res.json({statuses:[]}); }
});
app.post('/api/penc/report', pencAuth, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const { target_type, target_id, target_user_id, reason, content_snapshot } = req.body || {};
    const id = 'rep_' + Date.now() + Math.random().toString(36).slice(2);
    await _pgPool.query('INSERT INTO penc_reports(id, reporter_id, target_type, target_id, target_user_id, reason, content_snapshot, status, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())', [id, req.pencUser.userId, (target_type||'status'), (target_id||null), (target_user_id||null), (reason||'Non precise'), (content_snapshot||null), 'pending']);
    res.json({ success: true });
  } catch (e) { console.error('report:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/reports', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ reports: [] });
    const r = await _pgPool.query("SELECT rep.*, ru.full_name AS _rep_name, tu.full_name AS _tgt_name, tu.username AS _tgt_un FROM penc_reports rep LEFT JOIN penc_users ru ON ru.id=rep.reporter_id LEFT JOIN penc_users tu ON tu.id=rep.target_user_id WHERE rep.status='pending' ORDER BY rep.created_at DESC LIMIT 200");
    const reports = r.rows.map(function(x){ return { id:x.id, reporter:(x._rep_name||'Utilisateur'), target_type:x.target_type, target_id:x.target_id, target_user_id:x.target_user_id, target_owner:(x._tgt_name||x._tgt_un||'Inconnu'), reason:x.reason, content_snapshot:x.content_snapshot, created_at:x.created_at }; });
    res.json({ reports });
  } catch (e) { res.json({ reports: [] }); }
});
app.post('/api/penc/admin/reports/:id/resolve', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ success: true });
    const st = (req.body && req.body.status === 'resolved') ? 'resolved' : 'dismissed';
    await _pgPool.query('UPDATE penc_reports SET status=$1 WHERE id=$2', [st, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/official-status', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { type, media_url, text_content, bg_color, caption, duration, expires_hours } = req.body || {};
    let _offExp;
    if(expires_hours==='permanent' || expires_hours===0 || expires_hours==='0'){ _offExp = new Date(Date.now() + 3650*86400000).toISOString(); }
    else { let _h=parseInt(expires_hours,10); if(!(_h>0)) _h=24; _offExp = new Date(Date.now() + _h*3600*1000).toISOString(); }
    const status = {
      id: 'st_' + Date.now() + Math.random().toString(36).slice(2),
      user_id: 'penc_official', type: type || 'text',
      media_url: media_url || null, text_content: text_content || null,
      bg_color: bg_color || '#0E8C7C', caption: caption || null,
      duration: (typeof duration === 'number' && duration > 0 && duration <= 60) ? Math.round(duration) : (type === 'video' ? 0 : 10),
      reactions: [], views: [], view_ips: [],
      created_at: new Date().toISOString(),
      expires_at: _offExp
    };
    if (_pgPool) { await pgSaveStatus(status); }
    else { const statuses = await pencStatuses(); statuses.push(status); await pencSaveStatuses(statuses); }
    res.json({ status, success: true });
  } catch (e) { console.error('official-status:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/statuses', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ statuses: [] });
    const r = await _pgPool.query('SELECT s.*, u.full_name AS _fn, u.username AS _un FROM penc_statuses s LEFT JOIN penc_users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 300');
    const out = r.rows.map(function(row){ const x = pgStatusToObj(row); return { id:x.id, user_id:row.user_id, owner:(row._fn||row._un||'Inconnu'), type:x.type, media_url:x.media_url||null, text_content:x.text_content||null, bg_color:x.bg_color||null, caption:x.caption||null, created_at:x.created_at, views:Array.isArray(x.views)?x.views.length:0, likes:Array.isArray(x.reactions)?x.reactions.length:0 }; });
    res.json({ statuses: out });
  } catch (e) { res.json({ statuses: [] }); }
});
app.delete('/api/penc/admin/statuses/:id', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(_pgPool) await _pgPool.query('DELETE FROM penc_statuses WHERE id=$1',[req.params.id]); res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/admin/mute/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const mode=(req.body&&req.body.mode)||'24h';
    if(mode==='off'){ await _pgPool.query('UPDATE penc_users SET muted_until=NULL WHERE id=$1',[req.params.userId]); }
    else { let intv="24 hours"; if(mode==='7d') intv="7 days"; else if(mode==='perm') intv="100 years"; await _pgPool.query("UPDATE penc_users SET muted_until = NOW() + INTERVAL '"+intv+"' WHERE id=$1",[req.params.userId]); }
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/admin/suspend/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const susp=!!(req.body&&req.body.suspend);
    await _pgPool.query('UPDATE penc_users SET suspended=$1 WHERE id=$2',[susp,req.params.userId]);
    if(susp){ await _forceLogout(req.params.userId,'suspended'); } else { _pencBlocked.delete(String(req.params.userId)); await _loadBlocked(); }
    pencSecLog(susp?'user_suspended':'user_unsuspended', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null});
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/admin/message/:userId', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.status(503).json({ error: 'BD non disponible' });
    const adminId = req.pencUser.userId;
    const target = req.params.userId;
    const content = ((req.body && req.body.content) || '').toString().trim();
    if (!content) return res.status(400).json({ error: 'Message vide' });
    if (String(target) === String(adminId)) return res.status(400).json({ error: 'Destinataire invalide' });
    const conv = await pgGetOrCreateConv('penc_official', target);
    if (!conv) return res.status(500).json({ error: 'Conversation impossible' });
    const msg = {
      id: 'msg_' + Date.now() + Math.random().toString(36).slice(2),
      conversation_id: conv.id, sender_id: 'penc_official', reply_to: null,
      type: 'text', content: content, media_url: null, media_duration: null,
      client_id: null, created_at: new Date().toISOString(), read_at: null
    };
    let sender = { id: 'penc_official' };
    try { const u = await pgFindUser('id', 'penc_official'); if (u) sender = pencStrip(u); } catch (_) {}
    const fullMsg = { ...msg, sender };
    try { io.to('penc:' + conv.id).emit('message:new', fullMsg); } catch (_) {}
    try { io.to('user:' + String(target)).emit('message:new', fullMsg); } catch (_) {}
    try { io.to('user:' + String('penc_official')).emit('message:new', fullMsg); } catch (_) {}
    try { await pgSaveMessage({ id: msg.id, conversation_id: msg.conversation_id, sender_id: msg.sender_id, type: 'text', content: content, media_url: null, duration: null, reply_to: null, created_at: msg.created_at, client_id: null }); } catch (e) { console.error('admin dm persist:', e.message); }
    try { if (typeof webpush !== 'undefined' && webpush) { const ptitle = (sender && sender.full_name) ? sender.full_name : 'Nouveau message'; await sendPencPush(target, { title: ptitle, body: pencMsgBody('text', content), tag: 'penc-' + conv.id, url: '/messager?conv=' + conv.id, conv_id: conv.id }); } } catch (_pp) {}
    return res.json({ success: true, message: fullMsg, conversation_id: conv.id });
  } catch (e) { return res.status(500).json({ error: 'Erreur envoi' }); }
});
app.post('/api/penc/admin/moderator/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const mod=!!(req.body&&req.body.moderator);
    await _pgPool.query('UPDATE penc_users SET moderator=$1 WHERE id=$2',[mod,req.params.userId]);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/admin/block/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const blk=!!(req.body&&req.body.block);
    await _pgPool.query('UPDATE penc_users SET blocked=$1 WHERE id=$2',[blk,req.params.userId]);
    if(blk){ await _forceLogout(req.params.userId,'blocked'); } else { _pencBlocked.delete(String(req.params.userId)); await _loadBlocked(); }
    try{ pencSecLog(blk?'user_blocked':'user_unblocked', req, {user_id:req.params.userId, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.get('/api/penc/admin/deleted', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({deleted:[]});
    const r=await _pgPool.query("SELECT id,full_name,username,email,phone,avatar_url,deleted_at FROM penc_users WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
    res.json({deleted:r.rows.map(function(x){ return {id:x.id,full_name:x.full_name,username:x.username,email:x.email||'',phone:x.phone||'',avatar_url:x.avatar_url||null,deleted_at:x.deleted_at}; })}); }catch(e){ res.json({deleted:[]}); }
});
app.post('/api/penc/admin/user/:id/restore', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    await _pgPool.query('UPDATE penc_users SET deleted_at=NULL, suspended=FALSE, blocked=FALSE WHERE id=$1',[req.params.id]);
    _pencBlocked.delete(String(req.params.id));
    try{ pencSecLog('user_restored', req, {user_id:req.params.id, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
// DELETE /api/penc/account — suppression de compte en libre-service (l'utilisateur lui-meme)
// Reutilise le meme mecanisme de soft-delete + purge a 30 jours que la suppression admin.
// ══════════════ SUPPRESSION DE COMPTE : mot de passe -> code de confirmation -> suppression reelle ══════════════
const _pencDeletePending = new Map(); // userId -> { code, expiresAt, attempts }
// Etape 1/2 : verifie le mot de passe, envoie un code de confirmation (email si dispo, sinon SMS)
app.post('/api/penc/account/delete/request', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const password = req.body && req.body.password;
    if (!password) return res.status(400).json({ error: 'Mot de passe requis pour confirmer' });
    if (!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    const user = await pgFindUser('id', uid);
    if (!user) return res.status(404).json({ error: 'Compte introuvable' });
    if (PENC_ADMIN_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return res.status(400).json({ error: 'Les comptes administrateurs ne peuvent pas être supprimés depuis l\'app. Contacte le support.' });
    }
    const hash = user.password_hash || user.password || '';
    const pwOk = bcrypt_penc ? await bcrypt_penc.compare(password, hash) : password === hash;
    if (!pwOk) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const code = String(Math.floor(100000+Math.random()*900000));
    _pencDeletePending.set(uid, { code, expiresAt: Date.now()+10*60*1000, attempts:0 });
    setTimeout(function(){ const p=_pencDeletePending.get(uid); if(p && p.code===code){ _pencDeletePending.delete(uid); } }, 10*60*1000);
    let channel = 'aucun';
    if(user.email){ _pencSendDeleteEmail(user.email, code); channel = 'email'; }
    else if(user.phone){ _pencSendResetSMS(user.phone, code); channel = 'sms'; }
    res.json({ success:true, channel: channel });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
async function _pencSendDeleteEmail(email, code){
  try{
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if(!RESEND_API_KEY){ console.log('[account-delete][EMAIL] ECHEC: RESEND_API_KEY non configuree'); return false; }
    const ctrl = new AbortController();
    const timeoutId = setTimeout(function(){ ctrl.abort(); }, 8000);
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Penc <no-reply@penc-messagerie.com>',
        to: [email],
        subject: 'Penc — Confirmation de suppression de compte',
        html: _pencEmailShell(
          'Confirmation de suppression',
          '<p style="margin:0 0 18px;color:#333;font-size:15px;line-height:1.6;">Bonjour,</p>'+
          '<p style="margin:0 0 22px;color:#333;font-size:15px;line-height:1.6;">Vous avez demandé la suppression de votre compte Penc. Voici votre code de confirmation :</p>'+
          '<div style="text-align:center;margin:28px 0;"><span style="display:inline-block;background:#FDEDEC;color:#C0392B;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 28px;border-radius:14px;border:1px solid #F5C6C0;">'+code+'</span></div>'+
          '<p style="margin:0 0 22px;color:#666;font-size:14px;line-height:1.6;">Ce code est valable pendant <b>10 minutes</b>. Une fois confirmé, vous aurez <b>60 jours</b> pour annuler la suppression en te reconnectant.</p>'+
          '<div style="background:#FFF6E5;border:1px solid #FFE1A8;border-radius:12px;padding:14px 16px;margin-top:24px;">'+
          '<p style="margin:0;color:#8A5A00;font-size:13.5px;line-height:1.5;">⚠️ <b>Vous n\'êtes pas à l\'origine de cette demande ?</b><br/>Ignorez simplement cet email — ton compte ne sera pas supprimé sans ce code.</p>'+
          '</div>'
        )
      }),
      signal: ctrl.signal
    });
    clearTimeout(timeoutId);
    console.log('[account-delete][EMAIL]', email, '->', r.ok ? 'OK' : ('ECHEC HTTP '+r.status));
    return r.ok;
  }catch(e){ console.log('[account-delete][EMAIL] EXCEPTION:', email, '->', e.message); return false; }
}
// Etape 2/2 : verifie le code, execute la suppression (soft-delete, 60 jours avant purge definitive)
app.post('/api/penc/account/delete/confirm', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    const code = req.body && req.body.code;
    if (!code) return res.status(400).json({ error: 'Code requis' });
    const p = _pencDeletePending.get(uid);
    if (!p || p.expiresAt < Date.now()) return res.status(400).json({ error: 'Code invalide ou expiré, recommence' });
    p.attempts = (p.attempts||0)+1;
    if (p.attempts > 5) { _pencDeletePending.delete(uid); return res.status(429).json({ error: 'Trop de tentatives, redemande un code' }); }
    if (p.code !== code) return res.status(400).json({ error: 'Code incorrect' });
    _pencDeletePending.delete(uid);
    if (!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    await _pgPool.query('UPDATE penc_users SET deleted_at=NOW(), suspended=TRUE WHERE id=$1', [uid]);
    await _forceLogout(uid, 'self_deleted');
    try{ pencSecLog('user_self_deleted', req, {user_id:uid}); }catch(e){}
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
// Restauration en libre-service : un compte supprime ne peut pas obtenir de jeton via /auth/login,
// cette route verifie donc les identifiants directement (comme un login) et restaure + reconnecte si valide.
// Possible pendant 60 jours (avant purge definitive par _purgeTrash).
app.post('/api/penc/account/restore', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
    if (!_pgPool) return res.status(500).json({ error: 'Base de données indisponible' });
    const id = String(identifier).trim(); const idLow = id.toLowerCase();
    const user = await pgFindUser('phone', id) || await pgFindUser('email', idLow) || await pgFindUser('username', idLow);
    if (!user) return res.status(400).json({ error: 'Compte introuvable' });
    if (!user.deleted_at) return res.status(400).json({ error: 'Ce compte n\'est pas supprimé' });
    const hash = user.password_hash || user.password || '';
    const pwOk = bcrypt_penc ? await bcrypt_penc.compare(password, hash) : password === hash;
    if (!pwOk) return res.status(401).json({ error: 'Mot de passe incorrect' });
    await _pgPool.query('UPDATE penc_users SET deleted_at=NULL, suspended=FALSE WHERE id=$1', [user.id]);
    try{ pencSecLog('user_self_restored', req, {user_id:user.id, identifier:id}); }catch(e){}
    // Reconnexion immediate : on renvoie un jeton pour eviter a l'utilisateur de retaper ses identifiants
    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: user.id, sid: _sid }, PENC_SECRET, { expiresIn: '7d' });
    _pencCreateSession(user.id, _sid, req).catch(function(){});
    res.json({ success:true, token: tok, user: pencStrip(user) });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/penc/admin/user/:id', pencAuth, pencAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    let target = null;
    try { if (_pgPool) { const r = await _pgPool.query('SELECT email FROM penc_users WHERE id=$1', [uid]); target = r.rows[0] || null; } } catch (e) {}
    if (target && PENC_ADMIN_EMAILS.includes(String(target.email || '').toLowerCase())) return res.status(400).json({ error: 'Impossible de supprimer un administrateur' });
    if (_pgPool) { try { await _pgPool.query('UPDATE penc_users SET deleted_at=NOW(), suspended=TRUE WHERE id=$1', [uid]); } catch (e) {} }
    await _forceLogout(uid,'deleted');
    try{ pencSecLog('user_trashed', req, {user_id:uid, identifier:(req.pencAdminUser&&req.pencAdminUser.email)||null}); }catch(e){}
    res.json({ success: true, trashed:true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/admin/reward/clear', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    const users = await pencUsers();
    const u = users.find(x => x.id === user_id);
    if (u) { u.reward_pending = false; await pencSaveUsers(users); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/penc/session/ping
app.post('/api/penc/session/ping', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    if (_pgPool) {
      try {
        const _prevSeenR = await _pgPool.query("SELECT last_seen, full_name FROM penc_users WHERE id=$1", [uid]);
        const _prevSeen = _prevSeenR.rows[0];
        await _pgPool.query("UPDATE penc_users SET total_time_seconds = COALESCE(total_time_seconds,0)+300, last_seen=NOW() WHERE id=$1", [uid]);
        if (_prevSeen && _prevSeen.last_seen) {
          const _gapMs = Date.now() - new Date(_prevSeen.last_seen).getTime();
          if (_gapMs >= 24*60*60*1000) {
            _sendPencOfficialDM(uid, _pencWelcomeBackText(_prevSeen.full_name||''), 'Penc', 'Content de te revoir sur Penc ! \ud83d\udc4b', 'penc-welcomeback').catch(function(){});
          }
        }
      } catch(e){}
      try { const gr=await _pgPool.query("SELECT geo FROM penc_users WHERE id=$1",[uid]); const cur=gr.rows[0]?gr.rows[0].geo:null; const hasGeo=cur&&typeof cur==='object'&&cur.country; if(!hasGeo){ const xfRaw=(req.headers['x-forwarded-for']||(req.socket&&req.socket.remoteAddress)||'unknown'); const ip=xfRaw.replace('::ffff:','').split(',')[0].trim(); if(ip&&ip!=='unknown'&&!ip.startsWith('127.')&&!ip.startsWith('10.')&&ip!=='::1'){ getGeoForIp(ip).then(async function(geo){ if(geo){ try{ await _pgPool.query("UPDATE penc_users SET geo=$1::jsonb WHERE id=$2",[JSON.stringify(geo),uid]); }catch(e){} } }).catch(function(){}); } } } catch(e){}
      return res.json({ success:true });
    }
    const users = await pencUsers();
    const u = users.find(x => x.id === uid);
    if (u) {
      u.total_time_seconds = (u.total_time_seconds || 0) + 300;
      u.last_seen = new Date().toISOString();
      const lastGeo = u.last_geo_at ? new Date(u.last_geo_at) : null;
      if (!lastGeo || (Date.now() - lastGeo.getTime()) > 24 * 60 * 60 * 1000) {
        const xfRaw = (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown');
        const ip = xfRaw.replace('::ffff:','').split(',')[0].trim();
        if (ip && ip !== 'unknown' && !ip.startsWith('127.') && !ip.startsWith('10.') && ip !== '::1') {
          getGeoForIp(ip).then(async function(geo) {
            if (geo) {
              const us = await pencUsers();
              const u2 = us.find(x => x.id === uid);
              if (u2) { u2.geo = geo; u2.last_ip = ip; u2.last_geo_at = new Date().toISOString(); await pencSaveUsers(us); }
            }
          }).catch(function() {});
        }
      }
      await pencSaveUsers(users);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ══  PENC CHANNELS  ══
const _rawChBin = process.env.JSONBIN_PENC_CHANNELS_BIN || '';
// Valider que c'est un vrai ID JSONBin (24 chars hex) sinon ignorer
let JSONBIN_PENC_CHANNELS_BIN = /^[a-f0-9]{24}$/i.test(_rawChBin) ? _rawChBin : '';
let _chCache = [];

// Auto-création du bin channels si non configuré
(async function initChannelsBin(){
  if(JSONBIN_PENC_CHANNELS_BIN) { console.log('✅ Channels bin configuré:', JSONBIN_PENC_CHANNELS_BIN); return; }
  if(_rawChBin && !JSONBIN_PENC_CHANNELS_BIN) console.log('⚠️ JSONBIN_PENC_CHANNELS_BIN invalide (\''+_rawChBin+'\') — auto-création...');
  if(!JSONBIN_MASTER_KEY) return;
  try{
    const r=await fetch('https://api.jsonbin.io/v3/b',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Master-Key':JSONBIN_MASTER_KEY,'X-Bin-Name':'penc-channels','X-Bin-Private':'false'},
      body:JSON.stringify([])
    });
    const d=await r.json();
    if(d.metadata && d.metadata.id){
      JSONBIN_PENC_CHANNELS_BIN=d.metadata.id;
      console.log('');
      console.log('╔════════════════════════════╗');
      console.log('║ ✅ BIN CHANNELS CRÉÉ AUTOMATIQUEMENT  ║');
      console.log('╚════════════════════════════╝');
      console.log('➡️  Ajoute dans Render > Environment:');
      console.log('   JSONBIN_PENC_CHANNELS_BIN =', JSONBIN_PENC_CHANNELS_BIN);
      console.log('');
    }
  }catch(e){ console.log('⚠️ Impossible de créer le bin channels:', e.message); }
})();

async function pgGetChannels(){
  if(!_pgPool) return null;
  const r=await _pgPool.query("SELECT data FROM penc_channels ORDER BY (data->>'created_at') ASC NULLS LAST");
  return r.rows.map(function(row){ return row.data; });
}
async function pgSaveChannels(arr){
  if(!_pgPool) return;
  for(const ch of arr){
    await _pgPool.query("INSERT INTO penc_channels(id,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=$2, updated_at=NOW()",[ch.id, JSON.stringify(ch)]);
  }
  const ids=arr.map(function(c){return c.id;});
  if(ids.length) await _pgPool.query("DELETE FROM penc_channels WHERE NOT (id = ANY($1))",[ids]);
  else await _pgPool.query("DELETE FROM penc_channels");
}
async function pencChannels(){
  if(_pgPool){ try{ const c=await pgGetChannels(); if(c){ _chCache=[...c]; return c; } }catch(e){ console.error('pgGetChannels:', e.message); } }
  if(!JSONBIN_PENC_CHANNELS_BIN) return [..._chCache];
  try{
    const r=await fetch('https://api.jsonbin.io/v3/b/'+JSONBIN_PENC_CHANNELS_BIN+'/latest',{headers:{'X-Master-Key':JSONBIN_MASTER_KEY}});
    const d=await r.json();
    _chCache=Array.isArray(d.record)?d.record:[];
    return _chCache;
  }catch(e){ return [..._chCache]; }
}
async function pencSaveChannels(arr){
  _chCache=[...arr];
  if(_pgPool){ try{ await pgSaveChannels(arr); return; }catch(e){ console.error('pgSaveChannels:', e.message); } }
  if(!JSONBIN_PENC_CHANNELS_BIN) return;
  await fetch('https://api.jsonbin.io/v3/b/'+JSONBIN_PENC_CHANNELS_BIN,{method:'PUT',headers:{'Content-Type':'application/json','X-Master-Key':JSONBIN_MASTER_KEY},body:JSON.stringify(arr)});
}
app.get('/api/penc/channels', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels();
    const enriched=channels.map(ch=>({...ch,posts:undefined,post_count:(ch.posts||[]).length,follower_count:(ch.followers||[]).length,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid)),type:ch.type||'broadcast',read_only:!!ch.read_only,can_post:(String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid))||((ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid)))),last_post:(ch.posts||[]).slice(-1)[0]||null}));
    res.json({channels:enriched}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const {name,description,icon_url,type}=req.body; const _ctype=(type==='group')?'group':'broadcast';
    if(!name||name.trim().length<2) return res.status(400).json({error:'Nom requis (2 car. min)'});
    const channels=await pencChannels();
    const ch={id:'ch_'+Date.now(),name:name.trim(),description:(description||'').trim(),icon_url:icon_url||null,type:_ctype,read_only:false,creator_id:uid,admins:[],followers:[uid],posts:[],created_at:new Date().toISOString()};
    channels.push(ch); await pencSaveChannels(channels);
    res.json({success:true,channel:{...ch,posts:undefined,follower_count:1,is_following:true,is_creator:true}}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.get('/api/penc/channels/:id', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    res.json({...ch,type:ch.type||'broadcast',read_only:!!ch.read_only,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid)),can_post:(String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid))||((ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid))))}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels/:id/follow', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    ch.followers=ch.followers||[]; const idx=ch.followers.indexOf(uid); const following=idx<0;
    if(following) ch.followers.push(uid); else if(String(ch.creator_id)!==String(uid)) ch.followers.splice(idx,1);
    await pencSaveChannels(channels); res.json({success:true,following,follower_count:ch.followers.length}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels/:id/post', pencAuth, async (req,res) => {
  try{
    const uid=req.pencUser.userId;
    const {content,type,media_url}=req.body;
    if(!content&&!media_url) return res.status(400).json({error:'Contenu vide'});
    const channels=await pencChannels();
    const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    const _isChAdmin=String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid));
    const _memberCanPost=(ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid));
    if(!_isChAdmin && !_memberCanPost) return res.status(403).json({error:'Vous ne pouvez pas publier dans ce canal'});
    const post={id:'p_'+Date.now(),sender_id:uid,content:content||'',type:type||'text',
      media_url:media_url||null,created_at:new Date().toISOString(),reactions:{}};
    if(!ch.posts) ch.posts=[];
    ch.posts.push(post);
    await pencSaveChannels(channels);
    // Émettre via Socket.io à tous les abonnés connectés
    if(global._pencIo){
      (ch.followers||[]).forEach(function(fid){
        global._pencIo.to('user:'+fid).emit('channel:post',{channel_id:ch.id,post:post});
      });
    }
    res.json({success:true,post});
  }catch(e){console.error('ch post:',e.message);res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels/:id/react/:postId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const {emoji}=req.body;
    const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    const post=(ch.posts||[]).find(x=>x.id===req.params.postId);
    if(!post) return res.status(404).json({error:'Post introuvable'});
    post.reactions=post.reactions||{}; post.reactions[emoji]=post.reactions[emoji]||[];
    const i=post.reactions[emoji].indexOf(uid);
    if(i<0) post.reactions[emoji].push(uid); else post.reactions[emoji].splice(i,1);
    await pencSaveChannels(channels); res.json({success:true,reactions:post.reactions}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.delete('/api/penc/channels/:id/post/:postId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch||(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid)))) return res.status(403).json({error:'Non autorisé'});
    ch.posts=(ch.posts||[]).filter(p=>p.id!==req.params.postId); await pencSaveChannels(channels);
    res.json({success:true}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
// ── Canaux : gestion des membres / admins ──
app.get('/api/penc/channels/:id/members', pencAuth, async (req,res) => {
  try{ const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    const users=await pgAllUsers()||[]; const admins=(ch.admins||[]).map(String);
    const out=(ch.followers||[]).map(function(fid){ const u=users.find(function(x){return String(x.id)===String(fid);})||{};
      const role=String(ch.creator_id)===String(fid)?'creator':(admins.includes(String(fid))?'admin':'member');
      return {id:fid, full_name:u.full_name||u.username||'Utilisateur', username:u.username||'', avatar_url:u.avatar_url||null, role:role}; });
    out.sort(function(a,b){ var o={creator:0,admin:1,member:2}; return o[a.role]-o[b.role]; });
    res.json({members:out}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/channels/:id/members/:userId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});
    ch.followers=ch.followers||[]; const m=req.params.userId;
    if(!ch.followers.map(String).includes(String(m))) ch.followers.push(m);
    await pencSaveChannels(channels);
    try{ emitToUsers(m,'channel:invited',{channel_id:ch.id,name:ch.name}); }catch(e){}
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/channels/:id/members/:userId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});
    const m=req.params.userId;
    if(String(ch.creator_id)===String(m)) return res.status(400).json({error:'Impossible de retirer le proprietaire'});
    ch.followers=(ch.followers||[]).filter(function(f){return String(f)!==String(m);});
    ch.admins=(ch.admins||[]).filter(function(a){return String(a)!==String(m);});
    await pencSaveChannels(channels);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/channels/:id/admins/:userId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid)) return res.status(403).json({error:'Seul le proprietaire peut nommer un admin'});
    const m=req.params.userId; ch.admins=ch.admins||[]; ch.followers=ch.followers||[];
    if(!ch.followers.map(String).includes(String(m))) ch.followers.push(m);
    if(!ch.admins.map(String).includes(String(m))) ch.admins.push(m);
    await pencSaveChannels(channels);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/channels/:id/admins/:userId', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid)) return res.status(403).json({error:'Non autorise'});
    ch.admins=(ch.admins||[]).filter(function(a){return String(a)!==String(req.params.userId);});
    await pencSaveChannels(channels);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/channels/:id/join', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    ch.followers=ch.followers||[];
    if(!ch.followers.map(String).includes(String(uid))) ch.followers.push(uid);
    await pencSaveChannels(channels);
    res.json({success:true,channel:{id:ch.id,name:ch.name}}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/channels/:id', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels();
    const idx=channels.findIndex(x=>x.id===req.params.id);
    if(idx<0) return res.status(404).json({error:'Canal introuvable'});
    if(String(channels[idx].creator_id)!==String(uid)) return res.status(403).json({error:'Non autorisé'});
    channels.splice(idx,1); await pencSaveChannels(channels); res.json({success:true}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels/:id/readonly', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});
    ch.read_only=!!req.body.read_only; await pencSaveChannels(channels);
    try{ (ch.followers||[]).forEach(function(fid){ emitToUsers(String(fid),'channel:update',{channel_id:ch.id,read_only:ch.read_only}); }); }catch(e){}
    res.json({success:true,read_only:ch.read_only}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.put('/api/penc/channels/:id', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});
    const b=req.body||{};
    if(b.name && b.name.trim().length>=2) ch.name=b.name.trim();
    if(typeof b.description==='string') ch.description=b.description.trim();
    if(b.icon_url) ch.icon_url=b.icon_url;
    await pencSaveChannels(channels);
    res.json({success:true,channel:{id:ch.id,name:ch.name,description:ch.description,icon_url:ch.icon_url}}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/channels/:id/posts/:pid/view', pencAuth, async (req,res) => {
  try{ const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    const p=(ch.posts||[]).find(x=>x.id===req.params.pid);
    if(!p) return res.status(404).json({error:'Post introuvable'});
    p.views=(p.views||0)+1; await pencSaveChannels(channels);
    res.json({success:true,views:p.views});
  }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});

// DELETE /api/penc/statuses/:id
// GET /api/penc/statuses/:id — un statut precis (lien de partage)
app.get('/api/penc/statuses/:id', pencAuth, async (req,res)=>{
  try{ if(!_pgPool) return res.status(404).json({error:'Introuvable'});
    const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE id=$1',[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'Statut introuvable'});
    const stt=pgStatusToObj(r.rows[0]);
    const u=await pgFindUser('id',stt.user_id)||{};
    stt.user={ full_name:u.full_name||u.username||'Utilisateur', username:u.username||'', avatar_url:u.avatar_url||null };
    res.json({status:stt}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/statuses/:id', pencAuth, async (req, res) => {
  try {
    const uid=req.pencUser.userId;
    if(_pgPool){
      const _del=await _pgPool.query('DELETE FROM penc_statuses WHERE id=$1 AND user_id=$2',[req.params.id,uid]);
      if(_del.rowCount===0){ try{ const _u=await pgFindUser('id',uid); if(_u && PENC_ADMIN_EMAILS.includes(String(_u.email||'').toLowerCase())){ await _pgPool.query("DELETE FROM penc_statuses WHERE id=$1 AND user_id='penc_official'",[req.params.id]); } }catch(_e){} }
      return res.json({success:true});
    }
    const statuses=await pencStatuses();
    const idx=statuses.findIndex(x=>x.id===req.params.id&&x.user_id===uid);
    if(idx>=0){statuses.splice(idx,1);await pencSaveStatuses(statuses);}
    res.json({success:true});
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// PATCH /api/penc/statuses/:id
app.patch('/api/penc/statuses/:id', pencAuth, async (req, res) => {
  try {
    const uid=req.pencUser.userId; const {text_content,caption}=req.body;
    if(_pgPool){
      const sets=[]; const vals=[]; let n=1;
      if(text_content!==undefined){ sets.push('text_content=$'+n); vals.push(text_content); n++; }
      if(caption!==undefined){ sets.push('caption=$'+n); vals.push(caption); n++; }
      if(sets.length){ vals.push(req.params.id); vals.push(uid); await _pgPool.query('UPDATE penc_statuses SET '+sets.join(',')+' WHERE id=$'+n+' AND user_id=$'+(n+1), vals); }
      return res.json({success:true});
    }
    const statuses=await pencStatuses();
    const st=statuses.find(x=>x.id===req.params.id&&x.user_id===uid);
    if(st){if(text_content!==undefined)st.text_content=text_content;if(caption!==undefined)st.caption=caption;await pencSaveStatuses(statuses);}
    res.json({success:true});
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/penc/statuses/:id/react
app.post('/api/penc/statuses/:id/react', pencAuth, async (req, res) => {
  try {
    const uid=req.pencUser.userId; const {emoji}=req.body;
    if(_pgPool){
      const r=await _pgPool.query('SELECT * FROM penc_statuses WHERE id=$1',[req.params.id]);
      if(!r.rows[0]) return res.status(404).json({error:'Statut introuvable'});
      const st=pgStatusToObj(r.rows[0]);
      st.reactions=st.reactions||[];
      const existing=st.reactions.find(r=>r.user_id===uid);
      if(existing) existing.emoji=emoji; else st.reactions.push({user_id:uid,emoji,created_at:new Date().toISOString()});
      await pgUpdateStatus(req.params.id,{reactions:st.reactions});
      try{ if(String(st.user_id)!==String(uid)){ let _rn='Une personne'; try{ const _ru=await pgFindUser('id',uid); if(_ru) _rn=_ru.full_name||_ru.username||'Une personne'; }catch(_e11){} emitToUsers(String(st.user_id),'status:reaction',{status_id:req.params.id, emoji:emoji, from_name:_rn}); try{ sendPencPush(String(st.user_id),{title:'Penc', body:_rn+' a aimé votre statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-like-'+req.params.id, url:'/messager?status='+req.params.id, data:{type:'status_like', status_id:req.params.id, url:'/messager?status='+req.params.id}}); }catch(_lp){} } }catch(_e12){}
      return res.json({success:true,reactions:st.reactions});
    }
    const statuses=await pencStatuses();
    const st=statuses.find(x=>x.id===req.params.id);
    if(!st) return res.status(404).json({error:'Statut introuvable'});
    st.reactions=st.reactions||[];
    const ex=st.reactions.find(r=>r.user_id===uid);
    if(ex) ex.emoji=emoji; else st.reactions.push({user_id:uid,emoji,created_at:new Date().toISOString()});
    await pencSaveStatuses(statuses);
    res.json({success:true,reactions:st.reactions});
  }catch(e){res.status(500).json({error:'Erreur serveur'});}
});

// SOCKET.IO — PENC TEMPS RÉEL
// ════════════════════════════════════════════════════════════

const pencOnline = new Map();

// \u2550\u2550 Liaison d'appareil par QR (v390 : REST, plus de Socket.io — fiabilité et simplicité) \u2550\u2550
const _pairPending = new Map(); // code -> { createdAt, status:'pending'|'linked', token, user }
function _pairNewCode(){ return require('crypto').randomBytes(16).toString('hex'); }
app.post('/api/penc/auth/pair/start', (req, res) => {
  try{
    const code = _pairNewCode();
    _pairPending.set(code, { createdAt: Date.now(), status: 'pending', token: null, user: null });
    setTimeout(() => { _pairPending.delete(code); }, 300000);
    res.json({ code, expiresIn: 300000 });
  }catch(e){ res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/auth/pair/status/:code', (req, res) => {
  try{
    const p = _pairPending.get(req.params.code);
    if(!p) return res.json({ status: 'expired' });
    if(p.status === 'linked'){ const out = { status:'linked', token:p.token, user:p.user }; _pairPending.delete(req.params.code); return res.json(out); }
    res.json({ status: 'pending' });
  }catch(e){ res.status(500).json({ error: 'Erreur serveur' }); }
});
app.post('/api/penc/auth/pair/confirm', pencAuth, async (req, res) => {
  try{
    const uid = req.pencUser.userId; const code = req.body && req.body.code;
    if(!code) return res.status(400).json({ error: 'code manquant' });
    const p = _pairPending.get(code);
    if(!p || p.status === 'linked') return res.status(404).json({ error: 'Code invalide ou expiré' });
    const _sid = _pencNewSid();
    const tok = jwt_penc.sign({ userId: uid, sid: _sid }, PENC_SECRET, { expiresIn: '7d' });
    await _pencCreateSession(uid, _sid, req);
    let profile = null;
    try{ if(_pgPool){ const r = await _pgPool.query('SELECT * FROM penc_users WHERE id=$1', [uid]); profile = r.rows[0] ? pencStrip(r.rows[0]) : null; } }catch(eU){}
    p.status = 'linked'; p.token = tok; p.user = profile;
    res.json({ success: true });
  }catch(e){ res.status(500).json({ error: 'Erreur serveur' }); }
});

// \u2550\u2550 PENC MEET (v17) \u2014 reunions video de groupe, signalisation maillage \u2550\u2550
const _meetRooms = {}; // code -> { title, host, createdAt, peers: { socketId: {uid, name} } }
function _meetCode(){ const a='abcdefghijkmnpqrstuvwxyz'; const r=n=>Array.from({length:n},()=>a[Math.floor(Math.random()*a.length)]).join(''); return r(3)+'-'+r(4)+'-'+r(3); }
const _meetCreateThrottle={};
app.post('/api/penc/meet/create', pencAuth, (req,res)=>{
  try{
    const uid=req.pencUser.userId;
    const now=Date.now(); const win=_meetCreateThrottle[uid]||{n:0,t:now};
    if(now-win.t>60000){ win.n=0; win.t=now; }
    win.n++; _meetCreateThrottle[uid]=win;
    if(win.n>20) return res.status(429).json({error:'Trop de r\u00e9unions cr\u00e9\u00e9es, r\u00e9essaie dans une minute.'});
    let code=_meetCode(); let g=0; while(_meetRooms[code]&&g++<20) code=_meetCode();
    _meetRooms[code]={ title:String((req.body&&req.body.title)||'').slice(0,80), host:uid, createdAt:Date.now(), peers:{}, pending:{}, banned:{}, hostSid:null };
    res.json({ success:true, code });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/penc/meet/schedule', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    let code=_meetCode(); let g=0; while(_meetRooms[code]&&g++<20) code=_meetCode();
    const when=new Date(req.body&&req.body.when||''); if(isNaN(when.getTime())) return res.status(400).json({error:'Date invalide'});
    const title=String((req.body&&req.body.title)||'').slice(0,80);
    const approval=!!(req.body&&req.body.approval);
    await _pgPool.query('INSERT INTO penc_meetings(code,title,host,scheduled_at,approval) VALUES($1,$2,$3,$4,$5)',[code,title,req.pencUser.userId,when.toISOString(),approval]);
    res.json({ success:true, code, title, when: when.toISOString() });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/penc/meet/history/mine', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({history:[]});
    const r=await _pgPool.query("SELECT code, MAX(title) title, MAX(host) host, MIN(joined_at) joined_at, MAX(left_at) left_at, COUNT(DISTINCT participant) participants FROM penc_meet_history WHERE participant=$1 GROUP BY code ORDER BY MIN(joined_at) DESC LIMIT 40",[req.pencUser.userId]);
    res.json({ history: r.rows });
  }catch(e){ res.json({history:[]}); }
});
app.get('/api/penc/meet/upcoming/mine', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({meetings:[]});
    const r=await _pgPool.query("SELECT code,title,scheduled_at,approval FROM penc_meetings WHERE host=$1 AND scheduled_at > NOW() - INTERVAL '3 hours' ORDER BY scheduled_at ASC LIMIT 20",[req.pencUser.userId]);
    res.json({ meetings: r.rows });
  }catch(e){ res.json({meetings:[]}); }
});
app.delete('/api/penc/meet/schedule/:code', pencAuth, async (req,res)=>{
  try{ if(_pgPool) await _pgPool.query('DELETE FROM penc_meetings WHERE code=$1 AND host=$2',[req.params.code, req.pencUser.userId]); res.json({success:true}); }catch(e){ res.json({success:false}); }
});
app.post('/api/penc/transcribe', pencAuth, async (req,res)=>{
  try{
    const url=String((req.body&&req.body.url)||'').trim();
    if(!url||!/^https?:\/\//.test(url)) return res.status(400).json({error:'URL audio invalide'});
    const hash=crypto.createHash('sha256').update(url).digest('hex');
    if(_pgPool){
      try{ const c=await _pgPool.query('SELECT text FROM penc_transcripts WHERE url_hash=$1',[hash]); if(c.rows[0]) return res.json({success:true,text:c.rows[0].text,cached:true}); }catch(eC){}
    }
    const AAI_KEY=process.env.ASSEMBLYAI_API_KEY||'';
    if(!AAI_KEY) return res.status(503).json({error:'Transcription non configur\u00e9e \u2014 cl\u00e9 ASSEMBLYAI_API_KEY manquante sur le serveur.'});
    const initR=await fetch('https://api.assemblyai.com/v2/transcript',{ method:'POST', headers:{ 'Authorization':AAI_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ audio_url:url, speech_models:['universal-3-5-pro','universal-2'], language_detection:true }) });
    if(!initR.ok) return res.status(502).json({error:'Service de transcription indisponible.'});
    const initD=await initR.json();
    const tid=initD.id; if(!tid) return res.status(502).json({error:'R\u00e9ponse invalide du service de transcription.'});
    let text=null, tries=0;
    while(tries<40){
      await new Promise(r=>setTimeout(r,1500));
      const pr=await fetch('https://api.assemblyai.com/v2/transcript/'+tid,{ headers:{ 'Authorization':AAI_KEY } });
      const pd=await pr.json();
      if(pd.status==='completed'){ text=pd.text||''; break; }
      if(pd.status==='error'){ return res.status(502).json({error:pd.error||'Erreur de transcription.'}); }
      tries++;
    }
    if(text===null) return res.status(504).json({error:'Transcription trop longue \u2014 r\u00e9essaie.'});
    if(_pgPool){ try{ await _pgPool.query('INSERT INTO penc_transcripts(url_hash,text) VALUES($1,$2) ON CONFLICT (url_hash) DO NOTHING',[hash,text]); }catch(eI){} }
    res.json({ success:true, text: text||'(Aucune parole d\u00e9tect\u00e9e)' });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/penc/meet/rate', pencAuth, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({success:false});
    const stars=Math.max(1,Math.min(5,parseInt(req.body&&req.body.stars,10)||0)); if(!stars) return res.status(400).json({error:'stars'});
    await _pgPool.query('INSERT INTO penc_meet_ratings(id,code,user_id,stars,comment) VALUES($1,$2,$3,$4,$5)',['mr_'+Date.now()+Math.random().toString(36).slice(2,6), String((req.body&&req.body.code)||'').slice(0,24), req.pencUser.userId, stars, String((req.body&&req.body.comment)||'').slice(0,400)]);
    res.json({success:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/penc/admin/meet-ratings', pencAuth, pencAdmin, async (req,res)=>{
  try{
    if(!_pgPool) return res.json({avg:0,count:0,history:[]});
    const a=await _pgPool.query('SELECT COALESCE(AVG(stars),0) avg, COUNT(*) count FROM penc_meet_ratings');
    const users=await pgAllUsers()||[];
    const h=await _pgPool.query('SELECT * FROM penc_meet_ratings ORDER BY created_at DESC LIMIT 120');
    const history=h.rows.map(x=>{ const u=users.find(y=>String(y.id)===String(x.user_id)); return {...x, name:(u&&(u.full_name||u.username))||'Utilisateur'}; });
    res.json({ avg: parseFloat(a.rows[0].avg)||0, count: parseInt(a.rows[0].count,10)||0, history });
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/penc/meet/:code', pencAuth, (req,res)=>{
  const r=_meetRooms[String(req.params.code||'').toLowerCase().trim()];
  if(!r) return res.json({ exists:false });
  res.json({ exists:true, title:r.title||'', count:Object.keys(r.peers).length });
});
setInterval(()=>{ try{ const now=Date.now(); Object.keys(_meetRooms).forEach(c=>{ const r=_meetRooms[c]; if(r && !Object.keys(r.peers).length && !Object.keys(r.pending||{}).length && (now-r.createdAt)>7200000) delete _meetRooms[c]; }); }catch(_e){} }, 900000);
io.on('connection', async (socket) => {
  // \u2500\u2500 PENC MEET : signalisation \u2500\u2500
  socket._meetJoinAttempts=0; socket._meetJoinWindow=Date.now();
  socket.on('meet:join', async (d)=>{
    try{
      const _now=Date.now();
      if(_now-socket._meetJoinWindow>60000){ socket._meetJoinWindow=_now; socket._meetJoinAttempts=0; }
      socket._meetJoinAttempts++;
      if(socket._meetJoinAttempts>15){ socket.emit('meet:full',{code:''}); return; }
      const code=String((d&&d.code)||'').toLowerCase().trim(); if(!code) return;
      const uid=socket.data.pencUserId || '';
      if(!uid){ socket.emit('meet:denied',{code}); return; }
      const name=String((d&&d.name)||'Participant').slice(0,40);
      let room=_meetRooms[code];
      if(!room){
        let sched=null;
        try{ if(_pgPool){ const r=await _pgPool.query('SELECT * FROM penc_meetings WHERE code=$1',[code]); sched=r.rows[0]||null; } }catch(eS){}
        room=_meetRooms[code]={ title:(sched&&sched.title)||String((d&&d.title)||'').slice(0,80), host:(sched&&sched.host)||uid, approval:!!((sched&&sched.approval)||(d&&d.approval&&(!sched))), createdAt:Date.now(), peers:{}, pending:{}, banned:{}, hostSid:null };
      }
      room.pending=room.pending||{}; room.banned=room.banned||{};
      if(uid&&room.banned[uid]){ socket.emit('meet:banned',{code}); return; }
      if(Object.keys(room.peers).length>=30){ socket.emit('meet:full',{code}); return; }
      const isHost=(uid&&String(uid)===String(room.host));
      if(room.approval&&!isHost){
        room.pending[socket.id]={uid,name}; socket._meetPend=code;
        socket.emit('meet:wait',{code, title:room.title||''});
        if(room.hostSid) io.to(room.hostSid).emit('meet:knock',{ sid:socket.id, name, uid });
        return;
      }
      room.peers[socket.id]={ uid, name };
      if(isHost) room.hostSid=socket.id;
      try{ if(_pgPool&&uid){ const _hid='mh_'+Date.now()+Math.random().toString(36).slice(2,6); socket._meetHistId=_hid; _pgPool.query('INSERT INTO penc_meet_history(id,code,title,host,participant) VALUES($1,$2,$3,$4,$5)',[_hid,code,room.title||'',room.host||'',uid]).catch(()=>{}); } }catch(_eh){}
      socket.join('meet_'+code);
      socket._meetCode=code;
      const others=Object.keys(room.peers).filter(id=>id!==socket.id).map(id=>({ sid:id, name:room.peers[id].name, uid:room.peers[id].uid }));
      socket.emit('meet:peers',{ code, title:room.title||'', host:room.host||'', peers:others });
      socket.to('meet_'+code).emit('meet:peer-joined',{ sid:socket.id, name, uid });
    }catch(e){}
  });
  socket.on('meet:admit', (d)=>{
    try{
      const code=socket._meetCode; if(!code||!d||!d.sid) return;
      const room=_meetRooms[code]; if(!room||room.hostSid!==socket.id) return;
      const p=(room.pending||{})[d.sid]; if(!p) return; delete room.pending[d.sid];
      const ts=io.sockets.sockets.get(d.sid); if(!ts) return;
      if(!d.ok){ ts.emit('meet:denied',{code}); ts._meetPend=null; return; }
      if(Object.keys(room.peers).length>=30){ ts.emit('meet:full',{code}); return; }
      room.peers[d.sid]=p; ts.join('meet_'+code); ts._meetCode=code; ts._meetPend=null;
      const others=Object.keys(room.peers).filter(id=>id!==d.sid).map(id=>({ sid:id, name:room.peers[id].name, uid:room.peers[id].uid }));
      ts.emit('meet:peers',{ code, title:room.title||'', host:room.host||'', peers:others });
      ts.to('meet_'+code).emit('meet:peer-joined',{ sid:d.sid, name:p.name, uid:p.uid });
    }catch(e){}
  });
  socket.on('meet:kick', (d)=>{
    try{
      const code=socket._meetCode; if(!code||!d||!d.sid) return;
      const room=_meetRooms[code]; if(!room||room.hostSid!==socket.id) return;
      if(d.sid===socket.id) return;
      const p=room.peers[d.sid]; if(!p) return;
      if(d.ban&&p.uid) room.banned[p.uid]=1;
      const ts=io.sockets.sockets.get(d.sid);
      delete room.peers[d.sid];
      if(ts){ ts.emit('meet:kicked',{code, ban:!!d.ban}); ts.leave('meet_'+code); ts._meetCode=null; }
      io.to('meet_'+code).emit('meet:peer-left',{ sid:d.sid, kicked:true, name:p.name });
    }catch(e){}
  });
  socket.on('meet:signal', (d)=>{
    try{
      if(!d||!d.to) return;
      const code=socket._meetCode; if(!code) return;
      const room=_meetRooms[code]; if(!room||!room.peers[d.to]) return;
      io.to(d.to).emit('meet:signal',{ from:socket.id, data:d.data });
    }catch(e){}
  });
  socket.on('meet:chat', (d)=>{ try{ const code=socket._meetCode; if(!code) return; const room=_meetRooms[code]; const nm=(room&&room.peers[socket.id]&&room.peers[socket.id].name)||'Participant'; const rep=(d&&d.reply&&d.reply.name)?{name:String(d.reply.name).slice(0,40),text:String(d.reply.text||'').slice(0,120)}:null; io.to('meet_'+code).emit('meet:chat',{ from:socket.id, name:nm, text:String((d&&d.text)||'').slice(0,500), reply:rep, ts:Date.now() }); }catch(e){} });
  socket.on('meet:state', (d)=>{ try{ const code=socket._meetCode; if(!code) return; socket.to('meet_'+code).emit('meet:state',{ sid:socket.id, audio:!!(d&&d.audio), video:!!(d&&d.video), hand:!!(d&&d.hand), screen:!!(d&&d.screen) }); }catch(e){} });
  const _meetLeave=()=>{ try{ if(socket._meetPend){ const rp=_meetRooms[socket._meetPend]; if(rp&&rp.pending) delete rp.pending[socket.id]; socket._meetPend=null; } const code=socket._meetCode; if(!code) return; socket._meetCode=null; const room=_meetRooms[code]; let nm=''; if(room){ nm=(room.peers[socket.id]&&room.peers[socket.id].name)||''; delete room.peers[socket.id]; if(room.hostSid===socket.id) room.hostSid=null; if(!Object.keys(room.peers).length&&!Object.keys(room.pending||{}).length) delete _meetRooms[code]; } socket.leave('meet_'+code); socket.to('meet_'+code).emit('meet:peer-left',{ sid:socket.id, name:nm }); try{ if(_pgPool&&socket._meetHistId){ _pgPool.query('UPDATE penc_meet_history SET left_at=NOW() WHERE id=$1',[socket._meetHistId]).catch(()=>{}); socket._meetHistId=null; } }catch(_lh){} }catch(e){} };
  socket.on('meet:leave', _meetLeave);
  socket.on('disconnect', _meetLeave);
  const tok = socket.handshake.auth?.token;
  if (!tok) return;
  let pencUserId;
  try {
    const _dec = jwt_penc.verify(tok, PENC_SECRET);
    if (_dec.sid && _pencRevokedSids.has(_dec.sid)) { socket.emit('session:revoked', {}); socket.disconnect(true); return; }
    pencUserId = _dec.userId; socket.data.pencSid = _dec.sid;
  }
  catch { return; }

  pencOnline.set(pencUserId, socket.id);
  socket.data.pencUserId = pencUserId;

  // Rejoindre ses conversations (PostgreSQL prioritaire)
  try {
    if(_pgPool){
      const convRows=await pgGetConvs(pencUserId);
      convRows.forEach(c=>socket.join('penc:'+c.id));
    } else {
      const convs=await pencConvs();
      convs.filter(c=>Array.isArray(c.participants||c.members)&&(c.participants||c.members).includes(pencUserId))
        .forEach(c=>socket.join('penc:'+c.id));
    }
    // Rejoindre aussi la room personnelle
    socket.join('user:'+pencUserId);
    console.log('✅ Socket connecté:', pencUserId.slice(0,12)+'... → room user:'+pencUserId.slice(0,8));
  } catch(e){console.error('autojoin:',e.message);}
  io.emit('user:online', { userId: pencUserId, isOnline: true });

  // Salon par station DeglouFM : diffuse les nouveaux commentaires/likes en direct
  // à tous les auditeurs qui ont l'écran de la station ouvert au même moment.
  socket.on('radio:join', function(stationId){ try{ if(stationId) socket.join('radio:'+String(stationId)); }catch(_){} });
  // Coordination multi-appareils : quand une radio démarre sur un appareil, on prévient les
  // AUTRES appareils connectés du même compte (via la room personnelle user:<id>) pour qu'ils
  // arrêtent la leur — évite deux stations qui jouent en même temps (téléphone + ordinateur…).
  socket.on('radio:now-playing', function(data){ try{ socket.to('user:'+pencUserId).emit('radio:stop-for-sync', data||{}); }catch(_){} });
  socket.on('radio:leave', function(stationId){ try{ if(stationId) socket.leave('radio:'+String(stationId)); }catch(_){} });

  // Permet de rejoindre une conv créée pendant la session


// ═══════════════════════════════════════════════════
// ══  APPELS LIVEKIT  ══════════════════════════════
// ═══════════════════════════════════════════════════
const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL        = process.env.LIVEKIT_URL        || '';

let _lkAccessToken = null;
(function loadLK(){
  if(!LIVEKIT_API_KEY){ console.log('⚠️  LiveKit non configuré (LIVEKIT_API_KEY manquant)'); return; }
  try{
    const lk = require('livekit-server-sdk');
    _lkAccessToken = lk.AccessToken;
    console.log('✅ LiveKit SDK chargé');
  }catch(e){
    console.error('❌ LiveKit SDK manquant — fais: npm install livekit-server-sdk');
  }
})();

// POST /api/penc/call/token — génère un token LiveKit
app.post('/api/penc/call/token', pencAuth, async (req, res) => {
  if(!_lkAccessToken || !LIVEKIT_API_KEY)
    return res.status(503).json({error:'LiveKit non configuré. Ajoute LIVEKIT_API_KEY dans Render.'});
  try{
    const uid = req.pencUser.userId;
    const { room_name, participant_name, type } = req.body;
    if(!room_name) return res.status(400).json({error:'room_name requis'});
    const at = new _lkAccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: uid,
      name: participant_name || uid
    });
    at.addGrant({
      roomJoin: true,
      room: room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    at.ttl = '1h';
    const token = await at.toJwt();
    res.json({ token, url: LIVEKIT_URL, room: room_name });
  }catch(e){
    console.error('LiveKit token err:', e.message);
    res.status(500).json({error: e.message});
  }
});

// GET /api/penc/call/config — config publique
app.get('/api/penc/call/config', pencAuth, (req, res) => {
  res.json({
    livekit_enabled: !!LIVEKIT_API_KEY,
    livekit_url: LIVEKIT_URL
  });
});
  // ── APPELS WEBRTC (via pencOnline map = livraison directe) ──
  async function emitToUser(uid, event, data){
    // 0) Émettre vers la room user: SANS condition (identique à emitToUsers/messages — fiable)
    io.to('user:'+String(uid)).emit(event,data);
    try{ const _room=await io.in('user:'+String(uid)).fetchSockets(); if(_room && _room.length){ console.log('📡',event,'→',String(uid).slice(0,10),'via room (online)'); return true; } }catch(_e0){}
    // 1) pencOnline map (rapide)
    const sid=pencOnline.get(uid)||pencOnline.get(String(uid));
    if(sid){ io.to(sid).emit(event,data); console.log('📡',event,'→',uid.slice(0,10),'via map'); return true; }
    // 2) fetchSockets (fiable même si map périmée)
    try{
      const sockets=await io.fetchSockets();
      const target=sockets.find(s=>String(s.data.pencUserId)===String(uid));
      if(target){
        target.emit(event,data);
        pencOnline.set(uid,target.id); // mise à jour map
        console.log('📡',event,'→',uid.slice(0,10),'via fetchSockets');
        return true;
      }
    }catch(e){ console.error('fetchSockets err:',e.message); }
    console.log('⚠️',event,'→',uid.slice(0,10),'HORS LIGNE');
    return false;
  }
  socket.on('channel:call:start', async ({channel_id, type}) => {
    try{
      if(!channel_id) return;
      const chans = await pencChannels();
      const ch = (chans||[]).find(c=>String(c.id)===String(channel_id));
      if(!ch || ch.type!=='group') return;
      const members = Array.from(new Set([...(ch.followers||[]), ...(ch.admins||[]), ch.creator_id].map(String))).filter(Boolean);
      if(!members.includes(String(pencUserId))) return;
      const room_name = 'chcall_'+channel_id;
      let callerName="Quelqu'un";
      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) callerName=u.full_name||u.username||callerName; }catch(e){}
      const targets = members.filter(m=>m!==String(pencUserId));
      await emitToUsers(targets, 'channel:call:incoming', { channel_id, room_name, type:type||'audio', from:pencUserId, caller_name:callerName, channel_name:ch.name||'Canal', channel_icon:ch.icon_url||null });
      console.log('[channel:call:start]', String(channel_id).slice(0,8), 'by', String(pencUserId).slice(0,8), '->', targets.length, 'membres');
    }catch(e){ console.error('channel:call:start err', e.message); }
  });
  socket.on('channel:call:invite', async ({channel_id, room_name, type, user_ids}) => {
    try{
      if(!channel_id || !Array.isArray(user_ids) || !user_ids.length) return;
      const chans = await pencChannels();
      const ch = (chans||[]).find(c=>String(c.id)===String(channel_id));
      if(!ch) return;
      let callerName="Quelqu'un";
      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) callerName=u.full_name||u.username||callerName; }catch(e){}
      await emitToUsers(user_ids.map(String), 'channel:call:incoming', { channel_id, room_name:room_name||('chcall_'+channel_id), type:type||'audio', from:pencUserId, caller_name:callerName, channel_name:ch.name||'Canal', channel_icon:ch.icon_url||null, invite:true });
      console.log('[channel:call:invite]', String(channel_id).slice(0,8), '->', user_ids.length);
    }catch(e){ console.error('channel:call:invite err', e.message); }
  });
  socket.on('call:invite', async ({room_name, type, user_ids, caller_name}) => {
    try{
      if(!room_name || !Array.isArray(user_ids) || !user_ids.length) return;
      let cn = caller_name || "Quelqu'un";
      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) cn=u.full_name||u.username||cn; }catch(e){}
      await emitToUsers(user_ids.map(String), 'channel:call:incoming', { channel_id:null, room_name, type:type||'audio', from:pencUserId, caller_name:cn, channel_name:'Appel de groupe', invite:true });
      console.log('[call:invite]', String(pencUserId).slice(0,8), '->', user_ids.length);
    }catch(e){ console.error('call:invite err', e.message); }
  });
  socket.on('call:upgrade', async ({target_user_id, room_name, type}) => {
    try{
      if(!target_user_id || !room_name) return;
      await emitToUsers([String(target_user_id)], 'call:upgrade', { room_name, type:type||'audio', from:pencUserId });
      console.log('[call:upgrade]', String(pencUserId).slice(0,8), '->', String(target_user_id).slice(0,8));
    }catch(e){ console.error('call:upgrade err', e.message); }
  });
  socket.on('call:invite:request', async ({host_id, room_name, type, user_ids, requester_name, user_names}) => {
    try{
      if(!host_id || !room_name || !Array.isArray(user_ids) || !user_ids.length) return;
      let rn = requester_name || 'Un participant';
      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) rn=u.full_name||u.username||rn; }catch(e){}
      await emitToUsers([String(host_id)], 'call:invite:request', { room_name, type:type||'audio', user_ids:user_ids.map(String), user_names:Array.isArray(user_names)?user_names:[], requester_id:pencUserId, requester_name:rn });
      console.log('[call:invite:request]', String(pencUserId).slice(0,8), '-> host', String(host_id).slice(0,8), user_ids.length);
    }catch(e){ console.error('call:invite:request err', e.message); }
  });
  socket.on('call:invite:declined', async ({requester_id, room_name}) => {
    try{
      if(!requester_id) return;
      await emitToUsers([String(requester_id)], 'call:invite:declined', { room_name:room_name||null, from:pencUserId });
      console.log('[call:invite:declined] host', String(pencUserId).slice(0,8), '-> ', String(requester_id).slice(0,8));
    }catch(e){ console.error('call:invite:declined err', e.message); }
  });
  socket.on('call:initiate', async ({target_user_id, type, caller_name, caller_avatar, room_name}) => {
    const ok=await emitToUser(target_user_id,'call:incoming',{
      from:pencUserId, type:type||'audio',
      room_name:room_name||('call_'+pencUserId),
      caller_name:caller_name||'Inconnu', caller_avatar:caller_avatar||null
    });
    console.log('📞 call:initiate',pencUserId.slice(0,8),'→',target_user_id.slice(0,8),'online:',ok);
    try{ let _rc=0; try{ const _rs=await io.in('user:'+String(target_user_id)).fetchSockets(); _rc=_rs?_rs.length:0; }catch(_e){} socket.emit('call:debug',{target:String(target_user_id), online:ok, room_sockets:_rc}); }catch(_ed){}
    // v396 : TOUJOURS pousser une notification d'appel, même si un AUTRE appareil de la
    // personne est déjà connecté (PC par ex.) — sinon un téléphone en veille/arrière-plan
    // (socket suspendu par le système, JS gelé) ne sonne jamais, même si "l'utilisateur"
    // est techniquement en ligne ailleurs. Un appel doit sonner sur TOUS les appareils.
    try{
      const callerUsers = _pgPool ? (await pgAllUsers()||[]) : await pencUsers();
      const callerUser = callerUsers.find(u=>u.id===pencUserId)||{};
      const callerName = callerUser.full_name||callerUser.username||'Inconnu';
      await sendPencPush(target_user_id, {
        title: callerName+' appelle...',
        body: (type==='video'?'📹 Appel vidéo':'📞 Appel audio')+' entrant sur Penc',
        tag: 'penc-call',
        url: '/messager',
        conv_id: null,
        call_data: JSON.stringify({from:pencUserId,type,room_name,caller_name:callerName,caller_avatar:callerUser.avatar_url||null})
      });
      console.log('📲 Push call envoyé à',target_user_id.slice(0,10),'(en plus du socket, pour tous les appareils)');
    }catch(ep){console.error('push call err:',ep.message);}
  });
  socket.on('call:accept', ({caller_id}) => {
    emitToUser(caller_id,'call:accepted',{by:pencUserId});
    // v396 : si le compte a plusieurs appareils qui sonnaient tous, celui qui n'a PAS décroché
    // doit arrêter de sonner dès qu'un autre appareil du même compte a répondu.
    try{ socket.to('user:'+String(pencUserId)).emit('call:accepted:elsewhere', {}); }catch(_e){}
  });
  socket.on('call:decline', ({caller_id}) => {
    emitToUser(caller_id,'call:declined',{by:pencUserId});
    try{ socket.to('user:'+String(pencUserId)).emit('call:accepted:elsewhere', {}); }catch(_e){}
  });
  socket.on('call:offer', ({target_id, offer}) => {
    emitToUser(target_id,'call:offer',{from:pencUserId, offer});
  });
  socket.on('call:answer', ({target_id, answer}) => {
    emitToUser(target_id,'call:answer',{from:pencUserId, answer});
  });
  socket.on('call:ice', ({target_id, candidate}) => {
    emitToUser(target_id,'call:ice',{from:pencUserId, candidate});
  });
  socket.on('call:end', ({target_id}) => {
    emitToUser(target_id,'call:ended',{by:pencUserId});
  });
  socket.on('call:busy', ({target_id}) => {
    emitToUser(target_id,'call:busy',{by:pencUserId});
  });
  socket.on('conversation:join', ({ conversation_id }) => {
    if (conversation_id) socket.join('penc:' + conversation_id);
  });
  // Livraison confirmée
  socket.on('message:deliver', async ({id, conv_id}) => {
    if(!_pgPool||!id) return;
    try{
      const r=await _pgPool.query('UPDATE penc_messages SET delivered_at=NOW() WHERE id=$1 AND delivered_at IS NULL RETURNING sender_id',[id]);
      if(r.rows[0]){
        io.to('user:'+String(r.rows[0].sender_id)).emit('message:delivered',{id});
      }
    }catch(e){}
  });
  // Marquer tous messages d'une conv comme lus
  socket.on('messages:read_all', async ({conv_id}) => {
    if(!_pgPool||!conv_id) return;
    try{
      const r=await _pgPool.query(
        'UPDATE penc_messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id!=$2 AND read_at IS NULL RETURNING id,sender_id',
        [conv_id, pencUserId]
      );
      // Grouper par expéditeur pour notifier
      const bySender={};
      r.rows.forEach(row=>{ if(!bySender[row.sender_id]) bySender[row.sender_id]=[]; bySender[row.sender_id].push(row.id); });
      Object.entries(bySender).forEach(([senderId,ids])=>{
        io.to('user:'+String(senderId)).emit('message:read_receipt',{ids,conv_id});
      });
    }catch(e){}
  });
  socket.on('user:join', ({ userId }) => {
    if (userId) socket.join('user:' + userId);
  });

  // Envoyer message
  socket.on('message:send', async (data, cb) => {
    const { conversation_id, type, content, media_url, media_duration, poll_question, poll_options, poll_duration, radio_name, radio_url, money_amount, money_op, client_id } = data;
    // ── Anti-flood : max 20 messages / 10s par utilisateur (evite le spam/bots, sans genner un usage normal) ──
    if (_pencMsgFlood(pencUserId)) {
      if (typeof cb === 'function') cb({ error: 'Trop de messages envoyes trop vite, patiente quelques secondes.' });
      return;
    }
    try {
      const { reply_to } = data;
      let _expiresAt = null;
      try{
        if(_pgPool){
          const _er = await _pgPool.query('SELECT duration_seconds FROM penc_conv_ephemeral WHERE conv_id=$1', [conversation_id]);
          if(_er.rows.length){ _expiresAt = new Date(Date.now() + _er.rows[0].duration_seconds*1000).toISOString(); }
        }
      }catch(_ee){}
      const msg = {
        id: 'msg_' + Date.now() + Math.random().toString(36).slice(2),
        conversation_id, sender_id: pencUserId,
        reply_to: reply_to || null,
        type: type || 'text', content: content || null,
        media_url: media_url || null, media_duration: media_duration || null,
        poll_question: poll_question || null, poll_options: poll_options || null,
        poll_duration: poll_duration || null, poll_votes: 0,
        poll_results: poll_options ? poll_options.map(() => 0) : null,
        radio_name: radio_name || null, radio_url: radio_url || null,
        money_amount: money_amount || null, money_op: money_op || null,
        client_id: client_id || null,
        expires_at: _expiresAt,
        view_once: !!data.view_once,
        created_at: new Date().toISOString(), read_at: null
      };

      // 1) Livraison TEMPS RÉEL d'abord (ne dépend pas de JSONBin)
      let sender = { id: pencUserId }; let _senderAdmin = false;
      try {
        const u = _pgPool ? await pgFindUser('id', pencUserId) : (await pencUsers()).find(x => x.id === pencUserId);
        if (u) { sender = pencStrip(u); _senderAdmin = (u.is_admin === true) || PENC_ADMIN_EMAILS.includes(((u.email || '') + '').toLowerCase()); }
      } catch {}
      // ── Amis : blocage + 1er message en attente (fail-open) ──
      let _blocked = false;
      try {
        if (_pgPool) {
          const _cr = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]);
          let _parts = _cr.rows[0] ? (Array.isArray(_cr.rows[0].participants)?_cr.rows[0].participants:JSON.parse(_cr.rows[0].participants||'[]')) : [];
          const _other = _parts.find(p=>p!==pencUserId);
          if (_other && _areIsolated(pencUserId, _other)) { if (typeof cb === 'function') cb({ error: 'Conversation indisponible.' }); return; }
          if (_other) {
            _blocked = await pgIsBlocked(pencUserId, _other);
            if (!_blocked) {
              const _acc = await pgFriendAccepted(pencUserId, _other);
              if (!_acc && !_senderAdmin && _parts.length===2 && String(_other)!=='penc_official') { await pgEnsureFriendRequest(pencUserId, _other); try { io.to('user:'+_other).emit('friend:request',{from:pencUserId}); } catch(e){} if (typeof cb === 'function') cb({ error: 'Vous devez etre amis pour discuter. Demande d\'ami envoyee.', need_friend: true }); return; }
            }
          }
        }
      } catch(_e){ _blocked = false; msg.pending = false; }
      if (_blocked) { if (typeof cb === 'function') cb({ error: 'Vous ne pouvez pas écrire à cet utilisateur.' }); return; }
      // ── Anti-doublon ATOMIQUE : si un client_id est fourni (cas des vocaux/médias envoyés
      // via sendMsgSocket, retentables par la file hors-ligne), on réserve la ligne en base
      // AVANT toute diffusion. Deux envois concurrents avec le même client_id ne peuvent plus
      // jamais diffuser chacun leur propre copie : un seul gagne la course, l'autre est détecté
      // comme doublon avant même d'émettre quoi que ce soit. (Avant ce correctif, la vérification
      // "existe déjà ?" et l'insertion étaient deux étapes séparées : deux envois quasi simultanés
      // pouvaient toutes les deux passer la vérification avant que l'une des deux n'ait fini
      // d'insérer, diffusant chacune leur propre copie — doublon visible côté client jusqu'au
      // rechargement complet de l'app, moment où un seul des deux survivait réellement en base.)
      let _claimed = null;
      if (client_id && _pgPool) {
        try {
          _claimed = await pgClaimMessage({
            id: msg.id, conversation_id: msg.conversation_id, sender_id: msg.sender_id, type: msg.type,
            content: msg.content || '', media_url: msg.media_url || null, duration: msg.media_duration || null,
            reply_to: msg.reply_to || null, pending: msg.pending || false, created_at: msg.created_at,
            client_id: msg.client_id || null, expires_at: msg.expires_at || null, view_once: msg.view_once || false
          });
        } catch (_e) {}
        if (!_claimed) {
          try {
            const _dup = await _pgPool.query('SELECT id FROM penc_messages WHERE client_id=$1 LIMIT 1', [client_id]);
            if (typeof cb === 'function') cb({ success: true, duplicate: true, message: { ...msg, id: (_dup.rows[0] && _dup.rows[0].id) || msg.id, sender } });
          } catch (_e) {
            if (typeof cb === 'function') cb({ success: true, duplicate: true, message: { ...msg, sender } });
          }
          return;
        }
      }
      const fullMsg = { ...msg, sender };
      // Livraison: room de la conv + rooms personnelles des participants
      io.to('penc:' + conversation_id).emit('message:new', fullMsg);
      // Fallback: émettre directement aux participants via leur room user:
      try{
        let parts=[];
        if(_pgPool){
          const cr=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]);
          if(cr.rows[0]){
            parts=Array.isArray(cr.rows[0].participants)?cr.rows[0].participants:JSON.parse(cr.rows[0].participants||'[]');
          }
        }
        parts.forEach(pid=>{
          if(pid!==pencUserId) io.to('user:'+pid).emit('message:new',fullMsg);
        });
      }catch(e2){}
      if (cb) cb({ success: true, message: fullMsg });

      // 2) Persistance best-effort — déjà faite ci-dessus (réservation atomique) quand un
      // client_id était fourni ; sinon on persiste ici comme avant.
      if (!_claimed) {
      try {
        if (_pgPool) {
          await pgSaveMessage({
            id: msg.id, conversation_id: msg.conversation_id,
            sender_id: msg.sender_id, type: msg.type,
            content: msg.content || '', media_url: msg.media_url || null,
            duration: msg.media_duration || null, reply_to: msg.reply_to || null, pending: msg.pending || false, created_at: msg.created_at, client_id: msg.client_id||null,
            expires_at: msg.expires_at || null, view_once: msg.view_once || false
          });
        } else {
          const msgs = await pencMsgs(); msgs.push(msg); await pencSaveMsgs(msgs);
        }
      } catch (e) { console.error('penc persist msg:', e.message); }
      }
      try {
        if (_pgPool) {
          await _pgPool.query('UPDATE penc_conversations SET updated_at=NOW() WHERE id=$1', [conversation_id]);
        } else {
          const convs = await pencConvs();
          const c = convs.find(x => x.id === conversation_id);
          if (c) { c.updated_at = new Date().toISOString(); await pencSaveConvs(convs); }
        }
      } catch {}

      // 3) Notifications push aux destinataires
      try {
        if (webpush) {
          let recipients = [];
          if (_pgPool) {
            const cr = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1', [conversation_id]);
            if (cr.rows[0]) {
              const parts = Array.isArray(cr.rows[0].participants) ? cr.rows[0].participants : JSON.parse(cr.rows[0].participants||'[]');
              recipients = parts.filter(p => p !== pencUserId);
            }
          } else {
            const c3 = (await pencConvs()).find(x => x.id === conversation_id);
            recipients = (c3 && Array.isArray(c3.participants||c3.members)) ? (c3.participants||c3.members).filter(m => m !== pencUserId) : [];
          }
          let pbody = pencMsgBody(type, content, msg.media_duration);
          const ptitle = (sender && sender.full_name) ? sender.full_name : 'Nouveau message';
          for (const rid of recipients) { await sendPencPush(rid, { title: ptitle, body: pbody, tag: 'penc-'+conversation_id, url: '/messager?conv='+conversation_id, conv_id: conversation_id }); }
        }
      } catch (e) { console.error('penc push notify:', e.message); }
    } catch (e) { console.error('penc msg send:', e.message); if (cb) cb({ error: 'Erreur envoi' }); }
  });

  socket.on('typing:start', ({ conversation_id }) => {
    socket.to('penc:' + conversation_id).emit('typing:start', { userId: pencUserId, conversation_id });
  });
  socket.on('typing:stop', ({ conversation_id }) => {
    socket.to('penc:' + conversation_id).emit('typing:stop', { userId: pencUserId, conversation_id });
  });
  // Vue unique : le destinataire consomme le media (photo/video/audio) — plus jamais revisible ensuite
  socket.on('message:view_once_consume', async (data, cb) => {
    try{
      const messageId = data && data.message_id;
      if(!messageId || !_pgPool){ if(cb) cb({error:'invalide'}); return; }
      const r = await _pgPool.query('SELECT id, sender_id, conversation_id, media_url, view_once, view_once_consumed FROM penc_messages WHERE id=$1', [messageId]);
      if(!r.rows.length){ if(cb) cb({error:'introuvable'}); return; }
      const m = r.rows[0];
      if(String(m.sender_id) === String(pencUserId)){ if(cb) cb({ success:true, media_url:m.media_url }); return; } // l'expediteur garde toujours acces
      if(!m.view_once){ if(cb) cb({ success:true, media_url:m.media_url }); return; }
      if(m.view_once_consumed){ if(cb) cb({error:'deja_vu'}); return; }
      await _pgPool.query('UPDATE penc_messages SET view_once_consumed=TRUE WHERE id=$1', [messageId]);
      // Informe tous les participants (dont l'expediteur) que le media a ete consomme
      try{
        const cr = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1', [m.conversation_id]);
        const parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants) ? cr.rows[0].participants : JSON.parse(cr.rows[0].participants||'[]')) : [];
        emitToUsers(parts, 'message:view_once_consumed', { message_id: messageId, conv_id: m.conversation_id });
      }catch(_e){}
      if(cb) cb({ success:true, media_url:m.media_url }); // renvoie l'URL UNE fois pour l'affichage immediat
    }catch(e){ if(cb) cb({error:'Erreur serveur'}); }
  });
  // ══ Vue unique d'un media (photo/video/audio/document) — declenchee quand l'utilisateur l'ouvre reellement ══
  socket.on('media:view', async (data, cb) => {
    try{
      const { message_id } = data || {};
      if(!message_id || !_pgPool){ if(typeof cb==='function') cb({error:'invalide'}); return; }
      const mr = await _pgPool.query('SELECT conversation_id, sender_id FROM penc_messages WHERE id=$1', [message_id]);
      if(!mr.rows.length){ if(typeof cb==='function') cb({error:'introuvable'}); return; }
      const { conversation_id: convId, sender_id: senderId } = mr.rows[0];
      // Pas de vue enregistree pour son propre media envoye
      if(String(senderId)===String(pencUserId)){ if(typeof cb==='function') cb({success:true, skipped:true}); return; }
      const already = await _pgPool.query('SELECT 1 FROM penc_media_views WHERE message_id=$1 AND user_id=$2', [message_id, pencUserId]);
      if(already.rowCount===0){
        await _pgPool.query('INSERT INTO penc_media_views(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [message_id, pencUserId]);
        const vr = await _pgPool.query('SELECT COUNT(*)::int AS n FROM penc_media_views WHERE message_id=$1', [message_id]);
        io.to('user:'+String(senderId)).emit('media:viewed', { message_id, conv_id:convId, viewer_id:pencUserId, view_count: vr.rows[0].n });
      }
      if(typeof cb==='function') cb({success:true});
    }catch(e){ if(typeof cb==='function') cb({error:'Erreur serveur'}); }
  });
  socket.on('message:react', async (data, cb) => {
    try {
      const { message_id, emoji } = data || {};
      if (!message_id) { if (typeof cb === 'function') cb({ error: 'message_id manquant' }); return; }
      if (!_pgPool) { if (typeof cb === 'function') cb({ error: 'BD indisponible' }); return; }
      const mr = await _pgPool.query('SELECT conversation_id FROM penc_messages WHERE id=$1', [message_id]);
      if (!mr.rows.length) { if (typeof cb === 'function') cb({ error: 'Message introuvable' }); return; }
      const convId = mr.rows[0].conversation_id;
      const ex = await _pgPool.query('SELECT emoji FROM penc_message_reactions WHERE message_id=$1 AND user_id=$2', [message_id, pencUserId]);
      let action;
      if (ex.rows.length && ex.rows[0].emoji === emoji) {
        // Meme emoji re-tape : on retire la reaction (toggle off)
        await _pgPool.query('DELETE FROM penc_message_reactions WHERE message_id=$1 AND user_id=$2', [message_id, pencUserId]);
        action = 'removed';
      } else {
        await _pgPool.query(
          'INSERT INTO penc_message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT (message_id,user_id) DO UPDATE SET emoji=$3, created_at=NOW()',
          [message_id, pencUserId, emoji]
        );
        action = 'set';
      }
      const rr = await _pgPool.query('SELECT user_id, emoji FROM penc_message_reactions WHERE message_id=$1', [message_id]);
      const payload = { message_id, conv_id: convId, reactions: rr.rows };
      const cparts = await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1', [convId]);
      const parts = cparts.rows[0] ? (Array.isArray(cparts.rows[0].participants) ? cparts.rows[0].participants : JSON.parse(cparts.rows[0].participants || '[]')) : [];
      emitToUsers(parts, 'message:reaction', payload);
      if (typeof cb === 'function') cb({ success: true, action, reactions: rr.rows });
    } catch (e) { if (typeof cb === 'function') cb({ error: 'Erreur serveur' }); }
  });
  socket.on('message:read', async ({ conversation_id }) => {
    try {
      if (!_pgPool) {
        // Repli JSONBin uniquement si PostgreSQL est indisponible — le compteur non-lu vit
        // côté client sinon, pas besoin de toucher au bin conversations à chaque lecture.
        const convs = await pencConvs();
        const c = convs.find(x => x.id === conversation_id);
        if (c) { c.unread = c.unread || {}; c.unread[pencUserId] = 0; await pencSaveConvs(convs); }
      }
    } catch {}
    socket.to('penc:' + conversation_id).emit('message:read', { userId: pencUserId, conversation_id });
  });

  socket.on('disconnect', async () => {
    // Multi-appareils : ne déclarer l'utilisateur hors ligne que si c'était
    // son DERNIER appareil connecté (les autres onglets/téléphones restent actifs).
    // Le socket qui se déconnecte a déjà quitté ses rooms à ce stade (comportement Socket.io),
    // donc la taille restante de la room reflète bien les AUTRES appareils.
    let stillOnline = false;
    try { const room = io.sockets.adapter.rooms.get('user:'+pencUserId); stillOnline = !!(room && room.size > 0); } catch(e){}
    if (stillOnline) { try{ pencOnline.set(pencUserId, Array.from(io.sockets.adapter.rooms.get('user:'+pencUserId))[0]); }catch(e){} return; }
    pencOnline.delete(pencUserId);
    try {
      const users = await pencUsers();
      const u = users.find(x => x.id === pencUserId);
      if (u) { u.is_online = false; u.last_seen = new Date().toISOString(); await pencSaveUsers(users); }
    } catch {}
    io.emit('user:online', { userId: pencUserId, isOnline: false });
  });
});


httpServer.listen(PORT, () => {
    console.log("\nPST — Pure Smart Telecom");
    console.log("http://localhost:" + PORT);
    console.log("MongoDB: " + (db ? "connecte" : "mode memoire") + "\n");
  });
});
