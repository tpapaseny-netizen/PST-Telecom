with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

fixes = 0

# 1. S'assurer que pay-tab-wave est display:flex et pay-tab-crypto est display:none au départ
old1 = 'id="pay-tab-wave" style="position:absolute;inset:0;display:flex'
new1 = 'id="pay-tab-wave" style="position:absolute;inset:0;display:flex'
# Chercher et forcer pay-tab-crypto à none au départ
if 'id="pay-tab-crypto" style="position:absolute;inset:0;display:none' not in html:
    html = html.replace(
        'id="pay-tab-crypto" style="position:absolute;inset:0;display:flex',
        'id="pay-tab-crypto" style="position:absolute;inset:0;display:none'
    )
    print("OK - pay-tab-crypto force a none au départ")
    fixes += 1
else:
    print("pay-tab-crypto deja a none")

# 2. Fixer showIframeLoading pour qu'il mette wave par défaut
old2 = """function showIframeLoading(){
  var ct=document.getElementById("pay-tab-crypto");
  if(ct){ct.style.display="flex";ct.style.flexDirection="column";}
  document.getElementById("iframe-loading").style.display="block";
  document.getElementById("iframe-wrap").style.display="none";
  document.getElementById("iframe-fallback").style.display="none";
}"""

new2 = """function showIframeLoading(){
  // Par defaut montrer Wave, pas Crypto
  showPayTab("wave");
  var il = document.getElementById("iframe-loading");
  var iw = document.getElementById("iframe-wrap");
  var iF = document.getElementById("iframe-fallback");
  var s1 = document.getElementById("crypto-step1");
  var s2 = document.getElementById("crypto-step2");
  var s3 = document.getElementById("crypto-step3");
  if(il) il.style.display="none";
  if(iw) iw.style.display="none";
  if(iF) iF.style.display="none";
  if(s1) s1.style.display="block";
  if(s2) s2.style.display="none";
  if(s3) s3.style.display="none";
  var iframe=document.getElementById("izi-iframe");
  if(iframe) iframe.src="";
}"""

if old2 in html:
    html = html.replace(old2, new2)
    print("OK - showIframeLoading corrige")
    fixes += 1
else:
    print("showIframeLoading pattern non trouve")

# 3. Fixer le timer - le mettre dans le panel wave seulement, pas en dehors
# Le timer est actuellement en dehors des panels, il masque tout
# Réduire son padding pour qu'il ne masque pas le bouton
html = html.replace(
    'class="pay-timer" id="p-timer" style="margin:0;padding:5px 0"',
    'class="pay-timer" id="p-timer" style="margin:0;padding:3px 0;font-size:11px"'
)

# 4. Ajouter id="check-btn" si absent
if 'id="check-btn"' not in html:
    html = html.replace(
        'onclick="checkPay()">J\'ai payé — Vérifier',
        'id="check-btn" onclick="checkPay()">✅ J\'ai payé — Vérifier'
    )
    print("OK - check-btn id ajoute")
    fixes += 1

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f"\n{fixes} corrections appliquees. Termine!")
