#!/usr/bin/env python3
# Mettre à jour la version du Service Worker pour forcer le rechargement

with open('sw.js', 'r', encoding='utf-8', errors='replace') as f:
    sw = f.read()

# Changer la version du cache
import re, time
new_version = 'zama-v' + str(int(time.time()))
sw = re.sub(r"const CACHE = 'zama-v\d+'", "const CACHE = '" + new_version + "'", sw)

with open('sw.js', 'w', encoding='utf-8') as f:
    f.write(sw)

print("SW version:", new_version)
print("✅ sw.js mis à jour")
