content = open('server-at.js', 'r', encoding='utf-8').read()

# Fix the syntax error - apostrophe in French string
content = content.replace(
    "return res.status(400).json({ error: 'Ce nom d'utilisateur est déjà pris.' });",
    'return res.status(400).json({ error: "Ce nom utilisateur est deja pris." });'
)

# Also fix any other potential apostrophe issues in penc routes
content = content.replace(
    "return res.status(400).json({ error: 'Compte introuvable' });",
    'return res.status(400).json({ error: "Compte introuvable" });'
)
content = content.replace(
    "return res.status(400).json({ error: 'Mot de passe incorrect' });",
    'return res.status(400).json({ error: "Mot de passe incorrect" });'
)
content = content.replace(
    "return res.status(400).json({ error: 'Ce numéro est déjà associé à un compte. Connecte-toi.' });",
    'return res.status(400).json({ error: "Ce numero est deja associe a un compte. Connecte-toi." });'
)
content = content.replace(
    "return res.status(404).json({ error: 'Utilisateur introuvable' });",
    'return res.status(404).json({ error: "Utilisateur introuvable" });'
)

open('server-at.js', 'w', encoding='utf-8').write(content)
print('OK Syntax fix applied')
