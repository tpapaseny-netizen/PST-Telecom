# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v153 (persistance C : position de scroll)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v153 — scroll")

# 1) Fonctions de scroll (apres _chCloseDetail)
ANCH="function _chCloseDetail(chId){ var d=document.getElementById('chDetail_'+chId); if(d) d.remove(); try{ _pencClearView(); }catch(e){} }"
FNS=ANCH+"\n"+("function _pencSaveScroll(key,val){ var st=_pencState(); st.scroll=st.scroll||{}; st.scroll[key]=Math.round(val||0); _pencStateSave(st); }\n"
"function _pencGetScroll(key){ var st=_pencState(); return (st.scroll&&st.scroll[key])||0; }")
s=R(s,ANCH,FNS,"Fonctions scroll")

# 2) Sauver le scroll de la liste a l'ouverture d'une conv
s=R(s,"  try{ _pencSetView('conv', conv.id); }catch(e){}",
      "  try{ _pencSetView('conv', conv.id); }catch(e){}\n  try{ var _cl=document.getElementById('convList'); if(_cl) _pencSaveScroll('convList', _cl.scrollTop); }catch(e){}",
      "Save scroll liste")

# 3) Hook scroll messages (sauvegarde continue par conv)
s=R(s,'  const area=document.getElementById(\'msgsArea\');\n  area.innerHTML=`<div class="typing-row" id="typingRow">',
      '  const area=document.getElementById(\'msgsArea\');\n  if(area && !area._scrollHooked){ area._scrollHooked=true; area.addEventListener(\'scroll\', function(){ if(!CUR_CONV) return; clearTimeout(area._scrollT); area._scrollT=setTimeout(function(){ _pencSaveScroll(\'msg_\'+CUR_CONV, area.scrollTop); }, 250); }); }\n  area.innerHTML=`<div class="typing-row" id="typingRow">',
      "Hook scroll messages")

# 4) Restaurer le scroll messages apres rendu
s=R(s,"  (MSGS[conv.id]||[]).forEach(m=>appendMsg(m));\n  scrollBottom();\n  // Restaurer suppressions en attente",
      "  (MSGS[conv.id]||[]).forEach(m=>appendMsg(m));\n  scrollBottom();\n  setTimeout(function(){ try{ var _sp=_pencGetScroll('msg_'+conv.id); var _a=document.getElementById('msgsArea'); if(_a&&_sp&&_sp < _a.scrollHeight-_a.clientHeight-120){ _a.scrollTop=_sp; } }catch(e){} }, 60);\n  // Restaurer suppressions en attente",
      "Restaure scroll messages")

# 5) Restaurer le scroll de la liste au retour accueil
s=R(s,"  CUR_CONV=null; CUR_CONV_DATA=null;\n  renderConvList();\n}",
      "  CUR_CONV=null; CUR_CONV_DATA=null;\n  renderConvList();\n  setTimeout(function(){ try{ var _cl=document.getElementById('convList'); if(_cl){ var _sp=_pencGetScroll('convList'); if(_sp) _cl.scrollTop=_sp; } }catch(e){} }, 30);\n}",
      "Restaure scroll liste")

# 6) Build bump
s=R(s,"console.log('PENC build v152 (persistance: derniere vue conv/canal)');",
      "console.log('PENC build v153 (persistance: position de scroll)');","Build -> v153")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v153.")
