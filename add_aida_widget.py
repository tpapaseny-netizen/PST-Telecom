
import re

with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

before = len(c)

# Remove ALL previous aida widget versions
c = re.sub(r'<!-- AIDA CHAT PST -->.*?<!-- FIN AIDA CHAT PST -->', '', c, flags=re.DOTALL)
c = re.sub(r'<!-- AIDA CHAT INTEGRE -->.*?<!-- FIN AIDA CHAT INTEGRE -->', '', c, flags=re.DOTALL)
c = re.sub(r'<!-- AIDA FLOATING CHAT BUTTON -->.*?<!-- FIN AIDA FLOATING CHAT -->', '', c, flags=re.DOTALL)
c = re.sub(r'<!-- AIDA FLOATING CHAT -->.*?<!-- FIN AIDA FLOATING CHAT -->', '', c, flags=re.DOTALL)

# Add new widget before </body>
with open('aida-widget.html', 'r', encoding='utf-8') as f:
    widget = f.read()

c = c.replace('</body>', widget + '</body>', 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Before:', before, 'After:', len(c))
print('aida-tip in file:', 'aida-tip' in c)
print('aida-fab in file:', 'aida-fab' in c)
print('Tooltip count:', c.count('aida-tip'))
