# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v87 (A2a : gestion utilisateurs - recherche + filtres + photos)
Dans le panneau admin, section Utilisateurs :
  - barre de recherche (nom / @username / email / telephone)
  - filtres : Tous, Actifs (vus < 7j), Inactifs, Suspendus, Nouveaux (aujourd'hui)
  - photo de profil affichee dans chaque ligne
La liste est re-rendue dynamiquement (donnees deja chargees via /admin/overview).
N'affecte aucune autre fonctionnalite.

    python patch_v87_admin_users.py
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

print("Patch v87 — Admin Users (recherche + filtres + photos)")

# 1) CSS
CSS = (
    '<style id="admin-users-search">\n'
    '.adm-search{ width:100%; box-sizing:border-box; padding:11px 13px; border-radius:11px; border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:14px; outline:none; margin:4px 0 8px; }\n'
    '.adm-search:focus{ border-color:var(--accent); }\n'
    '.adm-filters{ display:flex; gap:7px; overflow-x:auto; padding-bottom:4px; margin-bottom:8px; -webkit-overflow-scrolling:touch; }\n'
    '.adm-filters::-webkit-scrollbar{ display:none; }\n'
    '.adm-chip{ flex:none; padding:7px 14px; border-radius:20px; border:1px solid var(--border); background:transparent; color:var(--muted); font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }\n'
    '.adm-chip.active{ background:var(--accent); color:#fff; border-color:var(--accent); }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS recherche/filtres")

# 2) Remplacer le bloc liste utilisateurs par l'UI recherche + conteneur
OLD_BLOCK = """  window._admUsers=d.users||[];
  html+=`<div class="adm-sec">👥 Utilisateurs (${(d.users||[]).length}) — touchez pour modérer</div>`;
  (d.users||[]).slice(0,500).forEach(function(u){
    var th=Math.floor((u.total_time_seconds||0)/3600); var tm=Math.floor(((u.total_time_seconds||0)%3600)/60);
    var geo=(u.geo&&u.geo.city)?(esc(u.geo.city)+', '+esc(u.geo.country)):'Position inconnue';
    var badge=''; if(u.suspended) badge=' <span style="color:#FF4D6A;font-weight:700;">⛔</span>'; else if(u.muted_until && new Date(u.muted_until)>new Date()) badge=' <span style="color:#E8A87C;font-weight:700;">🔇</span>';
    html+=`<div class="adm-row" style="cursor:pointer;" onclick="openAdminUser('${u.id}')"><div class="adm-row-i"><b>${esc(u.full_name||u.username||'')}${badge}</b><span>@${esc(u.username||'')} · ${u.valid_views} vues · ${u.contacts} contacts · ${u.balance} F</span><span style="color:var(--text);">${esc(u.phone||'-')} · ${esc(u.email||'-')} · ${geo}</span><span>${th}h ${tm}min dans l'app</span></div><span style="color:var(--muted);font-size:18px;">›</span></div>`;
  });
  b.innerHTML=html;"""
NEW_BLOCK = (
    "  window._admUsers=d.users||[];\n"
    "  window._admUserFilter='all';\n"
    "  html+=`<div class=\"adm-sec\">\U0001F465 Utilisateurs (${(d.users||[]).length})</div>`;\n"
    "  html+='<input id=\"admSearch\" class=\"adm-search\" placeholder=\"\U0001F50D Rechercher nom, email, t\u00e9l\u00e9phone\u2026\" oninput=\"_renderAdmUsers()\"/>';\n"
    "  html+='<div class=\"adm-filters\">'\n"
    "    +'<button class=\"adm-chip active\" data-f=\"all\" onclick=\"_admFilter(this)\">Tous</button>'\n"
    "    +'<button class=\"adm-chip\" data-f=\"active\" onclick=\"_admFilter(this)\">Actifs</button>'\n"
    "    +'<button class=\"adm-chip\" data-f=\"inactive\" onclick=\"_admFilter(this)\">Inactifs</button>'\n"
    "    +'<button class=\"adm-chip\" data-f=\"suspended\" onclick=\"_admFilter(this)\">Suspendus</button>'\n"
    "    +'<button class=\"adm-chip\" data-f=\"new\" onclick=\"_admFilter(this)\">Nouveaux</button>'\n"
    "    +'</div>';\n"
    "  html+='<div id=\"admUserList\"></div>';\n"
    "  b.innerHTML=html;"
)
s = R(s, OLD_BLOCK, NEW_BLOCK, "UI recherche/filtres dans renderAdmin")

# 3) Appel _renderAdmUsers apres le rendu
s = R(s,
  "  try{ loadAdminAnalytics(); }catch(_){}\n}",
  "  try{ loadAdminAnalytics(); }catch(_){}\n  try{ _renderAdmUsers(); }catch(_){}\n}",
  "Appel _renderAdmUsers")

# 4) Fonctions (avant adminApprove)
FUNCS = r'''function _admUserRow(u){
  var th=Math.floor((u.total_time_seconds||0)/3600); var tm=Math.floor(((u.total_time_seconds||0)%3600)/60);
  var geo=(u.geo&&u.geo.city)?(esc(u.geo.city)+', '+esc(u.geo.country)):'Position inconnue';
  var badge=''; if(u.suspended) badge=' <span style="color:#FF4D6A;font-weight:700;">\u26d4</span>'; else if(u.muted_until && new Date(u.muted_until)>new Date()) badge=' <span style="color:#E8A87C;font-weight:700;">\ud83d\udd07</span>';
  var av=u.avatar_url?('<img src="'+u.avatar_url+'" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;"/>'):('<div style="width:40px;height:40px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-weight:700;flex:none;font-size:14px;">'+esc(initials(u.full_name||u.username||'?'))+'</div>');
  var msgs=(u.msgs_sent!=null)?(u.msgs_sent+' msgs \u00b7 '):'';
  return '<div class="adm-row" style="cursor:pointer;align-items:center;gap:10px;" onclick="openAdminUser(\''+u.id+'\')">'+av
    +'<div class="adm-row-i" style="flex:1;min-width:0;"><b>'+esc(u.full_name||u.username||'')+badge+'</b>'
    +'<span>@'+esc(u.username||'')+' \u00b7 '+u.contacts+' contacts \u00b7 '+msgs+u.balance+' F</span>'
    +'<span style="color:var(--text);">'+esc(u.phone||'-')+' \u00b7 '+esc(u.email||'-')+'</span>'
    +'<span>'+th+'h '+tm+'min \u00b7 '+geo+'</span></div>'
    +'<span style="color:var(--muted);font-size:18px;">\u203a</span></div>';
}
function _admFilter(btn){
  window._admUserFilter=btn.getAttribute('data-f');
  var p=btn.parentNode; if(p){ var cs=p.querySelectorAll('.adm-chip'); for(var i=0;i<cs.length;i++) cs[i].classList.remove('active'); }
  btn.classList.add('active'); _renderAdmUsers();
}
function _renderAdmUsers(){
  var box=document.getElementById('admUserList'); if(!box) return;
  var si=document.getElementById('admSearch'); var q=((si&&si.value)||'').trim().toLowerCase();
  var f=window._admUserFilter||'all';
  var now=Date.now(), dayMs=86400000;
  var t0=new Date(); t0.setHours(0,0,0,0); t0=t0.getTime();
  var list=(window._admUsers||[]).filter(function(u){
    if(q){ var hay=((u.full_name||'')+' '+(u.username||'')+' '+(u.email||'')+' '+(u.phone||'')).toLowerCase(); if(hay.indexOf(q)===-1) return false; }
    var ls=u.last_seen?new Date(u.last_seen).getTime():0;
    var active=!!ls && (now-ls)<7*dayMs;
    if(f==='active' && !active) return false;
    if(f==='inactive' && active) return false;
    if(f==='suspended' && !u.suspended) return false;
    if(f==='new'){ var cr=u.created_at?new Date(u.created_at).getTime():0; if(!(cr>=t0)) return false; }
    return true;
  });
  if(!list.length){ box.innerHTML='<div class="adm-empty">Aucun utilisateur</div>'; return; }
  box.innerHTML='<div style="font-size:11px;color:var(--muted);margin:2px 0 7px;">'+list.length+' resultat(s)</div>'+list.slice(0,500).map(_admUserRow).join('');
}
function adminApprove(uid){'''
s = R(s, "function adminApprove(uid){", FUNCS, "Fonctions recherche/filtres")

# 5) Bump build
s = R(s,
  "console.log('PENC build v86 (admin: dashboard analytics - cartes temps reel + courbes 30j)');",
  "console.log('PENC build v87 (admin: gestion users - recherche, filtres, photos)');",
  "Marqueur build -> v87")

assert s.count('function _renderAdmUsers') == 1 and s.count('function _admUserRow') == 1, "Fonctions absentes !"
assert s.count('id="admUserList"') == 1 and s.count('id="admSearch"') == 1, "UI absente !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v87.")
print("Verifie : node check.js")
