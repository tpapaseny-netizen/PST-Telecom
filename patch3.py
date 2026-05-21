import re
with open("server-at.js","r",encoding="utf-8") as f:
    c=f.read()
c=c.replace("?memo=ZAMA-\" + orderId","?memo=\" + orderId")
c=c.replace("memo: \"ZAMA-\" + orderId","memo: orderId")
with open("server-at.js","w",encoding="utf-8") as f:
    f.write(c)
with open("public/zama.html","r",encoding="utf-8") as f:
    h=f.read()
h=h.replace("var fullUrl = posUrl;","var fullUrl = posUrl + '?memo=' + orderId + '&amount=' + amtCrypto + '&coin=' + (cK || 'usdt.trc20');")
with open("public/zama.html","w",encoding="utf-8") as f:
    f.write(h)
print("OK")
