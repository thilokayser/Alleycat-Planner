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


function generateEventPublicId(){ return randomStringFromAlphabet(12, RIDER_TOKEN_ALPHABET); }


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
        broadcastCheckpointPing(evt, row.cp_id);
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
      /* Nur ?a=claim (öffentliche Vorab-Registrierung) legt riderToken ins
         Payload — der Slot war frei, der Server musste einen neuen Token
         erzeugen (er kennt den ursprünglichen nie, siehe rider.php:
         riderHashToken-Kommentar), und dieser Client wusste bis jetzt
         nichts davon. Ohne diese Übernahme würde der nächste
         schedulePublishRiderConfig() den noch alten, jetzt falschen Hash
         zurücksynchronisieren und den gerade erst vergebenen Token
         serverseitig wieder ungültig machen. Muss VOR dem pendingData-
         Vergleich unten laufen und aus dem Payload entfernt werden — der
         Token gehört nicht in die Organizer-Anzeige der Anmeldung. */
      if(data && data.riderToken){
        if(rider.riderToken !== data.riderToken){ rider.riderToken = data.riderToken; changed = true; }
        delete data.riderToken;
      }
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
    /* Der Typ sagt dem Fahrer, was hier zu tun ist. Kein Geheimnis — er
       steht auf dem gedruckten Manifest. Die Beschriftung dazu holt sich
       die Fahrer-App selbst aus ihrer eigenen Typtabelle, hier geht nur
       der Schlüssel raus. */
    cpType: cp.type || '',
    qrTokenHash: await sha256Hex(cp.qrToken),
    qrEnabled: !!cp.qrCheckinEnabled,
    /* Null statt Hash eines leeren Strings, wenn kein Code erzeugt wurde
       — rider.php prüft in ?a=checkpoint-auth explizit auf NULL, um einen
       Checkpoint ohne Code-Zugang von einem mit (zufällig) leerem Code zu
       unterscheiden. sha256Hex('') wäre ein gültiger, aber falscher Hash. */
    staffCodeHash: cp.staffAccessCode ? await sha256Hex(cp.staffAccessCode) : null,
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
