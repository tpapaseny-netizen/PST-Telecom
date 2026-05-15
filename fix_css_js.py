import re

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ── 1. CSS pour cc-pill (si absent) ──────────────────────────
if '.cc-pill' not in html:
    css = """
/* ── CRYPTO COINS NATIF ── */
.cc-pill{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid var(--border);background:var(--s2);border-radius:12px;cursor:pointer;transition:all .15s;user-select:none;-webkit-tap-highlight-color:transparent;}
.cc-pill:active{transform:scale(.96);}
.cc-pill.on{border-color:var(--gold);background:var(--gold-l);}
.cc-pill.on div[style*="font-size:13px"]{color:var(--gold);}
"""
    html = html.replace('</style>\n<script', css + '</style>\n<script')
    print("CSS cc-pill ajoute")
else:
    print("CSS cc-pill deja present")

# ── 2. JS cpPickCoin + fonctions crypto (si absent) ──────────
if 'function cpPickCoin' not in html:
    js = """
// ── CRYPTO NATIF ─────────────────────────────────────────────
var _cpCoin='usdt.trc20',_cpLabel='USDT TRC20',_cpNet='TRC20',_cpIziId=null,_cpAddr=null,_cpAmt=null,_cpCheckT=null;

function cpPickCoin(el){
  document.querySelectorAll('#cp-coins .cc-pill').forEach(function(b){b.classList.remove('on');});
  el.classList.add('on');
  _cpCoin=el.getAttribute('data-coin');
  _cpLabel=el.getAttribute('data-label');
  _cpNet=el.getAttribute('data-net');
  var lbl=document.getElementById('cp-pay-lbl');
  if(lbl)lbl.textContent=_cpLabel;
}

async function cpLancerPaiement(){
  if(!orderId){toast("Créez d'abord la commande",'err');return;}
  _cpShowStep('loading');
  var ll=document.getElementById('cp-loading-lbl'); if(ll)ll.textContent=_cpLabel;
  var amt=parseFloat(document.getElementById('s-amt')?document.getElementById('s-amt').value:0)||0;
  var rateV=rates[cK]||606;
  var rateToUsd=cK==='usd'?1:(rates.usd/(rateV||1));
  try{
    var res=await fetch(API+'/api/zama/crypto/create',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({coin_key:_cpCoin,amount:amt,src_currency:curr,rate_usd:rateToUsd,order_id:orderId,
        receiver_name:document.getElementById('r-name')?document.getElementById('r-name').value.trim():'',
        receiver_phone:document.getElementById('r-phone')?document.getElementById('r-phone').value.trim():'',
        receiver_mm:MM,
        sender_name:document.getElementById('s-name')?document.getElementById('s-name').value.trim():'',
        sender_email:document.getElementById('s-email')?document.getElementById('s-email').value.trim():'',
        net_fcfa:Math.round(amt*rateV*(1-FEE))})});
    var data=await res.json();
    if(!data.ok||!data.address)throw new Error(data.error||'Adresse non generee');
    _cpIziId=data.izi_id;_cpAddr=data.address;_cpAmt=data.amount_crypto;_cpNet=data.network||_cpNet;
    _cpShowAddr();
  }catch(err){_cpShowStep('choose');toast('Erreur: '+err.message,'err');}
}

function _cpShowAddr(){
  var _s=function(id,v){var e=document.getElementById(id);if(e)e.textContent=v||'--';};
  _s('cp-addr-lbl',_cpLabel);_s('cp-addr-display',_cpAddr);_s('cp-crypto-amt',_cpAmt);
  _s('cp-crypto-coin',_cpLabel.split(' ')[0]);_s('cp-crypto-net',_cpNet);_s('cp-net-badge',_cpNet);
  _s('cp-warn-coin',_cpLabel);_s('cs-amt1',(_cpAmt||'--')+' '+(_cpLabel.split(' ')[0]||''));
  _s('cs-mm',MM==='wave'?'Wave':'Orange Money');_s('cs-mm-success',MM==='wave'?'Wave':'Orange Money');
  var warn=document.getElementById('cp-net-warn');
  if(warn)warn.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="m10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>Envoyez <strong>uniquement '+_cpLabel+'</strong> a cette adresse. Tout autre reseau = perte definitive.</div>';
  cpDrawQR(_cpAddr);
  _cpShowStep('addr');
  if(_cpCheckT)clearInterval(_cpCheckT);
  _cpCheckT=setInterval(cpAutoCheck,20000);
}

function cpDrawQR(text){
  var cv=document.getElementById('cp-qr-canvas');if(!cv)return;
  var parent=cv.parentNode;var ex=document.getElementById('cp-qr-img');if(ex)ex.remove();
  var img=document.createElement('img');img.id='cp-qr-img';img.width=160;img.height=160;
  img.style.cssText='display:block;border-radius:4px';
  img.src='https://api.qrserver.com/v1/create-qr-code/?size=160x160&data='+encodeURIComponent(text)+'&color=070D1A&bgcolor=ffffff&format=png&margin=2';
  cv.style.display='none';parent.appendChild(img);
}

function cpCopyAddr(){if(!_cpAddr){toast('Adresse non disponible','err');return;}navigator.clipboard.writeText(_cpAddr).then(function(){toast('Adresse copiee !','ok');});}
function cpShareAddr(){if(!_cpAddr)return;var text='Paiement ZAMA '+_cpLabel+'\nMontant: '+_cpAmt+' '+_cpLabel.split(' ')[0]+'\nAdresse: '+_cpAddr;if(navigator.share)navigator.share({title:'Paiement ZAMA',text:text}).catch(function(){});else navigator.clipboard.writeText(text).then(function(){toast('Copie !','ok');});}

async function cpVerifyPayment(){
  if(!orderId)return;
  var btn=document.getElementById('cp-verify-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<div class="spin"></div> Verification...';}
  try{
    var res=await fetch(API+'/api/zama/crypto/status/'+orderId);
    var data=await res.json();
    _cpUpdateConfirms(data.confirmations||0);
    if(data.status==='paid'){_cpOnPaid();return;}
    toast('Pas encore confirme ('+(data.confirmations||0)+'/3 conf.)','info');
  }catch(e){toast('Erreur: '+e.message,'err');}
  if(btn){btn.disabled=false;btn.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> J\\'ai envoye - Verifier';}
}

async function cpAutoCheck(){
  if(!orderId)return;
  try{var res=await fetch(API+'/api/zama/crypto/status/'+orderId);var data=await res.json();_cpUpdateConfirms(data.confirmations||0);if(data.status==='paid'){clearInterval(_cpCheckT);_cpOnPaid();}}catch(e){}
}

function _cpUpdateConfirms(n){
  var bar=document.getElementById('cp-confirms-bar');if(bar)bar.style.display=n>0?'flex':'none';
  var txt=document.getElementById('cp-confirms-txt');if(txt)txt.textContent='Confirmations : '+n+'/3';
  for(var i=0;i<3;i++){var dot=document.getElementById('cf'+i);if(dot)dot.className='conf-dot'+(i<n?' on':'');}
}

function _cpOnPaid(){
  clearInterval(_cpCheckT);updateOrder(orderId,'paid');updateBalanceCard();
  var badge=document.getElementById('cp-status-badge');
  if(badge){badge.style.background='var(--green-l)';badge.style.color='var(--green)';badge.style.borderColor='rgba(34,197,94,.2)';badge.innerHTML='<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Confirme !';}
  _cpShowStep('success');
  if(navigator.vibrate)navigator.vibrate([50,30,100]);
}

function _cpShowStep(step){
  var steps={choose:'cp-step-choose',loading:'cp-step-loading',addr:'cp-step-addr',success:'cp-step-success'};
  Object.keys(steps).forEach(function(k){
    var el=document.getElementById(steps[k]);if(!el)return;
    if(k===step){el.style.display=k==='choose'?'block':'flex';if(k!=='choose')el.style.flexDirection='column';}
    else{el.style.display='none';}
  });
}

function cpRetourChoix(){if(_cpCheckT)clearInterval(_cpCheckT);_cpAddr=null;_cpAmt=null;_cpIziId=null;_cpShowStep('choose');}
function lancerPaiementCrypto(){cpLancerPaiement();}
function showIframeLoading(){_cpShowStep('choose');_cpAddr=null;_cpAmt=null;_cpIziId=null;}
function showIframe(url){window._payUrl=url;}
function showFallback(){switchTab('crypto');_cpShowStep('choose');}
function retourChoix(){cpRetourChoix();}
"""
    # Insérer avant // TOAST
    if '// TOAST' in html:
        html = html.replace('// TOAST', js + '\n// TOAST')
        print("JS crypto ajoute avant TOAST")
    else:
        # Insérer avant la dernière balise </script>
        html = html.rsplit('</script>', 1)
        html = html[0] + js + '\n</script>' + html[1]
        print("JS crypto ajoute en fin de script")
else:
    print("JS cpPickCoin deja present")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Termine!")
