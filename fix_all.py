SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# 1. Supprimer TOUT ce qu'on a injecté
# Supprimer le bloc SEN-SMS AUTH ROUTES complet
content = re.sub(
    r'// \u2550\u2550 SEN-SMS AUTH ROUTES \u2550\u2550.*?// \u2550\u2550 FIN SEN-SMS AUTH ROUTES \u2550\u2550\n*',
    '', content, flags=re.DOTALL
)
print("1. Bloc auth supprime")

# Supprimer les CORS middleware injectes
content = re.sub(
    r'// CORS.*?next\(\);\n\}\);\n',
    '', content, flags=re.DOTALL
)
print("2. CORS supprime")

# Supprimer mongoose_sms si reste
content = content.replace("const mongoose_sms = require('mongoose');\n", '')

# Verifier que le serveur tourne maintenant (pas d'injection)
with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("3. Fichier nettoye - Railway va redemarrer proprement")
print("Verification - SenSmsUser present:", 'SenSmsUser' in content)
print("Verification - mongoose.Schema present:", 'mongoose.Schema' in content)

# Trouver ou est defini mongoose dans le fichier
idx = content.find("require('mongoose')")
if idx == -1:
    idx = content.find('require("mongoose")')
line = content[:idx].count('\n') + 1
print(f"mongoose require a la ligne: {line}")
