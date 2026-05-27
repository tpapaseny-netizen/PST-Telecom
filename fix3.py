f = open('server-at.js', 'r', encoding='utf-8')
lines = f.readlines()
f.close()

# Afficher le contexte autour de la ligne problematique
print("Contexte lignes 3555-3570:")
for i in range(3554, 3570):
    print(f"{i+1}: {repr(lines[i].rstrip())}")

# La ligne 3562 (index 3561) est une accolade orpheline }
# Verifier et supprimer
if lines[3561].strip() == '}':
    print(f"\nSuppression ligne 3562: {repr(lines[3561])}")
    lines.pop(3561)
    f = open('server-at.js', 'w', encoding='utf-8')
    f.writelines(lines)
    f.close()
    print("OK - ligne orpheline supprimee")
else:
    print(f"\nLigne 3562 contient: {repr(lines[3561])}")
    print("Pas de suppression automatique")
