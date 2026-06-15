const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// ── Socket.io init (Penc temps réel) ──────────────────────
const http = require('http');
const { Server: IOServer } = require('socket.io');
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});



app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.get('/ping', function(req,res){ res.set('Cache-Control','no-store'); res.status(200).type('text/plain').send('pong'); });
app.use(express.json({ limit: '10mb' }));
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
const PENC_SECRET = process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3';

// ── Middleware auth Penc ──────────────────────────────────────
function pencAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.pencUser = jwt_penc.verify(h.slice(7), PENC_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

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
async function pencConvs(){const d=await jbGet(BINS.penc_convs);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.convs)?d.convs:[];}
async function pencSaveConvs(a)   { return jbSet(BINS.penc_convs,  { convs: a }); }
async function pencMsgs(){const d=await jbGet(BINS.penc_msgs);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.msgs)?d.msgs:[];}
async function pencSaveMsgs(a)    { return jbSet(BINS.penc_msgs,   { msgs: a }); }
async function pencStatuses(){const d=await jbGet(BINS.penc_status);if(!d)return[];if(Array.isArray(d))return d;return Array.isArray(d.statuses)?d.statuses:[];}
async function pencSaveStatuses(a){ return jbSet(BINS.penc_status, { statuses: a }); }
const pencStrip = u => { if (!u) return null; const { password, ...s } = u; return s; };

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
    _pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
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
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;
      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;
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
      CREATE INDEX IF NOT EXISTS idx_psl_created ON penc_security_logs(created_at);
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
    `);
    console.log('✅ PostgreSQL Penc connecté — tables users/convs/messages prêtes');
    try{ await _pgPool.query("INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,bio,created_at) VALUES('penc_official','Penc','penc_officiel','+00000000000',NULL,'-','https://penc-messagerie.com/penc-icon-192.png','Compte officiel Penc',NOW()) ON CONFLICT(id) DO UPDATE SET full_name='Penc', avatar_url='https://penc-messagerie.com/penc-icon-192.png', bio='Compte officiel Penc'"); console.log('✅ Compte officiel Penc pret'); }catch(eOff){ console.error('Penc official:', eOff.message); }
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
           total_time_seconds:row.total_time_seconds||0, valid_views:row.valid_views||0, created_at:row.created_at };
}
async function pgFindUser(field, value){
  if(!_pgPool) return null;
  const q=field==='email'?'SELECT * FROM penc_users WHERE LOWER(email)=LOWER($1)'
          :field==='username'?'SELECT * FROM penc_users WHERE LOWER(username)=LOWER($1)'
          :'SELECT * FROM penc_users WHERE '+field+'=$1';
  const r=await _pgPool.query(q,[value]); return pgRow(r.rows[0]||null);
}
async function pgCreateUser(u){
  const r=await _pgPool.query(
    'INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,is_admin,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *',
    [u.id,u.full_name,u.username,u.phone,u.email||null,u.password_hash,u.avatar_url||null,u.is_admin||false]
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
    'INSERT INTO penc_conversations(id,participants) VALUES($1,$2) RETURNING *',
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
    'INSERT INTO penc_messages(id,conversation_id,sender_id,type,content,media_url,duration,reply_to,created_at,deleted_for_all,pending,client_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11) RETURNING *',
    [msg.id,msg.conversation_id,msg.sender_id,msg.type||'text',msg.content||'',msg.media_url||null,msg.duration||null,msg.reply_to?JSON.stringify(msg.reply_to):null,msg.created_at||new Date().toISOString(),msg.pending||false,msg.client_id||null]
  );
  // Mettre à jour updated_at de la conv
  await _pgPool.query('UPDATE penc_conversations SET updated_at=NOW() WHERE id=$1',[msg.conversation_id]);
  return r.rows[0];
}
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
app.post('/api/penc/auth/register', async (req, res) => {
  try {
    const { full_name, username, phone, email, password } = req.body;
    if (!full_name||!username||!phone||!password)
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Mot de passe min. 6 caractères' });

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

    const hash = bcrypt_penc ? await bcrypt_penc.hash(password, 10) : password;
    const uid = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const isAdmin = PENC_ADMIN_EMAILS.includes((email||'').toLowerCase());
    const newUser = { id:uid, full_name, username, phone, email:email||null,
      password_hash:hash, avatar_url:null, bio:'', is_admin:isAdmin };

    // ── Sauvegarder PostgreSQL (prioritaire) ──
    if (_pgPool) {
      await pgCreateUser(newUser);
    } else {
      // Fallback JSONBin
      const users = await pencUsers();
      users.push({...newUser, password:hash});
      await pencSaveUsers(users);
    }

    const tok = jwt_penc.sign({ userId: uid }, PENC_SECRET, { expiresIn: '90d' });
    const safe = pencStrip({...newUser,password:hash});
    // Notifier les utilisateurs connectés
    setImmediate(async function(){
      try{
        const welcomeMsg = '🎉 '+full_name+' vient de rejoindre Penc !';
        pencOnline.forEach(function(sid){
          io.to(sid).emit('penc:welcome',{message:welcomeMsg});
        });
        try{ if(_pgPool){ const _ar=await _pgPool.query("SELECT id FROM penc_users WHERE LOWER(email) = ANY($1)",[PENC_ADMIN_EMAILS]); _ar.rows.forEach(function(a){ emitToUsers(String(a.id),'admin:newuser',{id:uid, full_name:full_name, email:email||'', phone:phone}); }); } }catch(e4){}
        try{ if(_pgPool){
          const _wconv = await pgGetOrCreateConv('penc_official', uid);
          if(_wconv){
            const _wtext = "Bienvenue sur Penc, "+full_name+" ! \ud83c\udf89 Heureux de t'accueillir parmi nous. Discute en priv\u00e9, partage tes statuts, \u00e9coute la radio DeglouFM et profite de toutes les fonctionnalit\u00e9s. R\u00e9ponds \u00e0 ce message pour toute question. \u2014 L'\u00e9quipe Penc \ud83d\udc9a";
            const _wmsg = { id:'msg_'+Date.now()+Math.random().toString(36).slice(2), conversation_id:_wconv.id, sender_id:'penc_official', type:'text', content:_wtext, created_at:new Date().toISOString() };
            let _wsender={ id:'penc_official', full_name:'Penc' }; try{ const _pu=await pgFindUser('id','penc_official'); if(_pu) _wsender=pencStrip(_pu); }catch(_){}
            const _wfull = Object.assign({}, _wmsg, { sender:_wsender });
            try{ io.to('penc:'+_wconv.id).emit('message:new',_wfull); }catch(_){}
            try{ io.to('user:'+String(uid)).emit('message:new',_wfull); }catch(_){}
            try{ await pgSaveMessage({ id:_wmsg.id, conversation_id:_wconv.id, sender_id:'penc_official', type:'text', content:_wtext, created_at:_wmsg.created_at }); }catch(_){}
            try{ if(typeof webpush!=='undefined' && webpush){ await sendPencPush(uid,{title:'Penc',body:'Bienvenue sur Penc ! \ud83c\udf89',tag:'penc-welcome',url:'/messager?conv='+_wconv.id,conv_id:_wconv.id}); } }catch(_){}
          }
        } }catch(eWel){}
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

// POST /api/penc/auth/login
app.post('/api/penc/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier||!password) return res.status(400).json({error:'Identifiant et mot de passe requis'});
    const id = String(identifier).trim();
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

    if (user && user.suspended && !isAdminBypass) return res.status(403).json({ error: '🚫 Ce compte a été suspendu.' });
    // ── Bypass admin si user introuvable ──
    if (!user && isAdminBypass) {
      console.log('⚡ Admin bypass:', idLow);
      const hash = bcrypt_penc ? await bcrypt_penc.hash(ADMIN_PWD, 10) : ADMIN_PWD;
      const adminUser = { id:'superadmin_'+Date.now(), full_name:'Papa Seny Touré',
        username:'admin_pst', phone:'', email:idLow,
        password_hash:hash, avatar_url:null, bio:'', is_admin:true };
      if (_pgPool) { try { await pgCreateUser(adminUser); } catch(e){} }
      user = adminUser;
    }

    if (!user) { pencSecLog('login_failed', req, {identifier:id, detail:'compte introuvable'}); return res.status(400).json({error:'Compte introuvable. Inscris-toi d\'abord.'}); }

    // ── Vérification mot de passe ──
    let pwdOk = isAdminBypass;
    if (!pwdOk) {
      const hash = user.password_hash || user.password || '';
      pwdOk = bcrypt_penc ? await bcrypt_penc.compare(password, hash) : password === hash;
    }
    if (!pwdOk) { pencSecLog('login_failed', req, {identifier:id, user_id:(user&&user.id)||null, detail:'mot de passe incorrect'}); return res.status(400).json({error:'Mot de passe incorrect.'}); }

    // ── Mise à jour last_seen ──
    if (_pgPool) {
      await pgUpdateUser(user.id, { is_online:true, last_seen:'NOW()' }).catch(()=>{});
    }

    pencSecLog('login_ok', req, {identifier:id, user_id:user.id});
    const tok = jwt_penc.sign({ userId: user.id }, PENC_SECRET, { expiresIn: '90d' });
    const isAdmin = isAdminEmail || user.is_admin || false;
    res.json({ user: Object.assign({}, pencStrip(user), { is_admin: isAdmin }), token: tok });
  } catch(e) {
    console.error('login:', e.message);
    res.status(500).json({ error: 'Erreur serveur: '+e.message });
  }
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
      const convs = await pencConvs();
      const set = new Set();
      convs.forEach(c => { if (Array.isArray(c.members) && c.members.includes(uid)) c.members.forEach(m => { if (m !== uid) set.add(m); }); });
      contacts_count = set.size;
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
app.put('/api/penc/auth/profile', pencAuth, async (req, res) => {
  try {
    const { full_name, bio, avatar_url } = req.body;
    const uid = req.pencUser.userId;
    if (_pgPool) {
      const fields = {};
      if (full_name !== undefined) fields.full_name = full_name;
      if (bio !== undefined) fields.bio = bio;
      if (avatar_url !== undefined) fields.avatar_url = avatar_url;
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
    'INSERT INTO penc_statuses(id,user_id,type,media_url,text_content,bg_color,caption,reactions,views,view_ips,created_at,expires_at,duration)'
    +' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
    [st.id,st.user_id,st.type||'text',st.media_url||null,st.text_content||null,
     st.bg_color||'#050D18',st.caption||null,
     JSON.stringify(st.reactions||[]),JSON.stringify(st.views||[]),JSON.stringify(st.view_ips||[]),
     st.created_at||new Date().toISOString(),
     st.expires_at||new Date(Date.now()+86400000).toISOString(),
     st.duration||10]
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
    view_log: typeof row.view_log==='string'?JSON.parse(row.view_log):row.view_log||[]
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
      messages = rows.map(m => ({
        id: m.id, conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        is_mine: String(m.sender_id) === String(uid),
        type: m.type, content: m.content,
        media_url: m.media_url, media_duration: m.duration,
        reply_to: m.reply_to?(function(){
          if(typeof m.reply_to==='object') return m.reply_to;
          try{return JSON.parse(m.reply_to);}catch(e){return null;}
        })():null,
        deleted_for_all: m.deleted_for_all || false,
        delivered_at: m.delivered_at || null,
        read_at: m.read_at || null,
        pending: m.pending || false,
        created_at: m.created_at
      }));
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
app.get('/api/penc/users/:id/publications', pencAuth, async (req,res)=>{
  try{
    const me=req.pencUser.userId; const target=req.params.id;
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
function _frInfo(u){ u=u||{}; return {id:u.id, full_name:u.full_name||u.username||'Utilisateur', username:u.username||'', avatar_url:u.avatar_url||null, is_online:!!u.is_online}; }

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
    if(ex.rows.length) return res.json({success:true, status:ex.rows[0].status});
    await _pgPool.query("INSERT INTO penc_friendships(id,requester,recipient,status,created_at,updated_at) VALUES($1,$2,$3,'pending',NOW(),NOW())",['fr_'+Date.now()+Math.random().toString(36).slice(2),uid,other]);
    try{ const me=await pgFindUser('id',uid)||{}; emitToUsers(other,'friend:request',{from:{id:uid, full_name:me.full_name||me.username||'Utilisateur', avatar_url:me.avatar_url||null}}); try{ sendPencPush(other,{title:'Nouvelle demande d\'ami', body:(me.full_name||me.username||'Quelqu\'un')+' souhaite vous ajouter', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-friendreq', data:{type:'friend_request', url:'/messager'}}); }catch(_p){} }catch(e){}
    res.json({success:true, status:'pending'}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.post('/api/penc/friends/accept/:userId', pencAuth, async (req,res)=>{
  try{ const uid=req.pencUser.userId; const requester=req.params.userId;
    if(!_pgPool) return res.status(503).json({error:'BD indisponible'});
    await _pgPool.query("UPDATE penc_friendships SET status='accepted', updated_at=NOW() WHERE requester=$1 AND recipient=$2 AND status='pending'",[requester,uid]);
    try{ await _pgPool.query("UPDATE penc_messages SET pending=FALSE WHERE sender_id=$1 AND pending=TRUE AND conversation_id IN (SELECT id FROM penc_conversations WHERE participants @> $2::jsonb)",[requester, JSON.stringify([uid])]); }catch(e2){}
    try{ const me=await pgFindUser('id',uid)||{}; emitToUsers(requester,'friend:accepted',{by:{id:uid, full_name:me.full_name||me.username||'Utilisateur'}}); try{ sendPencPush(requester,{title:'Demande acceptee', body:(me.full_name||me.username||'Quelqu\'un')+' a accepte votre demande d\'ami', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-friendacc', data:{type:'friend_accepted', url:'/messager'}}); }catch(_p){} }catch(e){}
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
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
    if(client_id){
      try{ const ex=await _pgPool.query('SELECT id FROM penc_messages WHERE client_id=$1 LIMIT 1',[client_id]); if(ex.rows[0]) return res.json({ success:true, duplicate:true, id:ex.rows[0].id }); }catch(_e){}
    }
    const msg = {
      id: 'msg_'+Date.now()+Math.random().toString(36).slice(2),
      conversation_id, sender_id: uid, reply_to: reply_to||null,
      type: type||'text', content: content||null,
      media_url: media_url||null, media_duration: media_duration||null,
      client_id: client_id||null, created_at: new Date().toISOString(), read_at:null
    };
    let sender = { id: uid };
    try{ const u=await pgFindUser('id',uid); if(u) sender=pencStrip(u); }catch(_){}
    const fullMsg = { ...msg, sender };
    try{ io.to('penc:'+conversation_id).emit('message:new', fullMsg); }catch(_){}
    try{
      const cr=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]);
      let parts = cr.rows[0] ? (Array.isArray(cr.rows[0].participants)?cr.rows[0].participants:JSON.parse(cr.rows[0].participants||'[]')) : [];
      parts.forEach(pid=>{ if(String(pid)!==String(uid)) io.to('user:'+pid).emit('message:new', fullMsg); });
    }catch(_){}
    try{ await pgSaveMessage({ id:msg.id, conversation_id:msg.conversation_id, sender_id:msg.sender_id, type:msg.type, content:msg.content||'', media_url:msg.media_url||null, duration:msg.media_duration||null, reply_to:msg.reply_to||null, created_at:msg.created_at, client_id:msg.client_id }); }catch(e){ console.error('penc /send persist:', e.message); }
    try{ if(typeof webpush!=='undefined' && webpush){ const cr2=await _pgPool.query('SELECT participants FROM penc_conversations WHERE id=$1',[conversation_id]); let rparts=cr2.rows[0]?(Array.isArray(cr2.rows[0].participants)?cr2.rows[0].participants:JSON.parse(cr2.rows[0].participants||'[]')):[]; let pbody=type==='voice'?'Message vocal':type==='image'?'Photo':type==='video'?'Video':type==='money'?('Transfert '+(content||'')):type==='sticker'?(content||'Sticker'):((content||'').slice(0,120)); const ptitle=(sender&&sender.full_name)?sender.full_name:'Nouveau message'; for(const rid of rparts){ if(String(rid)!==String(uid)){ try{ await sendPencPush(rid,{title:ptitle,body:pbody,tag:'penc-'+conversation_id,url:'/messager?conv='+conversation_id,conv_id:conversation_id}); }catch(_pp){} } } } }catch(_pe){}
    return res.json({ success:true, message: fullMsg });
  }catch(e){ return res.status(500).json({ error:'Erreur envoi' }); }
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
      const sid=pencOnline.get(String(pid));
      if(sid) io.to(sid).emit('message:edited',{id:req.params.id,content:content.trim(),conv_id:msg.conversation_id});
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
      result = await Promise.all(convs.map(async (c) => {
        const parts = Array.isArray(c.participants) ? c.participants : JSON.parse(c.participants||'[]');
        const otherId = parts.find(p => p !== uid);
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
          updated_at: c.updated_at
        };
      }));
    } else {
      // Fallback JSONBin
      const convs = await pencConvs();
      const users = await pencUsers();
      const msgs = await pencMsgs();
      result = convs.filter(c => Array.isArray(c.participants) && c.participants.includes(uid)).map(c => {
        const otherId = c.participants.find(p => p !== uid);
        const other = users.find(u => u.id === otherId) || {};
        const convMsgs = msgs.filter(m => m.conversation_id === c.id);
        const last = convMsgs[convMsgs.length - 1] || null;
        return { ...c, other_user_id: otherId, name: other.full_name || 'Utilisateur',
          avatar_url: other.avatar_url || null, last_message: last };
      });
    }
    res.json({ conversations: result });
  } catch(e) { console.error('GET convs:', e.message); res.status(500).json({ error: 'Erreur' }); }
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
    res.json({ conversation: { ...conv, other_user_id: target_user_id, name: other.full_name || 'Utilisateur', avatar_url: other.avatar_url || null }});
  } catch(e) { console.error('POST direct:', e.message); res.status(500).json({ error: 'Erreur' }); }
});

// GET /api/penc/conversations/:id/messages
app.get('/api/penc/conversations/:id/messages', pencAuth, async (req, res) => {
  try {
    const msgs = await pencMsgs();
    const users = await pencUsers();
    const convMsgs = msgs
      .filter(m => m.conversation_id === req.params.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-100);
    const enriched = convMsgs.map(m => ({ ...m, sender: pencStrip(users.find(u => u.id === m.sender_id)) }));
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
        // Sans query: retourner tous les utilisateurs
        const all = await pgAllUsers() || [];
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
    const u=await pencUsers(); const c=await pencConvs();
    const ch=await pencChannels();
    res.json({status:'ok',users:u.length,convs:c.length,channels:ch.length,
      bins:{penc_users:!!BINS.penc_users,penc_convs:!!BINS.penc_convs,penc_channels:!!JSONBIN_PENC_CHANNELS_BIN}});
  }catch(e){res.json({status:'error',msg:e.message});}
});

// GET /api/penc/contacts
app.get('/api/penc/contacts', pencAuth, async (req, res) => {
  try {
    const uid = req.pencUser.userId;
    // PostgreSQL prioritaire — fallback JSONBin
    const users = _pgPool ? (await pgAllUsers() || []) : await pencUsers();
    res.json({ contacts: users.filter(u => u.id !== uid).map(pencStrip) });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
// STATUSES
// ════════════════════════════════════════════════════════════

// GET /api/penc/statuses
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
    res.json({statuses,mine,me:meUser});
  }catch(e){console.error('GET statuses:',e.message);res.status(500).json({error:'Erreur serveur'});}
});

// POST /api/penc/statuses
app.post('/api/penc/statuses', pencAuth, async (req, res) => {
  try {
    const { type, media_url, text_content, bg_color, caption, duration } = req.body;
    const status = {
      id: 'st_'+Date.now()+Math.random().toString(36).slice(2),
      user_id: req.pencUser.userId, type: type||'text',
      media_url: media_url||null, text_content: text_content||null,
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
        const ppayload={ title:aname, body:'a publié un nouveau statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-status-'+req.pencUser.userId, data:{ type:'status', user_id:req.pencUser.userId, url:'/' } };
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
app.get('/api/penc/admin/overview', pencAuth, pencAdmin, async (req, res) => {
  try {
    const users = _pgPool ? (await pgAllUsers()||[]) : await pencUsers();
    const convs = await pencConvs();
    const statuses = await pencStatuses();
    let msgsCount = 0; try { msgsCount = (await pencMsgs()).length; } catch (e) {}
    const enrich = (u) => { const vv = u.valid_views || 0; const earned = Math.floor(vv / 1000) * 75; const withdrawn = u.withdrawn || 0; return {
      id: u.id, full_name: u.full_name, username: u.username, phone: u.phone, email: u.email || '', avatar_url: u.avatar_url || null,
      valid_views: vv, own_views: u.own_views || 0, earned, withdrawn, balance: Math.max(0, earned - withdrawn),
      contacts: pencContactsCount(convs, u.id), reward_pending: !!u.reward_pending, withdraw_request: u.withdraw_request || null, created_at: u.created_at,
      geo: u.geo || null, total_time_seconds: u.total_time_seconds || 0, last_seen: u.last_seen || null,
      msgs_sent:(_msgMap[String(u.id)]||0), is_moderator:!!(_modMap[String(u.id)]||{}).moderator, muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended, verified:!!u.verified };
    };
    const _modMap={}; try{ if(_pgPool){ const _mq=await _pgPool.query('SELECT id, muted_until, suspended, moderator FROM penc_users'); _mq.rows.forEach(function(r){ _modMap[String(r.id)]={muted_until:r.muted_until||null, suspended:!!r.suspended, moderator:!!r.moderator}; }); } }catch(_e){}
    const _msgMap={}; try{ if(_pgPool){ const _qq=await _pgPool.query('SELECT sender_id, COUNT(*)::int c FROM penc_messages GROUP BY sender_id'); _qq.rows.forEach(function(r){ _msgMap[String(r.sender_id)]=r.c; }); } }catch(_e){}
    const all = users.map(enrich);
    const withdrawals = all.filter(u => u.withdraw_request && u.withdraw_request.status === 'pending');
    const rewardAlerts = all.filter(u => u.reward_pending);
    const totalValidViews = all.reduce((a, u) => a + u.valid_views, 0);
    res.json({
      stats: { users: users.length, conversations: convs.length, statuses: statuses.length, messages: msgsCount, total_valid_views: totalValidViews },
      withdrawals, rewardAlerts,
      users: all.sort((a, b) => b.valid_views - a.valid_views)
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
    res.json({ success: true, sent, total });
  } catch (e) { console.error('broadcast:', e.message); res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/penc/admin/security', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] });
    let logs=[], failed_24h=0, suspended=[], moderators=[];
    try { const r = await _pgPool.query("SELECT * FROM penc_security_logs ORDER BY created_at DESC LIMIT 100"); logs = r.rows; } catch(e){}
    try { const f = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='login_failed' AND created_at >= NOW() - INTERVAL '24 hours'"); failed_24h = f.rows[0].c; } catch(e){}
    try { const sq = await _pgPool.query("SELECT id, full_name, username, phone FROM penc_users WHERE suspended=TRUE LIMIT 100"); suspended = sq.rows; } catch(e){}
    try { const m = await _pgPool.query("SELECT id, full_name, username FROM penc_users WHERE moderator=TRUE LIMIT 100"); moderators = m.rows; } catch(e){}
    res.json({ logs, failed_24h, suspended, moderators });
  } catch (e) { res.json({ logs:[], failed_24h:0, suspended:[], moderators:[] }); }
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
    const { type, media_url, text_content, bg_color, caption, duration } = req.body || {};
    const status = {
      id: 'st_' + Date.now() + Math.random().toString(36).slice(2),
      user_id: 'penc_official', type: type || 'text',
      media_url: media_url || null, text_content: text_content || null,
      bg_color: bg_color || '#0E8C7C', caption: caption || null,
      duration: (typeof duration === 'number' && duration > 0 && duration <= 60) ? Math.round(duration) : (type === 'video' ? 0 : 10),
      reactions: [], views: [], view_ips: [],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
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
    try { if (typeof webpush !== 'undefined' && webpush) { const ptitle = (sender && sender.full_name) ? sender.full_name : 'Nouveau message'; await sendPencPush(target, { title: ptitle, body: content.slice(0, 120), tag: 'penc-' + conv.id, url: '/messager?conv=' + conv.id, conv_id: conv.id }); } } catch (_pp) {}
    return res.json({ success: true, message: fullMsg, conversation_id: conv.id });
  } catch (e) { return res.status(500).json({ error: 'Erreur envoi' }); }
});
app.post('/api/penc/admin/moderator/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const mod=!!(req.body&&req.body.moderator);
    await _pgPool.query('UPDATE penc_users SET moderator=$1 WHERE id=$2',[mod,req.params.userId]);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
app.delete('/api/penc/admin/user/:id', pencAuth, pencAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    let target = null;
    try { if (_pgPool) { const r = await _pgPool.query('SELECT email FROM penc_users WHERE id=$1', [uid]); target = r.rows[0] || null; } } catch (e) {}
    if (target && PENC_ADMIN_EMAILS.includes(String(target.email || '').toLowerCase())) return res.status(400).json({ error: 'Impossible de supprimer un administrateur' });
    if (_pgPool) {
      try { await _pgPool.query('DELETE FROM penc_messages WHERE sender_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_statuses WHERE user_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_status_comments WHERE user_id=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_friendships WHERE requester=$1 OR recipient=$1', [uid]); } catch (e) {}
      try { await _pgPool.query('DELETE FROM penc_users WHERE id=$1', [uid]); } catch (e) {}
    }
    try { const users = await pencUsers(); const i = users.findIndex(x => String(x.id) === String(uid)); if (i >= 0) { users.splice(i, 1); await pencSaveUsers(users); } } catch (e) {}
    try { pencOnline.delete(uid); } catch (e) {}
    res.json({ success: true });
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
    const enriched=channels.map(ch=>({...ch,posts:undefined,post_count:(ch.posts||[]).length,follower_count:(ch.followers||[]).length,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid)),last_post:(ch.posts||[]).slice(-1)[0]||null}));
    res.json({channels:enriched}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.post('/api/penc/channels', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const {name,description,icon_url}=req.body;
    if(!name||name.trim().length<2) return res.status(400).json({error:'Nom requis (2 car. min)'});
    const channels=await pencChannels();
    const ch={id:'ch_'+Date.now(),name:name.trim(),description:(description||'').trim(),icon_url:icon_url||null,creator_id:uid,admins:[],followers:[uid],posts:[],created_at:new Date().toISOString()};
    channels.push(ch); await pencSaveChannels(channels);
    res.json({success:true,channel:{...ch,posts:undefined,follower_count:1,is_following:true,is_creator:true}}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
});
app.get('/api/penc/channels/:id', pencAuth, async (req,res) => {
  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);
    if(!ch) return res.status(404).json({error:'Canal introuvable'});
    res.json({...ch,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid))}); }catch(e){res.status(500).json({error:'Erreur serveur'});}
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
    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Seuls le proprietaire et les admins peuvent publier'});
    const post={id:'p_'+Date.now(),content:content||'',type:type||'text',
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
      await _pgPool.query('DELETE FROM penc_statuses WHERE id=$1 AND user_id=$2',[req.params.id,uid]);
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
      try{ if(String(st.user_id)!==String(uid)){ let _rn='Une personne'; try{ const _ru=await pgFindUser('id',uid); if(_ru) _rn=_ru.full_name||_ru.username||'Une personne'; }catch(_e11){} emitToUsers(String(st.user_id),'status:reaction',{status_id:req.params.id, emoji:emoji, from_name:_rn}); } }catch(_e12){}
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

io.on('connection', async (socket) => {
  const tok = socket.handshake.auth?.token;
  if (!tok) return;
  let pencUserId;
  try { pencUserId = jwt_penc.verify(tok, PENC_SECRET).userId; }
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
    // 1) pencOnline map (rapide)
    const sid=pencOnline.get(uid);
    if(sid){ io.to(sid).emit(event,data); console.log('📡',event,'→',uid.slice(0,10),'via map'); return true; }
    // 2) fetchSockets (fiable même si map périmée)
    try{
      const sockets=await io.fetchSockets();
      const target=sockets.find(s=>s.data.pencUserId===uid);
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
  socket.on('call:initiate', async ({target_user_id, type, caller_name, caller_avatar, room_name}) => {
    const ok=await emitToUser(target_user_id,'call:incoming',{
      from:pencUserId, type:type||'audio',
      room_name:room_name||('call_'+pencUserId),
      caller_name:caller_name||'Inconnu', caller_avatar:caller_avatar||null
    });
    console.log('📞 call:initiate',pencUserId.slice(0,8),'→',target_user_id.slice(0,8),'online:',ok);
    // Si hors ligne → push notification d'appel entrant
    if(!ok){
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
        console.log('📲 Push call envoyé à',target_user_id.slice(0,10));
      }catch(ep){console.error('push call err:',ep.message);}
    }
  });
  socket.on('call:accept', ({caller_id}) => {
    emitToUser(caller_id,'call:accepted',{by:pencUserId});
  });
  socket.on('call:decline', ({caller_id}) => {
    emitToUser(caller_id,'call:declined',{by:pencUserId});
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
        const senderSid=pencOnline.get(r.rows[0].sender_id);
        if(senderSid) io.to(senderSid).emit('message:delivered',{id});
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
      Object.entries(bySender).forEach(([sid,ids])=>{
        const senderSock=pencOnline.get(sid);
        if(senderSock) io.to(senderSock).emit('message:read_receipt',{ids,conv_id});
      });
    }catch(e){}
  });
  socket.on('user:join', ({ userId }) => {
    if (userId) socket.join('user:' + userId);
  });

  // Envoyer message
  socket.on('message:send', async (data, cb) => {
    const { conversation_id, type, content, media_url, media_duration, poll_question, poll_options, poll_duration, radio_name, radio_url, money_amount, money_op, client_id } = data;
    try {
      const { reply_to } = data;
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
          if (_other) {
            _blocked = await pgIsBlocked(pencUserId, _other);
            if (!_blocked) {
              const _cnt = await _pgPool.query('SELECT COUNT(*) AS n FROM penc_messages WHERE conversation_id=$1',[conversation_id]);
              if (parseInt(_cnt.rows[0].n) === 0) {
                const _acc = await pgFriendAccepted(pencUserId, _other);
                if (!_acc && !_senderAdmin) { msg.pending = true; await pgEnsureFriendRequest(pencUserId, _other); }
              }
            }
          }
        }
      } catch(_e){ _blocked = false; msg.pending = false; }
      if (_blocked) { if (typeof cb === 'function') cb({ error: 'Vous ne pouvez pas écrire à cet utilisateur.' }); return; }
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

      // 2) Persistance best-effort
      // ── Sauvegarder le message (PostgreSQL prioritaire) ──
      try {
        if (_pgPool) {
          await pgSaveMessage({
            id: msg.id, conversation_id: msg.conversation_id,
            sender_id: msg.sender_id, type: msg.type,
            content: msg.content || '', media_url: msg.media_url || null,
            duration: msg.media_duration || null, reply_to: msg.reply_to || null, pending: msg.pending || false, created_at: msg.created_at, client_id: msg.client_id||null
          });
        } else {
          const msgs = await pencMsgs(); msgs.push(msg); await pencSaveMsgs(msgs);
        }
      } catch (e) { console.error('penc persist msg:', e.message); }
      try {
        const convs = await pencConvs();
        const c = convs.find(x => x.id === conversation_id);
        if (c) { c.updated_at = new Date().toISOString(); await pencSaveConvs(convs); }
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
          let pbody = '';
          if (type === 'voice') pbody = '🎙️ Message vocal';
          else if (type === 'image') pbody = '📷 Photo';
          else if (type === 'video') pbody = '🎬 Vidéo';
          else if (type === 'money') pbody = '💸 ' + (content || 'Transfert');
          else if (type === 'sticker') pbody = content || 'Sticker';
          else pbody = (content || '').slice(0, 120);
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
  socket.on('message:read', async ({ conversation_id }) => {
    try {
      const convs = await pencConvs();
      const c = convs.find(x => x.id === conversation_id);
      if (c) { c.unread = c.unread || {}; c.unread[pencUserId] = 0; await pencSaveConvs(convs); }
    } catch {}
    socket.to('penc:' + conversation_id).emit('message:read', { userId: pencUserId, conversation_id });
  });

  socket.on('disconnect', async () => {
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
