#!/usr/bin/env python3
# fix_jsonbin_outside_mongodb.py
# Déplace le bloc JSONBin en dehors du connectDB().then()

FILE = "server-at.js"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Le problème : le bloc JSONBin est DANS connectDB().then((dbInstance) => {
# On doit le sortir de là et le mettre AVANT connectDB()

JSONBIN_START = "// ═══════════════════════════════════════════════════════════════\n// ─── JSONBIN.IO — Stockage persistant SenSMS (remplace MongoDB)"
JSONBIN_END_MARKER = "// ⚡ Récupérer les IDs des bins (à sauvegarder dans Render)\napp.get(\"/api/sen-sms/bins\""

# Trouver où commence le bloc JSONBin
idx_start = content.find(JSONBIN_START)
if idx_start == -1:
    print("❌ Bloc JSONBin introuvable !")
    exit(1)

# Trouver où finit le bloc JSONBin (après la dernière route)
idx_end_search = content.find(JSONBIN_END_MARKER, idx_start)
if idx_end_search == -1:
    print("❌ Fin du bloc JSONBin introuvable !")
    exit(1)

# Trouver la fin de la route /api/sen-sms/bins (fermeture de app.get)
# On cherche });\n\n après le marker de fin
idx_after = content.find("\n});\n", idx_end_search)
if idx_after == -1:
    idx_after = content.find("\n});\r\n", idx_end_search)
if idx_after == -1:
    print("❌ Fin de route bins introuvable !")
    exit(1)

idx_end = idx_after + 5  # inclure "});\n\n"

# Extraire le bloc JSONBin complet
jsonbin_block = content[idx_start:idx_end]
print(f"✅ Bloc JSONBin trouvé: {len(jsonbin_block)} caractères")
print(f"   De la ligne ~{content[:idx_start].count(chr(10))+1} à ~{content[:idx_end].count(chr(10))+1}")

# Vérifier si le bloc est dans connectDB().then()
connectdb_pos = content.rfind("connectDB().then(", 0, idx_start)
if connectdb_pos == -1:
    print("✅ Le bloc JSONBin n'est PAS dans connectDB — pas de modification nécessaire")
    exit(0)

print(f"⚠️  connectDB().then() trouvé à la ligne ~{content[:connectdb_pos].count(chr(10))+1}")
print("   Le bloc JSONBin est DANS connectDB — correction en cours...")

# Supprimer le bloc de sa position actuelle
content_without = content[:idx_start] + content[idx_end:]

# Trouver où injecter : juste AVANT connectDB().then(
inject_pos = content_without.find("connectDB().then(")
if inject_pos == -1:
    print("❌ connectDB().then() introuvable après suppression !")
    exit(1)

# Injecter le bloc juste avant connectDB
content_new = content_without[:inject_pos] + jsonbin_block + "\n\n" + content_without[inject_pos:]

# Vérification
if JSONBIN_START in content_new:
    new_jsonbin_pos = content_new.find(JSONBIN_START)
    new_connectdb_pos = content_new.find("connectDB().then(")
    if new_jsonbin_pos < new_connectdb_pos:
        print("✅ Bloc JSONBin maintenant AVANT connectDB")
    else:
        print("❌ Ordre incorrect après correction !")
        exit(1)

import shutil
shutil.copy(FILE, FILE + ".backup_before_jsonbin_move")

with open(FILE, "w", encoding="utf-8") as f:
    f.write(content_new)

print(f"✅ {FILE} corrigé !")
print()
print("Maintenant :")
print("  git add .")
print('  git commit -m "fix: JSONBin hors connectDB - SenSMS stable"')
print("  git push")
