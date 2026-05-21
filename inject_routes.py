with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

ANCHOR = 'app.get("/admin"'

ROUTES = """// Routes pages HTML
app.get("/", (req,res) => res.sendFile(path.join(__dirname,"sensms.html")));
app.get("/zama", (req,res) => res.sendFile(path.join(__dirname,"zama.html")));
app.get("/recharge", (req,res) => res.sendFile(path.join(__dirname,"recharge.html")));
app.get("/noc", (req,res) => res.sendFile(path.join(__dirname,"noc.html")));
app.get("/trax", (req,res) => res.sendFile(path.join(__dirname,"pst-trax.html")));
app.get("/transfer", (req,res) => res.sendFile(path.join(__dirname,"transfer.html")));

"""

if ANCHOR in content:
    content = content.replace(ANCHOR, ROUTES + ANCHOR)
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK - Routes HTML injectees")
else:
    print("ERREUR - Ancre introuvable")
