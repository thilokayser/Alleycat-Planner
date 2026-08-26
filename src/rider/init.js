/* ---------------- Fahrer-App: Einstieg und Aktionen ----------------
   Zwei Wege herein: das URL-Fragment (der Fahrer scannt die Spokecard mit
   der Handy-Kamera und landet direkt hier) oder eine gespeicherte
   Sitzung. Beide enden in riderLoadMe().                               */

const RIDER_PENDING_POLL_MS = 30000;
let riderPendingTimer = null;

async function initRider(){
  document.title = t('riderScan.appTitle');

  /* Ein Wechsel nur am Fragment lädt die Seite NICHT neu. Scannt ein
     Fahrer mit schon offener App eine andere Spokecard, ändert der
     Browser nur den Hash — ohne diesen Zuhörer behielte die App die alte
     Sitzung und zeigte die falsche Startnummer. Beim Bau von Paket 4 im
     Test aufgefallen. */
  if(!window.__riderHashHooked){
    window.__riderHashHooked = true;
    window.addEventListener('hashchange', () => {
      if(parseRiderQrPayload(location.hash)) initRider();
    });
  }

  const fromUrl = parseRiderQrPayload(location.hash);
  if(fromUrl && fromUrl.kind === 'rider'){
    riderState.session = {publicId: fromUrl.publicId, riderToken: fromUrl.riderToken, bib: null};
    riderSaveSession(riderState.session);
    /* Fragment aus der Adresszeile entfernen: das Token soll nicht in der
       History, in Screenshots oder im geteilten Link stehen. Die Sitzung
       liegt jetzt im localStorage. */
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  } else {
    riderState.session = riderLoadSession();
  }

  if(!riderState.session){
    /* Ein Checkpoint-Code als Einstieg ist ein häufiger Griff: der Fahrer
       scannt am ersten Checkpoint, ohne sich vorher angemeldet zu haben.
       Das verdient eine eigene Erklärung, keine generische. */
    if(fromUrl && fromUrl.kind === 'checkpoint') riderState.error = t('riderScan.errIsCheckpoint');
    else if(location.hash && !fromUrl) riderState.error = t('riderScan.errUnreadable');
    riderState.view = 'login';
    renderRider();
    return;
  }

  await riderLoadMe();
}

async function riderLoadMe(){
  riderState.view = 'loading';
  renderRider();

  const res = await riderApiMe(riderState.session);

  if(res.ok){
    riderApplyMe(res.data);
    riderSaveSession(riderState.session);
    riderSaveCache(res.data);
    riderState.offlineSince = '';
    riderState.error = '';
    riderRouteBySlotStatus();
    return;
  }

  /* Ungültiges Token: die Sitzung ist wertlos, also weg damit. Sonst
     hängt der Fahrer in einer Schleife, die er nicht durchbrechen kann. */
  if(res.status === 403){
    riderClearSession();
    riderState.session = null;
    riderState.error = riderErrorMessage(res);
    riderState.view = 'login';
    renderRider();
    return;
  }

  /* Kein Netz: den letzten bekannten Stand zeigen statt einer leeren
     Fehlerseite. Der Fahrer kann damit weiter scannen — das Ergebnis
     landet in der Queue. */
  const cached = riderLoadCache();
  if(cached){
    riderApplyMe(cached.payload);
    riderState.offlineSince = cached.at;
    riderState.error = '';
    riderRouteBySlotStatus();
    return;
  }

  riderState.error = riderErrorMessage(res);
  riderState.errorRetry = 'reload';
  riderState.view = 'error';
  renderRider();
}

function riderRouteBySlotStatus(){
  clearTimeout(riderPendingTimer);
  if(riderState.slotStatus === 'confirmed'){
    riderState.view = 'home';
  } else if(riderState.slotStatus === 'pending'){
    riderState.view = 'pending';
    /* Der Fahrer steht am HQ und wartet auf die Freigabe. Er soll das
       Handy nicht neu laden müssen, während jemand vor ihm bestätigt
       wird. */
    riderPendingTimer = setTimeout(riderLoadMe, RIDER_PENDING_POLL_MS);
  } else {
    riderState.view = 'register';
  }
  renderRider();
}

/* ---------------- Anmeldung ---------------- */

function riderGoLogin(){ riderState.error = ''; riderState.view = 'login'; renderRider(); }
function riderGoCode(){ riderState.error = ''; riderState.view = 'code'; renderRider(); }
function riderGoHome(){ riderState.error = ''; riderState.view = 'home'; renderRider(); }

function riderRecoverFromError(){
  if(riderState.errorRetry === 'reload' && riderState.session){ riderLoadMe(); return; }
  riderState.error = '';
  riderState.view = riderState.errorRetry || (riderState.session ? 'home' : 'login');
  renderRider();
}

