# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v114 (vocaux differencies envoye/recu)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v114 — vocaux differencies")

CSS=('<style id="voice-premium-v2">\n'
 '/* Vocaux differencies : envoye (vert) vs recu (gris/orange) */\n'
 '.msg-row.me .msg-bubble.voice-wrap{ background:#1A6B4A !important; }\n'
 '.msg-row:not(.me) .msg-bubble.voice-wrap{ background:#2A2A2A !important; }\n'
 '.msg-row.me .voice-play{ background:#FFFFFF !important; color:#1A6B4A !important; }\n'
 '.msg-row:not(.me) .voice-play{ background:#FF6B00 !important; color:#FFFFFF !important; }\n'
 '.msg-row.me .voice-bar{ background:#00C896 !important; }\n'
 '.msg-row:not(.me) .voice-bar{ background:#FF6B00 !important; }\n'
 '.voice-bar.unplayed{ opacity:.35 !important; }\n'
 '.voice-bar.played{ opacity:1 !important; }\n'
 '.msg-row.me .voice-dur{ color:#EAFBF3 !important; opacity:1 !important; }\n'
 '.msg-row:not(.me) .voice-dur{ color:#FFD9BF !important; opacity:1 !important; }\n'
 '.msg-row.me .voice-dl{ color:#FFFFFF !important; opacity:.9 !important; }\n'
 '.msg-row:not(.me) .voice-dl{ color:#FF6B00 !important; opacity:1 !important; }\n'
 '.voice-bar{ transition:opacity .08s, background .08s; }\n'
 '</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS vocaux differencies")

s=R(s,"console.log('PENC build v113 (badge bleu dans la liste des statuts)');",
      "console.log('PENC build v114 (vocaux differencies envoye/recu)');","Build -> v114")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v114.")
