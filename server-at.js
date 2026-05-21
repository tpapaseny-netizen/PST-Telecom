const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors({ origin: ['https://www.sensms.com', 'https://sensms.com', 'https://zama-sn.com', 'https://www.zama-sn.com', 'https://pst-telecom.vercel.app'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
const zamaOtpStore = {}; // OTP store ZAMA
app.get('/xlsx.js', (req, res) => { res.sendFile(require('path').join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')); });

// ─── CONFIG ────────────────────────────────────────────────
const MONGODB_URI      = process.env.MONGODB_URI;
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

// ─── MongoDB ───────────────────────────────────────────────
async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("pst_telecom");
    console.log("OK MongoDB Atlas connecte");
  } catch (err) { console.error("ERREUR MongoDB:", err.message); }
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
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "pst-admin-2026";
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
  if(password!==(process.env.ADMIN_PASSWORD||"pst-admin-2026")) return res.status(403).json({error:"Mot de passe incorrect"});
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

app.post("/api/zama/kyc/approve", async(req,res)=>{ try{const{user_id,approved}=req.body; const token=req.headers["x-admin-token"]||req.query.token; if(token!==(process.env.ADMIN_PASSWORD||"pst-admin-2026"))return res.status(403).json({error:"Non autorise"}); if(db)await db.collection("zama_users").updateOne({id:user_id},{$set:{kyc:approved,kyc_pending:false,kyc_approved:approved,kyc_reviewed_at:new Date()}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

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
    if (token !== (process.env.ADMIN_PASSWORD || 'pst-admin-2026')) {
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
function getSensmsUser() {
  if (!SensmsUser) {
    var mongoose = require('mongoose');
    var _sensmsSchema = new mongoose.Schema({
      phone: String, email: String, name: String, password: String,
      pack: { type: String, default: 'Starter' },
      credits: { type: Number, default: 0 },
      sender_id: { type: String, default: 'SenSMS' },
      active: { type: Boolean, default: true },
      created_at: { type: Date, default: Date.now }
    });
    SensmsUser = mongoose.models.SensmsUser || mongoose.model('SensmsUser', _sensmsSchema);
  }
  return SensmsUser;
}

// POST /api/sensms/register
app.post('/api/sensms/register', async (req, res) => {
  try {
    var name = req.body.name; var phone = req.body.phone; var email = req.body.email || ''; var password = req.body.password;
    if (!name || !phone || !password) return res.json({ success: false, error: 'Champs obligatoires manquants' });
    if (password.length < 6) return res.json({ success: false, error: 'Mot de passe trop court (6 min)' });
    if (phone.match(/^[0-9]{9}$/)) phone = '+221' + phone;
    var existing = await getSensmsUser().findOne({ $or: [{ phone: phone }, { email: email && email.length > 0 ? email : null }] });
    if (existing) return res.json({ success: false, error: 'Compte deja existant avec ce numero ou email' });
    var bcrypt = require('bcryptjs');
    var hash = await bcrypt.hash(password, 10);
    var newUser = new (getSensmsUser())({ name: name, phone: phone, email: email, password: hash });
    await newUser.save();
    res.json({ success: true, user: { id: newUser._id, name: newUser.name, phone: newUser.phone, email: newUser.email, pack: newUser.pack, credits: newUser.credits, sender_id: newUser.sender_id } });
  } catch(e) { console.error('SENSMS register error:', e); res.json({ success: false, error: e.message }); }
});

// POST /api/sensms/login
app.post('/api/sensms/login', async (req, res) => {
  try {
    var identifier = req.body.identifier || req.body.phone || req.body.email || '';
    var password = req.body.password;
    if (!identifier || !password) return res.json({ success: false, error: 'Champs manquants' });
    if (identifier.match(/^[0-9]{9}$/)) identifier = '+221' + identifier;
    var user = await getSensmsUser().findOne({ $or: [{ phone: identifier }, { email: identifier }] });
    if (!user) return res.json({ success: false, error: 'Compte introuvable' });
    var bcrypt = require('bcryptjs');
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ success: false, error: 'Mot de passe incorrect' });
    res.json({ success: true, user: { id: user._id, phone: user.phone, email: user.email, name: user.name, pack: user.pack || 'Starter', credits: user.credits || 0, sender_id: user.sender_id || 'SenSMS' } });
  } catch(e) { console.error('SENSMS login error:', e); res.json({ success: false, error: e.message }); }
});

// GET /api/sensms/profile/:id
app.get('/api/sensms/profile/:id', async (req, res) => {
  try {
    var user = await getSensmsUser().findById(req.params.id).lean();
    if (!user) return res.json({ success: false, error: 'Introuvable' });
    delete user.password;
    res.json({ success: true, user: user });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// POST /api/sensms/update-sender
app.post('/api/sensms/update-sender', async (req, res) => {
  try {
    var id = req.body.id; var sender_id = req.body.sender_id;
    if (!id || !sender_id) return res.json({ success: false, error: 'Donnees manquantes' });
    if (sender_id.length > 11) return res.json({ success: false, error: 'Sender ID max 11 caracteres' });
    await getSensmsUser().updateOne({ _id: id }, { $set: { sender_id: sender_id.toUpperCase() } });
    res.json({ success: true, sender_id: sender_id.toUpperCase() });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// GET /api/sensms/users (admin)
app.get('/api/sensms/users', async (req, res) => {
  try {
    var users = await getSensmsUser().find({}).sort({ created_at: -1 }).lean();
    users.forEach(function(u) { delete u.password; });
    res.json({ success: true, users: users });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DÉMARRAGE ─────────────────────────────
const PORT = process.env.PORT || 3000;
connectDB().then((dbInstance) => {
  db = dbInstance;
  app.listen(PORT, () => {
    console.log("\nPST — Pure Smart Telecom");
    console.log("http://localhost:" + PORT);
    console.log("MongoDB: " + (db ? "connecte" : "mode memoire") + "\n");
  });
});
