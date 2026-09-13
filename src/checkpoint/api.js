/* ---------------- Checkpoint-App: Serverzugriff ----------------
   Kennt genau einen Endpunkt: rider.php, dieselbe Datei wie die
   Fahrer-App — nur andere Aktionen (checkpoint-*). Der Admin-API-Key
   kommt hier nicht vor: Konten-Modus schickt X-Admin-Token (Rolle
   'checkpoint_staff'), Code-Modus X-Checkpoint-Token. Welcher Header
   gilt, steht in cpState.session.headerName (siehe state.js). */

/* Wo rider.php liegt, ist konfigurierbar — Reihenfolge:
   1. <meta name="alleycat-endpoint" content="..."> im Kopf dieser Datei.
      Absolut oder relativ zur HTML-Datei. Das ist die eine Zeile, die ein
      Betreiber anfasst, wenn die App NICHT neben dem Backend liegt.
   2. Sonst rider.php im selben Ordner wie diese HTML-Datei (Normalfall).
   Bewusst kein Query-Parameter und kein Feld im Browser: die App trägt
   Fahrer- und Checkpoint-Token, ein per Link umlenkbarer Endpunkt wäre
   ein Weg, genau die abzugreifen. */
function alleycatConfiguredEndpoint(){
  const meta = document.querySelector('meta[name="alleycat-endpoint"]');
  const raw = meta && meta.content ? meta.content.trim() : '';
  if(!raw) return '';
  try{ return new URL(raw, location.href).href; }
  catch(e){ console.error('alleycat-endpoint ungültig, nutze Standardpfad', raw); return ''; }
}
function cpEndpoint(){
  return alleycatConfiguredEndpoint() || location.href.replace(/[^\/]*(\?.*)?(#.*)?$/, 'rider.php');
}

async function cpRequest(method, action, params, body, authHeader){
  const qs = new URLSearchParams(Object.assign({a: action}, params || {}));
  const headers = {};
  if(body) headers['Content-Type'] = 'application/json';
  if(authHeader) headers[authHeader.name] = authHeader.value;

  let res;
  try{
    res = await fetch(cpEndpoint() + '?' + qs.toString(), {
      method,
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  }catch(e){
    return {ok: false, status: 0, error: 'network'};
  }

  let data = null;
  try{ data = await res.json(); }catch(e){}

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

function cpAuthHeader(){
  const s = cpState.session;
  return s ? {name: s.headerName, value: s.token} : null;
}

function cpApiAuthByCode(publicId, cpId, code){
  return cpRequest('POST', 'checkpoint-auth', null, {publicId, cpId, code});
}
function cpApiAuthByAccount(publicId, username, password){
  return cpRequest('POST', 'checkpoint-login', null, {publicId, username, password});
}
function cpApiMe(){
  return cpRequest('GET', 'checkpoint-me', {public_id: cpState.session.publicId}, null, cpAuthHeader());
}
function cpApiCheckin(payload){
  return cpRequest('POST', 'checkpoint-checkin', null, payload, cpAuthHeader());
}
function cpApiLogout(){
  return cpRequest('POST', 'checkpoint-logout', null, {}, cpAuthHeader());
}

function cpErrorMessage(res){
  if(res.status === 0) return t('checkpointScan.errNetwork');
  if(res.status === 429) return t('checkpointScan.errRateLimited', {seconds: res.retryAfter || 60});
  if(res.status === 401) return t('checkpointScan.errUnauthorized');
  switch(res.error){
    case 'invalid_code':              return t('checkpointScan.errInvalidCode');
    case 'invalid_credentials':       return t('checkpointScan.errInvalidCredentials');
    case 'no_checkpoints_assigned':   return t('checkpointScan.errNoCheckpointsAssigned');
    case 'unauthorized':              return t('checkpointScan.errUnauthorized');
    case 'checkpoint_not_assigned':   return t('checkpointScan.errCheckpointNotAssigned');
    case 'unknown_rider':             return t('checkpointScan.errUnknownRider');
    case 'slot_not_confirmed':        return t('checkpointScan.errNotConfirmed');
    case 'race_not_running':          return t('checkpointScan.errRaceNotRunning');
    default:                          return t('checkpointScan.errGeneric');
  }
}
