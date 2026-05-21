with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Remplacer uniquement la declaration dans le bloc Sen-SMS (la 2eme occurrence)
old = "const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY || '31f52d00c3a4fbb92c00c72139556f43-e7142bf0-5334-471d-b7a3-4a8aa24c1492';"
new = "const INFOBIP_API_KEY_SEN = process.env.INFOBIP_API_KEY || '31f52d00c3a4fbb92c00c72139556f43-e7142bf0-5334-471d-b7a3-4a8aa24c1492';"

if old not in content:
    print("ERREUR: declaration non trouvee")
else:
    # Remplacer seulement la 2eme occurrence (la 1ere appartient a ZAMA)
    idx = content.find(old)
    idx2 = content.find(old, idx + 1)
    if idx2 == -1:
        print("Une seule occurrence trouvee — renommage de celle-ci")
        content = content.replace(old, new, 1)
    else:
        print("Deux occurrences trouvees — renommage de la 2eme")
        content = content[:idx2] + new + content[idx2 + len(old):]

    # Remplacer l'utilisation dans le bloc Sen-SMS
    content = content.replace(
        "INFOBIP_BASE_URL + '/sms/2/text/advanced'",
        "INFOBIP_BASE_URL + '/sms/2/text/advanced'"
    )
    content = content.replace(
        "'Authorization': 'App ' + INFOBIP_API_KEY,",
        "'Authorization': 'App ' + INFOBIP_API_KEY_SEN,"
    )

    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: fix applique")
