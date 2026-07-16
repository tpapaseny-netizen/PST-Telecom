# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v194 (inviter en appel 1:1 -> bascule vers grille de groupe)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v194 — inviter en 1:1")

# 1) _gcShowIncoming : accepter invitations sans channel_id (1:1 -> groupe)
s=R(s,"    if(!data||!data.channel_id) return;","    if(!data||(!data.channel_id && !data.room_name)) return;","Guard incoming room-only")
s=R(s,"    _gc.channelId=data.channel_id; _gc.roomName=data.room_name||('chcall_'+data.channel_id); _gc.type=data.type||'audio'; _gc.chanName=data.channel_name||'Canal';",
      "    _gc.channelId=data.channel_id||null; _gc.roomName=data.room_name||('chcall_'+data.channel_id); _gc.type=data.type||'audio'; _gc.chanName=data.channel_name||'Canal';","channelId nullable")

# 2) _gcOpenInvite : mode group|lk
s=R(s,"function _gcOpenInvite(){ if(!_gc.room) return;",
      "function _gcOpenInvite(mode){ mode=mode||'group'; if(mode==='group'&&!_gc.room) return; if(mode==='lk'&&!_lk.room) return; window._invMode=mode;",
      "_gcOpenInvite mode")
s=R(s,'onclick="_gcSendInvites()" disabled>Inviter','onclick="_invSend()" disabled>Inviter',"send -> _invSend")

# 3) Fonctions invite 1:1 + bascule (avant _gcMinimize)
FNS=r'''function _invSend(){ if(window._invMode==='lk') _lkSendInvites(); else _gcSendInvites(); }
function _lkSendInvites(){ var ids=Object.keys(_gcInvSel); if(!ids.length||!_lk.room||!SOCKET) return; var other=_lk.targetId||_lk.callerId; var nm=(ME&&(ME.full_name||ME.username))||'Quelqu un'; try{ SOCKET.emit('call:invite',{room_name:_lk.roomName,type:_lk.type,user_ids:ids,caller_name:nm}); if(other) SOCKET.emit('call:upgrade',{target_user_id:other,room_name:_lk.roomName,type:_lk.type}); }catch(e){} _gcCloseInvite(); _upgradeToGroupFromLk(); if(typeof showNotif==='function') showNotif('','Invitations envoy\u00e9es', ids.length+' personne'+(ids.length>1?'s':'')+' invit\u00e9e'+(ids.length>1?'s':''),'green',null); }
function _upgradeToGroupFromLk(){
  try{
    if(!_lk.room) return;
    var LK=window.LivekitClient; if(!LK) return;
    var room=_lk.room;
    _gc.room=room; _gc.roomName=_lk.roomName; _gc.type=_lk.type; _gc.chanName='Appel de groupe'; _gc.channelId=null;
    try{ room.removeAllListeners(); }catch(e){}
    try{ var oa=document.getElementById('penc-remote-audio'); if(oa) oa.remove(); }catch(e){}
    room.on(LK.RoomEvent.ParticipantConnected,function(p){ _gcAddTile(p); });
    room.on(LK.RoomEvent.ParticipantDisconnected,function(p){ _gcRemoveTile(_gcTileId(p)); });
    room.on(LK.RoomEvent.TrackSubscribed,function(track,pub,p){ _gcAttach(track,p); });
    room.on(LK.RoomEvent.TrackUnsubscribed,function(track){ try{ track.detach().forEach(function(el){ el.remove(); }); }catch(e){} });
    room.on(LK.RoomEvent.ActiveSpeakersChanged,function(spk){ _gcSpeakers(spk); });
    room.on(LK.RoomEvent.Disconnected,function(){ _gcLeave(); });
    try{ clearInterval(_lk.timerInterval); }catch(e){}
    try{ clearTimeout(_lk.ringTimeout); }catch(e){}
    var co=document.getElementById('callOverlay'); if(co){ co.classList.remove('active'); co.classList.remove('minimized'); }
    var cp=document.getElementById('callPill'); if(cp) cp.classList.remove('show');
    var tt=document.getElementById('callTopTimer'); if(tt) tt.classList.remove('show');
    _gcOpenOverlay(); _gcSetTitle('Appel de groupe', _gc.type==='video'?'Vid\u00e9o de groupe':'Audio de groupe');
    _gcAddTile(room.localParticipant, true);
    try{ var lp=room.localParticipant; var lpubs=lp.trackPublications||lp.tracks; if(lpubs&&lpubs.forEach) lpubs.forEach(function(pub){ if(pub.track&&pub.track.kind===LK.Track.Kind.Video){ var t=document.getElementById('gct_'+_gcTileId(lp)); if(t){ var v=t.querySelector('.gc-vid'); if(v){ pub.track.attach(v); t.classList.add('has-video'); } } } }); }catch(e){}
    var rps=room.remoteParticipants||room.participants;
    if(rps&&rps.forEach) rps.forEach(function(p){ _gcAddTile(p); var pubs=p.trackPublications||p.tracks; if(pubs&&pubs.forEach) pubs.forEach(function(pub){ if(pub.track) _gcAttach(pub.track,p); }); });
    _gcUpdateCount();
    _lk.room=null; _lk.connected=false; _lk.targetId=null; _lk.callerId=null; _lk.roomName=null; _lk.startTs=null;
  }catch(e){ console.error('upgrade', e); }
}
function _gcMinimize(){ var o=document.getElementById('gcOverlay'); if(o) o.classList.add('minimized'); }'''
s=R(s,"function _gcMinimize(){ var o=document.getElementById('gcOverlay'); if(o) o.classList.add('minimized'); }",FNS,"Fonctions invite 1:1")

# 4) initCallSocket : handler call:upgrade
s=R(s,"SOCKET.off('channel:call:incoming'); SOCKET.on('channel:call:incoming',function(data){ try{ _gcShowIncoming(data); }catch(_e){} });",
      "SOCKET.off('channel:call:incoming'); SOCKET.on('channel:call:incoming',function(data){ try{ _gcShowIncoming(data); }catch(_e){} }); SOCKET.off('call:upgrade'); SOCKET.on('call:upgrade',function(data){ try{ if(_lk.room) _upgradeToGroupFromLk(); }catch(_e){} });",
      "Socket call:upgrade")

# 5) Bouton Ajouter dans l'overlay 1:1
s=R(s,'  <div class="call-top-timer" id="callTopTimer">00:00</div>',
      '  <div class="call-top-timer" id="callTopTimer">00:00</div>\n  <button class="call-add-btn" onclick="_gcOpenInvite(\'lk\')" aria-label="Ajouter des participants"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg></button>',
      "Bouton Ajouter 1:1")

# 6) CSS bouton add
s=R(s,".call-min:active{transform:scale(.9);background:rgba(255,255,255,.2)}",
      ".call-min:active{transform:scale(.9);background:rgba(255,255,255,.2)}\n"
      ".call-add-btn{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));right:16px;z-index:12;width:42px;height:42px;border-radius:50%;border:none;background:rgba(0,200,150,.2);color:#2ee68f;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,transform .12s}\n"
      ".call-add-btn:active{transform:scale(.9);background:rgba(0,200,150,.34)}",
      "CSS bouton add")

# 7) Build
s=R(s,"console.log('PENC build v193 (header discussion + minuteur visible)');",
      "console.log('PENC build v194 (inviter en 1:1 + bascule groupe)');","Build -> v194")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v194")
