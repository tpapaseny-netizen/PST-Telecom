const fs = require('fs');

// The full widget script - minified and safe (no apostrophes in strings)
const WIDGET_SCRIPT = `
<!-- izichangePay Widget -->
<style>
.izipay-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;}
.izipay-modal{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:440px;color:#e2e8f0;font-family:Segoe UI,sans-serif;position:relative;}
.izipay-title{font-size:17px;font-weight:800;margin-bottom:4px;}
.izipay-amount{font-size:30px;font-weight:900;color:#00e5ff;margin-bottom:20px;}
.izipay-step{display:none;} .izipay-step.active{display:block;}
.crypto-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.crypto-btn{padding:13px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#64748b;border-radius:12px;cursor:pointer;text-align:center;transition:all .2s;font-size:11px;font-weight:700;}
.crypto-btn:hover,.crypto-btn.sel{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}
.crypto-icon{font-size:20px;display:block;margin-bottom:3px;}
.izipay-btn{width:100%;padding:14px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;margin-top:10px;}
.izipay-btn-sec{width:100%;padding:11px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:13px;cursor:pointer;margin-top:8px;}
.izipay-addr-box{background:#0a0e1a;border:1px solid #1e2d47;border-radius:12px;padding:14px;padding-right:80px;margin:12px 0;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;position:relative;}
.izipay-copy-btn{position:absolute;top:10px;right:10px;background:#1e2d47;border:none;color:#e2e8f0;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;}
.izipay-warn{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:10px;padding:11px;font-size:11px;color:#f97316;margin-top:10px;}
.izipay-close{position:absolute;top:16px;right:16px;background:transparent;border:none;color:#64748b;font-size:20px;cursor:pointer;}
.izipay-timer{text-align:center;font-size:11px;color:#64748b;margin-top:8px;}
.izipay-spinner{display:inline-block;font-size:36px;animation:iziSpin 1.5s linear infinite;}
@keyframes iziSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
</style>
<div id="izipay-overlay" class="izipay-overlay" style="display:none">
  <div class="izipay-modal">
    <button class="izipay-close" onclick="iziClose()">x</button>
    <div class="izipay-title">Payer en Cryptomonnaie</div>
    <div class="izipay-amount" id="izi-amt">$0.00 USD</div>
    <div class="izipay-step active" id="izi-s1">
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre crypto :</div>
      <div class="crypto-grid">
        <div class="crypto-btn sel" onclick="iziSelCrypto(this,'USDT.BEP20')"><span class="crypto-icon">&#x1F49A;</span>USDT BEP20</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'USDT.TRC20')"><span class="crypto-icon">&#x1F49A;</span>USDT TRC20</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'BTC')"><span class="crypto-icon">&#x20BF;</span>Bitcoin</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'ETH')"><span class="crypto-icon">&#x25C6;</span>Ethereum</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'BNB')"><span class="crypto-icon">&#x1F7E1;</span>BNB</div>
        <div class="crypto-btn" onclick="iziSelCrypto(this,'TRX')"><span class="crypto-icon">&#x1F534;</span>TRON</div>
      </div>
      <div class="izipay-warn">Envoyez le montant exact sur le bon reseau.</div>
      <button class="izipay-btn" onclick="iziGenerate()">Generer adresse de paiement</button>
      <button class="izipay-btn-sec" onclick="iziPOS()">Payer via izichangePay.com</button>
    </div>
    <div class="izipay-step" id="izi-s2">
      <div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez <b id="izi-exact" style="color:#00e5ff"></b> a :</div>
      <div class="izipay-addr-box" id="izi-addr">--<button class="izipay-copy-btn" onclick="iziCopy()">Copier</button></div>
      <div style="font-size:11px;color:#64748b" id="izi-net"></div>
      <div class="izipay-timer" id="izi-tmr"></div>
      <div class="izipay-warn">Paiement confirme automatiquement apres reception.</div>
      <button class="izipay-btn" id="izi-chk-btn" onclick="iziCheck()">Verifier mon paiement</button>
      <button class="izipay-btn-sec" onclick="iziStep(1)">Changer de crypto</button>
    </div>
    <div class="izipay-step" id="izi-s3">
      <div style="text-align:center;padding:20px 0">
        <div class="izipay-spinner">&#x26A1;</div>
        <div style="font-weight:700;margin:12px 0 6px">Verification en cours...</div>
      </div>
    </div>
    <div class="izipay-step" id="izi-s4">
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:48px;margin-bottom:10px">&#x2705;</div>
        <div style="font-size:18px;font-weight:800;color:#22c55e;margin-bottom:6px">Paiement confirme !</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:16px">Votre service a ete active.</div>
        <button class="izipay-btn" onclick="iziClose()">Fermer</button>
      </div>
    </div>
  </div>
</div>
<script>
var _iziSvc='',_iziAmt=0,_iziDesc='',_iziPhone='',_iziCrypto='USDT.BEP20',_iziOrder='',_iziAutoT=null,_iziCdT=null;
function openCryptoPayment(svc,amt,desc,phone){
  _iziSvc=svc;_iziAmt=amt;_iziDesc=desc;_iziPhone=phone||'';
  document.getElementById('izi-amt').textContent='$'+amt.toFixed(2)+' USD';
  iziStep(1);
  document.getElementById('izipay-overlay').style.display='flex';
}
function iziClose(){document.getElementById('izipay-overlay').style.display='none';clearInterval(_iziAutoT);clearInterval(_iziCdT);}
function iziStep(n){for(var i=1;i<=4;i++)document.getElementById('izi-s'+i).classList.remove('active');document.getElementById('izi-s'+n).classList.add('active');}
function iziSelCrypto(el,id){document.querySelectorAll('.crypto-btn').forEach(function(b){b.classList.remove('sel');});el.classList.add('sel');_iziCrypto=id;}
async function iziGenerate(){
  iziStep(3);
  try{
    var r=await fetch('/api/izipay/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({service:_iziSvc,amount_usd:_iziAmt,currency:_iziCrypto,description:_iziDesc,user_phone:_iziPhone})});
    var d=await r.json();
    if(d.method==='pos'||!d.address){iziPOS();return;}
    _iziOrder=d.order_id;
    document.getElementById('izi-exact').textContent=_iziAmt+' USD en '+_iziCrypto;
    document.getElementById('izi-addr').innerHTML='<span id="izi-addr-txt">'+d.address+'</span><button class="izipay-copy-btn" onclick="iziCopy()">Copier</button>';
    document.getElementById('izi-net').textContent='Reseau: '+(d.network||_iziCrypto);
    iziStep(2);
    _iziAutoT=setInterval(iziAutoCheck,30000);
  }catch(e){iziPOS();}
}
function iziPOS(){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');iziClose();}
function iziCopy(){var el=document.getElementById('izi-addr-txt');if(el)navigator.clipboard.writeText(el.textContent.trim());}
async function iziCheck(){
  if(!_iziOrder)return;
  var b=document.getElementById('izi-chk-btn');b.disabled=true;
  try{var r=await fetch('/api/izipay/status/'+_iziOrder);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iziAutoT);iziStep(4);}
    else{b.disabled=false;}
  }catch(e){b.disabled=false;}
}
async function iziAutoCheck(){
  if(!_iziOrder)return;
  try{var r=await fetch('/api/izipay/status/'+_iziOrder);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iziAutoT);iziStep(4);}
  }catch(e){}
}
</script>`;

