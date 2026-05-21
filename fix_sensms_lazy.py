with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """// === SENSMS ROUTES ===
var _sensmsSchema = new (require('mongoose').Schema)({
  phone: String, email: String, name: String, password: String,
  pack: { type: String, default: 'Starter' },
  credits: { type: Number, default: 0 },
  sender_id: { type: String, default: 'SenSMS' },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});
var SensmsUser = require('mongoose').models.SensmsUser || require('mongoose').model('SensmsUser', _sensmsSchema);"""

new = """// === SENSMS ROUTES ===
var SensmsUser = null;
function getSensmsUser() {
  if (!SensmsUser) {
    var mongoose = require('mongoose');
    var _sensmsSchema = new mongoose.Schema({
      phone: String, email: String, name: String, password: String,
      pack: { type: String, default: 'Starter' },
      credits: { type: Number, default: 0 },
      sender_id: { type: String, default: 'SenSMS' },
      active: { type: Boolean, default: true },
      created_at: { type: Date, default: Date.now }
    });
    SensmsUser = mongoose.models.SensmsUser || mongoose.model('SensmsUser', _sensmsSchema);
  }
  return SensmsUser;
}"""

if old in content:
    content = content.replace(old, new)
    print("✅ Schema remplacé par lazy init")
else:
    print("❌ Pattern exact non trouvé")
    # Afficher ce qui est à la ligne 3317
    lines = content.split('\n')
    print(f"Ligne 3317: {lines[3316]}")
    print(f"Ligne 3316: {lines[3315]}")
    print(f"Ligne 3318: {lines[3317]}")

# Remplacer les appels SensmsUser. par getSensmsUser(). dans les routes
import re
# Dans les routes async, remplacer "await SensmsUser." par "await getSensmsUser()."
# et "new SensmsUser(" par "new (getSensmsUser())("
content = re.sub(r'\bawait SensmsUser\.', 'await getSensmsUser().', content)
content = re.sub(r'\bnew SensmsUser\(', 'new (getSensmsUser())(', content)

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

import subprocess
r = subprocess.run(['Select-String', '-Path', 'server-at.js', '-Pattern', 'getSensmsUser|SensmsUser'], 
                   capture_output=True, text=True, shell=True)
print(r.stdout[:500])
print("Done")
