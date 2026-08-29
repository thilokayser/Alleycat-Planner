/* ---------------- Checkpoint-App: Einstieg und Aktionen ----------------
   Anders als die Fahrer-App gibt es hier keinen QR-getriebenen Einstieg:
   das Gerät bleibt dauerhaft einem Checkpoint (Code-Modus) oder einem
   Checkpoint-Personal-Konto (Konten-Modus) zugeordnet, einmal angemeldet
   bis zum expliziten Logout. */

async function initCheckpointApp(){
  document.title = t('checkpointScan.appTitle');
  startCpQueueWatch();
  startCpWakeLock();

  cpState.session = cpLoadSession();
  if(!cpState.session){
    cpState.view = 'login';
    renderCp();
    return;
  }
  await cpLoadMe();
}

async function cpLoadMe(){
  cpState.view = 'loading';
  renderCp();

  const res = await cpApiMe();
  if(res.ok){
    cpApplyMe(res.data);
    cpSaveCache(res.data);
    cpState.offlineSince = '';
    cpState.error = '';
    if(!cpState.activeCpId || !cpState.checkpoints.some(c => c.cpId === cpState.activeCpId)){
      cpState.activeCpId = cpState.checkpoints.length ? cpState.checkpoints[0].cpId : null;
    }
    const flush = await cpQueueFlush();
    if(flush.authDead){ cpGoLoginExpired(); return; }
    cpState.view = 'home';
    renderCp();
    return;
  }

  if(res.status === 401){
    cpGoLoginExpired();
    return;
  }

  const cached = cpLoadCache();
  if(cached){
    cpApplyMe(cached.payload);
    cpState.offlineSince = cached.at;
    cpState.error = '';
    if(!cpState.activeCpId || !cpState.checkpoints.some(c => c.cpId === cpState.activeCpId)){
      cpState.activeCpId = cpState.checkpoints.length ? cpState.checkpoints[0].cpId : null;
    }
    cpState.view = 'home';
    renderCp();
    return;
  }

  cpState.error = cpErrorMessage(res);
  cpState.errorRetry = 'reload';
  cpState.view = 'error';
  renderCp();
}

function cpGoLoginExpired(){
  cpClearSession();
  cpState.session = null;
  cpState.error = t('checkpointScan.errUnauthorized');
  cpState.view = 'login';
  renderCp();
}

function cpSetLoginMode(mode){
  cpState.loginMode = mode;
  cpState.error = '';
  renderCp();
}

async function cpSubmitLogin(){
  const publicId = ((document.getElementById('cp-login-publicid') || {}).value || '').trim();
  if(!publicId){ cpState.error = t('checkpointScan.errGeneric'); renderCp(); return; }

  cpState.busy = true;
  cpState.error = '';
  renderCp();

  let res, session;
  if(cpState.loginMode === 'account'){
    const username = ((document.getElementById('cp-login-username') || {}).value || '').trim();
    const password = (document.getElementById('cp-login-password') || {}).value || '';
    res = await cpApiAuthByAccount(publicId, username, password);
    session = res.ok ? {publicId, token: res.data.token, headerName: 'X-Admin-Token'} : null;
  } else {
    const cpId = ((document.getElementById('cp-login-cpid') || {}).value || '').trim();
    const code = ((document.getElementById('cp-login-code') || {}).value || '').trim().toUpperCase();
    res = await cpApiAuthByCode(publicId, cpId, code);
    session = res.ok ? {publicId, token: res.data.token, headerName: 'X-Checkpoint-Token'} : null;
  }

  cpState.busy = false;
  if(!res.ok){
    cpState.error = cpErrorMessage(res);
    renderCp();
    return;
  }
  cpState.session = session;
  cpSaveSession(session);
  await cpLoadMe();
}

async function cpLogout(){
  await cpApiLogout();
  cpClearSession();
  cpState.session = null;
  cpState.view = 'login';
  cpState.error = '';
  renderCp();
}

function cpGoHome(){ cpState.error = ''; cpState.view = 'home'; renderCp(); }

function cpRecoverFromError(){
  if(cpState.errorRetry === 'reload' && cpState.session){ cpLoadMe(); return; }
  cpState.error = '';
  cpState.view = cpState.errorRetry || (cpState.session ? 'home' : 'login');
  renderCp();
}

