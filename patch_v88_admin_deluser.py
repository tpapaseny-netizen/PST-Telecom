# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v88 (A2c : bouton supprimer utilisateur)
Ajoute dans la fiche admin d'un utilisateur un bouton rouge
"Supprimer definitivement" (avec confirmation), qui appelle
DELETE /admin/user/:id puis rafraichit le panneau.

    python patch_v88_admin_deluser.py
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

print("Patch v88 — Bouton supprimer utilisateur")

# 1) Bouton supprimer, juste avant "Statuts publiés"
STATUS = r"""    +'<div style="font-weight:700;font-size:13px;color:var(--muted);margin-bottom:6px;">Statuts publiés</div>'"""
DEL = r"""    +'<button onclick="admDeleteUser(\''+uid+'\')" style="width:100%;padding:11px;border:none;border-radius:11px;background:#DC2626;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 14px;">🗑️ Supprimer définitivement</button>'"""
s = R(s, STATUS, DEL + "\n" + STATUS, "Bouton supprimer dans la fiche")

# 2) Fonction admDeleteUser apres closeAdmUser
CLOSE = "function closeAdmUser(){ var ov=document.getElementById('admUserOv'); if(ov) ov.classList.remove('show'); }"
FUNC = """function admDeleteUser(uid){ if(!confirm('Supprimer définitivement cet utilisateur et toutes ses données ? Action irréversible.')) return; api('/admin/user/'+uid,'DELETE').then(function(r){ if(r&&r.success){ showNotif('🗑️','Supprimé','Utilisateur supprimé','green',null); closeAdmUser(); openAdmin(); } else { showNotif('❌','Erreur',(r&&r.error)||'Échec de suppression','red',null); } }).catch(function(){ showNotif('❌','Erreur','Problème réseau','red',null); }); }"""
s = R(s, CLOSE, CLOSE + "\n" + FUNC, "Fonction admDeleteUser")

# 3) Bump build
s = R(s,
  "console.log('PENC build v87 (admin: gestion users - recherche, filtres, photos)');",
  "console.log('PENC build v88 (admin: suppression utilisateur + nettoyage donnees liees)');",
  "Marqueur build -> v88")

assert s.count('function admDeleteUser') == 1, "Fonction admDeleteUser absente !"
assert 'Supprimer définitivement' in s, "Bouton supprimer absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v88.")
print("Verifie : node check.js")
