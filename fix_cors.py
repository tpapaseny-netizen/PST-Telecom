SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Chercher le require express
import re
idx = content.find("const app = express()")
if idx == -1:
    idx = content.find("const app=express()")
if idx == -1:
    idx = content.find("express()")
    
print(f"express() trouve a: {idx}")
print(repr(content[idx:idx+100]))

# Ajouter CORS apres app = express()
cors_config = """

// CORS — autoriser sensms.com et autres origines
app.use(function(req, res, next) {
  var allowed = ['https://sensms.com', 'https://www.sensms.com', 'https://pst-telecom.vercel.app', 'http://localhost:3000'];
  var origin = req.headers.origin;
  if (!origin || allowed.indexOf(origin) !== -1 || origin.endsWith('.vercel.app') || origin.endsWith('.railway.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
"""

# Trouver la ligne apres app = express()
end_of_line = content.find('\n', idx) + 1
content = content[:end_of_line] + cors_config + content[end_of_line:]

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("CORS ajoute OK")
print("Verification:")
if 'Access-Control-Allow-Origin' in content:
    print("  - CORS headers: OK")
if 'sensms.com' in content:
    print("  - sensms.com autorise: OK")
