# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v86 (A1 Dashboard Analytics, cote front)
Ajoute dans le panneau admin :
  - 3 cartes temps reel : en ligne, messages aujourd'hui, revenus pub du mois
  - 4 graphiques en courbes (SVG, sans librairie) : inscriptions, messages, statuts, vues / jour (30j)
Charge via GET /admin/analytics (ajoute cote serveur). Aucune autre fonctionnalite touchee.

    python patch_v86_admin_analytics.py
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

print("Patch v86 — Admin Analytics (front)")

# 1) CSS
CSS = (
    '<style id="admin-analytics">\n'
    '.adm-ana-rt{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:10px 0 12px; }\n'
    '.adm-rt{ background:var(--card2); border-radius:12px; padding:12px 8px; text-align:center; }\n'
    '.adm-rt b{ display:block; font-size:21px; font-weight:800; color:var(--accent); line-height:1.1; }\n'
    '.adm-rt span{ font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }\n'
    '.adm-rt.live b{ color:#22C55E; }\n'
    '.adm-chart{ background:var(--card); border:1px solid var(--border); border-radius:12px; padding:10px 12px; margin-bottom:9px; }\n'
    '.adm-chart-hd{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }\n'
    '.adm-chart-hd b{ font-size:13px; }\n'
    '.adm-chart-hd span{ font-size:11px; color:var(--muted); }\n'
    '.adm-chart svg{ width:100%; height:48px; display:block; }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS analytics")

# 2) Placeholder dans renderAdmin (apres la ligne des stats)
STATS = '  html+=`<div class="adm-stats"><div class="adm-st"><b>${s.users||0}</b><span>USERS</span></div><div class="adm-st"><b>${s.total_valid_views||0}</b><span>VUES</span></div><div class="adm-st"><b>${s.statuses||0}</b><span>STATUTS</span></div><div class="adm-st"><b>${s.messages||0}</b><span>MSGS</span></div></div>`;'
PLACE = STATS + '\n  html+=\'<div id="admAnalytics" style="margin:6px 0 4px;"><div class="spinner" style="margin:14px auto;"></div></div>\';'
s = R(s, STATS, PLACE, "Placeholder analytics dans renderAdmin")

# 3) Appel + fonctions (avant adminApprove)
FUNCS = r'''  b.innerHTML=html;
  try{ loadAdminAnalytics(); }catch(_){}
}
function _admChart(title, data, color){
  data = data || []; var n = data.length || 1; var max = 1;
  data.forEach(function(p){ if((p.count||0)>max) max=p.count; });
  var total = data.reduce(function(a,p){ return a+(p.count||0); }, 0);
  var W=300, H=60, pad=5;
  var pts = data.map(function(p,i){ var x = n>1 ? (i/(n-1))*W : 0; var y = H-pad-((p.count||0)/max)*(H-2*pad); return [x,y]; });
  var line = pts.map(function(pt,i){ return (i?'L':'M')+pt[0].toFixed(1)+' '+pt[1].toFixed(1); }).join(' ');
  var area = line+' L'+W+' '+H+' L0 '+H+' Z';
  var last = data.length ? (data[data.length-1].count||0) : 0;
  return '<div class="adm-chart"><div class="adm-chart-hd"><b>'+esc(title)+'</b><span>'+total+' total \u00b7 '+last+' aujourd\'hui</span></div>'
    +'<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><path d="'+area+'" fill="'+color+'" opacity="0.13"/><path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg></div>';
}
function loadAdminAnalytics(){
  var box=document.getElementById('admAnalytics'); if(!box) return;
  api('/admin/analytics').then(function(d){
    if(!d || d.error){ box.innerHTML=''; return; }
    var rt=d.realtime||{}, se=d.series||{};
    var h='<div class="adm-ana-rt">'
      +'<div class="adm-rt live"><b>'+(rt.online||0)+'</b><span>En ligne</span></div>'
      +'<div class="adm-rt"><b>'+(rt.messages_today||0)+'</b><span>Msgs aujourd\'hui</span></div>'
      +'<div class="adm-rt"><b>'+(rt.ad_revenue_month||0)+' F</b><span>Revenus pub (mois)</span></div>'
      +'</div>';
    h+=_admChart('Inscriptions / jour', se.signups, '#00C896');
    h+=_admChart('Messages / jour', se.messages, '#3B82F6');
    h+=_admChart('Statuts / jour', se.statuses, '#A855F7');
    h+=_admChart('Vues mon\u00e9tis\u00e9es / jour', se.views, '#F59E0B');
    box.innerHTML=h;
  }).catch(function(){ box.innerHTML=''; });
}
function adminApprove(uid){'''
OLD_CLOSE = "  b.innerHTML=html;\n}\nfunction adminApprove(uid){"
s = R(s, OLD_CLOSE, FUNCS, "Fonctions analytics + appel")

# 4) Bump build
s = R(s,
  "console.log('PENC build v85 (icones premium audio/texte dans la liste de conversations)');",
  "console.log('PENC build v86 (admin: dashboard analytics - cartes temps reel + courbes 30j)');",
  "Marqueur build -> v86")

assert s.count('function loadAdminAnalytics') == 1 and s.count('function _admChart') == 1, "Fonctions absentes !"
assert s.count('id="admAnalytics"') == 1, "Placeholder absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v86.")
print("Verifie : node check.js")
