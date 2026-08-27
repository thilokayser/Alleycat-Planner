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
  /* checkpoint-types.js vor checkpoint.js: CHECKPOINT_TYPES ist ein
     let auf oberster Ebene, das withCheckpointDefaults() beim Aufruf
     liest. Funktionsdeklarationen wären hoisted, diese Zuweisung nicht. */
  'checkpoint-types.js',
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
  'raceday.js',
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
  'rider-qr.js',
  'rider-sync.js',
  'ui-headquarter.js'
];

/* ---------------- Fahrer-App (Teilprojekt 2) ----------------
   Dritte Ausgabe, eigene Dateiliste. Bewusst kurz: die Fahrer-App teilt
   mit dem Organizer nur, was sie wirklich braucht. Alles unter
   src/rider/ ist ausschließlich hier drin und wird vom Kern-Guard nicht
   geprüft — umgekehrt darf der Kern nichts davon aufrufen (vierte
   Guard-Regel).                                                        */
const RIDER_FILES = [
  'src/core/i18n.js',            // beim Bauen auf RIDER_I18N_NAMESPACES gekürzt
  'src/core/utils.js',
  'src/core/checkpoint-types.js',
  'src/core/rider-qr.js',
  'src/rider/state.js',
  'src/rider/api.js',
  'src/rider/queue.js',
  'src/rider/scanner.js',
  'src/rider/views.js',
  'src/rider/init.js'
];

/* Nur diese Namensräume wandern ins Fahrer-Bundle. i18n.js hat rund 1100
   Zeilen und en.json 55 KB — beides vollständig mitzunehmen wären ~110 KB
   für ein paar Dutzend Strings, geladen genau dort, wo die Verbindung am
   schlechtesten ist.

   Nicht verwechseln: `riderApp` ist die ORGANIZER-Seite (ausstehende
   Anmeldungen, QR-Häkchen) und gehört hier NICHT dazu. Die Strings der
   Fahrer-App liegen unter `riderScan`. */
const RIDER_I18N_NAMESPACES = ['common', 'checkpoint', 'riderScan'];

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
    /* Nur Deklarationen auf Modulebene (Spalte 0, kein führender
       Leerraum). Verschachtelte Funktionen sind für andere Module gar
       nicht sichtbar und können deshalb nicht lecken — sie mitzuzählen
       erzeugte nur Fehlalarme auf generischen Namen. Genau das passierte
       beim Bau von Paket 4: scanner.js hat ein inneres tick(), checkin.js
       ebenfalls, und der Guard hielt das für ein Leck. */
    for(const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)){
      names.add(m[1]);
    }
  }
  return [...names];
}

/* Blendet Kommentare aus, bevor die Regeln greifen. Die Regeln meinen
   Endpunkt- und Backend-Wissen im *Code*; ein Kommentar, der erklärt,
   warum ein Seam sofort gerufen wird, ist keine Kopplung — und ein Guard,
   der Prosa beanstandet, erzieht nur dazu, um ihn herumzuformulieren.

   Zeilenzahl bleibt erhalten (Blockkommentare werden durch ebenso viele
   Leerzeilen ersetzt), damit die Fehlermeldung weiter auf die richtige
   Zeile zeigt.

   Bewusst konservativ: `//` wird nur am Zeilenanfang als Kommentar
   gewertet, sonst verschluckte die Regel den Rest jeder Zeile mit einer
   URL darin. Blockkommentare sind gefahrlos zu entfernen, weil kein
   String-Literal in src/core/ ein `/*` enthält. */
