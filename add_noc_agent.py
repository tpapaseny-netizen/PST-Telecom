
with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('noc-agent-route.js', 'r', encoding='utf-8') as f:
    agent = f.read()

# 1. Inject routes before connectDB
markers = ['connectDB().then', '// ─── DEMARRAGE', '// ─── DENARRAGE']
for m in markers:
    if m in c:
        c = c.replace(m, agent + '\n' + m, 1)
        print('Agent NOC routes injected before:', m)
        break

# 2. Call startNocAgent() inside connectDB block
# Find the app.listen line and add startNocAgent before it
old_listen = "app.listen(PORT, () => {"
new_listen = "startNocAgent();\n  app.listen(PORT, () => {"
if old_listen in c:
    c = c.replace(old_listen, new_listen, 1)
    print('startNocAgent() call added')
else:
    print('WARNING: app.listen not found')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! File:', len(c), 'chars')
print('startNocAgent in file:', 'startNocAgent' in c)
print('noc_alerts in file:', 'noc_alerts' in c)
