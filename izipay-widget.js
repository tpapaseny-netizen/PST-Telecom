// PST Telecom - izichangePay Widget v2 - External JS
(function(){
var CSS = '.izi-ov{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;}.izi-mo{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:460px;color:#e2e8f0;font-family:sans-serif;position:relative;max-height:90vh;overflow-y:auto;}.izi-tit{font-size:17px;font-weight:800;margin-bottom:4px;}.izi-am{font-size:28px;font-weight:900;color:#00e5ff;margin-bottom:18px;}.izi-st{display:none;}.izi-st.active{display:block;}.izi-gr{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}.izi-cb{padding:12px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#94a3b8;border-radius:12px;cursor:pointer;text-align:center;font-size:11px;font-weight:700;transition:all .2s;}.izi-cb:hover,.izi-cb.sel{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.07);}.izi-cl{width:28px;height:28px;border-radius:50%;display:block;margin:0 auto 5px;object-fit:contain;}.izi-bn{width:100%;padding:13px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px;}.izi-b2{width:100%;padding:10px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:12px;cursor:pointer;margin-top:8px;}.izi-ad{background:#0a0e1a;border:1px solid #1e2d47;border-radius:10px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;margin:10px 0;}.izi-wa{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:8px;padding:10px;font-size:11px;color:#f97316;margin-top:8px;}.izi-cl2{position:absolute;top:14px;right:14px;background:transparent;border:none;color:#64748b;font-size:22px;cursor:pointer;}.izi-sp{display:inline-block;animation:iziSp 1s linear infinite;font-size:32px;}@keyframes iziSp{from{transform:rotate(0)}to{transform:rotate(360deg)}}';

var style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

var html = '<div id="izi-ov" class="izi-ov" style="display:none"><div class="izi-mo">';
html += '<button class="izi-cl2" onclick="iziClose()">&#x2715;</button>';
html += '<div class="izi-tit">&#x26A1; Payer en Crypto</div>';
html += '<div class="izi-am" id="izi-amt">$0.00 USD</div>';
html += '<div class="izi-st active" id="izi-s1">';
html += '<div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre crypto :</div>';
html += '<div class="izi-gr">';
var cryptos = [
  ['USDT.BEP20','https://cryptologos.cc/logos/tether-usdt-logo.png','USDT BEP20'],
  ['USDT.TRC20','https://cryptologos.cc/logos/tether-usdt-logo.png','USDT TRC20'],
  ['BTC','https://cryptologos.cc/logos/bitcoin-btc-logo.png','Bitcoin'],
  ['ETH','https://cryptologos.cc/logos/ethereum-eth-logo.png','Ethereum'],
  ['BNB','https://cryptologos.cc/logos/bnb-bnb-logo.png','BNB'],
  ['TRX','https://cryptologos.cc/logos/tron-trx-logo.png','TRON']
];
cryptos.forEach(function(c,i){
  html += '<div class="izi-cb'+(i===0?' sel':'')+'" onclick="iziSel(this,\''+c[0]+'\')"><img class="izi-cl" src="'+c[1]+'" onerror="this.style.display=\'none\'">'+c[2]+'</div>';
});
html += '</div>';
html += '<div class="izi-wa">&#x26A0; Envoyez le montant exact sur le bon reseau.</div>';
html += '<button class="izi-bn" onclick="iziGen()">Generer adresse de paiement</button>';
html += '<button class="izi-b2" onclick="iziPOS()">Payer via izichangePay.com</button>';
html += '</div>';
html += '<div class="izi-st" id="izi-s2">';
html += '<div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez <b id="izi-exact" style="color:#00e5ff"></b> a :</div>';
html += '<div class="izi-ad" id="izi-addr">--</div>';
html += '<button onclick="iziCp()" style="background:#1e2d47;border:none;color:#e2e8f0;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;width:100%;margin-bottom:8px;">&#x1F4CB; Copier</button>';
html += '<div style="font-size:11px;color:#64748b;margin-bottom:4px" id="izi-net"></div>';
html += '<div class="izi-wa">&#x23F3; Confirmation automatique apres reception.</div>';
html += '<button class="izi-bn" id="izi-chk" onclick="iziChk()">&#x1F504; Verifier mon paiement</button>';
html += '<button class="izi-b2" onclick="iziStep(1)">Changer de crypto</button>';
html += '</div>';
html += '<div class="izi-st" id="izi-s3"><div style="text-align:center;padding:24px 0"><div class="izi-sp">&#x26A1;</div><div style="font-weight:700;margin:14px 0 6px;font-size:15px">Verification en cours...</div></div></div>';
html += '<div class="izi-st" id="izi-s4"><div style="text-align:center;padding:24px 0"><div style="font-size:52px;margin-bottom:12px">&#x2705;</div><div style="font-size:20px;font-weight:800;color:#22c55e;margin-bottom:8px">Paiement confirme !</div><div style="font-size:13px;color:#64748b;margin-bottom:20px">Service active avec succes.</div><button class="izi-bn" onclick="iziClose()">Fermer</button></div></div>';
html += '</div></div>';

var div = document.createElement('div');
div.innerHTML = html;
document.body.appendChild(div);

var _IS='',_IA=0,_ID='',_IP='',_IC='USDT.BEP20',_IO='',_IT=null;

window.openCryptoPayment = function(s,a,d,p){
  _IS=s; _IA=a; _ID=d; _IP=p||'';
  document.getElementById('izi-amt').textContent='$'+a.toFixed(2)+' USD';
  iziStep(1);
  document.getElementById('izi-ov').style.display='flex';
};
window.iziClose = function(){document.getElementById('izi-ov').style.display='none';clearInterval(_IT);};
window.iziStep = function(n){for(var i=1;i<=4;i++)document.getElementById('izi-s'+i).classList.remove('active');document.getElementById('izi-s'+n).classList.add('active');};
window.iziSel = function(el,id){document.querySelectorAll('.izi-cb').forEach(function(b){b.classList.remove('sel');});el.classList.add('sel');_IC=id;};
window.iziPOS = function(){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');iziClose();};
window.iziCp = function(){var el=document.getElementById('izi-addr');if(el)navigator.clipboard.writeText(el.textContent.trim()).then(function(){alert('Adresse copiee !');});};
window.iziGen = async function(){
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
};
window.iziChk = async function(){
  if(!_IO)return;
  var b=document.getElementById('izi-chk');b.disabled=true;
  try{var r=await fetch('/api/izipay/status/'+_IO);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_IT);iziStep(4);}
    else b.disabled=false;
  }catch(e){b.disabled=false;}
};
async function iziAuto(){
  if(!_IO)return;
  try{var r=await fetch('/api/izipay/status/'+_IO);var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){clearInterval(_IT);iziStep(4);}
  }catch(e){}
}
})();
