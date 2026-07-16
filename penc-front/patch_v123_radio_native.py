# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v123 (lecteur radio natif dans Penc, fin de l'iframe DeglouFM)"""
import io, sys, re
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
def RX(s,pat,new,label):
    new2,n=re.subn(pat, lambda m: new, s, flags=re.S)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return new2
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v123 — radio native")

# 1) Markup .radio-body -> lecteur natif
NATIVE_MARKUP=(
'<div class="radio-native">'
'<div class="radio-nat-head">\U0001F30D Radios par pays</div>'
'<div class="radio-countries" id="radioCountries"></div>'
'<div class="radio-stations" id="radioStations"></div>'
'</div>'
'<audio id="radioAudio" preload="none"></audio>'
)
s=RX(s, r'<iframe id="radioFrame".*?Ouvrir DeglouFM &#8599;</button>\s*</div>', NATIVE_MARKUP, "Markup lecteur natif")

# 2) CSS
CSS=('<style id="radio-native-css">\n'
'.radio-native{display:flex;flex-direction:column;height:100%;overflow:hidden;}\n'
'.radio-nat-head{padding:12px 14px 6px;color:#fff;font-weight:700;font-size:15px;}\n'
'.radio-countries{display:flex;gap:8px;overflow-x:auto;padding:6px 14px 10px;flex:none;-webkit-overflow-scrolling:touch;}\n'
'.radio-chip{flex:none;padding:8px 13px;border-radius:20px;background:rgba(255,255,255,.08);color:#cfd8e3;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid transparent;}\n'
'.radio-chip.active{background:#00C896;color:#04231a;border-color:#00C896;}\n'
'.radio-stations{flex:1;overflow-y:auto;padding:4px 10px 14px;display:flex;flex-direction:column;gap:6px;}\n'
'.radio-station{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.04);cursor:pointer;}\n'
'.radio-station.active{background:rgba(0,200,150,.14);}\n'
'.rs-ic{width:42px;height:42px;border-radius:10px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;}\n'
'.rs-ic img{width:100%;height:100%;object-fit:cover;}\n'
'.rs-ph{font-size:20px;}\n'
'.rs-info{flex:1;min-width:0;}\n'
'.rs-name{color:#fff;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}\n'
'.rs-meta{color:#8b97a3;font-size:11.5px;margin-top:2px;}\n'
'.rs-eq{color:#00C896;font-size:13px;width:16px;text-align:center;flex:none;}\n'
'.radio-loading,.radio-empty{color:#8b97a3;text-align:center;padding:24px;font-size:14px;}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS radio native")

# 3) Remplacer l'IIFE radio (iframe) par le lecteur natif
NEW_IIFE=r'''(function(){
  var SERVERS=['https://de1.api.radio-browser.info','https://de2.api.radio-browser.info','https://fi1.api.radio-browser.info','https://nl1.api.radio-browser.info'];
  var COUNTRIES=[{c:'SN',n:'Sénégal',f:'🇸🇳'},{c:'ML',n:'Mali',f:'🇲🇱'},{c:'CI',n:"Côte d'Ivoire",f:'🇨🇮'},{c:'GN',n:'Guinée',f:'🇬🇳'},{c:'MR',n:'Mauritanie',f:'🇲🇷'},{c:'GM',n:'Gambie',f:'🇬🇲'},{c:'BF',n:'Burkina',f:'🇧🇫'},{c:'NE',n:'Niger',f:'🇳🇪'},{c:'CM',n:'Cameroun',f:'🇨🇲'},{c:'CD',n:'RD Congo',f:'🇨🇩'},{c:'NG',n:'Nigeria',f:'🇳🇬'},{c:'MA',n:'Maroc',f:'🇲🇦'},{c:'FR',n:'France',f:'🇫🇷'},{c:'US',n:'USA',f:'🇺🇸'}];
  var _active=false,_playing=false,_cur=null,_stations=[],_curCountry='SN';
  var ICON_PAUSE='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICON_PLAY='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>';
  function el(id){ return document.getElementById(id); }
  function audio(){ var a=el('radioAudio'); if(!a){ a=document.createElement('audio'); a.id='radioAudio'; a.preload='none'; document.body.appendChild(a); } return a; }
  window.rsImgErr=function(img){ try{ img.style.display='none'; }catch(_){} };
  function paintPP(){ var b=el('rbPlayPause'); if(b) b.innerHTML=_playing?ICON_PAUSE:ICON_PLAY; }
  function setBar(name,sub){ var n=el('rbName'); if(n) n.textContent=name||'Radio'; var su=el('rbSub'); if(su) su.textContent=sub||(_playing?'En lecture':'En pause'); }
  function showBar(){ var bar=el('radioBar'); if(bar) bar.classList.add('show'); var sm=el('screen-main'); if(sm) sm.classList.add('radio-active'); paintPP(); }
  function renderCountries(){ var box=el('radioCountries'); if(!box) return; box.innerHTML=COUNTRIES.map(function(x){ return '<div class="radio-chip'+(x.c===_curCountry?' active':'')+'" onclick="radioPickCountry(\''+x.c+'\')">'+x.f+' '+x.n+'</div>'; }).join(''); }
  function renderStations(){ var box=el('radioStations'); if(!box) return; if(!_stations.length){ box.innerHTML='<div class="radio-empty">Aucune station trouvée.</div>'; return; } box.innerHTML=_stations.map(function(s,idx){ var on=_cur&&_cur.stationuuid===s.stationuuid; var fav=s.favicon?('<img src="'+s.favicon+'" onerror="rsImgErr(this)"/>'):'<span class="rs-ph">📻</span>'; var meta=[s.codec||'',s.bitrate?(s.bitrate+'k'):''].filter(Boolean).join(' · ')||(s.country||''); return '<div class="radio-station'+(on?' active':'')+'" onclick="radioPlay('+idx+')"><div class="rs-ic">'+fav+'</div><div class="rs-info"><div class="rs-name">'+esc(s.name||'Station')+'</div><div class="rs-meta">'+esc(meta)+'</div></div><div class="rs-eq">'+((on&&_playing)?'▶':'')+'</div></div>'; }).join(''); }
  window.radioPickCountry=function(code){ _curCountry=code; renderCountries(); loadStations(code); };
  function loadStations(code){ var box=el('radioStations'); if(box) box.innerHTML='<div class="radio-loading">Chargement…</div>'; var i=0; (function tryS(){ if(i>=SERVERS.length){ if(box) box.innerHTML='<div class="radio-empty">Stations indisponibles. Réessaie.</div>'; return; } var base=SERVERS[i++]; fetch(base+'/json/stations/bycountrycodeexact/'+code+'?hidebroken=true&order=clickcount&reverse=true&limit=80').then(function(r){ if(!r.ok) throw 0; return r.json(); }).then(function(list){ _stations=(list||[]).filter(function(s){ return s.url_resolved; }); renderStations(); }).catch(function(){ tryS(); }); })(); }
  function setMedia(s){ if('mediaSession' in navigator){ try{ navigator.mediaSession.metadata=new MediaMetadata({title:s.name||'Radio',artist:'Radio · Penc',artwork:s.favicon?[{src:s.favicon,sizes:'128x128',type:'image/png'}]:[]}); navigator.mediaSession.setActionHandler('play',function(){ radioToggle(); }); navigator.mediaSession.setActionHandler('pause',function(){ radioToggle(); }); }catch(_){} } }
  window.radioPlay=function(idx){ var s=_stations[idx]; if(!s) return; _cur=s; var a=audio(); try{ a.src=s.url_resolved; var pr=a.play(); if(pr&&pr.then) pr.then(function(){ _playing=true; paintPP(); setMedia(s); renderStations(); }).catch(function(){ _playing=false; paintPP(); setBar(s.name,'Flux indisponible'); }); }catch(_){} _playing=true; _active=true; paintPP(); setBar(s.name,'En lecture'); renderStations(); showBar(); try{ if(s.stationuuid) fetch(SERVERS[0]+'/json/url/'+s.stationuuid).catch(function(){}); }catch(_){} };
  window.openRadio=function(){ var p=el('radioPanel'); if(!p) return; if(!_active){ renderCountries(); loadStations(_curCountry); } else { renderCountries(); renderStations(); } p.classList.add('show'); var bar=el('radioBar'); if(bar) bar.classList.remove('show'); var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active'); };
  window.closeRadio=function(){ var p=el('radioPanel'); if(p) p.classList.remove('show'); if(_active){ showBar(); } };
  window.stopRadio=function(){ var a=el('radioAudio'); if(a){ try{ a.pause(); a.src=''; }catch(_){} } var p=el('radioPanel'); if(p) p.classList.remove('show'); var bar=el('radioBar'); if(bar) bar.classList.remove('show'); var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active'); _active=false; _playing=false; _cur=null; };
  window.radioToggle=function(){ var a=audio(); if(_playing){ try{ a.pause(); }catch(_){} _playing=false; } else { try{ if(_cur && !a.src) a.src=_cur.url_resolved; var pr=a.play(); if(pr&&pr.catch) pr.catch(function(){}); }catch(_){} _playing=true; } paintPP(); if(_cur) setBar(_cur.name,_playing?'En lecture':'En pause'); renderStations(); };
  setTimeout(function(){ var a=audio(); a.addEventListener('playing',function(){ _playing=true; paintPP(); renderStations(); }); a.addEventListener('pause',function(){ _playing=false; paintPP(); renderStations(); }); a.addEventListener('error',function(){ if(_cur) setBar(_cur.name,'Flux indisponible'); }); }, 0);
})();'''
s=RX(s, r"\(function\(\)\{\n  var RADIO_URL='https://deglufm\.base44\.app';.*?\n\}\)\(\);", NEW_IIFE, "IIFE radio native")

# 4) Build bump
s=R(s,"console.log('PENC build v122 (alignement strict des bulles: max 75%)');",
      "console.log('PENC build v123 (radio native dans Penc, fin iframe DeglouFM)');","Build -> v123")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v123.")
