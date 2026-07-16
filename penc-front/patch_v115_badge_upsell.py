# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v115 (proposer le badge bleu aux profils actifs)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v115 — upsell badge bleu")

# 1) Fonctions (apres closeOffStatus_KEEP)
ANCHOR="function closeOffStatus_KEEP(){}"
FUNCS=ANCHOR+"""
function _pencBadgeBig(){ return '<svg width="40" height="40" viewBox="0 0 24 24" fill="#1D9BF0"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"/><path d="M9.8 15.3l-2.9-2.9 1.3-1.3 1.6 1.6 4.2-4.2 1.3 1.3z" fill="#fff"/></svg>'; }
function _showBadgePromo(){
  var ov=document.getElementById('badgePromoOv');
  if(!ov){ ov=document.createElement('div'); ov.id='badgePromoOv'; ov.className='overlay'; document.body.appendChild(ov); }
  ov.innerHTML='<div class="sheet" style="text-align:center;"><div class="sheet-handle"></div>'
    +'<div style="margin:6px auto 12px;width:74px;height:74px;border-radius:50%;background:rgba(29,155,240,.12);display:flex;align-items:center;justify-content:center;">'+_pencBadgeBig()+'</div>'
    +'<div class="sheet-title" style="text-align:center;margin-bottom:6px;">Passe au badge bleu</div>'
    +'<div style="color:var(--muted);font-size:14px;line-height:1.6;margin-bottom:18px;padding:0 6px;">Tu fais partie des membres actifs de Penc ! Obtiens le badge certifie \\uD83D\\uDD35 : inspire confiance, gagne en visibilite et accede a un statut premium.</div>'
    +'<button onclick="closeBadgePromo();openVerifyRequest();" style="width:100%;padding:14px;border:none;border-radius:12px;background:#1D9BF0;color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Obtenir mon badge bleu</button>'
    +'<button onclick="closeBadgePromo()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:6px;">Plus tard</button></div>';
  ov.classList.add('show');
}
function closeBadgePromo(){ var o=document.getElementById('badgePromoOv'); if(o) o.classList.remove('show'); }
function _maybeProposeBadge(){
  try{
    if(window._badgePromoChecked) return; window._badgePromoChecked=true;
    if(!ME || ME.verified) return;                 // deja certifie -> rien
    if(typeof _isPenc==='function' && _isPenc(ME.id)) return;
    var active = (window.CONVS&&CONVS.length>0) || (window.STATUSES&&STATUSES.length>0) || (window.MY_STATUSES&&MY_STATUSES.length>0);
    if(!active) return;                             // cibler uniquement les profils actifs
    var last = parseInt(localStorage.getItem('penc_badge_promo_at')||'0',10);
    if(Date.now()-last < 3*24*3600*1000) return;    // au plus 1 fois / 3 jours
    localStorage.setItem('penc_badge_promo_at', String(Date.now()));
    _showBadgePromo();
  }catch(e){}
}"""
s=R(s,ANCHOR,FUNCS,"Fonctions upsell badge")

# 2) Declencheur (apres l'auto-prompt push)
TRIG="setTimeout(function(){ if(TOKEN && 'Notification' in window && Notification.permission==='default') enablePush(); }, 3500);"
NEWTRIG=TRIG+"\nsetTimeout(function(){ if(typeof _maybeProposeBadge==='function') _maybeProposeBadge(); }, 12000);"
s=R(s,TRIG,NEWTRIG,"Declencheur upsell (12s)")

# 3) Build bump
s=R(s,"console.log('PENC build v114 (vocaux differencies envoye/recu)');",
      "console.log('PENC build v115 (badge bleu: proposition auto aux profils actifs)');","Build -> v115")

assert s.count('function _maybeProposeBadge')==1, "absent!"
data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v115.")
