import re

f = open('server-at.js', 'r', encoding='utf-8')
c = f.read()
f.close()

# Trouver et corriger la ligne corrompue
# Le problème: res.status(403).json({error:" Non autorise\})  suivi de code PowerShell
# Doit être: res.status(403).json({success:false,message:'Non autorise'});

# Remplacer le bloc corrompu
old = '''res.status(403).json({error:" Non autorise\\})


$routes = @\''''

new = "res.status(403).json({success:false,message:'Non autorise'});"

if old in c:
    c = c.replace(old, new)
    print('OK - correction 1 appliquee')
else:
    # Essayer une variante
    import re
    # Trouver le pattern corrompu avec regex
    pattern = r'res\.status\(403\)\.json\(\{error:" Non autorise\\}\)\s*\n\s*\n\$routes = @\''
    match = re.search(pattern, c)
    if match:
        c = c[:match.start()] + "res.status(403).json({success:false,message:'Non autorise'});" + c[match.end():]
        print('OK - correction regex appliquee')
    else:
        # Chercher manuellement autour de la position 184737
        pos = c.find('autorise\\}')
        if pos >= 0:
            # Trouver le debut de la ligne
            start = c.rfind('\n', 0, pos) + 1
            # Trouver la fin du bloc corrompu (jusqu'au prochain commentaire valide)
            end = c.find('\n// ===', pos)
            if end < 0:
                end = c.find('\napp.', pos)
            print('Bloc corrompu trouve entre', start, 'et', end)
            print('Contenu:', repr(c[start:min(start+200, end)]))
            
            # Remplacer
            ligne_correcte = "  return res.status(403).json({success:false,message:'Non autorise'});\n"
            c = c[:start] + ligne_correcte + c[end:]
            print('OK - correction manuelle appliquee')
        else:
            print('ERREUR - pattern non trouve')
            exit(1)

f = open('server-at.js', 'w', encoding='utf-8')
f.write(c)
f.close()
print('Fichier sauvegarde')
