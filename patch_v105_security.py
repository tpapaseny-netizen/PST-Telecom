# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v105 (A7 : panneau Securite & logs)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v105 — Securite & logs (A7)")

# 1) Bouton admin (apres Notifier tous)
BTN='📢 Notifier tous les utilisateurs</button>`;'
NEW=BTN+'\n  html+=`<button onclick="openAdminSecurity()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#7C3AED;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🔒 Sécurité & logs</button>`;'
s=R(s,BTN,NEW,"Bouton Securite")

# 2) Fonctions (apres closeOffStatus_KEEP)
ANCHOR="function closeOffStatus_KEEP(){}"
FUNCS=ANCHOR+r'''
function _secIcon(t){ if(t==='login_ok') return '✅'; if(t==='login_failed') return '⛔'; if(t==='user_suspended') return '🚫'; if(t==='user_unsuspended') return '🔓'; return '•'; }
function _secLabel(t){ if(t==='login_ok') return 'Connexion réussie'; if(t==='login_failed') return 'Échec de connexion'; if(t==='user_suspended') return 'Compte suspendu'; if(t==='user_unsuspended') return 'Compte réactivé'; return t; }
function openAdminSecurity(){
  var ov=document.getElementById('admSecOv');
  if(!ov){ ov=document.createElement('div'); ov.id='admSecOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="max-height:92vh;display:flex;flex-direction:column;overflow-y:auto;"><div class="sheet-handle"></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">🔒 Sécurité & logs</div><div onclick="closeAdmSec()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div><div id="admSecBody"><div class="spinner" style="margin:24px auto;"></div></div></div>';
  ov.classList.add('show'); loadAdminSecurity();
}
function closeAdmSec(){ var o=document.getElementById('admSecOv'); if(o) o.classList.remove('show'); }
function loadAdminSecurity(){
  api('/admin/security').then(function(d){
    var box=document.getElementById('admSecBody'); if(!box||!d) return;
    var logs=d.logs||[], sus=d.suspended||[], mods=d.moderators||[];
    var html='<div class="fin-grid"><div class="fin-card"><div class="fin-card-v" style="color:#DC2626;">'+(d.failed_24h||0)+'</div><div class="fin-card-l">Échecs de connexion (24h)</div></div><div class="fin-card"><div class="fin-card-v" style="color:#E8A87C;">'+sus.length+'</div><div class="fin-card-l">Comptes suspendus</div></div></div>';
    if(mods.length){ html+='<div class="fin-sec-t">Modérateurs ('+mods.length+')</div>'+mods.map(function(m){ return '<div class="fin-row"><div style="flex:1;min-width:0;">'+esc(m.full_name||m.username||'?')+'</div><span style="background:#00C896;color:#fff;font-size:9px;padding:2px 6px;border-radius:6px;font-weight:700;">MOD</span></div>'; }).join(''); }
    if(sus.length){ html+='<div class="fin-sec-t">Comptes suspendus</div>'+sus.map(function(u){ return '<div class="fin-row"><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13.5px;">'+esc(u.full_name||u.username||'?')+'</div><div style="font-size:11px;color:var(--muted);">'+esc(u.phone||'')+'</div></div><span style="color:#DC2626;font-weight:700;font-size:18px;">🚫</span></div>'; }).join(''); }
    html+='<div class="fin-sec-t">Activité récente</div>';
    if(!logs.length){ html+='<div style="color:var(--muted);font-size:13px;padding:6px 0;">Aucun événement enregistré.</div>'; }
    else { html+=logs.map(function(l){ var dt=l.created_at?new Date(l.created_at).toLocaleString('fr-FR'):''; var col=(l.type==='login_failed'||l.type==='user_suspended')?'#DC2626':'var(--text)'; return '<div class="fin-row"><div style="font-size:18px;width:26px;text-align:center;">'+_secIcon(l.type)+'</div><div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;color:'+col+';">'+_secLabel(l.type)+'</div><div style="font-size:11px;color:var(--muted);word-break:break-word;">'+esc(l.identifier||l.user_id||'')+(l.ip?(' · '+esc(l.ip)):'')+(l.detail?(' · '+esc(l.detail)):'')+'</div></div><div style="font-size:10px;color:var(--muted);white-space:nowrap;">'+dt+'</div></div>'; }).join(''); }
    box.innerHTML=html;
  }).catch(function(){ var b=document.getElementById('admSecBody'); if(b) b.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px;">Erreur de chargement.</div>'; });
}'''
s=R(s,ANCHOR,FUNCS,"Fonctions securite")

# 3) Build bump
s=R(s,"console.log('PENC build v104 (admin: stats publicites)');",
      "console.log('PENC build v105 (admin: logs & securite)');","Build -> v105")

assert s.count('function loadAdminSecurity')==1, "absent!"
data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v105.")
