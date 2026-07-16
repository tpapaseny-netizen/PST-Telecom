# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v111 (B6 : tracage global des erreurs)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v111 — B6 tracage erreurs")

# 1) Capteur global d'erreurs (avant l'enregistrement du SW)
SW="// ── Service worker : push + mise à jour automatique de l'app ──"
HANDLER="""// ── B6 : tracage global des erreurs (remontee serveur) ──
(function(){
  var _ec=0, _seen={};
  function _logErr(message, detail){
    try{
      if(_ec>15) return;
      var key=String(message||'').slice(0,80);
      if(_seen[key]) return; _seen[key]=1; _ec++;
      var hd={'Content-Type':'application/json'};
      if(typeof TOKEN!=='undefined'&&TOKEN) hd['Authorization']='Bearer '+TOKEN;
      fetch(API+'/client-log',{method:'POST',headers:hd,body:JSON.stringify({message:message,detail:detail})}).catch(function(){});
    }catch(e){}
  }
  window.addEventListener('error', function(e){ try{ var fn=String(e.filename||'').split('/').pop(); _logErr((e.message||'error')+' @'+fn+':'+(e.lineno||0), (e.error&&e.error.stack)?String(e.error.stack).slice(0,300):''); }catch(_){} });
  window.addEventListener('unhandledrejection', function(e){ try{ var r=e.reason; _logErr('promise: '+String((r&&r.message)||r||'rejection').slice(0,120), (r&&r.stack)?String(r.stack).slice(0,300):''); }catch(_){} });
})();
"""+SW
s=R(s,SW,HANDLER,"Capteur erreurs global")

# 2) Libelle + icone client_error dans le panneau securite
s=R(s,"if(t==='user_unsuspended') return '🔓'; return '•'; }",
      "if(t==='user_unsuspended') return '🔓'; if(t==='client_error') return '🐞'; return '•'; }",
      "Icone client_error")
s=R(s,"if(t==='user_unsuspended') return 'Compte réactivé'; return t; }",
      "if(t==='user_unsuspended') return 'Compte réactivé'; if(t==='client_error') return 'Erreur app'; return t; }",
      "Libelle client_error")

# 3) Build bump
s=R(s,"console.log('PENC build v110 (B4: recadrage circulaire photo de profil)');",
      "console.log('PENC build v111 (B6: tracage global des erreurs)');","Build -> v111")

assert s.count('/client-log')>=1, "absent!"
data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v111.")
