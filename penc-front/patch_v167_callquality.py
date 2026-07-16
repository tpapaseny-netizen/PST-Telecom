# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v167 (chrono synchronisé + qualité audio)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v167 — qualité appel")

# A) Room : audio capture defaults + publish (dtx/red pour réseaux faibles)
s=R(s,"_lk.room=new LK.Room({adaptiveStream:true,dynacast:true});",
      "_lk.room=new LK.Room({adaptiveStream:true,dynacast:true,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},publishDefaults:{dtx:true,red:true}});",
      "Room audio defaults")

# B) Audio distant : attacher ET ajouter au DOM (sinon pas de son fiable)
s=R(s,"      if(track.kind===LK.Track.Kind.Audio) track.attach();",
      "      if(track.kind===LK.Track.Kind.Audio){ var _ae=track.attach(); try{ _ae.autoplay=true; _ae.setAttribute('playsinline',''); _ae.style.display='none'; _ae.id='penc-remote-audio'; document.body.appendChild(_ae); }catch(_e){} }",
      "Audio distant DOM")

# C) Micro avec traitements
s=R(s,"    await _lk.room.localParticipant.setMicrophoneEnabled(true);",
      "    await _lk.room.localParticipant.setMicrophoneEnabled(true,{echoCancellation:true,noiseSuppression:true,autoGainControl:true});",
      "Micro traitements")

# D) Chrono synchronisé : si l'autre est déjà présent à la connexion
s=R(s,"    await _lk.room.connect(r.url, r.token);\n    // Activer micro",
      "    await _lk.room.connect(r.url, r.token);\n"
      "    // Chrono synchronisé : si l'autre est déjà dans la room (destinataire qui rejoint après l'appelant)\n"
      "    try{ var _rp=_lk.room.remoteParticipants||_lk.room.participants; var _n=_rp?(typeof _rp.size==='number'?_rp.size:Object.keys(_rp).length):0; if(_n>0){ _lk.connected=true; clearTimeout(_lk.ringTimeout); stopRingtone(); startCallTimer(); } }catch(_e){}\n"
      "    // Activer micro",
      "Chrono synchronisé")

# E) startCallTimer : afficher 00:00 immédiatement
s=R(s,"  _lk.seconds=0; clearInterval(_lk.timerInterval);",
      "  _lk.seconds=0; clearInterval(_lk.timerInterval);\n  try{ var _t0=document.getElementById('callTimer'); if(_t0) _t0.textContent='00:00'; }catch(_e){}",
      "Chrono 00:00 immédiat")

# Build
s=R(s,"console.log('PENC build v166 (appels: ecoute entrante au boot - LE fix final)');",
      "console.log('PENC build v167 (appels: chrono sync + qualite audio)');","Build -> v167")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v167.")
