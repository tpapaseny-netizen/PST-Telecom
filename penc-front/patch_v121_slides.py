# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v121 (affichage album: slides + barre segmentee + miniature +N)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v121 — affichage slides")

# 1) Variable d'etat
s=R(s,"let svList = [], svIdx = 0, svTimer = null;",
      "let svList = [], svIdx = 0, svTimer = null; window._svSlide = 0;","Var _svSlide")

# 2) Reset a l'ouverture
s=R(s,"window._svGroupIdx=null; svList=items; svIdx=0; svPaused=false;",
      "window._svGroupIdx=null; svList=items; svIdx=0; window._svSlide=0; svPaused=false;","Reset open")

# 3) Reset dans svAdvanceGroup
s=R(s,"if(items.length){ window._svGroupIdx=ni; svList=items; svIdx=0; window._svLastFloat=null; renderSV(); startSVTimer(); return true; }",
      "if(items.length){ window._svGroupIdx=ni; svList=items; svIdx=0; window._svSlide=0; window._svLastFloat=null; renderSV(); startSVTimer(); return true; }","Reset advanceGroup")

# 4) Helper + svNext/svPrev
s=R(s,
"function svNext(){ svIdx++; if(svIdx>=svList.length){ if(svAdvanceGroup())return; closeSV(); return; } renderSV(); startSVTimer(); }\nfunction svPrev(){ if(svIdx>0){ svIdx--; renderSV(); startSVTimer(); } }",
"function _svSlides(sv){ return (sv && sv.type==='image' && Array.isArray(sv.media_urls) && sv.media_urls.length>1) ? sv.media_urls : null; }\nfunction svNext(){ var _sv=svList[svIdx]; var _sl=_svSlides(_sv); if(_sl && (window._svSlide||0) < _sl.length-1){ window._svSlide=(window._svSlide||0)+1; renderSV(); startSVTimer(); return; } svIdx++; window._svSlide=0; if(svIdx>=svList.length){ if(svAdvanceGroup())return; closeSV(); return; } renderSV(); startSVTimer(); }\nfunction svPrev(){ if((window._svSlide||0)>0){ window._svSlide=(window._svSlide||0)-1; renderSV(); startSVTimer(); return; } if(svIdx>0){ svIdx--; window._svSlide=0; renderSV(); startSVTimer(); } }",
"svNext/svPrev slides")

# 5) Timer interval
s=R(s,
"  svTimer=setInterval(function(){if(svPaused)return;svIdx++;if(svIdx>=svList.length){if(typeof svAdvanceGroup==='function'&&svAdvanceGroup())return;closeSV();return;}renderSV();startSVTimer();},((sv.duration&&sv.duration>0)?sv.duration:10)*1000);",
"  svTimer=setInterval(function(){if(svPaused)return;var _sv=svList[svIdx];var _sl=_svSlides(_sv);if(_sl&&(window._svSlide||0)<_sl.length-1){window._svSlide=(window._svSlide||0)+1;renderSV();startSVTimer();return;}svIdx++;window._svSlide=0;if(svIdx>=svList.length){if(typeof svAdvanceGroup==='function'&&svAdvanceGroup())return;closeSV();return;}renderSV();startSVTimer();},((sv.duration&&sv.duration>0)?sv.duration:10)*1000);",
"Timer slides")

# 6) renderSV : calcul slide + _svCur
s=R(s,
"  var sv=svList[svIdx]; if(!sv){closeSV();return;}\n  window._svCur={url:sv.media_url||'',type:sv.type}; setTimeout(_svAttachLongPress,30);",
"  var sv=svList[svIdx]; if(!sv){closeSV();return;}\n  var _slUrl=null; var _sl0=_svSlides(sv); if(_sl0){ var _ci=window._svSlide||0; if(_ci<0)_ci=0; if(_ci>_sl0.length-1)_ci=_sl0.length-1; window._svSlide=_ci; _slUrl=_sl0[_ci]; } else { window._svSlide=0; }\n  window._svCur={url:(_slUrl||sv.media_url||''),type:sv.type}; setTimeout(_svAttachLongPress,30);",
"renderSV calcul slide")

# 6b) Barre de progression segmentee
s=R(s,
"  document.getElementById('svProgress').innerHTML=svList.map(function(_,i){\n    return '<div class=\"sv-seg'+(i<svIdx?' done':i===svIdx?' active':'')+'\"></div>';\n  }).join('');",
"  var _slPB=_svSlides(sv);\n  if(_slPB){ var _curPB=window._svSlide||0; document.getElementById('svProgress').innerHTML=_slPB.map(function(_,i){ return '<div class=\"sv-seg'+(i<_curPB?' done':i===_curPB?' active':'')+'\"></div>'; }).join(''); }\n  else { document.getElementById('svProgress').innerHTML=svList.map(function(_,i){ return '<div class=\"sv-seg'+(i<svIdx?' done':i===svIdx?' active':'')+'\"></div>'; }).join(''); }",
"Barre segmentee album")

# 6c) Image src = slide courant
s=R(s,'<img id="svImg" src="\'+sv.media_url+\'"',
      '<img id="svImg" src="\'+(_slUrl||sv.media_url)+\'"',
      "Image slide src")

# 7) CSS miniature +N
CSS=('<style id="thumb-more-css">\n'
'.sv-thumb{position:relative;}\n'
'.sv-thumb-more{position:absolute;right:2px;bottom:2px;background:rgba(0,0,0,.72);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;line-height:1.4;}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS miniature +N")

# 7b) Miniature +N (autres)
s=R(s,
"(last.type==='image'&&last.media_url?('<div class=\"sv-thumb\"><img src=\"'+last.media_url+'\" alt=\"\"/></div>'):'')",
"(last.type==='image'&&last.media_url?('<div class=\"sv-thumb\"><img src=\"'+last.media_url+'\" alt=\"\"/>'+((Array.isArray(last.media_urls)&&last.media_urls.length>1)?'<span class=\"sv-thumb-more\">+'+(last.media_urls.length-1)+'</span>':'')+'</div>'):'')",
"Miniature +N (autres)")

# 7c) Miniature +N (mien)
s=R(s,
"(mine.length&&mine[mine.length-1].type==='image'?('<div class=\"sv-thumb\"><img src=\"'+mine[mine.length-1].media_url+'\" alt=\"\"/></div>'):'')",
"(mine.length&&mine[mine.length-1].type==='image'?('<div class=\"sv-thumb\"><img src=\"'+mine[mine.length-1].media_url+'\" alt=\"\"/>'+((Array.isArray(mine[mine.length-1].media_urls)&&mine[mine.length-1].media_urls.length>1)?'<span class=\"sv-thumb-more\">+'+(mine[mine.length-1].media_urls.length-1)+'</span>':'')+'</div>'):'')",
"Miniature +N (mien)")

# 8) Build bump
s=R(s,"console.log('PENC build v120 (statut multi-photos: selection jusqu a 10)');",
      "console.log('PENC build v121 (statut multi-photos: slides + barre segmentee + +N)');","Build -> v121")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v121.")
