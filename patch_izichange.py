import re

with open('zama.html', 'r', encoding='utf-8-sig') as f:
    content = f.read()

NEW_LANDING = open('/home/claude/zama_new.html', 'r', encoding='utf-8').read()

# Extraire juste le bloc landing du nouveau fichier
start_new = NEW_LANDING.find('<!-- ══ LANDING PAGE ZAMA ══ -->')
end_new = NEW_LANDING.find('<!-- ══ FIN LANDING ══ -->') + len('<!-- ══ FIN LANDING ══ -->')
new_block = NEW_LANDING[start_new:end_new]

# Remplacer dans l'original
start = content.find('<!-- ══ LANDING PAGE ZAMA ══ -->')
end = content.find('<!-- ══ FIN LANDING ══ -->') + len('<!-- ══ FIN LANDING ══ -->')

if start < 0:
    print("ERREUR: marqueur de debut non trouve")
    exit(1)

content = content[:start] + new_block + content[end:]

# Fix initLanding
old_init = """function initLanding() {
  var user = loadU();
  var skipLanding = localStorage.getItem('zama_skip_landing');
  if (!user && !skipLanding) {
    afficherLanding();
  } else if (skipLanding) {
    // Déjà visité, aller direct dans l'app
    checkPinLoad();
  } else {
    // Connecté, aller direct dans l'app
    checkPinLoad();
  }
}"""

new_init = """function initLanding() {
  var user = loadU();
  if (!user) { afficherLanding(); } else { checkPinLoad(); }
}"""

content = content.replace(old_init, new_init)
content = content.replace("localStorage.setItem('zama_skip_landing', '1');\n  checkPinLoad();", "checkPinLoad();")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK: landing style izichange applique!")
