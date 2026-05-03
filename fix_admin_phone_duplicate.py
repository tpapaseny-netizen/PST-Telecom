with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

print('ADMIN_PHONE occurrences:', c.count("const ADMIN_PHONE"))

# Remove duplicate ADMIN_PHONE declarations - keep only the first one
# Replace all subsequent ones with a reference to the first
lines = c.split('\n')
found_first = False
new_lines = []
for line in lines:
    if 'const ADMIN_PHONE' in line:
        if not found_first:
            found_first = True
            new_lines.append(line)
        else:
            # Skip duplicate declaration
            print('Removed duplicate:', line.strip())
    else:
        new_lines.append(line)

c = '\n'.join(new_lines)
print('ADMIN_PHONE occurrences after fix:', c.count("const ADMIN_PHONE"))

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done!')
