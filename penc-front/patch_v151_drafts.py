# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v151 (persistance A : brouillons par conversation)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v151 — brouillons")

# 1) Module d'etat persistant + brouillons (avant onChatInput)
MOD=('function _pencState(){ try{ return JSON.parse(localStorage.getItem(\'penc_state\')||\'{}\'); }catch(e){ return {}; } }\n'
'function _pencStateSave(st){ try{ localStorage.setItem(\'penc_state\', JSON.stringify(st)); }catch(e){} }\n'
'function _pencSetDraft(cid,txt){ if(!cid) return; var st=_pencState(); st.drafts=st.drafts||{}; if(txt&&txt.trim()){ st.drafts[cid]=txt; } else { delete st.drafts[cid]; } _pencStateSave(st); }\n'
'function _pencGetDraft(cid){ var st=_pencState(); return (st.drafts&&st.drafts[cid])||\'\'; }\n'
'function _pencClearDraft(cid){ if(!cid) return; var st=_pencState(); if(st.drafts&&st.drafts[cid]){ delete st.drafts[cid]; _pencStateSave(st); } }\n'
'function onChatInput(){')
s=R(s,"function onChatInput(){",MOD,"Module etat + brouillons")

# 2) Sauvegarde du brouillon a la frappe
s=R(s,"  const ta=document.getElementById('chatInput'); ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,110)+'px';\n  if(!CUR_CONV||!SOCKET) return;",
      "  const ta=document.getElementById('chatInput'); ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,110)+'px';\n  if(CUR_CONV&&CUR_CONV!=='bot'){ _pencSetDraft(CUR_CONV, v); }\n  if(!CUR_CONV||!SOCKET) return;",
      "Save brouillon a la frappe")

# 3) Restauration du brouillon a l'ouverture
s=R(s,"  restorePendingUndos();\n  // Rejoindre la room Socket.io pour recevoir les messages en temps réel",
      "  restorePendingUndos();\n"
      "  try{ var _dft=_pencGetDraft(conv.id); var _ci=document.getElementById('chatInput'); if(_ci&&_dft){ _ci.value=_dft; _ci.style.height='auto'; _ci.style.height=Math.min(_ci.scrollHeight,110)+'px'; var _sb=document.getElementById('sendBtn'); if(_sb)_sb.style.display='flex'; var _mb=document.getElementById('micBtn'); if(_mb)_mb.style.display='none'; } }catch(e){}\n"
      "  // Rejoindre la room Socket.io pour recevoir les messages en temps réel",
      "Restaure brouillon a l'ouverture")

# 4) Effacer le brouillon a l'envoi
s=R(s,"  inp.value=''; inp.style.height='auto';\n  document.getElementById('sendBtn').style.display='none';",
      "  inp.value=''; inp.style.height='auto'; _pencClearDraft(CUR_CONV);\n  document.getElementById('sendBtn').style.display='none';",
      "Efface brouillon a l'envoi")

# 5) Build bump
s=R(s,"console.log('PENC build v150 (etat vide conversations premium)');",
      "console.log('PENC build v151 (persistance: brouillons)');","Build -> v151")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v151.")
