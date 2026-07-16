# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v97 (compte officiel : statuts non-repondables)
  - masque la barre "Repondre" sur les statuts de Penc
  - masque les reactions (emoji) sur les statuts de Penc
(le blocage des messages est deja en place depuis v92)

    python patch_v97_official_status_lock.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v97 — Statuts officiels non-repondables")

# 1) Barre de reponse : masquee aussi si statut = Penc
s = R(s,
  "  if(rep) rep.style.display=isOwn?'none':'flex';",
  "  if(rep) rep.style.display=(isOwn||_isPenc(sv.user_id))?'none':'flex';",
  "Masquer barre Repondre pour Penc")

# 2) Reactions : aucune si statut = Penc
OLD = (
    "  var ra=document.getElementById('svReactions');\n"
    "  if(ra){\n"
    "    if(isOwn){"
)
NEW = (
    "  var ra=document.getElementById('svReactions');\n"
    "  if(ra){\n"
    "    if(_isPenc(sv.user_id)){\n"
    "      ra.innerHTML='';\n"
    "    } else if(isOwn){"
)
s = R(s, OLD, NEW, "Masquer reactions pour Penc")

# 3) Bump build
s = R(s,
  "console.log('PENC build v96 (admin: vue des signalements + actions)');",
  "console.log('PENC build v97 (compte officiel: statuts non-repondables)');",
  "Marqueur build -> v97")

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v97.")
print("Verifie : node check.js")
