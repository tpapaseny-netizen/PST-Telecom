s = open('admin.html', 'r', encoding='utf-8').read()
btn = '\n<div class="nav-item" onclick="window.open(\'/securcam-admin\',\'_blank\')" style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);border-radius:8px;margin:8px 12px;color:#06B6D4;"><span class="nav-icon">📹</span> PST SecurCam</div>\n'
# Trouver un bon endroit - avant </nav> ou avant la derniere section nav
if 'nav-security' in s:
    s = s.replace('id="nav-security"', 'id="nav-security"', 1)
# Ajouter juste avant la fermeture de la sidebar
s = s.replace('</div><!-- end sidebar -->', btn + '</div><!-- end sidebar -->')
if btn not in s:
    # Fallback - chercher le dernier nav-item
    idx = s.rfind('nav-item')
    if idx > 0:
        end = s.find('</div>', idx) + 6
        s = s[:end] + btn + s[end:]
open('admin.html', 'w', encoding='utf-8').write(s)
print('OK')
