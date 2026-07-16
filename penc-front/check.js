/* check.js — validation rapide de messager.html (a garder dans penc-front)
   Usage : node check.js
   - verifie la syntaxe de tous les blocs <script> inline
   - affiche le marqueur de build (PENC build vXX)
   - controle l'absence du bug d'emoji \U0001F4AC et la presence du bouton Message */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FN = path.join(__dirname, 'messager.html');
if (!fs.existsSync(FN)) {
  console.error('Introuvable : ' + FN + ' (lance node check.js dans le dossier penc-front).');
  process.exit(1);
}
const html = fs.readFileSync(FN, 'utf8');

// 1) Syntaxe des <script> inline (on ignore ceux avec src=)
const re = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  i++;
  try { new vm.Script(m[1]); }
  catch (e) { bad++; console.log('  [X] Bloc <script> #' + i + ' INVALIDE : ' + String(e.message).split('\n')[0]); }
}
console.log('Blocs <script> inline : ' + i + ' analyses, ' + bad + ' invalide(s).');

// 2) Marqueur de build
const b = html.match(/PENC build v\d+[^']*/);
console.log('Build : ' + (b ? b[0] : '(marqueur introuvable)'));

// 3) Controles cibles du patch v72
console.log('Bug emoji \\U0001F4AC present : ' + html.includes('\\U0001F4AC') + '  (doit etre false)');
console.log('Bouton Message (su-msg) present : ' + html.includes('su-msg') + '  (doit etre true)');

process.exit(bad ? 1 : 0);