function cpSetActiveCheckpoint(cpId){
  cpState.activeCpId = cpId;
  renderCp();
}

/* ---------------- Scan/Check-in ---------------- */

function cpStartRiderScan(){
  startCpScan(payload => cpHandleRiderPayload(payload));
}

async function cpHandleRiderPayload(payload){
  const p = parseRiderQrPayload(payload);
  if(!p){ return cpScanError(t('checkpointScan.errUnreadable')); }
  if(p.kind === 'checkpoint'){ return cpScanError(t('checkpointScan.errIsCheckpoint')); }
  if(p.kind === 'selfRegister'){ return cpScanError(t('checkpointScan.errUnreadable')); }

  if(p.kind === 'legacyBib'){
    await cpSubmitCheckin({bib: p.bib});
    return;
  }
  /* p.kind === 'rider' — die Spokecard trägt einen riderToken, aber der
     gehört zu einem ANDEREN Event als dem, an das dieses Gerät gebunden
     ist, wenn publicId nicht passt. Trotzdem wird der Token mitgeschickt:
     ein falsches Event meldet der Server selbst (unknown_rider), das
     spart eine zweite Fehlerklasse hier. */
  await cpSubmitCheckin({riderToken: p.riderToken});
}

function cpSubmitBibFallback(){
  const input = document.getElementById('cp-bib-input');
  const bib = parseInt((input ? input.value : '').trim(), 10);
  if(!Number.isFinite(bib) || bib <= 0) return;
  cpSubmitCheckin({bib});
}

async function cpSubmitCheckin(identity){
  if(!cpState.activeCpId){ return cpScanError(t('checkpointScan.errCheckpointNotAssigned')); }

  const pos = await cpTryGetPosition();
  const scannedAt = new Date().toISOString();
  const body = Object.assign({
    publicId: cpState.session.publicId,
    cpId: cpState.activeCpId,
    clientUuid: cpUuid(),
    scannedAt
  }, identity);
  if(pos){ body.lat = pos.lat; body.lon = pos.lon; }

  /* ERST puffern, DANN senden — gleiche Reihenfolge-Regel wie in der
     Fahrer-App (siehe src/rider/init.js), aus demselben Grund: ein
     Absturz nach dem Absenden darf den Scan nicht kosten. */
  cpQueueAdd({clientUuid: body.clientUuid, body});

  const res = await cpApiCheckin(body);
  const verdict = cpQueueVerdict(res);
  if(verdict.authDead){
    /* Der Scan bleibt in der Queue — er wird nach erneuter Anmeldung
       automatisch nachgereicht. Nur die Anzeige geht zurück zum Login. */
    cpGoLoginExpired();
    return;
  }
  if(verdict.done) cpQueueRemove(body.clientUuid);

  if(verdict.done && !res.ok){
    return cpScanError(verdict.message || cpErrorMessage(res));
  }

  const cp = cpState.checkpoints.find(c => c.cpId === cpState.activeCpId);
  cpState.confirm = {
    label: res.ok ? (res.data.label || (cp ? cp.label : cpState.activeCpId)) : (cp ? cp.label : cpState.activeCpId),
    bib: res.ok ? res.data.bib : identity.bib,
    at: res.ok ? (res.data.at || res.data.already || scannedAt) : scannedAt,
    already: res.ok && !!res.data.already && !res.data.at,
    queued: !res.ok
  };
  cpState.view = 'confirm';
  cpState.error = '';
  renderCp();
}

function cpScanError(msg){
  cpState.error = msg;
  cpState.view = cpState.session ? 'home' : 'login';
  renderCp();
}

function cpTryGetPosition(){
  return new Promise(resolve => {
    if(!navigator.geolocation) return resolve(null);
    let done = false;
    const finish = v => { if(!done){ done = true; resolve(v); } };
    setTimeout(() => finish(null), 3000);
    try{
      navigator.geolocation.getCurrentPosition(
        p => finish({lat: p.coords.latitude, lon: p.coords.longitude}),
        () => finish(null),
        {timeout: 3000, maximumAge: 60000}
      );
    }catch(e){ finish(null); }
  });
}

function cpUuid(){
  if(crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
