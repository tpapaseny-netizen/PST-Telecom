#!/usr/bin/env python3
# inject_zama_sms_auto.py
# Branche les SMS Infobip dans les routes ZAMA de server-at.js
# Points d'injection :
#   1. /api/zama/create  → SMS "Commande reçue" au sender
#   2. /api/zama/ipn     → SMS "Paiement confirmé" au receiver
#   3. /api/zama/register → SMS "Bienvenue" au nouveau compte

FICHIER = 'server-at.js'

# ─── PATCH 1 : /api/zama/create ──────────────────────────────────────────────
# Après la ligne qui envoie l'email admin, ajouter SMS au sender
OLD_CREATE = 'res.json({success:true,order_id:orderId,payment_url:paymentUrl,net_fcfa});'

NEW_CREATE = (
    '// SMS confirmation commande au sender\n'
    '  if(sender_name&&receiver_phone){\n'
    '    try{\n'
    '      var smsPhone=receiver_phone.startsWith("+")?receiver_phone:"+221"+receiver_phone;\n'
    '      var smsMsg="ZAMA: Votre demande d\'echange de "+amount+" "+src_currency'
    '+\" vers \"+net_fcfa.toLocaleString()+" FCFA a ete recue. Ref: "+orderId'
    '+". Votre destinataire sera notifie a reception.";\n'
    '      envoyerSMSInfobip(smsPhone,smsMsg).catch(function(){});\n'
    '    }catch(e){}\n'
    '  }\n'
    '  res.json({success:true,order_id:orderId,payment_url:paymentUrl,net_fcfa});'
)

# ─── PATCH 2 : /api/zama/ipn ─────────────────────────────────────────────────
# Après la mise à jour du statut "paid", ajouter SMS au receiver
OLD_IPN = (
    'if(o){try{const nodemailer=require("nodemailer"); '
    'const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,'
    'pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,'
    'to:process.env.GMAIL_USER,subject:"ZAMA Paiement recu: "+orderId,'
    'html:"<h2 style=color:green>Paiement confirme!</h2><p>"+o.net_fcfa+" FCFA \u2192 "'
    '+o.receiver_phone+" ("+o.receiver_mm+")</p>"});'
    '}catch(e){}}'
)

NEW_IPN = (
    'if(o){try{const nodemailer=require("nodemailer"); '
    'const t=nodemailer.createTransport({service:"gmail",auth:{user:process.env.GMAIL_USER,'
    'pass:process.env.GMAIL_APP_PASSWORD}}); await t.sendMail({from:process.env.GMAIL_USER,'
    'to:process.env.GMAIL_USER,subject:"ZAMA Paiement recu: "+orderId,'
    'html:"<h2 style=color:green>Paiement confirme!</h2><p>"+o.net_fcfa+" FCFA \u2192 "'
    '+o.receiver_phone+" ("+o.receiver_mm+")</p>"});'
    '}catch(e){}'
    '// SMS receiver\n'
    '      try{\n'
    '        const rPh=o.receiver_phone?o.receiver_phone.startsWith("+")?o.receiver_phone:'
    '"+221"+o.receiver_phone:null;\n'
    '        if(rPh){\n'
    '          const mL=o.receiver_mm==="wave"?"Wave":"Orange Money";\n'
    '          const smsR="ZAMA: Vous allez recevoir "+o.net_fcfa.toLocaleString()+" FCFA sur votre "+mL'
    '+". Ref: "+orderId+". Merci de votre confiance.";\n'
    '          envoyerSMSInfobip(rPh,smsR).catch(function(){});\n'
    '        }\n'
    '      }catch(e){}'
    '}'
)

# ─── PATCH 3 : /api/zama/register ────────────────────────────────────────────
# Après l'upsert MongoDB, ajouter SMS de bienvenue
OLD_REGISTER = (
    'app.post("/api/zama/register", async(req,res)=>{ '
    'try{if(db)await db.collection("zama_users").updateOne({phone:req.body.phone},'
    '{$set:{...req.body,updated_at:new Date()}},{upsert:true}); '
    'res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });'
)

NEW_REGISTER = (
    'app.post("/api/zama/register", async(req,res)=>{ '
    'try{\n'
    '  const isNew=!db?true:(await db.collection("zama_users").findOne({phone:req.body.phone})===null);\n'
    '  if(db)await db.collection("zama_users").updateOne({phone:req.body.phone},'
    '{$set:{...req.body,updated_at:new Date()}},{upsert:true});\n'
    '  // SMS bienvenue nouveau compte\n'
    '  if(isNew&&req.body.phone){\n'
    '    try{\n'
    '      const ph=req.body.phone.startsWith("+")?req.body.phone:"+221"+req.body.phone;\n'
    '      const nm=req.body.prenom||req.body.nom||"Client";\n'
    '      const msg="Bienvenue sur ZAMA, "+nm+"! Votre compte bureau de change est cree. '
    'Echangez vos devises facilement sur zama-sn.com";\n'
    '      envoyerSMSInfobip(ph,msg).catch(function(){});\n'
    '    }catch(e){}\n'
    '  }\n'
    '  res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });'
)

# ─── APPLICATION DES PATCHES ─────────────────────────────────────────────────
with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

modifs = 0

if '// SMS confirmation commande au sender' in contenu:
    print('[INFO] Patch 1 (create) déjà appliqué — ignoré.')
elif OLD_CREATE in contenu:
    contenu = contenu.replace(OLD_CREATE, NEW_CREATE, 1)
    modifs += 1
    print('[OK] Patch 1 appliqué : SMS sur /api/zama/create')
else:
    print('[WARN] Patch 1 : cible introuvable dans server-at.js — vérifiez manuellement.')

if '// SMS receiver' in contenu:
    print('[INFO] Patch 2 (ipn) déjà appliqué — ignoré.')
elif OLD_IPN in contenu:
    contenu = contenu.replace(OLD_IPN, NEW_IPN, 1)
    modifs += 1
    print('[OK] Patch 2 appliqué : SMS sur /api/zama/ipn')
else:
    print('[WARN] Patch 2 : cible introuvable dans server-at.js — vérifiez manuellement.')

if '// SMS bienvenue nouveau compte' in contenu:
    print('[INFO] Patch 3 (register) déjà appliqué — ignoré.')
elif OLD_REGISTER in contenu:
    contenu = contenu.replace(OLD_REGISTER, NEW_REGISTER, 1)
    modifs += 1
    print('[OK] Patch 3 appliqué : SMS bienvenue sur /api/zama/register')
else:
    print('[WARN] Patch 3 : cible introuvable dans server-at.js — vérifiez manuellement.')

if modifs > 0:
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(contenu)
    print('[OK] ' + str(modifs) + ' patch(s) écrit(s) dans server-at.js')
    print('[OK] SMS automatiques ZAMA activés :')
    print('     → Commande créée  : SMS au receiver avec référence')
    print('     → Paiement confirmé: SMS au receiver avec montant FCFA')
    print('     → Nouveau compte  : SMS de bienvenue')
else:
    print('[INFO] Aucune modification nécessaire.')
