# -*- coding: utf-8 -*-
"""
PENC — Patch v74
Supprime le menu natif (dictionnaire / "Rechercher sur le Web" / "Look Up")
qui apparait a la selection de texte, PARTOUT (messages, statuts, profils, canaux).
- Selection native desactivee globalement (CSS user-select:none + touch-callout:none).
- RE-AUTORISEE sur input/textarea/select (+ .allow-select) -> frappe & copier-coller OK.
- contextmenu navigateur neutralise hors champs de saisie -> seul le menu interne Penc reste.
Aucune logique applicative touchee. Les handlers Penc (appui long, swipe) sont JS, pas natifs.

Lancer depuis le dossier contenant messager.html :
    python patch_v74_noselect.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1). Aucune modif." % (label, n))
        sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v74 — Anti-dictionnaire / selection externe")

# 1) Bloc CSS global, injecte juste avant </head>
CSS_BLOCK = (
    '<style id="no-native-lookup">\n'
    '/* Penc : pas de menu natif dictionnaire/recherche sur selection. */\n'
    'body{ -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; user-select:none; -webkit-touch-callout:none; }\n'
    'input, textarea, select, [contenteditable="true"], .allow-select{ -webkit-user-select:text; -moz-user-select:text; -ms-user-select:text; user-select:text; -webkit-touch-callout:default; }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS_BLOCK + "</head>", "Bloc CSS no-native-lookup avant </head>")

# 2) Bump build + petit JS anti-contextmenu (hors champs de saisie)
OLD_BUILD = "console.log('PENC build v73 (login premium redesign: gradient + champs 56px + toggle blanc + bouton teal)');"
NEW_BUILD = (
    "console.log('PENC build v74 (anti-dictionnaire: selection native desactivee hors champs + menu Penc only)');\n"
    "(function(){ document.addEventListener('contextmenu', function(e){ try{ var t=e.target; "
    "if(t&&t.closest&&t.closest('input,textarea,select,[contenteditable=\\\"true\\\"]')) return; "
    "e.preventDefault(); }catch(_){} }, false); })();"
)
s = R(s, OLD_BUILD, NEW_BUILD, "Marqueur build -> v74 + anti-contextmenu JS")

# Garde-fous
assert s.count('id="no-native-lookup"') == 1, "Bloc CSS absent ou duplique !"
assert 'id="chatInput"' in s, "REGRESSION : champ de saisie chatInput introuvable !"
assert "PENC build v74" in s, "Marqueur v74 absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v74.")
print("Verifie : node check.js")
