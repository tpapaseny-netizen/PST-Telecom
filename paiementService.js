// ============================================
// PST — paiementService.js
// Gestion des paiements Wave & Orange Money
// ============================================

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ── Initier un paiement Wave ──────────────
export async function payerWave(userId, telephone) {
  const res = await fetch(`${API_URL}/api/payment/wave/initiate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, telephone }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Erreur Wave');

  // Ouvrir l'app Wave (mobile) ou rediriger
  if (data.wave_launch_url) {
    window.location.href = data.wave_launch_url;
  }

  return data;
}

// ── Initier un paiement Orange Money ─────
export async function payerOrangeMoney(userId, telephone) {
  const res = await fetch(`${API_URL}/api/payment/orange/initiate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId, telephone }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Erreur Orange Money');

  if (data.payment_url) {
    window.location.href = data.payment_url;
  }

  return data;
}

// ── Vérifier le statut d'un paiement ─────
export async function verifierPaiement(reference) {
  const res  = await fetch(`${API_URL}/api/payment/status/${reference}`);
  const data = await res.json();
  return data;
}

// ── Polling automatique jusqu'à confirmation ──
export function attendreConfirmation(reference, onConfirme, onEchec, timeout = 300000) {
  const debut    = Date.now();
  const interval = setInterval(async () => {
    try {
      const paiement = await verifierPaiement(reference);

      if (paiement.statut === 'confirme') {
        clearInterval(interval);
        onConfirme(paiement);
        return;
      }

      if (Date.now() - debut > timeout) {
        clearInterval(interval);
        onEchec('Délai de paiement dépassé (5 minutes)');
      }
    } catch (err) {
      clearInterval(interval);
      onEchec(err.message);
    }
  }, 3000); // vérifier toutes les 3 secondes

  return () => clearInterval(interval); // retourne une fonction d'annulation
}

// ── S'inscrire et créer un compte PST ─────
export async function creerCompte({ nom, prenom, telephone, forfait }) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ nom, prenom, telephone, forfait }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Erreur création compte');
  return data;
}

// ── Récupérer le profil d'un abonné ──────
export async function getProfil(userId) {
  const res  = await fetch(`${API_URL}/api/users/${userId}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
