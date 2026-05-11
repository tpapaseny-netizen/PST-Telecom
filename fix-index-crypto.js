const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// Remove ALL old crypto widget code from index.html
// The widget in index.html is broken - remove it entirely
c = c.replace(/<!-- ={3,}.*?izichangePay[\s\S]*?<!-- ={3,} Fin izichangePay[\s\S]*?-->/g, '');
c = c.replace(/<!-- izichangePay Crypto Widget -->[\s\S]*?<!-- Fin izichangePay Widget -->/g, '');

// Remove any broken script that starts with crypto vars
c = c.replace(/<style>\s*\.izipay[\s\S]*?<\/style>/g, '');
c = c.replace(/<div id="izipay-overlay"[\s\S]*?<\/div>\s*\n<\/div>/g, '');
c = c.replace(/<script>\s*var _iziSvc[\s\S]*?<\/script>/g, '');

// Verify clean
const hasCrypto = c.includes('_iziSvc') || c.includes('izipay-overlay');
console.log('Crypto code removed:', !hasCrypto);

// index.html doesn't need crypto widget - it just links to service pages
// which each have their own crypto button

fs.writeFileSync('index.html', c, 'utf8');
console.log('index.html fixed, lines:', c.split('\n').length);
