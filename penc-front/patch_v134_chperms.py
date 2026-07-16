# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v134 (canaux etape 3 : type badge + permissions d'ecriture)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v134 — permissions & badge de type")

# 1) Variables type / canPost / badge / notice apres isFollowing
VARS=("var isFollowing=(ch.is_following===true);\n"
"    var ctype=ch.type||'broadcast';\n"
"    var readOnly=(ch.read_only===true);\n"
"    var canPost=(typeof ch.can_post==='boolean')?ch.can_post:canManage;\n"
"    var _cnt=(ch.followers||[]).length;\n"
"    var _ic=(ctype==='group')\n"
"      ?'<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/></svg>'\n"
"      :'<svg width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m3 11 18-5v12L3 14v-3z\"/></svg>';\n"
"    var typeBadge=_ic+'<span style=\"font-weight:600;\">'+(ctype==='group'?'Groupe':'Diffusion')+'</span><span style=\"opacity:.65;\">· '+_cnt+' '+(ctype==='group'?'membres':'abonnés')+'</span>'+(readOnly?'<span style=\"opacity:.9;\">· Lecture seule</span>':'');\n"
"    var _why=(ctype==='broadcast')?'Canal de diffusion — seuls le propriétaire et les admins publient.':(readOnly?'Mode lecture seule — seuls les admins écrivent.':'Vous ne pouvez pas publier ici.');\n"
"    var roNotice='<div class=\"ch-input-bar\" style=\"justify-content:center;color:var(--muted);font-size:12px;gap:7px;text-align:center;\">'\n"
"      +'<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"flex-shrink:0;\"><path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>'\n"
"      +'<span>'+_why+'</span></div>';")
s=R(s,"var isFollowing=(ch.is_following===true);",VARS,"Variables type/canPost/badge")

# 2) En-tete : nom + sous-ligne badge de type
s=R(s,"+'<h2 style=\"flex:1;font-size:15px;font-weight:800;\">'+esc(ch.name)+'</h2>'",
      "+'<div style=\"flex:1;min-width:0;\"><h2 style=\"font-size:15px;font-weight:800;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">'+esc(ch.name)+'</h2><div style=\"font-size:11px;color:rgba(255,255,255,.72);display:flex;align-items:center;gap:5px;margin-top:1px;\">'+typeBadge+'</div></div>'",
      "En-tete: badge de type")

# 3) Barre de saisie selon canPost
s=R(s,"var inputBar=canManage\n      ?('","var inputBar=canPost\n      ?('","Input bar: canPost")
s=R(s,":'';\n    ov.innerHTML=hd+postsHtml+inputBar;",
      ":(isFollowing?roNotice:'');\n    ov.innerHTML=hd+postsHtml+inputBar;","Input bar: notice lecture seule")

# 4) Focus selon canPost
s=R(s,"if(canManage) setTimeout(function(){var inp=document.getElementById('chInput_'+chId);if(inp)inp.focus();},200);",
      "if(canPost) setTimeout(function(){var inp=document.getElementById('chInput_'+chId);if(inp)inp.focus();},200);",
      "Focus: canPost")

# 5) Build bump
s=R(s,"console.log('PENC build v133 (canaux: choix du type a la creation)');",
      "console.log('PENC build v134 (canaux: badge de type + permissions ecriture)');","Build -> v134")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v134.")
