# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v131 (ne pas recharger l'app pendant que DeglouFM joue)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v131 — pas de reload pendant radio")

# 1) Helper _pencRadioBusy avant l'enregistrement du SW
s=R(s,"  navigator.serviceWorker.register('/sw.js').then(function(r){ console.log('[SW] enregistré', r.scope); try{ r.update(); }catch(e){} }).catch(function(e){ console.warn('[SW] échec', e); });",
      "  function _pencRadioBusy(){ try{ var fr=document.getElementById('radioFrame'); return !!(fr && fr.src && fr.src.indexOf('deglufm')!==-1); }catch(_){ return false; } }\n"
      "  window._pencRadioBusy=_pencRadioBusy;\n"
      "  navigator.serviceWorker.register('/sw.js').then(function(r){ console.log('[SW] enregistré', r.scope); try{ r.update(); }catch(e){} }).catch(function(e){ console.warn('[SW] échec', e); });",
      "Helper _pencRadioBusy")

# 2) Skip reg.update() au retour si radio joue
s=R(s,"    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible'){ _obFlush(); try{ navigator.serviceWorker.getRegistration().then(function(reg){ if(reg) reg.update(); }).catch(function(){}); }catch(e){} } });",
      "    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible'){ _obFlush(); if(_pencRadioBusy())return; try{ navigator.serviceWorker.getRegistration().then(function(reg){ if(reg) reg.update(); }).catch(function(){}); }catch(e){} } });",
      "Skip update si radio")

# 3) Skip reload controllerchange si radio joue
s=R(s,"  navigator.serviceWorker.addEventListener('controllerchange',function(){ if(_swReloaded)return; _swReloaded=true; location.reload(); });",
      "  navigator.serviceWorker.addEventListener('controllerchange',function(){ if(_swReloaded)return; if(_pencRadioBusy())return; _swReloaded=true; location.reload(); });",
      "Skip reload si radio")

# 4) Build bump
s=R(s,"console.log('PENC build v130 (DeglouFM: repli Reessayer, plus de sortie base44)');",
      "console.log('PENC build v131 (pas de rechargement pendant que DeglouFM joue)');","Build -> v131")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v131.")
