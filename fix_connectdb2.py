with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Supprimer le bloc injecte par erreur (la nouvelle connectDB qui contient await a l'exterieur)
bad = """async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return null; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("MongoDB connecte");
    return client.db('pst_telecom');
  } catch(e) { console.error("MongoDB erreur:", e.message); return null; }
}

"""

if bad in content:
    content = content.replace(bad, '', 1)
    print("OK bloc injecte supprime")
else:
    print("ERREUR: bloc injecte non trouve - affichage des 300 premiers chars autour de connectDB:")
    idx = content.find('async function connectDB()')
    if idx != -1:
        print(repr(content[idx:idx+300]))

# Verifier que l'original est intact
if 'async function connectDB()' in content:
    print("OK connectDB originale presente")
else:
    print("ATTENTION: connectDB originale absente!")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fichier sauvegarde")
