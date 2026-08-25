/* ---------------- rider sync: reine Funktionen ----------------
   Bindeglied zwischen dem Event-Blob des Organizers und den relationalen
   Rider-Tabellen des Servers. Dieses Modul kennt weder fetch noch einen
   Endpunkt — das lebt hinter den Seams in src/storage/. Hier stehen nur
   Funktionen, die aus Daten Daten machen, damit sie ohne Server und ohne
   Netz testbar bleiben.

   Kernzusage des Moduls ist die Idempotenz von mergeRiderLogRows(): jede
   Log-Zeile darf beliebig oft angewendet werden, ohne das Ergebnis zu
   verändern. Daraus folgt, dass zwei Organizer-Geräte, die dieselbe
   Log-Quelle lesen, auf denselben Stand konvergieren, statt sich
   gegenseitig zu überschreiben.                                        */

/* Ab dieser Entfernung zwischen Scan-Position und Checkpoint gilt ein
   Check-in als auffällig. Großzügig gewählt: GPS in Stadtschluchten ist
   ungenau, und der Wert blockiert nichts — er markiert nur. */
const RIDER_GPS_FLAG_THRESHOLD_M = 500;

const RIDER_PUBLIC_ID_RE = /^[a-z0-9]{12}$/;
const RIDER_TOKEN_RE = /^[a-z0-9]{32}$/;

function generateEventPublicId(){ return randomStringFromAlphabet(12, RIDER_TOKEN_ALPHABET); }

/* ---------------- QR-Nutzlast ----------------
   Zwei Formate, beide als URL, damit ein Scan mit der System-Kamera in der
   App landet statt in einer Fehlermeldung:

     <riderAppUrl>#r.<publicId>.<riderToken>
     <riderAppUrl>#c.<publicId>.<cpId>.<qrToken>

   Das dritte erkannte Format ist die nackte Startnummer. Die stand bis zur
   Rider-App auf jeder Spokecard, und der Marshal-Check-in scannt sie heute
   noch. Sie muss erkannt bleiben, sonst entwertet dieses Release jede
   bereits gedruckte Karte.                                              */
