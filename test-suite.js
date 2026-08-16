/* Alleycat Dispatch — Test-Suite
   ------------------------------------------------------------------
   Prüft alle Kernfunktionen der App End-to-End: Event-CRUD, alle
   Checkpoint-Typen (config-driven über CHECKPOINT_TYPES), Fahrerliste,
   Teams (anlegen/zuordnen/Persistenz/Löschen), kompletter Ziel-Check-in-Flow
   (bestätigen/zurücksetzen/Undo-Toast/Speichern & schließen/Übersicht),
   Leaderboard inkl. Team-Wertung-Tab, Manifest, PDF-Export
   (Startnummern + Spokecards) und Storage-Roundtrip.

   Läuft UNVERÄNDERT gegen beide gebauten Varianten (erst `node build.js`):
     - dist/alleycat-dispatch-local.html   (SQLite via sql.js/IndexedDB, oder window.storage)
     - dist/alleycat-dispatch-server.html  (PHP/MySQL-Backend, oder window.storage)
   Die SQLite-spezifischen Zusatz-Checks (Export -> Re-Import) laufen
   automatisch nur mit, wenn eine `sqlDb`-Instanz im Scope existiert (also
   gegen dist/alleycat-dispatch-local.html).

   Verwendung: Diesen Datei-Inhalt in der Browser-Konsole der laufenden
   App einfügen (oder per <script src="test-suite.js"> temporär laden)
   und anschließend `runAlleycatTestSuite()` aufrufen.
   ------------------------------------------------------------------ */
