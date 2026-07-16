# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v128 (couleurs du Senegal: bandeau tricolore sous l'en-tete)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v128 — couleurs Senegal")

CSS=('<style id="senegal-css">\n'
'/* Couleurs du Senegal : vert #00853F, jaune #FDEF42, rouge #E31B23 */\n'
'#screen-main .top-bar{ position:relative; }\n'
'#screen-main .top-bar::after{ content:""; position:absolute; left:0; right:0; bottom:0; height:4px; background:linear-gradient(to right,#00853F 0 33.33%,#FDEF42 33.33% 66.66%,#E31B23 66.66% 100%); }\n'
'#screen-main .top-bar::before{ content:"\\2605"; position:absolute; left:50%; bottom:-3px; transform:translateX(-50%); font-size:9px; line-height:1; color:#00853F; z-index:1; text-shadow:0 0 1px rgba(0,0,0,.3); }\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS bandeau Senegal")

s=R(s,"console.log('PENC build v127 (badge compteur icone app: Badging API)');",
      "console.log('PENC build v128 (couleurs du Senegal: bandeau tricolore)');","Build -> v128")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v128.")
