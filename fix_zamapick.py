#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

# Remplacer onclick="zamaPick()" par la fonction inline complète
old = 'onclick="zamaPick()"'
new = '''onclick="(function(){var m=document.getElementById('zama-un-modal');if(!m){m=document.createElement('div');m.id='zama-un-modal';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:flex;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto';m.innerHTML='<div style=\\"background:#0D1525;border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid rgba(255,255,255,.08)\\"><div style=\\"width:36px;height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin:0 auto 20px\\"></div><div style=\\"font-size:18px;font-weight:700;text-align:center;margin-bottom:4px\\">Mon @username</div><div style=\\"font-size:12px;color:#475569;text-align:center;margin-bottom:20px\\">Identifiant unique pour recevoir</div><div style=\\"position:relative;margin-bottom:8px\\"><span style=\\"position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;font-weight:800;color:#F5B014;z-index:1\\">@</span><input id=\\"zun\\" type=\\"text\\" placeholder=\\"tonusername\\" maxlength=\\"20\\" autocomplete=\\"off\\" autocapitalize=\\"none\\" style=\\"width:100%;background:#111D30;border:1.5px solid rgba(245,176,20,.3);border-radius:10px;padding:14px 16px 14px 32px;color:#E2E8F0;font-size:16px;font-weight:700;font-family:Inter,sans-serif;outline:none\\" oninput=\\"var v=this.value.toLowerCase().replace(/[^a-z0-9._]/g,\\'\\');this.value=v;document.getElementById(\\'zunp\\').textContent=\\'@\\'+(v||(\\'tonusername\\'));document.getElementById(\\'zuns\\').textContent=v.length>=3?(\\'@\\'+v+\\' disponible ✓\\'):\\'Min 3 caractères\\';document.getElementById(\\'zuns\\').style.color=v.length>=3?\\'#22C55E\\':\\'#EF4444\\'\\"></div><div id=\\"zunp\\" style=\\"font-size:24px;font-weight:800;color:#F5B014;text-align:center;margin:12px 0 4px\\">@tonusername</div><div id=\\"zuns\\" style=\\"font-size:12px;color:#475569;text-align:center;margin-bottom:16px\\">Entrez 3 à 20 caractères</div><button onclick=\\"var v=document.getElementById(\\'zun\\').value;if(v.length<3)return;var u=\\'@\\'+v;localStorage.setItem(\\'zama_username\\',u);var l=document.getElementById(\\'un-menu-lbl\\');if(l)l.textContent=u+\\' · Modifier\\';document.getElementById(\\'zama-un-modal\\').style.display=\\'none\\';alert(u+\\' sauvegardé !')\\" style=\\"width:100%;padding:15px;background:linear-gradient(135deg,#F5B014,#FCD34D);color:#000;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px\\">Confirmer</button><button onclick=\\"document.getElementById(\\'zama-un-modal\\').style.display=\\'none'\\" style=\\"width:100%;padding:13px;background:#1A2640;border:1px solid rgba(255,255,255,.06);color:#94A3B8;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer\\">Annuler</button></div>';document.body.appendChild(m);m.addEventListener('click',function(e){if(e.target===m)m.style.display='none';});}var inp=document.getElementById('zun');if(inp){var ex=localStorage.getItem('zama_username')||'';inp.value=ex.replace('@','');document.getElementById('zunp').textContent='@'+(inp.value||'tonusername');}m.style.display='flex';setTimeout(function(){var i=document.getElementById('zun');if(i)i.focus();},300);}())"'''

if 'onclick="zamaPick()"' in html:
    html = html.replace('onclick="zamaPick()"', new, 1)
    print("✅ zamaPick inline ✅")
else:
    print("❌ zamaPick non trouvé")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Taille:", len(html))