async function runAlleycatTestSuite(){
  const results = [];
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function check(label, cond){
    results.push({label, pass: !!cond});
    console.log((cond ? '✅' : '❌') + ' ' + label);
  }
  function checkEqual(label, actual, expected){
    check(`${label} (erwartet: ${JSON.stringify(expected)}, erhalten: ${JSON.stringify(actual)})`, actual === expected);
  }
  async function checkNoThrowAsync(label, fn){
    try{ await fn(); check(label, true); }
    catch(e){ console.error(e); check(label + ' -> Fehler: ' + e.message, false); }
  }

  console.log('%c--- Alleycat Dispatch Test-Suite ---', 'font-weight:bold; font-size:14px;');

  /* 1) Event anlegen */
  await createNewEvent();
  await wait(80);
  const evt = state.currentEvent;
  check('Event wurde angelegt', !!evt);
  evt.name = 'Test-Alleycat ' + new Date().toISOString();
  evt.expectedRiders = 5;

  /* 2) Alle Checkpoint-Typen anlegen (wächst automatisch mit CHECKPOINT_TYPES mit) */
  CHECKPOINT_TYPES.forEach((t, i) => {
    evt.checkpoints.push(withCheckpointDefaults({
      id: uid('cp'), order: i + 1, lat: 50 + i * 0.01, lng: 8 + i * 0.01,
      name: 'CP ' + t.shortLabel, type: t.key, mandatory: i % 2 === 0
    }));
  });
  checkEqual('Alle ' + CHECKPOINT_TYPES.length + ' Checkpoint-Typen angelegt', evt.checkpoints.length, CHECKPOINT_TYPES.length);
  CHECKPOINT_TYPES.forEach(t => {
    const cp = evt.checkpoints.find(c => c.type === t.key);
    check('Checkpoint-Typ "' + t.key + '" via getCheckpointType() korrekt aufgelöst', getCheckpointType(cp.type).key === t.key);
  });

  /* 3) Fahrerliste generieren */
  generateRiderSlots();
  checkEqual('Fahrerliste generiert (5 Fahrer)', evt.riders.length, 5);
  evt.riders[0].name = 'Alice';
  evt.riders[1].name = 'Bob';

  /* 3a) Teams anlegen + Fahrer zuordnen */
  evt.teams.push({id: uid('team'), name: 'Team Rot', color: '#e0551c'});
  evt.teams.push({id: uid('team'), name: 'Team Blau', color: '#3a6ea5'});
  checkEqual('2 Teams angelegt', evt.teams.length, 2);
  onRiderTeamChange(evt.riders[0].bib, evt.teams[0].id);
  onRiderTeamChange(evt.riders[1].bib, evt.teams[0].id);
  onRiderTeamChange(evt.riders[2].bib, evt.teams[1].id);
  checkEqual('Fahrer #1 Team zugeordnet', evt.riders[0].teamId, evt.teams[0].id);
  const teamStats = computeTeamStats(evt);
  checkEqual('computeTeamStats zählt Team-Rot-Mitglieder korrekt', teamStats.teams.find(t => t.team.id === evt.teams[0].id).memberCount, 2);

  /* 4) Speichern + aus dem Storage-Backend zurücklesen (backend-agnostisch) */
  await saveCurrentEvent();
  await saveEventsIndex();
  const reloaded = await loadEvent(evt.id);
  check('Event aus Storage zurückgelesen', !!reloaded);
  checkEqual('Event-Name persistiert', reloaded && reloaded.name, evt.name);
  checkEqual('Checkpoints persistiert', reloaded && reloaded.checkpoints.length, CHECKPOINT_TYPES.length);
  checkEqual('Fahrerliste persistiert', reloaded && reloaded.riders.length, 5);
  checkEqual('Teams persistiert', reloaded && reloaded.teams.length, 2);
  checkEqual('Fahrer-Team-Zuordnung persistiert', reloaded && reloaded.riders[0].teamId, evt.teams[0].id);

  /* 5) Ziel-Check-in: Fahrer bestätigen */
  openCheckin();
  selectCheckinRiderByBib(evt.riders[0].bib);
  confirmRiderAtFinish();
  check('Fahrer #1 nach Bestätigen im Ziel', !!getActiveCheckinRider().finishTime);

  /* 6) Checkpoints im Check-in abhaken (normal + gewertet) */
  evt.checkpoints.forEach(cp => {
    const type = getCheckpointType(cp.type);
    if(type.isScored) onCheckinSetScore(cp.id, 7);
    else onCheckinToggleCheckpoint(cp.id, true);
  });
  let activeRider = getActiveCheckinRider();
  checkEqual('Alle Checkpoints (inkl. gewertete) als erledigt markiert', (activeRider.completed || []).length, evt.checkpoints.length);
  const scoredCp = evt.checkpoints.find(c => getCheckpointType(c.type).isScored);
  if(scoredCp) checkEqual('Score korrekt gesetzt', activeRider.scores[scoredCp.id], 7);

  /* 7) Zurücksetzen + Undo-Toast */
  const finishTimeBefore = activeRider.finishTime;
  unconfirmRiderAtFinish();
  checkEqual('Nach Zurücksetzen: Zielzeit geleert', getActiveCheckinRider().finishTime, '');
  const toastBtn = document.querySelector('#toast-root .toast-action');
  check('Undo-Toast erscheint nach Zurücksetzen', !!toastBtn);
  if(toastBtn) toastBtn.click();
  checkEqual('"Rückgängig" stellt Zielzeit wieder her', getActiveCheckinRider().finishTime, finishTimeBefore);

  /* 8) Speichern & schließen -> Fokus + leere Karte */
  finishCheckin();
  check('Bib-Suchfeld nach "Speichern & schließen" fokussiert', document.activeElement && document.activeElement.id === 'checkin-bib-input');
  check('Aktive Karte nach "Speichern & schließen" geschlossen', !getActiveCheckinRider());

  /* 9) Übersicht: Klick lädt richtigen Fahrer */
  selectCheckinRiderByBib(evt.riders[1].bib);
  checkEqual('Klick in Übersicht lädt korrekten Fahrer', getActiveCheckinRider() && getActiveCheckinRider().bib, evt.riders[1].bib);
  confirmRiderAtFinish();

  /* 10) Leaderboard */
  openLeaderboard();
  await wait(20);
  const lbRows = document.querySelectorAll('#view-leaderboard .lb-row');
  checkEqual('Leaderboard zeigt alle Fahrer', lbRows.length, evt.riders.length);
  check('Leaderboard rendert ohne Fehler', document.getElementById('view-leaderboard').innerHTML.length > 100);
  check('Team-Badge in Einzelwertung sichtbar', document.querySelectorAll('#view-leaderboard .team-badge').length > 0);

  /* 10a) Team-Wertung-Tab */
  setLeaderboardTab('teams');
  await wait(20);
  const teamRows = document.querySelectorAll('#view-leaderboard .leaderboard-table tbody tr');
  checkEqual('Team-Wertung zeigt beide Teams', teamRows.length, 2);
  setLeaderboardTab('individual');
  await wait(20);

  /* 10b) Team löschen -> Fahrer verliert Zuordnung */
  const origConfirm = window.confirm;
  window.confirm = () => true;
  deleteTeam(evt.teams[1].id);
  window.confirm = origConfirm;
  checkEqual('Team-Liste nach Löschen verkleinert', evt.teams.length, 1);
  checkEqual('Fahrer #3 verliert Team-Zuordnung nach Löschen', evt.riders[2].teamId, null);

  /* 11) Manifest (Web + PDF) */
  openManifest();
  await wait(20);
  check('Manifest rendert ohne Fehler', document.getElementById('view-manifest').innerHTML.length > 100);
  await checkNoThrowAsync('Manifest-PDF-Export läuft ohne Fehler', exportManifestPDF);

  /* 12) Fahrer-Ansicht: Startnummern- & Spokecards-PDF-Generatoren */
  openRiders();
  await checkNoThrowAsync('Startnummern-PDF (buildRiderSheetDoc) läuft ohne Fehler', () => buildRiderSheetDoc(evt));
  await checkNoThrowAsync('Spokecards-PDF (buildSpokeCardsDoc) läuft ohne Fehler', () => buildSpokeCardsDoc(evt));

  /* 13) Event löschen */
  await confirmDeleteEvent(evt.id);
  const afterDelete = await loadEvent(evt.id);
  checkEqual('Event nach Löschen nicht mehr im Storage', afterDelete, null);

  /* 14) SQLite-spezifisch — läuft nur mit, wenn sqlDb existiert (dist/alleycat-dispatch-local.html) */
  if(typeof sqlDb !== 'undefined' && sqlDb){
    check('[SQLite] sqlDb-Instanz vorhanden', true);
    await createNewEvent();
    await wait(80);
    const sqlEvt = state.currentEvent;
    sqlEvt.name = 'SQLite Export-Test';
    await saveCurrentEvent();
    const exportedBytes = sqlDb.export();
    const freshDb = new sqlJsModule.Database(exportedBytes);
    const rows = freshDb.exec("SELECT value FROM kv WHERE key = 'event:" + sqlEvt.id + "'");
    freshDb.close();
    const restoredName = rows.length ? JSON.parse(rows[0].values[0][0]).name : null;
    checkEqual('[SQLite] Export -> Re-Import liefert identisches Event', restoredName, sqlEvt.name);
    await confirmDeleteEvent(sqlEvt.id);
  } else {
    console.log('ℹ️  SQLite-Checks übersprungen (kein sqlDb im Scope — normale Variante).');
  }

  /* Zusammenfassung */
  const failed = results.filter(r => !r.pass);
  const color = failed.length ? 'color:#c0392b' : 'color:#2e7d32';
  console.log(`%c--- Ergebnis: ${results.length - failed.length}/${results.length} bestanden ---`, `font-weight:bold; font-size:13px; ${color}`);
  if(failed.length) console.table(failed);
  return {total: results.length, passed: results.length - failed.length, failed: failed.length, results};
}
if(typeof window !== 'undefined') window.runAlleycatTestSuite = runAlleycatTestSuite;
