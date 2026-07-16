# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v136 (canaux etape 5 : parametres - edition + lecture seule)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v136 — parametres du canal")

# 1) CSS interrupteur
OLDCSS=".ch-input-bar{padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;\n  padding-bottom:calc(10px + env(safe-area-inset-bottom,0px));}"
NEWCSS=OLDCSS+("\n.ch-switch{position:relative;display:inline-block;width:42px;height:24px;flex-shrink:0;}"
"\n.ch-switch input{opacity:0;width:0;height:0;}"
"\n.ch-switch-sl{position:absolute;cursor:pointer;inset:0;background:var(--border);border-radius:24px;transition:.2s;}"
"\n.ch-switch-sl:before{content:\"\";position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.2s;}"
"\n.ch-switch input:checked + .ch-switch-sl{background:var(--accent);}"
"\n.ch-switch input:checked + .ch-switch-sl:before{transform:translateX(18px);}")
s=R(s,OLDCSS,NEWCSS,"CSS interrupteur")

# 2) Titre du panneau -> SVG + Parametres
s=R(s,r'''<div class="sheet-title" style="margin:0;">⚙️ Membres du canal</div>''',
      r'''<div class="sheet-title" style="margin:0;display:flex;align-items:center;gap:6px;">'+_svgIcon('gear',16,'currentColor')+' Paramètres du canal</div>''',
      "Titre parametres")

# 3) Placeholder pour edition/lecture seule avant le lien d'invitation
s=R(s,r'''+'<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:10px;"><div style="font-size:12px;color:var(--muted);margin-bottom:5px;">Lien d invitation</div>''',
      r'''+'<div id="chSettExtra"></div>'
    +'<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:10px;"><div style="font-size:12px;color:var(--muted);margin-bottom:5px;">Lien d invitation</div>''',
      "Placeholder chSettExtra")

# 4) Charger les parametres a l'ouverture
s=R(s,r'''ov.classList.add('show');
  loadChMembers(chId);
}''',
      r'''ov.classList.add('show');
  loadChMembers(chId);
  _chLoadSettings(chId);
}''',
      "Appel _chLoadSettings")

# 5) Nouvelles fonctions (apres closeChMembers)
ANCH=r'''function closeChMembers(){ var ov=document.getElementById('chMembersOv'); if(ov) ov.classList.remove('show'); }'''
FNS=ANCH+"\n"+r'''function _chLoadSettings(chId){
  api('/channels/'+chId).then(function(ch){
    var box=document.getElementById('chSettExtra'); if(!box||!ch||ch.error) return;
    var isOwner=(ch.is_creator===true||String(ch.creator_id)===String(ME&&ME.id));
    var isAdmin=(ch.is_admin===true)||isOwner;
    if(!isAdmin){ box.innerHTML=''; return; }
    var ctype=ch.type||'broadcast';
    var readOnly=(ch.read_only===true);
    var h='<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:10px;">';
    h+='<div style="font-size:12px;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:6px;">'+_svgIcon('gear',14,'var(--muted)')+'Modifier le canal</div>';
    h+='<input id="chEditName" value="'+esc(ch.name||'')+'" placeholder="Nom du canal" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;font-size:14px;margin-bottom:6px;box-sizing:border-box;"/>';
    h+='<input id="chEditDesc" value="'+esc(ch.description||'')+'" placeholder="Description" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;font-size:13px;margin-bottom:6px;box-sizing:border-box;"/>';
    h+='<input id="chEditIcon" value="'+esc(ch.icon_url||'')+'" placeholder="URL de la photo (optionnel)" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit;font-size:12px;margin-bottom:8px;box-sizing:border-box;"/>';
    h+='<button onclick="chSaveSettings(\''+chId+'\')" style="width:100%;border:none;border-radius:9px;background:var(--accent);color:#fff;padding:9px;font-weight:700;cursor:pointer;">Enregistrer</button>';
    h+='</div>';
    if(ctype==='group'){
      h+='<div style="background:var(--card2);border-radius:10px;padding:12px 10px;margin-bottom:10px;display:flex;align-items:center;gap:10px;">';
      h+='<div style="flex:1;"><div style="font-weight:700;font-size:13px;">Mode lecture seule</div><div style="font-size:11px;color:var(--muted);">Seuls les admins peuvent écrire.</div></div>';
      h+='<label class="ch-switch"><input type="checkbox" id="chRoToggle" '+(readOnly?'checked':'')+' onchange="chToggleReadonly(\''+chId+'\',this.checked)"/><span class="ch-switch-sl"></span></label>';
      h+='</div>';
    }
    box.innerHTML=h;
  }).catch(function(){});
}
function chSaveSettings(chId){
  var nm=(document.getElementById('chEditName')||{}).value||'';
  var ds=(document.getElementById('chEditDesc')||{}).value||'';
  var ic=(document.getElementById('chEditIcon')||{}).value||'';
  if(!nm.trim()||nm.trim().length<2){ showNotif('❌','Erreur','Nom trop court','red',null); return; }
  api('/channels/'+chId,'PUT',{name:nm,description:ds,icon_url:ic||null}).then(function(r){
    if(r&&r.success){ showNotif('✅','Canal mis à jour','','green',null); if(typeof renderChannelsView==='function') renderChannelsView(); var d=document.getElementById('chDetail_'+chId); if(d){ d.remove(); openChannelDetail(chId); } }
    else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null);
  }).catch(function(){ showNotif('❌','Erreur','Échec','red',null); });
}
function chToggleReadonly(chId,on){
  api('/channels/'+chId+'/readonly','POST',{read_only:!!on}).then(function(r){
    if(r&&r.success){ showNotif('✅', on?'Lecture seule activée':'Lecture seule désactivée','','green',null); var d=document.getElementById('chDetail_'+chId); if(d){ d.remove(); openChannelDetail(chId); } }
    else { showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null); var t=document.getElementById('chRoToggle'); if(t) t.checked=!on; }
  }).catch(function(){ var t=document.getElementById('chRoToggle'); if(t) t.checked=!on; });
}'''
s=R(s,ANCH,FNS,"Fonctions parametres")

# 6) Build bump
s=R(s,"console.log('PENC build v135 (canaux: design premium icones SVG)');",
      "console.log('PENC build v136 (canaux: parametres edition + lecture seule)');","Build -> v136")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v136.")
