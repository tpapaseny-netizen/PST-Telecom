with open('zama.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total: {len(lines)} lignes")
print("\n=== LIGNES 2558-2570 ===")
for i, line in enumerate(lines[2557:2570], start=2558):
    print(f"{i}: {repr(line[:120])}")
