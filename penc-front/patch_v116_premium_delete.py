# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v116 (modale suppression premium + toast)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v116 — suppression premium")

# 1) CSS
CSS=('<style id="penc-confirm-css">\n'
'.penc-confirm-ov{position:fixed;inset:0;z-index:99700;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:24px;opacity:0;transition:opacity .2s ease;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}\n'
'.penc-confirm-ov.show{opacity:1;}\n'
'.penc-confirm{background:#0D1B2A;border-radius:20px;padding:26px 22px 18px;width:100%;max-width:330px;box-shadow:0 24px 64px rgba(0,0,0,.55);text-align:center;transform:scale(.9);transition:transform .22s cubic-bezier(.2,.9,.3,1.1);}\n'
'.penc-confirm-ov.show .penc-confirm{transform:scale(1);}\n'
'.penc-confirm-icon{width:60px;height:60px;border-radius:50%;background:rgba(255,68,68,.13);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}\n'
'.penc-confirm-title{color:#fff;font-weight:800;font-size:18px;margin-bottom:7px;}\n'
'.penc-confirm-sub{color:#9aa7b4;font-size:13.5px;line-height:1.5;margin-bottom:20px;}\n'
'.penc-confirm-actions{display:flex;gap:10px;}\n'
'.penc-confirm-actions button{flex:1;padding:13px 10px;border:none;border-radius:12px;font-weight:700;font-size:14.5px;cursor:pointer;font-family:inherit;}\n'
'.penc-confirm-actions .pc-cancel{background:#E8EAED;color:#1A1A1A;}\n'
'.penc-confirm-actions .pc-ok{background:#FF4444;color:#fff;}\n'
'.penc-del-toast{position:fixed;top:0;left:50%;transform:translate(-50%,-130%);z-index:99800;display:flex;align-items:center;gap:10px;background:#1A1A1A;border-left:3px solid #FF4444;color:#fff;padding:12px 16px;border-radius:0 0 13px 13px;font-size:14px;font-weight:600;box-shadow:0 10px 28px rgba(0,0,0,.45);transition:transform .32s cubic-bezier(.2,.85,.25,1);max-width:88vw;}\n'
'.penc-del-toast.show{transform:translate(-50%,0);}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS modale+toast")

# 2) Fonctions (avant pencPrompt)
FUNCS=('function _trashSVG(c){ c=c||"#FF4444"; return \'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="\'+c+\'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>\'; }\n'
'function pencConfirm(opts){\n'
'  opts=opts||{};\n'
'  return new Promise(function(resolve){\n'
'    var ov=document.createElement("div"); ov.className="penc-confirm-ov";\n'
'    ov.innerHTML=\'<div class="penc-confirm"><div class="penc-confirm-icon">\'+(opts.icon||_trashSVG())+\'</div>\'\n'
'      +\'<div class="penc-confirm-title">\'+esc(opts.title||"Confirmer")+\'</div>\'\n'
'      +(opts.message?\'<div class="penc-confirm-sub">\'+esc(opts.message)+\'</div>\':"")\n'
'      +\'<div class="penc-confirm-actions"><button class="pc-cancel">\'+esc(opts.cancel||"Annuler")+\'</button><button class="pc-ok">\'+esc(opts.ok||"Supprimer")+\'</button></div></div>\';\n'
'    document.body.appendChild(ov);\n'
'    requestAnimationFrame(function(){ ov.classList.add("show"); });\n'
'    function done(v){ ov.classList.remove("show"); setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); },220); resolve(v); }\n'
'    ov.querySelector(".pc-cancel").onclick=function(){ done(false); };\n'
'    ov.querySelector(".pc-ok").onclick=function(){ done(true); };\n'
'    ov.addEventListener("click",function(e){ if(e.target===ov) done(false); });\n'
'  });\n'
'}\n'
'function pencDeleteToast(text){\n'
'  var t=document.createElement("div"); t.className="penc-del-toast";\n'
'  t.innerHTML=\'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg><span></span>\';\n'
'  t.querySelector("span").textContent=text||"Statut supprimé";\n'
'  document.body.appendChild(t);\n'
'  requestAnimationFrame(function(){ t.classList.add("show"); });\n'
'  setTimeout(function(){ t.classList.remove("show"); setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); },340); }, 3000);\n'
'}\n')
s=R(s,"function pencPrompt(opts){",FUNCS+"function pencPrompt(opts){","Fonctions pencConfirm+toast")

# 3) deleteSV : confirm -> pencConfirm (avec pause) + toast
s=R(s,
"async function deleteSV(){\n  var sv=svList[svIdx]; if(!sv) return;\n  if(!confirm('Supprimer ce statut ?')) return;",
"async function deleteSV(){\n  var sv=svList[svIdx]; if(!sv) return;\n  svPaused=true; clearInterval(svTimer);\n  var _ok=await pencConfirm({title:'Supprimer ce statut',message:'Ce statut sera définitivement supprimé.'});\n  if(!_ok){ svPaused=false; startSVTimer(); return; }",
"deleteSV -> pencConfirm")

s=R(s,"    renderSV();startSVTimer();loadStatuses();\n    showNotif('🗑️','Statut supprimé','','green',null);",
      "    renderSV();startSVTimer();loadStatuses();\n    pencDeleteToast('Statut supprimé');",
      "deleteSV -> toast")

# 4) admDelStatusCell
s=R(s,
"function admDelStatusCell(sid){\n  if(!confirm('Supprimer ce statut ?')) return;\n  api('/admin/statuses/'+sid,'DELETE').then(function(r){\n    if(r&&r.success){ var c=document.getElementById('stc_'+sid); if(c) c.remove(); showNotif('🗑️','Statut','Supprimé','green',null); }\n    else showNotif('❌','Erreur','Échec','red',null);\n  }).catch(function(){});\n}",
"function admDelStatusCell(sid){\n  pencConfirm({title:'Supprimer ce statut',message:'Ce statut sera définitivement supprimé.'}).then(function(_ok){ if(!_ok) return;\n  api('/admin/statuses/'+sid,'DELETE').then(function(r){\n    if(r&&r.success){ var c=document.getElementById('stc_'+sid); if(c) c.remove(); pencDeleteToast('Statut supprimé'); }\n    else showNotif('❌','Erreur','Échec','red',null);\n  }).catch(function(){});\n  });\n}",
"admDelStatusCell -> pencConfirm")

# 5) admDelStatus
s=R(s,
"function admDelStatus(sid,btn){ if(!confirm('Supprimer ce statut ?')) return; api('/admin/statuses/'+sid,'DELETE').then(function(r){ if(r&&r.success){ var c=btn&&btn.closest('.fr-item'); if(c) c.remove(); showNotif('✅','Statut','Supprimé','green',null); } }).catch(function(){}); }",
"function admDelStatus(sid,btn){ pencConfirm({title:'Supprimer ce statut',message:'Ce statut sera définitivement supprimé.'}).then(function(_ok){ if(!_ok) return; api('/admin/statuses/'+sid,'DELETE').then(function(r){ if(r&&r.success){ var c=btn&&btn.closest('.fr-item'); if(c) c.remove(); pencDeleteToast('Statut supprimé'); } }).catch(function(){}); }); }",
"admDelStatus -> pencConfirm")

# 6) repDelContent
s=R(s,
"function repDelContent(id,sid){ if(!confirm('Supprimer ce contenu ?')) return; api('/admin/statuses/'+sid,'DELETE').then(function(){ _repResolve(id,'resolved'); showNotif('🗑️','Contenu','Supprimé','green',null); }).catch(function(){}); }",
"function repDelContent(id,sid){ pencConfirm({title:'Supprimer ce contenu',message:'Ce contenu sera définitivement supprimé.'}).then(function(_ok){ if(!_ok) return; api('/admin/statuses/'+sid,'DELETE').then(function(){ _repResolve(id,'resolved'); pencDeleteToast('Contenu supprimé'); }).catch(function(){}); }); }",
"repDelContent -> pencConfirm")

# 7) Build bump
s=R(s,"console.log('PENC build v115 (badge bleu: proposition auto aux profils actifs)');",
      "console.log('PENC build v116 (suppression statut premium: modale + toast)');","Build -> v116")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v116.")
