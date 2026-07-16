# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v96 (A3b-3 : vue admin des signalements)
  - bouton "Signalements" dans le panneau admin
  - modale : liste des signalements (signaleur, raison, contenu)
  - actions : Supprimer le contenu, Avertir (message Penc), Suspendre, Rejeter

    python patch_v96_admin_reports.py
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

print("Patch v96 — Vue admin signalements")

# 1) CSS
CSS = (
    '<style id="admin-reports">\n'
    '.adm-rep-card{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:10px; }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS signalements")

# 2) Bouton dans le panneau admin (apres le bouton statut officiel)
BTN_ANCHOR = 'Publier un statut officiel</button>`;'
NEW_BTN = BTN_ANCHOR + '\n  html+=`<button onclick="openAdminReports()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#DC2626;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🚩 Signalements</button>`;'
s = R(s, BTN_ANCHOR, NEW_BTN, "Bouton Signalements")

# 3) Fonctions apres closeOffStatus
CLOSE_OFF = "function closeOffStatus(){ var o=document.getElementById('offStatusOv'); if(o) o.classList.remove('show'); }"
FUNCS = r'''
function openAdminReports(){
  var ov=document.getElementById('admRepOv');
  if(!ov){ ov=document.createElement('div'); ov.id='admRepOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="max-height:92vh;display:flex;flex-direction:column;overflow-y:auto;"><div class="sheet-handle"></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">Signalements</div><div onclick="closeAdmRep()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div><div id="admRepList"><div class="spinner" style="margin:24px auto;"></div></div></div>';
  ov.classList.add('show');
  loadAdminReports();
}
function closeAdmRep(){ var o=document.getElementById('admRepOv'); if(o) o.classList.remove('show'); }
function _repBtn(bg,col){ return 'padding:8px 12px;border:none;border-radius:9px;background:'+bg+';color:'+(col||'#fff')+';font-weight:600;font-size:13px;cursor:pointer;'; }
function loadAdminReports(){
  api('/admin/reports').then(function(d){
    var box=document.getElementById('admRepList'); if(!box) return;
    var reps=(d&&d.reports)||[];
    if(!reps.length){ box.innerHTML='<div style="text-align:center;color:var(--muted);padding:24px;">Aucun signalement en attente 🎉</div>'; return; }
    box.innerHTML=reps.map(function(r){
      return '<div class="adm-rep-card" id="rep_'+r.id+'">'
        +'<div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Signalé par '+esc(r.reporter)+' · '+esc(r.reason||'')+'</div>'
        +'<div style="font-weight:700;margin-bottom:6px;">Contenu de '+esc(r.target_owner||'?')+'</div>'
        +(r.content_snapshot?'<div style="font-size:13px;color:var(--text);background:var(--card2);border-radius:8px;padding:8px;margin-bottom:8px;word-break:break-word;">'+esc(String(r.content_snapshot).slice(0,200))+'</div>':'')
        +'<div style="display:flex;flex-wrap:wrap;gap:6px;">'
        +((r.target_type==='status'&&r.target_id)?'<button onclick="repDelContent(\''+r.id+'\',\''+r.target_id+'\')" style="'+_repBtn('#DC2626')+'">🗑️ Supprimer</button>':'')
        +(r.target_user_id?'<button onclick="repWarn(\''+r.id+'\',\''+r.target_user_id+'\')" style="'+_repBtn('#E8A87C','#1a1a1a')+'">⚠️ Avertir</button>':'')
        +(r.target_user_id?'<button onclick="repSuspend(\''+r.id+'\',\''+r.target_user_id+'\')" style="'+_repBtn('#7C3AED')+'">⛔ Suspendre</button>':'')
        +'<button onclick="repDismiss(\''+r.id+'\')" style="'+_repBtn('transparent','var(--muted)')+'">Rejeter</button>'
        +'</div></div>';
    }).join('');
  }).catch(function(){});
}
function _repResolve(id,status){ api('/admin/reports/'+id+'/resolve','POST',{status:status||'resolved'}).then(function(){ var c=document.getElementById('rep_'+id); if(c) c.remove(); }).catch(function(){}); }
function repDelContent(id,sid){ if(!confirm('Supprimer ce contenu ?')) return; api('/admin/statuses/'+sid,'DELETE').then(function(){ _repResolve(id,'resolved'); showNotif('🗑️','Contenu','Supprimé','green',null); }).catch(function(){}); }
function repWarn(id,uid){ api('/admin/message/'+uid,'POST',{content:'⚠️ Avertissement officiel de Penc : un de vos contenus a été signalé et examiné. Merci de respecter les règles de la communauté. Toute récidive pourra entraîner une suspension.'}).then(function(){ _repResolve(id,'resolved'); showNotif('⚠️','Avertissement','Envoyé','green',null); }).catch(function(){}); }
function repSuspend(id,uid){ if(!confirm('Suspendre cet utilisateur ?')) return; api('/admin/suspend/'+uid,'POST',{suspend:true}).then(function(){ _repResolve(id,'resolved'); showNotif('⛔','Utilisateur','Suspendu','green',null); }).catch(function(){}); }
function repDismiss(id){ _repResolve(id,'dismissed'); showNotif('✓','Signalement','Rejeté','green',null); }
function closeOffStatus_KEEP(){}'''
s = R(s, CLOSE_OFF, CLOSE_OFF + FUNCS, "Fonctions signalements admin")

# 4) Bump build
s = R(s,
  "console.log('PENC build v95 (signalement de statut: bouton + modale de raison)');",
  "console.log('PENC build v96 (admin: vue des signalements + actions)');",
  "Marqueur build -> v96")

assert s.count('function loadAdminReports') == 1 and s.count('function repWarn') == 1, "Fonctions absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v96.")
print("Verifie : node check.js")
