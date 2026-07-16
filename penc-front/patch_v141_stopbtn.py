# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v141 (#4 bouton stop vocal premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v141 — bouton stop premium")

# 1) CSS recording premium + swap d'icone
s=R(s,".wa-mic-btn.recording{background:#FF0000;color:#FFFFFF;}",
      ".wa-mic-btn.recording{background:#FF4444 !important;color:#fff;box-shadow:0 4px 16px rgba(255,68,68,.5);animation:micPulse 1.2s ease-in-out infinite !important;}\n"
      "@keyframes micPulse{0%,100%{transform:scale(1);box-shadow:0 4px 16px rgba(255,68,68,.5);}50%{transform:scale(1.08);box-shadow:0 7px 22px rgba(255,68,68,.7);}}\n"
      "#micBtn .stop-ic{display:none;align-items:center;justify-content:center;}\n"
      "#micBtn .mic-ic{display:flex;align-items:center;justify-content:center;}\n"
      "#micBtn.recording .mic-ic{display:none;}\n"
      "#micBtn.recording .stop-ic{display:flex;}",
      "CSS bouton stop premium")

# 2) Markup : micro + stop
OLDMK='''<button class="wa-mic-btn" id="micBtn" onclick="toggleRec(event)" title="Vocal"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>'''
NEWMK='''<button class="wa-mic-btn" id="micBtn" onclick="toggleRec(event)" title="Vocal"><span class="mic-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></span><span class="stop-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="3"/></svg></span></button>'''
s=R(s,OLDMK,NEWMK,"Markup micro + stop")

# 3) Build bump
s=R(s,"console.log('PENC build v140 (bandeaux enregistrement + envoi vocal premium)');",
      "console.log('PENC build v141 (bouton stop vocal premium)');","Build -> v141")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v141.")
