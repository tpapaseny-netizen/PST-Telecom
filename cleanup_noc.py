import re

with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Taille initiale: {len(content)} chars")
print(f"Occurrences /api/noc/cameras avant: {content.count('/api/noc/cameras')}")

# Remove ALL noc route blocks - any app.get/post/put/delete with /api/noc/
# Strategy: split into lines, skip lines that are part of old NOC blocks
lines = content.split('\n')
new_lines = []
skip_depth = 0
i = 0
in_noc_block = False

while i < len(lines):
    line = lines[i]
    
    # Detect start of NOC route section comment
    if ('NOC CENTER' in line or 'ROUTES NOC' in line or 'PST RTSP' in line.upper()) and any(c*3 in line for c in ['=','─','━']):
        in_noc_block = True
        i += 1
        continue
    
    # Detect individual NOC routes
    if not in_noc_block and re.match(r"^\s*app\.(get|post|put|delete)\s*\(\s*['"]\/api\/noc\/", line):
        # Skip this route block - count braces
        brace_count = line.count('{') - line.count('}')
        if brace_count <= 0 and ');' in line:
            # Single line route
            i += 1
            continue
        # Multi-line route - skip until balanced
        i += 1
        while i < len(lines) and brace_count > 0:
            brace_count += lines[i].count('{') - lines[i].count('}')
            i += 1
        # Skip the closing });
        continue
    
    # End of NOC block when we hit DEMARRAGE
    if in_noc_block:
        if '─── DEMARRAGE' in line or '─── DÉMARRAGE' in line or 'connectDB().then' in line:
            in_noc_block = False
            new_lines.append(line)
        i += 1
        continue
    
    new_lines.append(line)
    i += 1

content = '\n'.join(new_lines)
print(f"Occurrences /api/noc/cameras apres nettoyage: {content.count('/api/noc/cameras')}")

# Now inject clean routes before DEMARRAGE
with open('noc-routes-final.js', 'r', encoding='utf-8') as f:
    new_routes = f.read()

markers = ['// ─── DÉMARRAGE', '// ─── DEMARRAGE', 'connectDB().then(']
injected = False
for marker in markers:
    if marker in content and not injected:
        content = content.replace(marker, new_routes + '\n' + marker, 1)
        injected = True
        print(f"Routes injectees avant: {marker}")
        break

if not injected:
    content += '\n' + new_routes
    print('WARNING: appended at end')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Occurrences finales /api/noc/cameras: {content.count('/api/noc/cameras')}")
print(f"Taille finale: {len(content)} chars")
print("DONE")
