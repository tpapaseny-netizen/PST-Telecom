const fs = require('fs');

if (!fs.existsSync('zama.html')) {
  console.log('ERREUR: zama.html non trouve dans ce dossier!');
  console.log('Dossier actuel:', process.cwd());
  process.exit(1);
}

let c = fs.readFileSync('zama.html', 'utf8');
console.log('zama.html trouve:', c.split('\n').length, 'lignes');

let changes = 0;

// ── FIX 1: Simplify recipient - one full name field ──
if (c.includes('r-prenom')) {
  // Replace prenom/nom with single fullname field
  c = c.replace(/document\.getElementById\("r-prenom"\)\.value\.trim\(\)\+" "\+document\.getElementById\("r-nom"\)\.value\.trim\(\)/g, 
    'document.getElementById("r-fullname")?document.getElementById("r-fullname").value.trim():""');
  
  // Fix form fields
  const oldFields = `      <div class="form-row" style="padding:0 20px">
        <div class="form-group"><label class="form-label">Prénom *</label><input class="form-input" type="text" id="r-prenom" placeholder="Prénom"></div>
        <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" type="text" id="r-nom" placeholder="Nom"></div>
      </div>`;
  if (c.includes(oldFields)) {
    c = c.replace(oldFields, `      <div style="padding:0 20px;margin-bottom:12px">
        <div class="form-group"><label class="form-label">Nom du destinataire *</label>
          <input class="form-input" type="text" id="r-fullname" placeholder="Prénom et Nom complet">
        </div>
      </div>`);
    changes++;
    console.log('✅ Champ destinataire simplifié');
  }
}

// ── FIX 2: Add crypto selector in payment screen ──
const payMarker = '<button class="pay-pos-btn" onclick="openPOS()">';
if (c.includes(payMarker) && !c.includes('crypto-grid')) {
  const cryptoGrid = `      <!-- Choix crypto -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Payer avec</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="crypto-grid">
          <div onclick="selCrypto(this,'USDT.BEP20')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8960C;background:#FFF4E0;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#C47A00"><img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">USDT BEP20</div>
          <div onclick="selCrypto(this,'USDT.TRC20')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/tether-usdt-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">USDT TRC20</div>
          <div onclick="selCrypto(this,'BTC')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/bitcoin-btc-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">Bitcoin</div>
          <div onclick="selCrypto(this,'ETH')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">Ethereum</div>
          <div onclick="selCrypto(this,'BNB')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/bnb-bnb-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">BNB</div>
          <div onclick="selCrypto(this,'TRX')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/tron-trx-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">TRON</div>
          <div onclick="selCrypto(this,'USDC.BEP20')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/usd-coin-usdc-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">USDC</div>
          <div onclick="selCrypto(this,'XRP')" style="display:flex;align-items:center;gap:5px;padding:7px 10px;border:1.5px solid #E8EAED;background:#F7F8FA;border-radius:20px;cursor:pointer;font-size:11px;font-weight:700;color:#4B5563"><img src="https://cryptologos.cc/logos/xrp-xrp-logo.png" style="width:16px;height:16px;border-radius:50%" onerror="this.style.display='none'">XRP</div>
        </div>
      </div>\n      `;
  c = c.replace(payMarker, cryptoGrid + payMarker);
  changes++;
  console.log('✅ Grille crypto ajoutée');
}

// ── FIX 3: Fix loading spinner on confirm button ──
if (c.includes('"⏳ En cours..."')) {
  c = c.replace('"⏳ En cours..."', '"<div style=\'display:inline-flex;align-items:center;gap:8px\'><div style=\'width:14px;height:14px;border:2px solid rgba(0,0,0,0.2);border-top-color:#000;border-radius:50%;animation:spin .6s linear infinite;flex-shrink:0\'></div>Traitement...</div>"');
  changes++;
  console.log('✅ Spinner bouton corrigé');
}

// ── FIX 4: Add selCrypto function if missing ──────
if (!c.includes('function selCrypto')) {
  const insertBefore = 'function openPOS(){';
  const selCryptoFn = `var selectedCrypto="USDT.BEP20";
function selCrypto(el,id){
  if(!document.getElementById("crypto-grid"))return;
  document.getElementById("crypto-grid").querySelectorAll("div[onclick]").forEach(function(b){
    b.style.borderColor="#E8EAED";b.style.background="#F7F8FA";b.style.color="#4B5563";
  });
  el.style.borderColor="#E8960C";el.style.background="#FFF4E0";el.style.color="#C47A00";
  selectedCrypto=id;
}
`;
  c = c.replace(insertBefore, selCryptoFn + insertBefore);
  changes++;
  console.log('✅ selCrypto function ajoutée');
}

