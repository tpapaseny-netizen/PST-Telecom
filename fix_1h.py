with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('sous 24h max', 'sous 1h max')
html = html.replace('sous 24h', 'sous 1h max')

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("OK - message mis à jour: sous 1h max")
