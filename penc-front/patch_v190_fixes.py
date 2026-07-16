# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v190 (fix LK groupe + photos canaux cliquables + header allege)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v190 — fix LK + photos + header")

# 1) FIX LK dans _gcJoin (definir LK localement comme le 1:1)
s=R(s,"    var room=new LK.Room({adaptiveStream:true,dynacast:true,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},publishDefaults:{dtx:false,red:true}});",
      "    var LK=window.LivekitClient; if(!LK){ if(typeof showNotif==='function') showNotif('','Appel indisponible','SDK LiveKit non charg\u00e9','red',null); _gcLeave(); return; }\n"
      "    var room=new LK.Room({adaptiveStream:true,dynacast:true,audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},publishDefaults:{dtx:false,red:true}});",
      "LK defini dans _gcJoin")

# 2) FIX LK dans _gcAttach
s=R(s,"function _gcAttach(track,p){ try{ if(track.kind===LK.Track.Kind.Audio){",
      "function _gcAttach(track,p){ try{ var LK=window.LivekitClient; if(!LK) return; if(track.kind===LK.Track.Kind.Audio){",
      "LK defini dans _gcAttach")

# 3) Photos canaux cliquables (ouverture plein ecran)
s=R(s,"  if(p.type==='image') return '<div class=\"ch-media\"><div class=\"ch-skel\"></div><img src=\"'+p.media_url+'\" alt=\"\" loading=\"lazy\" onload=\"this.parentNode.classList.add(\\'loaded\\')\"/></div>';",
      "  if(p.type==='image') return '<div class=\"ch-media ch-imgthumb\" onclick=\"openImgViewer(\\''+p.media_url+'\\')\"><div class=\"ch-skel\"></div><img src=\"'+p.media_url+'\" alt=\"\" loading=\"lazy\" onload=\"this.parentNode.classList.add(\\'loaded\\')\"/></div>';",
      "Photos canaux cliquables")

# 4) Header allege : boutons d'appel plus petits + CSS imgthumb
s=R(s,".ch-call-btn{width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,.14);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s}",
      ".ch-call-btn{width:33px;height:33px;border-radius:50%;border:none;background:rgba(255,255,255,.1);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s}\n"
      ".ch-call-btn svg{width:16px;height:16px}\n"
      ".ch-detail-hd .ch-call-btn+.ch-call-btn{margin-left:-2px}\n"
      ".ch-imgthumb{cursor:pointer}",
      "Header allege + imgthumb CSS")

# 5) Build
s=R(s,"console.log('PENC build v189 (groupe: inviter plusieurs)');",
      "console.log('PENC build v190 (fix LK + photos canaux + header)');","Build -> v190")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v190")
