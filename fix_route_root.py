with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

fixed = []
found_root = False
changes = []

for i, line in enumerate(lines):
    # Détecter toutes les routes GET "/"
    stripped = line.strip()
    is_root_route = (
        "app.get('/'," in stripped or
        'app.get("/", ' in stripped or
        "app.get('/', " in stripped or
        ('app.get(' in stripped and ("'/')" in stripped or '"/"' in stripped))
    )
    
    if is_root_route:
        if not found_root:
            # Première occurrence - on la garde et on met zama.html
            if 'sensms.html' in line:
                new_line = line.replace('sensms.html', 'zama.html')
                fixed.append(new_line)
                changes.append(f"Ligne {i+1}: sensms.html -> zama.html (route /)")
            else:
                fixed.append(line)
                changes.append(f"Ligne {i+1}: route / gardée telle quelle")
            found_root = True
        else:
            # Doublon - on commente
            fixed.append('// [DOUBLON SUPPRIME] ' + line)
            changes.append(f"Ligne {i+1}: doublon commenté")
    else:
        fixed.append(line)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.writelines(fixed)

print("Corrections effectuées:")
for c in changes:
    print(" -", c)

if not changes:
    print("Aucune route '/' trouvée - vérifiez manuellement")
