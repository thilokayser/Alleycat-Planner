/* ---------------- checkpoint types ----------------
   Single source of truth for all checkpoint-type behavior. Add an entry here
   to introduce a new type — every dropdown, icon, manifest cell and check-in
   control derives from this list instead of scattered type === 'x' checks.

   Eigene Datei statt Teil von checkpoint.js, weil das Fahrer-Bundle diese
   Tabelle braucht (es zeigt pro Checkpoint, was dort zu tun ist), aber nicht
   die 700 Zeilen Editor-Oberfläche drumherum. Maßstab dafür, was hier liegen
   darf: braucht das Fahrer-Bundle es? Das Laden und Speichern eigener Typen
   gehört deshalb ausdrücklich NICHT hierher — es hängt an storageGet/
   storageSet, die es im Fahrer-Bundle nicht gibt.

   WARUM EINE FABRIK statt einer Konstanten: die Beschriftungen kommen aus
   t(). Eine Top-Level-Konstante wertet die genau einmal beim Laden aus und
   friert damit auf die Startsprache ein — der Nutzer schaltet in den
   Einstellungen auf Englisch um und die Checkpoint-Typen bleiben deutsch.
   Genau dieser Fehler wurde am 19.08.2026 für NAV_ITEMS, ICON_PACKS, THEMES
   und CATEGORY_PRESETS behoben; CHECKPOINT_TYPES wurde damals übersehen und
   fiel erst beim Herausziehen dieser Datei auf. Siehe den Kommentar über
   SETTINGS_NAV_GROUPS in ui-headquarter.js für dasselbe Muster.

   Aufrufstellen benutzen getCheckpointTypes(), nie eine gespeicherte Kopie
   davon über einen Sprachwechsel hinweg.                                  */
function builtinCheckpointTypes(){
  return [
    {key: 'qr', icon: '🔲', shortLabel: 'QR', fullLabel: t('checkpoint.types.qr.full'), dropdownLabel: t('checkpoint.types.qr.dropdown'), referenceFieldLabel: t('checkpoint.types.qr.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
    {key: 'photo', icon: '📷', shortLabel: 'FOTO', fullLabel: t('checkpoint.types.photo.full'), dropdownLabel: t('checkpoint.types.photo.dropdown'), referenceFieldLabel: t('checkpoint.types.photo.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
    {key: 'item', icon: '📦', shortLabel: 'ITEM', fullLabel: t('checkpoint.types.item.full'), dropdownLabel: t('checkpoint.types.item.dropdown'), referenceFieldLabel: t('checkpoint.types.item.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
    {key: 'custom', icon: '❓', shortLabel: 'RÄTSEL', fullLabel: t('checkpoint.types.custom.full'), dropdownLabel: t('checkpoint.types.custom.dropdown'), referenceFieldLabel: t('checkpoint.types.custom.ref'), hasCustomQuestion: true, isScored: false, scoreMax: 0, manifestCell: 'answer-line'},
    {key: 'challenge', icon: '🏆', shortLabel: 'CHALLENGE', fullLabel: t('checkpoint.types.challenge.full'), dropdownLabel: t('checkpoint.types.challenge.dropdown'), referenceFieldLabel: t('checkpoint.types.challenge.ref'), hasCustomQuestion: false, isScored: true, scoreMax: 10, manifestCell: 'score-line'},
    {key: 'pickup', icon: '📤', shortLabel: 'ABHOLUNG', fullLabel: t('checkpoint.types.pickup.full'), dropdownLabel: t('checkpoint.types.pickup.dropdown'), referenceFieldLabel: t('checkpoint.types.pickup.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
    {key: 'dropoff', icon: '📥', shortLabel: 'ZUSTELLUNG', fullLabel: t('checkpoint.types.dropoff.full'), dropdownLabel: t('checkpoint.types.dropoff.dropdown'), referenceFieldLabel: t('checkpoint.types.dropoff.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'}
  ];
}
const BUILTIN_CHECKPOINT_TYPE_KEYS = ['qr', 'photo', 'item', 'custom', 'challenge', 'pickup', 'dropoff'];

/* Vom Nutzer angelegte Typen. Ihre Beschriftungen sind Nutzereingaben und
   laufen deshalb bewusst NICHT durch t() — sie werden so gespeichert und so
   angezeigt. Geladen und gespeichert wird in checkpoint.js. */
let customCheckpointTypes = [];

/* Gemerkt pro Sprache: getCheckpointTypes() steckt in Render-Schleifen, und
   jeder Neuaufbau kostet 21 t()-Aufrufe.

   Zwei Schlüssel, absichtlich doppelt gesichert. `_cpTypesRevision` muss von
   jedem hochgesetzt werden, der customCheckpointTypes ändert — das ist die
   verlässliche, aber vergessbare Hälfte (genau das ist beim Bau dieser
   Funktion einmal passiert: ein neu angelegter eigener Typ blieb unsichtbar).
   Die Länge daneben fängt den vergessenen Aufruf bei push und filter ab, also
   bei allem, was in der Praxis vorkommt. Sie ersetzt den Zähler nicht — eine
   Änderung an einem bestehenden Eintrag lässt die Länge gleich. */
let _cpTypesMemo = null, _cpTypesMemoLang = null, _cpTypesMemoRev = -1, _cpTypesMemoLen = -1;
let _cpTypesRevision = 0;
function invalidateCheckpointTypes(){ _cpTypesRevision++; }

function getCheckpointTypes(){
  const lang = getCurrentLanguage();
  if(_cpTypesMemo && _cpTypesMemoLang === lang
     && _cpTypesMemoRev === _cpTypesRevision
     && _cpTypesMemoLen === customCheckpointTypes.length) return _cpTypesMemo;
  _cpTypesMemo = [...builtinCheckpointTypes(), ...customCheckpointTypes];
  _cpTypesMemoLang = lang;
  _cpTypesMemoRev = _cpTypesRevision;
  _cpTypesMemoLen = customCheckpointTypes.length;
  return _cpTypesMemo;
}
function getCheckpointType(key){
  const types = getCheckpointTypes();
  return types.find(ct => ct.key === key) || types[0];
}
function typeLabel(t){ return getCheckpointType(t).shortLabel; }
function typeFullLabel(t){ return getCheckpointType(t).fullLabel; }
function typeIcon(t){ return getCheckpointType(t).icon; }
