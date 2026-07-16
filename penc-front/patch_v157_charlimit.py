# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v157 (#1 : limite 280 + compteur + police adaptative)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v157 — limite 280 statut texte")

# 1) Textarea : maxlength + compteur + oninput
OLD_TA='      <textarea class="form-input" id="stTxtInp" placeholder="Écrivez votre statut..." rows="3" style="resize:none;margin-bottom:8px;"></textarea>'
NEW_TA=('      <textarea class="form-input" id="stTxtInp" placeholder="Écrivez votre statut..." rows="3" maxlength="280" oninput="stTxtCount()" style="resize:none;margin-bottom:4px;"></textarea>\n'
'      <div id="stTxtCounter" style="text-align:right;font-size:12px;color:var(--muted);margin-bottom:10px;">0/280</div>')
s=R(s,OLD_TA,NEW_TA,"Textarea maxlength + compteur")

# 2) Fonctions compteur + style adaptatif (avant submitTextStatus)
s=R(s,"async function submitTextStatus(){",
      "function stTxtCount(){ var ta=document.getElementById('stTxtInp'); var c=document.getElementById('stTxtCounter'); if(!ta) return; var n=ta.value.length; if(c) c.textContent=n+'/280'; var lim=n>=280; ta.classList.toggle('st-limit',lim); if(c) c.style.color=lim?'#DC2626':'var(--muted)'; }\n"
      "function _svTextStyle(txt){ var n=(txt||'').length, fs, fw; if(n<50){fs=32;fw=800;} else if(n<=150){fs=26;fw=700;} else {fs=20;fw=600;} return 'font-size:'+fs+'px;font-weight:'+fw+';padding-left:24px;padding-right:24px;'; }\n"
      "async function submitTextStatus(){",
      "Fonctions compteur + style adaptatif")

# 3) Visualiseur : appliquer la police adaptative
s=R(s,'c.innerHTML=buildSVAuthorBar(sv)+\'<div class="sv-text" style="background:\'+(sv.bg_color||\'#050D18\')+\';">\'+esc(sv.text_content||\'\')+\'</div>\';',
      'c.innerHTML=buildSVAuthorBar(sv)+\'<div class="sv-text" style="background:\'+(sv.bg_color||\'#050D18\')+\';\'+_svTextStyle(sv.text_content||\'\')+\'">\'+esc(sv.text_content||\'\')+\'</div>\';',
      "Visualiseur police adaptative")

# 4) CSS : etat limite atteinte (rouge leger)
s=R(s,".sv-text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:30px;font-size:22px;font-weight:700;text-align:center;color:#fff;}",
      ".sv-text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:30px;font-size:22px;font-weight:700;text-align:center;color:#fff;word-break:break-word;}\n"
      "#stTxtInp.st-limit{border-color:#DC2626!important;background:rgba(220,38,38,.07)!important;}",
      "CSS limite + word-break")

# 5) Build bump
s=R(s,"console.log('PENC build v156 (visionneuses photo/video: boutons SVG premium)');",
      "console.log('PENC build v157 (statut texte: limite 280 + police adaptative)');","Build -> v157")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v157.")
