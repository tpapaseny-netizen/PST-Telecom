with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace Gmail SMTP with Brevo SMTP (works from Railway)
old = """function getMailer() {
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

new = """function getMailer() {
  const nm = require('nodemailer');
  // Use Brevo SMTP if available, fallback to Gmail
  if (process.env.BREVO_SMTP_KEY) {
    return nm.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_SMTP_LOGIN || process.env.GMAIL_USER,
        pass: process.env.BREVO_SMTP_KEY
      }
    });
  }
  // Gmail fallback
  return nm.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'gwwjmwlgrigemvmd'
    },
    tls: { rejectUnauthorized: false }
  });
}"""

if old in c:
    c = c.replace(old, new)
    print('Brevo SMTP configured')
else:
    print('Pattern not found')

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
