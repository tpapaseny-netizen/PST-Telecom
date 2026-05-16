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
    memo: "ZAMA-" + orderId,
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
    // Format coin pour izichangePay: "usdt.trc20", "btc", "eth", etc.
    const iziCoin = coin_key;

    const rateToUsd = parseFloat(rate_usd) || 1;
    const amount_usd = (parseFloat(amount) * rateToUsd).toFixed(2);

    let address = null;
    let iziResp = null;

    // 1. Essayer de générer une adresse directe
    try {
      iziResp = await iziGetAddress(iziCoin);
      address = iziResp?.data?.address || iziResp?.address || null;
      console.log("[ZAMA crypto] iziGetAddress response:", JSON.stringify(iziResp));
    } catch (e) {
      console.error("[ZAMA crypto] iziGetAddress failed:", e.message);
    }

    // 2. Si pas d'adresse directe, générer URL de redirection
    let redirectUrl = null;
    if (!address) {
      try {
        const urlResp = await iziGetRedirectUrl({
          coin: iziCoin,
          acceptedCoins: [iziCoin],
          amount: amount_usd,
          orderId: order_id,
          senderName: sender_name || "Client",
          senderEmail: sender_email || "",
        });
        redirectUrl = urlResp?.url || urlResp?.data?.url || null;
        console.log("[ZAMA crypto] iziGetRedirectUrl response:", JSON.stringify(urlResp));
      } catch (e) {
        console.error("[ZAMA crypto] iziGetRedirectUrl failed:", e.message);
      }
    }

    // Sauvegarder en DB
    if (db) {
      await db.collection("zama_orders").updateOne(
        { order_id },
        { $set: {
          izi_address: address,
          izi_redirect_url: redirectUrl,
          izi_coin: iziCoin,
          izi_network: meta.network,
          coin_key, amount_usd,
          receiver_name, receiver_phone, receiver_mm,
          sender_name, sender_email, net_fcfa,
          status: "crypto_pending", updated_at: new Date()
        }, $setOnInsert: { order_id, src_currency: src_currency || "USD", amount: parseFloat(amount), created_at: new Date() }},
        { upsert: true }
      );
    }

    if (address) {
      return res.json({ ok: true, address, amount_crypto: amount_usd, coin: iziCoin, network: meta.network, label: meta.label, coin_key });
    } else if (redirectUrl) {
      return res.json({ ok: true, address: null, redirect_url: redirectUrl, coin: iziCoin, network: meta.network, label: meta.label, coin_key });
    } else {
      return res.status(502).json({ error: "izichangePay indisponible - aucune adresse generee" });
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
    const list = await db.collection('pstpay_merchants').find({}, { projection: { api_key: 0 } }).sort({ created_at: -1 }).toArray();
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
      .toArray();
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
    }).sort({ created_at: -1 }).toArray();
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
    const list = await db.collection('zama_tontines').find({}).sort({ created_at: -1 }).limit(100).toArray();
    const epargnes = await db.collection('zama_epargnes').find({}).sort({ created_at: -1 }).limit(100).toArray();
    const total_epargne = epargnes.reduce((s, e) => s + e.solde_fcfa, 0);
    const total_tontine = list.reduce((s, t) => s + t.pot_total, 0);
    res.json({ tontines: list, epargnes, stats: { total_epargne, total_tontine, nb_tontines: list.length, nb_epargnes: epargnes.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── FIN ZAMA ÉPARGNE + TONTINE ────────────────────────────────

// ─── DÉMARRAGE ─────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("\nPST — Pure Smart Telecom");
    console.log("http://localhost:" + PORT);
    console.log("MongoDB: " + (db ? "connecte" : "mode memoire") + "\n");
  });
});
