with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return; }
  try {
    const client = new MongoClient(MONGODB_URI);"""

new = """async function connectDB() {
  if (!MONGODB_URI) { console.warn("WARNING MONGODB_URI manquant"); return null; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("MongoDB connecte");
    return client.db('pst_telecom');
  } catch(e) { console.error("MongoDB erreur:", e.message); return null; }
}"""

idx = content.find(old)
idx_cors = content.find('// \u2550\u2550 CORS \u2550\u2550', idx)

if idx == -1:
    print("ERREUR: pattern connectDB non trouve")
elif idx_cors == -1:
    print("ERREUR: pattern CORS non trouve")
else:
    content = content[:idx] + new + '\n\n' + content[idx_cors:]
    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK connectDB corrigee")
