# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v171 (onglet Appels + ecran historique facon WhatsApp)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v171 — onglet Appels")

# 1) Nav item Appels (avant Canaux)
NAVITEM='    <div class="nav-item" id="nav-calls" onclick="showTab(\'calls\')"><span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span><span>Appels</span></div>\n'
s=R(s,'    <div class="nav-item" id="nav-channels" onclick="showTab(\'channels\')">',
      NAVITEM+'    <div class="nav-item" id="nav-channels" onclick="showTab(\'channels\')">',"Nav item Appels")

# 2) showTab : active + removal + branch
s=R(s,"  ['chats','status','contacts','channels','profile','polls'].forEach(t=>document.getElementById('nav-'+t)?.classList.toggle('active',t===tab));",
      "  ['chats','status','contacts','channels','profile','polls','calls'].forEach(t=>document.getElementById('nav-'+t)?.classList.toggle('active',t===tab));","showTab active")
s=R(s,"  screen.querySelectorAll('#profile-view,#channels-view,#status-view,#contacts-view,#polls-view').forEach(e=>e.remove());",
      "  screen.querySelectorAll('#profile-view,#channels-view,#status-view,#contacts-view,#polls-view,#calls-view').forEach(e=>e.remove());","showTab removal")
s=R(s,"  else if(tab==='polls'){renderPollsView();}\n}",
      "  else if(tab==='polls'){renderPollsView();}\n  else if(tab==='calls'){renderCallsView();}\n}","showTab branch calls")

# 3) Fonctions (avant renderContactsView)
FNS=r'''function renderCallsView(){
  var sc=document.getElementById('screen-main');
  sc.querySelectorAll('#profile-view,#channels-view,#status-view,#contacts-view,#polls-view,#calls-view').forEach(function(e){e.remove();});
  var cl=sc.querySelector('.conv-list'); if(cl) cl.style.display='none';
  var fab=sc.querySelector('.fab'); if(fab) fab.style.display='none';
  var sb=sc.querySelector('.search-bar'); if(sb) sb.style.display='none';
  var sr=document.getElementById('storiesRow'); if(sr) sr.style.display='none';
  var sl=document.querySelector('.stories-label'); if(sl) sl.style.display='none';
  var div=document.createElement('div'); div.id='calls-view'; div.className='calls-view';
  div.innerHTML='<div class="calls-head">Appels</div><div id="callsList" class="calls-list"><div class="calls-empty">Chargement\u2026</div></div>';
  sc.insertBefore(div, sc.querySelector('.bottom-nav'));
  loadCalls();
}
function _callTimeLabel(ts){
  try{ var d=new Date(ts), now=new Date();
    var hh=(d.getHours()<10?'0':'')+d.getHours(), mm=(d.getMinutes()<10?'0':'')+d.getMinutes();
    var sameDay=d.toDateString()===now.toDateString();
    var y=new Date(now); y.setDate(now.getDate()-1); var isY=d.toDateString()===y.toDateString();
    if(sameDay) return "Aujourd'hui "+hh+':'+mm;
    if(isY) return 'Hier '+hh+':'+mm;
    return (d.getDate()<10?'0':'')+d.getDate()+'/'+((d.getMonth()+1)<10?'0':'')+(d.getMonth()+1)+'/'+d.getFullYear();
  }catch(e){ return ''; }
}
function loadCalls(){
  api('/calls').then(function(r){
    var list=document.getElementById('callsList'); if(!list) return;
    var calls=(r&&r.calls)||[];
    if(!calls.length){ list.innerHTML='<div class="calls-empty">Aucun appel pour le moment.</div>'; return; }
    list.innerHTML=calls.map(function(c){ return _callRowHTML(c); }).join('');
  }).catch(function(){ var list=document.getElementById('callsList'); if(list) list.innerHTML='<div class="calls-empty">Impossible de charger les appels.</div>'; });
}
function _callRowHTML(c){
  var o=c.other||{}; var name=esc(o.full_name||o.username||'Inconnu');
  var missed=(c.status!=='answered'); var isOut=(c.direction==='out');
  var av=o.avatar_url?('<img class="call-av" src="'+esc(o.avatar_url)+'"/>'):('<div class="call-av call-av-ph">'+esc((name[0]||'?').toUpperCase())+'</div>');
  var arrowCol=missed?'#ef4444':(isOut?'#8a9bb0':'#2ee68f');
  var arrow=isOut
    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="'+arrowCol+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>'
    : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="'+arrowCol+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>';
  var typeLabel=(c.call_type==='video'?'Vid\u00e9o':'Audio');
  var durTxt=(c.status==='answered'&&c.duration>0)?(' \u00b7 '+fmtDur(c.duration)):'';
  var sub=(missed?'Manqu\u00e9':(isOut?'Sortant':'Entrant'))+' \u00b7 '+typeLabel+durTxt;
  var callIcon=(c.call_type==='video')
    ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
    : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var cid=esc(c.conversation_id||''); var oid=esc((o.id)||''); var ct=(c.call_type==='video'?'video':'audio');
  return '<div class="call-row" onclick="_callRowOpen(\''+cid+'\',\''+oid+'\')">'+av+
    '<div class="call-info"><div class="call-name'+(missed?' missed':'')+'">'+name+'</div>'+
    '<div class="call-sub">'+arrow+'<span>'+sub+'</span></div></div>'+
    '<div class="call-time">'+esc(_callTimeLabel(c.created_at))+'</div>'+
    '<button class="call-back-btn" onclick="event.stopPropagation();_callBack(\''+cid+'\',\''+oid+'\',\''+ct+'\')">'+callIcon+'</button></div>';
}
function _callRowOpen(cid,oid){ try{ var cv=(typeof CONVS!=='undefined'&&CONVS.find)?CONVS.find(function(c){return c.id===cid;}):null; if(typeof openConv==='function') openConv(cv||{id:cid,other_user_id:oid}); }catch(e){} }
function _callBack(cid,oid,type){ try{ var cv=(typeof CONVS!=='undefined'&&CONVS.find)?CONVS.find(function(c){return c.id===cid;}):null; if(typeof openConv==='function') openConv(cv||{id:cid,other_user_id:oid}); setTimeout(function(){ if(typeof startCall==='function') startCall(type); }, 700); }catch(e){} }
function renderContactsView(){'''
s=R(s,"function renderContactsView(){",FNS,"Fonctions onglet Appels")

