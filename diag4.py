with open('zama.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total: {len(lines)} lignes")

print("\n=== LIGNE 1582 ===")
for i, line in enumerate(lines[1577:1588], start=1578):
    print(f"{i}: {repr(line[:150])}")

print("\n=== LIGNE 616 ===")
for i, line in enumerate(lines[611:622], start=612):
    print(f"{i}: {repr(line[:150])}")
