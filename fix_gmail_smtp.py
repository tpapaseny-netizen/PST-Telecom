with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix Gmail SMTP config - use port 465 with SSL instead of service:'gmail'
old = """function getMailer() {
  const nm = require('nodemailer');
  return nm.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'gwwjmwlgrigemvmd'
    }
  });
}"""

new = """function getMailer() {
  const nm = require('nodemailer');
  return nm.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'gwwjmwlgrigemvmd'
    },
    tls: { rejectUnauthorized: false }
  });
}"""

if old in c:
    c = c.replace(old, new)
    print('Gmail SMTP fixed')
else:
    print('Pattern not found - searching...')
    idx = c.find('function getMailer')
    print(repr(c[idx:idx+200]))

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
