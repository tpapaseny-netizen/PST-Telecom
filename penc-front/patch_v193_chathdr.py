# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v193 (header discussion: minuteur visible + icones appel colorees + retrait argent)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v193 — header discussion + minuteur")

# 1) Retirer l'icone argent du header
s=R(s,'      <div class="icon-btn" style="width:34px;height:34px;" onclick="openMoneySheet()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg></div>\n',
      "","Retrait icone argent")

# 2) Boutons appel/video colores + stroke plus net
s=R(s,'<button class="chat-call-btn" onclick="startCall(\'audio\')" title="Appel audio"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"',
      '<button class="chat-call-btn cc-audio" onclick="startCall(\'audio\')" title="Appel audio"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
      "Bouton audio colore")
s=R(s,'<button class="chat-call-btn" onclick="startCall(\'video\')" title="Appel vidéo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"',
      '<button class="chat-call-btn cc-video" onclick="startCall(\'video\')" title="Appel vidéo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
      "Bouton video colore")

# 3) CSS couleurs boutons + minuteur top
s=R(s,".chat-call-btn:active{background:rgba(255,255,255,.2);}",
      ".chat-call-btn:active{background:rgba(255,255,255,.2);}\n"
      ".chat-call-btn{width:37px;height:37px}\n"
      ".chat-call-btn.cc-audio{background:rgba(46,230,143,.18)}\n"
      ".chat-call-btn.cc-audio svg{stroke:#2ee68f}\n"
      ".chat-call-btn.cc-audio:active{background:rgba(46,230,143,.32)}\n"
      ".chat-call-btn.cc-video{background:rgba(91,157,255,.2)}\n"
      ".chat-call-btn.cc-video svg{stroke:#6aa8ff}\n"
      ".chat-call-btn.cc-video:active{background:rgba(91,157,255,.34)}\n"
      ".call-top-timer{position:absolute;top:calc(18px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:11;display:none;align-items:center;gap:7px;padding:6px 15px;border-radius:999px;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:16px;font-weight:700;letter-spacing:.5px;font-variant-numeric:tabular-nums}\n"
      ".call-top-timer.show{display:inline-flex}\n"
      ".call-top-timer::before{content:'';width:8px;height:8px;border-radius:50%;background:#2ee68f;box-shadow:0 0 8px #2ee68f;animation:cpDot 1.4s ease-in-out infinite}",
      "CSS boutons + minuteur top")

# 4) Markup minuteur top dans l'overlay (apres bouton reduire)
s=R(s,'<div id="callOverlay">\n  <button class="call-min" onclick="minimizeCall()" aria-label="Réduire"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>',
      '<div id="callOverlay">\n  <button class="call-min" onclick="minimizeCall()" aria-label="Réduire"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>\n  <div class="call-top-timer" id="callTopTimer">00:00</div>',
      "Markup minuteur top")

# 5) startCallTimer : mettre a jour + afficher le minuteur top
s=R(s,"    var pe=document.getElementById('callPillTimer'); if(pe) pe.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;\n  },1000);",
      "    var pe=document.getElementById('callPillTimer'); if(pe) pe.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;\n    var tt=document.getElementById('callTopTimer'); if(tt){ tt.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec; tt.classList.add('show'); }\n  },1000);",
      "startCallTimer maj top")

# 6) cleanupCall : cacher le minuteur top
s=R(s,"  try{ var _lvv=document.getElementById('localVideo'),_rvv=document.getElementById('remoteVideo'); if(_lvv){_lvv.style.display='none';} if(_rvv){_rvv.style.display='none';} }catch(_v){}",
      "  try{ var _lvv=document.getElementById('localVideo'),_rvv=document.getElementById('remoteVideo'); if(_lvv){_lvv.style.display='none';} if(_rvv){_rvv.style.display='none';} }catch(_v){}\n  try{ var _tt=document.getElementById('callTopTimer'); if(_tt) _tt.classList.remove('show'); }catch(_tv){}",
      "cleanupCall cache top timer")

# 7) Build
s=R(s,"console.log('PENC build v192 (stabilisation discussions)');",
      "console.log('PENC build v193 (header discussion + minuteur visible)');","Build -> v193")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v193")
