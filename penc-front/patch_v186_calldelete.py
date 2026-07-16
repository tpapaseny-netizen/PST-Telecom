# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v186 (suppression historique appels: pour moi / pour tous <24h / tout effacer)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v186 — suppression historique appels")

# 1) loadCalls : filtrer caches + long-press
s=R(s,"    var calls=(r&&r.calls)||[];\n    if(!calls.length){ list.innerHTML='<div class=\"calls-empty\">Aucun appel pour le moment.</div>'; return; }\n    list.innerHTML=calls.map(function(c){ return _callRowHTML(c); }).join('');",
      "    var calls=(r&&r.calls)||[];\n    try{ var _hid=JSON.parse(localStorage.getItem('penc_calls_hidden')||'[]'); if(_hid&&_hid.length) calls=calls.filter(function(c){ return _hid.indexOf(c.id)<0; }); }catch(_e){}\n    if(!calls.length){ list.innerHTML='<div class=\"calls-empty\">Aucun appel pour le moment.</div>'; return; }\n    list.innerHTML=calls.map(function(c){ return _callRowHTML(c); }).join('');\n    _callAttachLongPress(list);",
      "loadCalls filtre+longpress")

# 2) _callRowHTML : data attrs + bouton corbeille
s=R(s,"  return '<div class=\"call-row\" onclick=\"_callRowOpen(\\''+cid+'\\',\\''+oid+'\\')\">'+av+",
      "  return '<div class=\"call-row\" data-cmid=\"'+esc(c.id||'')+'\" data-cts=\"'+esc(c.created_at||'')+'\" onclick=\"_callRowOpen(\\''+cid+'\\',\\''+oid+'\\')\">'+av+",
      "_callRowHTML data attrs")
s=R(s,"    '<div class=\"call-time\">'+esc(_callTimeLabel(c.created_at))+'</div>'+\n    '<button class=\"call-back-btn\" onclick=\"event.stopPropagation();_callBack(\\''+cid+'\\',\\''+oid+'\\',\\''+ct+'\\')\">'+callIcon+'</button></div>';",
      "    '<div class=\"call-time\">'+esc(_callTimeLabel(c.created_at))+'</div>'+\n    '<button class=\"call-del-btn\" onclick=\"event.stopPropagation();_callRowMenu(\\''+esc(c.id||'')+'\\',\\''+esc(c.created_at||'')+'\\')\" aria-label=\"Options\">'+SVG_TRASH+'</button>'+\n    '<button class=\"call-back-btn\" onclick=\"event.stopPropagation();_callBack(\\''+cid+'\\',\\''+oid+'\\',\\''+ct+'\\')\">'+callIcon+'</button></div>';",
      "_callRowHTML bouton corbeille")

# 3) _callRowOpen : anti-ouverture apres appui long
s=R(s,"function _callRowOpen(cid,oid){ try{",
      "function _callRowOpen(cid,oid){ if(Date.now()-(window._callSuppressOpen||0)<800) return; try{","_callRowOpen suppress")

