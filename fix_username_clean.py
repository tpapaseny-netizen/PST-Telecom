#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

print("Taille:", len(html))

# 1. Nettoyer le mess — supprimer le onclick inline cassé
# et remettre un simple onclick="zamaUN()"
html = re.sub(
    r'onclick="\(function\(\)\{var m[\s\S]*?\}()\(\)\)"',
    'onclick="zamaUN()"',
    html, count=1
)
# Au cas où zamaPick reste
html = html.replace('onclick="zamaPick()"', 'onclick="zamaUN()"', 1)
print("P1 onclick nettoyé ✅")

# 2. Ajouter la fonction zamaUN proprement dans le script
zama_un = """
// ══ USERNAME ZAMA ══
function zamaUN(){
  var sh=document.getElementById('zamaUnSheet');
  if(!sh){
    sh=document.createElement('div');
    sh.id='zamaUnSheet';
    sh.setAttribute('style','position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:none;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto');
    sh.innerHTML='<div style="background:#0D1525;border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid rgba(255,255,255,.06)">'
      +'<div style="width:36px;height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:0 auto 20px"></div>'
      +'<div style="font-size:18px;font-weight:700;text-align:center;margin-bottom:4px">Mon @username</div>'
      +'<div style="font-size:12px;color:#475569;text-align:center;margin-bottom:20px">Identifiant unique pour recevoir</div>'
      +'<div style="position:relative;margin-bottom:8px">'
      +'<span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;font-weight:800;color:#F5B014">@</span>'
      +'<input id="zamaUnInp" type="text" placeholder="tonusername" maxlength="20" autocomplete="off" autocapitalize="none"'
      +' style="width:100%;background:#111D30;border:1.5px solid rgba(245,176,20,.3);border-radius:10px;padding:14px 16px 14px 32px;color:#E2E8F0;font-size:16px;font-weight:700;font-family:Inter,sans-serif;outline:none;-webkit-appearance:none"'
      +' oninput="zamaUnLive(this.value)">'
      +'</div>'
      +'<div id="zamaUnPrev" style="font-size:24px;font-weight:800;color:#F5B014;text-align:center;margin:12px 0 4px">@tonusername</div>'
      +'<div id="zamaUnSt" style="font-size:12px;color:#475569;text-align:center;margin-bottom:16px">3 à 20 caractères</div>'
      +'<button onclick="zamaUnSave()" style="width:100%;padding:15px;background:linear-gradient(135deg,#F5B014,#FCD34D);color:#000;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;margin-bottom:10px">Confirmer</button>'
      +'<button onclick="document.getElementById(\'zamaUnSheet\').style.display=\'none\'" style="width:100%;padding:13px;background:#1A2640;border:1px solid rgba(255,255,255,.06);color:#94A3B8;border-radius:10px;font-size:14px;cursor:pointer;font-family:Inter,sans-serif">Annuler</button>'
      +'</div>';
    document.body.appendChild(sh);
    sh.addEventListener('click',function(e){if(e.target===sh)sh.style.display='none';});
  }
  var ex=localStorage.getItem('zama_username')||'';
  var inp=document.getElementById('zamaUnInp');
  if(inp){inp.value=ex.replace('@','');zamaUnLive(inp.value);}
  sh.style.display='flex';
  setTimeout(function(){var i=document.getElementById('zamaUnInp');if(i)i.focus();},300);
}
function zamaUnLive(v){
  v=(v||'').toLowerCase().replace(/[^a-z0-9._]/g,'');
  var inp=document.getElementById('zamaUnInp');if(inp)inp.value=v;
  var p=document.getElementById('zamaUnPrev');if(p)p.textContent='@'+(v||'tonusername');
  var s=document.getElementById('zamaUnSt');
  if(s){s.textContent=v.length>=3?('@'+v+' disponible \u2713'):'Min 3 caract\xe8res';s.style.color=v.length>=3?'#22C55E':'#EF4444';}
}
function zamaUnSave(){
  var v=document.getElementById('zamaUnInp').value;
  if(!v||v.length<3){var s=document.getElementById('zamaUnSt');if(s){s.textContent='Min 3 caract\xe8res !';s.style.color='#EF4444';}return;}
  var u='@'+v;
  localStorage.setItem('zama_username',u);
  if(user){user.username=u;saveULS(user);}
  var l=document.getElementById('un-menu-lbl');if(l)l.textContent=u+' \xb7 Modifier';
  document.getElementById('zamaUnSheet').style.display='none';
  toast(u+' sauvegard\xe9 !','ok');
}
"""

# Supprimer l'ancienne fonction si elle existe
html = re.sub(r'\n// ══ USERNAME ZAMA ══\nfunction zamaUN[\s\S]*?(?=\n// ══|\nvar _toastT)', '', html, count=1)

# Ajouter proprement avant </script>
html = html.replace('// TOAST\nvar _toastT', zama_un + '\n// TOAST\nvar _toastT', 1)
if 'function zamaUN()' not in html:
    html = html.replace('</script>', zama_un + '\n</script>', 1)
print("P2 zamaUN ajouté ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Username clean terminé! Taille:", len(html))
print("zamaUN:", 'function zamaUN()' in html)
