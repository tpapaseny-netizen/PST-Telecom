with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix: la grille crypto utilise cpx-grid2 avec 3 colonnes mais les coins débordent
# Changer de 3 colonnes à 2 colonnes pour les coins crypto

old = '.cpx-grid2{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;}'
new = '.cpx-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;}'

if old in html:
    html = html.replace(old, new)
    print("OK - grille crypto 3col → 2col")
else:
    # Chercher variante
    import re
    html = re.sub(
        r'\.cpx-grid2\{[^}]*grid-template-columns:repeat\(3,1fr\)[^}]*\}',
        '.cpx-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;}',
        html
    )
    print("OK - grille corrigée via regex")

# Aussi fixer la taille des éléments cpx-new2 pour 2 colonnes
old2 = '.cpx-new2{display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;'
new2 = '.cpx-new2{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;'
if old2 in html:
    html = html.replace(old2, new2)
    print("OK - padding cpx-new2 ajusté")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Terminé!")
