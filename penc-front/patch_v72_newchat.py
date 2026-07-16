# -*- coding: utf-8 -*-
"""
PENC — Patch v72
Écran « Nouvelle conversation » :
  1) Corrige le bug d'affichage « U0001F4AC » (échappement Python \\U... invalide en JS)
     -> remplacé par un vrai bouton « Message » premium (pastille turquoise + icône SVG).
  2) « Demande d'ami » reste l'action prioritaire (pastille pleine accent + ombre douce).
Aucune route serveur touchée. Logique friend-first + exception admin préservées.

Lancer depuis le dossier qui contient messager.html :
    python patch_v72_newchat.py
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
    print("Fichier introuvable : %s (lance le script dans le bon dossier)." % FN)
    sys.exit(1)

# messager.html : LF, SANS BOM
with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v72 — Nouvelle conversation")

# ---- 1) Bloc _action : emoji casse -> bouton Message premium + Demande d'ami releve ----
OLD_ACTION = r'''    var _action=_canMsg
      ? '<span style="font-size:20px;">\U0001F4AC</span>'
      : '<button class="su-addfr" style="background:var(--accent);color:#fff;border:none;border-radius:10px;padding:8px 12px;font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap;flex-shrink:0;">Demande d\'ami</button>';'''

NEW_ACTION = r'''    var _action=_canMsg
      ? '<span class="su-msg" style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,200,150,.12);color:var(--accent);border-radius:10px;padding:7px 12px;font-weight:700;font-size:12.5px;white-space:nowrap;flex-shrink:0;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>Message</span>'
      : '<button class="su-addfr" style="background:var(--accent);color:#fff;border:none;border-radius:12px;padding:8px 14px;font-weight:700;font-size:12.5px;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(0,200,150,.28);">Demande d\'ami</button>';'''

s = R(s, OLD_ACTION, NEW_ACTION, "Bouton Message premium + Demande d'ami releve")

# ---- 2) Bump du marqueur de build ----
OLD_BUILD = "console.log('PENC build v71 (login premium + menu statut + amis obligatoires + citation statut + ping)');"
NEW_BUILD = "console.log('PENC build v72 (newchat: bouton Message premium + fix emoji + demande ami prioritaire)');"
s = R(s, OLD_BUILD, NEW_BUILD, "Marqueur de build -> v72")

# ---- Garde-fous ----
assert "\\U0001F4AC" not in s, "Le marqueur casse U0001F4AC est encore present !"
assert "su-msg" in s, "Le nouveau bouton Message est absent !"

# Reecriture : LF, SANS BOM
with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html mis a jour (v72).")
print("Verifie ensuite : node check.js  (puis deploie les 6 fichiers sur Cloudflare).")
