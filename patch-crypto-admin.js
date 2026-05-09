const fs = require('fs');

let content = fs.readFileSync('server-at.js', 'utf8');

const route = `
// ── Dashboard Crypto Admin ──
app.get('/crypto-admin', (req, res) => {
  res.sendFile(__dirname + '/crypto-dashboard.html');
});
`;

// Insert before connectDB
const marker = 'connectDB().then';
const idx = content.indexOf(marker);
if (idx !== -1) {
  const lineStart = content.lastIndexOf('\n', idx) + 1;
  content = content.slice(0, lineStart) + route + '\n' + content.slice(lineStart);
  fs.writeFileSync('server-at.js', content, 'utf8');
  console.log('OK - route /crypto-admin ajoutee');
} else {
  console.log('Marqueur non trouve');
}
