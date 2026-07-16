# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v91 (A3a : galerie des statuts publies)
  - bouton "Statuts publies" dans le panneau admin
  - modale galerie : miniatures (image/video/texte) + proprietaire + vues
  - bouton supprimer sur chaque statut
S'appuie sur GET /admin/statuses + DELETE /admin/statuses/:id (existants).

    python patch_v91_admin_statuses.py
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

print("Patch v91 — Galerie statuts admin")

# 1) CSS
CSS = (
    '<style id="admin-statuses">\n'
    '.adm-st-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }\n'
    '.adm-st-cell{ position:relative; aspect-ratio:9/16; border-radius:10px; overflow:hidden; background:var(--card2); }\n'
    '.adm-st-cell img,.adm-st-cell video{ width:100%; height:100%; object-fit:cover; display:block; }\n'
    '.adm-st-text{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; padding:8px; color:#fff; font-size:11px; text-align:center; word-break:break-word; }\n'
    '.adm-st-play{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#fff; font-size:22px; text-shadow:0 1px 5px rgba(0,0,0,.7); pointer-events:none; }\n'
    '.adm-st-meta{ position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.78)); color:#fff; font-size:9px; padding:12px 5px 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }\n'
    '.adm-st-del{ position:absolute; top:5px; right:5px; background:rgba(220,38,38,.92); border:none; border-radius:7px; padding:3px 7px; font-size:12px; cursor:pointer; line-height:1; }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS galerie statuts")

# 2) Bouton dans le panneau admin (apres "Gérer les sondages")
POLLS_END = 'Gérer les sondages</button>`;'
STATUS_BTN = POLLS_END + '\n  html+=`<button onclick="openAdminStatuses()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#7C3AED;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">📷 Statuts publiés</button>`;'
s = R(s, POLLS_END, STATUS_BTN, "Bouton Statuts publiés")

# 3) Fonctions apres closeAdmPolls
CLOSE_POLLS = "function closeAdmPolls(){ var o=document.getElementById('admPollsOv'); if(o) o.classList.remove('show'); }"
FUNCS = r'''
function openAdminStatuses(){
  var ov=document.getElementById('admStatusOv');
  if(!ov){ ov=document.createElement('div'); ov.id='admStatusOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="max-height:92vh;display:flex;flex-direction:column;overflow-y:auto;"><div class="sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">Statuts publiés</div><div onclick="closeAdmStatuses()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div>'
    +'<div id="admStatusGrid"><div class="spinner" style="margin:24px auto;"></div></div></div>';
  ov.classList.add('show');
  loadAdminStatuses();
}
function closeAdmStatuses(){ var o=document.getElementById('admStatusOv'); if(o) o.classList.remove('show'); }
function loadAdminStatuses(){
  api('/admin/statuses').then(function(d){
    var box=document.getElementById('admStatusGrid'); if(!box) return;
    var st=(d&&d.statuses)||[];
    if(!st.length){ box.innerHTML='<div style="text-align:center;color:var(--muted);padding:24px;">Aucun statut publié.</div>'; return; }
    box.innerHTML='<div class="adm-st-grid">'+st.map(function(s){
      var inner;
      if(s.type==='image'&&s.media_url) inner='<img src="'+s.media_url+'" alt=""/>';
      else if(s.type==='video'&&s.media_url) inner='<video src="'+s.media_url+'" muted></video><div class="adm-st-play">▶</div>';
      else inner='<div class="adm-st-text" style="background:'+(s.bg_color||'#222')+';">'+esc((s.text_content||s.caption||'').slice(0,60))+'</div>';
      return '<div class="adm-st-cell" id="stc_'+s.id+'">'+inner
        +'<div class="adm-st-meta">'+esc(s.owner||'')+' · '+(s.views||0)+' 👁</div>'
        +'<button class="adm-st-del" onclick="admDelStatusCell(\''+s.id+'\')">🗑️</button></div>';
    }).join('')+'</div>';
  }).catch(function(){});
}
function admDelStatusCell(sid){
  if(!confirm('Supprimer ce statut ?')) return;
  api('/admin/statuses/'+sid,'DELETE').then(function(r){
    if(r&&r.success){ var c=document.getElementById('stc_'+sid); if(c) c.remove(); showNotif('🗑️','Statut','Supprimé','green',null); }
    else showNotif('❌','Erreur','Échec','red',null);
  }).catch(function(){});
}'''
s = R(s, CLOSE_POLLS, CLOSE_POLLS + FUNCS, "Fonctions galerie statuts")

# 4) Bump build
s = R(s,
  "console.log('PENC build v90 (admin: message direct depuis le panneau - temps reel + push)');",
  "console.log('PENC build v91 (admin: galerie des statuts publies + suppression)');",
  "Marqueur build -> v91")

assert s.count('function openAdminStatuses') == 1 and s.count('function loadAdminStatuses') == 1, "Fonctions absentes !"
assert 'Statuts publiés</button>' in s, "Bouton absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v91.")
print("Verifie : node check.js")