const PAGES = [
  { file: 'recharge.html', service: 'recharge', amount: 1.65, desc: 'Recharge mobile PST Telecom' },
  { file: 'sms.html', service: 'sms5sim', amount: 1.65, desc: 'Numero virtuel SMS 5SIM' },
  { file: 'appel.html', service: 'appels', amount: 4.95, desc: 'Forfait Appels VoIP PST' },
  { file: 'sms-marketing.html', service: 'sms', amount: 8.25, desc: 'Credits SMS Marketing PST' },
  { file: 'noc.html', service: 'noc', amount: 24.75, desc: 'Abonnement PST NOC' },
  { file: 'pst-trax.html', service: 'trax', amount: 24.75, desc: 'Abonnement PST-TRAX' },
];

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) { console.log('Non trouve:', page.file); return; }

  let content = fs.readFileSync(page.file, 'utf8');

  // 1. Remove old broken widget (keep only one clean version)
  // Remove everything between <!-- izichangePay Crypto Widget --> and <!-- Fin izichangePay Widget -->
  const startTag = '<!-- izichangePay Crypto Widget -->';
  const endTag = '<!-- Fin izichangePay Widget -->';
  while (content.includes(startTag)) {
    const s = content.indexOf(startTag);
    const e = content.indexOf(endTag);
    if (e !== -1) {
      content = content.slice(0, s) + content.slice(e + endTag.length);
    } else {
      content = content.slice(0, s) + content.slice(s + startTag.length);
    }
  }

  // 2. Remove old izipay-overlay div if exists
  if (content.includes('id="izipay-overlay"')) {
    const s = content.lastIndexOf('<style>', content.indexOf('id="izipay-overlay"') - 2000) || 
              content.indexOf('<div id="izipay-overlay"');
    const e = content.indexOf('</script>', content.indexOf('iziAutoCheck')) + 9;
    if (s !== -1 && e !== -1 && e > s) {
      content = content.slice(0, s) + content.slice(e);
    }
  }

  // 3. Add clean widget before </body>
  content = content.replace('</body>', WIDGET_SCRIPT + '\n</body>');

  fs.writeFileSync(page.file, content, 'utf8');
  console.log('OK:', page.file);
});

console.log('\nDone! git add . && git commit -m "Fix crypto widget - no syntax errors" && git push');
