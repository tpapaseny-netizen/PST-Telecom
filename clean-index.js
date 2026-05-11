const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// Find where the broken code starts - after </footer> or footer-bottom
// The JS is leaking outside script tags

// Remove everything after </html> that shouldn't be there
const htmlEnd = c.lastIndexOf('</html>');
if (htmlEnd !== -1) {
  c = c.slice(0, htmlEnd + 7);
}

// Now find and remove broken script content that's outside script tags
// Look for the pattern: script content appearing as text
const problematicStart = c.indexOf('+amt.toFixed(2)+');
if (problematicStart !== -1) {
  // This text is outside a script tag - find where this block starts
  // Go back to find the opening of this broken section
  let searchFrom = problematicStart - 2000;
  if (searchFrom < 0) searchFrom = 0;
  const chunk = c.slice(searchFrom, problematicStart + 5000);
  console.log('Found broken code at position:', problematicStart);
  
  // Find the last </script> before this broken code
  const lastScriptEnd = c.lastIndexOf('</script>', problematicStart);
  if (lastScriptEnd !== -1) {
    // Keep everything up to and including </script>, then add </body></html>
    c = c.slice(0, lastScriptEnd + 9) + '\n</body>\n</html>';
    console.log('Truncated at last </script> before broken code');
  }
}

// Also update the stats Wave -> Crypto
c = c.replace(
  '<div class="stat-num">Wave</div><div class="stat-label">Paiement mobile</div>',
  '<div class="stat-num" style="font-size:22px">Wave+Crypto</div><div class="stat-label">Paiement mobile</div>'
);

fs.writeFileSync('index.html', c, 'utf8');
console.log('Done - lines:', c.split('\n').length);
console.log('Has broken code:', c.includes('+amt.toFixed'));
console.log('Has </html>:', c.includes('</html>'));
