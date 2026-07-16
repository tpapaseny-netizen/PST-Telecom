# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v122 (alignement strict des bulles: max 75%, colonnes gauche/droite)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v122 — alignement bulles")

# 1) Plafonner la largeur du corps a 75%
s=R(s,"max-width:calc(100% - 40px);min-width:0;width:fit-content;",
      "max-width:75%;min-width:0;width:fit-content;","msg-body max-width 75%")

# 2) Renfort alignement (colonnes nettes) via un bloc CSS dedie
CSS=('<style id="align-v2-css">\n'
'.msg-row.me .msg-body{ align-items:flex-end; margin-left:auto; }\n'
'.msg-row.them .msg-body{ align-items:flex-start; margin-right:auto; }\n'
'.msg-row.me .msg-bubble, .msg-row.them .msg-bubble{ max-width:100%; }\n'
'.messages-area{ padding-left:12px; padding-right:12px; }\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS renfort alignement")

# 3) Verif badge profil deja present (info)
assert "(ME&&ME.verified)?_pencBadge()" in s, "badge profil absent !"
print("  [OK]   badge profil deja present")

# 4) Build bump
s=R(s,"console.log('PENC build v121 (statut multi-photos: slides + barre segmentee + +N)');",
      "console.log('PENC build v122 (alignement strict des bulles: max 75%)');","Build -> v122")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v122.")
