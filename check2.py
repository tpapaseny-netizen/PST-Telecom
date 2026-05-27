with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Contexte autour de la ligne 3474
print('=== Lignes 3460-3520 ===')
for i in range(3459, min(3520, len(lines))):
    print(f'{i+1}: {lines[i].rstrip()}')
