/* ---------------- Checkpoint-App: Offline-Queue ----------------
   Gleiche Zusage wie bei der Fahrer-App (siehe src/rider/queue.js): ein
   Scan geht nicht verloren. ERST in die Queue schreiben, DANN senden.

   Ein Unterschied zur Fahrer-Queue: 401 (Session tot) wird wie "kein
   Netz" behandelt statt wie ein endgültiger Fehler — ein abgelaufener
   Zugangscode ist kein Grund, gesicherte Scans wegzuwerfen. Der Aufrufer
   (init.js) erkennt 401 separat und schickt das Gerät zurück zum Login,
   OHNE die Queue anzurühren; nach erneuter Anmeldung leert sie sich wie
   gewohnt. */

const CP_LS_QUEUE = 'alleycat-checkpoint:queue';
const CP_QUEUE_RETRY_MS = 20000;

let cpQueueFlushing = false;

function cpQueueLoad(){
  const q = cpLoadJson(CP_LS_QUEUE);
  return Array.isArray(q) ? q : [];
}
function cpQueueSave(items){ cpSaveJson(CP_LS_QUEUE, items); }
function cpQueueLength(){ return cpQueueLoad().length; }

function cpQueueAdd(entry){
  const items = cpQueueLoad();
  if(!items.some(e => e.clientUuid === entry.clientUuid)) items.push(entry);
  cpQueueSave(items);
  return entry;
}
function cpQueueRemove(clientUuid){
  cpQueueSave(cpQueueLoad().filter(e => e.clientUuid !== clientUuid));
}

/* done   — der Server kennt den Scan endgültig (angenommen oder für immer
            ungültig), ein weiterer Versuch ändert nichts.
   keep   — zeitlich/technisch, ein weiterer Versuch könnte klappen.
   authDead — Session/Code ungültig geworden; die Queue bleibt unberührt,
              aber der Flush-Lauf muss abbrechen, sonst schlägt jeder
              restliche Eintrag mit derselben 401 fehl. */
function cpQueueVerdict(res){
  if(res.ok) return {done: true, message: '', authDead: false};
  if(res.status === 401) return {done: false, message: '', authDead: true};
  /* checkpoint-checkin hat wie checkpoint-me keinen 401-Pfad — eine tote/
     entzogene Session kommt hier ebenfalls als 403 'unauthorized' zurück
     (siehe die gleiche Anmerkung in init.js). Ohne diese Ausnahme würde
     der Zweig direkt darunter (403/404 => done:true) den Scan als
     endgültig erledigt markieren und aus der Queue werfen — genau das
     "gesicherte Scans gehen verloren", das dieses Modul laut Kommentar
     oben verhindern soll. */
  if(res.status === 403 && res.error === 'unauthorized') return {done: false, message: '', authDead: true};
  if(res.status === 403 || res.status === 404) return {done: true, message: cpErrorMessage(res), authDead: false};
  return {done: false, message: '', authDead: false};
}

async function cpQueueFlush(){
  if(cpQueueFlushing) return {changed: false, authDead: false};
  const items = cpQueueLoad();
  if(!items.length) return {changed: false, authDead: false};

  cpQueueFlushing = true;
  let changed = false;
  let lastMessage = '';
  let authDead = false;
  try{
    for(const entry of items){
      const res = await cpApiCheckin(entry.body);
      const verdict = cpQueueVerdict(res);
      if(verdict.message) lastMessage = verdict.message;
      if(verdict.authDead){ authDead = true; break; }
      if(verdict.done){
        cpQueueRemove(entry.clientUuid);
        changed = true;
      } else if(res.status === 0){
        break;
      }
    }
  } finally {
    cpQueueFlushing = false;
  }
  if(lastMessage) cpState.error = lastMessage;
  return {changed: changed || !!lastMessage, authDead};
}

function startCpQueueWatch(){
  if(window.__cpQueueHooked) return;
  window.__cpQueueHooked = true;

  const tryFlush = async () => {
    if(!cpState.session) return;
    const res = await cpQueueFlush();
    if(res.authDead){ cpGoLoginExpired(); return; }
    if(res.changed && cpState.view === 'home') renderCp();
  };

  window.addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) tryFlush();
  });
  setInterval(tryFlush, CP_QUEUE_RETRY_MS);
}

let cpWakeLock = null;
async function cpRequestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try{
    cpWakeLock = await navigator.wakeLock.request('screen');
    cpWakeLock.addEventListener('release', () => { cpWakeLock = null; });
  }catch(e){}
}
function startCpWakeLock(){
  if(window.__cpWakeHooked) return;
  window.__cpWakeHooked = true;
  cpRequestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && !cpWakeLock) cpRequestWakeLock();
  });
}
