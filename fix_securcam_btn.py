s = open('admin.html', 'r', encoding='utf-8').read()

# Chercher "Contenu du site" qui est le dernier item visible
old = '<span class="nav-icon">✏️</span> Contenu du site</div>'
new = '<span class="nav-icon">✏️</span> Contenu du site</div>\n<div class="nav-item" onclick="window.open(\'/securcam-admin\',\'_blank\')" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);border-radius:8px;margin:4px 12px;color:#06B6D4;font-weight:600;"><span class="nav-icon">📹</span> PST SecurCam ↗</div>'

if old in s:
    s = s.replace(old, new)
    open('admin.html', 'w', encoding='utf-8').write(s)
    print('OK - bouton ajoute apres Contenu du site')
else:
    # Fallback - chercher Deconnexion
    old2 = 'Déconnexion'
    idx = s.find(old2)
    if idx > 0:
        insert = '\n<div class="nav-item" onclick="window.open(\'/securcam-admin\',\'_blank\')" style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.25);border-radius:8px;margin:4px 12px;color:#06B6D4;font-weight:600;"><span class="nav-icon">📹</span> PST SecurCam ↗</div>\n'
        s = s[:idx] + insert + s[idx:]
        open('admin.html', 'w', encoding='utf-8').write(s)
        print('OK - bouton ajoute avant Deconnexion')
    else:
        print('ERREUR - element non trouve')
