# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v170 (historique des appels dans la conversation)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v170 — historique appels")

# 1) Cas 'call' dans le rendu des bulles
s=R(s,"  else if(msg.type==='money') bubble=buildMoneyCard(msg);\n",
      "  else if(msg.type==='money') bubble=buildMoneyCard(msg);\n  else if(msg.type==='call') bubble=buildCallBubble(msg);\n",
      "Cas call dans appendMsg")

# 2) buildCallBubble + _logCall (avant buildVoiceBubble)
SVG_PH='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
SVG_VD='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
CB=("function buildCallBubble(msg){\n"
"  var d={}; try{ d=JSON.parse(msg.content||'{}'); }catch(e){}\n"
"  var ct=(d.call_type==='video')?'video':'audio';\n"
"  var answered=(d.status==='answered');\n"
"  var dur=(answered&&typeof d.duration==='number'&&d.duration>0)?fmtDur(d.duration):'';\n"
"  var label=answered?((ct==='video'?'Appel vidéo':'Appel audio')+(dur?(' · '+dur):'')):'Appel manqué';\n"
"  var col=answered?'#14b8a6':'#ef4444';\n"
"  var svg=ct==='video'?'"+SVG_VD+"':'"+SVG_PH+"';\n"
"  return '<div class=\"call-log\" style=\"--cc:'+col+'\"><span class=\"cl-ic\">'+svg+'</span><span class=\"cl-tx\">'+label+'</span></div>';\n"
"}\n"
"function _logCall(status){\n"
"  try{\n"
"    if(!_lk.isCaller || _lk.logged) return;\n"
"    var cid=_lk.convId||CUR_CONV; if(!cid||!SOCKET) return;\n"
"    _lk.logged=true;\n"
"    var payload={call_type:(_lk.type==='video'?'video':'audio'), status:status, duration:(_lk.connected?(_lk.seconds||0):0)};\n"
"    SOCKET.emit('message:send',{conversation_id:cid,type:'call',content:JSON.stringify(payload)},function(res){ if(res&&res.message){ res.message.is_mine=true; if(res.message.conversation_id===CUR_CONV){ appendMsg(res.message); if(window._stickBottom)_stickBottom(); } } });\n"
"  }catch(e){}\n"
"}\n"
"function buildVoiceBubble(msg){")
s=R(s,"function buildVoiceBubble(msg){",CB,"buildCallBubble + _logCall")

# 3) CSS call-log
s=R(s,".chat-notif .cn-sub{color:#aab0b6;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".chat-notif .cn-sub{color:#aab0b6;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
      ".call-log{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}\n"
      ".call-log .cl-ic{display:flex;align-items:center;color:var(--cc)}\n"
      ".call-log .cl-tx{color:#e6e8ea;font-size:13.5px;font-weight:600}",
      "CSS call-log")

# 4) startCall : mémoriser convId + reset logged
s=R(s,"  _lk.type=type; _lk.targetId=targetId; _lk.isCaller=true;",
      "  _lk.type=type; _lk.targetId=targetId; _lk.isCaller=true; _lk.convId=CUR_CONV; _lk.logged=false;",
      "startCall convId/logged")

# 5) Wire _logCall dans les fins d'appel (avant cleanupCall)
s=R(s,"  if(_lk.callerId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.callerId});\n  cleanupCall();\n  _callEndToast('Appel terminé', _fmtDur(_secs));",
      "  if(_lk.callerId) SOCKET&&SOCKET.emit('call:end',{target_id:_lk.callerId});\n  _logCall(_lk.connected?'answered':'cancelled');\n  cleanupCall();\n  _callEndToast('Appel terminé', _fmtDur(_secs));",
      "Wire endCall")
s=R(s,"      var _secs=_lk.seconds;\n      cleanupCall();\n      _callEndToast('Appel terminé', _fmtDur(_secs));",
      "      var _secs=_lk.seconds;\n      _logCall('answered');\n      cleanupCall();\n      _callEndToast('Appel terminé', _fmtDur(_secs));",
      "Wire ParticipantDisconnected")
s=R(s,"    var _secs=_lk.seconds; cleanupCall(); _callEndToast('Appel terminé', _fmtDur(_secs));",
      "    var _secs=_lk.seconds; _logCall(_lk.connected?'answered':'cancelled'); cleanupCall(); _callEndToast('Appel terminé', _fmtDur(_secs));",
      "Wire call:ended")
s=R(s,"    cleanupCall(); _callEndToast('Appel refusé','');",
      "    _logCall('missed'); cleanupCall(); _callEndToast('Appel refusé','');","Wire call:declined")
s=R(s,"    cleanupCall(); _callEndToast('Occupé','La personne est en communication');",
      "    _logCall('missed'); cleanupCall(); _callEndToast('Occupé','La personne est en communication');","Wire call:busy")
s=R(s,"SOCKET.emit('call:end',{target_id:_lk.targetId}); cleanupCall(); _callEndToast('Pas de réponse','La personne ne répond pas'); }",
      "SOCKET.emit('call:end',{target_id:_lk.targetId}); _logCall('missed'); cleanupCall(); _callEndToast('Pas de réponse','La personne ne répond pas'); }","Wire ring timeout")

# 6) onNewMsg : pas de notif "nouveau message" pour les logs d'appel
s=R(s,"    showChatNotif({convId:cid,senderName:sender,fullName:(msg.sender&&msg.sender.full_name)||sender,preview:body,type:msg.type});\n    playNotifSound(msg.type);",
      "    if(msg.type!=='call'){ showChatNotif({convId:cid,senderName:sender,fullName:(msg.sender&&msg.sender.full_name)||sender,preview:body,type:msg.type}); playNotifSound(msg.type); }",
      "onNewMsg skip notif pour call")

# 7) Aperçu liste
s=R(s,"  if(msg.type==='money') return '💸 Transfert';",
      "  if(msg.type==='money') return '💸 Transfert';\n  if(msg.type==='call') return '📞 Appel';","msgPreview call")

# Build
s=R(s,"console.log('PENC build v169 (notifications messages premium)');",
      "console.log('PENC build v170 (historique des appels)');","Build -> v170")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v170.")
