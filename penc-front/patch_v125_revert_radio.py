# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v125 (REVERT radio: retour a l'integration DeglouFM iframe d'origine)"""
import io, sys
FN="messager.html"
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Revert radio native -> DeglouFM iframe")

# 1) Restaurer le markup d'origine (iframe + foot + fallback)
ORIG_MARKUP=('<iframe id="radioFrame" title="DeglouFM" allow="autoplay; encrypted-media; fullscreen"></iframe>\n'
'      <div class="radio-foot" id="radioFoot"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#00C896" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span>DeglouFM</span></div>\n'
'      <div class="radio-fallback" id="radioFallback">\n'
"        <div style=\"font-size:15px; line-height:1.5;\">DeglouFM ne peut pas s'afficher integre ici<br/>(protection anti-iframe du site).</div>\n"
'        <button onclick="window.open(\'https://deglufm.base44.app\',\'_blank\')">Ouvrir DeglouFM &#8599;</button>\n'
'      </div>')
a=s.index('<div class="radio-native">')
b=s.index('</audio>',a)+len('</audio>')
s=s[:a]+ORIG_MARKUP+s[b:]
print("  [OK]   markup iframe restaure")

# 2) Restaurer l'IIFE d'origine
ORIG_IIFE=r'''(function(){
  var RADIO_URL='https://deglufm.base44.app';
  var _loaded=false, _fbTimer=null, _active=false, _playing=true;
  var ICON_PAUSE='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICON_PLAY='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>';
  function el(id){ return document.getElementById(id); }
  function paintPP(){ var b=el('rbPlayPause'); if(b) b.innerHTML=_playing?ICON_PAUSE:ICON_PLAY; var sub=el('rbSub'); if(sub) sub.textContent=_playing?'En lecture':'En pause'; }
  window.openRadio=function(){
    var p=el('radioPanel'), fr=el('radioFrame'), fb=el('radioFallback');
    if(!p||!fr) return;
    if(!_active){
      _loaded=false; if(fb) fb.classList.remove('show');
      var _u=((typeof ME!=='undefined' && ME) ? ME : {});
      var _q=[];
      if(_u.email) _q.push('penc_email='+encodeURIComponent(_u.email));
      if(_u.full_name) _q.push('penc_name='+encodeURIComponent(_u.full_name));
      var _url=RADIO_URL+(_q.length?('?'+_q.join('&')):'');
      fr.onload=function(){
        _loaded=true; if(fb) fb.classList.remove('show');
        if(_u.email||_u.full_name||_u.username){
          var _auth={source:'penc', action:'auth', email:_u.email||'', name:_u.full_name||'', username:_u.username||'', id:(_u.id!=null?String(_u.id):'')};
          var _send=function(){ try{ if(fr.contentWindow) fr.contentWindow.postMessage(_auth, '*'); }catch(_){} };
          _send();
          var _t=0, _iv=setInterval(function(){ _t++; _send(); if(_t>=8) clearInterval(_iv); }, 700);
        }
      };
      fr.src=_url;
      if(_fbTimer) clearTimeout(_fbTimer);
      _fbTimer=setTimeout(function(){ if(!_loaded && fb) fb.classList.add('show'); }, 6000);
      _active=true; _playing=true; paintPP();
    }
    p.classList.add('show');
    var bar=el('radioBar'); if(bar) bar.classList.remove('show');
    var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active');
  };
  window.closeRadio=function(){
    var p=el('radioPanel'); if(p) p.classList.remove('show');
    if(_active){
      paintPP();
      var bar=el('radioBar'); if(bar) bar.classList.add('show');
      var sm=el('screen-main'); if(sm) sm.classList.add('radio-active');
    }
  };
  window.stopRadio=function(){
    var fr=el('radioFrame'); if(fr){ try{ fr.src='about:blank'; }catch(_){} }
    var p=el('radioPanel'); if(p) p.classList.remove('show');
    var bar=el('radioBar'); if(bar) bar.classList.remove('show');
    var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active');
    _active=false; _loaded=false; _playing=true;
    if(_fbTimer) clearTimeout(_fbTimer);
  };
  window.radioToggle=function(){
    var fr=el('radioFrame');
    if(fr && fr.contentWindow){ try{ fr.contentWindow.postMessage({source:'penc', action:'toggle'}, '*'); }catch(_){} }
    _playing=!_playing; paintPP();
  };
  window.addEventListener('message', function(e){
    try{
      var d=e.data; if(!d || typeof d!=='object' || d.source!=='deglufm') return;
      if(typeof d.playing!=='undefined'){ _playing=!!d.playing; paintPP(); }
      if(d.station){ var n=el('rbName'); if(n) n.textContent=d.station; }
    }catch(_){}
  }, false);
})();'''
a2=s.index("(function(){\n  var SERVERS=[")
b2=s.index("})();",a2)+len("})();")
s=s[:a2]+ORIG_IIFE+s[b2:]
print("  [OK]   IIFE DeglouFM restauree")

# 3) Retirer le bloc CSS radio-native
a3=s.index('<style id="radio-native-css">')
b3=s.index('</style>',a3)+len('</style>')
# enlever aussi le saut de ligne juste avant le style si present
pre = s[a3-1] if a3>0 else ''
start = a3-1 if pre=='\n' else a3
s=s[:start]+s[b3:]
print("  [OK]   CSS radio-native retire")

# 4) Build bump
s=s.replace("console.log('PENC build v124 (redirection instantanee au clic des notifications)');",
            "console.log('PENC build v125 (radio DeglouFM restauree)');",1)

io.open(FN,"wb").write(s.encode("utf-8"))
print("\nTermine. messager.html -> v125 (radio DeglouFM d'origine).")
