# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v185 (canaux: medias stables anti-saut + lecteur video premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v185 — canaux medias premium")

PLAY='<svg viewBox="0 0 24 24" width="26" height="26" fill="#0d1722"><polygon points="6 4 20 12 6 20 6 4"/></svg>'
FS='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>'

# 1) Fonctions lecteur (avant _chMedia)
FNS=("var _chvCur=null;\n"
"function _chvToggle(id){ var v=document.getElementById(id); if(!v) return; var w=v.closest('.ch-media');\n"
"  if(v.paused){ if(_chvCur && _chvCur!==v){ try{_chvCur.pause();}catch(e){} var pw=_chvCur.closest&&_chvCur.closest('.ch-media'); if(pw){pw.classList.remove('playing');pw.classList.add('paused');} }\n"
"    v.play().then(function(){ _chvCur=v; if(w){w.classList.add('playing');w.classList.remove('paused');} }).catch(function(){}); }\n"
"  else { v.pause(); if(w){w.classList.remove('playing');w.classList.add('paused');} } }\n"
"function _chvMeta(id){ var v=document.getElementById(id); if(!v) return; var w=v.closest('.ch-media'); if(w) w.classList.add('loaded'); var t=document.getElementById(id+'_t'); if(t) t.textContent=fmtTimeV(0)+' / '+fmtTimeV(v.duration||0); }\n"
"function _chvTime(id){ var v=document.getElementById(id); if(!v||!v.duration) return; var f=document.getElementById(id+'_f'); if(f) f.style.width=((v.currentTime/v.duration)*100)+'%'; var t=document.getElementById(id+'_t'); if(t) t.textContent=fmtTimeV(v.currentTime)+' / '+fmtTimeV(v.duration); }\n"
"function _chvSeekClick(id,e){ var v=document.getElementById(id); if(!v||!v.duration) return; var r=e.currentTarget.getBoundingClientRect(); var ratio=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); v.currentTime=ratio*v.duration; _chvTime(id); e.stopPropagation(); }\n"
"function _chvEnded(id){ var v=document.getElementById(id); var w=v&&v.closest('.ch-media'); if(w){w.classList.remove('playing');w.classList.add('paused');} var f=document.getElementById(id+'_f'); if(f) f.style.width='0%'; if(_chvCur===v) _chvCur=null; }\n"
"function _chvFs(id,e){ if(e)e.stopPropagation(); var v=document.getElementById(id); if(!v) return; var el=v.closest('.ch-media')||v; if(el.requestFullscreen) el.requestFullscreen(); else if(v.webkitEnterFullscreen) v.webkitEnterFullscreen(); else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen(); }\n"
"function _chMedia(p){")
s=R(s,"function _chMedia(p){",FNS,"Fonctions lecteur video")

# 2) _chMedia : image dans conteneur stable
s=R(s,'  if(p.type===\'image\') return \'<img class="ch-post-img" src="\'+p.media_url+\'" alt="" loading="lazy"/>\';',
      '  if(p.type===\'image\') return \'<div class="ch-media"><div class="ch-skel"></div><img src="\'+p.media_url+\'" alt="" loading="lazy" onload="this.parentNode.classList.add(\\\'loaded\\\')"/></div>\';',
      "Image conteneur stable")

# 3) _chMedia : video lecteur premium
VID=('  if(p.type===\'video\'){ var _vid=\'chv_\'+(p.id||Math.random().toString(36).slice(2)); '
'return \'<div class="ch-media ch-vplayer paused" data-vid="\'+_vid+\'">\''
'+\'<div class="ch-skel"></div>\''
'+\'<video id="\'+_vid+\'" src="\'+p.media_url+\'" preload="metadata" playsinline webkit-playsinline onloadedmetadata="_chvMeta(\\\'\'+_vid+\'\\\')" ontimeupdate="_chvTime(\\\'\'+_vid+\'\\\')" onended="_chvEnded(\\\'\'+_vid+\'\\\')" onclick="_chvToggle(\\\'\'+_vid+\'\\\')"></video>\''
'+\'<div class="ch-vplay" onclick="_chvToggle(\\\'\'+_vid+\'\\\')">'+PLAY+'</div>\''
'+\'<div class="ch-vbar" onclick="_chvSeekClick(\\\'\'+_vid+\'\\\',event)"><div class="ch-vfill" id="\'+_vid+\'_f"></div></div>\''
'+\'<div class="ch-vctrl"><span class="ch-vtime" id="\'+_vid+\'_t">0:00 / 0:00</span><button class="ch-vbtn" onclick="_chvFs(\\\'\'+_vid+\'\\\',event)">'+FS+'</button></div>\''
'+\'</div>\'; }')
s=R(s,'  if(p.type===\'video\') return \'<video class="ch-post-img" src="\'+p.media_url+\'" controls preload="metadata"></video>\';',
      VID,"Video lecteur premium")

# 4) CSS
CSS=(".ch-post-react-pill{background:var(--card2);border-radius:20px;padding:3px 8px;font-size:12px;cursor:pointer;}\n"
".ch-media{position:relative;width:100%;margin-top:8px;border-radius:14px;overflow:hidden;background:#0d1722;aspect-ratio:16/10;max-height:340px}\n"
".ch-media img,.ch-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}\n"
".ch-skel{position:absolute;inset:0;z-index:1;background:linear-gradient(100deg,#162536 30%,#1f3247 50%,#162536 70%);background-size:200% 100%;animation:chSkel 1.3s ease-in-out infinite}\n"
".ch-media.loaded .ch-skel{opacity:0;transition:opacity .35s;pointer-events:none}\n"
"@keyframes chSkel{0%{background-position:200% 0}100%{background-position:-200% 0}}\n"
".ch-vplayer{aspect-ratio:16/9}\n"
".ch-vplayer video{object-fit:contain;background:#000;z-index:2;cursor:pointer}\n"
".ch-vplay{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.4);cursor:pointer;transition:opacity .2s,transform .15s;z-index:4;padding-left:3px}\n"
".ch-vplay:active{transform:translate(-50%,-50%) scale(.92)}\n"
".ch-vplayer.playing .ch-vplay{opacity:0;pointer-events:none}\n"
".ch-vbar{position:absolute;left:10px;right:10px;bottom:36px;height:4px;border-radius:3px;background:rgba(255,255,255,.25);cursor:pointer;z-index:4;opacity:0;transition:opacity .25s}\n"
".ch-vplayer.playing .ch-vbar,.ch-vplayer.paused .ch-vbar{opacity:1}\n"
".ch-vfill{height:100%;width:0;border-radius:3px;background:#00C896}\n"
".ch-vctrl{position:absolute;left:12px;right:12px;bottom:9px;display:flex;align-items:center;gap:8px;z-index:4;opacity:0;transition:opacity .25s}\n"
".ch-vplayer.playing .ch-vctrl,.ch-vplayer.paused .ch-vctrl{opacity:1}\n"
".ch-vtime{color:#fff;font-size:12px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.7)}\n"
".ch-vbtn{margin-left:auto;background:rgba(0,0,0,.35);border:none;color:#fff;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer}\n"
".ch-vbtn:active{background:rgba(0,0,0,.55)}")
s=R(s,".ch-post-react-pill{background:var(--card2);border-radius:20px;padding:3px 8px;font-size:12px;cursor:pointer;}",CSS,"CSS media+player")

# 5) Build
s=R(s,"console.log('PENC build v184 (appels arriere-plan + reduire)');",
      "console.log('PENC build v185 (canaux medias stables + lecteur video premium)');","Build -> v185")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v185")
