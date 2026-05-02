
with open('index.html', 'r', encoding='utf-8') as f:
    c = f.read()

with open('aida-widget.html', 'r', encoding='utf-8') as f:
    widget = f.read()

# Remove old widget if exists
if 'aida-fab' in c:
    print("Widget already exists - updating...")
    import re
    c = re.sub(r'<!-- AIDA FLOATING.*?<!-- FIN AIDA FLOATING CHAT -->', '', c, flags=re.DOTALL)

# Insert before </body>
if '</body>' in c:
    c = c.replace('</body>', widget + '</body>', 1)
    print("Widget added before </body>")
else:
    c += widget
    print("Widget appended at end")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("Done! aida-fab in file:", 'aida-fab' in c)
