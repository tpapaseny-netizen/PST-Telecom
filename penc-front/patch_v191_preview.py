# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v191 (apercu + legende avant envoi media dans les canaux)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v191 — apercu avant envoi (canaux)")

# 1) Remplacer chMediaChange (upload direct -> apercu) + ajouter fonctions
a=s.find("function chMediaChange(chId, inp){")
b=s.find("var _chRec=null, _chChunks=[], _chRecChId=null;")
if a<0 or b<0 or b<a: print("  [ECHEC] bornes chMediaChange:",a,b); sys.exit(1)
NEW=r'''function chMediaChange(chId, inp){
  var f=inp.files&&inp.files[0]; if(!f) return; inp.value='';
  var kind=(f.type.indexOf('video')===0)?'video':'image';
  _chMediaPreview(chId, f, kind);
}
function _chMediaPreview(chId, file, kind){
  try{
    var url=URL.createObjectURL(file);
    var ex=document.getElementById('chMediaPrev'); if(ex) ex.remove();
    window._chmp={chId:chId,file:file,kind:kind,url:url};
    var media=kind==='video'?('<video src="'+url+'" controls playsinline class="chmp-media"></video>'):('<img src="'+url+'" class="chmp-media" alt=""/>');
    var ov=document.createElement('div'); ov.id='chMediaPrev'; ov.className='chmp-ov';
    ov.innerHTML='<div class="chmp-sheet"><div class="chmp-hd"><span>Aper\u00e7u</span><button class="chmp-x" onclick="_chMediaPrevClose()"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="chmp-body">'+media+'</div><input class="chmp-cap" id="chmpCap" placeholder="Ajouter une l\u00e9gende (optionnel)\u2026"/><div class="chmp-actions"><button class="chmp-cancel" onclick="_chMediaPrevClose()">Annuler</button><button class="chmp-send" id="chmpSend" onclick="_chMediaPrevSend()">Envoyer</button></div></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function(){ ov.classList.add('show'); });
    ov.addEventListener('click',function(e){ if(e.target===ov) _chMediaPrevClose(); });
    setTimeout(function(){ var c=document.getElementById('chmpCap'); if(c) c.focus(); },250);
  }catch(e){ console.error('preview',e); if(typeof showNotif==='function') showNotif('','Erreur','Aper\u00e7u impossible','red',null); }
}
function _chMediaPrevClose(){ var o=document.getElementById('chMediaPrev'); if(o){ o.classList.remove('show'); setTimeout(function(){ try{o.remove();}catch(e){} },220); } try{ if(window._chmp&&window._chmp.url) URL.revokeObjectURL(window._chmp.url); }catch(e){} window._chmp=null; }
function _chMediaPrevSend(){
  var m=window._chmp; if(!m) return;
  var cap=((document.getElementById('chmpCap')||{}).value||'').trim();
  var btn=document.getElementById('chmpSend'); if(btn){ btn.disabled=true; btn.textContent='Envoi\u2026'; }
  _chUpload(m.file,function(url){
    if(!url){ if(typeof showNotif==='function') showNotif('','Erreur','T\u00e9l\u00e9versement \u00e9chou\u00e9','red',null); if(btn){ btn.disabled=false; btn.textContent='Envoyer'; } return; }
    api('/channels/'+m.chId+'/post','POST',{type:m.kind,media_url:url,content:cap}).then(function(r){ if(r&&r.success){ _chPrependPost(m.chId,r.post); _chMediaPrevClose(); } else { if(typeof showNotif==='function') showNotif('','Erreur',(r&&r.error)||'Envoi \u00e9chou\u00e9','red',null); if(btn){ btn.disabled=false; btn.textContent='Envoyer'; } } }).catch(function(){ if(typeof showNotif==='function') showNotif('','Erreur','Envoi \u00e9chou\u00e9','red',null); if(btn){ btn.disabled=false; btn.textContent='Envoyer'; } });
  });
}
'''
s=s[:a]+NEW+s[b:]
print("  [OK]   chMediaChange -> apercu + fonctions")

# 2) CSS
def Rc(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
CSS=(".ch-imgthumb{cursor:pointer}\n"
".chmp-ov{position:fixed;inset:0;z-index:99400;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .22s}\n"
".chmp-ov.show{opacity:1}\n"
".chmp-sheet{width:100%;max-width:480px;max-height:90vh;display:flex;flex-direction:column;background:#141c28;border-radius:22px 22px 0 0;border:1px solid rgba(255,255,255,.08);padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));transform:translateY(100%);transition:transform .3s cubic-bezier(.2,.9,.3,1.2)}\n"
".chmp-ov.show .chmp-sheet{transform:translateY(0)}\n"
".chmp-hd{display:flex;align-items:center;justify-content:space-between;color:#fff;font-size:17px;font-weight:800;margin-bottom:12px}\n"
".chmp-x{background:rgba(255,255,255,.1);border:none;color:#cfd6dd;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}\n"
".chmp-body{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#0a121e;border-radius:14px;overflow:hidden;margin-bottom:10px;min-height:180px}\n"
".chmp-media{max-width:100%;max-height:52vh;object-fit:contain;display:block}\n"
".chmp-cap{width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;font-size:14px;outline:none;box-sizing:border-box}\n"
".chmp-cap::placeholder{color:#7b8694}\n"
".chmp-actions{display:flex;gap:10px;margin-top:12px}\n"
".chmp-cancel,.chmp-send{flex:1;padding:13px;border:none;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer}\n"
".chmp-cancel{background:rgba(255,255,255,.1);color:#cfd6dd}\n"
".chmp-send{background:linear-gradient(145deg,#34e98b,#10b06a);color:#fff}\n"
".chmp-send:disabled{opacity:.5}")
s=Rc(s,".ch-imgthumb{cursor:pointer}",CSS,"CSS apercu")

# 3) Build
s=Rc(s,"console.log('PENC build v190 (fix LK + photos canaux + header)');",
      "console.log('PENC build v191 (apercu avant envoi canaux)');","Build -> v191")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v191")
