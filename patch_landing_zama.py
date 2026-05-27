# patch_landing_zama.py
# Place ce fichier dans C:\\Users\\NDCHEIKH\\Desktop\\PST-Telecom\\
# Puis execute: python patch_landing_zama.py

import re

with open('zama.html', 'r', encoding='utf-8-sig') as f:
    content = f.read()

NEW_LANDING = """ + repr(new_landing) + """

# Remplacer le bloc landing
pattern = r'<!-- ══ LANDING PAGE ZAMA ══ -->.*?<!-- ══ FIN LANDING ══ -->'
new_content = re.sub(pattern, NEW_LANDING, content, flags=re.DOTALL)

if new_content == content:
    print("ERREUR: marqueurs non trouvés dans zama.html")
else:
    with open('zama.html', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("OK: landing ZAMA thème Claude AI appliqué !")
