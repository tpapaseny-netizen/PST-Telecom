
with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

with open('aida-widget.html', 'r', encoding='utf-8') as f:
    widget = f.read()

import re
# Remove old widget
c = re.sub(r'<!-- AIDA FLOATING.*?<!-- FIN AIDA FLOATING CHAT -->', '', c, flags=re.DOTALL)

# Insert before </body>
c = c.replace('</body>', widget + '</body>', 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print("Done! Widget updated in index.html")
print("aida-fab in file:", 'aida-fab' in c)
