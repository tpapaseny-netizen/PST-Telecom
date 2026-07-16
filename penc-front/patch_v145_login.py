# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v145 (#3 refonte premium page de connexion - CSS only)"""
import io, sys
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v145 — refonte connexion premium")

START="#screen-auth{ background:linear-gradient(180deg,#FFFFFF 0%,#F5F5F5 100%); color:#1a1a1a; justify-content:center; align-items:center; overflow-y:auto; padding:24px 18px; }"
END="#screen-auth .af-userstat.no{ color:#E03131; }"
ci=s.count(START); cj=s.count(END)
if ci!=1 or cj!=1:
    print("  [ECHEC] marqueurs:",ci,cj); sys.exit(1)
i=s.find(START); j=s.find(END)+len(END)

NEW=r'''#screen-auth{ background:#0A0A0A; background-image:radial-gradient(circle at 0% 0%, rgba(0,200,150,.20), transparent 42%), radial-gradient(circle at 100% 100%, rgba(45,156,255,.17), transparent 42%); color:#fff; justify-content:center; align-items:center; overflow-y:auto; padding:24px 18px; }
#screen-auth .auth-wrap{ width:100%; max-width:420px; margin:auto; }
#screen-auth .auth-logo{ text-align:center; margin-bottom:24px; }
#screen-auth .auth-logo-p{ display:inline-flex; margin-bottom:12px; border-radius:18px; filter:drop-shadow(0 0 34px rgba(0,200,150,.55)) drop-shadow(0 10px 22px rgba(0,200,150,.28)); animation:authBreathe 3.4s ease-in-out infinite; }
@keyframes authBreathe{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.06); } }
#screen-auth .auth-logo-name{ font-family:'Syne',sans-serif; font-weight:800; font-size:27px; letter-spacing:7px; color:#fff; margin-top:2px; }
#screen-auth .auth-logo-sub{ color:rgba(255,255,255,.55); font-size:13.5px; margin-top:4px; font-weight:500; }
#screen-auth .auth-box{ background:rgba(255,255,255,.05); -webkit-backdrop-filter:blur(20px); backdrop-filter:blur(20px); max-width:420px; border:1px solid rgba(0,200,150,.18); box-shadow:0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05); border-radius:28px; padding:40px 30px; }
#screen-auth .auth-tabs{ position:relative; display:flex; gap:0; background:rgba(255,255,255,.05); border-radius:14px; padding:5px; margin-bottom:24px; }
#screen-auth .auth-tabs::before{ content:""; position:absolute; top:5px; left:5px; width:calc(50% - 5px); height:calc(100% - 10px); border-radius:10px; background:linear-gradient(135deg, rgba(0,200,150,.22), rgba(45,156,255,.18)); box-shadow:0 2px 10px rgba(0,0,0,.3); transition:transform .35s cubic-bezier(.34,1.56,.5,1); }
#screen-auth .auth-tabs:has(#tab-register.active)::before{ transform:translateX(100%); }
#screen-auth .auth-tab{ position:relative; z-index:1; flex:1; text-align:center; padding:11px; border-radius:10px; font-weight:700; font-size:14px; color:rgba(255,255,255,.5); cursor:pointer; transition:color .25s; }
#screen-auth .auth-tab.active{ background:transparent; box-shadow:none; color:#fff; }
#screen-auth .auth-form{ animation:authFade .3s ease; }
#screen-auth .auth-form > *{ animation:authFieldIn .5s cubic-bezier(.2,.7,.3,1) both; }
#screen-auth .auth-form > *:nth-child(1){ animation-delay:.04s; }
#screen-auth .auth-form > *:nth-child(2){ animation-delay:.10s; }
#screen-auth .auth-form > *:nth-child(3){ animation-delay:.16s; }
#screen-auth .auth-form > *:nth-child(4){ animation-delay:.22s; }
#screen-auth .auth-form > *:nth-child(5){ animation-delay:.28s; }
#screen-auth .auth-form > *:nth-child(6){ animation-delay:.34s; }
#screen-auth .auth-form > *:nth-child(7){ animation-delay:.40s; }
#screen-auth .auth-form > *:nth-child(8){ animation-delay:.46s; }
@keyframes authFieldIn{ from{ opacity:0; transform:translateY(12px); } to{ opacity:1; transform:translateY(0); } }
#screen-auth .form-group{ margin-bottom:15px; }
#screen-auth .form-label{ display:block; text-transform:none; font-size:12.5px; font-weight:600; color:rgba(255,255,255,.6); letter-spacing:.2px; margin-bottom:7px; transition:color .2s; }
#screen-auth .form-group:focus-within .form-label{ color:#00C896; }
#screen-auth .auth-field{ position:relative; display:flex; align-items:center; }
#screen-auth .af-ic{ position:absolute; left:18px; top:50%; transform:translateY(-50%); width:18px; height:18px; color:rgba(255,255,255,.45); pointer-events:none; transition:color .2s; }
#screen-auth .auth-field:focus-within .af-ic{ color:#00C896; }
#screen-auth .form-input{ width:100%; box-sizing:border-box; height:56px; border:1.5px solid rgba(255,255,255,.10); border-radius:14px; padding:0 16px 0 48px; font-size:16px; background:rgba(255,255,255,.05); color:#fff; transition:border-color .2s, box-shadow .2s, background .2s; }
#screen-auth .form-input::placeholder{ color:rgba(255,255,255,.32); }
#screen-auth .form-input:focus{ outline:none; border-color:#00C896; background:rgba(255,255,255,.08); box-shadow:0 0 0 4px rgba(0,200,150,.14); }
#screen-auth .af-eye{ position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; padding:8px; color:rgba(255,255,255,.45); cursor:pointer; display:flex; align-items:center; }
#screen-auth .btn-primary{ position:relative; overflow:hidden; display:block; width:100%; height:56px; background:linear-gradient(135deg,#00C896,#2D9CFF); color:#fff; border:none; border-radius:18px; font-size:17px; font-weight:700; letter-spacing:.3px; cursor:pointer; box-shadow:0 12px 30px rgba(0,200,150,.32), 0 4px 14px rgba(45,156,255,.22); transition:transform .12s, box-shadow .25s, opacity .2s; margin-top:8px; }
#screen-auth .btn-primary::after{ content:""; position:absolute; top:0; left:-130%; width:55%; height:100%; background:linear-gradient(120deg, transparent, rgba(255,255,255,.4), transparent); transform:skewX(-20deg); transition:left .6s ease; }
#screen-auth .btn-primary:hover::after{ left:140%; }
#screen-auth .btn-primary:hover{ box-shadow:0 14px 36px rgba(0,200,150,.45), 0 6px 18px rgba(45,156,255,.3); }
#screen-auth .btn-primary:active{ transform:scale(.97); }
#screen-auth .btn-primary:disabled{ opacity:.6; cursor:default; box-shadow:none; }
#screen-auth .auth-link{ text-align:center; margin-top:18px; color:#00C896; font-size:14px; font-weight:600; text-decoration:none; cursor:pointer; }
#screen-auth .auth-error{ display:none; align-items:center; gap:10px; background:rgba(255,68,68,.12); border:none; border-left:3px solid #FF4444; color:#FF9A9A; border-radius:10px; padding:11px 14px; font-size:13px; line-height:1.35; margin-bottom:14px; animation:authSlideDown .3s ease, authShake .5s ease .05s; }
#screen-auth .auth-error svg{ flex-shrink:0; width:18px; height:18px; }
@keyframes authShake{ 0%,100%{ transform:translateX(0); } 18%,54%{ transform:translateX(-6px); } 36%,72%{ transform:translateX(6px); } 90%{ transform:translateX(-2px); } }
#screen-auth .af-userstat{ font-size:12px; margin-top:7px; min-height:16px; display:flex; align-items:center; gap:6px; font-weight:600; }
#screen-auth .af-userstat.ok{ color:#00E0A0; }
#screen-auth .af-userstat.no{ color:#FF6B6B; }'''

s=s[:i]+NEW+s[j:]
print("  [OK]   Bloc CSS auth remplace (premium dark glassmorphism)")

s=s.replace("console.log('PENC build v144 (bouton envoyer canal bien positionne)');",
            "console.log('PENC build v145 (refonte premium page de connexion)');")
print("  [OK]   Build -> v145")

io.open(FN,"wb").write(s.encode("utf-8"))
print("Termine. messager.html -> v145.")
