import re
f = open('server-at.js', 'r', encoding='utf-8')
c = f.read()
f.close()
c = re.sub(r'mongodb\+srv://[^\'\"]+', 'mongodb+srv://tpaseny_db_user:PstMongo2026@cluster0.jozvjqr.mongodb.net/pst_telecom?appName=Cluster0', c)
f = open('server-at.js', 'w', encoding='utf-8')
f.write(c)
f.close()
print('OK - URI MongoDB mis a jour')