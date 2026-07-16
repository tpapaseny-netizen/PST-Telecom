# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v188 (appels de groupe: boutons canal + grille participants + qui parle)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v188 — appels de groupe (front)")

PHONE_PATH='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'

# 1) Systeme _gc (avant joinLKRoom)
GC = '''var _gc={room:null,channelId:null,type:'audio',roomName:null,chanName:''};
var SVG_GC_PHONE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="PHONE_PATH"/></svg>';
var SVG_GC_CAM='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
function _gcTileId(p){ return p.sid||p.identity||'me'; }
function _gcSetTitle(t,sub){ var a=document.getElementById('gcTitle'); if(a) a.textContent=t||'Appel de groupe'; var b=document.getElementById('gcSub'); if(b) b.textContent=sub||''; }
function _gcOpenOverlay(){ var o=document.getElementById('gcOverlay'); if(o){ o.classList.add('active'); o.classList.remove('minimized'); } }
function _gcLayout(){ var g=document.getElementById('gcGrid'); if(!g) return; var n=g.children.length; var cols=n<=1?1:(n<=4?2:3); g.style.gridTemplateColumns='repeat('+cols+',1fr)'; }
function _gcUpdateCount(){ var n=document.querySelectorAll('#gcGrid .gc-tile').length; var el=document.getElementById('gcCount'); if(el) el.textContent=n+' participant'+(n>1?'s':''); }
function _gcAddTile(p, isLocal){ try{ var g=document.getElementById('gcGrid'); if(!g) return; var id=_gcTileId(p); if(document.getElementById('gct_'+id)) return; var name=(p&&(p.name||p.identity))||''; if(isLocal) name=(ME&&(ME.full_name||ME.username))||'Moi'; var t=document.createElement('div'); t.className='gc-tile'+(isLocal?' me':''); t.id='gct_'+id; t.innerHTML='<video class="gc-vid" autoplay playsinline '+(isLocal?'muted':'')+'></video><div class="gc-ph">'+esc(initials(name||'?'))+'</div><div class="gc-nm">'+esc(name||'')+'</div>'; g.appendChild(t); _gcLayout(); _gcUpdateCount(); }catch(e){} }
function _gcRemoveTile(id){ var t=document.getElementById('gct_'+id); if(t) t.remove(); _gcLayout(); _gcUpdateCount(); }
function _gcAttach(track,p){ try{ if(track.kind===LK.Track.Kind.Audio){ var a=track.attach(); a.autoplay=true; a.setAttribute('playsinline',''); a.setAttribute('data-gc','1'); a.style.display='none'; document.body.appendChild(a); return; } if(track.kind===LK.Track.Kind.Video){ var id=_gcTileId(p); var t=document.getElementById('gct_'+id); if(!t){ _gcAddTile(p); t=document.getElementById('gct_'+id); } if(t){ var v=t.querySelector('.gc-vid'); if(v){ track.attach(v); t.classList.add('has-video'); } } } }catch(e){} }
function _gcSpeakers(spk){ try{ var ids={}; (spk||[]).forEach(function(p){ ids[_gcTileId(p)]=1; }); document.querySelectorAll('#gcGrid .gc-tile').forEach(function(t){ var id=t.id.replace('gct_',''); t.classList.toggle('speaking',!!ids[id]); }); }catch(e){} }
async function _gcJoin(){
  try{
    var r=await api('/call/token','POST',{room_name:_gc.roomName,participant_name:ME&&(ME.full_name||ME.username),type:_gc.type});
    if(!r||r.error){ if(typeof showNotif==='function') showNotif('','Appel indisponible',(r&&r.error)||'Config LiveKit','red',null); _gcLeave(); return; }
    var room=new LK.Room({adaptiveStream:true,dynacast:true,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},publishDefaults:{dtx:false,red:true}});
    _gc.room=room;
    room.on(LK.RoomEvent.ParticipantConnected,function(p){ _gcAddTile(p); });
    room.on(LK.RoomEvent.ParticipantDisconnected,function(p){ _gcRemoveTile(_gcTileId(p)); });
    room.on(LK.RoomEvent.TrackSubscribed,function(track,pub,p){ _gcAttach(track,p); });
    room.on(LK.RoomEvent.TrackUnsubscribed,function(track){ try{ track.detach().forEach(function(el){ el.remove(); }); }catch(e){} });
    room.on(LK.RoomEvent.ActiveSpeakersChanged,function(spk){ _gcSpeakers(spk); });
    room.on(LK.RoomEvent.Disconnected,function(){ _gcLeave(); });
    await room.connect(r.url, r.token);
    try{ _acquireWakeLock(); }catch(e){}
    try{ _setupCallMediaSession(_gc.chanName||'Groupe'); }catch(e){}
    try{ await room.localParticipant.setMicrophoneEnabled(true,{echoCancellation:true,noiseSuppression:true,autoGainControl:true}); }catch(e){}
    if(_gc.type==='video'){ try{ await room.localParticipant.setCameraEnabled(true); }catch(e){} }
    _gcAddTile(room.localParticipant, true);
    try{ var lp=room.localParticipant; var lpubs=lp.trackPublications||lp.tracks; if(lpubs&&lpubs.forEach) lpubs.forEach(function(pub){ if(pub.track&&pub.track.kind===LK.Track.Kind.Video){ var t=document.getElementById('gct_'+_gcTileId(lp)); if(t){ var v=t.querySelector('.gc-vid'); if(v){ pub.track.attach(v); t.classList.add('has-video'); } } } }); }catch(e){}
    var rps=room.remoteParticipants||room.participants;
    if(rps&&rps.forEach) rps.forEach(function(p){ _gcAddTile(p); var pubs=p.trackPublications||p.tracks; if(pubs&&pubs.forEach) pubs.forEach(function(pub){ if(pub.track) _gcAttach(pub.track,p); }); });
    _gcUpdateCount();
  }catch(e){ console.error('group join', e); if(typeof showNotif==='function') showNotif('','Erreur', (e&&e.message)||'Connexion impossible','red',null); _gcLeave(); }
}
function startGroupCall(chId, type){
  if(_lk.room){ if(typeof showNotif==='function') showNotif('','Occupe','Tu es deja en appel','orange',null); return; }
  if(_gc.room){ _gcOpenOverlay(); return; }
  if(!SOCKET||!SOCKET.connected){ if(typeof showNotif==='function') showNotif('','Connexion','Serveur en cours de reveil, reessaie','orange',null); try{ SOCKET&&SOCKET.connect&&SOCKET.connect(); }catch(e){} return; }
  var hd=document.querySelector('#chDetail_'+chId+' h2'); var chanName=hd?hd.textContent:'Canal';
  _gc.channelId=chId; _gc.type=type||'audio'; _gc.roomName='chcall_'+chId; _gc.chanName=chanName;
  try{ SOCKET.emit('channel:call:start',{channel_id:chId,type:_gc.type}); }catch(e){}
  _gcOpenOverlay(); _gcSetTitle(chanName, _gc.type==='video'?'Appel video de groupe':'Appel audio de groupe');
  _gcJoin();
}
function _gcShowIncoming(data){
  try{
    if(!data||!data.channel_id) return;
    if(_gc.room || _lk.room) return;
    _gc.channelId=data.channel_id; _gc.roomName=data.room_name||('chcall_'+data.channel_id); _gc.type=data.type||'audio'; _gc.chanName=data.channel_name||'Canal';
    var nm=document.getElementById('gcIncName'); if(nm) nm.textContent=data.channel_name||'Canal';
    var sub=document.getElementById('gcIncSub'); if(sub) sub.textContent=(data.caller_name||'Quelqu un')+' \\u00b7 '+((data.type==='video')?'Appel video de groupe':'Appel audio de groupe');
    var avd=document.getElementById('gcIncAv'); if(avd) avd.innerHTML=data.channel_icon?('<img src="'+data.channel_icon+'"/>'):esc(((data.channel_name||'C')[0]||'C'));
    var o=document.getElementById('gcIncoming'); if(o) o.classList.add('active');
    try{ startRingtone(); }catch(e){}
  }catch(e){}
}
function _gcCloseIncoming(){ var o=document.getElementById('gcIncoming'); if(o) o.classList.remove('active'); try{ stopRingtone(); }catch(e){} }
function _gcAccept(){ _gcCloseIncoming(); if(_lk.room){ if(typeof showNotif==='function') showNotif('','Occupe','Tu es deja en appel','orange',null); return; } if(_gc.room){ _gcOpenOverlay(); return; } _gcOpenOverlay(); _gcSetTitle(_gc.chanName||'Canal', _gc.type==='video'?'Appel video de groupe':'Appel audio de groupe'); _gcJoin(); }
function _gcDecline(){ _gcCloseIncoming(); _gc.channelId=null; _gc.roomName=null; }
function _gcLeave(){
  try{ if(_gc.room){ try{ _gc.room.disconnect(); }catch(e){} } }catch(e){}
  _gc.room=null;
  try{ document.querySelectorAll('audio[data-gc="1"]').forEach(function(a){ a.remove(); }); }catch(e){}
  var g=document.getElementById('gcGrid'); if(g) g.innerHTML='';
  var o=document.getElementById('gcOverlay'); if(o){ o.classList.remove('active'); o.classList.remove('minimized'); }
  try{ _releaseWakeLock(); }catch(e){}
  try{ _clearCallMediaSession(); }catch(e){}
  _gc.channelId=null; _gc.roomName=null;
}
function _gcToggleMute(){ if(!_gc.room) return; var en=_gc.room.localParticipant.isMicrophoneEnabled; _gc.room.localParticipant.setMicrophoneEnabled(!en); var b=document.getElementById('gcMute'); if(b){ b.classList.remove('cb-on','cb-muted'); b.classList.add(en?'cb-muted':'cb-on'); b.innerHTML=en?SVG_CALL_MICOFF:SVG_CALL_MIC; } }
function _gcToggleCam(){ if(!_gc.room) return; var en=_gc.room.localParticipant.isCameraEnabled; _gc.room.localParticipant.setCameraEnabled(!en).then(function(pub){ try{ var t=document.getElementById('gct_'+_gcTileId(_gc.room.localParticipant)); if(t){ var v=t.querySelector('.gc-vid'); if(!en&&pub&&pub.track&&v){ pub.track.attach(v); t.classList.add('has-video'); } if(en){ t.classList.remove('has-video'); } } }catch(e){} }).catch(function(){}); var b=document.getElementById('gcCam'); if(b){ b.classList.remove('cb-on','cb-off'); b.classList.add(en?'cb-off':'cb-on'); b.innerHTML=en?SVG_CALL_CAMOFF:SVG_CALL_CAM; } }
function _gcMinimize(){ var o=document.getElementById('gcOverlay'); if(o) o.classList.add('minimized'); }
async function joinLKRoom(roomName, type, isRecipient){'''
GC=GC.replace("PHONE_PATH",PHONE_PATH)
s=R(s,"async function joinLKRoom(roomName, type, isRecipient){",GC,"Systeme _gc")

