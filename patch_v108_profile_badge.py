# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v108 (badge partout + bouton Modifier le profil)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v108 — badge partout + edition profil")

# 1) Badge dans _frCard (amis / demandes / decouvrir)
s=R(s,"esc(u.full_name||'Utilisateur')+dot+'",
      "esc(u.full_name||'Utilisateur')+_badgeFor(u.id)+dot+'",
      "Badge _frCard")

# 2) Badge dans _renderUserList (recherche / contacts)
s=R(s,"white-space:nowrap;\">'+esc(u.full_name||u.username||'?')+'</div>'",
      "white-space:nowrap;\">'+esc(u.full_name||u.username||'?')+_badgeFor(u.id)+'</div>'",
      "Badge _renderUserList")

# 3) Badge sur son propre profil
s=R(s,'<div class="profile-name">${esc(ME?.full_name||\'\')}</div>',
      '<div class="profile-name">${esc(ME?.full_name||\'\')}${(ME&&ME.verified)?_pencBadge():\'\'}</div>',
      "Badge profil perso")

# 4) Carte "Modifier le profil" (avant Mes publications)
PUB='    <div class="reward-card" onclick="openMyPublications()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;">'
EDIT='    <div class="reward-card" onclick="openEditProfile()" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;"><span style="font-weight:700;">✏️ Modifier le profil</span><span style="color:var(--muted);font-size:20px;">&#8250;</span></div>\n'+PUB
s=R(s,PUB,EDIT,"Carte Modifier le profil")

# 5) Fonctions (apres closeOffStatus_KEEP)
ANCHOR="function closeOffStatus_KEEP(){}"
FUNCS=ANCHOR+"""
function openEditProfile(){
  var ov=document.getElementById('editProfOv');
  if(!ov){ ov=document.createElement('div'); ov.id='editProfOv'; ov.className='overlay'; document.body.appendChild(ov); }
  var me=ME||{};
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">\u270F\uFE0F Modifier le profil</div>'
    +'<label style="font-size:12px;color:var(--muted);font-weight:600;">Nom complet</label>'
    +'<input id="epName" value="'+esc(me.full_name||'')+'" maxlength="60" style="width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;font-size:14px;margin:5px 0 12px;box-sizing:border-box;"/>'
    +'<label style="font-size:12px;color:var(--muted);font-weight:600;">Bio</label>'
    +'<textarea id="epBio" maxlength="160" rows="3" placeholder="Quelques mots sur toi" style="width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);outline:none;font-size:14px;margin:5px 0 4px;box-sizing:border-box;resize:none;font-family:inherit;">'+esc(me.bio||'')+'</textarea>'
    +'<div style="font-size:11px;color:var(--muted);margin-bottom:12px;">@'+esc(me.username||'')+' '+esc(me.phone||'')+' (non modifiables)</div>'
    +'<button onclick="saveProfile()" id="epSave" style="width:100%;padding:13px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Enregistrer</button>'
    +'<button onclick="closeEditProf()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:6px;">Annuler</button></div>';
  ov.classList.add('show');
}
function closeEditProf(){ var o=document.getElementById('editProfOv'); if(o) o.classList.remove('show'); }
function saveProfile(){
  var name=((document.getElementById('epName')||{}).value||'').trim();
  var bio=((document.getElementById('epBio')||{}).value||'').trim();
  if(!name){ showNotif('\u26A0\uFE0F','Nom','Le nom ne peut pas etre vide','red',null); return; }
  var btn=document.getElementById('epSave'); if(btn){ btn.disabled=true; btn.textContent='Enregistrement...'; }
  api('/auth/profile','PUT',{full_name:name,bio:bio}).then(function(r){
    if(r&&r.success){ if(!ME) ME={}; ME.full_name=name; ME.bio=bio; if(r.user) ME=Object.assign(ME,r.user); showNotif('\u2705','Profil','Mis a jour','green',null); closeEditProf(); try{renderProfileView();}catch(e){} try{renderConvList();}catch(e){} }
    else { showNotif('\u274C','Erreur',(r&&r.error)||'Echec','red',null); if(btn){ btn.disabled=false; btn.textContent='Enregistrer'; } }
  }).catch(function(){ showNotif('\u274C','Erreur','Reseau','red',null); if(btn){ btn.disabled=false; btn.textContent='Enregistrer'; } });
}"""
s=R(s,ANCHOR,FUNCS,"Fonctions edition profil")

# 6) Build bump
s=R(s,"console.log('PENC build v107 (B3: amitie obligatoire avant de discuter)');",
      "console.log('PENC build v108 (badge partout + modifier le profil)');","Build -> v108")

assert s.count('function openEditProfile')==1 and s.count('function saveProfile')==1, "absent!"
data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v108.")
