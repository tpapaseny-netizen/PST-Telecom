# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v165 (definir startRingtone/stopRingtone : LE fix des appels)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v165 — sonnerie")

FNS=(r'''var _ringCtx=null, _ringTimer=null;
function startRingtone(){
  try{
    stopRingtone();
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx) return;
    _ringCtx=new Ctx();
    var ring=function(){
      if(!_ringCtx) return;
      try{ if(_ringCtx.state==='suspended') _ringCtx.resume(); }catch(e){}
      var t=_ringCtx.currentTime;
      [0,0.4].forEach(function(off){
        var g=_ringCtx.createGain();
        g.gain.setValueAtTime(0.0001,t+off);
        g.gain.exponentialRampToValueAtTime(0.22,t+off+0.04);
        g.gain.exponentialRampToValueAtTime(0.0001,t+off+0.32);
        g.connect(_ringCtx.destination);
        var o=_ringCtx.createOscillator(); o.type='sine'; o.frequency.value=480; o.connect(g);
        var o2=_ringCtx.createOscillator(); o2.type='sine'; o2.frequency.value=440; o2.connect(g);
        o.start(t+off); o.stop(t+off+0.34);
        o2.start(t+off); o2.stop(t+off+0.34);
      });
    };
    ring();
    _ringTimer=setInterval(ring, 2400);
  }catch(e){ console.warn('startRingtone:',e); }
}
function stopRingtone(){
  try{ if(_ringTimer){ clearInterval(_ringTimer); _ringTimer=null; } }catch(e){}
  try{ if(_ringCtx){ _ringCtx.close(); _ringCtx=null; } }catch(e){}
}
var _lk={''')
s=R(s,"var _lk={",FNS,"Definir startRingtone/stopRingtone")

s=R(s,"console.log('PENC build v164 (appels: garde socket + busy assoupli)');",
      "console.log('PENC build v165 (appels: sonnerie definie - LE fix)');","Build -> v165")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v165.")
