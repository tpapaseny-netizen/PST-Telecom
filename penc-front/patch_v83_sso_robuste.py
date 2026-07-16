# -*- coding: utf-8 -*-
"""
PENC — Patch v83  (Radio : envoi SSO plus robuste)
Renvoie l'identite (email, nom, username, id) a DeglouFM PLUSIEURS fois apres le
chargement de l'iframe (au cas ou l'app DeglouFM attache son listener en retard),
pendant ~6s. Garde aussi le parametre d'URL penc_email.

Lancer depuis le dossier contenant messager.html :
    python patch_v83_sso_robuste.py
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

print("Patch v83 — Envoi SSO robuste")

OLD = """      fr.onload=function(){
        _loaded=true; if(fb) fb.classList.remove('show');
        try{ if(fr.contentWindow && (_u.email||_u.full_name)){ fr.contentWindow.postMessage({source:'penc', action:'auth', email:_u.email||'', name:_u.full_name||''}, '*'); } }catch(_){}
      };"""
NEW = """      fr.onload=function(){
        _loaded=true; if(fb) fb.classList.remove('show');
        if(_u.email||_u.full_name||_u.username){
          var _auth={source:'penc', action:'auth', email:_u.email||'', name:_u.full_name||'', username:_u.username||'', id:(_u.id!=null?String(_u.id):'')};
          var _send=function(){ try{ if(fr.contentWindow) fr.contentWindow.postMessage(_auth, '*'); }catch(_){} };
          _send();
          var _t=0, _iv=setInterval(function(){ _t++; _send(); if(_t>=8) clearInterval(_iv); }, 700);
        }
      };"""
s = R(s, OLD, NEW, "Envoi auth repete (robuste)")

# Bump build
s = R(s,
  "console.log('PENC build v82 (radio: play/pause actif via pont DeglouFM)');",
  "console.log('PENC build v83 (radio: SSO robuste - envoi identite repete a DeglouFM)');",
  "Marqueur build -> v83")

assert "action:'auth'" in s and "_iv=setInterval" in s, "Envoi robuste absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v83.")
print("Verifie : node check.js")
