with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lignes: {len(lines)}")

# Chercher toutes les déclarations PORT
port_lines = [(i, l.rstrip()) for i, l in enumerate(lines) if 'PORT' in l and ('const PORT' in l or 'var PORT' in l or 'let PORT' in l)]
print(f"Déclarations PORT trouvées: {len(port_lines)}")
for i, l in port_lines:
    print(f"  Ligne {i+1}: {l}")

# Garder la première, supprimer les suivantes
if len(port_lines) > 1:
    # Supprimer toutes sauf la première
    lines_to_remove = set(i for i, _ in port_lines[1:])
    new_lines = [l for i, l in enumerate(lines) if i not in lines_to_remove]
    
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"✅ Supprimé {len(lines_to_remove)} déclaration(s) PORT en doublon")
    print(f"Lignes: {len(lines)} -> {len(new_lines)}")
else:
    print("Une seule déclaration PORT - OK")
