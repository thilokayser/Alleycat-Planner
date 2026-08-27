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
/* `auth` wandert in Header, nicht in die Query: URLs landen im
   Zugriffsprotokoll des Webservers, ein Token gehört da nicht hin. POST-
   Bodies werden nicht protokolliert, deshalb reisen checkin und register
   ihre Token weiterhin im Body. */
async function riderRequest(method, action, params, body, auth){
  const qs = new URLSearchParams(Object.assign({a: action}, params || {}));
  const headers = {};
  if(body) headers['Content-Type'] = 'application/json';
  if(auth && auth.token) headers['X-Rider-Token'] = auth.token;
  if(auth && auth.code) headers['X-Rider-Code'] = auth.code;

  let res;
  try{
    res = await fetch(riderEndpoint() + '?' + qs.toString(), {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
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
  return riderRequest('GET', 'me', {public_id: session.publicId}, null,
    {token: session.riderToken, code: session.code});
}

function riderApiCheckin(payload){
  return riderRequest('POST', 'checkin', null, payload);
}

function riderApiRegister(payload){
  return riderRequest('POST', 'register', null, payload);
}

function riderApiFreeBibs(publicId){
  return riderRequest('GET', 'freebibs', {public_id: publicId}, null);
}

function riderApiClaim(payload){
  return riderRequest('POST', 'claim', null, payload);
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
    case 'self_register_disabled': return t('riderScan.errSelfRegisterDisabled');
    case 'bib_not_found':        return t('riderScan.errSelfRegisterBibTaken');
    default:                     return t('riderScan.errGeneric');
  }
}
