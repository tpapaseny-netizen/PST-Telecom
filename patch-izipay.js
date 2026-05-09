const fs = require('fs');

// Widget code to inject before </body>
const WIDGET = `
<!-- ═══ izichangePay Crypto Widget ═══ -->
<style>
.izipay-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;}
.izipay-modal{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:440px;color:#e2e8f0;font-family:'Segoe UI',sans-serif;position:relative;}
.izipay-title{font-size:17px;font-weight:800;margin-bottom:4px;}
.izipay-amount{font-size:30px;font-weight:900;color:#00e5ff;margin-bottom:20px;}
.izipay-step{display:none;} .izipay-step.active{display:block;}
.crypto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.crypto-btn{padding:13px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#64748b;border-radius:12px;cursor:pointer;text-align:center;transition:all .2s;font-size:11px;font-weight:700;}
.crypto-btn:hover,.crypto-btn.sel{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}
.crypto-icon{font-size:20px;display:block;margin-bottom:3px;}
.izipay-btn{width:100%;padding:14px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;transition:background .2s;}
.izipay-btn:active{background:#00bcd4;} .izipay-btn:disabled{background:#1e2d47;color:#64748b;cursor:not-allowed;}
.izipay-btn-sec{width:100%;padding:11px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:13px;cursor:pointer;margin-top:8px;}
.izipay-addr-box{background:#0a0e1a;border:1px solid #1e2d47;border-radius:12px;padding:14px 14px 14px 14px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;position:relative;padding-right:80px;}
.izipay-copy-btn{position:absolute;top:10px;right:10px;background:#1e2d47;border:none;color:#e2e8f0;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;white-space:nowrap;}
.izipay-warn{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:10px;padding:11px;font-size:11px;color:#f97316;margin-top:10px;}
.izipay-close{position:absolute;top:16px;right:16px;background:transparent;border:none;color:#64748b;font-size:20px;cursor:pointer;line-height:1;}
.izipay-success{text-align:center;padding:20px 0;}
.izipay-spinner{display:inline-block;font-size:36px;animation:iziSpin 1.5s linear infinite;}
@keyframes iziSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.izipay-timer{text-align:center;font-size:11px;color:#64748b;margin-top:8px;}
.izi-crypto-pay-btn{background:linear-gradient(135deg,#1e3a5f,#0a1628);border:2px solid #00e5ff;color:#00e5ff;padding:12px 20px;border-radius:12px;cursor:pointer;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:8px;transition:all .2s;margin-top:8px;}
.izi-crypto-pay-btn:hover{background:rgba(0,229,255,.1);}
</style>

<div id="izipay-overlay" class="izipay-overlay" style="display:none">
  <div class="izipay-modal">
    <button class="izipay-close" onclick="iziClose()">✕</button>
    <div class="izipay-title">⚡ Payer en Cryptomonnaie</div>
    <div class="izipay-amount" id="izi-amt">$0.00 USD</div>
    <div class="izipay-step active" id="izi-s1">
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre crypto :</div>
      <div class="crypto-grid">
        <div class="crypto-btn sel" onclick="iziSelCrypto(this,'USDT.BEP20')"><span class="crypto-icon">💚</span>USDT BEP20</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'USDT.TRC20')"><span class="crypto-icon">💚</span>USDT TRC20</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'BTC')"><span class="crypto-icon">₿</span>Bitcoin</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'ETH')"><span class="crypto-icon">◆</span>Ethereum</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'BNB')"><span class="crypto-icon">🟡</span>BNB</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'TRX')"><span class="crypto-icon">🔴</span>TRON</div>
      </div>
      <div class="izipay-warn">⚠️ Envoyez le montant exact sur le bon réseau pour éviter toute perte.</div>
      <button class="izipay-btn" onclick="iziGenerate()">▶ Générer l'adresse de paiement</button>
      <button class="izipay-btn-sec" onclick="iziPOS()">🔗 Payer via izichangePay.com</button>
    </div>
    <div class="izipay-step" id="izi-s2">
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez exactement <b id="izi-exact" style="color:#00e5ff"></b> à :</div>
      <div class="izipay-addr-box" id="izi-addr">--<button class="izipay-copy-btn" onclick="iziCopy()">📋 Copier</button></div>
      <div style="font-size:11px;color:#64748b" id="izi-net"></div>
      <div class="izipay-timer" id="izi-tmr"></div>
      <div class="izipay-warn">⏳ Votre paiement sera confirmé automatiquement après réception.</div>
      <button class="izipay-btn" id="izi-chk-btn" onclick="iziCheck()">🔄 Vérifier mon paiement</button>
      <button class="izipay-btn-sec" onclick="iziStep(1)">← Changer de crypto</button>
    </div>
    <div class="izipay-step" id="izi-s3">
      <div style="text-align:center;padding:20px 0">
        <div class="izipay-spinner">⚡</div>
        <div style="font-weight:700;margin:12px 0 6px">Vérification en cours...</div>
        <div style="font-size:12px;color:#64748b">Transaction en cours de confirmation blockchain.</div>
      </div>
    </div>
    <div class="izipay-step" id="izi-s4">
      <div class="izipay-success">
        <div style="font-size:48px;margin-bottom:10px">✅</div>
        <div style="font-size:18px;font-weight:800;color:#22c55e;margin-bottom:6px">Paiement confirmé !</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:16px">Votre service a été activé avec succès.</div>
        <button class="izipay-btn" onclick="iziClose()">Fermer</button>
      </div>
    </div>
  </div>
</div>

<script>
var _iziSvc='',_iziAmt=0,_iziDesc='',_iziPhone='',_iziCrypto='USDT.BEP20',_iziOrder='',_iziAutoTimer=null,_iziCdTimer=null;
function openCryptoPayment(svc,amt,desc,phone){
  _iziSvc=svc;_iziAmt=amt;_iziDesc=desc||svc;_iziPhone=phone||'';
  document.getElementById('izi-amt').textContent='$'+amt.toFixed(2)+' USD';
  iziStep(1);
  document.getElementById('izipay-overlay').style.display='flex';
}
function iziClose(){
  document.getElementById('izipay-overlay').style.display='none';
  clearInterval(_iziAutoTimer);clearInterval(_iziCdTimer);
}
function iziStep(n){
  for(var i=1;i<=4;i++) document.getElementById('izi-s'+i).classList.remove('active');
  document.getElementById('izi-s'+n).classList.add('active');
}
function iziSelCrypto(el,id){
  document.querySelectorAll('.crypto-btn').forEach(function(b){b.classList.remove('sel');});
  el.classList.add('sel'); _iziCrypto=id;
}
async function iziGenerate(){
  iziStep(3);
  try{
    var r=await fetch('/api/izipay/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({service:_iziSvc,amount_usd:_iziAmt,currency:_iziCrypto,description:_iziDesc,user_phone:_iziPhone})});
    var d=await r.json();
    if(d.method==='pos'||!d.address){iziPOS();return;}
    _iziOrder=d.order_id;
    document.getElementById('izi-exact').textContent=_iziAmt+' USD en '+_iziCrypto;
    document.getElementById('izi-addr').innerHTML='<span id="izi-addr-txt">'+d.address+'</span><button class="izipay-copy-btn" onclick="iziCopy()">📋 Copier</button>';
    document.getElementById('izi-net').textContent='Réseau: '+(d.network||_iziCrypto);
    if(d.expires_at) iziCountdown(new Date(d.expires_at));
    iziStep(2);
    _iziAutoTimer=setInterval(iziAutoCheck,30000);
  }catch(e){iziPOS();}
}
function iziPOS(){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');iziClose();}
function iziCopy(){
  var el=document.getElementById('izi-addr-txt');
  if(el) navigator.clipboard.writeText(el.textContent.trim()).then(function(){
    var b=document.querySelector('.izipay-copy-btn');
    if(b){b.textContent='✅ Copié!';setTimeout(function(){b.textContent='📋 Copier';},2000);}
  });
}
async function iziCheck(){
  if(!_iziOrder)return;
  var b=document.getElementById('izi-chk-btn');
  b.textContent='⏳...';b.disabled=true;
  try{
    var r=await fetch('/api/izipay/status/'+_iziOrder);
    var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iziAutoTimer);iziStep(4);}
    else{b.textContent='🔄 Vérifier mon paiement';b.disabled=false;}
  }catch(e){b.textContent='🔄 Réessayer';b.disabled=false;}
}
async function iziAutoCheck(){
  if(!_iziOrder)return;
  try{
    var r=await fetch('/api/izipay/status/'+_iziOrder);
    var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iziAutoTimer);iziStep(4);}
  }catch(e){}
}
function iziCountdown(exp){
  _iziCdTimer=setInterval(function(){
    var diff=exp-new Date();
    if(diff<=0){clearInterval(_iziCdTimer);document.getElementById('izi-tmr').textContent='⚠️ Session expirée';return;}
    var m=Math.floor(diff/60000),s=Math.floor((diff%60000)/1000);
    document.getElementById('izi-tmr').textContent='⏱ Expire dans '+m+'min '+s+'s';
  },1000);
}
</script>
<!-- ═══ Fin izichangePay Widget ═══ -->
`;

