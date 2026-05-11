const fs = require('fs');

// Fix pst-trax.html - the crypto modal div is inside <head> instead of <body>
function fixTrax() {
  let c = fs.readFileSync('pst-trax.html', 'utf8');
  
  // The problem: <style> block + <div id="izm"> is placed before </head>
  // but after the opening <style> tag from the head
  // Remove the crypto code that's in the wrong place (before <body>)
  
  // Find </head> and check what's between last </style> in head and </head>
  const headEnd = c.indexOf('</head>');
  if (headEnd === -1) { console.log('No </head> found'); return; }
  
  // Extract head content
  const headContent = c.slice(0, headEnd);
  const bodyContent = c.slice(headEnd);
  
  // Check if crypto modal div is in head
  if (headContent.includes('<div id="izm">')) {
    console.log('Found crypto div in head - moving to body');
    
    // Find where the crypto section starts in head (the style block before the div)
    // It starts with #izm style
    const cryptoStyleStart = headContent.indexOf('\n#izm{');
    if (cryptoStyleStart !== -1) {
      // Find the opening <style> before this
      const styleStart = headContent.lastIndexOf('<style>', cryptoStyleStart);
      // Extract everything from styleStart to end of headContent
      const cryptoBlock = headContent.slice(styleStart);
      // Clean head
      const cleanHead = headContent.slice(0, styleStart);
      
      // Find </body> in body content to insert before it
      const bodyEnd = bodyContent.lastIndexOf('</body>');
      const cleanBody = bodyContent.slice(0, bodyEnd) + '\n' + cryptoBlock + '\n' + bodyContent.slice(bodyEnd);
      
      c = cleanHead + '</head>' + cleanBody;
      console.log('Fixed: crypto moved from head to body');
    }
  } else {
    console.log('pst-trax.html head looks OK');
  }
  
  fs.writeFileSync('pst-trax.html', c, 'utf8');
  console.log('pst-trax.html saved -', c.split('\n').length, 'lines');
}

// Fix index.html - remove all broken crypto code
function fixIndex() {
  let c = fs.readFileSync('index.html', 'utf8');
  
  // Find the last clean </script> before any broken code
  // The broken code appears after the AIDA chat script
  const aidaEnd = c.indexOf('<!-- FIN AIDA CHAT PST -->');
  if (aidaEnd !== -1) {
    // Keep everything up to end of AIDA, then close cleanly
    const afterAida = c.slice(aidaEnd + '<!-- FIN AIDA CHAT PST -->'.length);
    // Remove everything crypto related after AIDA
    c = c.slice(0, aidaEnd + '<!-- FIN AIDA CHAT PST -->'.length) + '\n\n</body>\n</html>';
    console.log('index.html: removed everything after AIDA chat');
  } else {
    // Find footer-bottom and keep until after it
    const footerBottom = c.indexOf('class="footer-bottom"');
    if (footerBottom !== -1) {
      const afterFooter = c.indexOf('</div>', c.indexOf('</div>', footerBottom) + 6) + 6;
      // Find the main scripts
      const toastDiv = c.indexOf('<div class="toast"');
      if (toastDiv !== -1) {
        const afterToast = c.indexOf('</div>', toastDiv) + 6;
        // Find the main script end
        const mainScriptEnd = c.indexOf('</script>', afterToast) + 9;
        c = c.slice(0, mainScriptEnd) + '\n\n</body>\n</html>';
        console.log('index.html: truncated after main script');
      }
    }
  }
  
  fs.writeFileSync('index.html', c, 'utf8');
  console.log('index.html saved -', c.split('\n').length, 'lines');
  console.log('Has broken code:', c.includes('+amt.toFixed'));
}

fixTrax();
fixIndex();
console.log('\ngit add pst-trax.html index.html && git commit -m "Fix head/body crypto placement" && git push');
