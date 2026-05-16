import re, base64, io
from PIL import Image, ImageDraw, ImageFont

# Recréer le logo ZA
size = 144
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Fond orange arrondi
def rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    draw.rectangle([x0+radius, y0, x1-radius, y1], fill=fill)
    draw.rectangle([x0, y0+radius, x1, y1-radius], fill=fill)
    draw.ellipse([x0, y0, x0+radius*2, y0+radius*2], fill=fill)
    draw.ellipse([x1-radius*2, y0, x1, y0+radius*2], fill=fill)
    draw.ellipse([x0, y1-radius*2, x0+radius*2, y1], fill=fill)
    draw.ellipse([x1-radius*2, y1-radius*2, x1, y1], fill=fill)

rounded_rect(draw, [0, 0, size-1, size-1], 28, '#FF6B00')

try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 58)
except:
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 58)
    except:
        font = ImageFont.load_default()

text = "ZA"
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
x = (size - tw) // 2 - bbox[0]
y = (size - th) // 2 - bbox[1]
draw.text((x, y), text, fill='white', font=font)

buf = io.BytesIO()
img.save(buf, format='PNG')
za_b64 = base64.b64encode(buf.getvalue()).decode()
ZA_IMG_SRC = f'data:image/png;base64,{za_b64}'

# Lire zama.html
with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remplacer login-logo par l'image PNG
NEW_LOGO = f'<div class="login-logo"><img src="{ZA_IMG_SRC}" width="72" height="72" style="border-radius:18px;display:block"></div>'
html = re.sub(
    r'<div class="login-logo">.*?</div>',
    NEW_LOGO,
    html, flags=re.DOTALL, count=1
)
print("OK - logo PNG injecté")

# 2. Tuer le Service Worker complètement dans le sw.js inline
# Chercher l'enregistrement SW et le désactiver temporairement
# pour forcer le rechargement du fichier
old_sw_reg = """if('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')"""

new_sw_reg = """if('serviceWorker' in navigator) {
  // Désinscrire tous les SW pour vider le cache
  navigator.serviceWorker.getRegistrations().then(function(regs){
    regs.forEach(function(r){ r.unregister(); });
  });
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js?v=' + Date.now())"""

html = html.replace(old_sw_reg, new_sw_reg)
print("OK - SW forcé à se réinscrire")

# 3. Ajouter meta no-cache dans le head
if 'no-cache' not in html:
    html = html.replace(
        '<meta charset="UTF-8">',
        '<meta charset="UTF-8">\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">'
    )
    print("OK - meta no-cache ajouté")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nFait! Maintenant:")
print("git add .")
print('git commit -m "ZAMA: logo ZA PNG pin + kill SW cache"')
print("git push")
