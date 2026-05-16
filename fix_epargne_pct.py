import re

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ══ FIX 1: Enlever "+ Nouveau" dans le header scr-epargne
html = html.replace(
    '<span class="hact" onclick="goto(\'scr-epargne-new\')">+ Nouveau</span>',
    '<span></span>'
)
print("OK - bouton Nouveau supprimé du header")

# ══ FIX 2: Fix pourcentage - utiliser 1 décimale au lieu de Math.round
# Math.round(2000/1000000 * 100) = Math.round(0.2) = 0  ← bug
# Fix: afficher avec 1 décimale si < 1%
old_pct = "var pct = ep.progression||0;"
new_pct = """var pct_raw = ep.objectif_fcfa > 0 ? (ep.solde_fcfa / ep.objectif_fcfa * 100) : 0;
      var pct = ep.progression || Math.round(pct_raw * 10) / 10;
      var pct_display = pct_raw < 1 && pct_raw > 0 ? pct_raw.toFixed(1) : Math.round(pct_raw);"""

html = html.replace(old_pct, new_pct)
print("OK - calcul pourcentage corrigé")

# Remplacer l'affichage du pourcentage dans le template
old_display = '"+pct+"%</div>";'
new_display = '"+pct_display+"%</div>";'
html = html.replace(old_display, new_display, 1)
print("OK - affichage pourcentage mis à jour")

# Aussi corriger la barre de progression pour qu'elle soit visible même à 0.2%
old_bar = '"height:100%;width:"+pct+"%;background:"+c+";border-radius:3px'
new_bar = '"height:100%;width:"+Math.max(pct_raw,0.5)+"%;background:"+c+";border-radius:3px'
html = html.replace(old_bar, new_bar, 1)
print("OK - barre progression min 0.5% visible")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nDone!")
