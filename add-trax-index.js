const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// Add PST-TRAX service card after SecurCam card
const traxCard = `
    <!-- PST-TRAX -->
    <div class="service-card" style="border-color:rgba(0,229,255,0.2);background:rgba(0,229,255,0.02);">
      <div class="service-icon" style="background:rgba(0,229,255,0.12);">🗺️</div>
      <span class="service-badge" style="background:rgba(0,229,255,0.15);color:#00e5ff;border:1px solid rgba(0,229,255,0.3);">✨ Nouveau</span>
      <div class="service-title">PST-TRAX</div>
      <p class="service-desc">Géolocalisation et tracking GPS en temps réel pour vos véhicules, motos Jakarta et flottes. Surveillance 24h depuis votre téléphone.</p>
      <div class="service-features">
        <div class="service-feat">Carte temps réel niveau rue</div>
        <div class="service-feat">Coupure moteur à distance</div>
        <div class="service-feat">App chauffeur incluse</div>
        <div class="service-feat">Historique des trajets</div>
      </div>
      <a href="https://pst-telecom-production.up.railway.app/trax" class="service-link" style="color:#00e5ff;">Accéder à PST-TRAX →</a>
    </div>`;

// Insert after the Factures card (last card in grid)
const marker = '    </div>\n\n  </div>\n</section>';
if (c.includes(marker)) {
  c = c.replace(marker, traxCard + '\n\n    </div>\n\n  </div>\n</section>');
  console.log('PST-TRAX ajouté dans services grid');
} else {
  // Try alternate marker
  const marker2 = '</div>\n\n  </div>\n</section>';
  const idx = c.lastIndexOf('service-link');
  if (idx !== -1) {
    const endCard = c.indexOf('</div>', idx) + 6;
    c = c.slice(0, endCard) + '\n' + traxCard + c.slice(endCard);
    console.log('PST-TRAX ajouté (fallback)');
  }
}

// Also update stats: 5 -> 6 services, add Crypto payment info
c = c.replace('<div class="stat-num">5</div><div class="stat-label">Services actifs</div>', 
              '<div class="stat-num">7</div><div class="stat-label">Services actifs</div>');

// Update nav to add TRAX link
c = c.replace('<a href="https://pst-telecom-production.up.railway.app/sms">SMS Verif</a>',
              '<a href="https://pst-telecom-production.up.railway.app/sms">SMS Verif</a>\n    <a href="https://pst-telecom-production.up.railway.app/trax">PST-TRAX</a>');

// Update footer services
c = c.replace('<a href="#securcam">PST SecurCam</a>',
              '<a href="#securcam">PST SecurCam</a>\n    <a href="https://pst-telecom-production.up.railway.app/trax">PST-TRAX GPS</a>');

// Add crypto to footer payment section
c = c.replace('<a href="#">💚 Wave</a>',
              '<a href="#">💚 Wave</a>');
c = c.replace('<a href="#">🟠 Orange Money</a>',
              '<a href="#">🟠 Orange Money</a>\n    <a href="#">⚡ Crypto (BTC, USDT...)</a>');

fs.writeFileSync('index.html', c, 'utf8');
console.log('index.html mis à jour - lignes:', c.split('\n').length);
