import os

# Lire le fichier actuel
with open('zama/index.html', 'rb') as f:
    content = f.read()

# Supprimer le BOM UTF-8 si présent
if content.startswith(b'\xef\xbb\xbf'):
    content = content[3:]
    print("BOM supprimé")

# Réécrire en UTF-8 pur sans BOM
with open('zama/index.html', 'wb') as f:
    f.write(content)

print(f"Fichier sauvegardé: {len(content)} bytes")
