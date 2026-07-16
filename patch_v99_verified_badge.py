# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v99 (Badge bleu, Phase 1)
  - helpers _isVerifiedId / _badgeFor / loadVerifiedIds (+ Set)
  - badge bleu : liste conversations, en-tete chat, tray stories, en-tete statut
  - admin : bouton Certifier/Retirer + badge dans la fiche et la liste

    python patch_v99_verified_badge.py
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

print("Patch v99 — Badge bleu (Phase 1)")

# 1) Helpers (apres _isPenc)
ANCHOR_ISPENC = "function _isPenc(id){ return String(id||'')==='penc_official'; }"
HELPERS = ANCHOR_ISPENC + r'''
window._verifiedIds = window._verifiedIds || new Set();
function _isVerifiedId(id){ try{ return window._verifiedIds.has(String(id)); }catch(e){ return false; } }
function _badgeFor(id){ return (_isPenc(id)||_isVerifiedId(id))?_pencBadge():''; }
function loadVerifiedIds(){ api('/verified').then(function(d){ if(d&&Array.isArray(d.ids)){ window._verifiedIds=new Set(d.ids.map(String)); try{ renderConvList(); }catch(e){} try{ renderStories(); }catch(e){} } }).catch(function(){}); }'''
s = R(s, ANCHOR_ISPENC, HELPERS, "Helpers badge")

# 2) Liste conversations
s = R(s,
  "(_isPenc(conv.other_user_id)?_pencBadge():'')",
  "_badgeFor(conv.other_user_id)",
  "Badge liste conversations")

# 3) En-tete chat (openConv)
s = R(s,
  "  if(_isPenc(conv.other_user_id)){ document.getElementById('chatHdrName').innerHTML=esc(conv.name||'Penc')+_pencBadge(); } else { document.getElementById('chatHdrName').textContent=conv.name||'Conversation'; }",
  "  { var _hb=_badgeFor(conv.other_user_id); if(_hb){ document.getElementById('chatHdrName').innerHTML=esc(conv.name||(_isPenc(conv.other_user_id)?'Penc':'Conversation'))+_hb; } else { document.getElementById('chatHdrName').textContent=conv.name||'Conversation'; } }",
  "Badge en-tete chat")

# 4) Tray stories
s = R(s,
  "var badge=isOff?('<span class=\"story-badge\">'+_pencBadge()+'</span>'):'';",
  "var badge=(isOff||_isVerifiedId(o.uid))?('<span class=\"story-badge\">'+_pencBadge()+'</span>'):'';",
  "Badge tray stories")

# 5) En-tete du statut (buildSVAuthorBar)
s = R(s,
  "+'<div style=\"flex:1;min-width:0;\"><div class=\"sv-author-name\">'+esc(name)+'</div>'",
  "+'<div style=\"flex:1;min-width:0;\"><div class=\"sv-author-name\">'+esc(name)+_badgeFor(sv.user_id)+'</div>'",
  "Badge en-tete statut")

# 6) Charger les IDs verifies au demarrage (loadConvs)
s = R(s,
  "  if(typeof loadFriendRequests==='function') loadFriendRequests();",
  "  if(typeof loadFriendRequests==='function') loadFriendRequests();\n  if(typeof loadVerifiedIds==='function') loadVerifiedIds();",
  "Hook loadVerifiedIds dans loadConvs")

# 7) Badge dans la liste admin
s = R(s,
  "  if(u.is_moderator) badge+=' <span style=\"background:#00C896;color:#fff;font-size:9px;padding:1px 5px;border-radius:6px;font-weight:700;vertical-align:middle;\">MOD</span>';",
  "  if(u.is_moderator) badge+=' <span style=\"background:#00C896;color:#fff;font-size:9px;padding:1px 5px;border-radius:6px;font-weight:700;vertical-align:middle;\">MOD</span>';\n  if(u.verified) badge+=_pencBadge();",
  "Badge liste admin")

# 8) Badge dans le titre de la fiche admin
s = R(s,
  "esc(u.full_name||u.username||'')+'</div><div onclick=\"closeAdmUser()\"",
  "esc(u.full_name||u.username||'')+(u.verified?_pencBadge():'')+'</div><div onclick=\"closeAdmUser()\"",
  "Badge titre fiche admin")

# 9) Bouton Certifier (avant Supprimer)
DEL_BTN = "+'<button onclick=\"admDeleteUser(\\''+uid+'\\')\" style=\"width:100%;padding:11px;border:none;border-radius:11px;background:#DC2626;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 14px;\">🗑️ Supprimer définitivement</button>'"
VERIF_BTN = "+(u.verified?'<button onclick=\"admVerify(\\''+uid+'\\',false)\" style=\"width:100%;padding:11px;border:none;border-radius:11px;background:#1D9BF0;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 10px;\">🔵 Retirer le badge bleu</button>':'<button onclick=\"admVerify(\\''+uid+'\\',true)\" style=\"width:100%;padding:11px;border:none;border-radius:11px;background:#1D9BF0;color:#fff;font-weight:700;cursor:pointer;margin:2px 0 10px;\">🔵 Certifier (badge bleu)</button>')\n    " + DEL_BTN
s = R(s, DEL_BTN, VERIF_BTN, "Bouton Certifier")

# 10) Fonction admVerify (avant admSendDM)
ADM_SENDDM = "function admSendDM(uid){"
ADMVERIFY = r'''function admVerify(uid,val){ if(!confirm(val?'Attribuer le badge bleu à ce compte ?':'Retirer le badge bleu ?')) return; api('/admin/verify/'+uid,'POST',{verified:val,type:'admin'}).then(function(r){ if(r&&r.success){ var x=(window._admUsers||[]).find(function(z){return String(z.id)===String(uid);}); if(x) x.verified=val; window._verifiedIds=window._verifiedIds||new Set(); if(val) window._verifiedIds.add(String(uid)); else window._verifiedIds.delete(String(uid)); showNotif('🔵','Certification',val?'Badge bleu attribué':'Badge retiré','green',null); closeAdmUser(); try{renderConvList();}catch(e){} openAdmin(); } else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); }); }
'''
s = R(s, ADM_SENDDM, ADMVERIFY + ADM_SENDDM, "Fonction admVerify")

# 11) Build bump
s = R(s,
  "console.log('PENC build v98 (admin: gestion financiere)');",
  "console.log('PENC build v99 (badge bleu certifie: socle + admin)');",
  "Marqueur build -> v99")

assert s.count('function admVerify')==1 and s.count('function loadVerifiedIds')==1 and s.count('function _badgeFor')==1, "Fonctions badge absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v99.")
print("Verifie : node check.js")
