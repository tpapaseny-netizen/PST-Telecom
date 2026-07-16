# -*- coding: utf-8 -*-
"""
PENC — Patch v79  (Radio : pied "DeglouFM" agrandi)
Re-ajoute un cache PLEINE LARGEUR "DeglouFM" tout en bas du panneau radio (~58px),
qui recouvre le badge "Edit with Base44" une fois la barre DeglouFM remontee cote Base44.
A deployer APRES avoir applique le prompt Base44 (qui remonte la nav d'environ 60px),
sinon le pied masquerait la navigation de DeglouFM.

Lancer depuis le dossier contenant messager.html :
    python patch_v79_radio_foot.py
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

print("Patch v79 — Pied DeglouFM (cache badge agrandi)")

# 1) Pied plein largeur, insere juste apres l'iframe
OLD_IFRAME = '<iframe id="radioFrame" title="DeglouFM" allow="autoplay; encrypted-media; fullscreen"></iframe>'
FOOT = '\n      <div class="radio-foot" id="radioFoot"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#00C896" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span>DeglouFM</span></div>'
s = R(s, OLD_IFRAME, OLD_IFRAME + FOOT, "Pied DeglouFM apres iframe")

# 2) CSS du pied (apres la regle .radio-badge-cover span)
ANCHOR = ".radio-badge-cover span{ color:#00C896; font-weight:700; font-size:13px; white-space:nowrap; }"
NEW_CSS = ANCHOR + """
.radio-foot{ position:absolute; left:0; right:0; bottom:0; height:58px; background:#0b0f17; display:flex; align-items:center; justify-content:center; gap:9px; z-index:6; border-top:1px solid rgba(255,255,255,.06); }
.radio-foot span{ color:#00C896; font-weight:800; font-size:15px; letter-spacing:.5px; }"""
s = R(s, ANCHOR, NEW_CSS, "CSS pied DeglouFM")

# 3) Bump build
s = R(s,
  "console.log('PENC build v78 (radio: barre simplifiee + bouton navigateur retire + cache retire)');",
  "console.log('PENC build v79 (radio: pied DeglouFM plein largeur masque le badge)');",
  "Marqueur build -> v79")

assert s.count('id="radioFoot"') == 1, "Pied absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v79.")
print("Verifie : node check.js")
