
with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

before = c.count('/api/noc/cameras')
print(f"Avant: {before} occurrences /api/noc/cameras")

# Fix all instances of {cameras: []} and {cameras} responses in NOC routes
c = c.replace('if (!db) return res.json({ cameras: [] });', 'if (!db) return res.json([]);')
c = c.replace('res.json({ cameras });', 'res.json(cameras);')
c = c.replace('} catch(e) { res.json({ cameras: [] }); }', '} catch(e) { res.json([]); }')

after = c.count('cameras: []')
print(f"Apres: {after} occurrences cameras: []")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("DONE - server-at.js corrige")
