import re

with open('zama.html', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# 1. Changer display:none en display:block pour le landing
old = 'id="landing" style="display:none;position:fixed;inset:0;z-index:99999;overflow-y:auto;'
new = 'id="landing" style="display:block;position:fixed;inset:0;z-index:99999;overflow-y:auto;'

if old not in content:
    print("ERREUR: balise landing non trouvee")
    exit(1)

content = content.replace(old, new, 1)

# 2. Ajouter la logique JS d'initialisation juste avant </body>
init_js = '''
<script>
// Logique affichage landing vs dashboard
(function() {
  var token = localStorage.getItem('zama_token') || sessionStorage.getItem('zama_token');
  var landing = document.getElementById('landing');
  var app = document.getElementById('app');
  if (token) {
    // Connecte : cacher le landing
    if (landing) landing.style.display = 'none';
  } else {
    // Non connecte : afficher le landing
    if (landing) landing.style.display = 'block';
  }
})();
</script>
'''

if '</body>' not in content:
    print("ERREUR: balise </body> non trouvee")
    exit(1)

content = content.replace('</body>', init_js + '</body>', 1)

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK: logique landing/dashboard ajoutee !")
