const fs = require('fs');

// The crypto button to add AFTER the existing payment buttons (not replacing them)
const CRYPTO_BTN = (svc, amt, desc) => `
<button onclick="openCryptoPayment('${svc}', ${amt}, '${desc}', '')" 
  style="width:100%;margin-top:10px;padding:13px;
  background:linear-gradient(135deg,#0a1628,#162040);
  border:2px solid #00e5ff;color:#00e5ff;border-radius:12px;
  cursor:pointer;font-size:14px;font-weight:700;
  display:flex;align-items:center;justify-content:center;gap:10px;
  transition:all .2s;" 
  onmouseover="this.style.background='rgba(0,229,255,0.1)'"
  onmouseout="this.style.background='linear-gradient(135deg,#0a1628,#162040)'">
  <img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:18px;height:18px;border-radius:50%">
  <img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:18px;height:18px;border-radius:50%">
  <img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:18px;height:18px;border-radius:50%">
  ⚡ Payer en Crypto
</button>`;

// Updated widget with real crypto logos
const WIDGET = `
<style>
.izipay-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;}
.izipay-modal{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:460px;color:#e2e8f0;font-family:sans-serif;position:relative;max-height:90vh;overflow-y:auto;}
.izi-title{font-size:17px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px;}
.izi-amount{font-size:28px;font-weight:900;color:#00e5ff;margin-bottom:18px;}
.izi-step{display:none;} .izi-step.active{display:block;}
.izi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.izi-cbtn{padding:12px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#94a3b8;border-radius:12px;cursor:pointer;text-align:center;font-size:11px;font-weight:700;transition:all .2s;}
.izi-cbtn:hover,.izi-cbtn.sel{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}
.izi-clogo{width:28px;height:28px;border-radius:50%;display:block;margin:0 auto 5px;object-fit:contain;}
.izi-btn{width:100%;padding:13px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px;}
.izi-btn2{width:100%;padding:10px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:12px;cursor:pointer;margin-top:8px;}
.izi-addr{background:#0a0e1a;border:1px solid #1e2d47;border-radius:10px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;margin:10px 0;}
.izi-warn{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:8px;padding:10px;font-size:11px;color:#f97316;margin-top:8px;}
.izi-close{position:absolute;top:14px;right:14px;background:transparent;border:none;color:#64748b;font-size:22px;cursor:pointer;line-height:1;}
.izi-spin{display:inline-block;animation:iziSp 1s linear infinite;font-size:32px;}
@keyframes iziSp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
</style>
<div id="izipay-overlay" class="izipay-overlay" style="display:none">
<div class="izipay-modal">
  <button class="izi-close" onclick="iziClose()">&#x2715;</button>
  <div class="izi-title">&#x26A1; Payer en Cryptomonnaie</div>
  <div class="izi-amount" id="izi-amt">$0.00 USD</div>
  <div class="izi-step active" id="izi-s1">
    <div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre cryptomonnaie :</div>
    <div class="izi-grid">
      <div class="izi-cbtn sel" onclick="iziSel(this,'USDT.BEP20')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT BEP20</div>
      <div class="izi-cbtn" onclick="iziSel(this,'USDT.TRC20')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT TRC20</div>
      <div class="izi-cbtn" onclick="iziSel(this,'BTC')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" onerror="this.style.display='none'">Bitcoin</div>
      <div class="izi-cbtn" onclick="iziSel(this,'ETH')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/ethereum-eth-logo.png" onerror="this.style.display='none'">Ethereum</div>
      <div class="izi-cbtn" onclick="iziSel(this,'BNB')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/bnb-bnb-logo.png" onerror="this.style.display='none'">BNB</div>
      <div class="izi-cbtn" onclick="iziSel(this,'TRX')">
        <img class="izi-clogo" src="https://cryptologos.cc/logos/tron-trx-logo.png" onerror="this.style.display='none'">TRON</div>
    </div>
    <div class="izi-warn">&#x26A0; Envoyez le montant exact sur le bon reseau pour eviter toute perte.</div>
    <button class="izi-btn" onclick="iziGen()">Generer adresse de paiement</button>
    <button class="izi-btn2" onclick="iziPOS()">&#x1F517; Payer via izichangePay.com</button>
  </div>
  <div class="izi-step" id="izi-s2">
    <div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez exactement <b id="izi-exact" style="color:#00e5ff"></b> a cette adresse :</div>
    <div class="izi-addr" id="izi-addr">--</div>
    <button onclick="iziCp()" style="background:#1e2d47;border:none;color:#e2e8f0;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;width:100%;margin-bottom:8px;">&#x1F4CB; Copier l adresse</button>
    <div style="font-size:11px;color:#64748b;margin-bottom:4px" id="izi-net"></div>
    <div class="izi-warn">&#x23F3; Paiement confirme automatiquement apres reception blockchain.</div>
    <button class="izi-btn" id="izi-chk" onclick="iziChk()">&#x1F504; Verifier mon paiement</button>
    <button class="izi-btn2" onclick="iziStep(1)">Changer de crypto</button>
  </div>
  <div class="izi-step" id="izi-s3">
    <div style="text-align:center;padding:24px 0">
      <div class="izi-spin">&#x26A1;</div>
      <div style="font-weight:700;margin:14px 0 6px;font-size:15px">Verification en cours...</div>
      <div style="font-size:12px;color:#64748b">Confirmation sur la blockchain en attente.</div>
    </div>
  </div>
  <div class="izi-step" id="izi-s4">
    <div style="text-align:center;padding:24px 0">
      <div style="font-size:52px;margin-bottom:12px">&#x2705;</div>
      <div style="font-size:20px;font-weight:800;color:#22c55e;margin-bottom:8px">Paiement confirme !</div>
      <div style="font-size:13px;color:#64748b;margin-bottom:20px">Votre service a ete active avec succes.</div>
      <button class="izi-btn" onclick="iziClose()">Fermer</button>
    </div>
  </div>
</div>
</div>
<script>
var _IS='',_IA=0,_ID='',_IP='',_IC='USDT.BEP20',_IO='',_IT=null;
function openCryptoPayment(s,a,d,p){
  _IS=s;_IA=a;_ID=d;_IP=p||'';
  document.getElementById('izi-amt').textContent='$'+a.toFixed(2)+' USD';
  iziStep(1);
  document.getElementById('izipay-overlay').style.display='flex';
}
function iziClose(){document.getElementById('izipay-overlay').style.display='none';clearInterval(_IT);}
function iziStep(n){for(var i=1;i<=4;i++)document.getElementById('izi-s'+i).classList.remove('active');document.getElementById('izi-s'+n).classList.add('active');}
function iziSel(el,id){document.querySelectorAll('.izi-cbtn').forEach(function(b){b.classList.remove('sel');});el.classList.add('sel');_IC=id;}
function iziPOS(){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');iziClose();}
function iziCp(){var el=document.getElementById('izi-addr');if(el)navigator.clipboard.writeText(el.textContent.trim()).then(function(){alert('Adresse copiee !');});}
async function iziGen(){
  iziStep(3);
  try{
    var r=await fetch('/api/izipay/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({service:_IS,amount_usd:_IA,currency:_IC,description:_ID,user_phone:_IP})});
    var d=await r.json();
    if(d.method==='pos'||!d.address){iziPOS();return;}
    _IO=d.order_id;
    document.getElementById('izi-exact').textContent=_IA+' USD en '+_IC;
    document.getElementById('izi-addr').textContent=d.address;
    document.getElementById('izi-net').textContent='Reseau: '+(d.network||_IC);
    iziStep(2);
    _IT=setInterval(iziAuto,30000);
  }catch(e){iziPOS();}
}
async function iziChk(){
  if(!_IO)return;
  var b=document.getElementById('izi-chk');b.disabled=true;b.textContent='Verification...';
  try{
    var r=await fetch('/api/izipay/status/'+_IO);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_IT);iziStep(4);}
    else{b.disabled=false;b.textContent='Verifier mon paiement';}
  }catch(e){b.disabled=false;b.textContent='Reessayer';}
}
async function iziAuto(){
  if(!_IO)return;
  try{var r=await fetch('/api/izipay/status/'+_IO);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_IT);iziStep(4);}
  }catch(e){}
}
</script>`;

