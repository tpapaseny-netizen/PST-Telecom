with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

with open('noc-client-routes.js', 'r', encoding='utf-8') as f:
    routes = f.read()

# Inject before connectDB
if '/api/noc/cameras/client/' not in c:
    markers = ['connectDB().then', '// ─── DEMARRAGE']
    for m in markers:
        if m in c:
            c = c.replace(m, routes + '\n' + m, 1)
            print('NOC client routes injected before:', m)
            break
else:
    print('Routes already exist')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done!')
print('client route in file:', '/api/noc/cameras/client/' in c)
print('lien route in file:', '/api/noc/lien/' in c)
