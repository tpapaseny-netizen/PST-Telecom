# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v152 (persistance B : revenir au dernier endroit)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v152 — derniere vue")

# 1) Fonctions de vue (apres _pencClearDraft)
ANCH="function _pencClearDraft(cid){ if(!cid) return; var st=_pencState(); if(st.drafts&&st.drafts[cid]){ delete st.drafts[cid]; _pencStateSave(st); } }"
FNS=ANCH+"\n"+(r'''function _pencSetView(type,id){ if(!id) return; var st=_pencState(); st.view={type:type,id:String(id),t:Date.now()}; _pencStateSave(st); }
function _pencClearView(){ var st=_pencState(); if(st.view){ delete st.view; _pencStateSave(st); } }
function _pencRestoreView(){
  try{
    var st=_pencState(); var v=st.view; if(!v||!v.id) return;
    if(v.t && (Date.now()-v.t)>86400000){ _pencClearView(); return; }
    if(v.type==='conv'){
      if(CUR_CONV) return;
      var c=(typeof CONVS!=='undefined'&&CONVS)?CONVS.find(function(x){return String(x.id)===String(v.id);}):null;
      if(c) openConv(c);
    } else if(v.type==='channel'){
      if(document.querySelector('[id^="chDetail_"]')) return;
      if(typeof openChannelDetail==='function') openChannelDetail(v.id);
    }
  }catch(e){}
}
function _chCloseDetail(chId){ var d=document.getElementById('chDetail_'+chId); if(d) d.remove(); try{ _pencClearView(); }catch(e){} }''')
s=R(s,ANCH,FNS,"Fonctions de vue")

# 2) Restaurer apres chargement des conversations (boot)
s=R(s,"    initSocket();\n    loadConvs();\n    loadStatuses();",
      "    initSocket();\n    loadConvs().then(function(){ try{ _pencRestoreView(); }catch(e){} });\n    loadStatuses();",
      "Boot: restaurer la vue")

# 3) Memoriser la conversation ouverte
s=R(s,"async function openConv(conv) {\n  CUR_CONV=conv.id; CUR_CONV_DATA=conv;",
      "async function openConv(conv) {\n  CUR_CONV=conv.id; CUR_CONV_DATA=conv;\n  try{ _pencSetView('conv', conv.id); }catch(e){}",
      "Memoriser conversation")

# 4) Memoriser le canal ouvert
s=R(s,"    var existOv=document.getElementById('chDetail_'+chId); if(existOv) existOv.remove();",
      "    var existOv=document.getElementById('chDetail_'+chId); if(existOv) existOv.remove();\n    try{ _pencSetView('channel', chId); }catch(e){}",
      "Memoriser canal")

# 5) Effacer la vue en revenant a l'accueil
s=R(s,"function backToMain(){\n  // Pauser toutes les vidéos en cours",
      "function backToMain(){\n  try{ _pencClearView(); }catch(e){}\n  // Pauser toutes les vidéos en cours",
      "Effacer vue (accueil)")

# 6) Bouton retour canal -> ferme + efface la vue
s=R(s,r'''onclick="document.getElementById(\'chDetail_'+chId+'\').remove()">←</button>''',
      r'''onclick="_chCloseDetail(\''+chId+'\')">←</button>''',
      "Retour canal -> _chCloseDetail")

# 7) Build bump
s=R(s,"console.log('PENC build v151 (persistance: brouillons)');",
      "console.log('PENC build v152 (persistance: derniere vue conv/canal)');","Build -> v152")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v152.")
