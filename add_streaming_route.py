with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

route = """
app.get('/streaming', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'streaming.html'));
});

"""

if '/streaming' not in c:
    c = c.replace('connectDB().then', route + 'connectDB().then', 1)
    print('Streaming route added!')
else:
    print('Route already exists')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done!')
