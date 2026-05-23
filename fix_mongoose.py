SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Supprimer la ligne problematique
old = "const mongoose_sms = require('mongoose');\n"
if old in content:
    content = content.replace(old, '', 1)
    print("mongoose_sms supprime OK")

# Remplacer mongoose_sms par mongoose partout
content = content.replace('mongoose_sms.Schema', 'mongoose.Schema')
content = content.replace('mongoose_sms.model', 'mongoose.model')
print("References mongoose_sms remplacees OK")

with open(SERVER_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done - server-at.js corrige")
