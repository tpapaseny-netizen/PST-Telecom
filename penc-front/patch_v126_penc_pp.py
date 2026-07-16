# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v126 (avatar P teal pour le compte officiel + fallback onerror)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v126 — PP Penc")

# 1) Helpers apres _badgeFor
s=R(s,"function _badgeFor(id){ return (_isPenc(id)||_isVerifiedId(id))?_pencBadge():''; }",
      "function _badgeFor(id){ return (_isPenc(id)||_isVerifiedId(id))?_pencBadge():''; }\n"
      "function _pencAv(){ return '<div class=\"penc-av-p\">P</div>'; }\n"
      "function _avErr(img,init){ try{ img.style.display='none'; var p=img.parentNode; if(p && !p.querySelector('.av-init')){ var sp=document.createElement('span'); sp.className='av-init'; sp.textContent=init||'?'; p.insertBefore(sp,p.firstChild); } }catch(_){} }\n"
      "window._avErr=_avErr;",
      "Helpers _pencAv/_avErr")

# 2) CSS
CSS=('<style id="penc-av-css">\n'
'.penc-av-p{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#00C896;color:#fff;font-weight:800;font-size:22px;line-height:1;}\n'
'.av-init{display:flex;align-items:center;justify-content:center;width:100%;height:100%;}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS penc-av")

# 3) Conv list
s=R(s,"(conv.avatar_url?'<img src=\"'+conv.avatar_url+'\" alt=\"\"/>':'<span>'+init+'</span>')",
      "(_isPenc(conv.other_user_id)?_pencAv():(conv.avatar_url?'<img src=\"'+conv.avatar_url+'\" alt=\"\" onerror=\"_avErr(this,\\''+init+'\\')\"/>':'<span>'+init+'</span>'))",
      "Conv list avatar")

# 4) Chat header
s=R(s,"  av.innerHTML=conv.avatar_url?`<img src=\"${conv.avatar_url}\" alt=\"\"/>`:`<span>${init}</span>`;",
      "  av.innerHTML=_isPenc(conv.other_user_id)?_pencAv():(conv.avatar_url?`<img src=\"${conv.avatar_url}\" alt=\"\" onerror=\"_avErr(this,'${init}')\"/>`:`<span>${init}</span>`);",
      "Chat header avatar")

# 5) Stories tray
s=R(s,"    var av=(user&&user.avatar_url)?('<img src=\"'+user.avatar_url+'\" alt=\"\"/>'):('<span>'+init+'</span>');",
      "    var av=isOff?_pencAv():((user&&user.avatar_url)?('<img src=\"'+user.avatar_url+'\" alt=\"\" onerror=\"_avErr(this,\\''+init+'\\')\"/>'):('<span>'+init+'</span>'));",
      "Stories avatar")

# 6) Build bump
s=R(s,"console.log('PENC build v125 (radio DeglouFM restauree)');",
      "console.log('PENC build v126 (avatar P teal compte officiel + fallback)');","Build -> v126")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v126.")
