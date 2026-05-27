with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = 'app.get("/sensms", (req,res) => res.sendFile(path.join(__dirname,"sensms.html")));'
new = 'app.get("/sensms", (req,res) => res.sendFile(path.join(__dirname,"sensms.html")));\napp.get("/senbet", (req,res) => res.sendFile(path.join(__dirname,"senbet_v3.html")));'

if 'senbet' in content:
    print('Route senbet deja presente')
elif old in content:
    content = content.replace(old, new)
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - Route /senbet ajoutee')
else:
    print('ERREUR - ligne cible non trouvee')