# 2) Boutons d'appel dans le header du Groupe-Canal
s=R(s,"    var hd='<div class=\"ch-detail-hd\">'",
      "    var gcBtns=(ctype==='group'&&(isFollowing||canManage))?('<button class=\"ch-call-btn\" title=\"Appel audio\" onclick=\"startGroupCall(\\''+chId+'\\',\\'audio\\')\">'+SVG_GC_PHONE+'</button><button class=\"ch-call-btn\" title=\"Appel video\" onclick=\"startGroupCall(\\''+chId+'\\',\\'video\\')\">'+SVG_GC_CAM+'</button>'):'';\n"
      "    var hd='<div class=\"ch-detail-hd\">'","gcBtns var")
s=R(s,"+hdBtns+'</div>';","+gcBtns+hdBtns+'</div>';","gcBtns dans header")

# 3) Overlays (avant deleteToast)
MIC_SVG='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'
CAM_SVG='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>'
END_SVG='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(135 12 12)"><path d="'+PHONE_PATH+'"/></g></svg>'
OVL=('<div id="gcOverlay">\n'
'  <div class="gc-top"><button class="call-min" onclick="_gcMinimize()" aria-label="Reduire"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button><div class="gc-head"><div class="gc-title" id="gcTitle">Appel de groupe</div><div class="gc-sub" id="gcSub"></div><div class="gc-count" id="gcCount">1 participant</div></div></div>\n'
'  <div class="gc-grid" id="gcGrid"></div>\n'
'  <div class="gc-btns">\n'
'    <button class="call-btn cb-on" id="gcMute" onclick="_gcToggleMute()" title="Muet">'+MIC_SVG+'</button>\n'
'    <button class="call-btn red call-end" onclick="_gcLeave()" title="Quitter">'+END_SVG+'</button>\n'
'    <button class="call-btn cb-on" id="gcCam" onclick="_gcToggleCam()" title="Camera">'+CAM_SVG+'</button>\n'
'  </div>\n'
'</div>\n'
'<div id="gcIncoming">\n'
'  <div class="gc-inc-card">\n'
'    <div class="gc-inc-av" id="gcIncAv"></div>\n'
'    <div class="gc-inc-name" id="gcIncName">Canal</div>\n'
'    <div class="gc-inc-sub" id="gcIncSub"></div>\n'
'    <div class="gc-inc-btns"><button class="gc-inc-decline" onclick="_gcDecline()">Ignorer</button><button class="gc-inc-accept" onclick="_gcAccept()">Rejoindre</button></div>\n'
'  </div>\n'
'</div>\n')
s=R(s,'<div id="deleteToast">',OVL+'<div id="deleteToast">',"Overlays groupe")

