with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix 1: onclick="goto(\'scr-epargne\')" → onclick="goto('scr-epargne')"
import re

# Corriger les onclick avec backslashes
html = html.replace("onclick=\"goto(\\'scr-epargne\\')", "onclick=\"goto('scr-epargne')")
html = html.replace("onclick=\"goto(\\'scr-tontine\\')", "onclick=\"goto('scr-tontine')")
html = html.replace("onclick=\"goto(\\'scr-epargne-new\\')", "onclick=\"goto('scr-epargne-new')")
html = html.replace("onclick=\"goto(\\'scr-tontine-new\\')", "onclick=\"goto('scr-tontine-new')")
html = html.replace("onclick=\"goto(\\'scr-login\\')", "onclick=\"goto('scr-login')")

# Fix général: tous les onclick avec \' 
def fix_onclick(m):
    return m.group(0).replace("\\'", "'")

html = re.sub(r"onclick=\"[^\"]*\\'[^\"]*\"", fix_onclick, html)
print("OK - onclick corrigés")

# Fix 2: Vérifier ligne ~1873 - chercher parenthèse manquante
lines = html.split('\n')
for i, line in enumerate(lines[1865:1880], start=1866):
    if "'" in line or "(" in line:
        # Compter parenthèses
        opens = line.count('(')
        closes = line.count(')')
        if opens != closes:
            print(f"Ligne {i} - parenthèses déséquilibrées ({opens} vs {closes}): {repr(line[:100])}")

# Fix 3: Dans le JS généré par Python, les \' dans les strings JS
# Ex: toast('Connectez-vous d\'abord','err')  → doit être dans une string JS double-quote
html = html.replace(
    "toast('Connectez-vous d\\'abord','err')",
    "toast('Connectez-vous','err')"
)
html = html.replace(
    "toast('Créez votre premier plan','err')",
    "toast('Creez votre premier plan','err')"
)

# Fix 4: Corriger les apostrophes dans les strings JS du template HTML
# Les strings HTML inline avec des apostrophes JS
html = re.sub(
    r"(style=\"[^\"]*\">)[^<]*'[^']*'[^<]*(</div>)",
    lambda m: m.group(0),
    html
)

# Fix 5: Chercher et corriger la vraie erreur ligne 1873
# Afficher contexte
for i, line in enumerate(lines[1868:1878], start=1869):
    print(f"{i}: {repr(line[:150])}")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nCorrections appliquées!")
