# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v98 (A4 : panneau Finances admin)
  - bouton "Finances" dans le panneau admin
  - cartes revenus (total / part createurs / part Penc / ce mois)
  - evolution 6 mois (barres)
  - demandes de retrait en attente -> Valider / Rejeter (telephone + montant)
  - top createurs + historique des paiements

    python patch_v98_admin_finance.py
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

print("Patch v98 — Panneau Finances admin")

# 1) CSS
CSS = (
    '<style id="admin-finance">\n'
    '.fin-grid{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:6px; }\n'
    '.fin-card{ background:var(--card2); border:1px solid var(--border); border-radius:12px; padding:12px; }\n'
    '.fin-card-v{ font-size:18px; font-weight:800; line-height:1.1; word-break:break-word; }\n'
    '.fin-card-l{ font-size:11px; color:var(--muted); margin-top:3px; }\n'
    '.fin-sec-t{ font-weight:700; font-size:14px; margin:16px 0 8px; }\n'
    '.fin-bars{ display:flex; align-items:flex-end; gap:8px; height:120px; padding:6px 0; }\n'
    '.fin-bar-col{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; }\n'
    '.fin-bar{ width:68%; background:linear-gradient(180deg,#00C896,#00876a); border-radius:6px 6px 0 0; min-height:4px; }\n'
    '.fin-bar-lbl{ font-size:10px; color:var(--muted); margin-top:5px; }\n'
    '.fin-wd{ display:flex; align-items:center; gap:8px; background:var(--card); border:1px solid var(--border); border-radius:11px; padding:10px; margin-bottom:8px; }\n'
    '.fin-row{ display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--border); }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS finances")

# 2) Bouton dans le panneau admin (apres Signalements)
BTN_ANCHOR = '🚩 Signalements</button>`;'
NEW_BTN = BTN_ANCHOR + '\n  html+=`<button onclick="openAdminFinance()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#00C896;color:#04150f;font-weight:700;cursor:pointer;margin:0 0 10px;">💰 Finances</button>`;'
s = R(s, BTN_ANCHOR, NEW_BTN, "Bouton Finances")

# 3) Fonctions (apres closeOffStatus_KEEP)
ANCHOR = "function closeOffStatus_KEEP(){}"
FUNCS = r'''
function _fcfa(n){ n=n||0; try{ return n.toLocaleString('fr-FR')+' F'; }catch(e){ return n+' F'; } }
function _finCard(label,val,col){ return '<div class="fin-card"><div class="fin-card-v" style="color:'+col+';">'+val+'</div><div class="fin-card-l">'+label+'</div></div>'; }
function openAdminFinance(){
  var ov=document.getElementById('admFinOv');
  if(!ov){ ov=document.createElement('div'); ov.id='admFinOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="max-height:94vh;display:flex;flex-direction:column;overflow-y:auto;"><div class="sheet-handle"></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">💰 Finances</div><div onclick="closeAdmFin()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div><div id="admFinBody"><div class="spinner" style="margin:30px auto;"></div></div></div>';
  ov.classList.add('show'); loadAdminFinance();
}
function closeAdmFin(){ var o=document.getElementById('admFinOv'); if(o) o.classList.remove('show'); }
function loadAdminFinance(){
  api('/admin/finance').then(function(d){
    var box=document.getElementById('admFinBody'); if(!box||!d) return;
    var at=d.allTime||{}, mo=d.month||{}, months=d.months||[], tops=d.topCreators||[], pend=d.pendingWithdrawals||[], paid=d.paidHistory||[];
    var html='<div class="fin-grid">'
      +_finCard('Revenus totaux', _fcfa(at.total), '#00C896')
      +_finCard('Part créateurs', _fcfa(at.creators), '#E8A87C')
      +_finCard('Part Penc', _fcfa(at.penc), '#1D9BF0')
      +_finCard('Ce mois', _fcfa(mo.total), '#7C3AED')
      +'</div>';
    html+='<div style="font-size:12px;color:var(--muted);margin-top:6px;">Réserve : '+_fcfa(at.reserve)+' · Total déjà versé : '+_fcfa(d.totalPaidOut)+'</div>';
    if(months.length){
      var mx=Math.max.apply(null,months.map(function(m){return m.total||0;}))||1;
      html+='<div class="fin-sec-t">Évolution (6 mois)</div><div class="fin-bars">'
        +months.map(function(m){ var h=Math.round(((m.total||0)/mx)*100)+4; return '<div class="fin-bar-col"><div class="fin-bar" style="height:'+h+'px;" title="'+_fcfa(m.total)+'"></div><div class="fin-bar-lbl">'+String(m.month||'').slice(5)+'</div></div>'; }).join('')
        +'</div>';
    }
    html+='<div class="fin-sec-t">Demandes de retrait ('+pend.length+')</div>';
    if(!pend.length){ html+='<div style="color:var(--muted);font-size:13px;padding:4px 0 8px;">Aucune demande en attente.</div>'; }
    else { html+=pend.map(function(u){ var wr=u.withdraw_request||{}; return '<div class="fin-wd" id="fwd_'+u.id+'"><div style="flex:1;min-width:0;"><div style="font-weight:700;">'+esc(u.full_name||u.username||'?')+'</div><div style="font-size:12px;color:var(--muted);">'+esc(wr.phone||u.phone||'')+' · '+_fcfa(wr.amount)+'</div></div><button onclick="finApprove(\''+u.id+'\')" style="padding:7px 11px;border:none;border-radius:9px;background:#00C896;color:#04150f;font-weight:700;font-size:13px;cursor:pointer;">Valider</button><button onclick="finReject(\''+u.id+'\')" style="padding:7px 11px;border:none;border-radius:9px;background:#DC2626;color:#fff;font-weight:700;font-size:13px;cursor:pointer;margin-left:6px;">Rejeter</button></div>'; }).join(''); }
    if(tops.length){ html+='<div class="fin-sec-t">Top créateurs</div>'+tops.slice(0,10).map(function(u,i){ return '<div class="fin-row"><div style="width:22px;color:var(--muted);font-weight:700;">'+(i+1)+'</div><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;">'+esc(u.full_name||u.username||'?')+'</div><div style="font-size:11px;color:var(--muted);">'+(u.valid_views||0)+' vues valides</div></div><div style="font-weight:700;color:#00C896;">'+_fcfa(u.earned)+'</div></div>'; }).join(''); }
    if(paid.length){ html+='<div class="fin-sec-t">Historique des paiements</div>'+paid.slice(0,20).map(function(u){ var wr=u.withdraw_request||{}; var dt=wr.paid_at?new Date(wr.paid_at).toLocaleDateString('fr-FR'):''; return '<div class="fin-row"><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:14px;">'+esc(u.full_name||u.username||'?')+'</div><div style="font-size:11px;color:var(--muted);">'+dt+'</div></div><div style="font-weight:700;color:var(--muted);">'+_fcfa(wr.amount)+'</div></div>'; }).join(''); }
    box.innerHTML=html;
  }).catch(function(){ var box=document.getElementById('admFinBody'); if(box) box.innerHTML='<div style="color:var(--muted);text-align:center;padding:24px;">Erreur de chargement.</div>'; });
}
function finApprove(uid){ if(!confirm('Valider ce retrait (marquer comme payé) ?')) return; api('/admin/withdraw/approve','POST',{user_id:uid}).then(function(r){ if(r&&r.success){ var c=document.getElementById('fwd_'+uid); if(c)c.remove(); showNotif('💰','Retrait','Validé','green',null); } }).catch(function(){}); }
function finReject(uid){ if(!confirm('Rejeter cette demande de retrait ?')) return; api('/admin/withdraw/reject','POST',{user_id:uid}).then(function(r){ if(r&&r.success){ var c=document.getElementById('fwd_'+uid); if(c)c.remove(); showNotif('❌','Retrait','Rejeté','red',null); } }).catch(function(){}); }'''
s = R(s, ANCHOR, ANCHOR + FUNCS, "Fonctions finances")

# 4) Bump build
s = R(s,
  "console.log('PENC build v97 (compte officiel: statuts non-repondables)');",
  "console.log('PENC build v98 (admin: gestion financiere)');",
  "Marqueur build -> v98")

assert s.count('function loadAdminFinance')==1 and s.count('function finReject')==1, "Fonctions finances absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v98.")
print("Verifie : node check.js")
