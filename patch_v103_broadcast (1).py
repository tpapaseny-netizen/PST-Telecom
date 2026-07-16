# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v103 (A5 : notifier tous les utilisateurs)"""
import io, sys, os
FN = "messager.html"
def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label); return s.replace(old, new)
with io.open(FN, "r", encoding="utf-8", newline="") as f: s = f.read()
print("Patch v103 — Broadcast push (A5)")

# 1) Bouton admin (apres certifications)
BTN = '🪪 Demandes de certification</button>`;'
NEW = BTN + '\n  html+=`<button onclick="openBroadcast()" style="width:100%;padding:11px;border:none;border-radius:11px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">📢 Notifier tous les utilisateurs</button>`;'
s = R(s, BTN, NEW, "Bouton Notifier tous")

# 2) Fonctions (apres closeOffStatus_KEEP)
ANCHOR = "function closeOffStatus_KEEP(){}"
FUNCS = ANCHOR + r'''
function openBroadcast(){
  var ov=document.getElementById('bcastOv');
  if(!ov){ ov=document.createElement('div'); ov.id='bcastOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">📢 Notifier tous les utilisateurs</div>'
    +'<div style="color:var(--muted);font-size:13px;margin-bottom:12px;line-height:1.5;">Envoie une notification à tous les utilisateurs (push pour ceux qui l\'ont activée, et en direct pour les connectés).</div>'
    +'<input id="bcTitle" placeholder="Titre" value="Penc" style="width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;font-size:14px;margin-bottom:8px;box-sizing:border-box;"/>'
    +'<textarea id="bcBody" placeholder="Votre message…" rows="3" style="width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;font-size:14px;margin-bottom:12px;box-sizing:border-box;resize:none;font-family:inherit;"></textarea>'
    +'<button onclick="sendBroadcast()" id="bcSend" style="width:100%;padding:13px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Envoyer à tous</button>'
    +'<button onclick="closeBcast()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:6px;">Annuler</button></div>';
  ov.classList.add('show');
}
function closeBcast(){ var o=document.getElementById('bcastOv'); if(o) o.classList.remove('show'); }
function sendBroadcast(){
  var t=((document.getElementById('bcTitle')||{}).value||'Penc').trim()||'Penc';
  var b=((document.getElementById('bcBody')||{}).value||'').trim();
  if(!b){ showNotif('⚠️','Message','Écris un message d\'abord','red',null); return; }
  var btn=document.getElementById('bcSend'); if(btn){ btn.disabled=true; btn.textContent='Envoi…'; }
  api('/admin/broadcast','POST',{title:t,body:b}).then(function(r){
    if(r&&r.success){ showNotif('📢','Notification','Envoyée à '+(r.sent||0)+'/'+(r.total||0)+' abonné(s)','green',null); closeBcast(); }
    else { showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); if(btn){ btn.disabled=false; btn.textContent='Envoyer à tous'; } }
  }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); if(btn){ btn.disabled=false; btn.textContent='Envoyer à tous'; } });
}'''
s = R(s, ANCHOR, FUNCS, "Fonctions broadcast")

# 3) Listener socket (apres message:new)
LIS = "  SOCKET.on('message:new', onNewMsg);"
NEWLIS = LIS + "\n  SOCKET.on('penc:broadcast', function(d){ if(d&&d.body){ showNotif('📢',(d.title||'Penc'),d.body,'blue',null); if(typeof playNotifSound==='function') playNotifSound('default'); } });"
s = R(s, LIS, NEWLIS, "Listener penc:broadcast")

# 4) Build bump
s = R(s,
  "console.log('PENC build v102 (badge bleu P3: abonnement Wave)');",
  "console.log('PENC build v103 (admin: notification push a tous)');",
  "Marqueur build -> v103")

assert s.count('function sendBroadcast')==1 and s.count("SOCKET.on('penc:broadcast'")==1, "absent!"
data = s.encode("utf-8")
with io.open(FN, "wb") as f: f.write(data)
print("\nTermine. messager.html -> v103.")
