# -*- coding: utf-8 -*-
"""PENC v196 — validation des intervenants par le createur + bascule des deux cotes"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v196")

# 1) Reecrire _lkSendInvites : hote = direct ; invite = demande de validation
OLD_SEND="function _lkSendInvites(){ var ids=Object.keys(_gcInvSel); if(!ids.length||!_lk.room||!SOCKET) return; var other=_lk.targetId||_lk.callerId; var nm=(ME&&(ME.full_name||ME.username))||'Quelqu un'; try{ SOCKET.emit('call:invite',{room_name:_lk.roomName,type:_lk.type,user_ids:ids,caller_name:nm}); if(other) SOCKET.emit('call:upgrade',{target_user_id:other,room_name:_lk.roomName,type:_lk.type}); }catch(e){} _gcCloseInvite(); _upgradeToGroupFromLk(); if(typeof showNotif==='function') showNotif('','Invitations envoy\\u00e9es', ids.length+' personne'+(ids.length>1?'s':'')+' invit\\u00e9e'+(ids.length>1?'s':''),'green',null); }"
NEW_SEND=(
"function _lkSendInvites(){ var ids=Object.keys(_gcInvSel); if(!ids.length||!_lk.room||!SOCKET) return; var nm=(ME&&(ME.full_name||ME.username))||'Quelqu un';\n"
"  if(_lk.isCaller){ var other=_lk.targetId||_lk.callerId; try{ SOCKET.emit('call:invite',{room_name:_lk.roomName,type:_lk.type,user_ids:ids,caller_name:nm}); if(other) SOCKET.emit('call:upgrade',{target_user_id:other,room_name:_lk.roomName,type:_lk.type}); }catch(e){} _gcCloseInvite(); _upgradeToGroupFromLk(); if(typeof showNotif==='function') showNotif('','Invitations envoy\\u00e9es', ids.length+' personne'+(ids.length>1?'s':'')+' invit\\u00e9e'+(ids.length>1?'s':''),'green',null); }\n"
"  else { var host=_lk.callerId; var names=ids.map(function(id){ var f=(_gcFriends||[]).find(function(u){return String(u.id)===String(id);}); return f?(f.full_name||f.username||''):''; }); try{ SOCKET.emit('call:invite:request',{host_id:host,room_name:_lk.roomName,type:_lk.type,user_ids:ids,requester_name:nm,user_names:names}); }catch(e){} _gcCloseInvite(); if(typeof showNotif==='function') showNotif('','Demande envoy\\u00e9e','En attente de validation par le cr\\u00e9ateur de l\\'appel','blue',null); } }"
)
s=R(s,OLD_SEND,NEW_SEND,"_lkSendInvites host/invite")

# 2) Ajouter modal de validation (avant function _upgradeToGroupFromLk)
MODAL=(
"function _showInviteReq(d){ try{ var ex=document.getElementById('inviteReqModal'); if(ex) ex.remove(); window._pendingInviteReq=d; var names=(d.user_names||[]).filter(Boolean); var who=names.length?names.join(', '):(((d.user_ids||[]).length)+' personne'+(((d.user_ids||[]).length)>1?'s':'')); var ov=document.createElement('div'); ov.id='inviteReqModal'; ov.className='ireq-ov'; "
"ov.innerHTML='<div class=\"ireq-card\"><div class=\"ireq-ic\"><svg viewBox=\"0 0 24 24\" width=\"26\" height=\"26\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><line x1=\"19\" y1=\"8\" x2=\"19\" y2=\"14\"/><line x1=\"22\" y1=\"11\" x2=\"16\" y2=\"11\"/></svg></div><div class=\"ireq-t\">Demande d\\'ajout</div><div class=\"ireq-m\"><b>'+esc(d.requester_name||'Un participant')+'</b> souhaite ajouter <b>'+esc(who)+'</b> \\u00e0 l\\'appel.</div><div class=\"ireq-btns\"><button class=\"ireq-no\" onclick=\"_declineInviteReq()\">Refuser</button><button class=\"ireq-yes\" onclick=\"_approveInviteReq()\">Accepter</button></div></div>'; "
"document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('show'); }); }catch(e){} }\n"
"function _approveInviteReq(){ var d=window._pendingInviteReq; if(!d||!SOCKET){ _closeInviteReq(); return; } var nm=(ME&&(ME.full_name||ME.username))||'Quelqu un'; var rnm=_lk.roomName||d.room_name; var tp=_lk.type||d.type; try{ SOCKET.emit('call:invite',{room_name:rnm,type:tp,user_ids:d.user_ids,caller_name:nm}); }catch(e){} var other=_lk.targetId||_lk.callerId; if(other){ try{ SOCKET.emit('call:upgrade',{target_user_id:other,room_name:rnm,type:tp}); }catch(e){} } if(d.requester_id && String(d.requester_id)!==String(other)){ try{ SOCKET.emit('call:upgrade',{target_user_id:d.requester_id,room_name:rnm,type:tp}); }catch(e){} } if(_lk.room) _upgradeToGroupFromLk(); _closeInviteReq(); if(typeof showNotif==='function') showNotif('','Valid\\u00e9','Les participants ont \\u00e9t\\u00e9 invit\\u00e9s','green',null); }\n"
"function _declineInviteReq(){ var d=window._pendingInviteReq; if(d&&SOCKET&&d.requester_id){ try{ SOCKET.emit('call:invite:declined',{requester_id:d.requester_id,room_name:d.room_name}); }catch(e){} } _closeInviteReq(); }\n"
"function _closeInviteReq(){ var o=document.getElementById('inviteReqModal'); if(o){ o.classList.remove('show'); setTimeout(function(){ try{o.remove();}catch(e){} },200); } window._pendingInviteReq=null; }\n"
)
s=R(s,"function _upgradeToGroupFromLk(){",MODAL+"function _upgradeToGroupFromLk(){","Modal validation")

# 3) Socket handlers : call:invite:request + call:invite:declined
s=R(s,"SOCKET.off('call:upgrade'); SOCKET.on('call:upgrade',function(data){ try{ if(_lk.room) _upgradeToGroupFromLk(); }catch(_e){} });",
      "SOCKET.off('call:upgrade'); SOCKET.on('call:upgrade',function(data){ try{ if(_lk.room) _upgradeToGroupFromLk(); }catch(_e){} }); SOCKET.off('call:invite:request'); SOCKET.on('call:invite:request',function(data){ try{ _showInviteReq(data); }catch(_e){} }); SOCKET.off('call:invite:declined'); SOCKET.on('call:invite:declined',function(){ try{ if(typeof showNotif==='function') showNotif('','Demande refus\\u00e9e','Le cr\\u00e9ateur de l\\'appel a refus\\u00e9 l\\'ajout','red',null); }catch(_e){} });",
      "Socket request/declined")

# 4) CSS modal
s=R(s,".call-add-btn:active{transform:scale(.9);background:rgba(0,200,150,.34)}",
      ".call-add-btn:active{transform:scale(.9);background:rgba(0,200,150,.34)}\n"
      ".ireq-ov{position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s}\n"
      ".ireq-ov.show{opacity:1}\n"
      ".ireq-card{width:100%;max-width:360px;background:#15202b;border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:24px 22px;text-align:center;transform:translateY(14px) scale(.97);transition:transform .22s cubic-bezier(.2,.8,.2,1)}\n"
      ".ireq-ov.show .ireq-card{transform:none}\n"
      ".ireq-ic{width:56px;height:56px;margin:0 auto 14px;border-radius:50%;background:rgba(0,200,150,.16);color:#2ee68f;display:flex;align-items:center;justify-content:center}\n"
      ".ireq-t{font-size:18px;font-weight:800;color:#fff;margin-bottom:8px}\n"
      ".ireq-m{font-size:14.5px;line-height:1.5;color:#aebac8;margin-bottom:20px}\n"
      ".ireq-m b{color:#fff;font-weight:700}\n"
      ".ireq-btns{display:flex;gap:11px}\n"
      ".ireq-btns button{flex:1;padding:13px 0;border-radius:13px;border:none;font-size:15px;font-weight:700;cursor:pointer;transition:transform .12s,filter .15s}\n"
      ".ireq-btns button:active{transform:scale(.96)}\n"
      ".ireq-no{background:rgba(255,77,106,.14);color:#ff6b81}\n"
      ".ireq-yes{background:linear-gradient(135deg,#00C896,#00a87d);color:#fff}\n"
      ".ireq-yes:active{filter:brightness(1.08)}",
      "CSS modal validation")

# 5) Build
s=R(s,"console.log('PENC build v195 (chrono unique + duree appel)');",
      "console.log('PENC build v196 (validation invites + bascule 2 cotes)');","Build -> v196")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v196")
