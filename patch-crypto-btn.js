const fs = require('fs');

// The crypto button to add next to Wave/Carte Visa
const CRYPTO_BTN = `
<button onclick="openCryptoPayment('SERVICE', AMOUNT, 'DESCRIPTION', '')" 
  style="background:linear-gradient(135deg,#0a1628,#1e3a5f);border:2px solid #00e5ff;color:#00e5ff;
  padding:12px 20px;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;
  display:inline-flex;align-items:center;gap:8px;transition:all .2s;width:100%;
  justify-content:center;margin-top:8px;">
  ⚡ Crypto (Bitcoin, USDT...)
</button>`;

const PAGES = [
  {
    file: 'recharge.html',
    service: 'recharge',
    amount: 1.65,
    desc: 'Recharge mobile PST Telecom',
    // Insert after Wave/Carte Visa buttons
    markers: ['Carte Visa', 'wave', 'Wave', 'payer', 'Payer']
  },
  {
    file: 'sms.html',
    service: 'sms5sim',
    amount: 1.65,
    desc: 'Numero virtuel SMS 5SIM',
    markers: ['Carte Visa', 'wave', 'Wave', 'payer', 'Payer', 'acheter', 'Acheter']
  },
  {
    file: 'appel.html',
    service: 'appels',
    amount: 4.95,
    desc: 'Forfait Appels VoIP PST',
    markers: ['Carte Visa', 'wave', 'Wave', 'payer', 'Payer']
  },
  {
    file: 'sms-marketing.html',
    service: 'sms',
    amount: 8.25,
    desc: 'Credits SMS Marketing PST',
    markers: ['Carte Visa', 'wave', 'Wave', 'payer', 'Payer']
  }
];

PAGES.forEach(function(page) {
  if (!fs.existsSync(page.file)) {
    console.log('⏭ Non trouvé:', page.file);
    return;
  }

  let content = fs.readFileSync(page.file, 'utf8');

  // Skip if already has crypto btn in payment section
  if (content.includes('openCryptoPayment') && content.includes('Carte Visa')) {
    // Check if crypto btn is near Wave btn
    const waveIdx = content.indexOf('Wave');
    const cryptoIdx = content.indexOf('openCryptoPayment');
    if (Math.abs(waveIdx - cryptoIdx) < 500) {
      console.log('✅ Déjà en place:', page.file);
      return;
    }
  }

  // Find the payment buttons section (Wave / Carte Visa)
  let insertIdx = -1;
  
  // Strategy 1: Find "Carte Visa" button and insert after its container
  const carteIdx = content.indexOf('Carte Visa');
  if (carteIdx !== -1) {
    // Find closing </button> after "Carte Visa"
    const btnEnd = content.indexOf('</button>', carteIdx);
    if (btnEnd !== -1) {
      insertIdx = btnEnd + 9;
    }
  }

  // Strategy 2: Find Wave button
  if (insertIdx === -1) {
    const waveIdx = content.indexOf('>Wave<') || content.indexOf('>♥ Wave<') || content.indexOf('Wave</');
    if (waveIdx !== -1) {
      const btnEnd = content.indexOf('</button>', waveIdx);
      if (btnEnd !== -1) insertIdx = btnEnd + 9;
    }
  }

  if (insertIdx === -1) {
    console.log('⚠️ Point insertion non trouvé dans:', page.file);
    return;
  }

  const btn = CRYPTO_BTN
    .replace('SERVICE', page.service)
    .replace('AMOUNT', page.amount)
    .replace('DESCRIPTION', page.desc);

  content = content.slice(0, insertIdx) + btn + content.slice(insertIdx);
  fs.writeFileSync(page.file, content, 'utf8');
  console.log('✅ Bouton crypto ajouté dans:', page.file);
});

console.log('\nDone! git add . && git commit -m "Bouton crypto visible section paiement" && git push');
