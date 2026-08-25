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
