with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

import re

ZAMA_SVG_PIN = '<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="16" fill="#FF6B00"/><text x="32" y="44" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="26" fill="white" letter-spacing="-1">ZA</text></svg>'

# Remplacer tout ce qui est dans login-logo
html = re.sub(
    r'<div class="login-logo">.*?</div>',
    f'<div class="login-logo">{ZAMA_SVG_PIN}</div>',
    html, flags=re.DOTALL, count=1
)
print("OK - logo PIN remplacé par ZA orange")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Done!")
