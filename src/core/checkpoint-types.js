/* ---------------- checkpoint types ----------------
   Single source of truth for all checkpoint-type behavior. Add an entry here
   to introduce a new type — every dropdown, icon, manifest cell and check-in
   control derives from this list instead of scattered type === 'x' checks.

   Eigene Datei statt Teil von checkpoint.js, weil das Fahrer-Bundle diese
   Tabelle braucht (es zeigt pro Checkpoint, was dort zu tun ist), aber nicht
   die 700 Zeilen Editor-Oberfläche drumherum. Maßstab dafür, was hier liegen
   darf: braucht das Fahrer-Bundle es? Das Laden und Speichern eigener Typen
   gehört deshalb ausdrücklich NICHT hierher — es hängt an storageGet/
   storageSet, die es im Fahrer-Bundle nicht gibt.                        */
let CHECKPOINT_TYPES = [
  {key: 'qr', icon: '\ud83d\udd32', shortLabel: 'QR', fullLabel: t('checkpoint.types.qr.full'), dropdownLabel: t('checkpoint.types.qr.dropdown'), referenceFieldLabel: t('checkpoint.types.qr.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'photo', icon: '\ud83d\udcf7', shortLabel: 'FOTO', fullLabel: t('checkpoint.types.photo.full'), dropdownLabel: t('checkpoint.types.photo.dropdown'), referenceFieldLabel: t('checkpoint.types.photo.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'item', icon: '\ud83d\udce6', shortLabel: 'ITEM', fullLabel: t('checkpoint.types.item.full'), dropdownLabel: t('checkpoint.types.item.dropdown'), referenceFieldLabel: t('checkpoint.types.item.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'custom', icon: '\u2753', shortLabel: 'R\u00c4TSEL', fullLabel: t('checkpoint.types.custom.full'), dropdownLabel: t('checkpoint.types.custom.dropdown'), referenceFieldLabel: t('checkpoint.types.custom.ref'), hasCustomQuestion: true, isScored: false, scoreMax: 0, manifestCell: 'answer-line'},
  {key: 'challenge', icon: '\ud83c\udfc6', shortLabel: 'CHALLENGE', fullLabel: t('checkpoint.types.challenge.full'), dropdownLabel: t('checkpoint.types.challenge.dropdown'), referenceFieldLabel: t('checkpoint.types.challenge.ref'), hasCustomQuestion: false, isScored: true, scoreMax: 10, manifestCell: 'score-line'},
  {key: 'pickup', icon: '\ud83d\udce4', shortLabel: 'ABHOLUNG', fullLabel: t('checkpoint.types.pickup.full'), dropdownLabel: t('checkpoint.types.pickup.dropdown'), referenceFieldLabel: t('checkpoint.types.pickup.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'dropoff', icon: '\ud83d\udce5', shortLabel: 'ZUSTELLUNG', fullLabel: t('checkpoint.types.dropoff.full'), dropdownLabel: t('checkpoint.types.dropoff.dropdown'), referenceFieldLabel: t('checkpoint.types.dropoff.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'}
];
const BUILTIN_CHECKPOINT_TYPE_KEYS = CHECKPOINT_TYPES.map(t => t.key);
function getCheckpointType(key){
  return CHECKPOINT_TYPES.find(t => t.key === key) || CHECKPOINT_TYPES[0];
}
function typeLabel(t){ return getCheckpointType(t).shortLabel; }
function typeFullLabel(t){ return getCheckpointType(t).fullLabel; }
function typeIcon(t){ return getCheckpointType(t).icon; }
