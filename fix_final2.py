with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remplacer TOUS les \' par ' dans tout le fichier
original_len = len(html)
html = html.replace("\\'", "'")
print(f"Remplacements effectues: {original_len - len(html.replace(chr(39), ''))} apostrophes liberees")

# Verifier qu'il ne reste plus de backslash-apostrophe
count = html.count("\\'")
print(f"Backslash-apostrophes restants: {count}")

# Verifier lignes 614-620
lines = html.split('\n')
print("\n=== LIGNES 614-620 apres fix ===")
for i, line in enumerate(lines[613:620], start=614):
    print(f"{i}: {repr(line[:120])}")

# Verifier ligne 1582
print("\n=== LIGNES 1578-1588 apres fix ===")
for i, line in enumerate(lines[1577:1588], start=1578):
    print(f"{i}: {repr(line[:120])}")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nTermine!")
