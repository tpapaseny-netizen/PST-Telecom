with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Trouver la route complète
start = content.find("app.post('/api/sen-sms/send'")
end = content.find('\n});', start) + 4
old_route = content[start:end]
print(f"Route trouvée: {len(old_route)} chars")
print("Début:", old_route[:100])

new_route = """app.post('/api/sen-sms/send', async (req, res) => {
  try {
    var messages = req.body.messages || [];
    var sender = req.body.sender || 'SenSMS';
    var campagne = req.body.campagne || 'Campagne';
    if (!messages.length) return res.json({ success: false, error: 'Aucun message' });

    var TECHSOFT_TOKEN = process.env.TECHSOFT_TOKEN || '1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823';
    var results = [];
    var errors = 0;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      try {
        var url = 'https://app.techsoft-sms.com/api/http/' +
          '?token=' + encodeURIComponent(TECHSOFT_TOKEN) +
          '&to=' + encodeURIComponent(msg.telephone) +
          '&message=' + encodeURIComponent(msg.message) +
          '&sender_id=' + encodeURIComponent(sender.substring(0, 11));
        var r = await fetch(url);
        var txt = await r.text();
        results.push({ telephone: msg.telephone, status: txt });
        if (txt.includes('ERROR') || txt.includes('error')) errors++;
      } catch(e) {
        errors++;
        results.push({ telephone: msg.telephone, status: 'error: ' + e.message });
      }
    }

    res.json({
      success: true,
      sent: messages.length - errors,
      errors: errors,
      total: messages.length,
      results: results.slice(0, 10)
    });
  } catch(e) {
    console.error('SEN-SMS send error:', e);
    res.json({ success: false, error: e.message });
  }
});"""

if old_route in content:
    content = content.replace(old_route, new_route)
    print("✅ Route migrée vers Techsoft")
else:
    print("❌ Route exacte non trouvée")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

import subprocess
r = subprocess.run(['Select-String', '-Path', 'server-at.js', '-Pattern', 'sen-sms/send'],
                   capture_output=True, text=True, shell=True)
print(r.stdout)
print("Done")
