with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('facturation-agent.js', 'r', encoding='utf-8') as f:
    agent = f.read()

markers = ['connectDB().then', '// ─── DEMARRAGE', '// ─── DENARRAGE']
for m in markers:
    if m in c:
        c = c.replace(m, agent + '\n' + m, 1)
        print('Agent Facturation injecte avant:', m)
        break

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! File:', len(c), 'chars')
print('sendInvoice in file:', 'sendInvoice' in c)
print('api/factures in file:', 'api/factures' in c)