// ── FIX 5: Add legal pages if missing ────────────
if (!c.includes('scr-about')) {
  const legalHTML = `
<!-- ABOUT -->
<div class="screen" id="scr-about">
  <div class="hdr"><button class="hdr-back" onclick="goBack()"><span class="hdr-back-icon">‹</span><span class="hdr-back-txt">Retour</span></button><span class="hdr-title">À propos</span><span></span></div>
  <div class="sbody">
    <div style="background:linear-gradient(160deg,#1A1A2E,#16213E);padding:40px 20px;text-align:center">
      <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#F5A623,#F5C518);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 14px;box-shadow:0 8px 24px rgba(245,166,35,.4)">🐓</div>
      <div style="font-size:26px;font-weight:900;color:#fff;letter-spacing:3px">ZAMA</div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Version 1.0 · by PST Telecom · Touba, Sénégal 🇸🇳</div>
      <div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:10px;line-height:1.6">Le bureau de change digital du Sénégal</div>
    </div>
    <div style="padding:16px 20px">
      <div style="font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">Ce que nous offrons</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <div style="display:flex;gap:12px;background:#F7F8FA;border-radius:12px;padding:14px"><span style="font-size:24px">💱</span><div><div style="font-size:14px;font-weight:700">Change instantané</div><div style="font-size:12px;color:#6B7280;margin-top:2px">USD, EUR, GBP, CAD → FCFA en 30 minutes</div></div></div>
        <div style="display:flex;gap:12px;background:#F7F8FA;border-radius:12px;padding:14px"><span style="font-size:24px">📱</span><div><div style="font-size:14px;font-weight:700">Mobile Money</div><div style="font-size:12px;color:#6B7280;margin-top:2px">Réception directe sur Wave ou Orange Money</div></div></div>
        <div style="display:flex;gap:12px;background:#F7F8FA;border-radius:12px;padding:14px"><span style="font-size:24px">🔒</span><div><div style="font-size:14px;font-weight:700">Sécurité bancaire</div><div style="font-size:12px;color:#6B7280;margin-top:2px">PIN 4 chiffres, KYC, données chiffrées</div></div></div>
        <div style="display:flex;gap:12px;background:#F7F8FA;border-radius:12px;padding:14px"><span style="font-size:24px">🌍</span><div><div style="font-size:14px;font-weight:700">Diaspora sénégalaise</div><div style="font-size:12px;color:#6B7280;margin-top:2px">France, USA, Canada, UK, Italie...</div></div></div>
        <div style="display:flex;gap:12px;background:#F7F8FA;border-radius:12px;padding:14px"><span style="font-size:24px">💰</span><div><div style="font-size:14px;font-weight:700">Commission transparente</div><div style="font-size:12px;color:#6B7280;margin-top:2px">Seulement 2% — taux du marché garanti</div></div></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div onclick="goTo('scr-contact')" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid #E8EAED;border-radius:12px;cursor:pointer"><span style="font-size:20px">💬</span><span style="font-size:14px;font-weight:600;flex:1">Nous contacter</span><span style="color:#9CA3AF">→</span></div>
        <div onclick="goTo('scr-privacy')" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid #E8EAED;border-radius:12px;cursor:pointer"><span style="font-size:20px">🔐</span><span style="font-size:14px;font-weight:600;flex:1">Politique de confidentialité</span><span style="color:#9CA3AF">→</span></div>
        <div onclick="goTo('scr-terms')" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid #E8EAED;border-radius:12px;cursor:pointer"><span style="font-size:20px">📄</span><span style="font-size:14px;font-weight:600;flex:1">Conditions d'utilisation</span><span style="color:#9CA3AF">→</span></div>
        <div onclick="goTo('scr-fees')" style="display:flex;align-items:center;gap:12px;padding:14px;background:#fff;border:1px solid #E8EAED;border-radius:12px;cursor:pointer"><span style="font-size:20px">💰</span><span style="font-size:14px;font-weight:600;flex:1">Tarifs et commissions</span><span style="color:#9CA3AF">→</span></div>
      </div>
      <div style="text-align:center;margin-top:24px;font-size:11px;color:#9CA3AF">© 2026 ZAMA by PST Telecom · Touba, Sénégal 🇸🇳</div>
    </div>
  </div>
</div>

<!-- CONTACT -->
<div class="screen" id="scr-contact">
  <div class="hdr"><button class="hdr-back" onclick="goBack()"><span class="hdr-back-icon">‹</span><span class="hdr-back-txt">Retour</span></button><span class="hdr-title">Nous contacter</span><span></span></div>
  <div class="sbody">
    <div style="background:linear-gradient(160deg,#1A1A2E,#16213E);padding:28px 20px;text-align:center"><div style="font-size:36px;margin-bottom:8px">💬</div><div style="font-size:18px;font-weight:800;color:#fff">Support ZAMA</div><div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">7j/7 · 8h–22h</div></div>
    <div style="padding-top:8px">
      <div onclick="window.open('tel:+221771520959')" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #E8EAED;cursor:pointer"><div style="width:44px;height:44px;border-radius:14px;background:#F0FDF4;display:flex;align-items:center;justify-content:center;font-size:20px">📞</div><div style="flex:1"><div style="font-size:14px;font-weight:700">Téléphone</div><div style="font-size:12px;color:#6B7280">+221 77 152 09 59</div></div><span style="color:#9CA3AF">→</span></div>
      <div onclick="window.open('https://wa.me/221771520959','_blank')" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #E8EAED;cursor:pointer"><div style="width:44px;height:44px;border-radius:14px;background:#DCFCE7;display:flex;align-items:center;justify-content:center;font-size:20px">💚</div><div style="flex:1"><div style="font-size:14px;font-weight:700">WhatsApp</div><div style="font-size:12px;color:#6B7280">+221 77 152 09 59</div></div><span style="color:#9CA3AF">→</span></div>
      <div onclick="window.open('mailto:papasenytoure@gmail.com')" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #E8EAED;cursor:pointer"><div style="width:44px;height:44px;border-radius:14px;background:#FFF4E0;display:flex;align-items:center;justify-content:center;font-size:20px">📧</div><div style="flex:1"><div style="font-size:14px;font-weight:700">Email</div><div style="font-size:12px;color:#6B7280">papasenytoure@gmail.com</div></div><span style="color:#9CA3AF">→</span></div>
      <div onclick="window.open('https://pst-telecom.vercel.app','_blank')" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #E8EAED;cursor:pointer"><div style="width:44px;height:44px;border-radius:14px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;font-size:20px">🌐</div><div style="flex:1"><div style="font-size:14px;font-weight:700">Site web</div><div style="font-size:12px;color:#6B7280">pst-telecom.vercel.app</div></div><span style="color:#9CA3AF">→</span></div>
      <div style="padding:16px 20px 24px">
        <div style="font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Formulaire de contact</div>
        <div style="margin-bottom:10px"><label style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Votre nom</label><input type="text" id="ct-name" placeholder="Prénom et Nom" style="width:100%;background:#F7F8FA;border:1.5px solid #E8EAED;border-radius:10px;padding:12px 14px;font-size:14px;outline:none;font-family:inherit"></div>
        <div style="margin-bottom:10px"><label style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Votre email</label><input type="email" id="ct-email" placeholder="email@exemple.com" style="width:100%;background:#F7F8FA;border:1.5px solid #E8EAED;border-radius:10px;padding:12px 14px;font-size:14px;outline:none;font-family:inherit"></div>
        <div style="margin-bottom:10px"><label style="font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Message</label><textarea id="ct-msg" rows="3" placeholder="Votre message..." style="width:100%;background:#F7F8FA;border:1.5px solid #E8EAED;border-radius:10px;padding:12px 14px;font-size:14px;outline:none;font-family:inherit;resize:none"></textarea></div>
        <button onclick="sendContact()" style="width:100%;padding:14px;background:linear-gradient(135deg,#F5A623,#F5C518);color:#000;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">📤 Envoyer</button>
      </div>
    </div>
  </div>
</div>

<!-- PRIVACY -->
<div class="screen" id="scr-privacy">
  <div class="hdr"><button class="hdr-back" onclick="goBack()"><span class="hdr-back-icon">‹</span><span class="hdr-back-txt">Retour</span></button><span class="hdr-title">Confidentialité</span><span></span></div>
  <div class="sbody">
    <div style="background:linear-gradient(160deg,#1A1A2E,#16213E);padding:28px 20px"><div style="font-size:32px;margin-bottom:8px">🔐</div><div style="font-size:18px;font-weight:800;color:#fff">Politique de confidentialité</div><div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Dernière mise à jour : Mai 2026</div></div>
    <div style="padding:20px;font-size:14px;color:#374151;line-height:1.7">
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">1. Données collectées</h3>
      <p>ZAMA collecte : nom, téléphone, email, documents KYC et historique des transactions. Uniquement ce qui est nécessaire.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">2. Utilisation</h3>
      <p>Vos données servent uniquement à traiter vos transferts, vérifier votre identité (KYC) et vous envoyer des notifications de transaction.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">3. Protection</h3>
      <p>Données chiffrées et stockées de manière sécurisée. Jamais vendues à des tiers. Photos KYC accessibles uniquement à notre équipe de conformité.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">4. Partage</h3>
      <p>Partagé uniquement avec izichangePay (paiement), Wave/Orange Money (virement), et les autorités si requis par la loi sénégalaise.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">5. Conservation</h3>
      <p>5 ans après votre dernière transaction, conformément à la réglementation anti-blanchiment du Sénégal.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">6. Vos droits</h3>
      <p>Accès, correction ou suppression de vos données : papasenytoure@gmail.com · +221 77 152 09 59</p>
    </div>
  </div>
</div>

<!-- TERMS -->
<div class="screen" id="scr-terms">
  <div class="hdr"><button class="hdr-back" onclick="goBack()"><span class="hdr-back-icon">‹</span><span class="hdr-back-txt">Retour</span></button><span class="hdr-title">Conditions d'utilisation</span><span></span></div>
  <div class="sbody">
    <div style="background:linear-gradient(160deg,#1A1A2E,#16213E);padding:28px 20px"><div style="font-size:32px;margin-bottom:8px">📄</div><div style="font-size:18px;font-weight:800;color:#fff">Conditions d'utilisation</div><div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Dernière mise à jour : Mai 2026</div></div>
    <div style="padding:20px;font-size:14px;color:#374151;line-height:1.7">
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px">1. Description du service</h3>
      <p>ZAMA convertit des devises étrangères (USD, EUR, GBP, CAD) en FCFA et envoie les fonds via Mobile Money au Sénégal.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">2. Éligibilité</h3>
      <p>18 ans minimum. Informations exactes obligatoires. Un seul compte par numéro de téléphone.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">3. Limites</h3>
      <p>Sans KYC : 500 USD/jour. Avec KYC : 5 000 USD/jour.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">4. Frais</h3>
      <p>Commission fixe de 2% + 0.8% izichangePay = 2.8% total. Taux garanti 30 minutes après confirmation.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">5. Responsabilité</h3>
      <p>Vérifiez toujours le numéro destinataire. Les transactions envoyées ne peuvent pas être annulées. ZAMA n'est pas responsable des erreurs de saisie.</p>
      <h3 style="font-size:15px;font-weight:800;color:#0F1117;margin:16px 0 8px;padding-top:16px;border-top:1px solid #E8EAED">6. Droit applicable</h3>
      <p>Droit sénégalais. Litiges soumis aux tribunaux de Dakar.</p>
    </div>
  </div>
</div>

<!-- FEES -->
<div class="screen" id="scr-fees">
  <div class="hdr"><button class="hdr-back" onclick="goBack()"><span class="hdr-back-icon">‹</span><span class="hdr-back-txt">Retour</span></button><span class="hdr-title">Tarifs</span><span></span></div>
  <div class="sbody">
    <div style="background:linear-gradient(160deg,#1A1A2E,#16213E);padding:28px 20px"><div style="font-size:32px;margin-bottom:8px">💰</div><div style="font-size:18px;font-weight:800;color:#fff">Tarifs & Commissions</div><div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Transparents et fixes</div></div>
    <div style="padding:20px">
      <div style="background:linear-gradient(135deg,#FFF4E0,#FFFBF0);border:1.5px solid #E8960C;border-radius:16px;padding:24px;text-align:center;margin-bottom:20px">
        <div style="font-size:52px;font-weight:900;color:#C47A00;line-height:1">2%</div>
        <div style="font-size:14px;color:#6B7280;margin-top:6px">Commission ZAMA fixe</div>
        <div style="font-size:12px;color:#9CA3AF;margin-top:4px">+ 0.8% izichangePay = 2.8% total</div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Exemples</div>
      <div style="background:#F7F8FA;border-radius:12px;overflow:hidden;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #E8EAED;font-size:13px"><span style="color:#6B7280">100 USD</span><span style="font-weight:700;color:#16A34A">≈ 58 980 FCFA</span></div>
        <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #E8EAED;font-size:13px"><span style="color:#6B7280">200 EUR</span><span style="font-weight:700;color:#16A34A">≈ 127 744 FCFA</span></div>
        <div style="display:flex;justify-content:space-between;padding:12px 16px;font-size:13px"><span style="color:#6B7280">500 USD</span><span style="font-weight:700;color:#16A34A">≈ 294 900 FCFA</span></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Limites quotidiennes</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        <div style="background:#F7F8FA;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:700">Sans KYC</div><div style="font-size:12px;color:#6B7280">Inscription simple</div></div><div style="font-size:18px;font-weight:800;color:#C47A00">500$/j</div></div>
        <div style="background:#F0FDF4;border:1.5px solid #16A34A;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:700">Avec KYC ✅</div><div style="font-size:12px;color:#6B7280">Identité vérifiée</div></div><div style="font-size:18px;font-weight:800;color:#16A34A">5000$/j</div></div>
      </div>
    </div>
  </div>
</div>
`;
  c = c.replace('<!-- TOAST -->', legalHTML + '\n<!-- TOAST -->');
  changes++;
  console.log('✅ Pages légales ajoutées (About, Contact, Privacy, Terms, Fees)');
}

