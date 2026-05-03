with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('recharge-agent.js', 'r', encoding='utf-8') as f:
    agent = f.read()

if 'traiterRecharge' in c:
    print('Agent Recharge already exists - skipping')
else:
    markers = ['connectDB().then', '// ─── DEMARRAGE']
    for m in markers:
        if m in c:
            c = c.replace(m, agent + '\n' + m, 1)
            print('Agent Recharge injecte avant:', m)
            break

    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(c)

print('Done! traiterRecharge in file:', 'traiterRecharge' in c)
print('api/recharge in file:', 'api/recharge' in c)
