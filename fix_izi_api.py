with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remplacer toute la section ZAMA CRYPTO NATIF
old = '''// ─── ZAMA CRYPTO NATIF ─────────────────────────────────────
app.post("/api/zama/crypto/create", async(req,res)=>{ try{const{coin_key,amount,src_currency,rate_usd,order_id,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,net_fcfa}=req.body; if(!coin_key||!amount||!order_id)return res.status(400).json({error:"Champs requis manquants"}); const rateToUsd=parseFloat(rate_usd)||1; const amount_usd=(parseFloat(amount)*rateToUsd).toFixed(2); const callback_url="https://pst-telecom-production.up.railway.app/api/zama/crypto/ipn"; let izi; try{izi=await createIziOrder({coin_key,amount_usd,order_id,callback_url});}catch(e){console.error("[ZAMA crypto/create]",e.message); return res.status(502).json({error:"izichangePay indisponible: "+e.message});} if(db){await db.collection("zama_orders").updateOne({order_id},{$set:{izi_id:izi.id||izi.order_id,izi_address:izi.address,izi_coin:izi.coin,izi_network:izi.network,izi_amount:izi.amount,izi_expires_at:izi.expires_at,coin_key,amount_usd,receiver_name,receiver_phone,receiver_mm,sender_name,sender_email,net_fcfa,status:"crypto_pending",updated_at:new Date()},$setOnInsert:{order_id,src_currency:src_currency||"USD",amount:parseFloat(amount),created_at:new Date()}},{upsert:true});} res.json({ok:true,izi_id:izi.id||izi.order_id,address:izi.address,coin:izi.coin,network:izi.network,amount_crypto:izi.amount,expires_at:izi.expires_at,coin_key,label:(COIN_MAP[coin_key]||{}).label||coin_key.toUpperCase()});}catch(e){console.error("[ZAMA crypto/create]",e.message); res.status(500).json({error:e.message});} });

app.get("/api/zama/crypto/status/:order_id", async(req,res)=>{ try{if(!db)return res.status(503).json({error:"DB indisponible"}); const doc=await db.collection("zama_orders").findOne({order_id:req.params.order_id}); if(!doc||!doc.izi_id)return res.status(404).json({error:"Ordre introuvable",status:"not_found"}); const izi=await getIziOrder(doc.izi_id); const paid=["paid","completed","confirmed"].includes((izi.status||"").toLowerCase()); if(paid&&doc.status!=="paid")await db.collection("zama_orders").updateOne({order_id:req.params.order_id},{$set:{status:"paid",paid_at:new Date(),izi_status:izi.status}}); res.json({order_id:req.params.order_id,status:paid?"paid":(izi.status||doc.status),address:doc.izi_address,amount_crypto:doc.izi_amount,coin:doc.izi_coin,network:doc.izi_network,net_fcfa:doc.net_fcfa,expires_at:doc.izi_expires_at,confirmations:izi.confirmations||0});}catch(e){res.status(500).json({error:e.message});} });

app.post("/api/zama/crypto/ipn", express.raw({type:"application/json"}), async(req,res)=>{ try{const sig=req.headers["x-izi-signature"]||req.headers["x-signature"]||""; const body_raw=req.body.toString(); if(sig){const expected=crypto.createHmac("sha256",IZIPAY_IPN_SECRET).update(body_raw).digest("hex"); if(expected!==sig){console.warn("[ZAMA IPN] Signature invalide"); return res.status(401).json({error:"Signature invalide"});}} const data=JSON.parse(body_raw); const order_id=data.external_id||data.order_id; const status=(data.status||"").toLowerCase(); const paid=["paid","completed","confirmed"].includes(status); console.log("[ZAMA IPN] order_id="+order_id+" status="+status); if(!order_id)return res.status(400).json({error:"external_id manquant"}); if(db&&paid){await db.collection("zama_orders").updateOne({order_id},{$set:{status:"paid",paid_at:new Date(),izi_status:status,ipn_data:data}}); await db.collection("audit_logs").insertOne({event:"zama_crypto_paid",order_id,izi_data:data,timestamp:new Date()});} res.json({ok:true});}catch(e){res.status(500).json({error:e.message});} });'''

new = '''// ─── ZAMA CRYPTO NATIF (doc officielle izichangePay) ───────
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
});'''

if '// ─── ZAMA CRYPTO NATIF' in content:
    content = content.replace(old, new)
    print("OK - routes crypto remplacees")
else:
    # Chercher et remplacer juste avant DÉMARRAGE
    if 'app.post("/api/zama/crypto/create"' in content:
        # Trouver le bloc et le remplacer
        start = content.find('// ─── ZAMA CRYPTO NATIF')
        if start == -1:
            start = content.find('app.post("/api/zama/crypto/create"')
        end = content.find('// ─── DÉMARRAGE')
        if start > 0 and end > start:
            content = content[:start] + new + '\n\n' + content[end:]
            print("OK - routes crypto remplacees (alt)")
        else:
            print("ERREUR - blocs non trouves")
    else:
        # Ajouter avant DÉMARRAGE
        content = content.replace('// ─── DÉMARRAGE', new + '\n\n// ─── DÉMARRAGE')
        print("OK - routes crypto ajoutees avant DÉMARRAGE")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("server-at.js mis a jour!")
