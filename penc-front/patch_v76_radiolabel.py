# -*- coding: utf-8 -*-
"""
PENC — Patch v76
Header : le bouton radio rond devient une PASTILLE "DeglouFM" (icone ondes + libelle),
pour que tout le monde voie que c'est la radio. Comportement identique (openRadio()).
Purement visuel.

Lancer depuis le dossier contenant messager.html :
    python patch_v76_radiolabel.py
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

print("Patch v76 — Pastille DeglouFM dans le header")

# 1) Markup : rond -> pastille avec libelle
OLD_BTN = '<div class="radio-btn" onclick="openRadio()" role="button" tabindex="0" aria-label="Radio DeglouFM"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></div>'
NEW_BTN = '<div class="radio-btn" onclick="openRadio()" role="button" tabindex="0" aria-label="Radio DeglouFM"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span class="radio-btn-label">DeglouFM</span></div>'
s = R(s, OLD_BTN, NEW_BTN, "Markup pastille + libelle")

# 2) CSS : rond -> pastille
OLD_CSS = ".radio-btn{ width:40px; height:40px; border-radius:50%; background:#00C896; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,200,150,.40); transition:transform .12s, box-shadow .2s; }"
NEW_CSS = ".radio-btn{ height:38px; border-radius:19px; padding:0 14px 0 11px; background:#00C896; display:flex; align-items:center; gap:7px; cursor:pointer; box-shadow:0 4px 12px rgba(0,200,150,.40); transition:transform .12s, box-shadow .2s; }\n.radio-btn-label{ color:#fff; font-weight:700; font-size:13px; letter-spacing:.2px; white-space:nowrap; }"
s = R(s, OLD_CSS, NEW_CSS, "CSS pastille")

# 3) Bump build
s = R(s,
  "console.log('PENC build v75 (radio header + panneau DeglouFM integre + barre persistante)');",
  "console.log('PENC build v76 (header: pastille DeglouFM libellee)');",
  "Marqueur build -> v76")

assert s.count('class="radio-btn-label"') == 1, "Libelle absent ou duplique !"
assert "openRadio()" in s, "openRadio introuvable !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v76.")
print("Verifie : node check.js")
