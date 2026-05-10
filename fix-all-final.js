const fs = require('fs');

// The ONE line that keeps breaking - fix it everywhere
const FILES = [
  'index.html',
  'recharge.html', 
  'sms.html',
  'appel.html',
  'sms-marketing.html',
  'noc.html',
  'pst-trax.html'
];

FILES.forEach(function(f) {
  if (!fs.existsSync(f)) { console.log('Skip:', f); return; }
  let c = fs.readFileSync(f, 'utf8');
  
  // Fix the broken textContent line - multiple variants
  c = c.replace(/textContent='\s*\n?\s*<\/html>\s*\n?\s*\+amt\.toFixed\(2\)\+'\ USD'/g, "textContent='$'+amt.toFixed(2)+' USD'");
  c = c.replace(/textContent='\s*\n\s*<\/html>\s*\n\+amt\.toFixed\(2\)\+' USD'/g, "textContent='$'+amt.toFixed(2)+' USD'");
  c = c.replace(/\.textContent='\n<\/html>\n\+amt\.toFixed\(2\)\+' USD'/g, ".textContent='$'+amt.toFixed(2)+' USD'");
  
  // Nuclear: find any line with textContent=' followed by </html>
  c = c.replace(/\.textContent='[^']*\n[^']*<\/html>[^']*\n[^']*\+amt[^;]*/g, ".textContent='$'+amt.toFixed(2)+' USD'");
  
  fs.writeFileSync(f, c, 'utf8');
  
  // Verify
  if (c.includes('</html>\n+amt') || c.includes("textContent='\n")) {
    console.log('STILL BROKEN:', f);
  } else {
    console.log('OK:', f);
  }
});
