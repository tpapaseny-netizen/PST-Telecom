with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Chercher "Topology is closed" ou tout middleware qui pourrait intercepter
print('=== Recherche Topology ===')
for i, l in enumerate(lines):
    if 'Topology' in l or 'topology' in l:
        print(f'{i+1}: {l.rstrip()}')

print()
print('=== Routes sen-sms dans server-at.js ===')
for i, l in enumerate(lines):
    if 'sen-sms' in l and ('app.' in l):
        print(f'{i+1}: {l.rstrip()}')

print()
print('=== Lignes autour de connectDB (3675-3690) ===')
for i in range(3670, min(3695, len(lines))):
    print(f'{i+1}: {lines[i].rstrip()}')
