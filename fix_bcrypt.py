SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Remplacer bcrypt.hash et bcrypt.compare dans nos routes par require('bcrypt')
import re

# Trouver notre bloc et remplacer bcrypt dedans
# On cherche dans le bloc SEN-SMS AUTH
start = content.find('// \u2550\u2550 SEN-SMS AUTH \u2550\u2550')
end = content.find('// \u2550\u2550 FIN SEN-SMS AUTH \u2550\u2550')

if start > 0 and end > 0:
    bloc = content[start:end]
    bloc = bloc.replace('await bcrypt.hash(', "await require('bcrypt').hash(")
    bloc = bloc.replace('await bcrypt.compare(', "await require('bcrypt').compare(")
    content = content[:start] + bloc + content[end:]
    print("bcrypt remplace par require('bcrypt') OK")
else:
    print("Bloc SEN-SMS AUTH non trouve")
    print("start:", start, "end:", end)

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)
