#!/usr/bin/env python3
# inject_infobip_zama.py
# Injecte l'intégration Infobip SMS dans server-at.js (avant // ─── DÉMARRAGE)

import re

FICHIER = 'server-at.js'

CODE = r"""
// ─── INFOBIP SMS (ZAMA) ────────────────────────────────────────────────────
const INFOBIP_API_KEY = '82f55c5a73cf3a3c923756bc9ec4f48c-cbe3b9d4-9fa5-45f2-b130-19c3513c6f74';
const INFOBIP_BASE_URL = 'https://y42xy1.api.infobip.com';
const INFOBIP_SENDER  = 'ZAMA';

async function envoyerSMSInfobip(telephone, message) {
  try {
    const response = await fetch(INFOBIP_BASE_URL + '/sms/2/text/advanced', {
      method: 'POST',
      headers: {
        'Authorization': 'App ' + INFOBIP_API_KEY,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      },
      body: JSON.stringify({
        messages: [{
          from: INFOBIP_SENDER,
          destinations: [{ to: telephone }],
          text: message
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[Infobip] Erreur HTTP ' + response.status + ':', JSON.stringify(data));
      return { success: false, error: data };
    }
    const status = data.messages && data.messages[0] ? data.messages[0].status : {};
    console.log('[Infobip] SMS envoyé à ' + telephone + ' | Status: ' + (status.name || 'OK'));
    return { success: true, data };
  } catch (err) {
    console.error('[Infobip] Exception:', err.message);
    return { success: false, error: err.message };
  }
}

// Route test SMS Infobip (admin uniquement)
app.post('/api/infobip/test-sms', async (req, res) => {
  const { telephone, message, token } = req.body;
  if (token !== 'pst-admin-2026') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  if (!telephone || !message) {
    return res.status(400).json({ error: 'telephone et message requis' });
  }
  const result = await envoyerSMSInfobip(telephone, message);
  res.json(result);
});

// Route SMS ZAMA — confirmation de transaction
app.post('/api/zama/sms-confirmation', async (req, res) => {
  const { telephone, montant, devise_source, devise_cible, reference } = req.body;
  if (!telephone || !montant || !devise_source || !devise_cible || !reference) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }
  const msg = 'ZAMA: Votre echange de ' + montant + ' ' + devise_source
            + ' vers ' + devise_cible
            + ' (Ref: ' + reference + ') est confirme. Merci de votre confiance.';
  const result = await envoyerSMSInfobip(telephone, msg);
  res.json(result);
});

// Route SMS ZAMA — OTP / code de verification
app.post('/api/zama/sms-otp', async (req, res) => {
  const { telephone, code } = req.body;
  if (!telephone || !code) {
    return res.status(400).json({ error: 'telephone et code requis' });
  }
  const msg = 'ZAMA: Votre code de verification est ' + code
            + '. Valable 10 minutes. Ne le partagez jamais.';
  const result = await envoyerSMSInfobip(telephone, msg);
  res.json(result);
});
// ─── FIN INFOBIP SMS ────────────────────────────────────────────────────────

"""

MARQUEUR = '// ─── DÉMARRAGE'

with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

if '// ─── INFOBIP SMS (ZAMA)' in contenu:
    print('[INFO] Bloc Infobip déjà présent — injection ignorée.')
else:
    if MARQUEUR not in contenu:
        print('[ERREUR] Marqueur "' + MARQUEUR + '" introuvable dans server-at.js')
        exit(1)
    nouveau = contenu.replace(MARQUEUR, CODE + MARQUEUR, 1)
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(nouveau)
    print('[OK] Bloc Infobip SMS injecté avec succès dans server-at.js')
    print('[OK] Routes créées:')
    print('     POST /api/infobip/test-sms        (test admin)')
    print('     POST /api/zama/sms-confirmation   (confirmation transaction)')
    print('     POST /api/zama/sms-otp            (code OTP)')
