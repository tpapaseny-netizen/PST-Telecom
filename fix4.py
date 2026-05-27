f = open('server-at.js', 'r', encoding='utf-8')
lines = f.readlines()
f.close()

print(f"Total lignes avant: {len(lines)}")

# Supprimer toutes les lignes qui sont des artefacts PowerShell
# Ces lignes commencent par ' (apostrophe) ou sont des lignes vides isolées entre du code
lignes_a_supprimer = []

for i, line in enumerate(lines):
    stripped = line.strip()
    # Lignes qui sont juste une apostrophe (artefact @' de PowerShell)
    if stripped == "'" or stripped == "@'" or stripped == "'@":
        lignes_a_supprimer.append(i)
        print(f"Ligne {i+1} a supprimer: {repr(line.rstrip())}")
    # Lignes qui commencent par apostrophe suivie d'un commentaire JS ou code JS
    elif stripped.startswith("'//") or stripped.startswith("'app.") or stripped.startswith("'  "):
        # C'est du code JS precede d'une apostrophe parasite
        lines[i] = line.lstrip("'")
        print(f"Ligne {i+1} corrigee: apostrophe supprimee")
    # Ligne avec juste }' ou }'
    elif stripped == "}'":
        lines[i] = line.replace("}'", "}") 
        print(f"Ligne {i+1} corrigee: apostrophe apres accolade supprimee")

# Supprimer les lignes marquees (en ordre inverse pour ne pas decaler les indices)
for i in sorted(lignes_a_supprimer, reverse=True):
    lines.pop(i)

print(f"Total lignes apres: {len(lines)}")
print(f"Lignes supprimees: {len(lignes_a_supprimer)}")

f = open('server-at.js', 'w', encoding='utf-8')
f.writelines(lines)
f.close()
print("OK - fichier sauvegarde")
