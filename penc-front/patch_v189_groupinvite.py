# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v189 (appel de groupe: inviter plusieurs participants)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v189 — inviter plusieurs (groupe)")

PLUS='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>'

# 1) Bouton "Ajouter" dans gc-btns (avant Quitter)
s=R(s,'    <button class="call-btn red call-end" onclick="_gcLeave()" title="Quitter">',
      '    <button class="call-btn cb-add" id="gcAdd" onclick="_gcOpenInvite()" title="Ajouter des participants">'+PLUS+'</button>\n'
      '    <button class="call-btn red call-end" onclick="_gcLeave()" title="Quitter">',"Bouton Ajouter")

# 2) Fonctions invite (avant _gcMinimize)
INV=r'''var _gcInvSel={};
var _gcFriends=[];
function _gcOpenInvite(){ if(!_gc.room) return; var ex=document.getElementById('gcInvite'); if(ex) ex.remove(); _gcInvSel={}; var ov=document.createElement('div'); ov.id='gcInvite'; ov.className='gc-inv-ov'; ov.innerHTML='<div class="gc-inv-sheet"><div class="gc-inv-hd"><span>Ajouter des participants</span><button class="gc-inv-x" onclick="_gcCloseInvite()"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><input class="gc-inv-search" id="gcInvSearch" placeholder="Rechercher un ami..." oninput="_gcInvFilter(this.value)"/><div class="gc-inv-list" id="gcInvList"><div class="gc-inv-empty">Chargement\u2026</div></div><button class="gc-inv-send" id="gcInvSend" onclick="_gcSendInvites()" disabled>Inviter</button></div>'; document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('show'); }); ov.addEventListener('click',function(e){ if(e.target===ov) _gcCloseInvite(); }); api('/friends').then(function(d){ _gcFriends=((d&&d.friends)||[]); _gcRenderInvList(_gcFriends); }).catch(function(){ var l=document.getElementById('gcInvList'); if(l) l.innerHTML='<div class="gc-inv-empty">Erreur de chargement</div>'; }); }
function _gcRenderInvList(list){ var l=document.getElementById('gcInvList'); if(!l) return; if(!list||!list.length){ l.innerHTML='<div class="gc-inv-empty">Aucun ami disponible</div>'; return; } l.innerHTML=list.map(function(u){ var av=u.avatar_url?('<img src="'+u.avatar_url+'"/>'):('<span>'+esc(initials(u.full_name||'?'))+'</span>'); var sel=_gcInvSel[u.id]?' selected':''; return '<div class="gc-inv-row'+sel+'" data-uid="'+esc(u.id)+'" onclick="_gcToggleInvitee(\''+esc(u.id)+'\')"><div class="gc-inv-av">'+av+'</div><div class="gc-inv-info"><div class="gc-inv-nm">'+esc(u.full_name||u.username||'?')+'</div><div class="gc-inv-un">@'+esc(u.username||'')+'</div></div><div class="gc-inv-check"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div></div>'; }).join(''); }
function _gcInvFilter(q){ q=(q||'').toLowerCase().trim(); var list=(_gcFriends||[]).filter(function(u){ if(!q) return true; return ((u.full_name||'')+' '+(u.username||'')).toLowerCase().indexOf(q)>=0; }); _gcRenderInvList(list); }
function _gcToggleInvitee(id){ if(_gcInvSel[id]) delete _gcInvSel[id]; else _gcInvSel[id]=1; var row=document.querySelector('.gc-inv-row[data-uid="'+id+'"]'); if(row) row.classList.toggle('selected'); var n=Object.keys(_gcInvSel).length; var b=document.getElementById('gcInvSend'); if(b){ b.disabled=(n===0); b.textContent=n?('Inviter ('+n+')'):'Inviter'; } }
function _gcSendInvites(){ var ids=Object.keys(_gcInvSel); if(!ids.length||!_gc.room||!SOCKET) return; try{ SOCKET.emit('channel:call:invite',{channel_id:_gc.channelId,room_name:_gc.roomName,type:_gc.type,user_ids:ids}); }catch(e){} _gcCloseInvite(); if(typeof showNotif==='function') showNotif('','Invitations envoy\u00e9es', ids.length+' personne'+(ids.length>1?'s':'')+' invit\u00e9e'+(ids.length>1?'s':''),'green',null); }
function _gcCloseInvite(){ var o=document.getElementById('gcInvite'); if(o){ o.classList.remove('show'); setTimeout(function(){ try{o.remove();}catch(e){} },220); } }
function _gcMinimize(){ var o=document.getElementById('gcOverlay'); if(o) o.classList.add('minimized'); }'''
s=R(s,"function _gcMinimize(){ var o=document.getElementById('gcOverlay'); if(o) o.classList.add('minimized'); }",INV,"Fonctions invite")

