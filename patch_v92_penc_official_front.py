# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v92 (compte officiel Penc : badge + non-reponse)
  - badge verifie bleu a cote de "Penc" (liste de conversations + en-tete du chat)
  - conversation avec Penc en LECTURE SEULE : composer masque + note "vous ne pouvez pas repondre"
Detecte l'interlocuteur via conv.other_user_id === 'penc_official'.

    python patch_v92_penc_official_front.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v92 — Compte officiel Penc (front)")

# 1) CSS lecture seule
CSS = (
    '<style id="penc-official">\n'
    '#screen-chat.penc-readonly .chat-input-row{ display:none !important; }\n'
    '.penc-ro-note{ display:none; }\n'
    '#screen-chat.penc-readonly .penc-ro-note{ display:block; padding:14px 16px; text-align:center; color:var(--muted); font-size:13px; background:var(--card); border-top:1px solid var(--border); }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS lecture seule")

# 2) Helpers
HELPERS = """function _isPenc(id){ return String(id||'')==='penc_official'; }
function _pencBadge(){ return '<svg viewBox="0 0 24 24" width="15" height="15" style="vertical-align:-2px;margin-left:3px;display:inline-block;flex:none;"><circle cx="12" cy="12" r="11" fill="#1D9BF0"/><path d="M8.5 12.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
"""
s = R(s, "async function openConv(conv) {", HELPERS + "async function openConv(conv) {", "Helpers _isPenc/_pencBadge")

# 3) Badge dans l'en-tete du chat
HDR_OLD = "  document.getElementById('chatHdrName').textContent=conv.name||'Conversation';"
HDR_NEW = "  if(_isPenc(conv.other_user_id)){ document.getElementById('chatHdrName').innerHTML=esc(conv.name||'Penc')+_pencBadge(); } else { document.getElementById('chatHdrName').textContent=conv.name||'Conversation'; }"
s = R(s, HDR_OLD, HDR_NEW, "Badge en-tete chat")

# 4) Lecture seule apres showScreen
RO_OLD = "  showScreen('screen-chat');"
RO_NEW = RO_OLD + "\n  (function(){ var sc=document.getElementById('screen-chat'); var row=sc?sc.querySelector('.chat-input-row'):null; if(_isPenc(conv.other_user_id)){ if(sc) sc.classList.add('penc-readonly'); if(row&&row.parentNode&&!document.getElementById('pencRoNote')){ var n=document.createElement('div'); n.id='pencRoNote'; n.className='penc-ro-note'; n.innerHTML='🔒 Compte officiel Penc — vous ne pouvez pas répondre.'; row.parentNode.insertBefore(n,row); } } else { if(sc) sc.classList.remove('penc-readonly'); } })();"
s = R(s, RO_OLD, RO_NEW, "Lecture seule Penc")

# 5) Badge dans la liste de conversations
CL_OLD = "<div class=\"conv-name\">'+esc(conv.name||'Inconnu')+'</div>"
CL_NEW = "<div class=\"conv-name\">'+esc(conv.name||'Inconnu')+(_isPenc(conv.other_user_id)?_pencBadge():'')+'</div>"
s = R(s, CL_OLD, CL_NEW, "Badge liste conversations")

# 6) Bump build
s = R(s,
  "console.log('PENC build v91 (admin: galerie des statuts publies + suppression)');",
  "console.log('PENC build v92 (compte officiel Penc: badge verifie + lecture seule)');",
  "Marqueur build -> v92")

assert s.count('function _pencBadge') == 1 and s.count('penc-readonly') >= 2, "Helpers/CSS absents !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v92.")
print("Verifie : node check.js")
