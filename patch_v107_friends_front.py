# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v107 (B3 : retour clair quand l'envoi est bloque)"""
import io, sys
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v107 — B3 front")

OLD="else MSGS[CUR_CONV].push(Object.assign({},res.message,{reply_to:replyData}));\n      }\n    }});"
NEW=("else MSGS[CUR_CONV].push(Object.assign({},res.message,{reply_to:replyData}));\n      }\n"
     "    } else if(res&&res.error){ var _te=document.querySelector('[data-mid=\"'+tmp.id+'\"]'); if(_te) _te.remove(); "
     "if(MSGS[CUR_CONV]) MSGS[CUR_CONV]=MSGS[CUR_CONV].filter(function(m){return m.id!==tmp.id;}); "
     "if(_cv){ _cv.last_message=null; if(typeof renderConvList==='function') renderConvList(); } "
     "showNotif(res.need_friend?'👋':'⚠️', res.need_friend?'Demande envoyée':'Message', res.error||'Échec', res.need_friend?'blue':'red', null); }});")

n=s.count(OLD)
if n!=1:
    print("  [ECHEC] callback envoi : %d (attendu 1)"%n); sys.exit(1)
s=s.replace(OLD,NEW)
print("  [OK]   Branche erreur (need_friend)")

# Build bump
b="console.log('PENC build v106 (B1: push iOS installe + anti-spam)');"
b2="console.log('PENC build v107 (B3: amitie obligatoire avant de discuter)');"
if s.count(b)!=1:
    print("  [ECHEC] build marker"); sys.exit(1)
s=s.replace(b,b2); print("  [OK]   Build -> v107")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v107.")
