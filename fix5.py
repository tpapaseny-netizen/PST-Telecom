f = open('server-at.js', 'r', encoding='utf-8')
lines = f.readlines()
f.close()

fixed = 0
result = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    
    # Supprimer lignes qui sont juste une apostrophe ou accolade+apostrophe
    if stripped in ("'", "}'", "'}", "}\\'"):
        print(f"Suppression ligne {i+1}: {repr(line.rstrip())}")
        fixed += 1
        i += 1
        continue
    
    # Corriger lignes qui commencent par apostrophe parasite
    if line.startswith("'") and len(stripped) > 1 and stripped != "'":
        corrected = line[1:]  # supprimer l'apostrophe initiale
        print(f"Correction ligne {i+1}: {repr(line.rstrip())} -> {repr(corrected.rstrip())}")
        result.append(corrected)
        fixed += 1
        i += 1
        continue
    
    result.append(line)
    i += 1

f = open('server-at.js', 'w', encoding='utf-8')
f.writelines(result)
f.close()
print(f"\nOK - {fixed} corrections appliquees")
print(f"Lignes avant: {len(lines)}, apres: {len(result)}")
