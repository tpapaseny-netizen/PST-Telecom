with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Supprimer le fragment orphelin (fin de l'ancienne connectDB qui traine)
orphan = """    await client.connect();
    db = client.db("pst_telecom");
    console.log("OK MongoDB Atlas connecte");
  } catch (err) { console.error("ERREUR MongoDB:", err.message); }
}"""

if orphan in content:
    content = content.replace(orphan, '', 1)
    print("OK fragment orphelin supprime")
else:
    print("ERREUR: fragment orphelin non trouve")

# 2. Remplacer le commentaire MongoDB vide par une vraie connectDB + declaration client
old_mongodb_comment = "// \u2500\u2500\u2500 MongoDB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"

new_mongodb_block = """// \u2500\u2500\u2500 MongoDB \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let client;
async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return null; }
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("OK MongoDB Atlas connecte");
    return client.db('pst_telecom');
  } catch(err) { console.error("ERREUR MongoDB:", err.message); return null; }
}"""

if old_mongodb_comment in content:
    content = content.replace(old_mongodb_comment, new_mongodb_block, 1)
    print("OK connectDB reconstruite")
else:
    print("ERREUR: commentaire MongoDB non trouve")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fichier sauvegarde")
