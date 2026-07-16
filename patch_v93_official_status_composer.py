# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v93 (C1 front : publier un statut officiel Penc)
  - bouton "Publier un statut officiel" dans le panneau admin
  - modale : texte + couleur de fond + Publier -> POST /admin/official-status
Le statut apparait ensuite chez tous les utilisateurs (le fil renvoie tous les statuts).

    python patch_v93_official_status_composer.py
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

print("Patch v93 — Composer statut officiel")

# 1) Bouton dans le panneau admin (apres "Statuts publiés")
BTN_ANCHOR = 'Statuts publiés</button>`;'
NEW_BTN = BTN_ANCHOR + '\n  html+=`<button onclick="openOfficialStatusComposer()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#1D9BF0;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">📢 Publier un statut officiel</button>`;'
s = R(s, BTN_ANCHOR, NEW_BTN, "Bouton statut officiel")

# 2) Fonctions composer apres closeAdmStatuses
CLOSE_ST = "function closeAdmStatuses(){ var o=document.getElementById('admStatusOv'); if(o) o.classList.remove('show'); }"
FUNCS = r'''
function openOfficialStatusComposer(){
  var ov=document.getElementById('offStatusOv');
  if(!ov){ ov=document.createElement('div'); ov.id='offStatusOv'; ov.className='overlay'; document.body.appendChild(ov); }
  var colors=['#0E8C7C','#1D9BF0','#7C3AED','#DC2626','#050D18','#E8A87C'];
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">Statut officiel Penc</div><div onclick="closeOffStatus()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div>'
    +'<textarea id="offStatusText" placeholder="Votre annonce officielle…" style="width:100%;box-sizing:border-box;min-height:90px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:15px;outline:none;resize:vertical;"></textarea>'
    +'<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;">'+colors.map(function(c){ return '<div onclick="_offBg(\''+c+'\',this)" data-c="'+c+'" style="width:34px;height:34px;border-radius:50%;background:'+c+';cursor:pointer;border:2px solid transparent;"></div>'; }).join('')+'</div>'
    +'<button onclick="sendOfficialStatus()" style="width:100%;padding:12px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;">📢 Publier pour tous</button></div>';
  ov.classList.add('show');
  window._offBgColor='#0E8C7C';
  setTimeout(function(){ var f=ov.querySelector('[data-c="#0E8C7C"]'); if(f) f.style.borderColor='#fff'; },0);
}
function closeOffStatus(){ var o=document.getElementById('offStatusOv'); if(o) o.classList.remove('show'); }
function _offBg(c,el){ window._offBgColor=c; var p=el.parentNode; if(p) p.querySelectorAll('[data-c]').forEach(function(x){ x.style.borderColor='transparent'; }); el.style.borderColor='#fff'; }
function sendOfficialStatus(){
  var ta=document.getElementById('offStatusText'); var t=((ta&&ta.value)||'').trim();
  if(!t){ showNotif('⚠️','Statut','Le texte est vide','orange',null); return; }
  api('/admin/official-status','POST',{type:'text',text_content:t,bg_color:window._offBgColor||'#0E8C7C'}).then(function(r){
    if(r&&r.success){ showNotif('📢','Statut officiel','Publié pour tous','green',null); closeOffStatus(); if(typeof loadStatuses==='function') loadStatuses(); }
    else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null);
  }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); });
}'''
s = R(s, CLOSE_ST, CLOSE_ST + FUNCS, "Fonctions composer officiel")

# 3) Bump build
s = R(s,
  "console.log('PENC build v92 (compte officiel Penc: badge verifie + lecture seule)');",
  "console.log('PENC build v93 (admin: publier un statut officiel Penc)');",
  "Marqueur build -> v93")

assert s.count('function sendOfficialStatus') == 1 and s.count('function openOfficialStatusComposer') == 1, "Fonctions absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v93.")
print("Verifie : node check.js")
