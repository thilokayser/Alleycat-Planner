/* ===================================================================
   Alleycat Dispatch — Test-Suite der Fahrer-App
   -------------------------------------------------------------------
   Gegenstück zu test-suite.js, aber für dist/alleycat-rider.html.
   Zwei Suiten statt einer, weil die beiden Bundles keinen gemeinsamen
   Laufzeitzustand haben: `state`, `render()` und die Speicherschicht des
   Organizers existieren hier gar nicht.

   Aufruf: Inhalt in die Browser-Konsole der laufenden Fahrer-App
   einfügen, dann runRiderTestSuite().

   Kein Server nötig — jeder Netzaufruf wird gestubbt. Das ist Absicht:
   die Zusagen, die hier geprüft werden (Queue verliert nichts, Cache
   trägt offline, falsche Codes werden vor dem Serverruf abgewiesen),
   sind gerade die, die OHNE Server gelten müssen.
   =================================================================== */

async function runRiderTestSuite(){
  const results = [];
  const check = (label, cond) => {
    results.push({label, pass: !!cond});
    console.log((cond ? '✅' : '❌') + ' ' + label);
  };
  const checkEqual = (label, actual, expected) =>
    check(`${label} (erwartet: ${JSON.stringify(expected)}, erhalten: ${JSON.stringify(actual)})`, actual === expected);

  console.log('%c--- Fahrer-App Test-Suite ---', 'font-weight:bold; font-size:14px;');

  /* Alles sichern, was die Suite anfasst, und am Ende zurückgeben —
     sonst hinterlässt ein Testlauf eine App, in der nichts mehr geht. */
  const saved = {
    fetch: window.fetch,
    session: localStorage.getItem('alleycat-rider:session'),
    cache: localStorage.getItem('alleycat-rider:cache'),
    queue: localStorage.getItem('alleycat-rider:queue'),
    state: JSON.parse(JSON.stringify(riderState)),
    geolocation: navigator.geolocation
  };

  const PID = 'testevent001';
  const TOK = 'a'.repeat(32);
  const QR = 'c'.repeat(32);
  const base = 'https://x.tld/alleycat-rider.html';

  /* Netz-Attrappe. `plan` bestimmt, was der nächste Aufruf zurückgibt;
     `calls` protokolliert, was tatsächlich rausgegangen wäre. */
  let plan = [];
  let calls = [];
  const stubFetch = () => {
    window.fetch = async (url, opts) => {
      calls.push({url: String(url), body: opts && opts.body ? JSON.parse(opts.body) : null});
      const next = plan.shift();
      if(!next || next.network === false) throw new TypeError('Failed to fetch');
      return {
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        headers: {get: () => next.retryAfter || null},
        json: async () => next.body || {}
      };
    };
  };
  const resetAll = () => {
    plan = []; calls = [];
    localStorage.removeItem('alleycat-rider:queue');
    localStorage.removeItem('alleycat-rider:cache');
    riderState.session = {publicId: PID, riderToken: TOK, bib: 7};
    riderState.checkpoints = [
      {cpId: 'cp-a', label: 'Dom', cpType: 'photo', qrEnabled: true, lat: null, lon: null},
      {cpId: 'cp-b', label: 'Hafen', cpType: 'challenge', qrEnabled: false, lat: null, lon: null}
    ];
    riderState.progress = {};
    riderState.error = '';
    riderState.view = 'home';
    riderState.offlineSince = '';
  };
  /* GPS ausschalten: sonst wartet jeder Scan-Test drei Sekunden auf
     einen Fix, den es im Testlauf nie gibt. */
  try{ Object.defineProperty(navigator, 'geolocation', {value: undefined, configurable: true}); }catch(e){}

  stubFetch();

  /* ---------------- 1) QR-Nutzlast: Abweisung vor dem Serverruf ---- */
  {
    resetAll();
    const cases = [
      ['Müll', 'hallo welt'],
      ['Leerstring', ''],
      ['eigene Spokecard', base + '#r.' + PID + '.' + TOK],
      ['alte nackte Startnummer', '42'],
      ['fremdes Event', base + '#c.anderesevent.cp-a.' + QR],
      ['zu kurze publicId', base + '#c.kurz.cp-a.' + QR],
      ['zu kurzes QR-Token', base + '#c.' + PID + '.cp-a.abc']
    ];
    for(const [name, payload] of cases){
      resetAll();
      await riderHandleCheckpointPayload(payload);
      check(`${name} wird abgewiesen`, !!riderState.error);
      checkEqual(`${name} löst keinen Serverruf aus`, calls.length, 0);
      checkEqual(`${name} schreibt nichts in die Queue`, riderQueueLength(), 0);
    }
  }

  /* ---------------- 2) Erst puffern, dann senden ---------------- */
  {
    resetAll();
    /* Absturz beim Senden nachstellen: der Netzaufruf wirft, der Eintrag
       muss trotzdem in der Queue liegen. */
    plan = [{network: false}];
    await riderHandleCheckpointPayload(base + '#c.' + PID + '.cp-a.' + QR);
    checkEqual('Scan ohne Netz landet in der Queue', riderQueueLength(), 1);
    checkEqual('Fahrer sieht trotzdem eine Bestätigung', riderState.view, 'confirm');
    checkEqual('Bestätigung ist als gepuffert markiert', riderState.confirm.queued, true);
    checkEqual('Bestätigung nennt den Checkpoint-Namen', riderState.confirm.label, 'Dom');
    check('Fortschritt wird sofort gesetzt', !!riderState.progress['cp-a']);

    const q = riderQueueLoad()[0];
    check('Queue-Eintrag trägt eine clientUuid', !!q.clientUuid);
    check('Queue-Eintrag trägt den Scan-Zeitpunkt', !!q.body.scannedAt);
    checkEqual('Queue-Eintrag trägt die cpId', q.body.cpId, 'cp-a');
  }

  /* ---------------- 3) Die fünf Antwortfälle ---------------- */
  {
    const faelle = [
      ['200 ok',                   {status: 200, body: {ok: true, label: 'Dom', at: '2026-08-26 10:00:00'}}, 0],
      ['200 duplicate',            {status: 200, body: {ok: true, duplicate: true, already: '2026-08-26 09:00:00'}}, 0],
      ['200 already',              {status: 200, body: {ok: true, already: '2026-08-26 09:00:00'}}, 0],
      ['403 (nie gültig)',         {status: 403, body: {error: 'qr_checkin_disabled'}}, 0],
      ['409 race_not_running',     {status: 409, body: {error: 'race_not_running'}}, 1],
      ['500 Serverfehler',         {status: 500, body: {}}, 1],
      ['kein Netz',                {network: false}, 1]
    ];
    for(const [name, antwort, erwarteteRestlaenge] of faelle){
      resetAll();
      riderQueueAdd({clientUuid: 'u-' + name, body: {publicId: PID, riderToken: TOK, cpId: 'cp-a', qrToken: QR, clientUuid: 'u-' + name, scannedAt: '2026-08-26T09:00:00Z'}});
      plan = [antwort];
      await riderQueueFlush();
      checkEqual(`${name}: Queue danach`, riderQueueLength(), erwarteteRestlaenge);
    }
  }

  /* ---------------- 4) Queue-Eigenschaften ---------------- */
  {
    resetAll();
    const entry = {clientUuid: 'u-1', body: {cpId: 'cp-a'}};
    riderQueueAdd(entry);
    riderQueueAdd(entry);
    checkEqual('Derselbe Eintrag wird nicht doppelt gepuffert', riderQueueLength(), 1);

    riderQueueAdd({clientUuid: 'u-2', body: {cpId: 'cp-b'}});
    checkEqual('Zwei verschiedene Einträge werden beide gepuffert', riderQueueLength(), 2);

    /* Der Reload-Test: die Queue liegt im localStorage, nicht im
       Speicher. Genau das ist der Grund, warum ein Neuladen im Funkloch
       Bequemlichkeit kostet, aber keine Daten. */
    const rohAusSpeicher = JSON.parse(localStorage.getItem('alleycat-rider:queue'));
    checkEqual('Queue überlebt einen Reload (liegt im localStorage)', rohAusSpeicher.length, 2);

    riderQueueRemove('u-1');
    checkEqual('Einzelner Eintrag lässt sich streichen', riderQueueLength(), 1);
    checkEqual('Es bleibt der richtige übrig', riderQueueLoad()[0].clientUuid, 'u-2');
  }

  /* ---------------- 5) Kein Netz: Abbruch statt Reihenversagen ------ */
  {
    resetAll();
    for(let i = 1; i <= 3; i++){
      riderQueueAdd({clientUuid: 'n-' + i, body: {publicId: PID, riderToken: TOK, cpId: 'cp-' + i, qrToken: QR, clientUuid: 'n-' + i, scannedAt: '2026-08-26T09:00:00Z'}});
    }
    plan = [{network: false}, {network: false}, {network: false}];
    await riderQueueFlush();
    checkEqual('Alle drei Einträge bleiben ohne Netz erhalten', riderQueueLength(), 3);
    checkEqual('Ohne Netz wird nach dem ersten Fehlschlag abgebrochen', calls.length, 1);
  }

  /* ---------------- 6) Nachreichen bei Netzrückkehr ---------------- */
  {
    resetAll();
    riderQueueAdd({clientUuid: 'r-1', body: {publicId: PID, riderToken: TOK, cpId: 'cp-a', qrToken: QR, clientUuid: 'r-1', scannedAt: '2026-08-26T09:00:00Z'}});
    riderQueueAdd({clientUuid: 'r-2', body: {publicId: PID, riderToken: TOK, cpId: 'cp-b', qrToken: QR, clientUuid: 'r-2', scannedAt: '2026-08-26T09:05:00Z'}});
    plan = [
      {status: 200, body: {ok: true, label: 'Dom', at: '2026-08-26 09:00:00'}},
      {status: 200, body: {ok: true, label: 'Hafen', at: '2026-08-26 09:05:00'}}
    ];
    const res = await riderQueueFlush();
    checkEqual('Beide nachgereichten Scans gehen raus', calls.length, 2);
    checkEqual('Queue ist danach leer', riderQueueLength(), 0);
    checkEqual('Flush meldet die Änderung', res.changed, true);
    checkEqual('Fortschritt für cp-a übernommen', riderState.progress['cp-a'], '2026-08-26 09:00:00');
    checkEqual('Fortschritt für cp-b übernommen', riderState.progress['cp-b'], '2026-08-26 09:05:00');
  }

  /* ---------------- 7) Leerlauf meldet keine Änderung -------------- */
  {
    resetAll();
    const res = await riderQueueFlush();
    checkEqual('Leere Queue meldet keine Änderung', res.changed, false);
    checkEqual('Leere Queue löst keinen Serverruf aus', calls.length, 0);
  }

  /* ---------------- 8) Cache trägt offline ---------------- */
  {
    resetAll();
    riderSaveCache({
      event: {name: 'Kölner Kurierrennen', status: 'running'},
      settings: {progress: true},
      bib: 7, slotStatus: 'confirmed',
      checkpoints: [{cpId: 'cp-a', label: 'Dom', cpType: 'photo', qrEnabled: true}],
      progress: {'cp-a': '2026-08-26 08:00:00'}
    });
    plan = [{network: false}];
    await riderLoadMe();
    checkEqual('Ohne Netz wird der Cache gezeigt', riderState.view, 'home');
    check('Offline-Banner wird gesetzt', !!riderState.offlineSince);
    checkEqual('Eventname kommt aus dem Cache', riderState.event.name, 'Kölner Kurierrennen');
    checkEqual('Umlaut im Cache übersteht den Reload', riderState.event.name.includes('ö'), true);
    checkEqual('Fortschritt kommt aus dem Cache', riderState.progress['cp-a'], '2026-08-26 08:00:00');

    localStorage.removeItem('alleycat-rider:cache');
    plan = [{network: false}];
    await riderLoadMe();
    checkEqual('Ohne Cache und ohne Netz: ehrliche Fehleransicht', riderState.view, 'error');
    check('Fehlermeldung nennt die Verbindung', riderState.error.length > 0);
  }

  /* ---------------- 9) Ungültiges Token räumt die Sitzung ---------- */
  {
    resetAll();
    riderSaveSession(riderState.session);
    plan = [{status: 403, body: {error: 'invalid_rider'}}];
    await riderLoadMe();
    checkEqual('403 führt zurück zur Anmeldung', riderState.view, 'login');
    checkEqual('403 löscht die wertlose Sitzung', localStorage.getItem('alleycat-rider:session'), null);
  }

  /* ---------------- 10) Zustandsmaschine ---------------- */
  {
    const wege = [
      ['confirmed', 'home'],
      ['free', 'register'],
      ['pending', 'pending'],
      ['', 'register']
    ];
    for(const [slotStatus, erwartet] of wege){
      resetAll();
      plan = [{status: 200, body: {event: {name: 'E', status: 'running'}, settings: {}, bib: 7, slotStatus, checkpoints: [], progress: {}}}];
      await riderLoadMe();
      checkEqual(`slotStatus "${slotStatus}" führt zu "${erwartet}"`, riderState.view, erwartet);
    }
    clearTimeout(typeof riderPendingTimer !== 'undefined' ? riderPendingTimer : null);
  }

  /* ---------------- 11) Typ-Auflösung ---------------- */
  {
    const bekannt = riderResolveType('photo');
    checkEqual('Bekannter Typ wird aufgelöst', bekannt.known, true);
    check('Bekannter Typ hat eine Beschriftung', bekannt.label.length > 0);

    const eigen = riderResolveType('custom-bierdusche');
    checkEqual('Eigener Typ des Organizers gilt als unbekannt', eigen.known, false);
    check('Unbekannter Typ behauptet nicht, QR zu sein', eigen.label !== getCheckpointType('qr').fullLabel);

    const leer = riderResolveType('');
    checkEqual('Leerer Typ gilt als unbekannt', leer.known, false);
  }

  /* ---------------- Aufräumen ---------------- */
  window.fetch = saved.fetch;
  try{ Object.defineProperty(navigator, 'geolocation', {value: saved.geolocation, configurable: true}); }catch(e){}
  const restore = (k, v) => v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  restore('alleycat-rider:session', saved.session);
  restore('alleycat-rider:cache', saved.cache);
  restore('alleycat-rider:queue', saved.queue);
  Object.assign(riderState, saved.state);
  renderRider();

  const failed = results.filter(r => !r.pass);
  console.log(`%c--- Ergebnis: ${results.length - failed.length}/${results.length} bestanden ---`,
    `font-weight:bold; font-size:13px; ${failed.length ? 'color:#c0392b' : 'color:#2e7d32'}`);
  if(failed.length) console.table(failed);
  return {total: results.length, passed: results.length - failed.length, failed: failed.length, results};
}
if(typeof window !== 'undefined') window.runRiderTestSuite = runRiderTestSuite;
