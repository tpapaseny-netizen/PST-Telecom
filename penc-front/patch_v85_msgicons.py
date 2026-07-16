# -*- coding: utf-8 -*-
"""
PENC — Patch v85  (B2 : icones premium audio/texte)
Dans la liste des conversations :
  - message vocal -> icone micro SVG fine teal, avec ondes animees au survol
  - message texte -> icone bulle de dialogue SVG fine teal (queue arrondie)
Les autres types (photo/video/transfert/radio/sondage/sticker) gardent leur emoji.
La troncature (...) est preservee (tout le texte est dans .cl-tx).

Lancer depuis le dossier contenant messager.html :
    python patch_v85_msgicons.py
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

print("Patch v85 — Icones premium audio/texte")

# 1) CSS avant </head>
CSS = (
    '<style id="msg-type-icons">\n'
    '.conv-last{ display:flex; align-items:center; }\n'
    '.conv-last .cl-tx{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n'
    '.cl-ic{ width:14px; height:14px; flex:none; margin-right:5px; transition:transform .2s; }\n'
    '.conv-item:hover .cl-ic{ transform:scale(1.12); }\n'
    '.cl-mic .cl-wave{ opacity:.5; transform-origin:center; }\n'
    '.conv-item:hover .cl-mic .cl-wave{ animation:clWave 1.1s ease-in-out infinite; }\n'
    '@keyframes clWave{ 0%,100%{ opacity:.3; } 50%{ opacity:1; } }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS icones messages")

# 2) Helper _clPreview apres msgPreview
HELPER = r'''
function _clPreview(p){
  if(p==null) p='';
  var MIC='<svg class="cl-ic cl-mic" viewBox="0 0 24 24" fill="none" stroke="#00C896" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="10" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0"/><line x1="12" y1="17.5" x2="12" y2="21"/><path class="cl-wave" d="M19.4 8.7a4 4 0 0 1 0 4.6"/><path class="cl-wave" d="M21.4 7.2a6.4 6.4 0 0 1 0 7.6"/></svg>';
  var BUB='<svg class="cl-ic" viewBox="0 0 24 24" fill="none" stroke="#00C896" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ic='';
  if(/^\uD83C\uDF99/.test(p)){ ic=MIC; p=p.replace(/^\uD83C\uDF99\uFE0F?\s*/,''); }
  else if(/^(\uD83D\uDCF7|\uD83C\uDFAC|\uD83D\uDCB8|\uD83D\uDCFB|\uD83D\uDCCA|\uD83C\uDFAD)/.test(p)){ /* autres medias: garder l'emoji */ }
  else if(p!=='D\u00e9marrer la conversation' && p!==''){ ic=BUB; }
  return ic+'<span class="cl-tx">'+p+'</span>';
}'''
s = R(s, "  return msg.content?.slice(0,50)||'';\n}", "  return msg.content?.slice(0,50)||'';\n}\n" + HELPER, "Helper _clPreview")

# 3) Envelopper le preview au rendu
OLD_RENDER = "    var preview=(function(lm){ if(!lm) return 'Démarrer la conversation'; if(typeof lm==='string') return esc(lm); return esc(msgPreview(lm)); })(conv.last_message);"
NEW_RENDER = "    var preview=_clPreview((function(lm){ if(!lm) return 'Démarrer la conversation'; if(typeof lm==='string') return esc(lm); return esc(msgPreview(lm)); })(conv.last_message));"
s = R(s, OLD_RENDER, NEW_RENDER, "Preview enveloppe par _clPreview")

# 4) Bump build
s = R(s,
  "console.log('PENC build v84 (radio: fix SSO - lecture ME correcte, e-mail envoye depuis Penc)');",
  "console.log('PENC build v85 (icones premium audio/texte dans la liste de conversations)');",
  "Marqueur build -> v85")

assert s.count('function _clPreview') == 1 and s.count('_clPreview(') >= 2, "Helper non branche !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v85.")
print("Verifie : node check.js")
