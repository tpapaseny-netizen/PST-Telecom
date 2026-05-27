#!/usr/bin/env python3
# fix_topology_sensms.py
# Corrige l'erreur "Topology is closed" dans les routes SenSMS
# En ajoutant une vérification du bin avant chaque appel jbGet/jbSet

FILE = "server-at.js"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Le vrai problème : jbGet essaie fetch() mais quelque chose dans
# le contexte mongoose plante. On va ajouter un timeout et un 
# meilleur error handling dans jbGet/jbSet

OLD_JBGet = '''async function jbGet(binId) {
  if (!binId) return null;
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_MASTER_KEY }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.record;
  } catch(e) { return null; }
}'''

NEW_JBGet = '''async function jbGet(binId) {
  if (!binId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
      headers: { "X-Master-Key": JSONBIN_MASTER_KEY },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) { console.error("jbGet error:", res.status, binId); return null; }
    const data = await res.json();
    return data.record;
  } catch(e) {
    console.error("jbGet exception:", e.message, "binId:", binId);
    return null;
  }
}'''

OLD_JBSet = '''async function jbSet(binId, record) {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(record)
    });
    return res.ok;
  } catch(e) { return false; }
}'''

NEW_JBSet = '''async function jbSet(binId, record) {
  if (!binId) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(record),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) console.error("jbSet error:", res.status, binId);
    return res.ok;
  } catch(e) {
    console.error("jbSet exception:", e.message, "binId:", binId);
    return false;
  }
}'''

# Aussi corriger le register pour logger l'erreur exacte
OLD_REGISTER_CATCH = '''  } catch(e) {
    console.error("SenSMS register error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// Connexion SenSMS'''

NEW_REGISTER_CATCH = '''  } catch(e) {
    console.error("SenSMS register error:", e.message, e.stack);
    res.json({ success: false, error: "Erreur serveur: " + e.message });
  }
});

// Connexion SenSMS'''

OLD_LOGIN_CATCH = '''  } catch(e) {
    console.error("SenSMS login error:", e);
    res.json({ success: false, error: "Erreur serveur" });
  }
});

// Profil SenSMS'''

NEW_LOGIN_CATCH = '''  } catch(e) {
    console.error("SenSMS login error:", e.message, e.stack);
    res.json({ success: false, error: "Erreur serveur: " + e.message });
  }
});

// Profil SenSMS'''

changed = False

if OLD_JBGet in content:
    content = content.replace(OLD_JBGet, NEW_JBGet, 1)
    print("✅ jbGet amélioré avec timeout + meilleur logging")
    changed = True
else:
    print("⚠️  jbGet pattern non trouvé")

if OLD_JBSet in content:
    content = content.replace(OLD_JBSet, NEW_JBSet, 1)
    print("✅ jbSet amélioré avec timeout + meilleur logging")
    changed = True
else:
    print("⚠️  jbSet pattern non trouvé")

if OLD_REGISTER_CATCH in content:
    content = content.replace(OLD_REGISTER_CATCH, NEW_REGISTER_CATCH, 1)
    print("✅ Register catch amélioré")
    changed = True
else:
    print("⚠️  Register catch pattern non trouvé")

if OLD_LOGIN_CATCH in content:
    content = content.replace(OLD_LOGIN_CATCH, NEW_LOGIN_CATCH, 1)
    print("✅ Login catch amélioré")
    changed = True
else:
    print("⚠️  Login catch pattern non trouvé")

if changed:
    import shutil
    shutil.copy(FILE, FILE + ".backup_topology_fix")
    with open(FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print()
    print("✅ server-at.js corrigé !")
    print()
    print("Maintenant :")
    print("  git add .")
    print('  git commit -m "fix: JSONBin timeout + logging erreur SenSMS"')
    print("  git push")
else:
    print("❌ Aucune modification - patterns non trouvés")
    print("Essayons de voir le contenu des fonctions jbGet/jbSet actuelles:")
    idx = content.find("async function jbGet")
    if idx != -1:
        print(content[idx:idx+300])
