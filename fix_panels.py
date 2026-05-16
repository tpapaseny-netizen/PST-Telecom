with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Le problème: panel-wave et pay-tab-crypto s'affichent en même temps
# showIframeLoading() doit cacher pay-tab-crypto et montrer pay-tab-wave

# Corriger showIframeLoading pour qu'il cache le panel crypto
old = """function showIframeLoading(){
  // Par defaut montrer Wave, pas Crypto
  showPayTab("wave");"""

new = """function showIframeLoading(){
  // Cacher crypto, montrer Wave par defaut
  var pw = document.getElementById('pay-tab-wave');
  var pc = document.getElementById('pay-tab-crypto');
  if(pw){pw.style.display='flex';pw.style.flexDirection='column';}
  if(pc){pc.style.display='none';}
  showPayTab("wave");"""

if old in html:
    html = html.replace(old, new)
    print("OK - showIframeLoading corrige")
else:
    # Chercher et remplacer la fonction entière
    import re
    pattern = r'function showIframeLoading\(\)\{[^}]+\}'
    match = re.search(pattern, html, re.DOTALL)
    if match:
        new_fn = """function showIframeLoading(){
  var pw=document.getElementById('pay-tab-wave');
  var pc=document.getElementById('pay-tab-crypto');
  if(pw){pw.style.display='flex';pw.style.flexDirection='column';}
  if(pc)pc.style.display='none';
  var s1=document.getElementById('crypto-step1');
  var s2=document.getElementById('crypto-step2');
  var s3=document.getElementById('crypto-step3');
  if(s1)s1.style.display='block';
  if(s2)s2.style.display='none';
  if(s3)s3.style.display='none';
  var iframe=document.getElementById('izi-iframe');
  if(iframe)iframe.src='';
  // Switcher sur Wave
  var bw=document.getElementById('tab-wave-btn');
  var bc=document.getElementById('tab-crypto-btn');
  if(bw){bw.style.color='var(--blue)';bw.style.borderBottom='2px solid var(--blue)';}
  if(bc){bc.style.color='var(--text3)';bc.style.borderBottom='2px solid transparent';}
}"""
        html = html[:match.start()] + new_fn + html[match.end():]
        print("OK - showIframeLoading remplacee via regex")
    else:
        print("Pattern non trouve")

# Aussi s'assurer que pay-tab-crypto est hidden par défaut dans le HTML
html = html.replace(
    'id="pay-tab-crypto" style="position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden"',
    'id="pay-tab-crypto" style="position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden"'
)
html = html.replace(
    'id="pay-tab-crypto" style="position:absolute;inset:0;display:flex',
    'id="pay-tab-crypto" style="position:absolute;inset:0;display:none'
)
print("OK - pay-tab-crypto cache par defaut")

# Aussi verifier pay-tab-wave est visible par défaut
if 'id="pay-tab-wave" style="position:absolute;inset:0;display:none' in html:
    html = html.replace(
        'id="pay-tab-wave" style="position:absolute;inset:0;display:none',
        'id="pay-tab-wave" style="position:absolute;inset:0;display:flex'
    )
    print("OK - pay-tab-wave visible par defaut")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Termine!")
