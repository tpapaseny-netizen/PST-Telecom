# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v119 (barre de saisie propre : mic/envoi en flux, plus de chevauchement)"""
import io, sys, re
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v119 — barre de saisie")

# 0) Capturer les boutons send/mic du header
m_send=re.search(r'<button class="wa-send-btn" id="sendBtn".*?</button>', s, re.S)
m_mic =re.search(r'<button class="wa-mic-btn" id="micBtn".*?</button>', s, re.S)
if not(m_send and m_mic): print("  [ECHEC] capture boutons"); sys.exit(1)
send_html=m_send.group(0); mic_html=m_mic.group(0)
print("  [OK]   capture send/mic")

# 1) Retirer le commentaire + les 2 boutons du header
block='    <!-- Boutons mic/send en position absolue -->\n    '+send_html+'\n    '+mic_html+'\n'
s=R(s, block, '', "Retrait boutons du header")

# 2) Insérer mic + send dans la barre, après la pilule (.chat-input-wrap)
i=s.index('id="camBtn"')
j=s.index('</button>', i)+len('</button>')   # fin bouton camera
k=s.index('</div>', j)+len('</div>')          # fin .chat-input-wrap
inject='\n      '+mic_html+'\n      '+send_html
s=s[:k]+inject+s[k:]
print("  [OK]   insertion mic/send dans la barre")

# 3) CSS : mic/send en flux normal (plus d'absolu)
OLD_CSS=(".wa-mic-btn,.wa-send-btn{position:absolute;right:10px;box-sizing:border-box;\n"
"  bottom:calc(5px + env(safe-area-inset-bottom));width:40px;height:40px;\n"
"  border-radius:50%;border:none;background:var(--accent);color:#fff;\n"
"  display:flex;align-items:center;justify-content:center;\n"
"  cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.3);z-index:5;}")
NEW_CSS=(".wa-mic-btn,.wa-send-btn{position:relative;box-sizing:border-box;flex-shrink:0;\n"
"  width:42px;height:42px;\n"
"  border-radius:50%;border:none;background:var(--accent);color:#fff;\n"
"  display:flex;align-items:center;justify-content:center;\n"
"  cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.3);}")
s=R(s, OLD_CSS, NEW_CSS, "CSS mic/send en flux")

# 4) Espacement de la barre : gap un peu plus large et alignement bas
s=R(s,'<div class="chat-input-row" style="align-items:center;gap:4px;width:100%;min-width:0;">',
      '<div class="chat-input-row" style="align-items:flex-end;gap:7px;width:100%;min-width:0;">',
      "Row align/gap")

# 5) Build bump
s=R(s,"console.log('PENC build v118 (badge bleu dans le coin de l avatar du statut)');",
      "console.log('PENC build v119 (barre de saisie propre: mic/envoi en flux)');","Build -> v119")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v119.")
