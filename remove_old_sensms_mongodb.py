#!/usr/bin/env python3
# remove_old_sensms_mongodb.py
# Supprime les anciennes routes SenSMS MongoDB (getSensmsUser + /api/sensms/)

import shutil

FILE = "server-at.js"

with open(FILE, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Fichier: {len(lines)} lignes")

# Trouver le debut: "function getSensmsUser"
start_line = None
for i, l in enumerate(lines):
    if 'function getSensmsUser' in l:
        start_line = i
        break

# Trouver la fin: derniere route /api/sensms/ + sa fermeture
last_sensms = None
for i, l in enumerate(lines):
    if "'/api/sensms/" in l or '"/api/sensms/' in l:
        last_sensms = i

# Trouver la fermeture de la derniere route
end_line = None
if last_sensms:
    j = last_sensms + 1
    depth = 0
    while j < len(lines):
        l = lines[j]
        depth += l.count('{') - l.count('}')
        if lines[j].strip() == '});' and depth <= 0:
            end_line = j
            break
        j += 1

if start_line is None or end_line is None:
    print(f"❌ Bloc non trouvé (start={start_line}, end={end_line})")
    exit(1)

print(f"✅ Bloc à supprimer: lignes {start_line+1} à {end_line+1}")
print(f"   Début: {lines[start_line].rstrip()}")
print(f"   Fin:   {lines[end_line].rstrip()}")
print(f"   Total: {end_line - start_line + 1} lignes supprimées")

# Backup
shutil.copy(FILE, FILE + ".backup_remove_old_sensms")
print(f"✅ Backup créé")

# Supprimer les lignes
new_lines = lines[:start_line] + lines[end_line+1:]

with open(FILE, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"✅ {FILE} corrigé ! ({len(lines)} → {len(new_lines)} lignes)")
print()
print("Maintenant :")
print("  git add .")
print('  git commit -m "fix: suppression routes SenSMS MongoDB - JSONBin seul"')
print("  git push")