// Pages to patch and their crypto buttons config
const PAGES = [
  {
    file: 'recharge.html',
    label: 'Recharge Mobile',
    button: `<button class="izi-crypto-pay-btn" onclick="openCryptoPayment('recharge', 2.00, 'Recharge mobile PST Telecom', '')">⚡ Payer en Crypto</button>`,
    insertAfter: 'wave'
  },
  {
    file: 'pst-trax.html',
    label: 'PST-TRAX',
    button: `<button class="izi-crypto-pay-btn" onclick="openCryptoPayment('trax', 15.00, 'Abonnement PST-TRAX', currentUser&&currentUser.phone||'')">⚡ Payer en Crypto</button>`,
    insertAfter: null
  },
  {
    file: 'noc.html',
    label: 'PST NOC',
    button: `<button class="izi-crypto-pay-btn" onclick="openCryptoPayment('noc', 35.00, 'Abonnement PST NOC', '')">⚡ Payer en Crypto</button>`,
    insertAfter: null
  },
  {
    file: 'sms-marketing.html',
    label: 'SMS Marketing',
    button: `<button class="izi-crypto-pay-btn" onclick="openCryptoPayment('sms', 5.00, 'Credits SMS Marketing PST', '')">⚡ Payer en Crypto</button>`,
    insertAfter: null
  },
  {
    file: 'appel.html',
    label: 'Appels VoIP',
    button: `<button class="izi-crypto-pay-btn" onclick="openCryptoPayment('appels', 10.00, 'Forfait Appels PST Telecom', '')">⚡ Payer en Crypto</button>`,
    insertAfter: null
  },
  {
    file: 'index.html',
    label: 'Landing Page',
    button: null,
    insertAfter: null
  }
];

let patched = 0;
let skipped = 0;

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) {
    console.log('⏭ Non trouvé:', page.file);
    skipped++;
    return;
  }

  let content = fs.readFileSync(page.file, 'utf8');

  // Skip if already patched
  if (content.includes('izipay-overlay')) {
    console.log('✅ Déjà patché:', page.file);
    patched++;
    return;
  }

  // Inject widget before </body>
  if (content.includes('</body>')) {
    content = content.replace('</body>', WIDGET + '\n</body>');
    fs.writeFileSync(page.file, content, 'utf8');
    console.log('✅ Patché:', page.file, '('+page.label+')');
    patched++;
  } else {
    content += WIDGET;
    fs.writeFileSync(page.file, content, 'utf8');
    console.log('✅ Patché (append):', page.file);
    patched++;
  }
});

console.log('\n═══════════════════════════');
console.log('Résultat: '+patched+' fichiers patchés, '+skipped+' non trouvés');
console.log('Faites: git add . && git commit -m "izichangePay widget toutes pages" && git push');
