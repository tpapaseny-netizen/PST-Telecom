SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Supprimer l'ancien middleware CORS mal placé
import re
old_cors = re.search(r'// CORS.*?next\(\);\n\}\);\n', content, re.DOTALL)
if old_cors:
    content = content.replace(old_cors.group(), '', 1)
    print("Ancien CORS supprime")

# 2. Trouver le bon endroit - juste apres app = express()
# et AVANT toutes les routes
idx = content.find('const app = express()')
if idx == -1:
    idx = content.find('const app=express()')
    
end_line = content.find('\n', idx) + 1
print(f"app = express() a ligne: {content[:idx].count(chr(10))+1}")

cors_middleware = """
// CORS - doit etre AVANT toutes les routes
app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
"""

content = content[:end_line] + cors_middleware + content[end_line:]

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("CORS injecte AVANT les routes OK")

# Verifier
if 'Access-Control-Allow-Origin' in content:
    print("Verification: CORS present OK")
    # Compter les occurrences
    n = content.count('Access-Control-Allow-Origin')
    print(f"  Occurrences: {n}")
