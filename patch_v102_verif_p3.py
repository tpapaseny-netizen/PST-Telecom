# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v102 (Badge bleu, Phase 3 : abonnement payant) — corrige
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v102 — Abonnement payant (Phase 3)")

# 1) Constantes + _subscribeVerify (apres closeVerReq)
ANCHOR = "function closeVerReq(){ var o=document.getElementById('verReqOv'); if(o) o.classList.remove('show'); }"
FUNCS = ANCHOR + r'''
var VERIF_PRICE = 5000;
var VERIF_WAVE_LINK = 'https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/';
function _subscribeVerify(){
  var amount=VERIF_PRICE;
  try{ window.open(VERIF_WAVE_LINK+(VERIF_WAVE_LINK.indexOf('?')>-1?'&':'?')+'amount='+amount,'_blank'); }catch(e){}
  api('/verify/request','POST',{type:'subscription',note:'Abonnement Wave '+amount+' FCFA'}).then(function(r){
    var b=document.getElementById('verReqBody');
    if(r&&r.success){ if(b) b.innerHTML='<div style="text-align:center;padding:18px 10px 6px;color:#00C896;font-weight:700;font-size:16px;">💳 Demande d\'abonnement enregistrée</div><div style="text-align:center;color:var(--muted);font-size:13px;line-height:1.6;padding:0 8px 14px;">Effectue le paiement Wave de '+amount+' FCFA. Ton badge bleu sera activé dès la confirmation du paiement par l\'équipe Penc.</div><button onclick="closeVerReq()" style="width:100%;padding:11px;border:none;border-radius:11px;background:var(--card2);color:var(--text);cursor:pointer;">Fermer</button>'; showNotif('💳','Abonnement','Demande enregistrée','green',null); }
    else showNotif('❌','Erreur',(r&&r.error)||'Échec','red',null);
  }).catch(function(){ showNotif('❌','Erreur','Réseau','red',null); });
}'''
s = R(s, ANCHOR, FUNCS, "Constantes + _subscribeVerify")

# 2) Bouton "Par abonnement" (avant Annuler)
ANNULER = "+'<button onclick=\"closeVerReq()\" style=\"width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:8px;\">Annuler</button>';"
SUB_BTN = ("+'<div style=\"text-align:center;color:var(--muted);font-size:12px;margin:12px 0 8px;\">\u2014 ou \u2014</div>'"
  "+'<button onclick=\"_subscribeVerify()\" style=\"width:100%;padding:13px;border:none;border-radius:12px;background:#00C896;color:#04150f;font-weight:700;font-size:15px;cursor:pointer;\">\U0001F4B3 Par abonnement ('+VERIF_PRICE+' FCFA)</button>'"
  + ANNULER)
s = R(s, ANNULER, SUB_BTN, "Bouton Par abonnement")

# 3) Panneau admin : afficher le type (abonnement vs piece)
OLD_DOC = r'''        +(r.doc_url?'<img src="'+r.doc_url+'" onclick="window.open(\''+r.doc_url+'\',\'_blank\')" style="width:100%;max-height:240px;object-fit:contain;border-radius:10px;background:#000;margin-bottom:8px;cursor:zoom-in;"/>':'')'''
NEW_DOC = r'''        +(r.type==='subscription'?'<div style="background:var(--card2);border-radius:10px;padding:11px;margin-bottom:8px;font-size:13px;">💳 <b>Abonnement</b> — '+esc(r.note||'paiement Wave')+'<br><span style="color:var(--muted);font-size:12px;">Vérifie le paiement Wave avant de certifier.</span></div>':(r.doc_url?'<img src="'+r.doc_url+'" onclick="window.open(\''+r.doc_url+'\',\'_blank\')" style="width:100%;max-height:240px;object-fit:contain;border-radius:10px;background:#000;margin-bottom:8px;cursor:zoom-in;"/>':''))'''
s = R(s, OLD_DOC, NEW_DOC, "Type abonnement dans panneau admin")

# 4) Build bump
s = R(s,
  "console.log('PENC build v101 (badge bleu P2: verification par pieces)');",
  "console.log('PENC build v102 (badge bleu P3: abonnement Wave)');",
  "Marqueur build -> v102")

assert s.count('function _subscribeVerify')==1, "Fonction abonnement absente !"

# Ecriture securisee : on encode AVANT d'ouvrir le fichier (pas de troncature si erreur)
data = s.encode("utf-8")
with io.open(FN, "wb") as f:
    f.write(data)

print("\nTermine. messager.html -> v102.")