function stripComments(src){
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .split('\n')
    .map(line => /^\s*\/\//.test(line) ? '' : line)
    .join('\n');
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
    const lines = stripComments(read(`src/core/${name}`)).split('\n');
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

/* ---------------- Kern-Fingerabdruck ----------------
   Hasht ausschließlich die Module aus CORE_FILES — nicht das fertige
   Build. Absichtlich enger als ein Hash über dist/: die Dateien in
   src/storage/ SOLLEN sich zwischen den Varianten unterscheiden, ein
   Hash über das ganze Build schlüge also auch bei völlig korrekten
   Änderungen an der Speicherschicht an und wäre nach kurzer Zeit
   Rauschen, das man wegdrückt.

   Verwendung als Leck-Detektor während eines Arbeitspakets:
     node build.js --core-hash > .local-baseline
     diff <(node build.js --core-hash) .local-baseline               */
function coreFingerprint(){
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  for(const name of CORE_FILES) h.update(name + '\0' + read(`src/core/${name}`) + '\0');
  return h.digest('hex');
}

/* Wertet das translations-Literal aus i18n.js aus und gibt nur die
   gewünschten Namensräume zurück. Das Literal ist reine Daten (keine
   Funktionsaufrufe), deshalb genügt eine Auswertung ohne Parser.

   Fehlt ein hier nicht gelisteter Namensraum, den die App benutzt, gibt
   t() den Schlüssel im Klartext zurück — sichtbar genug, um beim ersten
   Ausprobieren aufzufallen, aber kein Absturz. */
function trimTranslations(){
  const src = read('src/core/i18n.js');
  const start = src.indexOf('const translations = {');
  if(start === -1) throw new Error('translations-Literal in i18n.js nicht gefunden');
  const open = src.indexOf('{', start);
  let depth = 0, end = -1;
  for(let i = open; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){ depth--; if(depth === 0){ end = i; break; } }
  }
  if(end === -1) throw new Error('translations-Literal in i18n.js nicht geschlossen');

  const full = new Function('return ' + src.slice(open, end + 1))();
  const en = JSON.parse(read('src/i18n/en.json'));

  const pick = (dict) => {
    const out = {};
    for(const ns of RIDER_I18N_NAMESPACES) if(dict && dict[ns]) out[ns] = dict[ns];
    return out;
  };
  const missing = RIDER_I18N_NAMESPACES.filter(ns => !full.de || !full.de[ns]);
  if(missing.length) throw new Error('RIDER_I18N_NAMESPACES kennt i18n.js nicht: ' + missing.join(', '));

  return {de: pick(full.de), en: pick(en)};
}

function buildRiderVariant(){
  const trimmed = trimTranslations();
  /* i18n.js kommt NICHT als Quelltext mit — nur seine Funktionen. Das
     Literal wird durch die gekürzte Fassung ersetzt, sonst läge die
     komplette Übersetzung doppelt im Bundle. */
  const i18nSrc = read('src/core/i18n.js');
  const litStart = i18nSrc.indexOf('const translations = {');
  const litOpen = i18nSrc.indexOf('{', litStart);
  let d = 0, litEnd = -1;
  for(let i = litOpen; i < i18nSrc.length; i++){
    if(i18nSrc[i] === '{') d++;
    else if(i18nSrc[i] === '}'){ d--; if(d === 0){ litEnd = i; break; } }
  }
  const i18nTrimmed = i18nSrc.slice(0, litStart)
    + 'const translations = ' + JSON.stringify(trimmed).replace(/</g, '\\u003c')
    + i18nSrc.slice(litEnd + 1);

  const js = RIDER_FILES
    .map(rel => rel === 'src/core/i18n.js' ? i18nTrimmed : read(rel))
    .join('\n\n');

  const output = read('templates/rider.template.html')
    .replace('{{THEMES_CSS}}', read('src/styles/themes.css'))
    .replace('{{RIDER_CSS}}', read('src/styles/rider.css'))
    .replace('{{JSQR_JS}}', read('vendor/jsQR-1.4.0.js'))
    .replace('{{RIDER_JS}}', js);

  const distDir = path.join(__dirname, 'dist');
  if(!fs.existsSync(distDir)) fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, 'alleycat-rider.html'), output);

  const gz = require('zlib').gzipSync(Buffer.from(output, 'utf8'), {level: 9}).length;
  console.log(`gebaut: dist/alleycat-rider.html (${(Buffer.byteLength(output) / 1024).toFixed(0)} KB roh, ${(gz / 1024).toFixed(0)} KB über die Leitung)`);
}

if(process.argv.includes('--core-hash')){
  assertCoreIsBackendAgnostic();
  console.log(coreFingerprint());
  process.exit(0);
}

assertCoreIsBackendAgnostic();
buildVariant('storage-local.js', 'local.template.html', 'alleycat-dispatch-local.html');
buildVariant('storage-server.js', 'server.template.html', 'alleycat-dispatch-server.html');
buildRiderVariant();
console.log(`Kern-Fingerabdruck: ${coreFingerprint().slice(0, 16)}…`);
