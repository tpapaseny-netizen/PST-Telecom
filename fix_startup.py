with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier si connectDB().then( existe
if 'connectDB().then(' in content:
    print("✅ connectDB().then() déjà présent")
else:
    print("❌ connectDB().then() manquant - ajout en fin de fichier")
    
    # Ajouter à la fin du fichier
    startup_block = """
// ── DÉMARRAGE ─────────────────────────────
const PORT = process.env.PORT || 3000;
connectDB().then((dbInstance) => {
  db = dbInstance;
  app.listen(PORT, () => {
    console.log("\\nPST — Pure Smart Telecom");
    console.log("http://localhost:" + PORT);
    console.log("MongoDB: " + (db ? "connecte" : "mode memoire") + "\\n");
  });
});
"""
    content = content.rstrip() + '\n' + startup_block

    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ Bloc startup ajouté")

# Vérification
import subprocess
r = subprocess.run(['Select-String', '-Path', 'server-at.js', '-Pattern', 'app.listen'],
                   capture_output=True, text=True, shell=True)
print(r.stdout)
