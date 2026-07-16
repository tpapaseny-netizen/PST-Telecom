# -*- coding: utf-8 -*-
"""PENC v197 — FIX duree d'appel : utiliser _fmtDur (secondes) au lieu de fmtDur (ms)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v197 — fix duree appel")

# buildCallBubble (log dans la conversation)
s=R(s,"var dur=(answered&&typeof d.duration==='number'&&d.duration>0)?fmtDur(d.duration):'';",
      "var dur=(answered&&typeof d.duration==='number'&&d.duration>0)?_fmtDur(d.duration):'';",
      "buildCallBubble -> _fmtDur")

# preview (liste des conversations)
s=R(s,"var _dur=(_ans&&typeof _cd.duration==='number'&&_cd.duration>0)?fmtDur(_cd.duration):'';",
      "var _dur=(_ans&&typeof _cd.duration==='number'&&_cd.duration>0)?_fmtDur(_cd.duration):'';",
      "preview conv -> _fmtDur")

# Build
s=R(s,"console.log('PENC build v196 (validation invites + bascule 2 cotes)');",
      "console.log('PENC build v197 (fix duree appel sec/ms)');","Build -> v197")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v197")
