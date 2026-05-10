const fs = require('fs');

// The complete working crypto button + modal - all inline, no external files
// Using template literals carefully to avoid apostrophe issues
function getCryptoCode(svc, amt, desc) {
  var amtStr = amt.toFixed(2);
  
  return `
<style id="izi-css">
#izi-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);z-index:999999;display:none;align-items:center;justify-content:center;padding:16px;}
#izi-modal.show{display:flex;}
#izi-box{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:440px;color:#e2e8f0;font-family:Arial,sans-serif;position:relative;max-height:85vh;overflow-y:auto;}
.izi-s{display:none;}
.izi-s.ok{display:block;}
.izi-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.izi-c{padding:12px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#94a3b8;border-radius:12px;cursor:pointer;text-align:center;font-size:11px;font-weight:700;transition:border-color .2s;}
.izi-c.ok{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}
.izi-cimg{width:28px;height:28px;border-radius:50%;display:block;margin:0 auto 5px;object-fit:contain;}
.izi-btn{width:100%;padding:13px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px;display:block;text-align:center;}
.izi-btn2{width:100%;padding:10px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:12px;cursor:pointer;margin-top:8px;display:block;text-align:center;}
.izi-addr{background:#0a0e1a;border:1px solid #1e2d47;border-radius:10px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;margin:10px 0;}
.izi-warn{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:8px;padding:10px;font-size:11px;color:#f97316;margin-top:8px;}
.izi-x{position:absolute;top:14px;right:14px;background:transparent;border:none;color:#64748b;font-size:22px;cursor:pointer;line-height:1;}
.izi-spin{display:inline-block;font-size:32px;animation:spin 1s linear infinite;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
</style>

<div id="izi-modal">
<div id="izi-box">
<button class="izi-x" onclick="document.getElementById('izi-modal').classList.remove('show')">&#x2715;</button>
<div style="font-size:17px;font-weight:800;margin-bottom:4px">&#x26A1; Payer en Crypto</div>
<div style="font-size:26px;font-weight:900;color:#00e5ff;margin-bottom:16px" id="izi-amt">$${amtStr} USD</div>

<div class="izi-s ok" id="izi-s1">
<div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre cryptomonnaie :</div>
<div class="izi-grid">
<div class="izi-c ok" onclick="iziSel(this,'USDT.BEP20')"><img class="izi-cimg" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT BEP20</div>
<div class="izi-c" onclick="iziSel(this,'USDT.TRC20')"><img class="izi-cimg" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT TRC20</div>
<div class="izi-c" onclick="iziSel(this,'BTC')"><img class="izi-cimg" src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" onerror="this.style.display='none'">Bitcoin</div>
<div class="izi-c" onclick="iziSel(this,'ETH')"><img class="izi-cimg" src="https://cryptologos.cc/logos/ethereum-eth-logo.png" onerror="this.style.display='none'">Ethereum</div>
<div class="izi-c" onclick="iziSel(this,'BNB')"><img class="izi-cimg" src="https://cryptologos.cc/logos/bnb-bnb-logo.png" onerror="this.style.display='none'">BNB</div>
<div class="izi-c" onclick="iziSel(this,'TRX')"><img class="izi-cimg" src="https://cryptologos.cc/logos/tron-trx-logo.png" onerror="this.style.display='none'">TRON</div>
</div>
<div class="izi-warn">&#x26A0; Envoyez le montant exact sur le bon reseau.</div>
<button class="izi-btn" onclick="iziGen()">Generer adresse de paiement</button>
<button class="izi-btn2" onclick="window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank')">Payer via izichangePay.com</button>
</div>

<div class="izi-s" id="izi-s2">
<div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez <b id="izi-ex" style="color:#00e5ff"></b> a :</div>
<div class="izi-addr" id="izi-addr">--</div>
<button class="izi-btn" style="background:#1e2d47;color:#e2e8f0;" onclick="navigator.clipboard.writeText(document.getElementById('izi-addr').textContent).then(function(){alert('Copie!');})">&#x1F4CB; Copier l adresse</button>
<div style="font-size:11px;color:#64748b;margin:6px 0" id="izi-net"></div>
<div class="izi-warn">&#x23F3; Paiement confirme automatiquement apres reception.</div>
<button class="izi-btn" id="izi-chk" onclick="iziChk()">&#x1F504; Verifier mon paiement</button>
<button class="izi-btn2" onclick="iziGoStep(1)">Changer de crypto</button>
</div>

<div class="izi-s" id="izi-s3">
<div style="text-align:center;padding:24px 0">
<div class="izi-spin">&#x26A1;</div>
<div style="font-weight:700;margin:14px 0 6px;font-size:15px">Verification en cours...</div>
</div>
</div>

<div class="izi-s" id="izi-s4">
<div style="text-align:center;padding:24px 0">
<div style="font-size:52px;margin-bottom:12px">&#x2705;</div>
<div style="font-size:20px;font-weight:800;color:#22c55e;margin-bottom:8px">Paiement confirme !</div>
<div style="font-size:13px;color:#64748b;margin-bottom:20px">Service active avec succes.</div>
<button class="izi-btn" onclick="document.getElementById('izi-modal').classList.remove('show')">Fermer</button>
</div>
</div>
</div>
</div>

<script>
var _iS='${svc}',_iA=${amt},_iD='${desc}',_iP='',_iC='USDT.BEP20',_iO='',_iT=null;
function openCryptoPayment(s,a,d,p){
  _iS=s;_iA=a;_iD=d;_iP=p||'';
  document.getElementById('izi-amt').textContent='$'+a.toFixed(2)+' USD';
  iziGoStep(1);
  document.getElementById('izi-modal').classList.add('show');
}
function iziGoStep(n){
  for(var i=1;i<=4;i++){var e=document.getElementById('izi-s'+i);if(e)e.className='izi-s'+(n===i?' ok':'');}
}
function iziSel(el,id){
  document.querySelectorAll('.izi-c').forEach(function(b){b.className='izi-c';});
  el.className='izi-c ok';_iC=id;
}
async function iziGen(){
  iziGoStep(3);
  try{
    var r=await fetch('/api/izipay/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({service:_iS,amount_usd:_iA,currency:_iC,description:_iD,user_phone:_iP})});
    var d=await r.json();
    if(d.method==='pos'||!d.address){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');document.getElementById('izi-modal').classList.remove('show');return;}
    _iO=d.order_id;
    document.getElementById('izi-ex').textContent=_iA+' USD en '+_iC;
    document.getElementById('izi-addr').textContent=d.address;
    document.getElementById('izi-net').textContent='Reseau: '+(d.network||_iC);
    iziGoStep(2);
    _iT=setInterval(iziAuto,30000);
  }catch(e){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');document.getElementById('izi-modal').classList.remove('show');}
}
async function iziChk(){
  if(!_iO)return;
  var b=document.getElementById('izi-chk');b.disabled=true;b.textContent='Verification...';
  try{var r=await fetch('/api/izipay/status/'+_iO);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iT);iziGoStep(4);}
    else{b.disabled=false;b.innerHTML='&#x1F504; Verifier mon paiement';}
  }catch(e){b.disabled=false;b.innerHTML='&#x1F504; Reessayer';}
}
function iziAuto(){
  if(!_iO)return;
  fetch('/api/izipay/status/'+_iO).then(function(r){return r.json();}).then(function(d){
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_iT);iziGoStep(4);}
  }).catch(function(){});
}
</script>`;
}