// ── FIX 6: Add legal links in account screen ──────
if (!c.includes('scr-about') && c.includes('scr-kyc')) {
  // Already handled above
}
if (c.includes('scr-about') && !c.includes("goTo('scr-about')")) {
  const oldSupport = `<div class="acct-item" onclick="window.open('tel:+221771520959')"><div class="acct-item-icon" style="background:var(--green-l)">📞</div><div class="acct-item-label">+221 77 152 09 59</div><div class="acct-item-arrow">→</div></div>`;
  const newSupport = `<div class="acct-item" onclick="window.open('tel:+221771520959')"><div class="acct-item-icon" style="background:var(--green-l)">📞</div><div class="acct-item-label">+221 77 152 09 59</div><div class="acct-item-arrow">→</div></div>
          <div class="acct-item" onclick="goTo('scr-contact')"><div class="acct-item-icon" style="background:#DCFCE7">💬</div><div class="acct-item-label">Nous contacter</div><div class="acct-item-arrow">→</div></div>
          <div class="acct-item" onclick="goTo('scr-about')"><div class="acct-item-icon" style="background:#EEF2FF">ℹ️</div><div class="acct-item-label">À propos de ZAMA</div><div class="acct-item-arrow">→</div></div>
          <div class="acct-item" onclick="goTo('scr-privacy')"><div class="acct-item-icon" style="background:#FFF4E0">🔐</div><div class="acct-item-label">Confidentialité</div><div class="acct-item-arrow">→</div></div>
          <div class="acct-item" onclick="goTo('scr-terms')"><div class="acct-item-icon" style="background:#EEF2FF">📄</div><div class="acct-item-label">Conditions d'utilisation</div><div class="acct-item-arrow">→</div></div>
          <div class="acct-item" onclick="goTo('scr-fees')"><div class="acct-item-icon" style="background:#F0FDF4">💰</div><div class="acct-item-label">Tarifs et commissions</div><div class="acct-item-arrow">→</div></div>`;
  if (c.includes(oldSupport)) {
    c = c.replace(oldSupport, newSupport);
    changes++;
    console.log('✅ Liens légaux ajoutés dans Mon Compte');
  }
}

// ── FIX 7: Add sendContact function if missing ────
if (!c.includes('function sendContact')) {
  c = c.replace('var toastT;', `async function sendContact(){
  var n=document.getElementById("ct-name")?.value.trim();
  var e=document.getElementById("ct-email")?.value.trim();
  var m=document.getElementById("ct-msg")?.value.trim();
  if(!n||!e||!m){toast("Remplissez tous les champs","err");return;}
  try{await fetch(API+"/api/zama/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n,email:e,message:m})});}catch(e){}
  if(document.getElementById("ct-name"))document.getElementById("ct-name").value="";
  if(document.getElementById("ct-msg"))document.getElementById("ct-msg").value="";
  toast("✅ Message envoyé ! Réponse sous 24h","ok");
  goBack();
}
var toastT;`);
  changes++;
  console.log('✅ sendContact function ajoutée');
}

fs.writeFileSync('zama.html', c, 'utf8');
console.log('\n✅ DONE! ' + changes + ' modifications appliquées');
console.log('Lines:', c.split('\n').length);
console.log('\nMaintenant:');
console.log('  git add zama.html');
console.log('  git commit -m "ZAMA fixes complets"');
console.log('  git push');
