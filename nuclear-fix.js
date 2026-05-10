const fs = require('fs');

// Read file and find ALL apostrophe issues in script tags
function fixFile(filename, svc, amt, desc) {
  if (!fs.existsSync(filename)) { console.log('Not found:', filename); return; }
  
  let content = fs.readFileSync(filename, 'utf8');
  
  // Step 1: Find the LAST </script> before </body> and check what's there
  // Step 2: Remove everything crypto related
  
  // Remove old widget script blocks (any that contain _iS or _iziSvc or openCryptoPayment definition)
  content = content.replace(/<script[^>]*>[\s\S]*?function openCryptoPayment[\s\S]*?<\/script>/g, '<!-- crypto removed -->');
  content = content.replace(/<script[^>]*>[\s\S]*?var _iS=[\s\S]*?<\/script>/g, '<!-- crypto removed -->');
  content = content.replace(/<script[^>]*>[\s\S]*?var _iziSvc[\s\S]*?<\/script>/g, '<!-- crypto removed -->');
  
  // Remove old modal divs
  content = content.replace(/<div id="izi-modal"[\s\S]*?<\/div>\s*\n?<\/div>/g, '<!-- modal removed -->');
  content = content.replace(/<style id="izi-css">[\s\S]*?<\/style>/g, '<!-- style removed -->');
  
  // Remove old crypto buttons
  content = content.replace(/<div style="margin-top:10px;">[\s\S]*?openCryptoPayment[\s\S]*?<\/div>/g, '<!-- btn removed -->');
  content = content.replace(/<button onclick="openCryptoPayment[^>]*>[\s\S]*?<\/button>/g, '<!-- btn removed -->');
  
  // Remove external widget script tags
  content = content.replace(/<script src="\/izipay-widget\.js"><\/script>/g, '');
  
  // Clean up comment artifacts
  content = content.replace(/<!-- crypto removed -->\s*/g, '');
  content = content.replace(/<!-- modal removed -->\s*/g, '');
  content = content.replace(/<!-- style removed -->\s*/g, '');
  content = content.replace(/<!-- btn removed -->\s*/g, '');
  
  // Step 3: Build clean code using NO apostrophes in JS strings
  // Use double quotes everywhere in JS
  var amtFixed = parseFloat(amt).toFixed(2);
  
  var cryptoCSS = `<style>
#izm{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.92);z-index:999999;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}
#izm.open{display:flex;}
#izb{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:440px;color:#e2e8f0;position:relative;max-height:85vh;overflow-y:auto;}
.izs{display:none;}
.izs.a{display:block;}
.izg{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
.izc{padding:12px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#94a3b8;border-radius:12px;cursor:pointer;text-align:center;font-size:11px;font-weight:700;}
.izc.a{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}
.izci{width:28px;height:28px;border-radius:50%;display:block;margin:0 auto 5px;object-fit:contain;}
.izbn{width:100%;padding:13px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px;display:block;}
.izb2{width:100%;padding:10px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:12px;cursor:pointer;margin-top:8px;display:block;}
.iza{background:#0a0e1a;border:1px solid #1e2d47;border-radius:10px;padding:12px;word-break:break-all;font-size:12px;color:#00e5ff;margin:10px 0;font-family:monospace;}
.izw{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:8px;padding:10px;font-size:11px;color:#f97316;margin-top:8px;}
.izx{position:absolute;top:14px;right:14px;background:transparent;border:none;color:#64748b;font-size:22px;cursor:pointer;}
.izsp{display:inline-block;font-size:32px;animation:izsp 1s linear infinite;}
@keyframes izsp{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
</style>`;

  var cryptoModal = `<div id="izm">
<div id="izb">
<button class="izx" onclick="document.getElementById('izm').classList.remove('open')">&#215;</button>
<div style="font-size:17px;font-weight:800;margin-bottom:4px">&#9889; Payer en Crypto</div>
<div style="font-size:26px;font-weight:900;color:#00e5ff;margin-bottom:16px" id="izam">$${amtFixed} USD</div>
<div class="izs a" id="izs1">
<div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre crypto :</div>
<div class="izg">
<div class="izc a" onclick="izSel(this,'USDT.BEP20')"><img class="izci" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT BEP20</div>
<div class="izc" onclick="izSel(this,'USDT.TRC20')"><img class="izci" src="https://cryptologos.cc/logos/tether-usdt-logo.png" onerror="this.style.display='none'">USDT TRC20</div>
<div class="izc" onclick="izSel(this,'BTC')"><img class="izci" src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" onerror="this.style.display='none'">Bitcoin</div>
<div class="izc" onclick="izSel(this,'ETH')"><img class="izci" src="https://cryptologos.cc/logos/ethereum-eth-logo.png" onerror="this.style.display='none'">Ethereum</div>
<div class="izc" onclick="izSel(this,'BNB')"><img class="izci" src="https://cryptologos.cc/logos/bnb-bnb-logo.png" onerror="this.style.display='none'">BNB</div>
<div class="izc" onclick="izSel(this,'TRX')"><img class="izci" src="https://cryptologos.cc/logos/tron-trx-logo.png" onerror="this.style.display='none'">TRON</div>
</div>
<div class="izw">&#9888; Envoyez le montant exact sur le bon reseau.</div>
<button class="izbn" onclick="izGen()">Generer adresse</button>
<button class="izb2" onclick="window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank')">Payer sur izichangePay.com</button>
</div>
<div class="izs" id="izs2">
<div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez <b id="izex" style="color:#00e5ff"></b> a :</div>
<div class="iza" id="izad">--</div>
<button class="izbn" style="background:#1e2d47;color:#e2e8f0;margin-bottom:8px" onclick="navigator.clipboard.writeText(document.getElementById('izad').textContent)">&#128203; Copier</button>
<div style="font-size:11px;color:#64748b;margin-bottom:4px" id="iznet"></div>
<div class="izw">&#8987; Confirmation automatique apres reception.</div>
<button class="izbn" id="izchk" onclick="izChk()">&#128260; Verifier</button>
<button class="izb2" onclick="izGo(1)">Changer de crypto</button>
</div>
<div class="izs" id="izs3">
<div style="text-align:center;padding:24px 0"><div class="izsp">&#9889;</div><div style="font-weight:700;margin:14px 0 6px">Verification...</div></div>
</div>
<div class="izs" id="izs4">
<div style="text-align:center;padding:24px 0">
<div style="font-size:52px;margin-bottom:12px">&#9989;</div>
<div style="font-size:20px;font-weight:800;color:#22c55e;margin-bottom:8px">Paiement confirme!</div>
<div style="font-size:13px;color:#64748b;margin-bottom:20px">Service active.</div>
<button class="izbn" onclick="document.getElementById('izm').classList.remove('open')">Fermer</button>
</div>
</div>
</div>
</div>`;

  // JS with NO apostrophes - using double quotes and concatenation
  var cryptoJS = `<script>
var _zS="${svc}",_zA=${amt},_zD="${desc}",_zP="",_zC="USDT.BEP20",_zO="",_zT=null;
function openCryptoPayment(s,a,d,p){_zS=s;_zA=a;_zD=d;_zP=p||"";document.getElementById("izam").textContent="$"+a.toFixed(2)+" USD";izGo(1);document.getElementById("izm").classList.add("open");}
function izGo(n){for(var i=1;i<=4;i++){var e=document.getElementById("izs"+i);if(e)e.className="izs"+(n===i?" a":"");}};
function izSel(el,id){document.querySelectorAll(".izc").forEach(function(b){b.className="izc";});el.className="izc a";_zC=id;}
async function izGen(){
  izGo(3);
  try{
    var r=await fetch("/api/izipay/create-payment",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({service:_zS,amount_usd:_zA,currency:_zC,description:_zD,user_phone:_zP})});
    var d=await r.json();
    if(d.method==="pos"||!d.address){window.open("https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402","_blank");document.getElementById("izm").classList.remove("open");return;}
    _zO=d.order_id;
    document.getElementById("izex").textContent=_zA+" USD en "+_zC;
    document.getElementById("izad").textContent=d.address;
    document.getElementById("iznet").textContent="Reseau: "+(d.network||_zC);
    izGo(2);_zT=setInterval(izAuto,30000);
  }catch(e){window.open("https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402","_blank");document.getElementById("izm").classList.remove("open");}
}
async function izChk(){
  if(!_zO)return;
  var b=document.getElementById("izchk");b.disabled=true;
  try{var r=await fetch("/api/izipay/status/"+_zO);var d=await r.json();
    if(d.order&&(d.order.status==="paid"||d.order.status==="completed")){clearInterval(_zT);izGo(4);}
    else b.disabled=false;
  }catch(e){b.disabled=false;}
}
function izAuto(){if(!_zO)return;fetch("/api/izipay/status/"+_zO).then(function(r){return r.json();}).then(function(d){if(d.order&&(d.order.status==="paid"||d.order.status==="completed")){clearInterval(_zT);izGo(4);}}).catch(function(){});}
</script>`;

  var cryptoBtn = `<div style="margin-top:10px">
<button onclick="openCryptoPayment(&quot;${svc}&quot;,${amt},&quot;${desc}&quot;,&quot;&quot;)" style="width:100%;padding:13px;background:linear-gradient(135deg,#0a1628,#162040);border:2px solid #00e5ff;color:#00e5ff;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;">
<img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain" onerror="this.style.display='none'">
&#9889; Payer en Crypto
</button>
</div>`;

  // Add modal+CSS+JS before </body>
  content = content.replace('</body>', cryptoCSS + '\n' + cryptoModal + '\n' + cryptoJS + '\n</body>');
  
  // Add button after Wave
  var waveEnd = -1;
  var patterns = ['Wave</button>', '>Wave</', 'wave</button>'];
  for (var p of patterns) {
    var idx = content.indexOf(p);
    if (idx !== -1) { waveEnd = idx + p.length; break; }
  }
  if (waveEnd !== -1) {
    content = content.slice(0, waveEnd) + '\n' + cryptoBtn + content.slice(waveEnd);
    console.log('Button added after Wave in:', filename);
  }
  
  fs.writeFileSync(filename, content, 'utf8');
  console.log('Fixed:', filename, content.split('\n').length, 'lines');
}

fixFile('recharge.html',      'recharge', 1.65,  'Recharge mobile PST');
fixFile('sms.html',           'sms5sim',  1.65,  'Numero virtuel 5SIM');
fixFile('appel.html',         'appels',   4.95,  'Forfait Appels VoIP');
fixFile('sms-marketing.html', 'sms',      8.25,  'Credits SMS Marketing');
fixFile('noc.html',           'noc',      24.75, 'Abonnement PST NOC');
fixFile('pst-trax.html',      'trax',     24.75, 'Abonnement PST-TRAX');

console.log('\ngit add . && git commit -m "Crypto fix definitif double quotes" && git push');
