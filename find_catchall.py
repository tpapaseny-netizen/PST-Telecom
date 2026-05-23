SERVER_PATH = r"C:\Users\NDCHEIKH\Desktop\PST-Telecom\server-at.js"

with open(SERVER_PATH, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lignes avec sendFile, catch-all, 404, app.use('/'):")
for i, l in enumerate(lines, 1):
    stripped = l.strip()
    if any(k in stripped for k in ['sendFile', "app.use('/')", 'app.get("/")', "app.get('*')", 'app.use("*")', '404', 'notFound']):
        print(f"  Ligne {i}: {stripped[:120]}")

print("\nLignes autour de sen-sms/register (3340-3360):")
for i in range(3339, 3360):
    if i < len(lines):
        print(f"  {i+1}: {lines[i].rstrip()[:120]}")
