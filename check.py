with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('/api/sen-sms/register')
print('Position register:', idx)
print()
print('--- Contexte autour de la route ---')
print(content[idx-400:idx+200])
print()

# Chercher aussi les anciens modeles mongoose SenSMS
print('--- Modeles Mongoose SenSMS ---')
for keyword in ['SenSmsUser', 'SenUser', 'sensms', 'SenSMS', 'mongoose.model']:
    positions = []
    start = 0
    while True:
        pos = content.find(keyword, start)
        if pos == -1:
            break
        line_num = content[:pos].count('\n') + 1
        positions.append((line_num, pos))
        start = pos + 1
    if positions:
        print(f'\n"{keyword}" trouve a {len(positions)} endroit(s):')
        for ln, pos in positions[:5]:
            print(f'  Ligne {ln}: {content[pos:pos+80].strip()}')
