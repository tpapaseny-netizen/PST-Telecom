# -*- coding: utf-8 -*-
"""PENC v200 — sonnerie d'appel entrant generee (Web Audio API), melodie voix/video"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v200 — sonnerie generee")

# 1) Declaration : ajouter _ringVibe
s=R(s,"var _ringCtx=null, _ringTimer=null;","var _ringCtx=null, _ringTimer=null, _ringVibe=null;","Decl _ringVibe")

# 2) Remplacer startRingtone + stopRingtone (slice par index)
a=s.find("function startRingtone(){")
b=s.find("var SVG_END_SM=")
if a<0 or b<0 or b<a:
    print("  [ECHEC] bornes startRingtone/SVG_END_SM"); sys.exit(1)

NEW=(
"function startRingtone(){\n"
"  try{\n"
"    stopRingtone();\n"
"    var _type=((typeof _lk!=='undefined'&&_lk&&_lk.type)||(typeof _gc!=='undefined'&&_gc&&_gc.type)||'audio');\n"
"    var video=(_type==='video');\n"
"    // Vibration : suit le mode silencieux du telephone (gere par l'OS)\n"
"    try{ if(navigator.vibrate){ var _vp=video?[120,80,120,80,170]:[150,110,150]; navigator.vibrate(_vp); _ringVibe=setInterval(function(){ try{ navigator.vibrate(_vp); }catch(e){} },1400); } }catch(e){}\n"
"    var Ctx=window.AudioContext||window.webkitAudioContext;\n"
"    if(!Ctx) return;\n"
"    _ringCtx=new Ctx();\n"
"    // Voix : 523/659/784 Hz (doux) | Video : 659/784/1047 Hz (dynamique)\n"
"    var freqs=video?[659.25,783.99,1046.50]:[523.25,659.25,783.99];\n"
"    var NOTE=0.20, peak=video?0.26:0.20, atk=video?0.012:0.03;\n"
"    var seq=function(){\n"
"      if(!_ringCtx) return;\n"
"      try{ if(_ringCtx.state==='suspended') _ringCtx.resume(); }catch(e){}\n"
"      var t=_ringCtx.currentTime+0.02;\n"
"      freqs.forEach(function(f,i){\n"
"        var st=t+i*NOTE;\n"
"        var g=_ringCtx.createGain();\n"
"        g.gain.setValueAtTime(0.0001,st);\n"
"        g.gain.exponentialRampToValueAtTime(peak,st+atk);\n"
"        g.gain.exponentialRampToValueAtTime(0.0001,st+NOTE*0.95);\n"
"        g.connect(_ringCtx.destination);\n"
"        var o=_ringCtx.createOscillator(); o.type=video?'triangle':'sine'; o.frequency.value=f; o.connect(g);\n"
"        o.start(st); o.stop(st+NOTE);\n"
"        var g2=_ringCtx.createGain();\n"
"        g2.gain.setValueAtTime(0.0001,st);\n"
"        g2.gain.exponentialRampToValueAtTime(peak*0.38,st+atk);\n"
"        g2.gain.exponentialRampToValueAtTime(0.0001,st+NOTE*0.9);\n"
"        g2.connect(_ringCtx.destination);\n"
"        var o2=_ringCtx.createOscillator(); o2.type='sine'; o2.frequency.value=f*2; o2.connect(g2);\n"
"        o2.start(st); o2.stop(st+NOTE);\n"
"      });\n"
"    };\n"
"    seq();\n"
"    // periode = 3 notes x 200ms (600ms) + 800ms de pause = 1400ms\n"
"    _ringTimer=setInterval(seq, 1400);\n"
"  }catch(e){ console.warn('startRingtone:',e); }\n"
"}\n"
"function stopRingtone(){\n"
"  try{ if(_ringTimer){ clearInterval(_ringTimer); _ringTimer=null; } }catch(e){}\n"
"  try{ if(_ringVibe){ clearInterval(_ringVibe); _ringVibe=null; } }catch(e){}\n"
"  try{ if(navigator.vibrate) navigator.vibrate(0); }catch(e){}\n"
"  try{ if(_ringCtx){ _ringCtx.close(); _ringCtx=null; } }catch(e){}\n"
"}\n"
)
s=s[:a]+NEW+s[b:]
print("  [OK]   startRingtone + stopRingtone remplaces")

# 3) Build
s=R(s,"console.log('PENC build v199 (statut en ligne fiable via serveur)');",
      "console.log('PENC build v200 (sonnerie generee voix/video)');","Build -> v200")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v200")
