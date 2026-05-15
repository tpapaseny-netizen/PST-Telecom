#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

# Ajouter un item "Mon username" dans le menu compte
# juste après "Mon QR Code"
old_qr_item = '''        <div class="ai" onclick="showQR()"><div class="ai-ico" style="background:var(--s3);color:var(--text2)"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 18h3M20 14v3"/></svg></div><div class="ai-lbl">Mon QR Code</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>'''

new_qr_item = old_qr_item + '''
        <div class="ai" onclick="openUsernameModal()"><div class="ai-ico" style="background:var(--gold-l);color:var(--gold)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="ai-lbl" id="un-menu-lbl">@username · Ajouter</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>'''

if old_qr_item in html and 'un-menu-lbl' not in html:
    html = html.replace(old_qr_item, new_qr_item, 1)
    print("P1 Item username dans menu ✅")

# Mettre à jour renderUsername pour aussi mettre à jour le menu
old_render = '''function renderUsername() {
  var badge = document.getElementById('un-badge');
  var disp = document.getElementById('un-display');
  if(!badge) return;
  if(user) {
    badge.style.display = 'inline-flex';
    var un = getUsername() || user.username || '';
    if(disp) disp.textContent = un || '+ Ajouter @username';
  } else {
    badge.style.display = 'none';
  }
}'''

new_render = '''function renderUsername() {
  var badge = document.getElementById('un-badge');
  var disp = document.getElementById('un-display');
  var menuLbl = document.getElementById('un-menu-lbl');
  var un = getUsername() || (user && user.username) || '';
  if(badge) {
    badge.style.display = user ? 'inline-flex' : 'none';
    if(disp) disp.textContent = un || '+ Ajouter @username';
  }
  if(menuLbl) menuLbl.textContent = un ? un + ' · Modifier' : '@username · Ajouter';
}'''

if old_render in html:
    html = html.replace(old_render, new_render, 1)
    print("P2 renderUsername mis à jour ✅")
elif 'function renderUsername()' in html:
    html = re.sub(r'function renderUsername\(\) \{[\s\S]*?(?=\nfunction )', new_render + '\n', html, count=1)
    print("P2 renderUsername (regex) ✅")

# Appeler renderUsername dans renderAcct
if 'renderUsername()' not in html:
    html = html.replace(
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";',
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";renderUsername();',
        1
    )
    print("P3 renderUsername() dans renderAcct ✅")
else:
    print("P3 renderUsername() déjà dans renderAcct ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Fix username terminé! Taille:", len(html))