# 4) CSS
CSS=(".cp-end:active{transform:scale(.9)}\n"
".ch-call-btn{width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s}\n"
".ch-call-btn:active{background:rgba(255,255,255,.28)}\n"
"#gcOverlay{position:fixed;inset:0;z-index:99100;background:radial-gradient(circle at 50% 22%,#13243c,#070d1a 65%);display:none;flex-direction:column}\n"
"#gcOverlay.active{display:flex}\n"
"#gcOverlay.minimized{display:none!important}\n"
".gc-top{display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top,0px)) 14px 8px}\n"
".gc-top .call-min{position:static}\n"
".gc-head{flex:1;min-width:0}\n"
".gc-title{color:#fff;font-weight:800;font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
".gc-sub{color:rgba(255,255,255,.6);font-size:12.5px}\n"
".gc-count{color:#7fe9c4;font-size:12px;margin-top:1px}\n"
".gc-grid{flex:1;display:grid;grid-template-columns:1fr;gap:8px;padding:8px 12px;overflow-y:auto;align-content:center}\n"
".gc-tile{position:relative;border-radius:16px;overflow:hidden;background:#0e1a2b;aspect-ratio:3/4;min-height:120px;display:flex;align-items:center;justify-content:center;border:2px solid transparent;transition:border-color .2s,box-shadow .2s}\n"
".gc-tile.speaking{border-color:#00E0A6;box-shadow:0 0 0 1px #00E0A6,0 0 18px rgba(0,224,166,.4)}\n"
".gc-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;background:#000}\n"
".gc-tile.has-video .gc-vid{display:block}\n"
".gc-tile.has-video .gc-ph{display:none}\n"
".gc-ph{width:74px;height:74px;border-radius:50%;background:linear-gradient(140deg,#1e3a5f,#0f2138);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:26px}\n"
".gc-nm{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.5);color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:8px;max-width:82%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:2}\n"
".gc-btns{display:flex;gap:26px;justify-content:center;align-items:center;padding:14px 0 calc(22px + env(safe-area-inset-bottom,0px))}\n"
"#gcIncoming{position:fixed;inset:0;z-index:99150;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center}\n"
"#gcIncoming.active{display:flex}\n"
".gc-inc-card{width:86%;max-width:340px;background:rgba(20,28,40,.97);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:28px 22px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6)}\n"
".gc-inc-av{width:84px;height:84px;border-radius:24px;margin:0 auto 14px;background:linear-gradient(140deg,#1e3a5f,#0f2138);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:34px;overflow:hidden}\n"
".gc-inc-av img{width:100%;height:100%;object-fit:cover}\n"
".gc-inc-name{color:#fff;font-size:21px;font-weight:800}\n"
".gc-inc-sub{color:#9aa0a6;font-size:13.5px;margin-top:5px}\n"
".gc-inc-btns{display:flex;gap:12px;margin-top:22px}\n"
".gc-inc-decline,.gc-inc-accept{flex:1;padding:13px;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer}\n"
".gc-inc-decline{background:rgba(255,255,255,.1);color:#cfd6dd}\n"
".gc-inc-accept{background:linear-gradient(145deg,#34e98b,#10b06a);color:#fff;box-shadow:0 8px 22px rgba(16,176,106,.45)}")
s=R(s,".cp-end:active{transform:scale(.9)}",CSS,"CSS groupe")

