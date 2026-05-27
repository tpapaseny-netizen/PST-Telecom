#!/usr/bin/env python3
# fix_sensms_jwt_secret.py

FILE = "server-at.js"

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Le middleware senSmsAuth utilise 'pst-secret-2026'
# mais le login JSONBin utilise 'pst-jwt-2026-xK9mPq7nR3'
# On aligne les deux sur le même secret

OLD = "var decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'pst-secret-2026');"
NEW = "var decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'pst-jwt-2026-xK9mPq7nR3');"

if OLD in content:
    content = content.replace(OLD, NEW)
    print("✅ Secret JWT corrigé: pst-secret-2026 → pst-jwt-2026-xK9mPq7nR3")
else:
    print("⚠️  Pattern non trouvé - cherchons...")
    idx = content.find("pst-secret-2026")
    while idx != -1:
        print(f"  Ligne {content[:idx].count(chr(10))+1}: {content[idx-30:idx+30]}")
        idx = content.find("pst-secret-2026", idx+1)

import shutil
shutil.copy(FILE, FILE + ".backup_jwt_fix")
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ server-at.js sauvegardé!")
print()
print("  git add .")
print('  git commit -m "fix: JWT secret unifié - session SenSMS persistante"')
print("  git push")
