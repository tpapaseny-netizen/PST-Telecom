# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v89 (A2d : promouvoir / retirer moderateur)
  - bouton "Promouvoir moderateur" / "Retirer moderateur" dans la fiche utilisateur
  - fonction admModerator(uid,val) -> POST /admin/moderator/:userId
  - badge "MOD" (teal) dans la liste des utilisateurs

    python patch_v89_admin_moderator.py
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

print("Patch v89 — Moderateur")

# 1) Bouton moderateur avant le bouton supprimer
DEL_LINE = r"""    +'<button onclick="admDeleteUser(\''+uid+'\')" style="width:100%;padding:11px;border:none;border-radius:11px;background:#DC2626;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 14px;">🗑️ Supprimer définitivement</button>'"""
MOD_BTN = r"""    +(u.is_moderator?'<button onclick="admModerator(\''+uid+'\',false)" style="width:100%;padding:11px;border:none;border-radius:11px;background:#E8A87C;color:#1a1a1a;font-weight:700;cursor:pointer;margin:2px 0 10px;">⭐ Retirer modérateur</button>':'<button onclick="admModerator(\''+uid+'\',true)" style="width:100%;padding:11px;border:none;border-radius:11px;background:#00C896;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 10px;">⭐ Promouvoir modérateur</button>')"""
s = R(s, DEL_LINE, MOD_BTN + "\n" + DEL_LINE, "Bouton moderateur dans la fiche")

# 2) Fonction admModerator apres admDeleteUser
DEL_FUNC = """function admDeleteUser(uid){ if(!confirm('Supprimer définitivement cet utilisateur et toutes ses données ? Action irréversible.')) return; api('/admin/user/'+uid,'DELETE').then(function(r){ if(r&&r.success){ showNotif('🗑️','Supprimé','Utilisateur supprimé','green',null); closeAdmUser(); openAdmin(); } else { showNotif('❌','Erreur',(r&&r.error)||'Échec de suppression','red',null); } }).catch(function(){ showNotif('❌','Erreur','Problème réseau','red',null); }); }"""
MOD_FUNC = """function admModerator(uid,val){ if(!confirm(val?'Promouvoir cet utilisateur modérateur ?':'Retirer le rôle modérateur ?')) return; api('/admin/moderator/'+uid,'POST',{moderator:val}).then(function(r){ if(r&&r.success){ var x=(window._admUsers||[]).find(function(z){return String(z.id)===String(uid);}); if(x) x.is_moderator=val; showNotif('⭐','Modérateur',val?'Promu modérateur':'Rôle retiré','green',null); closeAdmUser(); openAdmin(); } else { showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); } }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); }); }"""
s = R(s, DEL_FUNC, DEL_FUNC + "\n" + MOD_FUNC, "Fonction admModerator")

# 3) Badge MOD dans la liste (ancre : ligne var msgs, unique a _admUserRow)
MSG_ANCHOR = "  var msgs=(u.msgs_sent!=null)?(u.msgs_sent+'"
MOD_BADGE = '  if(u.is_moderator) badge+=\' <span style="background:#00C896;color:#fff;font-size:9px;padding:1px 5px;border-radius:6px;font-weight:700;vertical-align:middle;">MOD</span>\';\n' + MSG_ANCHOR
s = R(s, MSG_ANCHOR, MOD_BADGE, "Badge MOD dans la liste")

# 4) Bump build
s = R(s,
  "console.log('PENC build v88 (admin: suppression utilisateur + nettoyage donnees liees)');",
  "console.log('PENC build v89 (admin: promouvoir/retirer moderateur + badge MOD)');",
  "Marqueur build -> v89")

assert s.count('function admModerator') == 1, "Fonction admModerator absente !"
assert 'Promouvoir modérateur' in s and '>MOD</span>' in s, "Bouton/badge moderateur absents !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v89.")
print("Verifie : node check.js")
