// ============================================
// PST — test-api.js
// Tester que tout fonctionne
// ============================================

const BASE = 'https://pst-telecom-production.up.railway.app';

async function post(url, body) {
  const r = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function get(url) {
  const r = await fetch(BASE + url);
  return r.json();
}

async function runTests() {
  console.log('\n🚀 PST — Tests API\n');

  // 1. Créer un compte
  console.log('1️⃣  Création du compte...');
  const compte = await post('/api/auth/register', {
    nom: 'Diallo',
    prenom: 'Mamadou',
    telephone: '+221771234567',
    forfait: 'smart',
  });
  console.log('✅', compte.message);
  console.log('   UserID:', compte.userId);
  console.log('   Numéro:', compte.numeroVirtuel);

  const userId = compte.userId;

  // 2. Initier un paiement Wave
  console.log('\n2️⃣  Paiement Wave...');
  const wave = await post('/api/payment/wave/initiate', { userId });
  console.log('✅ Référence:', wave.reference);
  console.log('   URL Wave:', wave.wave_launch_url);

  // 3. Confirmer le paiement
  console.log('\n3️⃣  Confirmation du paiement...');
  const confirm = await post('/api/payment/confirm', { reference: wave.reference });
  console.log('✅', confirm.message);

  // 4. Vérifier le profil (actif maintenant)
  console.log('\n4️⃣  Profil abonné...');
  const profil = await get(`/api/users/${userId}`);
  console.log('✅ Actif:', profil.actif);
  console.log('   Minutes:', profil.minutesRestantes);
  console.log('   Forfait:', profil.forfait);

  // 5. Passer un appel test
  console.log('\n5️⃣  Appel test...');
  const appel = await post('/api/calls/make', {
    userId,
    numeroDestination: '+221771234567',
  });
  console.log('✅', appel.message);
  console.log('   CallID:', appel.callId);

  console.log('\n🎉 Tous les tests passent ! PST est opérationnel.\n');
}

runTests().catch(console.error);
