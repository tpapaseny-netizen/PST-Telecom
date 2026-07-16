# -*- coding: utf-8 -*-
"""
PENC — Patch v84  (Radio : VRAI fix SSO)
ME est declare avec `let` au niveau global -> `window.ME` vaut undefined,
donc le lecteur radio n'envoyait NI e-mail NI nom a DeglouFM (d'ou : marche par URL,
pas depuis Penc). Correction : lire `ME` directement (portee globale partagee entre scripts).

Lancer depuis le dossier contenant messager.html :
    python patch_v84_fix_me.py
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

print("Patch v84 — Fix lecture de ME (SSO)")

s = R(s, "      var _u=(window.ME||{});", "      var _u=((typeof ME!=='undefined' && ME) ? ME : {});", "Lecture de ME (au lieu de window.ME)")

s = R(s,
  "console.log('PENC build v83 (radio: SSO robuste - envoi identite repete a DeglouFM)');",
  "console.log('PENC build v84 (radio: fix SSO - lecture ME correcte, e-mail envoye depuis Penc)');",
  "Marqueur build -> v84")

assert "typeof ME!=='undefined'" in s, "Fix ME absent !"
assert s.count("var _u=(window.ME||{})") == 0, "window.ME encore present !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v84.")
print("Verifie : node check.js")
