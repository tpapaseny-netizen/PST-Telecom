# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v169 (notifications messages premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v169 — notifications premium")

JSB = r"""var _chatNotifs={};
var CHATNOTIF_COL={text:'#14b8a6',voice:'#3b82f6',image:'#8b5cf6',video:'#f59e0b',money:'#f5b014',default:'#14b8a6'};
var _CN_P='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
var CHATNOTIF_SVG={
  text:_CN_P+'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  voice:_CN_P+'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>',
  image:_CN_P+'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  video:_CN_P+'<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
  money:_CN_P+'<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>'
};
CHATNOTIF_SVG['default']=CHATNOTIF_SVG.text;
function _cnHexA(hex,a){ try{ var h=hex.replace('#',''); return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+a+')'; }catch(e){ return hex; } }
function _cnType(t){ if(t==='voice')return 'voice'; if(t==='image')return 'image'; if(t==='video')return 'video'; if(t==='money')return 'money'; return 'text'; }
function _cnCont(){ var c=document.getElementById('chatNotifCont'); if(!c){ c=document.createElement('div'); c.id='chatNotifCont'; document.body.appendChild(c); } return c; }
function _cnDepth(cont){ var k=Array.prototype.slice.call(cont.children); k.forEach(function(x,i){ x.classList.remove('cn-d1','cn-d2'); if(i===1)x.classList.add('cn-d1'); else if(i>=2)x.classList.add('cn-d2'); }); }
function _cnDismiss(cid,instant){ var r=_chatNotifs[cid]; if(!r||!r.el){ delete _chatNotifs[cid]; return; } clearTimeout(r.timer); var el=r.el; delete _chatNotifs[cid]; if(instant){ var c=el.parentNode; if(c){el.remove();_cnDepth(c);} return; } el.classList.add('cn-out'); setTimeout(function(){ var c=el.parentNode; if(c){el.remove();_cnDepth(c);} },320); }
function _cnOpen(cid){ _cnDismiss(cid,true); try{ var cv=(typeof CONVS!=='undefined'&&CONVS.find)?CONVS.find(function(c){return c.id===cid;}):null; if(typeof openConv==='function') openConv(cv||{id:cid}); }catch(e){} }
function _cnGestures(el,cid){ var sx=0,sy=0,dx=0,dy=0,swiped=false;
  el.addEventListener('touchstart',function(e){ var t=e.touches[0]; sx=t.clientX; sy=t.clientY; dx=dy=0; swiped=false; el.style.transition='none'; },{passive:true});
  el.addEventListener('touchmove',function(e){ var t=e.touches[0]; dx=t.clientX-sx; dy=t.clientY-sy; el.style.transform='translate('+dx+'px,'+Math.min(dy,0)+'px)'; el.style.opacity=String(Math.max(0,1-Math.max(Math.abs(dx),Math.abs(Math.min(dy,0)))/160)); },{passive:true});
  el.addEventListener('touchend',function(){ el.style.transition=''; if(Math.abs(dx)>80||dy<-55){ swiped=true; el.style.transform=''; el.style.opacity=''; _cnDismiss(cid); } else { el.style.transform=''; el.style.opacity=''; } });
  el.addEventListener('click',function(){ if(swiped){ swiped=false; return; } _cnOpen(cid); });
}
function showChatNotif(o){ try{ o=o||{}; var cid=o.convId||''; var tk=_cnType(o.type); var col=CHATNOTIF_COL[tk]||CHATNOTIF_COL.default; var name=o.fullName||o.senderName||'Quelqu\'un';
  var ex=_chatNotifs[cid];
  if(ex&&ex.el&&ex.el.parentNode){ ex.count++; var ts=ex.el.querySelector('.cn-sub'); if(ts) ts.textContent=ex.count+' nouveaux messages'; var cc=ex.el.parentNode; cc.prepend(ex.el); _cnDepth(cc); ex.el.classList.remove('cn-pulse'); void ex.el.offsetWidth; ex.el.classList.add('cn-pulse'); clearTimeout(ex.timer); ex.timer=setTimeout(function(){ _cnDismiss(cid); },4000); return; }
  var cont=_cnCont(); var el=document.createElement('div'); el.className='chat-notif'; el.style.borderLeftColor=col; el._convId=cid;
  el.innerHTML='<div class="cn-ic" style="background:'+_cnHexA(col,0.16)+';color:'+col+'">'+(CHATNOTIF_SVG[tk]||CHATNOTIF_SVG.default)+'</div><div class="cn-tx"><div class="cn-name">'+esc(name)+'</div><div class="cn-sub">'+esc(o.preview||'')+'</div></div>';
  cont.prepend(el); requestAnimationFrame(function(){ el.classList.add('show'); });
  while(cont.children.length>3){ var last=cont.lastChild; if(last._convId) delete _chatNotifs[last._convId]; last.remove(); }
  _cnDepth(cont);
  var rec={el:el,count:1,timer:null}; _chatNotifs[cid]=rec; rec.timer=setTimeout(function(){ _cnDismiss(cid); },4000);
  _cnGestures(el,cid);
 }catch(e){ console.warn('showChatNotif',e); } }
function showNotif("""
s=R(s,"function showNotif(",JSB,"Systeme showChatNotif")

# CSS
CSS=(".call-end-toast .cet-s{color:#9aa0a6;font-size:13px;line-height:1.2}\n"
"#chatNotifCont{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));left:0;right:0;z-index:99400;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 10px}\n"
".chat-notif{pointer-events:auto;width:100%;max-width:420px;display:flex;align-items:center;gap:12px;padding:14px;background:rgba(26,26,26,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.07);border-left:3px solid #14b8a6;border-radius:16px;box-shadow:0 16px 44px rgba(0,0,0,.5);transform:translateY(-26px);opacity:0;transition:transform .42s cubic-bezier(.18,.9,.28,1.25),opacity .3s;cursor:pointer;will-change:transform,opacity}\n"
".chat-notif.show{transform:translateY(0);opacity:1}\n"
".chat-notif.cn-out{transform:translateY(-26px) !important;opacity:0 !important}\n"
".chat-notif.cn-d1{transform:translateY(0) scale(.97);opacity:.85}\n"
".chat-notif.cn-d2{transform:translateY(0) scale(.94);opacity:.7}\n"
".chat-notif.cn-pulse{animation:cnPulse .5s ease}\n"
"@keyframes cnPulse{0%{transform:translateY(0) scale(1)}40%{transform:translateY(0) scale(1.03)}100%{transform:translateY(0) scale(1)}}\n"
".chat-notif .cn-ic{flex:0 0 auto;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center}\n"
".chat-notif .cn-tx{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}\n"
".chat-notif .cn-name{color:#fff;font-weight:700;font-size:15px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
".chat-notif .cn-sub{color:#aab0b6;font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}")
s=R(s,".call-end-toast .cet-s{color:#9aa0a6;font-size:13px;line-height:1.2}",CSS,"CSS notifications premium")

# Wire onNewMsg
s=R(s,"    showNotif(icon, sender, body, color, ()=>openConv(conv||{id:cid}));",
      "    showChatNotif({convId:cid,senderName:sender,fullName:(msg.sender&&msg.sender.full_name)||sender,preview:body,type:msg.type});",
      "Wire onNewMsg -> showChatNotif")

# Build
s=R(s,"console.log('PENC build v168 (appels: fix video + fin appel premium)');",
      "console.log('PENC build v169 (notifications messages premium)');","Build -> v169")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v169.")
