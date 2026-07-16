# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v155 (#2 : bouton telechargement statut premium + barre uniforme)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v155 — bouton telechargement premium")

# 1) Bouton fermer : emoji croix -> SVG fin
CLOSE_X='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
s=R(s,'<div class="sv-close" onclick="closeSV()">\u2715</div>',
      '<div class="sv-close" onclick="closeSV()">'+CLOSE_X+'</div>',
      "Fermer -> SVG X")

# 2) Bouton telecharger : emoji -> SVG fleche-dans-cercle + handler premium
DL_ICON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="14.5"/><polyline points="8.5 11 12 14.5 15.5 11"/></svg>'
s=R(s,'onclick="saveSVMedia()" title="Enregistrer" style="right:auto;left:14px;display:none;">\u2B07\uFE0F</div>',
      'onclick="svDownloadStatus(this)" title="Enregistrer" style="right:auto;left:14px;display:none;">'+DL_ICON+'</div>',
      "Telecharger -> SVG + handler")

# 3) SVG coche verte + fonction svDownloadStatus (apres SVG_EDIT global)
ANCH='var SVG_EDIT=\'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>\';'
NEW=ANCH+"\n"+(r'''var SVG_DL_OK='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22C55E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12.4 11 15.4 16 9"/></svg>';
function svDownloadStatus(btn){
  try{ saveSVMedia(); }catch(e){}
  if(!btn) return;
  var prev=btn.innerHTML;
  btn.innerHTML=SVG_DL_OK;
  btn.classList.add('sv-dl-ok');
  setTimeout(function(){ try{ btn.classList.remove('sv-dl-ok'); btn.innerHTML=prev; }catch(e){} }, 1000);
}''')
s=R(s,ANCH,NEW,"SVG coche + svDownloadStatus")

# 4) CSS : animation de pression + pop coche
s=R(s,".sv-action-btn:active{background:rgba(255,60,60,.6);}",
      ".sv-action-btn:active{background:rgba(255,60,60,.6);}\n"
      "#svSaveBtn{transition:transform .16s ease;}\n"
      "#svSaveBtn:active{transform:scale(.82);}\n"
      "#svSaveBtn.sv-dl-ok{transform:scale(1.08);}",
      "CSS pression + pop")

# 5) Build bump
s=R(s,"console.log('PENC build v154 (persistance: vocal interrompu)');",
      "console.log('PENC build v155 (statut: bouton telechargement premium)');","Build -> v155")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v155.")
