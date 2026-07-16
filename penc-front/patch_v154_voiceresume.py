# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v154 (persistance D : vocal interrompu sauvegarde + reprise)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v154 — vocal interrompu")

# 1) CSS bandeau de reprise (apres .voc-send-bar.show)
CSS_ANCH=".voc-send-bar.show{max-height:64px;opacity:1;transform:translateY(0);padding:10px 14px;margin-bottom:7px;}"
CSS_NEW=CSS_ANCH+("\n.voc-resume-bar{position:fixed;top:14px;left:50%;transform:translate(-50%,-160%);z-index:99999;display:flex;align-items:center;gap:10px;background:#1A1A1A;border-left:3px solid #1DD3B0;border-radius:14px;padding:10px 12px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-width:92%;width:430px;opacity:0;transition:transform .32s cubic-bezier(.2,.8,.2,1),opacity .32s;}"
"\n.voc-resume-bar.show{transform:translate(-50%,0);opacity:1;}"
"\n.voc-resume-bar .vrb-ic{width:34px;height:34px;border-radius:50%;background:rgba(29,211,176,.15);display:flex;align-items:center;justify-content:center;flex:0 0 auto;}"
"\n.voc-resume-bar .vrb-txt{flex:1;min-width:0;}"
"\n.voc-resume-bar .vrb-t1{color:#fff;font-weight:700;font-size:13px;line-height:1.1;}"
"\n.voc-resume-bar .vrb-t2{color:#9aa6ad;font-size:11px;margin-top:2px;}"
"\n.voc-resume-bar .vrb-del{background:transparent;border:none;color:#9aa6ad;font-size:12px;padding:6px 8px;cursor:pointer;flex:0 0 auto;}"
"\n.voc-resume-bar .vrb-send{background:linear-gradient(135deg,#1DD3B0,#1488CC);border:none;color:#fff;font-weight:700;font-size:12px;padding:7px 15px;border-radius:10px;cursor:pointer;flex:0 0 auto;}")
s=R(s,CSS_ANCH,CSS_NEW,"CSS bandeau reprise")

# 2) Timeslice : accumuler l'audio en continu (pour sauvegarde sync)
s=R(s,"    mediaRec.start();\n","    mediaRec.start(1000);\n","start(1000) timeslice")

