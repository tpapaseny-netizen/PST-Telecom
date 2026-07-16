# -*- coding: utf-8 -*-
"""PENC v202 — page de connexion : reduire espacements pour tenir sans scroll"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v202 — connexion sans scroll")

# 1) Padding carte 40px -> 24px
s=R(s,"border-radius:28px; padding:40px 30px; }","border-radius:28px; padding:24px 22px; }","Padding carte")
# 2) Espace logo -> carte
s=R(s,"#screen-auth .auth-logo{ text-align:center; margin-bottom:24px; }","#screen-auth .auth-logo{ text-align:center; margin-bottom:14px; }","Marge logo")
# 3) Espace logo-P -> nom
s=R(s,"#screen-auth .auth-logo-p{ display:inline-flex; margin-bottom:12px;","#screen-auth .auth-logo-p{ display:inline-flex; margin-bottom:8px;","Marge logo-p")
# 4) Marge sous les onglets
s=R(s,"padding:5px; margin-bottom:24px; }","padding:5px; margin-bottom:16px; }","Marge onglets")
# 5) Marge des champs
s=R(s,"#screen-auth .form-group{ margin-bottom:15px; }","#screen-auth .form-group{ margin-bottom:11px; }","Marge champs")
# 6) Badges : marge + gap
s=R(s,"justify-content:center; gap:8px; margin-top:22px;","justify-content:center; gap:6px; margin-top:14px;","Badges marge/gap")
# 7) Badges : taille + padding
s=R(s,"gap:6px; font-size:12px; font-weight:600; color:rgba(255,255,255,.72);","gap:6px; font-size:11.5px; font-weight:600; color:rgba(255,255,255,.72);","Badge taille")
s=R(s,"border-radius:20px; padding:7px 12px; }","border-radius:20px; padding:5px 10px; }","Badge padding")
# 8) Trust : marge
s=R(s,"align-items:center; gap:14px; margin-top:16px;","align-items:center; gap:14px; margin-top:10px;","Trust marge")

# 9) Petit ecran : compacter + badges sur 2 colonnes (3 lignes de 2)
ANCHOR="#screen-auth .auth-terms a{ color:#00C896; text-decoration:none; font-weight:600; }"
MEDIA=(ANCHOR+"\n"
"@media (max-height:760px){\n"
"  #screen-auth{ padding:14px 16px; }\n"
"  #screen-auth .auth-logo{ margin-bottom:10px; }\n"
"  #screen-auth .auth-logo-p svg{ width:48px; height:48px; }\n"
"  #screen-auth .auth-logo-name{ font-size:23px; }\n"
"  #screen-auth .auth-logo-sub{ font-size:12px; }\n"
"  #screen-auth .auth-box{ padding:18px 18px; }\n"
"  #screen-auth .auth-tabs{ margin-bottom:12px; }\n"
"  #screen-auth .form-group{ margin-bottom:9px; }\n"
"  #screen-auth .form-input{ height:48px; }\n"
"  #screen-auth .btn-primary{ height:48px; }\n"
"  #screen-auth .auth-features{ margin-top:10px; gap:5px; }\n"
"  #screen-auth .auth-feat{ flex:1 1 calc(50% - 5px); justify-content:center; padding:5px 8px; font-size:11px; }\n"
"  #screen-auth .auth-trust{ margin-top:8px; }\n"
"}")
s=R(s,ANCHOR,MEDIA,"Media petit ecran")

# Build
s=R(s,"console.log('PENC build v201 (appel directionnel + rappel au clic)');",
      "console.log('PENC build v202 (connexion sans scroll)');","Build -> v202")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v202")
