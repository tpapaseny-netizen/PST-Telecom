#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

print("Taille:", len(html))

# 1. Remplacer onclick inline par appel à une vraie fonction
html = re.sub(
    r'onclick="\(function\(\)\{var u=prompt[\s\S]*?\}()\(\)\)"',
    'onclick="zamaPick()"',
    html, count=1
)
print("P1 onclick simplifié ✅")

# 2. Ajouter la fonction zamaPick + modal dans le JS
zama_pick_js = """
// ══ ZAMA USERNAME PICKER ══
function zamaPick() {
  // Créer modal si absent
  var modal = document.getElementById('zama-un-modal');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'zama-un-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:flex;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto';
    modal.innerHTML = '<div style="background:#0D1525;border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid rgba(255,255,255,.08)">'
      + '<div style="width:36px;height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:0 auto 20px"></div>'
      + '<div style="font-size:18px;font-weight:700;text-align:center;margin-bottom:4px">Mon @username</div>'
      + '<div style="font-size:12px;color:#475569;text-align:center;margin-bottom:20px">Identifiant unique pour recevoir de l\'argent</div>'
      + '<div style="position:relative;margin-bottom:8px">'
      + '<span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;font-weight:800;color:#F5B014;z-index:1">@</span>'
      + '<input id="zama-un-inp" type="text" placeholder="tonusername" maxlength="20" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false"'
      + ' style="width:100%;background:#111D30;border:1.5px solid rgba(245,176,20,.3);border-radius:10px;padding:14px 16px 14px 32px;color:#E2E8F0;font-size:16px;font-weight:700;font-family:Inter,sans-serif;outline:none;-webkit-appearance:none"'
      + ' oninput="zamaUnPreview(this.value)">'
      + '</div>'
      + '<div id="zama-un-prev" style="font-size:24px;font-weight:800;color:#F5B014;text-align:center;margin:12px 0 4px">@tonusername</div>'
      + '<div id="zama-un-status" style="font-size:12px;color:#475569;text-align:center;margin-bottom:16px">Entrez 3 à 20 caractères</div>'
      + '<button onclick="zamaUnSave()" style="width:100%;padding:15px;background:linear-gradient(135deg,#F5B014,#FCD34D);color:#000;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:10px">Confirmer</button>'
      + '<button onclick="document.getElementById(\'zama-un-modal\').style.display=\'none\'" style="width:100%;padding:13px;background:#1A2640;border:1px solid rgba(255,255,255,.06);color:#94A3B8;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">Annuler</button>'
      + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target===modal) modal.style.display='none'; });
  }
  // Pré-remplir avec username existant
  var existing = localStorage.getItem('zama_username') || '';
  var inp = document.getElementById('zama-un-inp');
  if(inp) { inp.value = existing.replace('@',''); zamaUnPreview(inp.value); setTimeout(function(){ inp.focus(); }, 300); }
  modal.style.display = 'flex';
}

function zamaUnPreview(val) {
  val = (val||'').toLowerCase().replace(/[^a-z0-9._]/g,'');
  var inp = document.getElementById('zama-un-inp');
  if(inp) inp.value = val;
  var prev = document.getElementById('zama-un-prev');
  var status = document.getElementById('zama-un-status');
  if(prev) prev.textContent = '@' + (val || 'tonusername');
  if(status) {
    if(!val || val.length < 3) {
      status.textContent = 'Minimum 3 caractères';
      status.style.color = '#EF4444';
    } else {
      status.textContent = '@' + val + ' est disponible ✓';
      status.style.color = '#22C55E';
    }
  }
}

function zamaUnSave() {
  var inp = document.getElementById('zama-un-inp');
  if(!inp) return;
  var val = inp.value.trim();
  if(val.length < 3) { 
    var s = document.getElementById('zama-un-status');
    if(s) { s.textContent = 'Minimum 3 caractères !'; s.style.color = '#EF4444'; }
    return; 
  }
  var username = '@' + val;
  localStorage.setItem('zama_username', username);
  if(user) { user.username = username; saveULS(user); }
  var lbl = document.getElementById('un-menu-lbl');
  if(lbl) lbl.textContent = username + ' \xb7 Modifier';
  document.getElementById('zama-un-modal').style.display = 'none';
  toast(username + ' sauvegard\xe9 !', 'ok');
}
"""

if 'function zamaPick()' not in html:
    html = html.replace('</script>', zama_pick_js + '\n</script>', 1)
    print("P2 zamaPick JS ajouté ✅")

# 3. Charger le username au démarrage dans renderAcct
if 'zamaUnSave' in html:
    # Mettre à jour le label au chargement
    if 'zama_username' not in html.split('function renderAcct')[1][:500]:
        html = html.replace(
            'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";',
            'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";var _un=localStorage.getItem("zama_username")||"";var _unlbl=document.getElementById("un-menu-lbl");if(_unlbl)_unlbl.textContent=_un?_un+" \xb7 Modifier":"@username \xb7 Ajouter";',
            1
        )
        print("P3 Username chargé dans renderAcct ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Username modal ZAMA terminé! Taille:", len(html))
