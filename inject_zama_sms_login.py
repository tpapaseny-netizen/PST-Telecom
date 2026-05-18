#!/usr/bin/env python3
# inject_zama_sms_login.py
# Ajoute SMS de connexion ZAMA :
#   1. Route /api/zama/login-notify dans server-at.js
#   2. Appel silencieux dans doLogin() de zama.html

# ═══════════════════════════════════════════════════════════════
# PATCH 1 — server-at.js : ajouter route /api/zama/login-notify
# ═══════════════════════════════════════════════════════════════

SERVER_FILE = 'server-at.js'

LOGIN_ROUTE = r"""
// Route SMS notification de connexion ZAMA
app.post('/api/zama/login-notify', async(req, res) => {
  try {
    const { phone, prenom } = req.body;
    if (!phone) return res.json({ success: false });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const nm = prenom || 'Client';
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const msg = 'ZAMA: Connexion a votre compte detectee a ' + now + '. Si ce n\'est pas vous, changez votre mot de passe immediatement sur zama-sn.com';
    envoyerSMSInfobip(ph, msg).catch(function() {});
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});
"""

MARQUEUR_SERVER = '// ─── DÉMARRAGE'

with open(SERVER_FILE, 'r', encoding='utf-8') as f:
    server = f.read()

if '/api/zama/login-notify' in server:
    print('[INFO] Route login-notify déjà présente dans server-at.js — ignorée.')
else:
    if MARQUEUR_SERVER not in server:
        print('[ERREUR] Marqueur DÉMARRAGE introuvable dans server-at.js')
        exit(1)
    server = server.replace(MARQUEUR_SERVER, LOGIN_ROUTE + MARQUEUR_SERVER, 1)
    with open(SERVER_FILE, 'w', encoding='utf-8') as f:
        f.write(server)
    print('[OK] Route /api/zama/login-notify ajoutée dans server-at.js')

# ═══════════════════════════════════════════════════════════════
# PATCH 2 — zama.html : appel SMS dans doLogin() après succès
# ═══════════════════════════════════════════════════════════════

ZAMA_FILE = 'zama.html'

# Cible : juste avant le toast de bienvenue dans doLogin
OLD_LOGIN = '  toast("Bienvenue, "+(found.prenom||"Admin")+" !","ok");\n  goto("scr-home");\n}'

NEW_LOGIN = (
    '  // SMS notification de connexion (silencieux)\n'
    '  if(found.phone && !found.isAdmin){\n'
    '    try{\n'
    '      fetch(API+"/api/zama/login-notify",{\n'
    '        method:"POST",\n'
    '        headers:{"Content-Type":"application/json"},\n'
    '        body:JSON.stringify({phone:found.phone,prenom:found.prenom})\n'
    '      }).catch(function(){});\n'
    '    }catch(e){}\n'
    '  }\n'
    '  toast("Bienvenue, "+(found.prenom||"Admin")+" !","ok");\n'
    '  goto("scr-home");\n'
    '}'
)

with open(ZAMA_FILE, 'r', encoding='utf-8') as f:
    zama = f.read()

if '/api/zama/login-notify' in zama:
    print('[INFO] Patch doLogin déjà appliqué dans zama.html — ignoré.')
elif OLD_LOGIN in zama:
    zama = zama.replace(OLD_LOGIN, NEW_LOGIN, 1)
    with open(ZAMA_FILE, 'w', encoding='utf-8') as f:
        f.write(zama)
    print('[OK] SMS connexion branché dans doLogin() de zama.html')
else:
    print('[WARN] Cible doLogin introuvable dans zama.html — vérifiez manuellement.')

print()
print('[RÉSUMÉ] SMS ZAMA maintenant actifs :')
print('  ✓ Connexion compte   → SMS alerte sécurité au client')
print('  ✓ Création compte    → SMS bienvenue (inject_zama_sms_auto.py)')
print('  ✓ Commande créée     → SMS référence (inject_zama_sms_auto.py)')
print('  ✓ Paiement confirmé  → SMS montant FCFA (inject_zama_sms_auto.py)')
