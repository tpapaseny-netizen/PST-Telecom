import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = "const MONGODB_URI      = process.env.MONGODB_URI;"
new = "const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pst_render:Render2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0';"

if old in content:
    content = content.replace(old, new)
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK - MONGODB_URI patche avec succes")
else:
    print("ERREUR - ligne non trouvee, cherche une variante...")
    # Chercher variante avec espaces différents
    match = re.search(r'const MONGODB_URI\s+=\s+process\.env\.MONGODB_URI;', content)
    if match:
        content = content.replace(match.group(0), new)
        with open('server-at.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print("OK - variante trouvee et patchee")
    else:
        print("ERREUR - impossible de trouver la ligne MONGODB_URI")
