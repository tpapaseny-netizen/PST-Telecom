# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v163 (UI appel premium : SVG + overlay soigné)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v163 — UI appel premium")

P='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
MIC=P+'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'
MICOFF=P+'<line x1="2" y1="2" x2="22" y2="22"/><path d="M9 9v3a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V5a3 3 0 0 0-5.9-.7"/><path d="M17 16.9A7 7 0 0 1 5 12v-2"/><path d="M19 10v2a7 7 0 0 1-.1 1.2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>'
CAM=P+'<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
CAMOFF=P+'<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
SPK=P+'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
SPKOFF=P+'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
PHONE='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'
END=P+'<g transform="rotate(135 12 12)">'+PHONE+'</g></svg>'
ACCEPT=P+PHONE+'</svg>'

# 1) Constantes SVG (apres var LiveKit=...)
s=R(s,"var LiveKit=window.LivekitClient||{};",
      "var LiveKit=window.LivekitClient||{};\n"
      "var SVG_CALL_MIC='"+MIC+"'; var SVG_CALL_MICOFF='"+MICOFF+"'; var SVG_CALL_CAM='"+CAM+"'; var SVG_CALL_CAMOFF='"+CAMOFF+"'; var SVG_CALL_SPK='"+SPK+"'; var SVG_CALL_SPKOFF='"+SPKOFF+"';",
      "Constantes SVG appel")

# 2) Markup : remplacer les emojis par SVG
s=R(s,'<button class="call-btn red" onclick="declineCall()">📵</button>',
      '<button class="call-btn red" onclick="declineCall()">'+END+'</button>',"Incoming: refuser SVG")
s=R(s,'<button class="call-btn green" onclick="acceptCall()">📞</button>',
      '<button class="call-btn green" onclick="acceptCall()">'+ACCEPT+'</button>',"Incoming: accepter SVG")
s=R(s,'<button class="call-btn gray" id="btnMute" onclick="toggleMute()" title="Muet">🎙</button>',
      '<button class="call-btn gray" id="btnMute" onclick="toggleMute()" title="Muet">'+MIC+'</button>',"Mute SVG")
s=R(s,'<button class="call-btn red" onclick="endCall()" title="Raccrocher">📵</button>',
      '<button class="call-btn red" onclick="endCall()" title="Raccrocher">'+END+'</button>',"End SVG")
s=R(s,'<button class="call-btn gray" id="btnCam" onclick="toggleCamera()" title="Caméra">📷</button>',
      '<button class="call-btn gray" id="btnCam" onclick="toggleCamera()" title="Caméra">'+CAM+'</button>',"Cam SVG")
s=R(s,'<button class="call-btn gray" id="btnSpk" onclick="toggleSpeaker()" title="Haut-parleur">🔊</button>',
      '<button class="call-btn gray" id="btnSpk" onclick="toggleSpeaker()" title="Haut-parleur">'+SPK+'</button>',"Speaker SVG")

# 3) Toggles : swap SVG via innerHTML
s=R(s,"if(btn){btn.textContent=enabled?'🔇':'🎙';btn.classList.toggle('active-btn',enabled);}",
      "if(btn){btn.innerHTML=enabled?SVG_CALL_MICOFF:SVG_CALL_MIC;btn.classList.toggle('active-btn',enabled);}","toggleMute SVG")
s=R(s,"if(btn){btn.textContent=enabled?'📵':'📷';btn.classList.toggle('active-btn',enabled);}",
      "if(btn){btn.innerHTML=enabled?SVG_CALL_CAMOFF:SVG_CALL_CAM;btn.classList.toggle('active-btn',enabled);}","toggleCamera SVG")
s=R(s,"if(btn){btn.textContent=rv.muted?'🔇':'🔊';btn.classList.toggle('active-btn',rv.muted);}",
      "if(btn){btn.innerHTML=rv.muted?SVG_CALL_SPKOFF:SVG_CALL_SPK;btn.classList.toggle('active-btn',rv.muted);}","toggleSpeaker SVG")

# 4) CSS premium
s=R(s,"  position:fixed;inset:0;z-index:99000;background:#070D1A;",
      "  position:fixed;inset:0;z-index:99000;background:radial-gradient(circle at 50% 28%, #15263f 0%, #070D1A 62%);","Overlay degrade")
s=R(s,".call-av{width:90px;height:90px;border-radius:50%;background:var(--card2);",
      ".call-av{width:112px;height:112px;border-radius:50%;background:var(--card2);box-shadow:0 0 0 8px rgba(255,255,255,.04),0 14px 44px rgba(0,0,0,.55);","Avatar halo")
s=R(s,".call-btn{width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;",
      ".call-btn{width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;color:#fff;","Boutons couleur SVG")
s=R(s,".call-btn.red{background:#e53e3e;}",
      ".call-btn.red{background:#e53e3e;box-shadow:0 8px 24px rgba(229,62,62,.45);}","End ombre")
s=R(s,".call-btn.green{background:#38a169;}",
      ".call-btn.green{background:#38a169;box-shadow:0 8px 24px rgba(56,161,105,.45);}","Accept ombre")

# 5) Build bump
s=R(s,"console.log('PENC build v162 (appels: diagnostic en ligne a l ecran)');",
      "console.log('PENC build v163 (appels: UI premium SVG)');","Build -> v163")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v163.")