// Crypto button HTML
function getCryptoBtn(svc, amt, desc) {
  return `<div style="margin-top:10px;">
<button onclick="openCryptoPayment('${svc}',${amt},'${desc}','')" style="width:100%;padding:13px;background:linear-gradient(135deg,#0a1628,#162040);border:2px solid #00e5ff;color:#00e5ff;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;">
<img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
&#x26A1; Payer en Crypto
</button>
</div>`;
}

const PAGES = [
  {file:'recharge.html',      svc:'recharge', amt:1.65,  desc:'Recharge mobile PST'},
  {file:'sms.html',           svc:'sms5sim',  amt:1.65,  desc:'Numero virtuel 5SIM'},
  {file:'appel.html',         svc:'appels',   amt:4.95,  desc:'Forfait Appels VoIP'},
  {file:'sms-marketing.html', svc:'sms',      amt:8.25,  desc:'Credits SMS Marketing'},
  {file:'noc.html',           svc:'noc',      amt:24.75, desc:'Abonnement PST NOC'},
  {file:'pst-trax.html',      svc:'trax',     amt:24.75, desc:'Abonnement PST-TRAX'},
];

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) { console.log('Non trouve:', page.file); return; }
  let c = fs.readFileSync(page.file, 'utf8');

  // Remove ALL old crypto code
  c = c.replace(/<style id="izi-css">[\s\S]*?<\/style>/g, '');
  c = c.replace(/<div id="izi-modal">[\s\S]*?<\/div>\s*<\/div>/g, '');
  c = c.replace(/<script>\s*var _iS=[\s\S]*?<\/script>/g, '');
  c = c.replace(/<script src="\/izipay-widget\.js"><\/script>/g, '');
  c = c.replace(/<div style="margin-top:10px;">\s*<button onclick="openCryptoPayment[\s\S]*?<\/div>/g, '');
  c = c.replace(/<!-- izichangePay[\s\S]*?fin izichangePay -->/gi, '');

  // Add modal + script before </body>
  c = c.replace('</body>', getCryptoCode(page.svc, page.amt, page.desc) + '\n</body>');

  // Add button after Wave button
  // Find Wave button and insert crypto button right after
  var wavePatterns = [
    /(<button[^>]*wave[^>]*>[\s\S]*?<\/button>)/i,
    /(<button[^>]*Wave[^>]*>[\s\S]*?<\/button>)/,
    /(\bWave\b.*?<\/button>)/,
  ];
  
  var inserted = false;
  for (var i = 0; i < wavePatterns.length; i++) {
    var m = c.match(wavePatterns[i]);
    if (m) {
      var idx = c.indexOf(m[0]) + m[0].length;
      c = c.slice(0, idx) + '\n' + getCryptoBtn(page.svc, page.amt, page.desc) + c.slice(idx);
      inserted = true;
      console.log('Bouton insere apres Wave dans:', page.file);
      break;
    }
  }
  
  if (!inserted) {
    // Try to find by text content
    var wIdx = c.indexOf('>Wave<') !== -1 ? c.indexOf('>Wave<') :
               c.indexOf('Wave</button>') !== -1 ? c.indexOf('Wave</button>') : -1;
    if (wIdx !== -1) {
      var endBtn = c.indexOf('</button>', wIdx) + 9;
      c = c.slice(0, endBtn) + '\n' + getCryptoBtn(page.svc, page.amt, page.desc) + c.slice(endBtn);
      console.log('Bouton insere (fallback) dans:', page.file);
    } else {
      console.log('Wave non trouve dans:', page.file, '- bouton ajoute avant </body>');
    }
  }

  fs.writeFileSync(page.file, c, 'utf8');
  console.log('OK:', page.file, c.split('\n').length, 'lignes');
});

console.log('\nDone! git add . && git commit -m "Crypto modal fix + bouton apres Wave" && git push');
