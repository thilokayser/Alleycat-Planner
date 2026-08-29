/* ---------------- Checkpoint-App: Zustand ----------------
   Eigenes Zustandsobjekt nach dem Muster von riderState — dieses Bundle
   teilt mit dem Organizer und mit der Fahrer-App keine Ansicht und
   keinen Speicher, obwohl es denselben Endpunkt (rider.php) anspricht.

   session hält, WIE dieses Gerät authentifiziert ist:
     headerName  'X-Admin-Token' (Konten-Modus) oder 'X-Checkpoint-Token'
                 (Code-Modus) — cpApi* schickt den Token unter genau
                 diesem Header, siehe api.js.
     publicId    Event, an das dieses Gerät gebunden ist.
   Beide Modi münden in denselben restlichen Zustand — die Ansichten
   fragen nie, welcher Modus gerade aktiv ist. */

const CP_LS_SESSION = 'alleycat-checkpoint:session';
const CP_LS_CACHE = 'alleycat-checkpoint:cache';

const cpState = {
  view: 'loading',       // loading | login | home | scanner | confirm | error
  loginMode: 'code',      // code | account, nur für die Login-Ansicht
  session: null,          // {publicId, token, headerName}
  event: null,            // {name, status}
  checkpoints: [],        // [{cpId, label, cpType}]
  activeCpId: null,       // welcher Checkpoint gerade bedient wird (bei mehreren zugewiesenen)
  confirm: null,          // {label, bib, at, already, queued}
  error: '',
  errorRetry: null,
  offlineSince: '',
  busy: false
};

function cpLoadJson(key){
  try{ return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch(e){ return null; }
}
function cpSaveJson(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch(e){ console.error('checkpoint: localStorage nicht schreibbar', e); return false; }
}
function cpLoadSession(){ return cpLoadJson(CP_LS_SESSION); }
function cpSaveSession(s){ cpSaveJson(CP_LS_SESSION, s); }
function cpClearSession(){
  try{ localStorage.removeItem(CP_LS_SESSION); }catch(e){}
}
function cpSaveCache(payload){
  cpSaveJson(CP_LS_CACHE, {at: new Date().toISOString(), payload});
}
function cpLoadCache(){
  const c = cpLoadJson(CP_LS_CACHE);
  return (c && c.payload) ? c : null;
}
function cpApplyMe(data){
  cpState.event = data.event || null;
  cpState.checkpoints = data.checkpoints || [];
}
