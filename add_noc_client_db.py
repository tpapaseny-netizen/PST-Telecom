with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('noc-client-db-routes.js', 'r', encoding='utf-8') as f:
    routes = f.read()

if 'noc_clients' not in c:
    markers = ['connectDB().then', '// ─── DEMARRAGE']
    for m in markers:
        if m in c:
            c = c.replace(m, routes + '\n' + m, 1)
            print('NOC client DB routes injected')
            break
else:
    print('Routes already exist')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! noc_clients in file:', 'noc_clients' in c)
