/* ---------------- Fahrer-App: Serverzugriff ----------------
   Kennt genau einen Endpunkt: rider.php. Der Admin-API-Key kommt hier
   nicht vor und darf es nie — die Fahrer-App authentifiziert
   ausschließlich über die Token von Spokecard und Checkpoint.          */

/* rider.php liegt relativ zu dieser HTML-Datei. Das ist die EINZIGE
   Annahme der Fahrer-App über Pfade. Sie steht hier ausdrücklich, damit
   ein späteres Verschieben der Datei nicht rätselhaft scheitert: liegt
   die App woanders als das Backend, muss diese Funktion angepasst
   werden. */
function riderEndpoint(){
  return location.href.replace(/[^\/]*(\?.*)?(#.*)?$/, 'rider.php');
}

/* Vereinheitlicht, was die Aufrufer sehen. Netzwerkfehler und
   Serverfehler kommen als dieselbe Form zurück, damit keine Aufrufstelle
   zwei Fehlerwelten auseinanderhalten muss:
     {ok:true, data}
     {ok:false, status, error, retryAfter}
   status 0 heißt "gar nicht angekommen" — das ist der Fall, den die
   Offline-Queue später behandelt. */
async function riderRequest(method, action, params, body){
  const qs = new URLSearchParams(Object.assign({a: action}, params || {}));
  let res;
  try{
    res = await fetch(riderEndpoint() + '?' + qs.toString(), {
      method,
      headers: body ? {'Content-Type': 'application/json'} : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  }catch(e){
    return {ok: false, status: 0, error: 'network'};
  }

  let data = null;
  try{ data = await res.json(); }catch(e){ /* leerer oder kaputter Body */ }

  if(!res.ok){
    return {
      ok: false,
      status: res.status,
      error: (data && data.error) || 'http_' + res.status,
      retryAfter: parseInt(res.headers.get('Retry-After') || '0', 10) || 0
    };
  }
  return {ok: true, data: data || {}};
}

function riderApiMe(session){
  const params = {public_id: session.publicId};
  if(session.riderToken) params.token = session.riderToken;
  else if(session.code) params.code = session.code;
  return riderRequest('GET', 'me', params);
}

function riderApiCheckin(payload){
  return riderRequest('POST', 'checkin', null, payload);
}

function riderApiRegister(payload){
  return riderRequest('POST', 'register', null, payload);
}

/* Serverfehlercodes in Sätze, die am Checkpoint weiterhelfen. Bewusst
   eine Tabelle statt verstreuter if-Ketten: die Codes kommen aus
   rider.php und sollen dort und hier nebeneinander lesbar bleiben. */
function riderErrorMessage(res){
  if(res.status === 0) return t('riderScan.errNetwork');
  if(res.status === 429) return t('riderScan.errRateLimited', {seconds: res.retryAfter || 60});
  switch(res.error){
    case 'invalid_rider':        return t('riderScan.errUnknownRider');
    case 'unknown_event':        return t('riderScan.errUnknownRider');
    case 'invalid_checkpoint':   return t('riderScan.errUnknownCheckpoint');
    case 'qr_checkin_disabled':  return t('riderScan.errQrDisabled');
    case 'slot_not_confirmed':   return t('riderScan.errNotConfirmed');
    case 'race_not_running':     return t('riderScan.errRaceNotRunning');
    case 'slot_taken':           return t('riderScan.errSlotTaken');
    default:                     return t('riderScan.errGeneric');
  }
}
