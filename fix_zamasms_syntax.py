#!/usr/bin/env python3
# fix_zamasms_syntax.py
# Corrige le SyntaxError: Missing catch or finally after try dans zamaSendSMS

FICHIER = 'server-at.js'

OLD = """async function zamaSendSMS(phone, message) {
  // Utilise Infobip (remplace Africa's Talking)
  return envoyerSMSInfobip(phone, message);
  try {
    // Ancien code AT conservé pour référence (jamais exécuté)
    console.log('[ZAMA SMS LEGACY]', phone, message);"""

NEW = """async function zamaSendSMS(phone, message) {
  // Utilise Infobip (remplace Africa's Talking)
  return envoyerSMSInfobip(phone, message);
}
async function zamaSendSMS_legacy(phone, message) {
  try {
    // Ancien code AT conservé pour référence (jamais exécuté)
    console.log('[ZAMA SMS LEGACY]', phone, message);"""

with open(FICHIER, 'r', encoding='utf-8') as f:
    contenu = f.read()

if 'zamaSendSMS_legacy' in contenu:
    print('[INFO] Correctif déjà appliqué — ignoré.')
elif OLD in contenu:
    contenu = contenu.replace(OLD, NEW, 1)
    with open(FICHIER, 'w', encoding='utf-8') as f:
        f.write(contenu)
    print('[OK] SyntaxError corrigé — zamaSendSMS fermée proprement')
else:
    print('[WARN] Cible introuvable — vérification manuelle nécessaire')
    idx = contenu.find('zamaSendSMS')
    print('zamaSendSMS trouvé à index:', idx)
    print('Extrait:', repr(contenu[idx:idx+200]))
