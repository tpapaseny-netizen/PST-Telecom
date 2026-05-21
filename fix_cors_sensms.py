with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Chercher la config CORS actuelle
import re

# Pattern typique : origin: ['https://...', ...]
# ou origin: function(origin, callback)
idx = content.find("'https://pst-telecom.vercel.app'")
if idx == -1:
    idx = content.find('"https://pst-telecom.vercel.app"')

if idx > 0:
    # Ajouter sensms.com à côté de vercel.app
    for old, new in [
        ("'https://pst-telecom.vercel.app'", "'https://pst-telecom.vercel.app', 'https://sensms.com', 'https://www.sensms.com'"),
        ('"https://pst-telecom.vercel.app"', '"https://pst-telecom.vercel.app", "https://sensms.com", "https://www.sensms.com"'),
    ]:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"✅ Ajouté sensms.com après: {old[:50]}")
            break
else:
    # Chercher app.use(cors
    cors_idx = content.find('app.use(cors(')
    if cors_idx > 0:
        print("Config CORS trouvée à ligne:", content[:cors_idx].count('\n') + 1)
        print("Contexte:", content[cors_idx:cors_idx+300])
    else:
        print("❌ Pas de config CORS trouvée — cherchons")
        for pat in ['cors(', 'allowedOrigins', 'Access-Control']:
            i = content.find(pat)
            if i > 0:
                print(f"Trouvé '{pat}' à ligne {content[:i].count(chr(10))+1}: {content[i:i+200]}")
                break

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Vérification
import subprocess
r = subprocess.run(['findstr', '/n', 'sensms.com', 'server-at.js'], capture_output=True, text=True)
print("sensms.com dans server-at.js:", r.stdout if r.stdout else "NON TROUVÉ")
