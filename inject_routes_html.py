import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier si les routes existent déjà
if "app.get('/zama'" in content or 'app.get("/zama"' in content:
    print("Routes HTML déjà présentes - rien à faire")
    exit()

routes = """
// ============================================================
// ROUTES HTML - PAGES
// ============================================================
app.get('/zama', function(req, res) { res.sendFile(__dirname + '/zama.html'); });
app.get('/sensms', function(req, res) { res.sendFile(__dirname + '/sensms.html'); });
app.get('/zamin', function(req, res) { res.sendFile(__dirname + '/zamin.html'); });
app.get('/sms', function(req, res) { res.sendFile(__dirname + '/sms.html'); });
app.get('/recharge', function(req, res) { res.sendFile(__dirname + '/recharge.html'); });
app.get('/appel', function(req, res) { res.sendFile(__dirname + '/appel.html'); });
app.get('/streaming', function(req, res) { res.sendFile(__dirname + '/streaming.html'); });
app.get('/trax', function(req, res) { res.sendFile(__dirname + '/pst-trax.html'); });
app.get('/noc', function(req, res) { res.sendFile(__dirname + '/noc.html'); });
app.get('/transfer', function(req, res) { res.sendFile(__dirname + '/transfer.html'); });
app.get('/sms-marketing', function(req, res) { res.sendFile(__dirname + '/sms-marketing.html'); });

"""

# Injecter avant connectDB().then
marker = 'connectDB().then('
idx = content.find(marker)

if idx == -1:
    print("ERREUR: marqueur connectDB().then( introuvable")
    exit(1)

new_content = content[:idx] + routes + content[idx:]

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("OK - Routes HTML injectées avant connectDB().then()")
print("Routes ajoutées: /zama /sensms /zamin /sms /recharge /appel /streaming /trax /noc /transfer /sms-marketing")
