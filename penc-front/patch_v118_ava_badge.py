# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v118 (badge bleu dans le coin de l'avatar du statut)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v118 — badge coin avatar")

CSS=('<style id="ava-badge-css">\n'
'.ava-badge-corner{position:absolute;right:2px;bottom:2px;width:18px;height:18px;border-radius:50%;background:#0099FF;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.35);box-sizing:border-box;z-index:2;}\n'
'.sv-author-av-sm{overflow:visible;}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS badge coin")

FUNC=('function _avBadgeCorner(id){\n'
'  if(!((typeof _isPenc==="function"&&_isPenc(id))||(typeof _isVerifiedId==="function"&&_isVerifiedId(id)))) return "";\n'
'  return \'<span class="ava-badge-corner"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>\';\n'
'}\n')
s=R(s,"function buildSVAuthorBar(sv){",FUNC+"function buildSVAuthorBar(sv){","Fonction _avBadgeCorner")

s=R(s,"+'<div class=\"sv-author-av-sm\">'+av+'</div>'",
      "+'<span style=\"position:relative;display:inline-flex;flex:none;\"><div class=\"sv-author-av-sm\">'+av+'</div>'+_avBadgeCorner(sv.user_id)+'</span>'",
      "Badge coin (plein ecran)")

s=R(s,"<div class=\"sv-av'+(unseen?' unseen':'')+'\">'+av+'</div>",
      "<div class=\"sv-av'+(unseen?' unseen':'')+'\">'+av+_avBadgeCorner(uid)+'</div>",
      "Badge coin (liste)")

s=R(s,"console.log('PENC build v117 (menu piece jointe: Photo/Video/Fichier)');",
      "console.log('PENC build v118 (badge bleu dans le coin de l avatar du statut)');","Build -> v118")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v118.")
