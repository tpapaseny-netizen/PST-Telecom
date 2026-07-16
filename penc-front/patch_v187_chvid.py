# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v187 (videos canaux jouent comme dans les discussions)"""
import io, sys
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v187 — videos canaux comme discussions")

# Remplacer la branche video de _chMedia (lecteur inline -> vignette + openVidViewer)
a=s.find("  if(p.type==='video'){ var _vid=")
b=s.find("  if(p.type==='voice'||p.type==='audio')")
if a<0 or b<0 or b<a: print("  [ECHEC] bornes video introuvables", a, b); sys.exit(1)
NEW=("  if(p.type==='video'){ var _u=p.media_url; "
"return '<div class=\"ch-media ch-vthumb\" onclick=\"openVidViewer(\\''+_u+'\\')\">'"
"+'<div class=\"ch-skel\"></div>'"
"+'<video src=\"'+_u+'\" preload=\"metadata\" muted playsinline onloadedmetadata=\"var w=this.closest(\\'.ch-media\\'); if(w) w.classList.add(\\'loaded\\')\" style=\"pointer-events:none\"></video>'"
"+'<div class=\"ch-vplay2\"><svg width=\"54\" height=\"54\" viewBox=\"0 0 54 54\"><circle cx=\"27\" cy=\"27\" r=\"27\" fill=\"rgba(0,0,0,.45)\"/><polygon points=\"21,16 41,27 21,38\" fill=\"#fff\"/></svg></div>'"
"+'</div>'; }\n")
s=s[:a]+NEW+s[b:]
print("  [OK]   Branche video remplacee")

# CSS vignette
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=R(s,".ch-vbtn:active{background:rgba(0,0,0,.55)}",
      ".ch-vbtn:active{background:rgba(0,0,0,.55)}\n"
      ".ch-vthumb{cursor:pointer}\n"
      ".ch-vplay2{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;pointer-events:none;transition:transform .15s}\n"
      ".ch-vthumb:active .ch-vplay2{transform:translate(-50%,-50%) scale(.92)}","CSS vignette video")

# Build
s=R(s,"console.log('PENC build v186 (suppression historique appels)');",
      "console.log('PENC build v187 (videos canaux comme discussions)');","Build -> v187")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v187")
