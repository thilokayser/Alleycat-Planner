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

  /* Beide Wächter sind gegen Mehrfachstart abgesichert und dürfen
     deshalb bei jedem initRider() laufen — auch beim erneuten Einstieg
     über einen Hash-Wechsel. */
  startRiderQueueWatch();
  startRiderWakeLock();

  const fromUrl = parseRiderQrPayload(location.hash);
  /* Selbstregistrierung ist der einzige Einstieg ganz ohne Session — der
     Besucher hat weder eine Startnummer noch einen Token, das ist ja
     gerade der Zweck. Muss vor jeder Session-Prüfung abzweigen, sonst
     würde eine zufällig noch gespeicherte alte Session dazwischenfunken.
     Wie beim 'rider'-Zweig unten: ein expliziter Link überschreibt eine
     vorhandene Sitzung bewusst, statt sie stillschweigend zu ignorieren. */
  if(fromUrl && fromUrl.kind === 'selfRegister'){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    riderStartSelfRegister(fromUrl.publicId);
    return;
  }
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
    /* Die Antwort beweist, dass Netz da ist — also gleich abarbeiten,
       statt bis zum nächsten Intervall zu warten. Der Fahrer sieht seine
       nachgereichten Checkpoints dann sofort abgehakt. */
    await riderQueueFlush();
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
    if(p.kind === 'selfRegister'){
      /* Wer beim "Karte scannen" versehentlich den Registrierungs-QR
         erwischt (z. B. beide auf demselben Flyer), landet trotzdem
         richtig statt in einer Session mit riderToken:undefined. */
      riderStartSelfRegister(p.publicId);
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

/* ---------------- Selbstregistrierung (Teilprojekt 3) ----------------
   Eigener Einstieg neben riderLoadMe() oben: der Besucher hat noch keine
   Session, also gibt es hier nichts zu laden außer der freien
   Startnummernliste. riderState.session bleibt null, bis riderSubmitClaim()
   erfolgreich eine Session erzeugt — genau wie beim Scan-Login (Zeile
   145-165), nur ohne dass der Besucher je einen Token besessen hätte. */
async function riderStartSelfRegister(publicId){
  riderState.selfRegisterPublicId = publicId;
  riderState.selfRegisterBib = null;
  riderState.view = 'selfRegisterList';
  riderState.error = '';
  renderRider();
  await riderReloadFreeBibs();
}
async function riderReloadFreeBibs(){
  const res = await riderApiFreeBibs(riderState.selfRegisterPublicId);
  if(!res.ok){
    riderState.error = riderErrorMessage(res);
    riderState.selfRegisterFreeBibs = [];
    renderRider();
    return;
  }
  riderState.selfRegisterFreeBibs = res.data.free || [];
  renderRider();
}
function riderPickSelfRegisterBib(bib){
  riderState.selfRegisterBib = bib;
  riderState.error = '';
  riderState.view = 'selfRegisterForm';
  renderRider();
}
function riderGoSelfRegisterList(){
  riderState.error = '';
  riderState.view = 'selfRegisterList';
  renderRider();
  riderReloadFreeBibs();
}
async function riderSubmitClaim(){
  /* Gleiche Reihenfolge-Regel wie riderSubmitRegistration() oben: alle
     Felder VOR dem ersten renderRider() lesen. */
  const form = {
    name: ((document.getElementById('rider-reg-name') || {}).value || '').trim(),
    contact: ((document.getElementById('rider-reg-contact') || {}).value || '').trim()
  };
  if(!form.name){
    riderState.error = t('riderScan.registerNameRequired');
    renderRider();
    return;
  }
  riderState.busy = true;
  riderState.error = '';
  renderRider();

  const res = await riderApiClaim({
    publicId: riderState.selfRegisterPublicId,
    bib: riderState.selfRegisterBib,
    name: form.name,
    contact: form.contact,
    clientUuid: riderUuid()
  });

  riderState.busy = false;
  if(!res.ok){
    riderState.error = riderErrorMessage(res);
    /* Vergeben, während der Besucher das Formular ausfüllt — zurück zur
       (neu geladenen) Liste statt eines Fehlers, den ein erneuter
       Versuch mit derselben Nummer nur wiederholen würde. */
    if(res.error === 'bib_not_found' || res.error === 'slot_taken'){
      riderState.view = 'selfRegisterList';
      riderReloadFreeBibs();
      return;
    }
    renderRider();
    return;
  }
  riderState.session = {publicId: riderState.selfRegisterPublicId, riderToken: res.data.riderToken, bib: res.data.bib};
  riderSaveSession(riderState.session);
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
  const scannedAt = new Date().toISOString();

  const body = {
    publicId: p.publicId,
    riderToken: riderState.session.riderToken,
    cpId: p.cpId,
    qrToken: p.qrToken,
    clientUuid: riderUuid(),
    scannedAt
  };
  if(pos){ body.lat = pos.lat; body.lon = pos.lon; }

  /* ERST puffern, DANN senden. Bricht die App zwischen diesen beiden
     Zeilen ab, ist der Scan gesichert; der uq_client-Index macht das
     spätere Doppelsenden folgenlos. Andersherum wäre ein Absturz nach
     dem Absenden ein verlorener Checkpoint. */
  riderQueueAdd({clientUuid: body.clientUuid, body});

  const res = await riderApiCheckin(body);
  const verdict = riderQueueVerdict(res);
  if(verdict.done) riderQueueRemove(body.clientUuid);

  /* Ein 403 heißt: dieser Scan wird nie gültig (falsches Token, QR-
     Check-in aus, Slot nicht bestätigt). Dann gehört die Meldung dem
     Fahrer, nicht der Queue. */
  if(verdict.done && !res.ok){
    return riderScanError(verdict.message || riderErrorMessage(res));
  }

  /* Alles andere bestätigt dem Fahrer den Scan — auch ohne Netz. Er
     steht am Checkpoint und muss weiterfahren können; ob das Paket schon
     beim Server ist, ist nicht seine Sorge. */
  const label = res.ok
    ? (res.data.label || p.cpId)
    : (riderCheckpointLabel(p.cpId) || p.cpId);
  const at = res.ok ? (res.data.at || res.data.already || scannedAt) : scannedAt;

  riderState.progress[p.cpId] = at;
  riderState.confirm = {
    label,
    at,
    already: res.ok && !!res.data.already && !res.data.at,
    queued: !res.ok
  };
  riderState.view = 'confirm';
  riderState.error = '';
  renderRider();
}

/* Ohne Netz kommt kein Label vom Server — dann aus der eigenen
   Checkpoint-Liste nehmen. Der Fahrer soll auch offline lesen, WO er
   eingecheckt hat, nicht bloß eine Kennung. */
function riderCheckpointLabel(cpId){
  const cp = riderState.checkpoints.find(c => c.cpId === cpId);
  return cp ? cp.label : '';
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
