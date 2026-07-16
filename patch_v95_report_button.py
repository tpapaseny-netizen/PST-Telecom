# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v95 (A3b-2 : bouton Signaler sur les statuts)
  - drapeau "Signaler" dans l'en-tete du lecteur de statut (sauf le mien / sauf Penc)
  - petite modale de raison -> POST /report

    python patch_v95_report_button.py
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

print("Patch v95 — Bouton Signaler")

# 1) Bouton drapeau dans buildSVAuthorBar
OLD = r"""  return '<div class="sv-author-bar">'
    +'<div class="sv-author-av-sm">'+av+'</div>'
    +'<div><div class="sv-author-name">'+esc(name)+'</div>'
    +(ago?'<div class="sv-author-time">'+ago+'</div>':'')+'</div>'
    +'</div>';"""
NEW = r"""  return '<div class="sv-author-bar">'
    +'<div class="sv-author-av-sm">'+av+'</div>'
    +'<div style="flex:1;min-width:0;"><div class="sv-author-name">'+esc(name)+'</div>'
    +(ago?'<div class="sv-author-time">'+ago+'</div>':'')+'</div>'
    +((!isMine && !_isPenc(sv.user_id))?'<button onclick="reportStatus(\''+sv.id+'\',\''+sv.user_id+'\')" style="background:none;border:none;color:rgba(255,255,255,.85);cursor:pointer;padding:6px 8px;font-size:17px;line-height:1;" title="Signaler">\u2691</button>':'')
    +'</div>';"""
s = R(s, OLD, NEW, "Bouton drapeau dans l'en-tete")

# 2) Fonctions report avant timeSince
FUNCS = r'''function reportStatus(sid,uid){
  window._repTarget={sid:sid,uid:uid};
  var ov=document.getElementById('repOv');
  if(!ov){ ov=document.createElement('div'); ov.id='repOv'; ov.className='overlay'; document.body.appendChild(ov); }
  var reasons=['Contenu inapproprié','Spam','Harcèlement','Fausse information','Violence','Autre'];
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Signaler ce statut</div>'
    +'<div style="color:var(--muted);font-size:13px;margin-bottom:12px;">Pourquoi signales-tu ce contenu ?</div>'
    +reasons.map(function(r){ return '<button onclick="_doReport(\''+r+'\')" style="width:100%;text-align:left;padding:13px;margin-bottom:8px;border:1px solid var(--border);border-radius:11px;background:var(--card2);color:var(--text);font-size:14px;cursor:pointer;">'+r+'</button>'; }).join('')
    +'<button onclick="closeRep()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:2px;">Annuler</button></div>';
  ov.classList.add('show');
}
function closeRep(){ var o=document.getElementById('repOv'); if(o) o.classList.remove('show'); }
function _doReport(reason){
  var t=window._repTarget||{}; closeRep();
  api('/report','POST',{target_type:'status',target_id:t.sid,target_user_id:t.uid,reason:reason}).then(function(r){
    if(r&&r.success) showNotif('🚩','Signalement','Merci, signalement reçu','green',null);
    else showNotif('❌','Erreur','Échec','red',null);
  }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); });
}
function timeSince(dt){'''
s = R(s, "function timeSince(dt){", FUNCS, "Fonctions report")

# 3) Bump build
s = R(s,
  "console.log('PENC build v94 (statuts officiels Penc epingles en tete + badge)');",
  "console.log('PENC build v95 (signalement de statut: bouton + modale de raison)');",
  "Marqueur build -> v95")

assert s.count('function reportStatus') == 1 and s.count('function _doReport') == 1, "Fonctions report absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v95.")
print("Verifie : node check.js")