# 4) CSS
CSS=(".call-log .cl-tx{color:#e6e8ea;font-size:13.5px;font-weight:600}\n"
".calls-view{flex:1;overflow-y:auto;display:flex;flex-direction:column}\n"
".calls-head{padding:18px 18px 8px;font-size:24px;font-weight:800;color:#fff}\n"
".calls-list{display:flex;flex-direction:column;padding-bottom:12px}\n"
".calls-empty{padding:40px 20px;text-align:center;color:#8a9bb0;font-size:15px}\n"
".call-row{display:flex;align-items:center;gap:13px;padding:11px 16px;cursor:pointer;transition:background .15s}\n"
".call-row:active{background:rgba(255,255,255,0.05)}\n"
".call-av{width:48px;height:48px;border-radius:50%;object-fit:cover;flex:0 0 auto}\n"
".call-av-ph{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2ee68f,#0fb068);color:#06140f;font-weight:700;font-size:19px}\n"
".call-info{flex:1 1 auto;min-width:0}\n"
".call-name{font-size:16px;font-weight:600;color:#eaf0f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n"
".call-name.missed{color:#ef4444}\n"
".call-sub{display:flex;align-items:center;gap:5px;font-size:13px;color:#8a9bb0;margin-top:2px}\n"
".call-sub svg{flex:0 0 auto}\n"
".call-time{font-size:12.5px;color:#8a9bb0;flex:0 0 auto;margin-right:2px}\n"
".call-back-btn{flex:0 0 auto;width:42px;height:42px;border-radius:50%;border:none;background:transparent;color:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer}\n"
".call-back-btn:active{background:rgba(46,230,143,0.14)}")
s=R(s,".call-log .cl-tx{color:#e6e8ea;font-size:13.5px;font-weight:600}",CSS,"CSS onglet Appels")

# 5) Build
s=R(s,"console.log('PENC build v170 (historique des appels)');",
      "console.log('PENC build v171 (onglet Appels facon WhatsApp)');","Build -> v171")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v171.")
