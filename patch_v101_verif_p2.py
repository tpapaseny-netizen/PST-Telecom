# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v101 (Badge bleu, Phase 2 : verification par pieces)
  - carte "Demander la certification" dans le profil (upload piece -> Cloudinary)
  - modale demande (statut: deja certifie / en attente / formulaire)
  - panneau admin "Demandes de certification" (image + Certifier / Rejeter)

    python patch_v101_verif_p2.py
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

print("Patch v101 — Verification par pieces (Phase 2)")

# 1) Carte profil (avant "Mes amis")
FRIENDS_CARD = '    <div class="reward-card" onclick="openFriends()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;">'
VERIF_CARD = r'''    ${(ME&&ME.verified)?'<div class="reward-card" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;"><span style="font-weight:700;">🔵 Compte certifié</span><span style="color:#1D9BF0;font-weight:700;">✓ Vérifié</span></div>':'<div class="reward-card" onclick="openVerifyRequest()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;"><span style="font-weight:700;">🔵 Demander la certification</span><span style="color:var(--muted);font-size:20px;">&#8250;</span></div>'}
''' + FRIENDS_CARD
s = R(s, FRIENDS_CARD, VERIF_CARD, "Carte profil certification")

# 2) Bouton admin (apres Finances)
FIN_BTN = '💰 Finances</button>`;'
NEW_BTN = FIN_BTN + '\n  html+=`<button onclick="openAdminVerifs()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#1D9BF0;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🪪 Demandes de certification</button>`;'
s = R(s, FIN_BTN, NEW_BTN, "Bouton admin certifications")

