with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = "app.use(cors({ origin: ['https://www.sensms.com', 'https://sensms.com', 'https://zama-sn.com', 'https://www.zama-sn.com', 'https://pst-telecom.vercel.app', 'https://sensms.com', 'https://www.sensms.com'], credentials: true }));"

new = "app.use(cors({ origin: ['https://www.sensms.com', 'https://sensms.com', 'https://zama-sn.com', 'https://www.zama-sn.com', 'https://pst-telecom.vercel.app'], credentials: true }));"

if old in content:
    content = content.replace(old, new)
    print("✅ Doublons supprimés")
else:
    print("❌ Pattern exact non trouvé — pas de modification")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

import subprocess
r = subprocess.run(['findstr', '/n', 'cors', 'server-at.js'], capture_output=True, text=True)
print(r.stdout[:300])
