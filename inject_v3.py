SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

import re

# 1. Nettoyer toutes les injections precedentes
content = re.sub(r'// \u2550\u2550 SEN-SMS AUTH ROUTES \u2550\u2550.*?// \u2550\u2550 FIN SEN-SMS AUTH ROUTES \u2550\u2550\n*', '', content, flags=re.DOTALL)
content = re.sub(r'// CORS\n.*?next\(\);\n\}\);\n', '', content, flags=re.DOTALL)
content = content.replace("const mongoose_sms = require('mongoose');\n", '')
print("1. Nettoyage OK")

# 2. Trouver comment client/db est utilise dans ce fichier
# Chercher MongoClient ou client.db
m = re.search(r"(const client|var client|let client)\s*=", content)
if m:
    print(f"2. Client trouve: {m.group()}")
    
# Chercher bcrypt
bcrypt_ref = re.search(r"(bcrypt|bcryptjs)", content)
if bcrypt_ref:
    print(f"3. bcrypt: {bcrypt_ref.group()}")

# Trouver le require de bcrypt
bcrypt_require = re.search(r"const bcrypt\w*\s*=\s*require\(['\"]bcrypt[^'\"]*['\"]\)", content)
if bcrypt_require:
    print(f"4. bcrypt require: {bcrypt_require.group()}")
    
# Chercher JWT
jwt_ref = re.search(r"jsonwebtoken|jwt", content)
if jwt_ref:
    print(f"5. JWT: present")

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fichier sauvegarde")
