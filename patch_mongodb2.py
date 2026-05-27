with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = "mongodb+srv://pst_render:Render2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0"
new = "mongodb+srv://tpaseny_db_user:tF0gEGhn7Tlpxz79@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0"

if old in content:
    content = content.replace(old, new)
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK - mot de passe corrige")
else:
    print("ERREUR - chaine non trouvee")
    # Chercher ce qui est la
    idx = content.find('mongodb+srv://')
    if idx >= 0:
        print("Chaine trouvee:", content[idx:idx+100])
