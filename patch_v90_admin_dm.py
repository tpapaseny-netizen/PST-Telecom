# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v90 (A2e : message direct depuis l'admin)
  - champ + bouton "Envoyer" dans la fiche utilisateur
  - fonction admSendDM(uid) -> POST /admin/message/:userId
Le message arrive en temps reel + notification push chez l'utilisateur.

    python patch_v90_admin_dm.py
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

print("Patch v90 — Message direct admin")

# 1) Composer DM avant le bouton moderateur
MOD_BTN = r"""    +(u.is_moderator?'<button onclick="admModerator(\''+uid+'\',false)" style="width:100%;padding:11px;border:none;border-radius:11px;background:#E8A87C;color:#1a1a1a;font-weight:700;cursor:pointer;margin:2px 0 10px;">⭐ Retirer modérateur</button>':'<button onclick="admModerator(\''+uid+'\',true)" style="width:100%;padding:11px;border:none;border-radius:11px;background:#00C896;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 10px;">⭐ Promouvoir modérateur</button>')"""
DM = r"""    +'<div style="margin:10px 0 12px;display:flex;gap:6px;"><input id="admDmInput" placeholder="💬 Message direct…" style="flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;font-size:14px;"/><button onclick="admSendDM(\''+uid+'\')" style="padding:10px 16px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;">Envoyer</button></div>'"""
s = R(s, MOD_BTN, DM + "\n" + MOD_BTN, "Composer DM dans la fiche")

# 2) Fonction admSendDM apres admModerator
MOD_FUNC = """function admModerator(uid,val){ if(!confirm(val?'Promouvoir cet utilisateur modérateur ?':'Retirer le rôle modérateur ?')) return; api('/admin/moderator/'+uid,'POST',{moderator:val}).then(function(r){ if(r&&r.success){ var x=(window._admUsers||[]).find(function(z){return String(z.id)===String(uid);}); if(x) x.is_moderator=val; showNotif('⭐','Modérateur',val?'Promu modérateur':'Rôle retiré','green',null); closeAdmUser(); openAdmin(); } else { showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); } }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); }); }"""
DM_FUNC = """function admSendDM(uid){ var inp=document.getElementById('admDmInput'); if(!inp) return; var txt=(inp.value||'').trim(); if(!txt) return; inp.disabled=true; api('/admin/message/'+uid,'POST',{content:txt}).then(function(r){ inp.disabled=false; if(r&&r.success){ inp.value=''; showNotif('💬','Message','Message envoyé','green',null); } else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); }).catch(function(){ inp.disabled=false; showNotif('❌','Erreur','Réseau','red',null); }); }"""
s = R(s, MOD_FUNC, MOD_FUNC + "\n" + DM_FUNC, "Fonction admSendDM")

# 3) Bump build
s = R(s,
  "console.log('PENC build v89 (admin: promouvoir/retirer moderateur + badge MOD)');",
  "console.log('PENC build v90 (admin: message direct depuis le panneau - temps reel + push)');",
  "Marqueur build -> v90")

assert s.count('function admSendDM') == 1 and 'id="admDmInput"' in s, "Composer/fonction DM absents !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v90.")
print("Verifie : node check.js")