# 3) Fermer l'invite dans _gcLeave
s=R(s,"  try{ _clearCallMediaSession(); }catch(e){}\n  _gc.channelId=null; _gc.roomName=null;",
      "  try{ _clearCallMediaSession(); }catch(e){}\n  try{ _gcCloseInvite(); }catch(e){}\n  _gc.channelId=null; _gc.roomName=null;","_gcLeave ferme invite")

# 4) CSS
CSS=(".gc-inc-accept{background:linear-gradient(145deg,#34e98b,#10b06a);color:#fff;box-shadow:0 8px 22px rgba(16,176,106,.45)}\n"
".cb-add{background:rgba(0,200,150,.16)!important;color:#00E0A6}\n"
".gc-inv-ov{position:fixed;inset:0;z-index:99300;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .22s}\n"
".gc-inv-ov.show{opacity:1}\n"
".gc-inv-sheet{width:100%;max-width:480px;max-height:78vh;display:flex;flex-direction:column;background:#141c28;border-radius:22px 22px 0 0;border:1px solid rgba(255,255,255,.08);border-bottom:none;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .3s cubic-bezier(.2,.9,.3,1.2)}\n"
".gc-inv-ov.show .gc-inv-sheet{transform:translateY(0)}\n"
".gc-inv-hd{display:flex;align-items:center;justify-content:space-between;color:#fff;font-size:17px;font-weight:800;margin-bottom:12px}\n"
".gc-inv-x{background:rgba(255,255,255,.1);border:none;color:#cfd6dd;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}\n"
".gc-inv-search{width:100%;padding:11px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;font-size:14px;outline:none;margin-bottom:8px;box-sizing:border-box}\n"
".gc-inv-search::placeholder{color:#7b8694}\n"
".gc-inv-list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}\n"
".gc-inv-empty{color:#7b8694;text-align:center;padding:24px;font-size:14px}\n"
".gc-inv-row{display:flex;align-items:center;gap:11px;padding:10px 8px;border-radius:12px;cursor:pointer;transition:background .12s}\n"
".gc-inv-row:active{background:rgba(255,255,255,.05)}\n"
".gc-inv-row.selected{background:rgba(0,200,150,.1)}\n"
".gc-inv-av{width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--accent,#00C896);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex:0 0 auto}\n"
".gc-inv-av img{width:100%;height:100%;object-fit:cover}\n"
".gc-inv-info{flex:1;min-width:0}\n"
".gc-inv-nm{color:#fff;font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
".gc-inv-un{color:#7b8694;font-size:12.5px}\n"
".gc-inv-check{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.2);color:transparent;display:flex;align-items:center;justify-content:center;flex:0 0 auto;transition:all .15s}\n"
".gc-inv-row.selected .gc-inv-check{background:#00C896;border-color:#00C896;color:#fff}\n"
".gc-inv-send{margin-top:12px;padding:14px;border:none;border-radius:14px;background:linear-gradient(145deg,#34e98b,#10b06a);color:#fff;font-weight:800;font-size:15px;cursor:pointer;transition:opacity .15s}\n"
".gc-inv-send:disabled{opacity:.4;cursor:default;background:rgba(255,255,255,.1)}")
s=R(s,".gc-inc-accept{background:linear-gradient(145deg,#34e98b,#10b06a);color:#fff;box-shadow:0 8px 22px rgba(16,176,106,.45)}",CSS,"CSS invite")

# 5) Build
s=R(s,"console.log('PENC build v188 (appels de groupe canaux)');",
      "console.log('PENC build v189 (groupe: inviter plusieurs)');","Build -> v189")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v189")
