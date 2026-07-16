# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v156 (bonus : visionneuse photo + lecteur video, boutons SVG premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v156 — bonus visionneuses")

CLOSE_X='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
DL_ICON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="14.5"/><polyline points="8.5 11 12 14.5 15.5 11"/></svg>'

# 1) Visionneuse photo : fermer
s=R(s,'<div class="img-viewer-close" onclick="closeImgViewer()">\u2715</div>',
      '<div class="img-viewer-close" onclick="closeImgViewer()">'+CLOSE_X+'</div>',
      "Photo: fermer -> SVG")
# 2) Visionneuse photo : telecharger
s=R(s,'<div class="img-viewer-close" onclick="saveMedia(document.getElementById(\'imgViewSrc\').src,\'image\')" title="Enregistrer" style="right:auto;left:14px;">\u2B07\uFE0F</div>',
      '<div class="img-viewer-close" onclick="_dlMediaBtn(this,document.getElementById(\'imgViewSrc\').src,\'image\')" title="Enregistrer" style="right:auto;left:14px;">'+DL_ICON+'</div>',
      "Photo: telecharger -> SVG")
# 3) Lecteur video : fermer
s=R(s,'<button class="vid-close-btn" onclick="closeVidViewer()">\u2715</button>',
      '<button class="vid-close-btn" onclick="closeVidViewer()">'+CLOSE_X+'</button>',
      "Video: fermer -> SVG")
# 4) Lecteur video : telecharger
s=R(s,'<button class="vid-close-btn" onclick="saveMedia(document.getElementById(\'fullVidEl\').src,\'video\')" title="Enregistrer" style="right:auto;left:14px;">\u2B07\uFE0F</button>',
      '<button class="vid-close-btn" onclick="_dlMediaBtn(this,document.getElementById(\'fullVidEl\').src,\'video\')" title="Enregistrer" style="right:auto;left:14px;">'+DL_ICON+'</button>',
      "Video: telecharger -> SVG")

# 5) Fonction generique _dlMediaBtn (apres svDownloadStatus)
ANCH="  setTimeout(function(){ try{ btn.classList.remove('sv-dl-ok'); btn.innerHTML=prev; }catch(e){} }, 1000);\n}"
NEW=ANCH+"\n"+(r'''function _dlMediaBtn(btn,url,type){
  try{ if(url && typeof saveMedia==='function') saveMedia(url,type); }catch(e){}
  if(!btn) return;
  var prev=btn.innerHTML;
  btn.innerHTML=SVG_DL_OK;
  btn.classList.add('dl-ok-pop');
  setTimeout(function(){ try{ btn.classList.remove('dl-ok-pop'); btn.innerHTML=prev; }catch(e){} }, 1000);
}''')
s=R(s,ANCH,NEW,"Fonction _dlMediaBtn")

# 6) CSS : pression + pop sur photo/video
s=R(s,"#svSaveBtn.sv-dl-ok{transform:scale(1.08);}",
      "#svSaveBtn.sv-dl-ok{transform:scale(1.08);}\n"
      ".img-viewer-close,.vid-close-btn{transition:transform .16s ease;}\n"
      ".img-viewer-close:active,.vid-close-btn:active{transform:scale(.85);}\n"
      ".img-viewer-close.dl-ok-pop,.vid-close-btn.dl-ok-pop{transform:scale(1.08);}",
      "CSS pression photo/video")

# 7) Build bump
s=R(s,"console.log('PENC build v155 (statut: bouton telechargement premium)');",
      "console.log('PENC build v156 (visionneuses photo/video: boutons SVG premium)');","Build -> v156")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v156.")
