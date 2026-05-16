with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Corriger l'apostrophe cassée dans le bouton cp-verify-btn
html = html.replace(
    "J\\'ai envoye - Verifier",
    "J ai envoye - Verifier"
)

# Correction alternative si la première ne marche pas
html = html.replace(
    "J\\\\'ai envoye",
    "J ai envoye"
)

# Chercher et corriger toutes les apostrophes echappees problematiques dans le JS
import re

# Corriger \' dans les strings JS qui causent SyntaxError
# Le probleme est dans btn.innerHTML avec J\'ai
html = html.replace("J\\'ai envoye - Verifier'", "J ai envoye - Verifier'")
html = html.replace("J\\'ai envoye", "J ai envoye")

# Verifier si la fonction goto existe deja, sinon ne pas toucher
if 'function goto(' not in html and 'function goto (' not in html:
    print("ATTENTION: fonction goto absente - elle doit etre dans le script principal")
else:
    print("OK: fonction goto presente")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

# Verifier la ligne 2564 environ
lines = html.split('\n')
total = len(lines)
print(f"Total lignes: {total}")

# Chercher les apostrophes problematiques
for i, line in enumerate(lines[2550:2580], start=2551):
    if "\\'" in line or "J ai" in line or "Verifier" in line:
        print(f"Ligne {i}: {line.strip()[:100]}")

print("Correction terminee!")
