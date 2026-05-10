const fs = require('fs');
let content = fs.readFileSync('recharge.html', 'utf8');

console.log('Taille fichier:', content.length, 'chars,', content.split('\n').length, 'lignes');

// Show last 50 lines
const lines = content.split('\n');
console.log('\n=== 30 dernieres lignes ===');
lines.slice(-30).forEach((l, i) => {
  console.log((lines.length - 30 + i + 1) + ': ' + l.substring(0, 100));
});

// Show first script tag with izi
const iziIdx = content.indexOf('_IS=');
if (iziIdx !== -1) {
  const lineNum = content.slice(0, iziIdx).split('\n').length;
  console.log('\nScript izi trouve a la ligne:', lineNum);
  console.log(content.slice(iziIdx, iziIdx + 200));
}
