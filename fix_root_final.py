with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Remplacer toutes les routes GET "/" par une seule qui sert zama.html
# Pattern pour capturer toutes les variantes
patterns = [
    r"app\.get\('/',\s*\(req,res\)\s*=>\s*res\.redirect\([^)]+\)\);",
    r'app\.get\("/",\s*\(req,res\)\s*=>\s*res\.redirect\([^)]+\)\);',
    r"app\.get\('/',\s*\(req,res\)\s*=>\s*res\.sendFile\([^)]+sensms\.html[^)]*\)\);",
    r'app\.get\("/",\s*\(req,res\)\s*=>\s*res\.sendFile\([^)]+sensms\.html[^)]*\)\);',
    r"// \[DOUBLON SUPPRIME\].*\n",
]

for p in patterns:
    content = re.sub(p, '', content)

# Insérer la bonne route avant connectDB
good_route = "app.get('/', (req,res) => res.sendFile(require('path').join(__dirname,'zama.html')));\n"
marker = 'connectDB().then('
content = content.replace(marker, good_route + marker, 1)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - Route / -> zama.html injectée proprement")
