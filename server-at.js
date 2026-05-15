const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));
app.get('/xlsx.js', (req, res) => { res.sendFile(require('path').join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js')); });

// ─── CONFIG ────────────────────────────────────────────────
const MONGODB_URI      = process.env.MONGODB_URI;
const AT_API_KEY       = process.env.AT_API_KEY;
const AT_USERNAME      = process.env.AT_USERNAME || 'sandbox';
const PORT             = process.env.PORT || 3001;
const IZIPAY_API_KEY   = process.env.IZIPAY_API_KEY || '14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680';
const IZIPAY_IPN_SECRET = process.env.IZIPAY_IPN_SECRET || 'Pstdiama@1';
const IZIPAY_BASE      = 'https://api.izichange.com';
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
  const body = { currency: "USD", amount: String(parseFloat(amount_usd).toFixed(2)), coin: meta.coin, network: meta.network, external_id: order_id, callback_url };
  const resp = await fetch(IZIPAY_BASE + "/v1/orders", { method: "POST", headers: iziHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) { const err = await resp.text(); throw new Error("izichangePay: " + resp.status + " " + err); }
  return resp.json();
}

async function getIziOrder(izi_id) {
  const resp = await fetch(IZIPAY_BASE + "/v1/orders/" + izi_id, { headers: iziHeaders() });
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
  const data = { ...toSign, firstname: (senderName||"").split(" ")[0]||"Client", lastname: (senderName||"").split(" ").slice(1).join(" ")||"", email: senderEmail||"", memo: "ZAMA-" + orderId };
  try {
    const resp = await fetch("https://pay.izichange.com/api/payements/init_operation_with_customer_data", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": IZIPAY_API_KEY, "x-signature": signature }, body: JSON.stringify(data) });
    return resp.json();
  } catch(e) {
    return { url: IZIPAY_POS + "?memo=ZAMA-" + orderId };
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
async function getAbonnes() { if (db) return db.collection("abonnes").find({}).sort({createdAt:-1}).toArray(); return global._abonnes||[]; }
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
app.get("/", (req,res) => res.redirect("https://pst-telecom.vercel.app"));
app.get("/admin", authAdmin, (req,res) => res.sendFile(path.join(__dirname,"admin.html")));
app.get("/sms-marketing", (req,res) => res.sendFile(path.join(__dirname,"sms-marketing.html")));
app.get("/appel", (req,res) => res.sendFile(path.join(__dirname,"appel.html")));
app.get("/dashboard", (req,res) => res.sendFile(path.join(__dirname,"dashboard.html")));
app.get("/sms", (req,res) => res.sendFile(path.join(__dirname,"sms.html")));
app.get("/streaming", (req,res) => res.sendFile(path.join(__dirname,"streaming.html")));
app.get("/recharge", (req,res) => res.sendFile(path.join(__dirname,"recharge.html")));
app.get("/noc", (req,res) => res.sendFile(path.join(__dirname,"noc.html")));
app.get("/trax", (req,res) => res.sendFile(path.join(__dirname,"pst-trax.html")));
app.get("/trax-driver", (req,res) => res.sendFile(path.join(__dirname,"pst-trax-driver.html")));
app.get("/zama", (req,res) => res.sendFile(path.join(__dirname,"zama.html")));
app.get("/crypto-admin", (req,res) => res.sendFile(path.join(__dirname,"crypto-dashboard.html")));
app.get("/izipay-widget.js", (req,res) => res.sendFile(path.join(__dirname,"izipay-widget.js")));

// ═══════════════════════════════════════════════════════════
// ROUTES NOC / RECHARGE / ADMIN STATS
// ═══════════════════════════════════════════════════════════
app.get("/api/noc/agent/status", async(req,res) => {
  try { if(!db) return res.json({cameras:0,online:0,offline:0}); const cams=await db.collection("cameras").find({}).toArray(); res.json({cameras:cams.length,online:cams.filter(c=>c.statut==="online").length,offline:cams.filter(c=>c.statut!=="online").length}); }
  catch(e){res.json({cameras:0,online:0,offline:0});}
});
app.get("/api/recharge/stats", async(req,res) => {
  try { if(!db) return res.json({recharges:0,reussies:0,echecs:0,fcfa:0}); const r=await db.collection("recharges").find({}).toArray(); res.json({recharges:r.length,reussies:r.filter(x=>x.statut==="success").length,echecs:r.filter(x=>x.statut==="failed").length,fcfa:r.filter(x=>x.statut==="success").reduce((s,x)=>s+(x.montant||0),0)}); }
  catch(e){res.json({recharges:0,reussies:0,echecs:0,fcfa:0});}
});
app.get("/api/admin/stats", async(req,res) => {
  try { const a=await getAbonnes(); res.json({total:a.length,actifs:a.filter(x=>x.statut==="actif").length,attente:a.filter(x=>x.statut==="en_attente").length,revenus:a.filter(x=>x.statut==="actif").reduce((s,x)=>s+(FORFAITS[x.forfait]?.prix||0),0)}); }
  catch(e){res.status(500).json({error:e.message});}
});
app.get("/api/admin/abonnes", async(req,res) => { try{res.json(await getAbonnes());}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/admin/users", async(req,res) => { try{if(!db)return res.json([]); res.json(await db.collection("abonnes").find({}).sort({createdAt:-1}).toArray());}catch(e){res.json([]);} });
app.get("/api/admin/activity", async(req,res) => { try{const l=await db.collection("activity_logs").find({}).sort({createdAt:-1}).limit(50).toArray(); res.json(l.map(x=>({type:x.type,message:x.message,time:new Date(x.createdAt).toLocaleTimeString("fr-FR")})));}catch(e){res.json([]);} });

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
app.post("/api/sms-marketing/send", async(req,res)=>{ try{const{campagne,messages,sender,scheduled}=req.body; if(!messages||!messages.length)return res.status(400).json({error:"Aucun message"}); const camp={campagne:campagne||"Campagne SMS",sender:sender||"PST-Telecom",total:messages.length,envoyes:0,echecs:0,statut:scheduled?"planifie":"en_cours",scheduledAt:scheduled?new Date(scheduled):null,createdAt:new Date()}; const result=await db.collection("sms_campagnes").insertOne(camp); if(scheduled){await db.collection("sms_campagnes").updateOne({_id:result.insertedId},{$set:{messages,statut:"planifie"}}); return res.json({success:true,statut:"planifie"});} const AT=require("africastalking")({apiKey:process.env.AT_API_KEY,username:process.env.AT_USERNAME}); const sms=AT.SMS; let envoyes=0,echecs=0; for(const msg of messages){try{await sms.send({to:[msg.telephone],message:msg.message,from:sender||"PST-Telecom"}); envoyes++;}catch(e){echecs++;}} await db.collection("sms_campagnes").updateOne({_id:result.insertedId},{$set:{envoyes,echecs,statut:"termine",finishedAt:new Date()}}); res.json({success:true,envoyes,echecs,total:messages.length});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/sms-marketing/campagnes", async(req,res)=>{ try{const c=await db.collection("sms_campagnes").find({},{projection:{messages:0}}).sort({createdAt:-1}).limit(50).toArray(); res.json(c);}catch(e){res.json([]);} });
app.get("/api/sms-marketing/stats", async(req,res)=>{ try{const c=await db.collection("sms_campagnes").find({}).toArray(); res.json({totalCampagnes:c.length,totalEnvoyes:c.reduce((s,x)=>s+(x.envoyes||0),0),totalEchecs:c.reduce((s,x)=>s+(x.echecs||0),0)});}catch(e){res.json({totalCampagnes:0,totalEnvoyes:0,totalEchecs:0});} });
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
app.get("/api/trax/vehicles", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").find({}).toArray(); return res.json(v.map(x=>{const{_id,...r}=x;return r;}));} res.json([]);}catch(e){res.json([]);} });
app.post("/api/trax/vehicles", async(req,res)=>{ try{const v=req.body; if(!Array.isArray(v))return res.status(400).json({error:"Format invalide"}); if(db){await db.collection("trax_vehicles").deleteMany({}); if(v.length>0){const clean=v.map(x=>{const{_id,...r}=x;return r;}); await db.collection("trax_vehicles").insertMany(clean);}} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.post("/api/trax/position", async(req,res)=>{ try{const d=req.body; if(!d.id||!d.lat||!d.lng)return res.status(400).json({error:"GPS manquant"}); if(db)await db.collection("trax_vehicles").updateOne({id:d.id},{$set:{lat:d.lat,lng:d.lng,speed:d.speed||0,status:d.status||"online",lastSeen:d.lastSeen||Date.now(),driver:d.driver,phone:d.phone}},{upsert:true}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/vehicles/:vehicleId", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").findOne({vehicleId:req.params.vehicleId}); return res.json(v||{});} res.json({});}catch(e){res.json({});} });
app.get("/api/trax/history/:vehicleId", async(req,res)=>{ try{const{hours=24}=req.query; const since=new Date(Date.now()-hours*60*60*1000); if(db){const p=await db.collection("trax_positions").find({vehicleId:req.params.vehicleId,createdAt:{$gte:since}}).sort({createdAt:1}).limit(1000).toArray(); return res.json(p);} res.json([]);}catch(e){res.json([]);} });
app.post("/api/trax/cut/:vehicleId", async(req,res)=>{ try{const{cut=true}=req.body; if(db)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$set:{cut:!!cut,cutAt:new Date()}}); res.json({success:true,cut:!!cut});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/commands/:vehicleId", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").findOne({vehicleId:req.params.vehicleId}); if(!v)return res.json({cut:false}); const r={cut:v.cut||false,message:v.pendingMessage||null}; if(v.pendingMessage)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$unset:{pendingMessage:""}}); return res.json(r);} res.json({cut:false});}catch(e){res.json({cut:false});} });
app.post("/api/trax/message/:vehicleId", async(req,res)=>{ try{if(db)await db.collection("trax_vehicles").updateOne({vehicleId:req.params.vehicleId},{$set:{pendingMessage:req.body.message}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });
app.get("/api/trax/stats", async(req,res)=>{ try{if(db){const v=await db.collection("trax_vehicles").find({}).toArray(); return res.json({total:v.length,moving:v.filter(x=>x.status==="moving").length,stopped:v.filter(x=>x.status==="stopped").length,offline:v.filter(x=>x.status==="offline").length,alert:v.filter(x=>x.status==="alert").length});} res.json({total:0,moving:0,stopped:0,offline:0,alert:0});}catch(e){res.json({total:0,moving:0,stopped:0,offline:0,alert:0});} });
app.delete("/api/trax/vehicles/:vehicleId", async(req,res)=>{ try{if(db){await db.collection("trax_vehicles").deleteOne({vehicleId:req.params.vehicleId}); await db.collection("trax_positions").deleteMany({vehicleId:req.params.vehicleId});} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// ═══════════════════════════════════════════════════════════
// ROUTES ZAMA
// ═══════════════════════════════════════════════════════════

// Register / KYC / Users
app.post("/api/zama/register", async(req,res)=>{ try{if(db)await db.collection("zama_users").updateOne({phone:req.body.phone},{$set:{...req.body,updated_at:new Date()}},{upsert:true}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/kyc", async(req,res)=>{ try{const{user_id,doc_type,doc_num,dob,nationality,photo_recto,photo_verso,photo_selfie}=req.body; const kycData={kyc:true,kyc_pending:true,kyc_submitted_at:new Date(),kyc_data:{doc_type,doc_num,dob,nationality},kyc_photos:{recto:photo_recto||null,verso:photo_verso||null,selfie:photo_selfie||null}}; if(db)await db.collection("zama_users").updateOne({id:user_id},{$set:kycData},{upsert:true}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA KYC — "+doc_num,html:"<h2>Nouveau KYC ZAMA</h2><p>User: "+user_id+"</p><p>Doc: "+doc_type+" "+doc_num+"</p>"});}catch(e){} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/kyc/approve", async(req,res)=>{ try{const{user_id,approved}=req.body; const token=req.headers["x-admin-token"]||req.query.token; if(token!==(process.env.ADMIN_PASSWORD||"pst-admin-2026"))return res.status(403).json({error:"Non autorise"}); if(db)await db.collection("zama_users").updateOne({id:user_id},{$set:{kyc:approved,kyc_pending:false,kyc_approved:approved,kyc_reviewed_at:new Date()}}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

app.get("/api/zama/users", async(req,res)=>{ try{if(!db)return res.json([]); const u=await db.collection("zama_users").find({}).sort({created:-1}).limit(200).toArray(); res.json(u.map(x=>{const{_id,...r}=x; delete r.password; return r;}));}catch(e){res.status(500).json({error:e.message});} });

app.get("/api/zama/kyc/pending", async(req,res)=>{ try{if(!db)return res.json([]); const u=await db.collection("zama_users").find({kyc_pending:true}).sort({kyc_submitted_at:-1}).toArray(); res.json(u.map(x=>{const{_id,...r}=x; delete r.password; return r;}));}catch(e){res.status(500).json({error:e.message});} });

// Create order
app.post("/api/zama/create", async(req,res)=>{ try{const{src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,message,user_id}=req.body; const orderId="ZAMA-"+Date.now(); const amtUSD=src_currency==="USD"?amount:parseFloat((amount*(rate_fcfa/606)).toFixed(2)); let paymentUrl=null; try{const pd=await generateIziPayUrl({amount:amtUSD,orderId,senderName:sender_name||"Client",senderEmail:sender_email||""}); paymentUrl=pd?.url||pd?.data?.url||null;}catch(e){console.log("iziPay err:",e.message);} if(db)await db.collection("zama_orders").insertOne({order_id:orderId,src_currency,amount,rate_fcfa,net_fcfa,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,message,user_id:user_id||null,status:"pending",created_at:new Date(),updated_at:new Date()}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Nouvelle commande: "+orderId,html:"<h2>Commande ZAMA</h2><p>"+amount+" "+src_currency+" → "+net_fcfa+" FCFA</p><p>Destinataire: "+receiver_name+" "+receiver_phone+" ("+receiver_mm+")</p>"});}catch(e){} res.json({success:true,order_id:orderId,payment_url:paymentUrl,net_fcfa});}catch(e){res.status(500).json({error:e.message});} });

// Status (commande standard)
app.get("/api/zama/status/:orderId", async(req,res)=>{ try{if(!db)return res.json({status:"pending",order_id:req.params.orderId}); const o=await db.collection("zama_orders").findOne({order_id:req.params.orderId}); if(!o)return res.json({status:"not_found"}); const{_id,...r}=o; res.json(r);}catch(e){res.status(500).json({error:e.message});} });

// Orders admin
app.get("/api/zama/orders", async(req,res)=>{ try{if(!db)return res.json([]); const o=await db.collection("zama_orders").find({}).sort({created_at:-1}).limit(200).toArray(); res.json(o.map(x=>{const{_id,...r}=x;return r;}));}catch(e){res.status(500).json({error:e.message});} });

// History user
app.get("/api/zama/history/:userId", async(req,res)=>{ try{if(!db)return res.json([]); const o=await db.collection("zama_orders").find({user_id:req.params.userId}).sort({created_at:-1}).limit(20).toArray(); res.json(o.map(x=>{const{_id,...r}=x;return r;}));}catch(e){res.status(500).json({error:e.message});} });

// Contact
app.post("/api/zama/contact", async(req,res)=>{ try{const{name,email,message}=req.body; if(db)await db.collection("zama_contacts").insertOne({name,email,message,created_at:new Date()}); try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Contact: "+name,html:"<p>De: "+name+" ("+email+")</p><p>"+message+"</p>"});}catch(e){} res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });

// IPN standard
app.post("/api/zama/ipn", async(req,res)=>{ try{const p=req.body; const memo=p.memo||p.data?.memo||""; const orderId=memo.replace("ZAMA-","").trim()||p.order_id||p.external_id; if(orderId&&db){await db.collection("zama_orders").updateOne({order_id:orderId},{$set:{status:"paid",paid_at:new Date(),ipn_data:p}}); const o=await db.collection("zama_orders").findOne({order_id:orderId}); if(o){try{const nodemailer=require("nodemailer"); const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:"ZAMA Paiement recu: "+orderId,html:"<h2 style=color:green>Paiement confirme!</h2><p>"+o.net_fcfa+" FCFA → "+o.receiver_phone+" ("+o.receiver_mm+")</p>"});}catch(e){}}} res.json({received:true,order_id:orderId});}catch(e){res.status(500).json({error:e.message});} });

// Redirections paiement
app.get("/api/zama/pay-success", async(req,res)=>{ const{order}=req.query; if(order&&db)await db.collection("zama_orders").updateOne({order_id:order},{$set:{status:"paid",paid_at:new Date()}}).catch(()=>{}); res.redirect("https://pst-telecom-production.up.railway.app/zama?paid="+order); });
app.get("/api/zama/pay-cancel", (req,res)=>res.redirect("https://pst-telecom-production.up.railway.app/zama?cancelled="+req.query.order));
app.get("/api/zama/pay-failed", (req,res)=>res.redirect("https://pst-telecom-production.up.railway.app/zama?failed="+req.query.order));

// ─── ZAMA CRYPTO NATIF ─────────────────────────────────────
app.post("/api/zama/crypto/create", async(req,res)=>{ try{const{coin_key,amount,src_currency,rate_usd,order_id,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,net_fcfa}=req.body; if(!coin_key||!amount||!order_id)return res.status(400).json({error:"Champs requis manquants"}); const rateToUsd=parseFloat(rate_usd)||1; const amount_usd=(parseFloat(amount)*rateToUsd).toFixed(2); const callback_url="https://pst-telecom-production.up.railway.app/api/zama/crypto/ipn"; let izi; try{izi=await createIziOrder({coin_key,amount_usd,order_id,callback_url});}catch(e){console.error("[ZAMA crypto/create]",e.message); return res.status(502).json({error:"izichangePay indisponible: "+e.message});} if(db){await db.collection("zama_orders").updateOne({order_id},{$set:{izi_id:izi.id||izi.order_id,izi_address:izi.address,izi_coin:izi.coin,izi_network:izi.network,izi_amount:izi.amount,izi_expires_at:izi.expires_at,coin_key,amount_usd,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,net_fcfa,status:"crypto_pending",updated_at:new Date()},$setOnInsert:{order_id,src_currency:src_currency||"USD",amount:parseFloat(amount),created_at:new Date()}},{upsert:true});} res.json({ok:true,izi_id:izi.id||izi.order_id,address:izi.address,coin:izi.coin,network:izi.network,amount_crypto:izi.amount,expires_at:izi.expires_at,coin_key,label:(COIN_MAP[coin_key]||{}).label||coin_key.toUpperCase()});}catch(e){console.error("[ZAMA crypto/create]",e.message); res.status(500).json({error:e.message});} });

app.get("/api/zama/crypto/status/:order_id", async(req,res)=>{ try{if(!db)return res.status(503).json({error:"DB indisponible"}); const doc=await db.collection("zama_orders").findOne({order_id:req.params.order_id}); if(!doc||!doc.izi_id)return res.status(404).json({error:"Ordre introuvable",status:"not_found"}); const izi=await getIziOrder(doc.izi_id); const paid=["paid","completed","confirmed"].includes((izi.status||"").toLowerCase()); if(paid&&doc.status!=="paid")await db.collection("zama_orders").updateOne({order_id:req.params.order_id},{$set:{status:"paid",paid_at:new Date(),izi_status:izi.status}}); res.json({order_id:req.params.order_id,status:paid?"paid":(izi.status||doc.status),address:doc.izi_address,amount_crypto:doc.izi_amount,coin:doc.izi_coin,network:doc.izi_network,net_fcfa:doc.net_fcfa,expires_at:doc.izi_expires_at,confirmations:izi.confirmations||0});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/crypto/ipn", express.raw({type:"application/json"}), async(req,res)=>{ try{const sig=req.headers["x-izi-signature"]||req.headers["x-signature"]||""; const body_raw=req.body.toString(); if(sig){const expected=crypto.createHmac("sha256",IZIPAY_IPN_SECRET).update(body_raw).digest("hex"); if(expected!==sig){console.warn("[ZAMA IPN] Signature invalide"); return res.status(401).json({error:"Signature invalide"});}} const data=JSON.parse(body_raw); const order_id=data.external_id||data.order_id; const status=(data.status||"").toLowerCase(); const paid=["paid","completed","confirmed"].includes(status); console.log("[ZAMA IPN] order_id="+order_id+" status="+status); if(!order_id)return res.status(400).json({error:"external_id manquant"}); if(db&&paid){await db.collection("zama_orders").updateOne({order_id},{$set:{status:"paid",paid_at:new Date(),izi_status:status,ipn_data:data}}); await db.collection("audit_logs").insertOne({event:"zama_crypto_paid",order_id,izi_data:data,timestamp:new Date()});} res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });

// ─── DÉMARRAGE ─────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("\nPST — Pure Smart Telecom");
    console.log("http://localhost:" + PORT);
    console.log("MongoDB: " + (db ? "connecte" : "mode memoire") + "\n");
  });
});
