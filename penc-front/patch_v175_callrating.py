# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v175 (evaluation qualite d'appel - etoiles)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v175 — note qualite appel")

# 1) Fonctions rating (avant var _lk={)
RAT=r'''var _lastCall=null;
function _maybeRateCall(){ try{ if(_lastCall && _lastCall.connected && (_lastCall.secs||0)>=3){ setTimeout(function(){ _showCallRating(_lastCall.type); }, 700); } }catch(e){} }
function _saveCallRating(n,type){ try{ var arr=JSON.parse(localStorage.getItem('penc_call_ratings')||'[]'); arr.push({rating:n,type:type||'audio',ts:Date.now()}); if(arr.length>500) arr=arr.slice(-500); localStorage.setItem('penc_call_ratings',JSON.stringify(arr)); }catch(e){} }
function _closeCallRating(){ var ov=document.getElementById('callRateOv'); if(ov){ ov.classList.remove('show'); setTimeout(function(){ try{ov.remove();}catch(e){} },280); } }
function _showCallRating(type){
  try{
    if(document.getElementById('callRateOv')) return;
    var ov=document.createElement('div'); ov.id='callRateOv'; ov.className='call-rate-ov';
    var star='<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    var sh=''; for(var i=1;i<=5;i++){ sh+='<button class="cr-star" data-n="'+i+'">'+star+'</button>'; }
    ov.innerHTML='<div class="call-rate-card"><div class="cr-title">Qualit\u00e9 de l\u2019appel</div><div class="cr-sub">Comment s\u2019est pass\u00e9 votre appel\u00a0?</div><div class="cr-stars">'+sh+'</div><button class="cr-skip">Ignorer</button></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function(){ ov.classList.add('show'); });
    var stars=ov.querySelectorAll('.cr-star');
    function paint(n){ stars.forEach(function(s,idx){ s.classList.toggle('on', idx<n); }); }
    stars.forEach(function(s){
      s.addEventListener('mouseenter',function(){ paint(parseInt(s.dataset.n,10)); });
      s.addEventListener('click',function(){ var n=parseInt(s.dataset.n,10); paint(n); _saveCallRating(n,type); var sub=ov.querySelector('.cr-sub'); if(sub) sub.textContent='Merci pour votre retour\u00a0!'; setTimeout(_closeCallRating,950); });
    });
    var sc=ov.querySelector('.cr-stars'); if(sc) sc.addEventListener('mouseleave',function(){ paint(0); });
    ov.querySelector('.cr-skip').addEventListener('click',_closeCallRating);
    ov.addEventListener('click',function(e){ if(e.target===ov) _closeCallRating(); });
  }catch(e){}
}
var _lk={'''
s=R(s,"var _lk={",RAT,"Fonctions rating")

# 2) cleanupCall : capturer le dernier appel
s=R(s,"function cleanupCall(){\n  try{_releaseWakeLock();}catch(_w){}\n",
      "function cleanupCall(){\n  try{_releaseWakeLock();}catch(_w){}\n  try{ _lastCall={secs:_lk.seconds||0,type:_lk.type||'audio',connected:!!_lk.connected}; }catch(_lc){}\n",
      "cleanupCall capture _lastCall")

# 3) Déclencher la note après les fins d'appel décrochées
s=R(s,"  _logCall(_lk.connected?'answered':'cancelled');\n  cleanupCall();\n  _callEndToast('Appel terminé', _fmtDur(_secs));\n}",
      "  _logCall(_lk.connected?'answered':'cancelled');\n  cleanupCall();\n  _callEndToast('Appel terminé', _fmtDur(_secs));\n  _maybeRateCall();\n}",
      "Rating endCall")
s=R(s,"      _logCall('answered');\n      cleanupCall();\n      _callEndToast('Appel terminé', _fmtDur(_secs));\n    });",
      "      _logCall('answered');\n      cleanupCall();\n      _callEndToast('Appel terminé', _fmtDur(_secs));\n      _maybeRateCall();\n    });",
      "Rating ParticipantDisconnected")
s=R(s,"    var _secs=_lk.seconds; _logCall(_lk.connected?'answered':'cancelled'); cleanupCall(); _callEndToast('Appel terminé', _fmtDur(_secs));",
      "    var _secs=_lk.seconds; _logCall(_lk.connected?'answered':'cancelled'); cleanupCall(); _callEndToast('Appel terminé', _fmtDur(_secs)); _maybeRateCall();",
      "Rating call:ended")

# 4) CSS
CSS=(".call-back-btn:active{background:rgba(46,230,143,0.14)}\n"
".call-rate-ov{position:fixed;inset:0;z-index:99600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .25s}\n"
".call-rate-ov.show{opacity:1}\n"
".call-rate-card{width:86%;max-width:340px;background:rgba(26,26,26,.96);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:26px 22px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.6);transform:translateY(12px) scale(.97);transition:transform .3s cubic-bezier(.2,.9,.3,1.2)}\n"
".call-rate-ov.show .call-rate-card{transform:translateY(0) scale(1)}\n"
".cr-title{color:#fff;font-size:20px;font-weight:800}\n"
".cr-sub{color:#9aa0a6;font-size:14px;margin-top:6px}\n"
".cr-stars{display:flex;justify-content:center;gap:6px;margin:20px 0 8px}\n"
".cr-star{background:none;border:none;cursor:pointer;color:#3a4458;padding:4px;transition:transform .12s,color .15s}\n"
".cr-star:active{transform:scale(.9)}\n"
".cr-star.on{color:#ffc83d}\n"
".cr-skip{margin-top:10px;background:none;border:none;color:#8a9bb0;font-size:14px;font-weight:600;cursor:pointer;padding:8px}")
s=R(s,".call-back-btn:active{background:rgba(46,230,143,0.14)}",CSS,"CSS rating")

# 5) Build
s=R(s,"console.log('PENC build v174 (video deux sens + anti-coupure audio)');",
      "console.log('PENC build v175 (note qualite appel)');","Build -> v175")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v175.")
