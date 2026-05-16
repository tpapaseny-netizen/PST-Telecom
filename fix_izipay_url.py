with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Corriger l'URL de base izichangePay
old = "const IZIPAY_BASE      = 'https://api.izichange.com';"
new = "const IZIPAY_BASE      = 'https://pay.izichange.com/api';"

if old in content:
    content = content.replace(old, new)
    print("OK - URL izichangePay corrigee")
else:
    print("Pattern non trouve, cherche variantes...")
    if 'api.izichange.com' in content:
        content = content.replace('https://api.izichange.com', 'https://pay.izichange.com/api')
        print("OK - URL corrigee via remplacement direct")
    else:
        print("ERREUR - URL non trouvee dans server-at.js")

# Aussi corriger la fonction createIziOrder pour utiliser le bon endpoint
# L'ancien endpoint etait /deposit/address
old2 = 'const resp = await fetch(IZIPAY_BASE + "/v1/orders"'
new2 = 'const resp = await fetch(IZIPAY_BASE + "/deposit/address"'

if old2 in content:
    content = content.replace(old2, new2)
    print("OK - endpoint /v1/orders -> /deposit/address")

old3 = 'const resp = await fetch(IZIPAY_BASE + "/v1/orders/" + izi_id'
new3 = 'const resp = await fetch(IZIPAY_BASE + "/transaction/" + izi_id'

if old3 in content:
    content = content.replace(old3, new3)
    print("OK - endpoint status corrige")

# Corriger le body de createIziOrder pour le format izichangePay
old_body = '''  const body = { currency: "USD", amount: String(parseFloat(amount_usd).toFixed(2)), coin: meta.coin, network: meta.network, external_id: order_id, callback_url };
  const resp = await fetch(IZIPAY_BASE + "/deposit/address", { method: "POST", headers: iziHeaders(), body: JSON.stringify(body) });'''

new_body = '''  const body = { currency: meta.coin + "." + meta.network.toLowerCase(), order_id: order_id, amount: parseFloat(amount_usd).toFixed(2), description: "ZAMA Transfer " + order_id, callback_url };
  const resp = await fetch(IZIPAY_BASE + "/deposit/address", { method: "POST", headers: iziHeaders(), body: JSON.stringify(body) });'''

if old_body in content:
    content = content.replace(old_body, new_body)
    print("OK - body createIziOrder corrige")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("server-at.js mis a jour!")