# 5) Socket handler dans initCallSocket
s=R(s,"function initCallSocket(){",
      "function initCallSocket(){\n  try{ if(SOCKET){ SOCKET.off('channel:call:incoming'); SOCKET.on('channel:call:incoming',function(data){ try{ _gcShowIncoming(data); }catch(_e){} }); } }catch(_e){}","Socket channel:call:incoming")

# 6) Garde-fous occupe
s=R(s,"  if(_lk.room){showNotif('\U0001F4DE','Appel en cours','Tu es déjà en communication','orange',null);return;}",
      "  if(_lk.room){showNotif('\U0001F4DE','Appel en cours','Tu es déjà en communication','orange',null);return;}\n  if(typeof _gc!=='undefined'&&_gc.room){showNotif('\U0001F4DE','Appel de groupe','Tu es déjà en appel de groupe','orange',null);return;}",
      "Garde startCall")
s=R(s,"  SOCKET.on('call:incoming',function(data){\n    if(_lk.room){",
      "  SOCKET.on('call:incoming',function(data){\n    if(_lk.room||(typeof _gc!=='undefined'&&_gc.room)){","Garde call:incoming")

# 7) Build
s=R(s,"console.log('PENC build v187 (videos canaux comme discussions)');",
      "console.log('PENC build v188 (appels de groupe canaux)');","Build -> v188")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v188")
