# -*- coding: utf-8 -*-
"""
PENC — Patch v77  (Radio : cache badge + play/pause)
1) Cache du badge "Edit with Base44" cote PENC : petit cache "DeglouFM" pose en bas a droite,
   au-dessus de l'iframe, qui bloque le badge SANS cacher la navigation de DeglouFM.
2) Play/Pause dans la barre persistante via un pont postMessage :
   - le bouton envoie {source:'penc', action:'toggle'} a l'iframe DeglouFM ;
   - Penc ecoute {source:'deglufm', playing, station} pour afficher l'etat + le nom de la station.
   (Necessite d'activer le pont cote DeglouFM/Base44 — voir le prompt fourni dans le chat.)
Additif. Lancer depuis le dossier contenant messager.html :
    python patch_v77_radio_controls.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1). Aucune modif." % (label, n))
        sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v77 — Cache badge + play/pause")

# ── 1) Nouvelle barre persistante (info cliquable + play/pause + stop) ──
OLD_BAR = '<div class="radio-bar" id="radioBar">\n    <span class="rb-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/></svg></span>\n    <span class="rb-name">DeglouFM<small>En lecture</small></span>\n    <button class="rb-btn" onclick="openRadio()">Rouvrir</button>\n    <button class="rb-stop" onclick="stopRadio()" aria-label="Arreter">&#10005;</button>\n  </div>'
NEW_BAR = '<div class="radio-bar" id="radioBar">\n    <div class="rb-info" onclick="openRadio()">\n      <span class="rb-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/></svg></span>\n      <span class="rb-text"><span class="rb-name" id="rbName">DeglouFM</span><span class="rb-sub" id="rbSub">En lecture</span></span>\n    </div>\n    <button class="rb-pp" id="rbPlayPause" onclick="radioToggle()" aria-label="Pause / Lecture"></button>\n    <button class="rb-stop" onclick="stopRadio()" aria-label="Arreter">&#10005;</button>\n  </div>'
s = R(s, OLD_BAR, NEW_BAR, "Barre persistante (play/pause)")

# ── 2) Cache du badge, insere juste apres l'iframe ──
OLD_IFRAME = '<iframe id="radioFrame" title="DeglouFM" allow="autoplay; encrypted-media; fullscreen"></iframe>'
NEW_IFRAME = OLD_IFRAME + '\n      <div class="radio-badge-cover" id="radioBadgeCover"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#00C896" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/></svg><span>DeglouFM</span></div>'
s = R(s, OLD_IFRAME, NEW_IFRAME, "Cache badge apres iframe")

# ── 3) CSS additionnel (apres .radio-active .fab) ──
OLD_CSS_ANCHOR = ".radio-active .fab{ bottom:132px; }"
NEW_CSS = OLD_CSS_ANCHOR + """
.rb-info{ flex:1; min-width:0; display:flex; align-items:center; gap:11px; cursor:pointer; }
.rb-text{ display:flex; flex-direction:column; min-width:0; }
.rb-sub{ font-weight:500; font-size:11px; color:var(--muted,#888); }
.rb-pp{ width:38px; height:38px; border-radius:50%; border:none; background:#00C896; color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
.rb-pp:active{ transform:scale(.92); }
.radio-badge-cover{ position:absolute; right:6px; bottom:6px; height:42px; min-width:124px; padding:0 14px; background:#0b0f17; border-radius:12px; display:flex; align-items:center; justify-content:center; gap:6px; z-index:6; }
.radio-badge-cover span{ color:#00C896; font-weight:700; font-size:13px; white-space:nowrap; }"""
s = R(s, OLD_CSS_ANCHOR, NEW_CSS, "CSS barre + cache badge")

# ── 4a) JS : etat de lecture + icones + paintPP ──
s = R(s,
  "  var _loaded=false, _fbTimer=null, _active=false;\n  function el(id){ return document.getElementById(id); }",
  "  var _loaded=false, _fbTimer=null, _active=false, _playing=true;\n"
  "  var ICON_PAUSE='<svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"currentColor\"><rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\"/></svg>';\n"
  "  var ICON_PLAY='<svg viewBox=\"0 0 24 24\" width=\"17\" height=\"17\" fill=\"currentColor\"><path d=\"M7 4l13 8-13 8z\"/></svg>';\n"
  "  function el(id){ return document.getElementById(id); }\n"
  "  function paintPP(){ var b=el('rbPlayPause'); if(b) b.innerHTML=_playing?ICON_PAUSE:ICON_PLAY; var sub=el('rbSub'); if(sub) sub.textContent=_playing?'En lecture':'En pause'; }",
  "JS: etat lecture + paintPP")

# ── 4b) openRadio : init etat play ──
s = R(s,
  "      _active=true;\n    }\n    p.classList.add('show');",
  "      _active=true; _playing=true; paintPP();\n    }\n    p.classList.add('show');",
  "JS: openRadio init play")

# ── 4c) closeRadio : rafraichir l'icone quand la barre apparait ──
s = R(s,
  "    if(_active){\n      var bar=el('radioBar'); if(bar) bar.classList.add('show');",
  "    if(_active){\n      paintPP();\n      var bar=el('radioBar'); if(bar) bar.classList.add('show');",
  "JS: closeRadio paintPP")

# ── 4d) stopRadio reset + radioToggle + listener postMessage ──
s = R(s,
  "    _active=false; _loaded=false;\n    if(_fbTimer) clearTimeout(_fbTimer);\n  };\n})();\n</script>",
  "    _active=false; _loaded=false; _playing=true;\n    if(_fbTimer) clearTimeout(_fbTimer);\n  };\n"
  "  window.radioToggle=function(){\n"
  "    var fr=el('radioFrame');\n"
  "    if(fr && fr.contentWindow){ try{ fr.contentWindow.postMessage({source:'penc', action:'toggle'}, '*'); }catch(_){} }\n"
  "    _playing=!_playing; paintPP();\n"
  "  };\n"
  "  window.addEventListener('message', function(e){\n"
  "    try{\n"
  "      var d=e.data; if(!d || typeof d!=='object' || d.source!=='deglufm') return;\n"
  "      if(typeof d.playing!=='undefined'){ _playing=!!d.playing; paintPP(); }\n"
  "      if(d.station){ var n=el('rbName'); if(n) n.textContent=d.station; }\n"
  "    }catch(_){}\n"
  "  }, false);\n"
  "})();\n</script>",
  "JS: radioToggle + listener")

# ── 5) Bump build ──
s = R(s,
  "console.log('PENC build v76 (header: pastille DeglouFM libellee)');",
  "console.log('PENC build v77 (radio: cache badge cote Penc + play/pause via postMessage)');",
  "Marqueur build -> v77")

# Garde-fous
assert s.count('id="radioBadgeCover"') == 1, "Cache badge absent !"
assert s.count('id="rbPlayPause"') == 1, "Bouton play/pause absent !"
assert "window.radioToggle=function" in s, "radioToggle absent !"
assert "d.source!=='deglufm'" in s, "Listener postMessage absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v77.")
print("Verifie : node check.js")
