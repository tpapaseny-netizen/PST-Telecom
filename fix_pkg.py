import json
with open("package.json", "r", encoding="utf-8") as f:
    pkg = json.load(f)
pkg["dependencies"]["bcryptjs"] = "^2.4.3"
with open("package.json", "w", encoding="utf-8") as f:
    json.dump(pkg, f, indent=2)
print("OK")
