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
  'category.js',
  'zones.js',
  'event-locations.js',
  'logistics.js',
  'geo-import.js',
  'action-log.js',
  'bulk-import.js',
  'feature-registry.js',
  'empty-states.js',
  'social-share.js',
  'map.js',
  'rider.js',
  'checkin.js',
  'leaderboard.js',
  'export-csv.js',
  'export-gpx.js',
  'pdf-blocks.js',
  'export-pdf.js',
  'race-state.js',
  'rules-engine.js',
  'game-modes.js',
  'dashboard.js',
  'demo-event.js',
  'sound-hook.js',
  'live-sync.js',
  'beamer.js',
  'beamer-modes.js',
  'offline-tiles.js',
  'data-safety.js',
  'command-palette.js',
  'splashscreen.js',
  'onboarding.js',
  'documentation.js',
  'ui-headquarter.js'
];

function read(relPath){
  return fs.readFileSync(path.join(__dirname, relPath), 'utf8');
}

/* ---------------- backend-agnostic core guard ----------------
   Die beiden Varianten teilen ~97,5% ihres Codes; der ganze Unterschied
   sind die knapp 300 Zeilen in src/storage/. Diese Trennung war bisher
   reine Konvention — und Konventionen brechen lautlos. Hier bricht
   stattdessen der Build.

   Jede Regel benennt, wohin das Verbotene stattdessen gehört: nach
   src/storage/ (hinter einen Seam) oder ins Rider-Bundle. Wer eine
   Regel entschärfen will, sollte zuerst prüfen, ob nicht ein neuer
   Seam die ehrlichere Antwort ist.                                  */
const CORE_GUARD_RULES = [
  {
    pattern: /\bhasSharedStorage\b/,
    reason: 'Speicher-Kapazität direkt abgefragt statt über einen Seam (z. B. supportsLocalBackup()).'
  },
  {
    pattern: /\bsqlDb\b/,
    reason: 'sqlDb ist ein Detail des lokalen Backends und existiert in der Server-Variante nicht.'
  },
  {
    // i18n.js ist ausgenommen: dort stehen api.php/install.php legitim in den
    // Platzhaltertexten des PHP-Setup-Bildschirms. Übersetzungstexte sind
    // Daten, kein Endpunkt-Wissen.
    pattern: /\b(?:rider|api|backup|migrate|install)\.php\b/,
    skipFiles: ['i18n.js'],
    reason: 'Endpunkt-Wissen gehört in src/storage/, nicht in den geteilten Kern.'
  }
];

/* Vierte Regel, dynamisch: kein Kernmodul darf ein Symbol aus src/rider/
   aufrufen. Solange das Verzeichnis nicht existiert, ist die Regel
   wirkungslos statt fehlerhaft. */
function riderOnlySymbols(){
  const riderDir = path.join(__dirname, 'src/rider');
  if(!fs.existsSync(riderDir)) return [];
  const names = new Set();
  for(const file of fs.readdirSync(riderDir).filter(f => f.endsWith('.js'))){
    const src = fs.readFileSync(path.join(riderDir, file), 'utf8');
    for(const m of src.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)){
      names.add(m[1]);
    }
  }
  return [...names];
}

function assertCoreIsBackendAgnostic(){
  const riderSymbols = riderOnlySymbols();
  const rules = riderSymbols.length
    ? CORE_GUARD_RULES.concat([{
        pattern: new RegExp('\\b(?:' + riderSymbols.join('|') + ')\\b'),
        reason: 'Symbol aus src/rider/ — das Rider-Bundle darf nicht in den geteilten Kern lecken.'
      }])
    : CORE_GUARD_RULES;

  const violations = [];
  for(const name of CORE_FILES){
    const lines = read(`src/core/${name}`).split('\n');
    for(const rule of rules){
      if(rule.skipFiles && rule.skipFiles.includes(name)) continue;
      lines.forEach((line, i) => {
        if(rule.pattern.test(line)){
          violations.push(`  src/core/${name}:${i + 1}\n    ${line.trim()}\n    -> ${rule.reason}`);
        }
      });
    }
  }

  if(violations.length){
    console.error(`\nBuild abgebrochen: ${violations.length} Verstoß/Verstöße gegen die Kern-Trennung.\n`);
    console.error(violations.join('\n\n'));
    console.error('\nsrc/core/* muss in beiden Varianten identisch baubar bleiben.');
    console.error('Variantenspezifisches Verhalten gehört hinter einen Seam in src/storage/.\n');
    process.exit(1);
  }
}

function buildVariant(storageFile, templateFile, outputFile){
  const core = CORE_FILES.map(name => read(`src/core/${name}`)).join('\n\n');
  const storage = read(`src/storage/${storageFile}`);
  const themesCss = read('src/styles/themes.css');
  const baseCss = read('src/styles/base.css');
  const template = read(`templates/${templateFile}`);
  const enTranslations = JSON.parse(read('src/i18n/en.json'));
  const enInjection = `translations.en = ${JSON.stringify(enTranslations).replace(/</g, '\\u003c')};`;
  const coreWithBuiltinLangs = `${core}\n\n${enInjection}`;

  const output = template
    .replace('{{THEMES_CSS}}', themesCss)
    .replace('{{BASE_CSS}}', baseCss)
    .replace('{{STORAGE_JS}}', storage)
    .replace('{{CORE_JS}}', coreWithBuiltinLangs);

  const distDir = path.join(__dirname, 'dist');
  if(!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, outputFile), output);
  console.log(`gebaut: dist/${outputFile} (${(output.length / 1024).toFixed(0)} KB)`);
}

assertCoreIsBackendAgnostic();
buildVariant('storage-local.js', 'local.template.html', 'alleycat-dispatch-local.html');
buildVariant('storage-server.js', 'server.template.html', 'alleycat-dispatch-server.html');
