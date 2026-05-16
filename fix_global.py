import re

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix GLOBAL: remplacer TOUS les \' dans les attributs onclick HTML
# Pattern: onclick="...\'...\' ..."  → onclick="...'...'..."
count = 0

# Méthode directe: remplacer \' par ' partout dans les attributs onclick
def fix_onclick_attr(m):
    global count
    fixed = m.group(0).replace("\\'", "'")
    if fixed != m.group(0):
        count += 1
    return fixed

html = re.sub(r'onclick="[^"]*"', fix_onclick_attr, html)
print(f"OK - {count} onclick corrigés")

# Aussi corriger dans les style inline avec goto
html = re.sub(r"onclick='[^']*'", lambda m: m.group(0).replace('\\"', '"'), html)

# Vérifier qu'il ne reste plus de \' dans les onclick
remaining = re.findall(r"onclick=\"[^\"]*\\'[^\"]*\"", html)
if remaining:
    print(f"ATTENTION: {len(remaining)} onclick encore avec \\' :")
    for r in remaining[:5]:
        print("  " + r[:80])
else:
    print("OK - plus aucun backslash dans les onclick")

# Fix ligne 1886 - chercher la vraie erreur
lines = html.split('\n')
print("\n=== LIGNES 1882-1892 ===")
for i, line in enumerate(lines[1881:1892], start=1882):
    # Compter les parenthèses et apostrophes
    opens = line.count('(') - line.count(')')
    sq = line.count("'") % 2
    if opens != 0 or sq != 0:
        print(f"PROB {i} (par:{opens:+d} apo:{sq}): {repr(line[:120])}")
    else:
        print(f"  OK {i}: {repr(line[:80])}")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nTermine!")
