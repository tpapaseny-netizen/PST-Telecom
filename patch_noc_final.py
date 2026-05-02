import re, sys

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_count = content.count('/api/noc/cameras')
print(f'Anciennes occurrences /api/noc/cameras: {old_count}')

# Remove ALL existing NOC camera route blocks
# Pattern: from the NOC routes comment until the next major section or DEMARRAGE
patterns_to_remove = [
    r'// [=─]{3,}[\s\S]*?NOC[\s\S]*?// [=─]{3,}[\n\r]+(?:(?!// [=─]{3,}|connectDB|app\.listen).[\s\S])*',
    r'app\.(get|post|put|delete)\([\'\"]/api/noc/cameras[^)]*\)[^}]*\{[\s\S]*?\}\);?\n?',
    r'app\.(get|post|put|delete)\([\'\"]/api/noc/clients[^)]*\)[^}]*\{[\s\S]*?\}\);?\n?',
]

# Simple approach: find and remove NOC route blocks line by line
lines = content.split('\n')
new_lines = []
skip = False
skip_depth = 0
i = 0
while i < len(lines):
    line = lines[i]
    # Detect start of old NOC routes
    if ('NOC CENTER' in line or 'ROUTES NOC' in line) and ('===' in line or '───' in line or '═══' in line):
        # Skip until DEMARRAGE or end
        skip = True
        i += 1
        continue
    if skip:
        if '─── DEMARRAGE' in line or '─── DÉMARRAGE' in line or 'connectDB().then' in line:
            skip = False
            new_lines.append(line)
        i += 1
        continue
    new_lines.append(line)
    i += 1

content = '\n'.join(new_lines)

# Now inject clean routes before DEMARRAGE
with open('noc-routes-final.js', 'r', encoding='utf-8') as f:
    new_routes = f.read()

markers = ['// ─── DÉMARRAGE', '// ─── DEMARRAGE', 'connectDB().then(']
injected = False
for marker in markers:
    if marker in content and not injected:
        content = content.replace(marker, new_routes + '\n' + marker, 1)
        injected = True
        break

if not injected:
    content = content + '\n' + new_routes
    print('WARNING: injected at end')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

new_count = content.count('/api/noc/cameras')
print(f'Nouvelles occurrences /api/noc/cameras: {new_count}')
print('OK - server-at.js patche')
