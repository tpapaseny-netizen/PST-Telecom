# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v100
  1) z-index des fenetres (.overlay) 1000 -> 99500
     => les modales admin (publier statut, finances, signalements...) passent
        AU-DESSUS du panneau admin (z-index 10000). Plus besoin de fermer.
        (corrige aussi la modale "Signaler" ouverte depuis un statut.)
  2) Compte Penc : on masque aussi le micro (#micBtn), l'envoi (#sendBtn)
     et les actions d'en-tete (appels/argent). Verrouillage total.

    python patch_v100_fixes.py
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

print("Patch v100 — z-index admin + verrouillage Penc")

# 1) z-index .overlay : 1000 -> 99500 (au-dessus du panneau admin 10000, sous splash/notifs)
s = R(s,
  ".overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1000;display:none;align-items:flex-end;backdrop-filter:blur(3px);}",
  ".overlay{position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99500;display:none;align-items:flex-end;backdrop-filter:blur(3px);}",
  "z-index .overlay -> 99500")

# 2) Verrouillage total du compte Penc (micro + envoi + actions en-tete)
s = R(s,
  "#screen-chat.penc-readonly .chat-input-row{ display:none !important; }",
  "#screen-chat.penc-readonly .chat-input-row{ display:none !important; }\n"
  "#screen-chat.penc-readonly #micBtn, #screen-chat.penc-readonly #sendBtn{ display:none !important; }\n"
  "#screen-chat.penc-readonly .chat-hdr-actions{ display:none !important; }",
  "Masquer micro/envoi/appels pour Penc")

# 3) Build bump
s = R(s,
  "console.log('PENC build v99 (badge bleu certifie: socle + admin)');",
  "console.log('PENC build v100 (fix z-index fenetres admin + verrouillage total Penc)');",
  "Marqueur build -> v100")

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v100.")
print("Verifie : node check.js")
