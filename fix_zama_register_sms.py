#!/usr/bin/env python3
# fix_zama_register_sms.py
# Corrige le patch register pour envoyer SMS bienvenue à chaque inscription
# (supprime la vérification isNew qui bloquait l'envoi)

FICHIER = 'server-at.js'

OLD = (
    "app.post(\"/api/zama/register\", async(req,res)=>{ "
    "try{\n"
    "  const isNew=!db?true:(await db.collection(\"zama_users\").findOne({phone:req.body.phone})===null);\n"
    "  if(db)await db.collection(\"zama_users\").updateOne({phone:req.body.phone},"
    "{$set:{...req.body,updated_at:new Date()}},{upsert:true});\n"
    "  // SMS bienvenue nouveau compte\n"
    "  if(isNew&&req.body.phone){\n"
    "    try{\n"
    "      const ph=req.body.phone.startsWith(\"+\")?req.body.phone:\"+221\"+req.body.phone;\n"
    "      const nm=req.body.prenom||req.body.nom||\"Client\";\n"
    "      const msg=\"Bienvenue sur ZAMA, \"+nm+\"! Votre compte bureau de change est cree. "
    "Echangez vos devises facilement sur zama-sn.com\";\n"
    "      envoyerSMSInfobip(ph,msg).catch(function(){});\n"
    "    }catch(e){}\n"
    "  }\n"
    "  res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });"
)

NEW = (
    "app.post(\"/api/zama/register\", async(req,res)=>{ "
    "try{\n"
    "  const existant=db?await db.collection(\"zama_users\").findOne({phone:req.body.phone}):null;\n"
    "  if(db)await db.collection(\"zama_users\").updateOne({phone:req.body.phone},"
    "{$set:{...req.body,updated_at:new Date()}},{upsert:true});\n"
    "  // SMS bienvenue — uniquement si nouveau compte\n"
    "  if(!existant&&req.body.phone){\n"
    "    try{\n"
    "      const ph=req.body.phone.startsWith(\"+\")?req.body.phone:\"+221\"+req.body.phone;\n"
    "      const nm=req.body.prenom||req.body.nom||\"Client\";\n"
    "      const msg=\"Bienvenue sur ZAMA, \"+nm+\"! Votre compte bureau de change est cree. "
    "Echangez vos devises facilement sur zama-sn.com\";\n"
    "      envoyerSMSInfobip(ph,msg).catch(function(){});\n"
    "    }catch(e){}\n"
    "  }\n"
    "  res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });"
)

with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

if '// SMS bienvenue — uniquement si nouveau compte' in contenu:
    print('[INFO] Correctif déjà appliqué — ignoré.')
elif OLD in contenu:
    contenu = contenu.replace(OLD, NEW, 1)
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(contenu)
    print('[OK] Correctif register appliqué — SMS bienvenue uniquement pour nouveaux comptes')
else:
    # Fallback : patch simple sans vérification isNew
    OLD2 = 'app.post("/api/zama/register", async(req,res)=>{ try{if(db)await db.collection("zama_users").updateOne({phone:req.body.phone},{$set:{...req.body,updated_at:new Date()}},{upsert:true}); res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });'
    NEW2 = (
        "app.post(\"/api/zama/register\", async(req,res)=>{ try{\n"
        "  const existant=db?await db.collection(\"zama_users\").findOne({phone:req.body.phone}):null;\n"
        "  if(db)await db.collection(\"zama_users\").updateOne({phone:req.body.phone},"
        "{$set:{...req.body,updated_at:new Date()}},{upsert:true});\n"
        "  if(!existant&&req.body.phone){\n"
        "    try{\n"
        "      const ph=req.body.phone.startsWith(\"+\")?req.body.phone:\"+221\"+req.body.phone;\n"
        "      const nm=req.body.prenom||req.body.nom||\"Client\";\n"
        "      const msg=\"Bienvenue sur ZAMA, \"+nm+\"! Votre compte bureau de change est cree. "
        "Echangez vos devises facilement sur zama-sn.com\";\n"
        "      envoyerSMSInfobip(ph,msg).catch(function(){});\n"
        "    }catch(e){}\n"
        "  }\n"
        "  res.json({success:true});}catch(e){res.status(500).json({error:e.message});} });"
    )
    if OLD2 in contenu:
        contenu = contenu.replace(OLD2, NEW2, 1)
        with open(FICHIER, 'w', encoding='utf-8') as f:
            f.write(contenu)
        print('[OK] Patch register appliqué (version originale) avec SMS bienvenue')
    else:
        print('[WARN] Cible introuvable — vérifiez manuellement /api/zama/register dans server-at.js')
