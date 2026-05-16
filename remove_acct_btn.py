import re

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Supprimer le bouton compte (icône personne) dans hero-actions
# Il reste seulement la lune
old = '''<div class="hero-icon-btn" onclick="goto('scr-acct')"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'''

if old in html:
    html = html.replace(old, '')
    print("OK - bouton Compte supprimé du header")
else:
    # Chercher variante
    html = re.sub(
        r'<div class="hero-icon-btn" onclick="goto\(\'scr-acct\'\)">.*?</div>',
        '',
        html, flags=re.DOTALL
    )
    print("OK - bouton Compte supprimé (regex)")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Done!")
