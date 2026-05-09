const fs = require('fs');

// Fix prices in all already-patched files
const PRICE_FIXES = [
  { file: 'recharge.html',      old: "openCryptoPayment('recharge', 2.00",      new: "openCryptoPayment('recharge', 1.65" },
  { file: 'pst-trax.html',      old: "openCryptoPayment('trax', 15.00",         new: "openCryptoPayment('trax', 24.75" },
  { file: 'noc.html',           old: "openCryptoPayment('noc', 35.00",          new: "openCryptoPayment('noc', 24.75" },
  { file: 'sms-marketing.html', old: "openCryptoPayment('sms', 5.00",           new: "openCryptoPayment('sms', 8.25" },
  { file: 'appel.html',         old: "openCryptoPayment('appels', 10.00",       new: "openCryptoPayment('appels', 4.95" },
];

PRICE_FIXES.forEach(function(fix) {
  if (!fs.existsSync(fix.file)) { console.log('⏭ Non trouvé:', fix.file); return; }
  let content = fs.readFileSync(fix.file, 'utf8');
  if (content.includes(fix.old)) {
    content = content.replace(fix.old, fix.new);
    fs.writeFileSync(fix.file, content, 'utf8');
    console.log('✅ Prix corrigé:', fix.file);
  } else {
    console.log('⚠️ Pattern non trouvé:', fix.file);
  }
});

// Add crypto button to SMS verification page
const SMS_FILES = ['sms.html', 'sms-verification.html', 'verification.html'];
let smsFile = null;
SMS_FILES.forEach(function(f) { if (fs.existsSync(f)) smsFile = f; });

if (smsFile) {
  let content = fs.readFileSync(smsFile, 'utf8');
  if (!content.includes("openCryptoPayment('sms5sim'")) {
    // Add crypto button - find payment section
    const cryptoBtn = `
<button class="izi-crypto-pay-btn" style="margin:8px 0" onclick="openCryptoPayment('sms5sim', 1.65, 'Numero virtuel SMS 5SIM - 1000 FCFA', '')">
  ⚡ Payer en Crypto (1 000 FCFA)
</button>`;
    // Insert before first </form> or before </div> near payment
    if (content.includes('wave') || content.includes('Wave')) {
      content = content.replace('</body>', cryptoBtn + '\n</body>');
    } else {
      content = content.replace('</body>', cryptoBtn + '\n</body>');
    }
    fs.writeFileSync(smsFile, content, 'utf8');
    console.log('✅ Crypto SMS ajouté:', smsFile);
  }
} else {
  console.log('⚠️ Page SMS non trouvée - donne-moi le nom exact du fichier');
}

console.log('\nDone! git add . && git commit -m "Fix prix crypto + SMS 5SIM crypto" && git push');