# 4) Fonctions menu + suppression (apres _callBack)
ANCH="function _callBack(cid,oid,type){ try{ var cv=(typeof CONVS!=='undefined'&&CONVS.find)?CONVS.find(function(c){return c.id===cid;}):null; if(typeof openConv==='function') openConv(cv||{id:cid,other_user_id:oid}); setTimeout(function(){ if(typeof startCall==='function') startCall(type); }, 700); }catch(e){} }"
FNS=ANCH+"""
function _callAttachLongPress(list){ try{ list.querySelectorAll('.call-row').forEach(function(row){ var t,moved; row.addEventListener('touchstart',function(){ moved=false; t=setTimeout(function(){ if(!moved){ window._callSuppressOpen=Date.now(); try{if(navigator.vibrate)navigator.vibrate(15);}catch(e){} _callRowMenu(row.getAttribute('data-cmid'),row.getAttribute('data-cts')); } },480); },{passive:true}); row.addEventListener('touchmove',function(){ moved=true; clearTimeout(t); },{passive:true}); row.addEventListener('touchend',function(){ clearTimeout(t); },{passive:true}); row.addEventListener('contextmenu',function(e){ e.preventDefault(); window._callSuppressOpen=Date.now(); _callRowMenu(row.getAttribute('data-cmid'),row.getAttribute('data-cts')); }); }); }catch(e){} }
function _callRowMenu(id, ts){ try{ if(!id) return; var ex=document.getElementById('callCtx'); if(ex) ex.remove(); var within24=ts && (Date.now()-new Date(ts).getTime() < 86400000); var ov=document.createElement('div'); ov.id='callCtx'; ov.className='call-ctx-ov'; var rows='<button class="cc-item" onclick="_callDelMe(\\''+id+'\\')">'+SVG_TRASH+'<span>Supprimer pour moi</span></button>'; if(within24) rows+='<button class="cc-item danger" onclick="_callDelAll(\\''+id+'\\')">'+SVG_TRASH+'<span>Supprimer pour tous</span></button>'; rows+='<button class="cc-item cancel" onclick="_callCtxClose()">Annuler</button>'; ov.innerHTML='<div class="call-ctx">'+rows+'</div>'; document.body.appendChild(ov); requestAnimationFrame(function(){ ov.classList.add('show'); }); ov.addEventListener('click',function(e){ if(e.target===ov) _callCtxClose(); }); }catch(e){} }
function _callCtxClose(){ var o=document.getElementById('callCtx'); if(o){ o.classList.remove('show'); setTimeout(function(){ try{o.remove();}catch(e){} },220); } }
function _callRemoveRow(id){ var el=document.querySelector('.call-row[data-cmid="'+id+'"]'); if(el){ el.style.transition='opacity .2s'; el.style.opacity='0'; setTimeout(function(){ try{el.remove();}catch(e){} var list=document.getElementById('callsList'); if(list&&!list.querySelector('.call-row')) list.innerHTML='<div class="calls-empty">Aucun appel pour le moment.</div>'; },200); } }
function _callDelMe(id){ try{ var h=JSON.parse(localStorage.getItem('penc_calls_hidden')||'[]'); if(h.indexOf(id)<0) h.push(id); localStorage.setItem('penc_calls_hidden',JSON.stringify(h)); }catch(e){} _callCtxClose(); _callRemoveRow(id); }
function _callDelAll(id){ _callCtxClose(); api('/messages/'+id,'DELETE',{for_all:true}).then(function(r){ if(r&&r.success){ _callRemoveRow(id); if(typeof showNotif==='function') showNotif('','Appel supprim\\u00e9','Retir\\u00e9 pour les deux','green',null); } else { if(typeof showNotif==='function') showNotif('\\u274c','Erreur','Suppression \\u00e9chou\\u00e9e','red',null); } }).catch(function(){ if(typeof showNotif==='function') showNotif('\\u274c','Erreur','Suppression \\u00e9chou\\u00e9e','red',null); }); }
function _callClearAll(){ if(typeof pencConfirm!=='function'){ return; } pencConfirm({title:'Effacer tout l\\u2019historique',message:'Tous les appels seront retir\\u00e9s de votre liste (uniquement chez vous).',ok:'Effacer tout'}).then(function(ok){ if(!ok) return; try{ var ids=[]; document.querySelectorAll('.call-row[data-cmid]').forEach(function(el){ var i=el.getAttribute('data-cmid'); if(i) ids.push(i); }); var h=JSON.parse(localStorage.getItem('penc_calls_hidden')||'[]'); ids.forEach(function(i){ if(h.indexOf(i)<0) h.push(i); }); localStorage.setItem('penc_calls_hidden',JSON.stringify(h)); }catch(e){} var list=document.getElementById('callsList'); if(list) list.innerHTML='<div class="calls-empty">Aucun appel pour le moment.</div>'; }); }"""
s=R(s,ANCH,FNS,"Fonctions menu+suppression")

# 5) renderCallsView : bouton Effacer tout dans l'entete
s=R(s,"  div.innerHTML='<div class=\"calls-head\">Appels</div><div id=\"callsList\" class=\"calls-list\"><div class=\"calls-empty\">Chargement\\u2026</div></div>';",
      "  div.innerHTML='<div class=\"calls-head\"><span>Appels</span><button class=\"calls-clear\" onclick=\"_callClearAll()\" aria-label=\"Effacer tout\">'+SVG_TRASH+'</button></div><div id=\"callsList\" class=\"calls-list\"><div class=\"calls-empty\">Chargement\\u2026</div></div>';",
      "renderCallsView bouton effacer tout")

# 6) CSS
CSS=(".call-back-btn:active{background:rgba(46,230,143,0.14)}\n"
".call-del-btn{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:#6b7785;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.65;transition:opacity .15s,background .15s,color .15s}\n"
".call-del-btn:active{background:rgba(239,68,68,.14);color:#ef4444;opacity:1}\n"
".call-del-btn svg{width:17px;height:17px}\n"
".calls-head{display:flex;align-items:center;justify-content:space-between}\n"
".calls-clear{background:transparent;border:none;color:#6b7785;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;flex:0 0 auto}\n"
".calls-clear:active{background:rgba(239,68,68,.14);color:#ef4444}\n"
".calls-clear svg{width:20px;height:20px}\n"
".call-ctx-ov{position:fixed;inset:0;z-index:99650;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .22s}\n"
".call-ctx-ov.show{opacity:1}\n"
".call-ctx{width:100%;max-width:440px;margin:0 10px calc(14px + env(safe-area-inset-bottom,0px));background:rgba(26,26,26,.97);border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;transform:translateY(16px);transition:transform .28s cubic-bezier(.2,.9,.3,1.2)}\n"
".call-ctx-ov.show .call-ctx{transform:translateY(0)}\n"
".cc-item{width:100%;display:flex;align-items:center;gap:12px;padding:15px 18px;background:none;border:none;border-bottom:1px solid rgba(255,255,255,.05);color:#eaf0f6;font-size:15px;font-weight:600;cursor:pointer;text-align:left}\n"
".cc-item svg{width:18px;height:18px;flex:0 0 auto;color:#9aa0a6}\n"
".cc-item:active{background:rgba(255,255,255,.05)}\n"
".cc-item.danger{color:#ff6b6b}\n"
".cc-item.danger svg{color:#ff6b6b}\n"
".cc-item.cancel{justify-content:center;color:#8a9bb0;border-bottom:none;font-weight:700}")
s=R(s,".call-back-btn:active{background:rgba(46,230,143,0.14)}",CSS,"CSS suppression appels")

# 7) Build
s=R(s,"console.log('PENC build v185 (canaux medias stables + lecteur video premium)');",
      "console.log('PENC build v186 (suppression historique appels)');","Build -> v186")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v186")