# 3) Fonctions IDB + sauvegarde/reprise + handlers (remplace le bloc visibilitychange/pagehide)
OLD=("// Libérer le micro si l'app passe en arrière-plan (sinon \"appel en cours\" ailleurs)\n"
"document.addEventListener('visibilitychange',function(){ if(document.hidden && _recording) cancelRec(); });\n"
"window.addEventListener('pagehide',function(){ if(_recording) cancelRec(); else _releaseMic(); });")
NEW=(r'''// === Vocal interrompu : sauvegarde locale (IndexedDB) + reprise au retour ===
function _pvDB(cb){ try{ var r=indexedDB.open('penc-voice',1); r.onupgradeneeded=function(){ try{ r.result.createObjectStore('v'); }catch(e){} }; r.onsuccess=function(){ cb(r.result); }; r.onerror=function(){ cb(null); }; }catch(e){ cb(null); } }
function _pvSet(rec){ _pvDB(function(db){ if(!db) return; try{ db.transaction('v','readwrite').objectStore('v').put(rec,'pending'); }catch(e){} }); }
function _pvGet(cb){ _pvDB(function(db){ if(!db){ cb(null); return; } try{ var g=db.transaction('v','readonly').objectStore('v').get('pending'); g.onsuccess=function(){ cb(g.result||null); }; g.onerror=function(){ cb(null); }; }catch(e){ cb(null); } }); }
function _pvClear(){ _pvDB(function(db){ if(!db) return; try{ db.transaction('v','readwrite').objectStore('v').delete('pending'); }catch(e){} }); }
function _saveInterruptedRec(){
  if(!_recording) return;
  _recording=false;
  clearInterval(recTimer);
  var convId=CUR_CONV, secs=recSecs, mime=(window._recMime||'audio/webm');
  try{ if(mediaRec && mediaRec.state!=='inactive') mediaRec.stop(); }catch(e){}
  try{
    var blob=new Blob(audioChunks.slice(),{type:mime});
    if(blob && blob.size>800 && secs>=1 && convId){ _pvSet({conv:convId, blob:blob, dur:secs, mime:mime, t:Date.now()}); }
  }catch(e){}
  _releaseMic();
  var mb=document.getElementById('micBtn'); if(mb) mb.classList.remove('recording');
  var rb=document.getElementById('recBar'); if(rb) rb.classList.remove('show');
}
function _checkInterruptedRec(){
  if(document.getElementById('vocResumeBar')) return;
  _pvGet(function(rec){
    if(!rec || !rec.blob) return;
    if(rec.t && (Date.now()-rec.t)>86400000){ _pvClear(); return; }
    _showVocResume(rec);
  });
}
function _showVocResume(rec){
  if(document.getElementById('vocResumeBar')) return;
  var bar=document.createElement('div'); bar.id='vocResumeBar'; bar.className='voc-resume-bar';
  var ic=(typeof _svgIcon==='function')?_svgIcon('mic',18,'#1DD3B0'):'';
  bar.innerHTML='<div class="vrb-ic">'+ic+'</div>'
    +'<div class="vrb-txt"><div class="vrb-t1">Vocal interrompu</div><div class="vrb-t2">'+fmtDur((rec.dur||0)*1000)+' \u2014 non envoye</div></div>'
    +'<button class="vrb-del" onclick="_vocResumeDelete()">Supprimer</button>'
    +'<button class="vrb-send" onclick="_vocResumeSend()">Envoyer</button>';
  document.body.appendChild(bar);
  requestAnimationFrame(function(){ bar.classList.add('show'); });
}
function _hideVocResume(){ var b=document.getElementById('vocResumeBar'); if(b){ b.classList.remove('show'); setTimeout(function(){ if(b.parentNode) b.parentNode.removeChild(b); }, 320); } }
function _vocResumeSend(){
  _pvGet(function(rec){
    if(!rec||!rec.blob){ _hideVocResume(); return; }
    var conv=(typeof CONVS!=='undefined'&&CONVS)?CONVS.find(function(c){return String(c.id)===String(rec.conv);}):null;
    _pvClear(); _hideVocResume();
    if(!conv){ showNotif('\u274C','Vocal','Conversation introuvable','red',null); return; }
    openConv(conv);
    setTimeout(function(){ try{ recSecs=rec.dur||0; uploadAndSend(rec.blob,'voice', rec.mime||'audio/webm'); }catch(e){} }, 450);
  });
}
function _vocResumeDelete(){ _pvClear(); _hideVocResume(); }
// Arriere-plan pendant un enregistrement -> sauvegarder le vocal ; sinon liberer le micro
document.addEventListener('visibilitychange',function(){ if(document.hidden){ if(_recording) _saveInterruptedRec(); } else { _checkInterruptedRec(); } });
window.addEventListener('pagehide',function(){ if(_recording) _saveInterruptedRec(); else _releaseMic(); });''')
s=R(s,OLD,NEW,"Fonctions + handlers vocal interrompu")

# 4) Boot : verifier un vocal interrompu apres chargement des conversations
s=R(s,"    loadConvs().then(function(){ try{ _pencRestoreView(); }catch(e){} });",
      "    loadConvs().then(function(){ try{ _pencRestoreView(); }catch(e){} try{ _checkInterruptedRec(); }catch(e){} });",
      "Boot: check vocal interrompu")

# 5) Build bump
s=R(s,"console.log('PENC build v153 (persistance: position de scroll)');",
      "console.log('PENC build v154 (persistance: vocal interrompu)');","Build -> v154")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v154.")
