f = open('server-at.js', 'r', encoding='utf-8')
c = f.read()
f.close()

old = "process.env.MONGODB_URI || 'mongodb+srv://tpaseny_db_user:PstMongo2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0'"
new = "process.env.MONGODB_URI || 'mongodb+srv://pst2026:Pst2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0'"

if old in c:
    c = c.replace(old, new)
    print('OK - URI mise a jour')
else:
    # Chercher la ligne MONGODB_URI
    idx = c.find('MONGODB_URI')
    print('Contexte:', repr(c[idx:idx+150]))
    print('ERREUR - pattern non trouve, verifiez le contexte ci-dessus')
    exit(1)

f = open('server-at.js', 'w', encoding='utf-8')
f.write(c)
f.close()
print('Fichier sauvegarde')
