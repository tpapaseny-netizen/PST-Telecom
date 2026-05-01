s = open('admin.html', 'r', encoding='utf-8').read()

# Remplacer l'ancien bouton par le nouveau avec token
old = "window.open('/securcam-admin','_blank')"
new = "window.open('/securcam-admin?token=pst-admin-2026','_blank')"

if old in s:
    s = s.replace(old, new)
    open('admin.html', 'w', encoding='utf-8').write(s)
    print('OK - token ajoute au bouton SecurCam')
else:
    print('ERREUR - bouton non trouve')
    # Chercher ce qui existe
    idx = s.find('securcam')
    print('Occurence securcam a index:', idx)
    print('Contexte:', s[max(0,idx-50):idx+100])
