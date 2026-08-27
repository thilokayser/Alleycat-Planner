/* ---------------- Fahrer-App: Offline-Queue ----------------
   Die eine Zusage dieses Moduls: ein Scan geht nicht verloren.

   Deshalb steht die Reihenfolge fest — ERST in die Queue schreiben, DANN
   senden. Nicht umgekehrt. Stürzt die App zwischen Absenden und Antwort
   ab, oder schaltet das Handy den Tab weg, ist der Scan trotzdem
   gesichert. Der uq_client-Index auf dem Server macht das doppelte
   Senden folgenlos, also kostet die Vorsicht nichts.

   Was NICHT hier drin steht: ein Offline-Start. Die App muss einmal mit
   Verbindung geladen werden; ein Neuladen im Funkloch zeigt die
   Browser-Fehlerseite. Die Queue überlebt das — sie liegt im
   localStorage, nicht im Speicher. Siehe Spec §7.5.                    */

const RIDER_LS_QUEUE = 'alleycat-rider:queue';
const RIDER_QUEUE_RETRY_MS = 20000;

let riderQueueFlushing = false;
let riderQueueTimer = null;

function riderQueueLoad(){
  const q = riderLoadJson(RIDER_LS_QUEUE);
  return Array.isArray(q) ? q : [];
}
function riderQueueSave(items){
  riderSaveJson(RIDER_LS_QUEUE, items);
}
function riderQueueLength(){
  return riderQueueLoad().length;
}

/* Legt den Eintrag ab und gibt ihn zurück. Bewusst synchron: der
   Aufrufer darf nicht erst auf ein Versprechen warten, bevor der Scan
   gesichert ist. */
function riderQueueAdd(entry){
  const items = riderQueueLoad();
  if(!items.some(e => e.clientUuid === entry.clientUuid)) items.push(entry);
  riderQueueSave(items);
  return entry;
}

function riderQueueRemove(clientUuid){
  riderQueueSave(riderQueueLoad().filter(e => e.clientUuid !== clientUuid));
}

/* Entscheidet für eine Serverantwort, ob der Eintrag erledigt ist.

   Ausschlaggebend ist nicht "hat es geklappt", sondern "wird ein
   weiterer Versuch etwas ändern":
     erledigt  — der Server kennt den Scan, oder er wird ihn nie
                 annehmen. Wiederholen ändert nichts.
     behalten  — ein zeitlicher oder technischer Zustand, der vorbeigeht.

   403 wird deshalb GESTRICHEN, nicht behalten: ein dauerhaft ungültiger
   Scan wird durch Wiederholen nicht gültig, und eine Queue, die sich nie
   leert, beunruhigt den Fahrer mehr als eine ehrliche Meldung.
   409 race_not_running dagegen ist rein zeitlich — das Rennen startet
   gleich. */
function riderQueueVerdict(res){
  if(res.ok) return {done: true, message: ''};
  if(res.status === 403) return {done: true, message: riderErrorMessage(res)};
  return {done: false, message: ''};
}

/* Arbeitet die Queue ab. Rückgabe sagt dem Aufrufer, ob sich etwas
   geändert hat — ohne das würde jeder Durchlauf neu rendern und eine
   laufende Eingabe zerstören, dieselbe Fehlerklasse wie beim
   Merge-Polling im Organizer. */
async function riderQueueFlush(){
  if(riderQueueFlushing) return {changed: false};
  const items = riderQueueLoad();
  if(!items.length) return {changed: false};

  riderQueueFlushing = true;
  let changed = false;
  let lastMessage = '';
  try{
    for(const entry of items){
      const res = await riderApiCheckin(entry.body);
      const verdict = riderQueueVerdict(res);

      if(res.ok){
        const at = res.data.at || res.data.already || entry.body.scannedAt;
        if(riderState.progress[entry.body.cpId] !== at){
          riderState.progress[entry.body.cpId] = at;
        }
      }
      if(verdict.message) lastMessage = verdict.message;

      if(verdict.done){
        riderQueueRemove(entry.clientUuid);
        changed = true;
      } else if(res.status === 0){
        /* Kein Netz: die weiteren Einträge werden auch nicht durchgehen.
           Abbrechen statt jeden einzeln scheitern zu lassen — das spart
           Akku und Zeit im Funkloch. */
        break;
      }
    }
  } finally {
    riderQueueFlushing = false;
  }

  if(lastMessage) riderState.error = lastMessage;
  return {changed: changed || !!lastMessage};
}

/* Drei Auslöser, absichtlich verschieden geartet:
     online           der Browser meldet Verbindung — der schnellste Weg
     visibilitychange der Fahrer holt das Handy aus der Tasche
     Intervall        der Rückfall, wenn beide Meldungen ausbleiben
                      (passiert real: "online" feuert auch bei einem
                      WLAN ohne Internet)                               */
function startRiderQueueWatch(){
  if(window.__riderQueueHooked) return;
  window.__riderQueueHooked = true;

  const tryFlush = async () => {
    const res = await riderQueueFlush();
    if(res.changed && riderState.view === 'home') renderRider();
  };

  window.addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) tryFlush();
  });
  riderQueueTimer = setInterval(tryFlush, RIDER_QUEUE_RETRY_MS);
}

/* ---------------- Bildschirm wach halten ----------------
   Kein Ersatz für einen Service Worker, aber der billigste Beitrag zum
   selben Ziel: ein Bildschirm, der nicht schlafen geht, wird auch
   seltener aus dem Speicher verdrängt — und der Fahrer muss die App im
   Funkloch nicht neu laden. Dieselbe API, die data-safety.js im
   Organizer schon benutzt.

   Der Browser zieht die Sperre beim Wegschalten selbst zurück, deshalb
   wird sie bei der Rückkehr erneut angefordert. */
let riderWakeLock = null;
async function riderRequestWakeLock(){
  if(!('wakeLock' in navigator)) return;
  try{
    riderWakeLock = await navigator.wakeLock.request('screen');
    riderWakeLock.addEventListener('release', () => { riderWakeLock = null; });
  }catch(e){ /* Berechtigung verweigert oder Akkusparen — nicht kritisch */ }
}
function startRiderWakeLock(){
  if(window.__riderWakeHooked) return;
  window.__riderWakeHooked = true;
  riderRequestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && !riderWakeLock) riderRequestWakeLock();
  });
}
