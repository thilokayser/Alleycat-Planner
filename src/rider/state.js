/* ---------------- Fahrer-App: Zustand ----------------
   Eigenes Zustandsobjekt, absichtlich nicht das `state` des Organizers —
   die beiden Apps teilen keine Ansicht und keinen Speicher.

   Was persistiert wird und warum:
     session  Startnummer und Token. Ohne das müsste der Fahrer bei jedem
              Öffnen die Karte erneut scannen, mit Handschuhen, im Regen.
     cache    Letzte erfolgreiche ?a=me-Antwort. Sorgt dafür, dass die App
              bei fehlender Verbindung etwas zeigt statt einer Fehlerseite.

   Die Offline-Queue liegt in queue.js (Paket 5) und benutzt denselben
   Schlüssel-Präfix.                                                     */

const RIDER_LS_SESSION = 'alleycat-rider:session';
const RIDER_LS_CACHE = 'alleycat-rider:cache';

const riderState = {
  view: 'loading',      // loading | login | code | register | pending | home | scanner | confirm | error
  session: null,        // {publicId, riderToken, bib}
  event: null,          // {name, status}
  settings: {},
  slotStatus: '',
  checkpoints: [],
  progress: {},         // cpId -> Zeitstempel
  confirm: null,        // {label, at, already, queued}
  error: '',
  errorRetry: null,     // Name der Ansicht, zu der "Erneut versuchen" zurückführt
  offlineSince: '',     // gesetzt, wenn aus dem Cache gerendert wird
  busy: false
};

function riderLoadJson(key){
  try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch(e){ return null; }
}
function riderSaveJson(key, value){
  /* Ein voller localStorage darf die App nicht zum Absturz bringen. Der
     Fahrer verliert dann Komfort, nicht die Benutzbarkeit. */
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ console.error('rider: localStorage nicht schreibbar', e); return false; }
}

function riderLoadSession(){ return riderLoadJson(RIDER_LS_SESSION); }
function riderSaveSession(s){ riderSaveJson(RIDER_LS_SESSION, s); }
function riderClearSession(){
  try{ localStorage.removeItem(RIDER_LS_SESSION); }catch(e){}
}

function riderSaveCache(payload){
  riderSaveJson(RIDER_LS_CACHE, {at: new Date().toISOString(), payload});
}
function riderLoadCache(){
  const c = riderLoadJson(RIDER_LS_CACHE);
  return (c && c.payload) ? c : null;
}

/* Übernimmt eine ?a=me-Antwort in den Zustand. Eine Stelle für beide
   Quellen — frische Antwort und Cache —, damit die Ansichten nicht wissen
   müssen, woher die Daten kommen. */
function riderApplyMe(data){
  riderState.event = data.event || null;
  riderState.settings = data.settings || {};
  riderState.slotStatus = data.slotStatus || '';
  riderState.checkpoints = data.checkpoints || [];
  riderState.progress = data.progress || {};
  if(riderState.session && typeof data.bib === 'number') riderState.session.bib = data.bib;
}
