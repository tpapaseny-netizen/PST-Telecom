const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

// Find the sidebar structure
const keywords = ['sidebar', 'menu', 'Paiements', 'Revenus', 'SMS', 'Appels', 'nav-item', '<li>', 'href='];
keywords.forEach(k => {
  const idx = content.indexOf(k);
  if (idx !== -1) {
    console.log('\n=== "'+k+'" trouvé ligne ~'+content.slice(0,idx).split('\n').length+' ===');
    console.log(content.slice(idx, idx+150).replace(/\n/g,' '));
  } else {
    console.log('Non trouvé: '+k);
  }
});