const PAGES = [
  { file: 'recharge.html',      svc: 'recharge', amt: 1.65,  desc: 'Recharge mobile PST Telecom' },
  { file: 'sms.html',           svc: 'sms5sim',  amt: 1.65,  desc: 'Numero virtuel SMS 5SIM' },
  { file: 'appel.html',         svc: 'appels',   amt: 4.95,  desc: 'Forfait Appels VoIP PST' },
  { file: 'sms-marketing.html', svc: 'sms',      amt: 8.25,  desc: 'Credits SMS Marketing PST' },
  { file: 'noc.html',           svc: 'noc',      amt: 24.75, desc: 'Abonnement PST NOC' },
  { file: 'pst-trax.html',      svc: 'trax',     amt: 24.75, desc: 'Abonnement PST-TRAX' },
];

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) { console.log('Non trouve:', page.file); return; }
  let content = fs.readFileSync(page.file, 'utf8');

  // 1. Remove ALL old widget code (everything between first <style>.izipay and last </script> of widget)
  // Remove old style blocks for izipay
  content = content.replace(/<style>\s*\.izipay[\s\S]*?<\/style>/g, '');
  content = content.replace(/<style>\s*\.izi-[\s\S]*?<\/style>/g, '');
  
  // Remove old overlay divs
  content = content.replace(/<div id="izipay-overlay"[\s\S]*?<\/div>\s*<\/div>/g, '');
  
  // Remove old widget scripts (containing openCryptoPayment)
  content = content.replace(/<script>\s*var _iziSvc[\s\S]*?<\/script>/g, '');
  content = content.replace(/<script>\s*var _IS=[\s\S]*?<\/script>/g, '');
  
  // Remove comment markers
  content = content.replace(/<!-- ={3,}.*?izichange.*?-->/g, '');
  content = content.replace(/<!-- izichangePay Widget -->/g, '');
  content = content.replace(/<!-- Fin izichangePay Widget -->/g, '');

  // 2. Fix Wave button area - make sure crypto btn is AFTER pay buttons not replacing them
  // Remove old inline crypto buttons that may have replaced Wave
  content = content.replace(/<button onclick="openCryptoPayment\([^>]*>[\s\S]*?<\/button>/g, '');

  // 3. Add crypto button in the right place (after Wave/Carte Visa section)
  // Find the payment section and add crypto button after it
  const cryptoBtn = CRYPTO_BTN(page.svc, page.amt, page.desc);
  
  // Strategy: insert before the closing of the payment card/div
  // Look for the pattern after pay buttons
  const payPatterns = [
    '</div>\n</div>\n\n  <div>',  // recharge layout
    'pay-opt',
    'wave',
    'Wave'
  ];
  
  // Simple: add crypto button before </body> removal, we'll add it properly in widget
  // The widget itself is enough since POS fallback works

  // 4. Add clean widget before </body>
  content = content.replace('</body>', WIDGET + '\n</body>');

  // 5. Add crypto button in payment section
  // Find Wave button area and add crypto button after the payment options
  const waveIdx = content.lastIndexOf('Wave</button>') !== -1 ? 
    content.lastIndexOf('Wave</button>') :
    content.lastIndexOf('>Wave<');
    
  if (waveIdx !== -1) {
    const afterBtn = content.indexOf('</button>', waveIdx) + 9;
    const btn = `\n<div style="margin-top:10px">${cryptoBtn}</div>`;
    content = content.slice(0, afterBtn) + btn + content.slice(afterBtn);
    console.log('Crypto btn insere apres Wave dans:', page.file);
  } else {
    // Add after any pay button
    const payIdx = content.indexOf('pay-btn') !== -1 ? content.indexOf('pay-btn') :
                   content.indexOf('Recharger maintenant');
    if (payIdx !== -1) {
      const insertAt = content.indexOf('</button>', payIdx) + 9;
      content = content.slice(0, insertAt) + `\n${cryptoBtn}` + content.slice(insertAt);
      console.log('Crypto btn insere apres pay-btn dans:', page.file);
    }
  }

  fs.writeFileSync(page.file, content, 'utf8');
  console.log('OK:', page.file, content.split('\n').length, 'lignes');
});

console.log('\nDone! git add . && git commit -m "Crypto widget logos + Wave fix" && git push');