function riderStartLoginScan(){
  startRiderScan(payload => {
    const p = parseRiderQrPayload(payload);
    if(!p){ riderGoLoginWithError(t('riderScan.errUnreadable')); return; }
    if(p.kind === 'checkpoint'){ riderGoLoginWithError(t('riderScan.errIsCheckpoint')); return; }
    if(p.kind === 'legacyBib'){
      /* Eine alte Karte trägt nur die Startnummer. Die reicht nicht als
         Zugangsdatum — der Fahrer braucht eine neu gedruckte Karte. */
      riderGoLoginWithError(t('riderScan.errUnknownRider'));
      return;
    }
    riderState.session = {publicId: p.publicId, riderToken: p.riderToken, bib: null};
    riderSaveSession(riderState.session);
    riderLoadMe();
  });
}
function riderGoLoginWithError(msg){
  riderState.error = msg;
  riderState.view = 'login';
  renderRider();
}

function riderSubmitCode(){
  const input = document.getElementById('rider-code-input');
  const code = (input ? input.value : '').trim().toUpperCase();
  if(!code){ return; }

  /* Der Code allein sagt nicht, zu welchem Event er gehört. Ohne
     vorherige Sitzung fehlt die publicId — dann hilft nur die Karte
     scannen, und das sagt die App auch. */
  const known = riderState.session || riderLoadSession();
  if(!known || !known.publicId){
    riderState.error = t('riderScan.errUnknownRider');
    renderRider();
    return;
  }
  riderState.session = {publicId: known.publicId, code, bib: null};
  riderLoadMe();
}

async function riderSubmitRegistration(){
  /* ALLE Felder vor dem ersten renderRider() einlesen. renderRider()
     baut das Formular neu auf und leert damit die Eingabefelder — wer
     danach noch ein Feld liest, bekommt einen leeren String. Genau das
     passierte beim Bau von Paket 4: Name kam an, Kontakt und
     Notfallkontakt gingen leer zum Server, und die Antwort war trotzdem
     ok:true. Aufgefallen erst beim Blick in die Datenbank. */
  const form = {
    name: ((document.getElementById('rider-reg-name') || {}).value || '').trim(),
    contact: ((document.getElementById('rider-reg-contact') || {}).value || '').trim(),
    emergencyContact: ((document.getElementById('rider-reg-emergency') || {}).value || '').trim()
  };

  if(!form.name){
    riderState.error = t('riderScan.registerNameRequired');
    renderRider();
    return;
  }
  riderState.busy = true;
  riderState.error = '';
  renderRider();

  const res = await riderApiRegister({
    publicId: riderState.session.publicId,
    riderToken: riderState.session.riderToken,
    name: form.name,
    contact: form.contact,
    emergencyContact: form.emergencyContact,
    clientUuid: riderUuid()
  });

  riderState.busy = false;
  if(!res.ok){
    riderState.error = riderErrorMessage(res);
    renderRider();
    return;
  }
  await riderLoadMe();
}

/* ---------------- Checkpoint-Scan ---------------- */

function riderStartCheckpointScan(){
  startRiderScan(payload => riderHandleCheckpointPayload(payload));
}

async function riderHandleCheckpointPayload(payload){
  const p = parseRiderQrPayload(payload);

  /* Diese drei Prüfungen laufen ohne Serverruf. Am Checkpoint zählt, dass
     eine falsche Karte sofort eine klare Antwort gibt, statt auf ein
     Netz zu warten, das vielleicht nicht da ist. */
  if(!p){ return riderScanError(t('riderScan.errUnreadable')); }
  if(p.kind === 'rider' || p.kind === 'legacyBib'){ return riderScanError(t('riderScan.errIsSpokecard')); }
  if(p.kind !== 'checkpoint'){ return riderScanError(t('riderScan.errUnreadable')); }
  if(p.publicId !== riderState.session.publicId){ return riderScanError(t('riderScan.errWrongEvent')); }

  const pos = await riderTryGetPosition();

  const body = {
    publicId: p.publicId,
    riderToken: riderState.session.riderToken,
    cpId: p.cpId,
    qrToken: p.qrToken,
    clientUuid: riderUuid(),
    scannedAt: new Date().toISOString()
  };
  if(pos){ body.lat = pos.lat; body.lon = pos.lon; }

  const res = await riderApiCheckin(body);

  if(!res.ok){
    /* 409 heißt "Rennen läuft noch nicht" — ein zeitlicher Zustand, kein
       Fehler des Fahrers. Ab Paket 5 wandert der Eintrag dafür in die
       Queue; bis dahin bleibt es eine Meldung. */
    return riderScanError(riderErrorMessage(res));
  }

  const label = res.data.label || p.cpId;
  const at = res.data.at || res.data.already || new Date().toISOString();
  riderState.progress[p.cpId] = at;
  riderState.confirm = {label, at, already: !!res.data.already && !res.data.at, queued: false};
  riderState.view = 'confirm';
  riderState.error = '';
  renderRider();
}

function riderScanError(msg){
  riderState.error = msg;
  riderState.view = riderState.session ? 'home' : 'login';
  renderRider();
}

/* GPS mit kurzer Leine: drei Sekunden, dann ohne. Ein Fahrer soll nicht
   am Checkpoint stehen und warten, weil das Gerät keinen Fix findet —
   die Position ist Auswertungsmaterial, nicht Voraussetzung. */
function riderTryGetPosition(){
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

function riderUuid(){
  if(crypto.randomUUID) return crypto.randomUUID();
  /* Rückfall für ältere Browser: crypto.randomUUID gibt es erst ab
     Safari 15.4. Die Zufallsquelle bleibt dieselbe. */
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
