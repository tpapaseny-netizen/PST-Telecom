with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Remplacer la route /api/zama/create pour retourner directement le POS URL
# sans passer par l'API izichangePay qui est bloquee par whitelist
old = '''  let paymentUrl=null; try{const pd=await generateIziPayUrl({amount:amtUSD,orderId,senderName:sender_name||"Client",senderEmail:sender_email||""}); paymentUrl=pd?.url||pd?.data?.url||null;}catch(e){console.log("iziPay err:",e.message);}'''

new = '''  const IZIPAY_POS_URL = "https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402";
  let paymentUrl = IZIPAY_POS_URL + "?memo=ZAMA-" + orderId + "&amount=" + amtUSD;
  console.log("[ZAMA] POS URL generee:", paymentUrl);'''

if old in content:
    content = content.replace(old, new)
    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: route /api/zama/create fixee avec POS URL direct")
else:
    print("ERREUR: chaine non trouvee")
