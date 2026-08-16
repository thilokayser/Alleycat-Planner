/* Alleycat Dispatch — Build-Skript
   ------------------------------------------------------------------
   Reines Node, keine Dependencies (kein npm install nötig). Fügt die
   Module aus src/ zu den zwei fertigen Ausgabedateien in dist/
   zusammen. Reihenfolge der core/-Module ist unkritisch, da es fast
   ausschließlich gehoistete Funktionsdeklarationen sind — es gibt
   keine Cross-Modul-Abhängigkeiten zur Parse-Zeit.

   Aufruf: node build.js
   ------------------------------------------------------------------ */
const fs = require('fs');
const path = require('path');

const CORE_FILES = [
  'i18n.js',
  'utils.js',
  'checkpoint.js',
  'team.js',
  'map.js',
  'rider.js',
  'checkin.js',
  'leaderboard.js',
  'export-csv.js',
  'export-gpx.js',
  'export-pdf.js',
  'dashboard.js',
  'ui-headquarter.js'
];

function read(relPath){
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

function buildVariant(storageFile, templateFile, outputFile){
  const core = CORE_FILES.map(name => read(`src/core/${name}`)).join('\n\n');
  const storage = read(`src/storage/${storageFile}`);
  const themesCss = read('src/styles/themes.css');
  const baseCss = read('src/styles/base.css');
  const template = read(`templates/${templateFile}`);

  const output = template
    .replace('{{THEMES_CSS}}', themesCss)
    .replace('{{BASE_CSS}}', baseCss)
    .replace('{{STORAGE_JS}}', storage)
    .replace('{{CORE_JS}}', core);

  const distDir = path.join(__dirname, 'dist');
  if(!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, outputFile), output);
  console.log(`gebaut: dist/${outputFile} (${(output.length / 1024).toFixed(0)} KB)`);
}

buildVariant('storage-local.js', 'local.template.html', 'alleycat-dispatch-local.html');
buildVariant('storage-server.js', 'server.template.html', 'alleycat-dispatch-server.html');