function parseRiderQrPayload(text){
  const raw = String(text == null ? '' : text).trim();
  if(!raw) return null;

  const bare = raw.match(/^#?(\d{1,5})$/);
  if(bare) return {kind: 'legacyBib', bib: parseInt(bare[1], 10)};

  const hashAt = raw.indexOf('#');
  const fragment = hashAt === -1 ? raw : raw.slice(hashAt + 1);
  const parts = fragment.split('.');

  if(parts[0] === 'r' && parts.length === 3){
    const [, publicId, riderToken] = parts;
    if(!RIDER_PUBLIC_ID_RE.test(publicId) || !RIDER_TOKEN_RE.test(riderToken)) return null;
    return {kind: 'rider', publicId, riderToken};
  }
  if(parts[0] === 'c' && parts.length === 4){
    const [, publicId, cpId, qrToken] = parts;
    if(!RIDER_PUBLIC_ID_RE.test(publicId) || !RIDER_TOKEN_RE.test(qrToken) || !cpId) return null;
    return {kind: 'checkpoint', publicId, cpId, qrToken};
  }
  return null;
}

function buildRiderQrPayload(baseUrl, evt, rider){
  return `${baseUrl}#r.${evt.publicId}.${rider.riderToken}`;
}
function buildCheckpointQrPayload(baseUrl, evt, cp){
  return `${baseUrl}#c.${evt.publicId}.${cp.id}.${cp.qrToken}`;
}

/* ---------------- Slot-Status ----------------
   Das Blob nutzt '' für "noch niemandem zugeordnet", die Datenbankspalte
   'free' — sie ist NOT NULL und braucht einen benennbaren Default. Genau
   diese eine Sonderregel, und sie lebt nur hier. */
function slotStatusToDb(status){ return status || 'free'; }
function slotStatusFromDb(status){ return status === 'free' ? '' : (status || ''); }

/* ---------------- freie Startnummern ---------------- */
function computeFreeBibs(evt){
  const free = [], pending = [], confirmed = [];
  (evt.riders || []).forEach(r => {
    if(r.riderStatus === 'confirmed') confirmed.push(r.bib);
    else if(r.riderStatus === 'pending') pending.push(r.bib);
    else free.push(r.bib);
  });
  return {free, pending, confirmed};
}

/* ---------------- Merge ----------------
   Wendet Log-Zeilen auf evt.riders an. Rückgabe:
     changed  — ob sich tatsächlich etwas geändert hat. Der Aufrufer darf nur
                dann neu rendern; ein bedingungsloses render() alle paar
                Sekunden zerstört laufende Texteingaben.
     orphans  — Zeilen, deren bib oder cpId es im Event nicht (mehr) gibt.
                Werden nie stillschweigend verworfen: ein Fahrer, der
                nachweislich an einem Punkt war, darf nicht durch einen
                Konfigurationsfehler aus der Wertung fallen.             */
function mergeRiderLogRows(evt, rows){
  let changed = false;
  const orphans = [];
  const ridersByBib = new Map((evt.riders || []).map(r => [r.bib, r]));
  const cpIds = new Set((evt.checkpoints || []).map(cp => cp.id));

  (rows || []).forEach(row => {
    const rider = ridersByBib.get(row.bib);
    if(!rider){ orphans.push(row); return; }

    if(row.type === 'checkin'){
      if(!cpIds.has(row.cp_id)){ orphans.push(row); return; }
      rider.completed = rider.completed || [];
      rider.checkpointTimes = rider.checkpointTimes || {};
      if(!rider.completed.includes(row.cp_id)){
        rider.completed.push(row.cp_id);
        changed = true;
      }
      if(rider.checkpointTimes[row.cp_id] !== row.created_at){
        rider.checkpointTimes[row.cp_id] = row.created_at;
        changed = true;
      }
      const dist = row.gps_distance_m;
      if(Number.isFinite(dist) && dist > RIDER_GPS_FLAG_THRESHOLD_M){
        rider.gpsFlags = rider.gpsFlags || {};
        if(rider.gpsFlags[row.cp_id] !== dist){
          rider.gpsFlags[row.cp_id] = dist;
          changed = true;
        }
      }
    } else if(row.type === 'register'){
      const data = typeof row.payload === 'string' ? safeParseJson(row.payload) : row.payload;
      if(rider.riderStatus !== 'pending'){ rider.riderStatus = 'pending'; changed = true; }
      if(JSON.stringify(rider.pendingData) !== JSON.stringify(data || null)){
        rider.pendingData = data || null;
        changed = true;
      }
    }
  });

  if(orphans.length){
    evt.orphanCheckins = evt.orphanCheckins || [];
    const known = new Set(evt.orphanCheckins.map(o => o.id));
    orphans.forEach(o => {
      if(!known.has(o.id)){ evt.orphanCheckins.push(o); changed = true; }
    });
  }
  return {changed, orphans};
}

function safeParseJson(str){
  try{ return JSON.parse(str); }catch(e){ return null; }
}

/* ---------------- Publish-Nutzlast ----------------
   Die abgespeckte, fahrer-taugliche Sicht auf das Event. Bewusst eine
   Positivliste: es wird aufgezählt, was hinausgeht, statt aufgezählt, was
   zurückgehalten wird. Ein neues Feld im Event-Blob landet damit nicht
   versehentlich auf einem fremden Handy — Namen, Notfallkontakte,
   Rätsellösungen und Personalplanung bleiben hier grundsätzlich außen vor.

   Token werden vor dem Senden gehasht: Klartext-Zugangsdaten verlassen die
   Organizer-App nie, auch nicht über die eigene authentifizierte
   Verbindung.                                                          */
async function buildRiderSyncPayload(evt){
  const slots = await Promise.all((evt.riders || []).map(async r => ({
    bib: r.bib,
    tokenHash: await sha256Hex(r.riderToken),
    codeHash: await sha256Hex(r.riderCode),
    status: slotStatusToDb(r.riderStatus)
  })));
  const checkpoints = await Promise.all((evt.checkpoints || []).map(async (cp, i) => ({
    cpId: cp.id,
    label: cp.name || '',
    qrTokenHash: await sha256Hex(cp.qrToken),
    qrEnabled: !!cp.qrCheckinEnabled,
    sortIndex: i,
    /* Koordinaten nur, wenn die Kartenansicht für Fahrer freigeschaltet ist.
       Sonst wäre die Checkpoint-Liste eines nicht gestarteten Rennens über
       die öffentliche API abfragbar. */
    lat: evt.riderApp && evt.riderApp.map ? cp.lat : null,
    lon: evt.riderApp && evt.riderApp.map ? cp.lng : null
  })));
  return {
    publicId: evt.publicId,
    storageKey: 'event:' + evt.id,
    name: evt.name || '',
    status: evt.status || 'planning',
    settings: Object.assign({}, evt.riderApp),
    slots,
    checkpoints
  };
}

/* ---------------- Publish ----------------
   Bewusst NICHT an debouncedSave() gehängt: das wäre ein
   Netzwerk-Roundtrip pro Tastendruck. Stattdessen ein eigener,
   deutlich längerer Debounce nach dem erfolgreichen Speichern, plus
   ein sofortiger Publish bei jedem Rennstatuswechsel — dort zählt
   Aktualität, weil rider.php Check-ins nur im Status 'running'
   annimmt. */
let riderPublishTimeout = null;
let riderPublishInFlight = false;
const RIDER_PUBLISH_DEBOUNCE_MS = 3000;

/* Der Wächter bricht eine sonst unvermeidliche Schleife: ein Publish
   kann Token nachrüsten und muss dann speichern, und Speichern plant
   einen Publish. Ohne ihn folgte jedem Erst-Publish ein zweiter,
   wirkungsloser Netzwerkaufruf. */
function schedulePublishRiderConfig(){
  if(riderPublishInFlight) return;
  clearTimeout(riderPublishTimeout);
  riderPublishTimeout = setTimeout(publishRiderConfigNow, RIDER_PUBLISH_DEBOUNCE_MS);
}

async function publishRiderConfigNow(){
  clearTimeout(riderPublishTimeout);
  const evt = state.currentEvent;
  if(!evt) return null;

  /* Zuerst fragen, ob es überhaupt eine Fahrer-App gibt — und zwar
     bevor irgendetwas am Event verändert wird. Der Rückgabewert des
     Seams käme dafür zu spät: bis er da ist, hätte das Event längst eine
     publicId und Token, die in dieser Installation niemand je benutzt,
     und der nächste debouncedSave() schriebe sie mit. */
  if(!riderAppBaseUrl()){
    state.riderPublish = null;
    return null;
  }

  riderPublishInFlight = true;
  try{
    /* Token und publicId werden hier nachgerüstet statt in einem eigenen
       Migrationsschritt: der erste Publish eines Altbestands-Events
       erzeugt, was fehlt, und speichert es zurück. */
    let needsSave = false;
    if(!evt.publicId){ evt.publicId = generateEventPublicId(); needsSave = true; }
    if(ensureRiderTokens(evt)) needsSave = true;
    if(ensureCheckpointTokens(evt)) needsSave = true;

    const payload = await buildRiderSyncPayload(evt);
    const res = await publishRiderConfig(payload);

    /* null heißt: diese Variante oder diese Installation hat keine
       Fahrer-App. Dann auch nichts zurückschreiben — sonst bekäme ein
       lokales Event Token, die niemand je benutzt. */
    if(res === null){
      state.riderPublish = null;
      return null;
    }

    state.riderPublish = res.ok
      ? {ok: true, at: Date.now(), error: ''}
      : {ok: false, at: Date.now(), error: res.error || 'unbekannt'};

    if(needsSave) await saveCurrentEvent();
    return res;
  } finally {
    riderPublishInFlight = false;
  }
}

function retryPublishRiderConfig(){
  publishRiderConfigNow().then(() => render());
}

/* ---------------- Merge-Polling ----------------
   Liest das Log ab dem gespeicherten Cursor und merged die Zeilen in
   evt.riders. Läuft nur, solange ein Rennen bevorsteht oder läuft —
   vorher gibt es nichts zu holen, danach nichts mehr.

   Die wichtigste Regel steht in applyRiderLogPage(): render() nur,
   wenn sich wirklich etwas geändert hat. Ein bedingungsloses Neurendern
   alle fünf Sekunden zerstört laufende Texteingaben (dieselbe
   Fehlerklasse wie der Fokusverlust im Suchfeld, Commit 9641fbf). */
let riderPollTimer = null;
let riderPollInFlight = false;
const RIDER_POLL_INTERVAL_MS = 5000;

function riderPollingWanted(evt){
  return !!evt && (evt.status === 'ready' || evt.status === 'running') && !!evt.publicId;
}

function startRiderPolling(){
  stopRiderPolling();
  if(!riderPollingWanted(state.currentEvent)) return;
  riderPollTimer = setInterval(riderPollTick, RIDER_POLL_INTERVAL_MS);
  riderPollTick();
}
function stopRiderPolling(){
  if(riderPollTimer){ clearInterval(riderPollTimer); riderPollTimer = null; }
}

async function riderPollTick(){
  /* Überlappende Läufe würden denselben Cursor zweimal lesen und die
     zweite Antwort auf einen veralteten Stand anwenden. */
  if(riderPollInFlight) return;
  const evt = state.currentEvent;
  if(!riderPollingWanted(evt)){ stopRiderPolling(); return; }

  riderPollInFlight = true;
  try{
    let changed = false;
    let guard = 0;
    /* `more` heißt: der Server hatte mehr Zeilen als das Limit. Dann
       sofort weiterlesen statt das nächste Intervall abzuwarten, sonst
       bräuchte ein Rückstand von 1000 Zeilen 25 Sekunden zum Aufholen.
       guard deckelt die Schleife, damit ein fehlerhafter Cursor die
       Seite nicht einfriert. */
    while(guard++ < 10){
      const res = await pollRiderLog(evt.publicId, evt.riderLastLogId || 0);
      /* null = diese Variante hat keine Fahrer-App. Dann dauerhaft
         aufhören, nicht alle fünf Sekunden erneut feststellen. */
      if(res === null){ stopRiderPolling(); return; }
      if(res.ok === false) return;

      const merged = mergeRiderLogRows(evt, res.rows || []);
      if(merged.changed) changed = true;
      if(res.lastId > (evt.riderLastLogId || 0)){
        evt.riderLastLogId = res.lastId;
        changed = true;
      }
      if(!res.more) break;
    }
    if(changed){
      debouncedSave();
      render();
    }
  } finally {
    riderPollInFlight = false;
  }
}

/* ---------------- Anmeldungen bestätigen ---------------- */
function pendingRiderRegistrations(evt){
  return (evt.riders || []).filter(r => r.riderStatus === 'pending');
}

async function confirmPendingRider(bib){
  const evt = state.currentEvent;
  const rider = (evt.riders || []).find(r => r.bib === bib);
  if(!rider || rider.riderStatus !== 'pending') return;

  const data = rider.pendingData || {};
  const before = {name: rider.name, emergencyContact: rider.emergencyContact, categories: Object.assign({}, rider.categories), riderStatus: rider.riderStatus, pendingData: rider.pendingData};
  logUndoableAction(evt, t('riderApp.undoConfirm', {bib}), () => {
    Object.assign(rider, before);
    confirmRiderSlot(evt.publicId, bib, 'pending');
    render();
  });

  rider.name = data.name || rider.name;
  rider.emergencyContact = data.emergencyContact || rider.emergencyContact;
  if(data.categories && typeof data.categories === 'object') rider.categories = Object.assign({}, rider.categories, data.categories);
  rider.riderStatus = 'confirmed';
  rider.pendingData = null;

  await confirmRiderSlot(evt.publicId, bib, 'confirmed');
  debouncedSave();
  render();
}

async function rejectPendingRider(bib){
  const evt = state.currentEvent;
  const rider = (evt.riders || []).find(r => r.bib === bib);
  if(!rider || rider.riderStatus !== 'pending') return;
  if(!confirm(t('riderApp.rejectConfirm', {bib}))) return;

  const before = {name: rider.name, emergencyContact: rider.emergencyContact, riderStatus: rider.riderStatus, pendingData: rider.pendingData};
  logUndoableAction(evt, t('riderApp.undoReject', {bib}), () => {
    Object.assign(rider, before);
    confirmRiderSlot(evt.publicId, bib, 'pending');
    render();
  });

  /* Slot wird wieder ausgebbar: die gedruckte Karte bekommt der nächste
     Fahrer in die Hand, deshalb müssen die Daten wirklich weg. */
  rider.name = '';
  rider.emergencyContact = '';
  rider.riderStatus = '';
  rider.pendingData = null;

  await confirmRiderSlot(evt.publicId, bib, 'free');
  debouncedSave();
  render();
}
