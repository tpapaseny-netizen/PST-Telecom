content = open('server-at.js', 'r', encoding='utf-8').read()

route = "\napp.get('/messager', (req, res) => {\n  res.sendFile(__dirname + '/messager.html');\n});\n\n"

marker = 'app.listen(PORT'
if marker in content:
    content = content.replace(marker, route + marker)
    open('server-at.js', 'w', encoding='utf-8').write(content)
    print('OK Route /messager ajoutee')
else:
    print('ERREUR marqueur non trouve')