# 3) Fonctions (apres closeOffStatus_KEEP)
ANCHOR = "function closeOffStatus_KEEP(){}"
FUNCS = r'''
function openVerifyRequest(){
  var ov=document.getElementById('verReqOv');
  if(!ov){ ov=document.createElement('div'); ov.id='verReqOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">🔵 Demander la certification</div><div id="verReqBody"><div class="spinner" style="margin:20px auto;"></div></div></div>';
  ov.classList.add('show');
  api('/verify/status').then(function(d){
    var b=document.getElementById('verReqBody'); if(!b) return;
    if(d&&d.verified){ b.innerHTML='<div style="text-align:center;padding:20px;color:#1D9BF0;font-weight:700;">✓ Votre compte est déjà certifié.</div>'; return; }
    if(d&&d.pending){ b.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted);line-height:1.6;">⏳ Votre demande est en cours d\'examen.<br>Vous serez notifié dès qu\'elle sera traitée.</div><button onclick="closeVerReq()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;">Fermer</button>'; return; }
    b.innerHTML='<div style="color:var(--muted);font-size:13.5px;line-height:1.6;margin-bottom:14px;">Envoie une photo claire de ta pièce d\'identité (CNI, passeport ou permis). Elle servira uniquement à vérifier ton identité et ne sera pas publiée.</div>'
      +'<input type="file" id="verDocInput" accept="image/*" style="display:none" onchange="_doVerifySubmit(event)"/>'
      +'<button onclick="document.getElementById(\'verDocInput\').click()" style="width:100%;padding:13px;border:none;border-radius:12px;background:#1D9BF0;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">📷 Envoyer ma pièce d\'identité</button>'
      +'<button onclick="closeVerReq()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:8px;">Annuler</button>';
  }).catch(function(){ var b=document.getElementById('verReqBody'); if(b) b.innerHTML='<div style="color:var(--muted);text-align:center;padding:20px;">Erreur. Réessaie.</div>'; });
}
function closeVerReq(){ var o=document.getElementById('verReqOv'); if(o) o.classList.remove('show'); }
async function _doVerifySubmit(e){
  var f=e.target.files[0]; if(!f) return; e.target.value='';
  var b=document.getElementById('verReqBody'); if(b) b.innerHTML='<div style="text-align:center;padding:24px;"><div class="spinner"></div><div style="margin-top:10px;color:var(--muted);">Envoi en cours…</div></div>';
  try{
    var fd=new FormData(); fd.append('file',f); fd.append('upload_preset',CLD_PRESET); fd.append('folder','penc/verif');
    var r=await fetch('https://api.cloudinary.com/v1_1/'+CLD_CLOUD+'/image/upload',{method:'POST',body:fd});
    var d=await r.json();
    if(!d.secure_url) throw new Error('upload');
    var resp=await api('/verify/request','POST',{doc_url:d.secure_url,type:'id'});
    if(resp&&resp.success){ if(b) b.innerHTML='<div style="text-align:center;padding:20px;color:#00C896;font-weight:700;font-size:16px;">✅ Demande envoyée !</div><div style="text-align:center;color:var(--muted);font-size:13px;padding:0 10px 14px;">Tu seras notifié dès qu\'elle sera validée.</div><button onclick="closeVerReq()" style="width:100%;padding:11px;border:none;border-radius:11px;background:var(--card2);color:var(--text);cursor:pointer;">Fermer</button>'; showNotif('🔵','Certification','Demande envoyée','green',null); }
    else throw new Error('req');
  }catch(err){ if(b) b.innerHTML='<div style="color:#DC2626;text-align:center;padding:20px;">❌ Échec de l\'envoi. Réessaie.</div><button onclick="openVerifyRequest()" style="width:100%;padding:11px;border:none;border-radius:11px;background:var(--card2);color:var(--text);cursor:pointer;">Réessayer</button>'; }
}
function openAdminVerifs(){
  var ov=document.getElementById('admVerOv');
  if(!ov){ ov=document.createElement('div'); ov.id='admVerOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="max-height:92vh;display:flex;flex-direction:column;overflow-y:auto;"><div class="sheet-handle"></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div class="sheet-title" style="margin:0;">🪪 Demandes de certification</div><div onclick="closeAdmVer()" style="cursor:pointer;font-size:20px;color:var(--muted);">&#10005;</div></div><div id="admVerList"><div class="spinner" style="margin:24px auto;"></div></div></div>';
  ov.classList.add('show'); loadAdminVerifs();
}
function closeAdmVer(){ var o=document.getElementById('admVerOv'); if(o) o.classList.remove('show'); }
function loadAdminVerifs(){
  api('/admin/verify-requests').then(function(d){
    var box=document.getElementById('admVerList'); if(!box) return;
    var rs=(d&&d.requests)||[];
    if(!rs.length){ box.innerHTML='<div style="text-align:center;color:var(--muted);padding:24px;">Aucune demande en attente 🎉</div>'; return; }
    box.innerHTML=rs.map(function(r){
      return '<div class="adm-rep-card" id="ver_'+r.id+'">'
        +'<div style="font-weight:700;margin-bottom:2px;">'+esc(r.name)+(r.already_verified?_pencBadge():'')+'</div>'
        +'<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">@'+esc(r.username||'')+' · '+esc(r.phone||'')+'</div>'
        +(r.doc_url?'<img src="'+r.doc_url+'" onclick="window.open(\''+r.doc_url+'\',\'_blank\')" style="width:100%;max-height:240px;object-fit:contain;border-radius:10px;background:#000;margin-bottom:8px;cursor:zoom-in;"/>':'')
        +'<div style="display:flex;gap:8px;">'
        +'<button onclick="verApprove(\''+r.id+'\')" style="flex:1;padding:10px;border:none;border-radius:10px;background:#1D9BF0;color:#fff;font-weight:700;cursor:pointer;">✓ Certifier</button>'
        +'<button onclick="verReject(\''+r.id+'\')" style="flex:1;padding:10px;border:none;border-radius:10px;background:#DC2626;color:#fff;font-weight:700;cursor:pointer;">Rejeter</button>'
        +'</div></div>';
    }).join('');
  }).catch(function(){});
}
function verApprove(id){ api('/admin/verify-requests/'+id+'/approve','POST',{}).then(function(r){ if(r&&r.success){ var c=document.getElementById('ver_'+id); if(c)c.remove(); showNotif('🔵','Certification','Compte certifié','green',null); try{loadVerifiedIds();}catch(e){} } else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); }); }
function verReject(id){ if(!confirm('Rejeter cette demande de certification ?')) return; api('/admin/verify-requests/'+id+'/reject','POST',{}).then(function(r){ if(r&&r.success){ var c=document.getElementById('ver_'+id); if(c)c.remove(); showNotif('❌','Certification','Demande rejetée','red',null); } }).catch(function(){}); }'''
s = R(s, ANCHOR, ANCHOR + FUNCS, "Fonctions verification P2")

# 4) Build bump
s = R(s,
  "console.log('PENC build v100 (fix z-index fenetres admin + verrouillage total Penc)');",
  "console.log('PENC build v101 (badge bleu P2: verification par pieces)');",
  "Marqueur build -> v101")

assert s.count('function openVerifyRequest')==1 and s.count('function loadAdminVerifs')==1, "Fonctions verif absentes !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v101.")
print("Verifie : node check.js")
