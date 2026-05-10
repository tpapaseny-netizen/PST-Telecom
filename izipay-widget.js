(function(){
// Inject CSS
var s=document.createElement('style');
s.textContent=[
'.iov{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999 !important;align-items:center;justify-content:center;padding:16px}',
'.imo{background:#111827;border:1px solid #1e2d47;border-radius:20px;padding:28px;width:100%;max-width:460px;color:#e2e8f0;font-family:Arial,sans-serif;position:relative;max-height:90vh;overflow-y:auto}',
'.ist{display:none !important}',
'.ist.on{display:block !important}',
'.igr{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}',
'.icb{padding:12px 8px;border:2px solid #1e2d47;background:#0a0e1a;color:#94a3b8;border-radius:12px;cursor:pointer;text-align:center;font-size:11px;font-weight:700}',
'.icb.on{border-color:#00e5ff !important;color:#00e5ff !important;background:rgba(0,229,255,.07) !important}',
'.icl{width:28px;height:28px;border-radius:50%;display:block;margin:0 auto 5px;object-fit:contain}',
'.ibn{width:100%;padding:13px;background:#00e5ff;color:#000;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px;display:block}',
'.ib2{width:100%;padding:10px;background:transparent;color:#64748b;border:1px solid #1e2d47;border-radius:12px;font-size:12px;cursor:pointer;margin-top:8px;display:block}',
'.iad{background:#0a0e1a;border:1px solid #1e2d47;border-radius:10px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:#00e5ff;margin:10px 0}',
'.iwa{background:rgba(249,115,22,.1);border:1px solid #f97316;border-radius:8px;padding:10px;font-size:11px;color:#f97316;margin-top:8px}',
'.icx{position:absolute;top:14px;right:14px;background:transparent;border:none;color:#64748b;font-size:22px;cursor:pointer;line-height:1}',
'.isp{display:inline-block;animation:isp 1s linear infinite;font-size:32px}',
'@keyframes isp{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
].join('');
document.head.appendChild(s);

// Build HTML
var h='';
h+='<div id="iov" class="iov" style="display:none !important">';
h+='<div class="imo">';
h+='<button class="icx" onclick="iziClose()">&#x2715;</button>';
h+='<div style="font-size:17px;font-weight:800;margin-bottom:4px">&#x26A1; Payer en Cryptomonnaie</div>';
h+='<div style="font-size:28px;font-weight:900;color:#00e5ff;margin-bottom:18px" id="iamt">$0.00 USD</div>';

// Step 1 - choose crypto
h+='<div class="ist on" id="is1">';
h+='<div style="font-size:12px;color:#64748b;margin-bottom:10px">Choisissez votre crypto :</div>';
h+='<div class="igr">';
var cr=[['USDT.BEP20','https://cryptologos.cc/logos/tether-usdt-logo.png','USDT BEP20'],['USDT.TRC20','https://cryptologos.cc/logos/tether-usdt-logo.png','USDT TRC20'],['BTC','https://cryptologos.cc/logos/bitcoin-btc-logo.png','Bitcoin'],['ETH','https://cryptologos.cc/logos/ethereum-eth-logo.png','Ethereum'],['BNB','https://cryptologos.cc/logos/bnb-bnb-logo.png','BNB'],['TRX','https://cryptologos.cc/logos/tron-trx-logo.png','TRON']];
cr.forEach(function(c,i){h+='<div class="icb'+(i===0?' on':'')+'" onclick="iziSel(this,\''+c[0]+'\')"><img class="icl" src="'+c[1]+'" onerror="this.style.display=\'none\'">'+c[2]+'</div>';});
h+='</div>';
h+='<div class="iwa">&#x26A0; Envoyez le montant exact sur le bon reseau.</div>';
h+='<button class="ibn" onclick="iziGen()">Generer adresse de paiement</button>';
h+='<button class="ib2" onclick="iziPOS()">Payer via izichangePay.com</button>';
h+='</div>';

// Step 2 - show address
h+='<div class="ist" id="is2">';
h+='<div style="font-size:12px;color:#64748b;margin-bottom:6px">Envoyez <b id="iex" style="color:#00e5ff"></b> a :</div>';
h+='<div class="iad" id="iad">--</div>';
h+='<button onclick="iziCp()" class="ibn" style="background:#1e2d47;color:#e2e8f0;margin-bottom:8px">&#x1F4CB; Copier l adresse</button>';
h+='<div style="font-size:11px;color:#64748b;margin-bottom:4px" id="inet"></div>';
h+='<div class="iwa">&#x23F3; Confirmation automatique apres reception blockchain.</div>';
h+='<button class="ibn" id="ichk" onclick="iziChk()">&#x1F504; Verifier mon paiement</button>';
h+='<button class="ib2" onclick="iziStep(1)">Changer de crypto</button>';
h+='</div>';

// Step 3 - loading
h+='<div class="ist" id="is3">';
h+='<div style="text-align:center;padding:24px 0"><div class="isp">&#x26A1;</div><div style="font-weight:700;margin:14px 0 6px;font-size:15px">Verification en cours...</div></div>';
h+='</div>';

// Step 4 - success
h+='<div class="ist" id="is4">';
h+='<div style="text-align:center;padding:24px 0"><div style="font-size:52px;margin-bottom:12px">&#x2705;</div><div style="font-size:20px;font-weight:800;color:#22c55e;margin-bottom:8px">Paiement confirme !</div><div style="font-size:13px;color:#64748b;margin-bottom:20px">Service active avec succes.</div><button class="ibn" onclick="iziClose()">Fermer</button></div>';
h+='</div>';

h+='</div></div>';

var wrap=document.createElement('div');
wrap.innerHTML=h;
document.body.appendChild(wrap);

// State
var _S='',_A=0,_D='',_P='',_C='USDT.BEP20',_O='',_T=null;

window.openCryptoPayment=function(s,a,d,p){
  _S=s;_A=a;_D=d;_P=p||'';
  document.getElementById('iamt').textContent='$'+a.toFixed(2)+' USD';
  iziStep(1);
  var ov=document.getElementById('iov');
  ov.style.display='flex';
  ov.style.removeProperty('display');
  ov.style.cssText='display:flex !important;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99999;align-items:center;justify-content:center;padding:16px;';
};

window.iziClose=function(){
  var ov=document.getElementById('iov');
  ov.style.cssText='display:none !important;';
  clearInterval(_T);
};

window.iziStep=function(n){
  for(var i=1;i<=4;i++){
    var e=document.getElementById('is'+i);
    if(e){e.classList.remove('on');e.style.display='none';}
  }
  var t=document.getElementById('is'+n);
  if(t){t.classList.add('on');t.style.display='block';}
};

window.iziSel=function(el,id){
  document.querySelectorAll('.icb').forEach(function(b){b.classList.remove('on');});
  el.classList.add('on');
  _C=id;
};

window.iziPOS=function(){window.open('https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402','_blank');iziClose();};

window.iziCp=function(){
  var e=document.getElementById('iad');
  if(e)navigator.clipboard.writeText(e.textContent.trim()).then(function(){alert('Adresse copiee !');});
};

window.iziGen=async function(){
  iziStep(3);
  try{
    var r=await fetch('/api/izipay/create-payment',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({service:_S,amount_usd:_A,currency:_C,description:_D,user_phone:_P})
    });
    var d=await r.json();
    if(d.method==='pos'||!d.address){iziPOS();return;}
    _O=d.order_id;
    document.getElementById('iex').textContent=_A+' USD en '+_C;
    document.getElementById('iad').textContent=d.address;
    document.getElementById('inet').textContent='Reseau: '+(d.network||_C);
    iziStep(2);
    _T=setInterval(iziAuto,30000);
  }catch(e){iziPOS();}
};

window.iziChk=async function(){
  if(!_O)return;
  var b=document.getElementById('ichk');
  b.disabled=true;b.textContent='Verification...';
  try{
    var r=await fetch('/api/izipay/status/'+_O);
    var d=await r.json();
    if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){
      clearInterval(_T);iziStep(4);
    }else{b.disabled=false;b.innerHTML='&#x1F504; Verifier mon paiement';}
  }catch(e){b.disabled=false;b.innerHTML='&#x1F504; Reessayer';}
};

function iziAuto(){
  if(!_O)return;
  fetch('/api/izipay/status/'+_O)
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.order&&(d.order.status==='paid'||d.order.status==='completed')){
        clearInterval(_T);iziStep(4);
      }
    }).catch(function(){});
}
})();
