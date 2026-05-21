with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remplacer const PORT par var PORT dans le bloc startup ajouté
old = "const PORT = process.env.PORT || 3000;\nconnectDB().then((dbInstance) => {"
new = "var PORT = process.env.PORT || 3000;\nconnectDB().then((dbInstance) => {"

if old in content:
    content = content.replace(old, new)
    print("✅ const PORT -> var PORT")
else:
    # Chercher et remplacer toutes les déclarations PORT en doublon
    import re
    ports = [(m.start(), m.group()) for m in re.finditer(r'(const|let|var) PORT\s*=', content)]
    print(f"Déclarations PORT trouvées: {len(ports)}")
    for pos, match in ports:
        line = content[:pos].count('\n') + 1
        print(f"  Ligne {line}: {match}")
    
    # Garder la première, remplacer les suivantes par assignation simple
    if len(ports) > 1:
        for pos, match in ports[1:]:
            content = content[:pos] + 'PORT =' + content[pos+len(match):]
        print("✅ Doublons PORT corrigés")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

import subprocess
r = subprocess.run(['Select-String', '-Path', 'server-at.js', '-Pattern', 'PORT.*=.*process'],
                   capture_output=True, text=True, shell=True)
print(r.stdout)
