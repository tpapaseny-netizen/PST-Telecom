with open('server-at.js', 'r', encoding='utf-8') as f:
    c = f.read()

print('nodemailer occurrences:', c.count("require('nodemailer')"))

# Remove the duplicate declaration in facturation-agent - use a different var name
c = c.replace(
    "const nodemailer = require('nodemailer');\n\n// Gmail transporter\nfunction getMailer() {\n  return nodemailer.createTransport({",
    "// Gmail transporter\nfunction getMailer() {\n  const nm = require('nodemailer');\n  return nm.createTransport({"
)

print('nodemailer occurrences after fix:', c.count("require('nodemailer')"))

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
