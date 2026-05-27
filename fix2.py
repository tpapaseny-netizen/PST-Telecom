f = open('server-at.js', 'r', encoding='utf-8')
lines = f.readlines()
f.close()

fixed = 0
for i, line in enumerate(lines):
    if 'AFRIVOTE_PASS' in line and 'autorise' in line.lower():
        print(f"Ligne {i+1} avant: {repr(line[:100])}")
        lines[i] = "  if(adminPass !== AFRIVOTE_PASS) return res.status(403).json({success:false,message:'Non autorise'});\n"
        print(f"Ligne {i+1} apres: {repr(lines[i][:100])}")
        fixed += 1

f = open('server-at.js', 'w', encoding='utf-8')
f.writelines(lines)
f.close()
print(f"OK - {fixed} ligne(s) corrigee(s)")
