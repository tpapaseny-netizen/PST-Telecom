const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// Find "Paiements" or "Revenus" nav-item
const searchTerms = ['Paiements', 'Revenus', 'SMS Verif', 'Appels'];
let insertIdx = -1;
let foundTerm = '';

for (const term of searchTerms) {
  const idx = content.indexOf(term);
  if (idx !== -1) {
    // Find the end of this nav-item (closing div or next nav-item)
    const endDiv = content.indexOf('</div>', idx);
    if (endDiv !== -1) {
      insertIdx = endDiv + 6;
      foundTerm = term;
      break;
    }
  }
}

if (insertIdx === -1) {
  // Find SecurCam nav-item and insert after it
  const securIdx = content.indexOf("securcam-admin");
  if (securIdx !== -1) {
    const endDiv = content.indexOf('</div>', securIdx);
    insertIdx = endDiv + 6;
    foundTerm = 'securcam';
  }
}

if (insertIdx === -1) {
  console.log('❌ Point insertion non trouvé');
  process.exit(1);
}

const cryptoNavItem = `
        <div class="nav-item" onclick="window.open('/crypto-admin','_blank')" style="background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.3)">
          <span style="font-size:18px">⚡</span>
          <span>Crypto Payments</span>
        </div>`;

content = content.slice(0, insertIdx) + cryptoNavItem + content.slice(insertIdx);
fs.writeFileSync('admin.html', content, 'utf8');
console.log('✅ Crypto Payments ajouté après:', foundTerm);
console.log('Ligne ~'+content.slice(0,insertIdx).split('\n').length);
