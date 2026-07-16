# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v176 (ecran appel entrant PREMIUM)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v176 — appel entrant premium")

PHONE='<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'
DECL='<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(135 12 12)"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></g></svg>'
NEW=('<div id="incomingCallOverlay">\n'
'  <div class="pic-bg"></div>\n'
'  <div class="pic-top">\n'
'    <div class="pic-brand"><span class="pic-brand-dot"></span>Penc</div>\n'
'    <div class="pic-incoming">Appel entrant</div>\n'
'  </div>\n'
'  <div class="pic-center">\n'
'    <div class="pic-avwrap">\n'
'      <span class="pic-ring"></span><span class="pic-ring d2"></span><span class="pic-ring d3"></span>\n'
'      <div class="pic-av" id="incomingAv"></div>\n'
'    </div>\n'
'    <div class="pic-name" id="incomingName">Inconnu</div>\n'
'    <div class="pic-type"><span id="incomingType">Appel audio</span></div>\n'
'  </div>\n'
'  <div class="pic-actions">\n'
'    <div class="pic-act"><button class="pic-btn pic-decline" onclick="declineCall()" aria-label="Refuser">'+DECL+'</button><div class="pic-lbl">Refuser</div></div>\n'
'    <div class="pic-act"><button class="pic-btn pic-accept" onclick="acceptCall()" aria-label="Accepter">'+PHONE+'</button><div class="pic-lbl">Accepter</div></div>\n'
'  </div>\n'
'</div>\n')

start='<div id="incomingCallOverlay">'; end='<!-- \u2550\u2550 APPEL ACTIF \u2550\u2550 -->'
i=s.find(start); j=s.find(end)
if i<0 or j<0 or j<i: print("  [ECHEC] bornes overlay introuvables", i, j); sys.exit(1)
s=s[:i]+NEW+s[j:]
print("  [OK]   Markup incoming remplace")

# CSS premium (apres keyframes callPulse)
CSS=("@keyframes callPulse{0%{transform:scale(.9);opacity:1;}100%{transform:scale(1.4);opacity:0;}}\n"
"#incomingCallOverlay{justify-content:space-between;overflow:hidden}\n"
".pic-bg{position:absolute;inset:0;z-index:0;background:radial-gradient(120% 80% at 50% 18%, #1b3556 0%, #0a1426 55%, #05080f 100%)}\n"
".pic-bg::after{content:'';position:absolute;left:50%;top:13%;width:330px;height:330px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle, rgba(46,230,143,.16), transparent 65%);filter:blur(34px)}\n"
".pic-top{position:relative;z-index:2;width:100%;padding-top:calc(34px + env(safe-area-inset-top,0px));text-align:center;animation:picFade .5s ease both}\n"
".pic-brand{display:inline-flex;align-items:center;gap:7px;color:#fff;font-weight:800;font-size:17px;letter-spacing:.5px}\n"
".pic-brand-dot{width:9px;height:9px;border-radius:50%;background:#2ee68f;box-shadow:0 0 10px #2ee68f}\n"
".pic-incoming{color:rgba(255,255,255,.55);font-size:13.5px;margin-top:4px;letter-spacing:.4px}\n"
".pic-center{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}\n"
".pic-avwrap{position:relative;width:132px;height:132px;display:flex;align-items:center;justify-content:center;margin-bottom:24px}\n"
".pic-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(46,230,143,.45);animation:picRing 2.4s ease-out infinite}\n"
".pic-ring.d2{animation-delay:.8s}\n.pic-ring.d3{animation-delay:1.6s}\n"
"@keyframes picRing{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.7);opacity:0}}\n"
".pic-av{position:relative;z-index:3;width:120px;height:120px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800;color:#fff;background:linear-gradient(140deg,#1e3a5f,#0f2138);border:3px solid rgba(255,255,255,.16);box-shadow:0 18px 50px rgba(0,0,0,.55),0 0 0 10px rgba(255,255,255,.03);animation:picBob 3s ease-in-out infinite}\n"
".pic-av img{width:100%;height:100%;object-fit:cover}\n"
"@keyframes picBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}\n"
".pic-name{color:#fff;font-size:27px;font-weight:800;letter-spacing:-.4px;text-align:center;padding:0 24px}\n"
".pic-type{display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.85);font-size:13.5px;font-weight:600}\n"
".pic-actions{position:relative;z-index:2;display:flex;gap:64px;padding-bottom:calc(46px + env(safe-area-inset-bottom,0px));animation:picUp .5s ease both}\n"
".pic-act{display:flex;flex-direction:column;align-items:center;gap:11px}\n"
".pic-btn{width:70px;height:70px;border-radius:50%;border:none;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;transition:transform .12s}\n"
".pic-btn:active{transform:scale(.88)}\n"
".pic-decline{background:linear-gradient(145deg,#ff5a5a,#e02424);box-shadow:0 12px 30px rgba(224,36,36,.5)}\n"
".pic-accept{background:linear-gradient(145deg,#34e98b,#10b06a);box-shadow:0 12px 30px rgba(16,176,106,.5);animation:picPulse 1.4s ease-in-out infinite}\n"
"@keyframes picPulse{0%,100%{box-shadow:0 12px 30px rgba(16,176,106,.5),0 0 0 0 rgba(46,230,143,.5)}50%{box-shadow:0 12px 30px rgba(16,176,106,.5),0 0 0 14px rgba(46,230,143,0)}}\n"
".pic-lbl{color:rgba(255,255,255,.65);font-size:13px;font-weight:600;letter-spacing:.3px}\n"
"@keyframes picFade{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}\n"
"@keyframes picUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}")
s=R(s,"@keyframes callPulse{0%{transform:scale(.9);opacity:1;}100%{transform:scale(1.4);opacity:0;}}",CSS,"CSS premium incoming")

# Build
s=R(s,"console.log('PENC build v175 (note qualite appel)');",
      "console.log('PENC build v176 (appel entrant premium)');","Build -> v176")

io.open(FN,"wb").write(s.encode("utf-8"))
print("\nTermine. messager.html -> v176.")
