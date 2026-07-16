# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v181 (bandeau Quitter Penc PREMIUM)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v181 — bandeau Quitter premium")
# 1) Remplacer la ligne showNotif (sans matcher l'emoji)
lines=s.split('\n'); done=False
for i,ln in enumerate(lines):
    if 'Appuyez encore' in ln and '3-exitCount' in ln and 'showNotif' in ln:
        lines[i]='    try{ _showExitBanner(3-exitCount); }catch(e){}'; done=True; break
if not done: print("  [ECHEC] ligne exit introuvable"); sys.exit(1)
s='\n'.join(lines); print("  [OK]   showNotif -> _showExitBanner")
# 2) Fonction (avant la IIFE exit ou n'importe ou dans script principal) - on l'ajoute avant 'function onReady'
FN_JS=("function _showExitBanner(remaining){\n"
"  try{\n"
"    var b=document.getElementById('exitBanner');\n"
"    if(!b){ b=document.createElement('div'); b.id='exitBanner'; b.className='exit-banner';\n"
"      b.innerHTML='<span class=\"eb-ic\"><svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"19\" y1=\"12\" x2=\"5\" y2=\"12\"/><polyline points=\"12 19 5 12 12 5\"/></svg></span><span class=\"eb-tx\"><span class=\"eb-t\">Quitter Penc</span><span class=\"eb-s\" id=\"ebSub\"></span></span><span class=\"eb-bar\"><i></i></span>';\n"
"      document.body.appendChild(b);\n"
"    }\n"
"    var sub=b.querySelector('#ebSub'); if(sub) sub.textContent='Appuyez encore '+remaining+'\\u00d7 pour quitter';\n"
"    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');\n"
"    var ic=b.querySelector('.eb-ic'); if(ic){ ic.classList.remove('nudge'); void ic.offsetWidth; ic.classList.add('nudge'); }\n"
"    var bar=b.querySelector('.eb-bar i'); if(bar){ bar.style.animation='none'; void bar.offsetWidth; bar.style.animation='ebBar 2s linear forwards'; }\n"
"    clearTimeout(window._ebTO); window._ebTO=setTimeout(function(){ if(b) b.classList.remove('show'); },2000);\n"
"  }catch(e){}\n"
"}\n"
"  function onReady(){ if(ready) return; ready=true; pushGuard(); }")
s=R(s,"  function onReady(){ if(ready) return; ready=true; pushGuard(); }",FN_JS,"Fonction _showExitBanner")
# 3) CSS (apres .call-end-toast.show)
CSS=(".call-end-toast.show{transform:translateX(-50%) translateY(0);opacity:1}\n"
".exit-banner{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%) translateY(-26px);z-index:99520;display:flex;align-items:center;gap:12px;min-width:262px;max-width:88vw;padding:13px 16px;background:#1A1A1A;border:1px solid rgba(255,255,255,.07);border-left:3px solid #ff8a3d;border-radius:14px;box-shadow:0 16px 44px rgba(0,0,0,.5);opacity:0;transition:transform .4s cubic-bezier(.2,.9,.3,1.2),opacity .3s;pointer-events:none;overflow:hidden}\n"
".exit-banner.show{transform:translateX(-50%) translateY(0);opacity:1}\n"
".exit-banner .eb-ic{flex:0 0 auto;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,138,61,.16);color:#ff9a52}\n"
".exit-banner .eb-ic.nudge{animation:ebNudge .4s ease}\n"
"@keyframes ebNudge{0%,100%{transform:translateX(0)}40%{transform:translateX(-4px)}}\n"
".exit-banner .eb-tx{display:flex;flex-direction:column;gap:2px;min-width:0}\n"
".exit-banner .eb-t{color:#fff;font-weight:700;font-size:15px;line-height:1.2}\n"
".exit-banner .eb-s{color:#9aa0a6;font-size:12.5px;line-height:1.2}\n"
".exit-banner .eb-bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:transparent}\n"
".exit-banner .eb-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff8a3d,#ffb070);transform-origin:left}\n"
"@keyframes ebBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}")
s=R(s,".call-end-toast.show{transform:translateX(-50%) translateY(0);opacity:1}",CSS,"CSS exit-banner")
s=R(s,"console.log('PENC build v180 (fermer X nouvelle conversation)');",
      "console.log('PENC build v181 (bandeau Quitter premium)');","Build -> v181")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v181")
