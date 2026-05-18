#!/usr/bin/env python3
# fix_zamasms_infobip.py
# Remplace le corps de zamaSendSMS pour utiliser Infobip au lieu d'Africa's Talking

FICHIER = 'server-at.js'

OLD = """async function zamaSendSMS(phone, message) {
  try {
    if (!AT_API_KEY || AT_API_KEY === 'sandbox') {
      console.log('[ZAMA SMS SANDBOX] To:', phone, '| Msg:', message);
      return { status: 'sandbox', phone, message };
    }
    const fetch = require('node-fetch');
    const params = new URLSearchParams({
      username: AT_USERNAME,
      to: phone,
      message: message,
      from: 'ZAMA'
    });
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'apiKey': AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });
    const data = await res.json();
    console.log('[ZAMA SMS]', JSON.stringify(data));
    return data;
  } catch(e) {
    console.error('[ZAMA SMS Error]', e.message);"""

NEW = """async function zamaSendSMS(phone, message) {
  // Utilise Infobip (remplace Africa's Talking)
  return envoyerSMSInfobip(phone, message);
  try {
    // Ancien code AT conservé pour référence (jamais exécuté)
    console.log('[ZAMA SMS LEGACY]', phone, message);"""

with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

if "Utilise Infobip (remplace Africa's Talking)" in contenu:
    print('[INFO] zamaSendSMS déjà migrée vers Infobip — ignorée.')
elif OLD in contenu:
    contenu = contenu.replace(OLD, NEW, 1)
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(contenu)
    print('[OK] zamaSendSMS redirigée vers Infobip')
    print('[OK] Tous les SMS ZAMA (OTP, épargne, tontine, retrait) passent maintenant par Infobip')
else:
    print('[WARN] Cible introuvable — vérifiez manuellement zamaSendSMS dans server-at.js')
