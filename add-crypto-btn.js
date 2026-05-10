const fs = require('fs');

const PAGES = [
  {file:'recharge.html',      svc:'recharge', amt:1.65,  desc:'Recharge mobile PST'},
  {file:'sms.html',           svc:'sms5sim',  amt:1.65,  desc:'Numero virtuel 5SIM'},
  {file:'appel.html',         svc:'appels',   amt:4.95,  desc:'Forfait Appels VoIP'},
  {file:'sms-marketing.html', svc:'sms',      amt:8.25,  desc:'Credits SMS Marketing'},
  {file:'noc.html',           svc:'noc',      amt:24.75, desc:'Abonnement PST NOC'},
  {file:'pst-trax.html',      svc:'trax',     amt:24.75, desc:'Abonnement PST-TRAX'},
];

PAGES.forEach(function(page){
  if(!fs.existsSync(page.file)){console.log('Non trouve:',page.file);return;}
  let c=fs.readFileSync(page.file,'utf8');
  
  // Skip if already has the crypto button
  if(c.includes('izipay-widget.js') && c.includes('openCryptoPayment')){
    console.log('Deja patche:',page.file);return;
  }
  
  // Remove any old broken crypto code
  c=c.replace(/<script src="\/izipay-widget\.js"><\/script>/g,'');
  c=c.replace(/<!-- izichangePay[\s\S]*?fin izichangePay -->/g,'');
  
  // The snippet: load widget JS + button only
  var btn = '<script src="/izipay-widget.js"></script>\n' +
    '<div style="margin-top:10px">\n' +
    '<button onclick="openCryptoPayment(\'' + page.svc + '\',' + page.amt + ',\'' + page.desc + '\',\'\')" ' +
    'style="width:100%;padding:13px;background:linear-gradient(135deg,#0a1628,#162040);' +
    'border:2px solid #00e5ff;color:#00e5ff;border-radius:12px;cursor:pointer;font-size:14px;' +
    'font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;">' +
    '<img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">' +
    '<img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">' +
    '<img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">' +
    ' &#x26A1; Payer en Crypto</button>\n</div>';

  // Insert before </body>
  c = c.replace('</body>', btn + '\n</body>');
  fs.writeFileSync(page.file, c, 'utf8');
  console.log('OK:', page.file);
});
console.log('Done!');
