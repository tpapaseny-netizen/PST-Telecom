with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Verifier si INFOBIP_BASE_URL est declare
if "const INFOBIP_BASE_URL" in content:
    print("INFOBIP_BASE_URL existe deja")
else:
    print("INFOBIP_BASE_URL manquant — ajout")
    # Ajouter apres INFOBIP_SENDER de ZAMA
    old = "const INFOBIP_SENDER  = 'ZAMA';"
    new = "const INFOBIP_SENDER  = 'ZAMA';\nconst INFOBIP_BASE_URL = 'https://y42xy1.api.infobip.com';"
    if old in content:
        content = content.replace(old, new)
        with open("server-at.js", "w", encoding="utf-8") as f:
            f.write(content)
        print("OK: INFOBIP_BASE_URL ajoute")
    else:
        print("ERREUR: INFOBIP_SENDER non trouve")
