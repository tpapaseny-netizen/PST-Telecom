#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

# Remplacer onclick="openUsernameModal()" par une version inline
# qui utilise prompt() natif — pas besoin de modal
old_item = '''        <div class="ai" onclick="openUsernameModal()"><div class="ai-ico" style="background:var(--gold-l);color:var(--gold)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="ai-lbl" id="un-menu-lbl">@username · Ajouter</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>'''

new_item = '''        <div class="ai" onclick="(function(){var u=prompt('Choisissez votre @username ZAMA (3-20 car.):', localStorage.getItem('zama_username')||'');if(!u)return;u=u.toLowerCase().replace(/[^a-z0-9._]/g,'');if(u.length<3){alert('Minimum 3 caractères');return;}localStorage.setItem('zama_username','@'+u);if(user){user.username='@'+u;}var l=document.getElementById('un-menu-lbl');if(l)l.textContent='@'+u+' · Modifier';toast('@'+u+' sauvegardé !','ok');}())"><div class="ai-ico" style="background:var(--gold-l);color:var(--gold)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="ai-lbl" id="un-menu-lbl">@username · Ajouter</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>'''

if old_item in html:
    html = html.replace(old_item, new_item, 1)
    print("✅ Username inline prompt ✅")
else:
    # Chercher avec regex
    html = re.sub(
        r'onclick="openUsernameModal\(\)"',
        'onclick="(function(){var u=prompt(\'Choisissez votre @username (3-20 car.):\',localStorage.getItem(\'zama_username\')||\'\')||\'\';;u=u.toLowerCase().replace(/[^a-z0-9._]/g,\'\');if(u.length<3)return;localStorage.setItem(\'zama_username\',\'@\'+u);if(user)user.username=\'@\'+u;var l=document.getElementById(\'un-menu-lbl\');if(l)l.textContent=\'@\'+u+\' \xb7 Modifier\';toast(\'@\'+u+\' sauvegard\xe9 !\',\'ok\');}())"',
        html, count=1
    )
    print("✅ Username inline (regex) ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Taille:", len(html))
