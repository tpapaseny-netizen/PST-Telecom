with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Le problème: "Connectez-vous d'abord" dans une string JS avec apostrophes simples
# Corriger toutes les occurrences problématiques

fixes = [
    ("toast('Connectez-vous d\\'abord','err')", "toast('Connectez-vous dabord','err')"),
    ("toast(\"Connectez-vous d'abord\",'err')", "toast('Connectez-vous dabord','err')"),
    ("if(!user){toast('Connectez-vous d'abord','err');goto('scr-login');return;}", 
     "if(!user){toast('Connectez-vous','err');goto('scr-login');return;}"),
    # Version dans creerEpargne
    ("if(!user){toast('Connectez-vous d'abord','err');goto('scr-login');return;}",
     "if(!user){toast('Connectez-vous','err');goto('scr-login');return;}"),
    # Version dans creerTontine  
    ("if(!user){toast('Connectez-vous d'abord','err');goto('scr-login');return;}",
     "if(!user){toast('Connectez-vous','err');goto('scr-login');return;}"),
    # Version cotiserTontine
    ("if(!user){toast('Connectez-vous d'abord','err');return;}",
     "if(!user){toast('Connectez-vous','err');return;}"),
]

for old, new in fixes:
    if old in html:
        html = html.replace(old, new)
        print("Fix: " + old[:50])

# Fix global: chercher pattern d'abord dans strings JS
import re

# Remplacer toutes les apostrophes dans "d'abord" dans le contexte JS
html = html.replace("d'abord", "dabord")
print("OK - apostrophes d'abord corrigees")

# Fix onclick backslashes restants
html = re.sub(r"onclick=\"goto\(\\'([^']+)\\'\)\"", 
              lambda m: 'onclick="goto(\'' + m.group(1) + '\')"', 
              html)
print("OK - onclick backslashes corriges")

# Vérifier ligne 1873
lines = html.split('\n')
print("\n=== LIGNES 1870-1876 ===")
for i, line in enumerate(lines[1869:1876], start=1870):
    print(f"{i}: {repr(line[:120])}")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nTermine!")
