#!/usr/bin/env python3
# inject_sms_marketing_infobip.py
# Migre la route /api/sms-marketing/send de Africa's Talking vers Infobip

FICHIER = 'server-at.js'

OLD = (
    'app.post("/api/sms-marketing/send", async(req,res)=>{ '
    'try{const{campagne,messages,sender,scheduled}=req.body; '
    'if(!messages||!messages.length)return res.status(400).json({error:"Aucun message"}); '
    'const camp={campagne:campagne||"Campagne SMS",sender:sender||"PST-Telecom",'
    'total:messages.length,envoyes:0,echecs:0,statut:scheduled?"planifie":"en_cours",'
    'scheduledAt:scheduled?new Date(scheduled):null,createdAt:new Date()}; '
    'const result=await db.collection("sms_campagnes").insertOne(camp); '
    'if(scheduled){await db.collection("sms_campagnes").updateOne({_id:result.insertedId},'
    '{$set:{messages,statut:"planifie"}}); return res.json({success:true,statut:"planifie"});} '
    'const AT=require("africastalking")({apiKey:process.env.AT_API_KEY,username:process.env.AT_USERNAME}); '
    'const sms=AT.SMS; let envoyes=0,echecs=0; '
    'for(const msg of messages){try{await sms.send({to:[msg.telephone],message:msg.message,from:sender||"PST-Telecom"}); '
    'envoyes++;}catch(e){echecs++;}} '
    'await db.collection("sms_campagnes").updateOne({_id:result.insertedId},'
    '{$set:{envoyes,echecs,statut:"termine",finishedAt:new Date()}}); '
    'res.json({success:true,envoyes,echecs,total:messages.length});}catch(e){res.status(500).json({error:e.message});} });'
)

NEW = (
    'app.post("/api/sms-marketing/send", async(req,res)=>{ '
    'try{const{campagne,messages,sender,scheduled}=req.body; '
    'if(!messages||!messages.length)return res.status(400).json({error:"Aucun message"}); '
    'const senderName=sender||"PST-Telecom";\n'
    '  const camp={campagne:campagne||"Campagne SMS",sender:senderName,'
    'total:messages.length,envoyes:0,echecs:0,statut:scheduled?"planifie":"en_cours",'
    'scheduledAt:scheduled?new Date(scheduled):null,createdAt:new Date()}; '
    'const result=await db.collection("sms_campagnes").insertOne(camp); '
    'if(scheduled){await db.collection("sms_campagnes").updateOne({_id:result.insertedId},'
    '{$set:{messages,statut:"planifie"}}); return res.json({success:true,statut:"planifie"});}\n'
    '  // Envoi via Infobip\n'
    '  let envoyes=0,echecs=0;\n'
    '  for(const msg of messages){\n'
    '    try{\n'
    '      const ph=msg.telephone.startsWith("+")?msg.telephone:"+221"+msg.telephone;\n'
    '      const r=await fetch(INFOBIP_BASE_URL+"/sms/2/text/advanced",{\n'
    '        method:"POST",\n'
    '        headers:{\n'
    '          "Authorization":"App "+INFOBIP_API_KEY,\n'
    '          "Content-Type":"application/json",\n'
    '          "Accept":"application/json"\n'
    '        },\n'
    '        body:JSON.stringify({messages:[{from:INFOBIP_SENDER,destinations:[{to:ph}],text:msg.message}]})\n'
    '      });\n'
    '      if(r.ok){envoyes++;}else{echecs++;}\n'
    '    }catch(e){echecs++;}\n'
    '  }\n'
    '  await db.collection("sms_campagnes").updateOne({_id:result.insertedId},'
    '{$set:{envoyes,echecs,statut:"termine",finishedAt:new Date()}}); '
    'res.json({success:true,envoyes,echecs,total:messages.length});}catch(e){res.status(500).json({error:e.message});} });'
)

with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

if '// Envoi via Infobip' in contenu and 'sms-marketing' in contenu:
    print('[INFO] Migration Infobip SMS Marketing déjà effectuée — ignorée.')
elif OLD in contenu:
    contenu = contenu.replace(OLD, NEW, 1)
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(contenu)
    print('[OK] SMS Marketing migré vers Infobip dans server-at.js')
    print('[OK] Africa\'s Talking retiré de la route /api/sms-marketing/send')
    print('[OK] Sender ID utilisé : ZAMA (configurable via INFOBIP_SENDER)')
else:
    print('[WARN] Cible introuvable — la route a peut-être déjà été modifiée manuellement.')
    print('[INFO] Vérifiez /api/sms-marketing/send dans server-at.js')
