# -*- coding: utf-8 -*-
"""PENC v201 — appel manque directionnel (Sans reponse / Appel manque) + clic pour rappeler"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v201")

# 1) buildCallBubble : direction-aware label
OLD_LBL="  var label=answered?((ct==='video'?'Appel vidéo':'Appel audio')+(dur?(' · '+dur):'')):'Appel manqué';"
NEW_LBL=("""  var _out=(typeof ME!=='undefined'&&ME&&String(msg.sender_id)===String(ME.id));\n"""
         """  var label=answered?((ct==='video'?'Appel vidéo':'Appel audio')+(dur?(' · '+dur):'')):(_out?'Sans réponse':'Appel manqué');""")
s=R(s,OLD_LBL,NEW_LBL,"Label directionnel")

# 2) buildCallBubble : rendre cliquable (rappeler) + icone
OLD_RET="""  return '<div class="call-log" style="--cc:'+col+'"><span class="cl-ic">'+svg+'</span><span class="cl-tx">'+label+'</span></div>';"""
NEW_RET=("""  var _ph='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';\n"""
         """  return '<div class="call-log clickable" style="--cc:'+col+'" data-ct="'+ct+'" onclick="_recallCall(this)" title="Rappeler"><span class="cl-ic">'+svg+'</span><span class="cl-tx">'+label+'</span><span class="cl-recall">'+_ph+'</span></div>';""")
s=R(s,OLD_RET,NEW_RET,"Bubble cliquable")

# 3) Preview liste : 'Appel annulé' -> 'Sans réponse'
s=R(s,"var _lbl=_ans?(_base+(_dur?' \\u00b7 '+_dur:'')):(_out?'Appel annul\\u00e9':'Appel manqu\\u00e9');",
      "var _lbl=_ans?(_base+(_dur?' \\u00b7 '+_dur:'')):(_out?'Sans r\\u00e9ponse':'Appel manqu\\u00e9');",
      "Preview 'Sans reponse'")

# 4) Fonctions de rappel (avant _callElapsed)
FNS=("""function _recallCall(el){ try{ var type=(el&&el.getAttribute&&el.getAttribute('data-ct')==='video')?'video':'audio'; if(!CUR_CONV_DATA){ return; } if(_lk.room||(typeof _gc!=='undefined'&&_gc.room)){ if(typeof showNotif==='function') showNotif('','Appel en cours','Tu es déjà en communication','orange',null); return; } window._recallType=type; var nm=CUR_CONV_DATA.name||'cette personne'; var ex=document.getElementById('recallModal'); if(ex) ex.remove(); var isV=(type==='video'); var ic=isV?'<svg viewBox=\\"0 0 24 24\\" width=\\"26\\" height=\\"26\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><polygon points=\\"23 7 16 12 23 17 23 7\\"/><rect x=\\"1\\" y=\\"5\\" width=\\"15\\" height=\\"14\\" rx=\\"2\\" ry=\\"2\\"/></svg>':'<svg viewBox=\\"0 0 24 24\\" width=\\"26\\" height=\\"26\\" fill=\\"none\\" stroke=\\"currentColor\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\"><path d=\\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z\\"/></svg>'; var ov=document.createElement('div'); ov.id='recallModal'; ov.className='ireq-ov'; ov.innerHTML='<div class=\\"ireq-card\\"><div class=\\"ireq-ic\\">'+ic+'</div><div class=\\"ireq-t\\">'+(isV?'Appel vidéo':'Appel audio')+'</div><div class=\\"ireq-m\\">Rappeler <b>'+esc(nm)+'</b> ?</div><div class=\\"ireq-btns\\"><button class=\\"ireq-no\\" onclick=\\"_closeRecall()\\">Annuler</button><button class=\\"ireq-yes\\" onclick=\\"_doRecall()\\">Appeler</button></div></div>'; document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('show'); }); ov.addEventListener('click',function(e){ if(e.target===ov) _closeRecall(); }); }catch(e){} }\n"""
     """function _doRecall(){ var t=window._recallType||'audio'; _closeRecall(); try{ startCall(t); }catch(e){} }\n"""
     """function _closeRecall(){ var o=document.getElementById('recallModal'); if(o){ o.classList.remove('show'); setTimeout(function(){ try{o.remove();}catch(e){} },200); } }\n""")
s=R(s,"function _callElapsed(){",FNS+"function _callElapsed(){","Fonctions rappel")

# 5) CSS clickable + icone recall
s=R(s,".call-log{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}",
      ".call-log{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}\n"
      ".call-log.clickable{cursor:pointer;transition:filter .12s,transform .12s}\n"
      ".call-log.clickable:active{filter:brightness(1.14);transform:scale(.98)}\n"
      ".cl-recall{display:inline-flex;align-items:center;color:var(--cc);opacity:.6;margin-left:4px}",
      "CSS clickable")

# 6) Build
s=R(s,"console.log('PENC build v200 (sonnerie generee voix/video)');",
      "console.log('PENC build v201 (appel directionnel + rappel au clic)');","Build -> v201")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v201")
