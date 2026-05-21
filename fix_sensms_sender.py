with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Forcer le sender a ZAMA dans le bloc Sen-SMS
old = "const senderName = (sender || 'SenSMS').replace(/[^a-zA-Z0-9\\-]/g, '').substring(0, 11) || 'SenSMS';"
new = "const senderName = 'ZAMA'; // Sender enregistre Infobip — changer en SenSMS apres approbation"

if old in content:
    content = content.replace(old, new)
    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: sender force a ZAMA")
else:
    print("ERREUR: ligne non trouvee")
    # Chercher ce qui existe
    import re
    matches = re.findall(r'.{0,50}senderName.{0,50}', content)
    for m in matches[:5]:
        print("Trouve:", m)
