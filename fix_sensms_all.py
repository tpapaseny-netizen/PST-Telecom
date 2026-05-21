with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Supprimer les 3 declarations dupliquees dans le bloc Sen-SMS
# Ces lignes existent deja dans le bloc ZAMA/Infobip precedent
lines_to_remove = [
    "const INFOBIP_API_KEY_SEN = INFOBIP_API_KEY;\n",
    "const INFOBIP_BASE_URL = 'https://y42xy1.api.infobip.com';\n",
    'const INFOBIP_BASE_URL = "https://y42xy1.api.infobip.com";\n',
    "const INFOBIP_SENDER = 'SenSMS';\n",
]

removed = 0
for line in lines_to_remove:
    if line in content:
        content = content.replace(line, "", 1)
        print("Supprime:", line.strip())
        removed += 1

# Ajouter une seule ligne propre apres le marqueur Sen-SMS
marker = "// ─── SEN-SMS — ENVOI BULK VIA INFOBIP"
if marker in content:
    replacement = marker + "\nconst INFOBIP_SENDER = 'SenSMS';\n"
    content = content.replace(marker, replacement, 1)
    print("Ajoute: const INFOBIP_SENDER = 'SenSMS';")

with open("server-at.js", "w", encoding="utf-8") as f:
    f.write(content)

print("Total supprime:", removed)
print("OK: fichier sauvegarde")
