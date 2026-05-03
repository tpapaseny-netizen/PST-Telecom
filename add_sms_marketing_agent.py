with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('sms-marketing-agent.js', 'r', encoding='utf-8') as f:
    agent = f.read()

# Check if already exists
if 'lancerCampagneAuto' in c:
    print('Agent SMS Marketing already exists - skipping')
else:
    markers = ['connectDB().then', '// ─── DEMARRAGE', '// ─── DENARRAGE']
    for m in markers:
        if m in c:
            c = c.replace(m, agent + '\n' + m, 1)
            print('Agent SMS Marketing injecte avant:', m)
            break

    with open('server-at.js', 'w', encoding='utf-8') as f:
        f.write(c)

print('Done! lancerCampagneAuto in file:', 'lancerCampagneAuto' in c)
print('sms_campagnes in file:', 'sms_campagnes' in c)
