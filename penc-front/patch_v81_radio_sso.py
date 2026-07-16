# -*- coding: utf-8 -*-
"""
PENC — Patch v81  (Radio : SSO — transmettre l'e-mail a DeglouFM)
Au chargement du lecteur, Penc transmet l'e-mail + le nom de l'utilisateur connecte
a l'iframe DeglouFM, de DEUX facons (fiabilite) :
  - parametre d'URL : ?penc_email=...&penc_name=...
  - postMessage a l'onload : {source:'penc', action:'auth', email, name}
Ainsi DeglouFM identifie automatiquement la personne (meme connexion que Penc).
Si l'utilisateur n'est pas connecte, rien n'est transmis (DeglouFM garde sa propre connexion).

Lancer depuis le dossier contenant messager.html :
    python patch_v81_radio_sso.py
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

print("Patch v81 — SSO e-mail vers DeglouFM")

OLD = "      fr.onload=function(){ _loaded=true; if(fb) fb.classList.remove('show'); };\n      fr.src=RADIO_URL;"
NEW = (
    "      var _u=(window.ME||{});\n"
    "      var _q=[];\n"
    "      if(_u.email) _q.push('penc_email='+encodeURIComponent(_u.email));\n"
    "      if(_u.full_name) _q.push('penc_name='+encodeURIComponent(_u.full_name));\n"
    "      var _url=RADIO_URL+(_q.length?('?'+_q.join('&')):'');\n"
    "      fr.onload=function(){\n"
    "        _loaded=true; if(fb) fb.classList.remove('show');\n"
    "        try{ if(fr.contentWindow && (_u.email||_u.full_name)){ fr.contentWindow.postMessage({source:'penc', action:'auth', email:_u.email||'', name:_u.full_name||''}, '*'); } }catch(_){}\n"
    "      };\n"
    "      fr.src=_url;"
)
s = R(s, OLD, NEW, "Transmission e-mail/nom a l'iframe")

# Bump build
s = R(s,
  "console.log('PENC build v80 (radio: bouton Rouvrir + nom station pret a l affichage)');",
  "console.log('PENC build v81 (radio: SSO e-mail Penc -> DeglouFM, connexion unique)');",
  "Marqueur build -> v81")

assert "penc_email=" in s and "action:'auth'" in s, "Transmission SSO absente !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v81.")
print("Verifie : node check.js")
