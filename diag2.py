with open('zama.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total: {len(lines)} lignes")

# Voir contexte ligne 1873
print("\n=== LIGNES 1868-1878 ===")
for i, line in enumerate(lines[1867:1878], start=1868):
    print(f"{i}: {repr(line[:120])}")

# Voir contexte ligne 585
print("\n=== LIGNES 580-590 ===")
for i, line in enumerate(lines[579:590], start=580):
    print(f"{i}: {repr(line[:120])}")
