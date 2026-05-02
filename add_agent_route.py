
with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('agent-route.js', 'r', encoding='utf-8') as f:
    route = f.read()

markers = ['// ─── DÉMARRAGE', '// ─── DEMARRAGE', 'connectDB().then(']
for m in markers:
    if m in c:
        c = c.replace(m, route + m, 1)
        print('Agent route injected before:', m)
        break

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done -', c.count('/agent'), 'agent routes')
