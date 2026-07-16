# -*- coding: utf-8 -*-
"""
PENC — Patch v80  (Radio : bouton "Rouvrir" visible)
Ajoute un bouton "Rouvrir" visible dans la barre persistante, pour que ce soit clair
qu'on peut revenir au lecteur. (La zone icone+nom reste aussi cliquable.)
Le nom de la station en cours s'affiche deja automatiquement quand DeglouFM l'envoie
(listener postMessage cote Penc deja en place) -> voir prompt Base44 dans le chat.

Lancer depuis le dossier contenant messager.html :
    python patch_v80_radio_reopen.py
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

print("Patch v80 — Bouton Rouvrir")

# 1) Inserer le bouton "Rouvrir" avant la croix
OLD = '    </div>\n    <button class="rb-stop" onclick="stopRadio()" aria-label="Arreter">&#10005;</button>'
NEW = '    </div>\n    <button class="rb-open" onclick="openRadio()">Rouvrir</button>\n    <button class="rb-stop" onclick="stopRadio()" aria-label="Arreter">&#10005;</button>'
s = R(s, OLD, NEW, "Bouton Rouvrir dans la barre")

# 2) CSS du bouton Rouvrir
ANCHOR = ".rb-sub{ font-weight:500; font-size:11px; color:var(--muted,#888); }"
NEW_CSS = ANCHOR + "\n.rb-open{ border:none; background:rgba(0,200,150,.12); color:#00C896; border-radius:9px; padding:8px 13px; font-weight:700; font-size:12.5px; cursor:pointer; flex-shrink:0; }\n.rb-open:active{ transform:scale(.95); }"
s = R(s, ANCHOR, NEW_CSS, "CSS bouton Rouvrir")

# 3) Bump build
s = R(s,
  "console.log('PENC build v79 (radio: pied DeglouFM plein largeur masque le badge)');",
  "console.log('PENC build v80 (radio: bouton Rouvrir + nom station pret a l affichage)');",
  "Marqueur build -> v80")

assert s.count('class="rb-open"') == 1, "Bouton Rouvrir absent !"
assert 'id="rbName"' in s, "rbName absent (affichage station) !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v80.")
print("Verifie : node check.js")
