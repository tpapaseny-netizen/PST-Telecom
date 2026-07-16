# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v183 (ecran appel actif premium - etats teal/rouge)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v183 — ecran appel actif premium")

# 1) Bouton raccrocher : classe call-end (plus grand)
s=R(s,'<button class="call-btn red" onclick="endCall()" title="Raccrocher">',
      '<button class="call-btn red call-end" onclick="endCall()" title="Raccrocher">',"Bouton raccrocher call-end")

# 2) Transitions fluides
s=R(s,".call-btn{width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;color:#fff;\n  display:flex;align-items:center;justify-content:center;font-size:24px;\n  transition:transform .1s,opacity .1s;}",
      ".call-btn{width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;color:#fff;\n  display:flex;align-items:center;justify-content:center;font-size:24px;\n  transition:transform .12s,background .2s,color .2s,box-shadow .2s;}\n"
      ".call-btn.cb-on{background:rgba(0,200,150,.18)!important;color:#00E0A6;box-shadow:inset 0 0 0 1.5px rgba(0,200,150,.4)}\n"
      ".call-btn.cb-off{background:rgba(255,255,255,.12)!important;color:#fff;box-shadow:none}\n"
      ".call-btn.cb-muted{background:rgba(255,68,68,.2)!important;color:#ff6b6b;box-shadow:inset 0 0 0 1.5px rgba(255,68,68,.45)}\n"
      ".call-btn.call-end{width:72px!important;height:72px!important;background:linear-gradient(145deg,#ff5a5a,#e02424)!important;box-shadow:0 10px 28px rgba(224,36,36,.5);color:#fff}",
      "CSS etats premium")

# 3) Etats initiaux dans showCallOverlay
s=R(s,"  if(rv) rv.style.display='none'; // affich\u00e9 quand le flux arrive\n  o.classList.add('active');",
      "  if(rv) rv.style.display='none'; // affich\u00e9 quand le flux arrive\n"
      "  try{ var _bm=document.getElementById('btnMute'); if(_bm){_bm.classList.remove('cb-off','cb-muted','gray');_bm.classList.add('cb-on');}\n"
      "  var _bc=document.getElementById('btnCam'); if(_bc){_bc.classList.remove('cb-on','cb-muted','gray');_bc.classList.add(type==='video'?'cb-on':'cb-off');}\n"
      "  var _bs=document.getElementById('btnSpk'); if(_bs){_bs.classList.remove('cb-off','cb-muted','gray');_bs.classList.add('cb-on');} }catch(_e){}\n"
      "  o.classList.add('active');","Etats initiaux boutons")

# 4) toggles : nouvelles classes
s=R(s,"if(btn){btn.innerHTML=enabled?SVG_CALL_MICOFF:SVG_CALL_MIC;btn.classList.toggle('active-btn',enabled);}",
      "if(btn){btn.innerHTML=enabled?SVG_CALL_MICOFF:SVG_CALL_MIC;btn.classList.remove('cb-on','cb-muted');btn.classList.add(enabled?'cb-muted':'cb-on');}","toggleMute classes")
s=R(s,"if(btn){btn.innerHTML=enabled?SVG_CALL_CAMOFF:SVG_CALL_CAM;btn.classList.toggle('active-btn',enabled);}",
      "if(btn){btn.innerHTML=enabled?SVG_CALL_CAMOFF:SVG_CALL_CAM;btn.classList.remove('cb-on','cb-off');btn.classList.add(enabled?'cb-off':'cb-on');}","toggleCamera classes")
s=R(s,"if(btn){btn.innerHTML=rv.muted?SVG_CALL_SPKOFF:SVG_CALL_SPK;btn.classList.toggle('active-btn',rv.muted);}",
      "if(btn){btn.innerHTML=rv.muted?SVG_CALL_SPKOFF:SVG_CALL_SPK;btn.classList.remove('cb-on','cb-off');btn.classList.add(rv.muted?'cb-off':'cb-on');}","toggleSpeaker classes")

# 5) Build
s=R(s,"console.log('PENC build v182 (apercu appel premium + duree)');",
      "console.log('PENC build v183 (ecran appel actif premium)');","Build -> v183")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v183")
