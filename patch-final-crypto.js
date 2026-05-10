const fs = require('fs');

const PAGES = [
  { file: 'recharge.html',      svc: 'recharge', amt: 1.65,  desc: 'Recharge mobile PST' },
  { file: 'sms.html',           svc: 'sms5sim',  amt: 1.65,  desc: 'Numero virtuel 5SIM' },
  { file: 'appel.html',         svc: 'appels',   amt: 4.95,  desc: 'Forfait Appels VoIP' },
  { file: 'sms-marketing.html', svc: 'sms',      amt: 8.25,  desc: 'Credits SMS Marketing' },
  { file: 'noc.html',           svc: 'noc',      amt: 24.75, desc: 'Abonnement PST NOC' },
  { file: 'pst-trax.html',      svc: 'trax',     amt: 24.75, desc: 'Abonnement PST-TRAX' },
];

// The snippet to add - loads external JS (no inline strings = no apostrophe bugs)
function makeSnippet(svc, amt, desc) {
  return `
<!-- izichangePay Crypto -->
<script src="/izipay-widget.js"></script>
<div style="margin-top:10px">
<button onclick="openCryptoPayment('${svc}',${amt},'${desc}','')"
  style="width:100%;padding:13px;background:linear-gradient(135deg,#0a1628,#162040);border:2px solid #00e5ff;color:#00e5ff;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;">
  <img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">
  <img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">
  <img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:18px;height:18px;border-radius:50%;object-fit:contain">
  &#x26A1; Payer en Crypto
</button>
</div>
<!-- fin izichangePay -->`;
}

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) { console.log('Non trouve:', page.file); return; }
  let content = fs.readFileSync(page.file, 'utf8');

  // Remove ALL old crypto code
  content = content.replace(/<style>\s*\.izipay[\s\S]*?<\/style>/g, '');
  content = content.replace(/<style>\s*\.izi-[\s\S]*?<\/style>/g, '');
  content = content.replace(/<style>\s*\.izi-ov[\s\S]*?<\/style>/g, '');
  content = content.replace(/<div id="izi-ov"[\s\S]*?<\/div>\s*<\/div>/g, '');
  content = content.replace(/<div id="izipay-overlay"[\s\S]*?<\/div>\s*<\/div>/g, '');
  content = content.replace(/<script>\s*var _IS=[\s\S]*?<\/script>/g, '');
  content = content.replace(/<script>\s*var _iziSvc[\s\S]*?<\/script>/g, '');
  content = content.replace(/<script>\s*\(function\(\)[\s\S]*?<\/script>/g, '');
  content = content.replace(/<!-- izichangePay[\s\S]*?fin izichangePay -->/g, '');
  content = content.replace(/<!-- ={3,}.*?izi[\s\S]*?-->/g, '');
  content = content.replace(/<!-- izichangePay Widget -->/g, '');
  content = content.replace(/<script src="\/izipay-widget\.js"><\/script>/g, '');
  
  // Remove inline crypto buttons
  content = content.replace(/<button onclick="openCryptoPayment[^>]*>[\s\S]*?<\/button>/g, '');
  content = content.replace(/<div[^>]*>\s*<button onclick="openCryptoPayment[\s\S]*?<\/div>/g, '');

  // Now add clean snippet before </body>
  const snippet = makeSnippet(page.svc, page.amt, page.desc);
  content = content.replace('</body>', snippet + '\n</body>');

  fs.writeFileSync(page.file, content, 'utf8');
  console.log('OK:', page.file);
});

// Add route for izipay-widget.js in a patch file
const routePatch = `
// Route pour widget crypto externe
app.get('/izipay-widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(__dirname + '/izipay-widget.js');
});
`;
fs.writeFileSync('route-izipay.txt', routePatch, 'utf8');
console.log('\nDone! Maintenant:');
console.log('1. git add . && git commit -m "Crypto widget externe fix definitif" && git push');
console.log('2. Dans server-at.js ajouter le contenu de route-izipay.txt avant DEMARRAGE');
