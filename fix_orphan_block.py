with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Trouver le bloc orphelin autour de ligne 3339
# C'est entre la fin de register (});) et // POST /api/sensms/login
# On cherche le pattern exact

content = ''.join(lines)

# Le bloc orphelin ressemble à:
# \n  if (db) {\n    user = await SensmsUser.findOne({ $or: [{ phone: identifier }, { email: identifier }] });\n  } else {\n    user = _sensmsUsers[identifier] || Object.values(_sensmsUsers).find(function(u){ return u.email === identifier;\n});\n  }\n

import re

# Supprimer le bloc orphelin - code entre fin du register et début du login
# Pattern: depuis "  if (db) {\n    user = await SensmsUser.findOne" jusqu'à "  }\n\n// POST /api/sensms/login"
pattern = r'\n  if \(db\) \{\n    user = await SensmsUser\.findOne\(\{ \$or: \[\{ phone: identifier \}, \{ email: identifier \}\] \}\);\n  \} else \{\n    user = _sensmsUsers\[identifier\] \|\| Object\.values\(_sensmsUsers\)\.find\(function\(u\)\{ return u\.email === identifier;\n\}\);\n  \}\n'

if re.search(pattern, content):
    content = re.sub(pattern, '\n', content)
    print("✅ Bloc orphelin supprimé (pattern exact)")
else:
    # Suppression ligne par ligne
    print("Pattern exact non trouvé, suppression manuelle...")
    new_lines = []
    skip = False
    i = 0
    while i < len(lines):
        line = lines[i]
        # Détecter début du bloc orphelin: "  if (db) {" précédé d'une ligne ");"
        if (i > 3330 and i < 3360 and 
            line.strip() == 'if (db) {' and 
            i+1 < len(lines) and 'await SensmsUser.findOne' in lines[i+1]):
            print(f"Trouvé début orphelin ligne {i+1}: {line.strip()}")
            # Sauter jusqu'à la ligne qui contient "}" seul (fin du else)
            while i < len(lines) and not (lines[i].strip() == '}' and i > 3335):
                print(f"  Skip ligne {i+1}: {lines[i].strip()[:60]}")
                i += 1
            # Sauter aussi la ligne "}" elle-même
            if i < len(lines):
                print(f"  Skip finale ligne {i+1}: {lines[i].strip()[:60]}")
                i += 1
            continue
        new_lines.append(line)
        i += 1
    
    if len(new_lines) < len(lines):
        content = ''.join(new_lines)
        print(f"✅ Supprimé {len(lines) - len(new_lines)} lignes orphelines")
    else:
        print("❌ Rien supprimé")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Vérification
import subprocess
r = subprocess.run(['findstr', '/n', 'sensms/login', 'server-at.js'], capture_output=True, text=True)
print("Routes login:", r.stdout)
