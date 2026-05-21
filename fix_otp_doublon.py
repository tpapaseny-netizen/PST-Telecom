with open("server-at.js", "r", encoding="utf-8") as f:
    content = f.read()

# Supprimer l'ancienne route send-otp (ligne 2221)
old = """app.post('/api/zama/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numero requis' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = Date.now() + 10 * 60 * 1000;
    zamaOtpStore[ph] = { code, expireAt };
    const msg = 'ZAMA: Votre code de connexion est ' + code + '. Valable 10 minutes. Ne le partagez jamais.';
    await envoyerSMSInfobip(ph, msg);
    console.log('[ZAMA OTP] Code envoye a ' + ph);
    res.json({ ok: true, message: 'Code OTP envoye' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});"""

if old in content:
    content = content.replace(old, "// [ancienne route send-otp supprimee — voir ligne 3095]")
    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: ancienne route supprimee")
else:
    # Chercher une variante
    import re
    matches = list(re.finditer(r"app\.post\('/api/zama/send-otp'", content))
    print(f"Occurrences trouvees: {len(matches)}")
    for m in matches:
        line = content[:m.start()].count('\n') + 1
        print(f"Ligne {line}: {content[m.start():m.start()+200]}")
