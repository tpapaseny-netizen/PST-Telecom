with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print('=== Toutes les routes /api/sensms et /api/sen-sms ===')
for i, l in enumerate(lines):
    if '/api/sensms' in l or '/api/sen-sms' in l:
        if 'app.get' in l or 'app.post' in l or 'app.put' in l or 'app.delete' in l:
            print(f'{i+1}: {l.rstrip()}')

print()
print('=== Lignes 3460-3480 (getSensmsUser) ===')
for i in range(3459, min(3480, len(lines))):
    print(f'{i+1}: {lines[i].rstrip()}')
