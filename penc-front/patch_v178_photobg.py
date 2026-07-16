# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v178 (photo appelant en fond flou plein ecran - effet iPhone)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v178 — photo fond flou")

# 1) Markup : couches photo + scrim
s=R(s,'  <div class="pic-bg"></div>\n  <div class="pic-top">',
      '  <div class="pic-bg"></div>\n  <div class="pic-photo-bg" id="incomingPhotoBg"></div>\n  <div class="pic-photo-scrim"></div>\n  <div class="pic-top">',
      "Couches photo+scrim")

# 2) JS : appliquer la photo dans call:incoming
s=R(s,"    o.classList.add('active');\n    startRingtone();",
      "    var pb=document.getElementById('incomingPhotoBg');\n"
      "    if(data.caller_avatar){ if(pb) pb.style.backgroundImage='url(\"'+data.caller_avatar+'\")'; o.classList.add('has-photo'); }\n"
      "    else { if(pb) pb.style.backgroundImage=''; o.classList.remove('has-photo'); }\n"
      "    o.classList.add('active');\n    startRingtone();",
      "JS photo dans call:incoming")

# 3) CSS
CSS=("@keyframes picUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}\n"
".pic-photo-bg{position:absolute;inset:-30px;z-index:1;background-size:cover;background-position:center;filter:blur(30px) brightness(.5) saturate(1.1);transform:scale(1.18);opacity:0;transition:opacity .6s;pointer-events:none}\n"
"#incomingCallOverlay.has-photo .pic-photo-bg{opacity:1}\n"
".pic-photo-scrim{position:absolute;inset:0;z-index:1;opacity:0;transition:opacity .6s;background:linear-gradient(180deg,rgba(5,8,15,.32) 0%,rgba(5,8,15,.6) 55%,rgba(5,8,15,.9) 100%);pointer-events:none}\n"
"#incomingCallOverlay.has-photo .pic-photo-scrim{opacity:1}")
s=R(s,"@keyframes picUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}",CSS,"CSS photo fond")

# 4) Build
s=R(s,"console.log('PENC build v177 (duree reelle + connexion instantanee)');",
      "console.log('PENC build v178 (photo appelant en fond flou)');","Build -> v178")

io.open(FN,"wb").write(s.encode("utf-8"))
print("\nTermine. messager.html -> v178.")
