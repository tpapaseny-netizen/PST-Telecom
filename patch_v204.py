# -*- coding: utf-8 -*-
"""PENC v204 (front Etape 3) — envoi note+commentaire au serveur + section admin evaluations"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
RAT=io.open("fb_rating.js",encoding="utf-8").read()
ADM=io.open("fb_admrate.js",encoding="utf-8").read()
print("Patch v204")

# 1) Remplacer _showCallRating (slice jusqu'a var _lk={)
a=s.find("function _showCallRating(type){")
b=s.find("var _lk={", a)
if a<0 or b<0: print("  [ECHEC] bornes _showCallRating"); sys.exit(1)
s=s[:a]+RAT+"\n"+s[b:]
print("  [OK]   _showCallRating + _submitCallRating")

# 2) _lastCall : ajouter peer
s=R(s,"  try{ _lastCall={secs:_callElapsed(),type:_lk.type||'audio',connected:!!_lk.connected}; }catch(_lc){}",
      "  try{ _lastCall={secs:_callElapsed(),type:_lk.type||'audio',connected:!!_lk.connected,peer:(_lk.targetId||_lk.callerId)||null}; }catch(_lc){}",
      "_lastCall +peer")

# 3) Fonctions admin ratings (avant function openAdmin())
s=R(s,"function openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      ADM+"\nfunction openAdmin(){\n  var ov=document.getElementById('adminOverlay');",
      "Fonctions admin ratings")

# 4) Bouton dans renderAdmin (apres Comptes supprimes)
DEL='  html+=`<button onclick="openAdminDeleted()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#5b6472;color:#fff;font-weight:700;cursor:pointer;margin:0 0 10px;">🗑️ Comptes supprimés</button>`;'
RATE_BTN='  html+=`<button onclick="openAdminRatings()" style="width:100%;padding:11px;border:none;border-radius:11px;background:#D4A017;color:#04150f;font-weight:700;cursor:pointer;margin:0 0 10px;">⭐ Évaluations des appels</button>`;'
s=R(s,DEL,DEL+"\n"+RATE_BTN,"Bouton evaluations")

# 5) Build
s=R(s,"console.log('PENC build v203 (admin: actions utilisateurs + corbeille)');",
      "console.log('PENC build v204 (admin: evaluations des appels)');","Build -> v204")

io.open(FN,"wb").write(s.encode("utf-8")); print("OK v204")
