#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

print("Taille:", len(html))

# Supprimer TOUT le bloc username corrompu dans le HTML
# C'est le div .ai avec onclick="zamaPick()" ou onclick="zamaUN()" ou l'inline
html = re.sub(r'\s*<div class="ai" onclick="[^"]*zama[Uu][Nn][^"]*"[\s\S]*?</div>\s*', '\n', html, count=1)
print("P1 Bloc username HTML supprimé ✅")

# Supprimer aussi le badge username sous le téléphone
html = re.sub(r'\s*<div class="username-badge"[\s\S]*?</div>\s*', '\n', html, count=1)

# Supprimer les fonctions JS username
for pattern in [
    r'\n// ══ USERNAME ZAMA ══[\s\S]*?(?=\n// ══|\nfunction [a-z])',
    r'\nfunction zamaUN\(\)[\s\S]*?(?=\nfunction )',
    r'\nfunction zamaUnLive[\s\S]*?(?=\nfunction )',
    r'\nfunction zamaUnSave[\s\S]*?(?=\nfunction )',
    r'\nfunction zamaPick\(\)[\s\S]*?(?=\nfunction )',
    r'\nfunction renderUsername\(\)[\s\S]*?(?=\nfunction )',
    r'\nfunction getUsername\(\)[\s\S]*?(?=\nfunction )',
    r'\nfunction openUsernameModal\(\)[\s\S]*?(?=\nfunction )',
    r'\nfunction checkUsername[\s\S]*?(?=\nfunction )',
    r'\nfunction saveUsername\(\)[\s\S]*?(?=\nfunction )',
]:
    old = html
    html = re.sub(pattern, '\n', html, count=1)

print("P2 Fonctions JS username supprimées ✅")

# Supprimer les modals username
html = re.sub(r'\s*<!-- USERNAME MODAL -->[\s\S]*?</div>\s*\n', '\n', html, count=1)
html = re.sub(r'\s*<div class="username-modal"[\s\S]*?</div>\s*\n\s*\n', '\n', html, count=1)
print("P3 Modals supprimées ✅")

# Supprimer CSS username
html = re.sub(r'/\* ══ USERNAME ══ \*/[\s\S]*?(?=/\* ══)', '', html, count=1)
print("P4 CSS username supprimé ✅")

# Nettoyer les appels renderUsername
html = html.replace('renderUsername();', '')
html = html.replace('var _un=', '//var _un=')

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Nettoyage terminé! Taille:", len(html))
print("zamaUN restant:", 'zamaUN' in html)
print("username-modal restant:", 'username-modal' in html)
