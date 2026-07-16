# -*- coding: utf-8 -*-
"""PENC v195 — (1) retirer chrono du haut, garder celui sous le nom
                (2) blinder la duree d'appel loggee"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v195")

# 1) Retirer le markup du chrono du haut (garder le bouton Ajouter)
s=R(s,'  <div class="call-top-timer" id="callTopTimer">00:00</div>\n  <button class="call-add-btn"',
      '  <button class="call-add-btn"',"Markup callTopTimer retire")

# 2) Retirer la mise a jour du chrono du haut dans startCallTimer
s=R(s,"    var tt=document.getElementById('callTopTimer'); if(tt){ tt.textContent=(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec; tt.classList.add('show'); }\n",
      "","startCallTimer top maj retiree")

# 3) Retirer le CSS du chrono du haut
s=R(s,".call-top-timer::before{content:'';width:8px;height:8px;border-radius:50%;background:#2ee68f;box-shadow:0 0 8px #2ee68f;animation:cpDot 1.4s ease-in-out infinite}","","CSS ::before")
s=R(s,".call-top-timer{position:absolute;top:calc(18px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:11;display:none;align-items:center;gap:7px;padding:6px 15px;border-radius:999px;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:16px;font-weight:700;letter-spacing:.5px;font-variant-numeric:tabular-nums}","","CSS base")
s=R(s,".call-top-timer.show{display:inline-flex}","","CSS .show")

# 4) Blinder la duree loggee (max du timestamp et du compteur)
s=R(s,"var payload={call_type:(_lk.type==='video'?'video':'audio'), status:status, duration:(_lk.connected?_callElapsed():0)};",
      "var payload={call_type:(_lk.type==='video'?'video':'audio'), status:status, duration:(_lk.connected?Math.max(_callElapsed(),(_lk.seconds||0)):0)};",
      "duration bulletproof")

# 5) Build
s=R(s,"console.log('PENC build v194 (inviter en 1:1 + bascule groupe)');",
      "console.log('PENC build v195 (chrono unique + duree appel)');","Build -> v195")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v195")
