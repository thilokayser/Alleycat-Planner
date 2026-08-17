/* Alleycat Dispatch — Test-Suite
   ------------------------------------------------------------------
   Prüft alle Kernfunktionen der App End-to-End: Event-CRUD, alle
   Checkpoint-Typen (config-driven über CHECKPOINT_TYPES), Fahrerliste,
   Teams (anlegen/zuordnen/Persistenz/Löschen/Wertungsmodus),
   Kategorie-Gruppen (Presets/eigene Gruppen/Umbenennen/Löschen inkl.
   Kaskade auf Fahrer-Zuordnungen), DNF/DNS-Status, CP-Reihenfolge
   (frei/fest) inkl. Out-of-Order-Warnung + Override-Log und
   Haversine-Distanzberechnung, Dashboard-Übersicht mit anpassbaren
   Widgets (Status-Kacheln/CP-Auslastung/Aktivität/Kategorie-Verteilung/
   Mini-Leaderboard/Countdown/To-dos, inkl. Sichtbarkeit + Reihenfolge),
   Checkpoint-Liste (manuelles Sperren/Duplizieren/Inline-Positionsedit/
   Zeitfenster-Status/Gruppierung nach Typ) und Checkpoint-Personal
   (CRUD, Dashboard-To-do, Personal-Briefing-PDF getrennt vom
   Fahrer-Manifest), Beamer-Ansicht (Route-Erkennung, Countdown-/GO-/
   Live-Phasen-Rendering, Sortierung/Fortschritt/Restzeit-Helfer,
   BroadcastChannel-Fallback) und Sound-Hook-Modul (register/play/
   isRegistered, Event-gebundene soundHooks inkl. Persistenz),
   Datensicherheit & Offline (Auto-Backup-Seam, Beforeunload-Warnung,
   Wake Lock, Storage-APIs persist/estimate, Offline-Kartenkacheln-Cache
   inkl. Bounding-Box/Tile-Index-Mathematik und Staleness-Warnung),
   Renn-Zustandsmaschine
   (Planung/Bereit/Läuft/Abgeschlossen inkl. CP-Struktur-Sperre und
   Override), kompletter Ziel-Check-in-Flow
   (bestätigen/zurücksetzen/Undo-Toast/Speichern & schließen/Übersicht),
   Leaderboard inkl. Team-Wertung-Tab und kombinierbaren Filtern, Manifest,
   PDF-Export (Startnummern + Spokecards + Personal-Briefing) und
   Storage-Roundtrip.

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
  checkEqual('Neues Event startet im Status "planning"', evt.status, 'planning');
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

  /* 3b) Renn-Zustandsmaschine */
  {
    const origAlert = window.alert;
    const origConfirm = window.confirm;
    let lastAlert = null, lastConfirm = null;
    window.alert = (msg) => { lastAlert = msg; };
    window.confirm = (msg) => { lastConfirm = msg; return true; };

    const savedExpected = evt.expectedRiders;
    evt.expectedRiders = 0;
    markReady(evt);
    check('markReady blockiert ohne gesetzte Kapazität', !!lastAlert && evt.status === 'planning');
    evt.expectedRiders = savedExpected;

    lastAlert = null;
    markReady(evt);
    checkEqual('markReady setzt Status auf "ready" (mit Warnungs-Bestätigung)', evt.status, 'ready');
    check('markReady zeigt Warnungen (Spokecards/Manifest) im Confirm', !!lastConfirm && lastConfirm.includes('Bereit'));

    startRace(evt);
    checkEqual('startRace setzt Status auf "running"', evt.status, 'running');
    check('CP-Struktur nach Rennstart gesperrt', isCpLocked(evt));

    toggleCpLockOverride();
    check('Override entsperrt CP-Struktur', !isCpLocked(evt));
    toggleCpLockOverride();
    check('Erneuter Toggle sperrt wieder', isCpLocked(evt));

    lastConfirm = null;
    completeRace(evt);
    check('completeRace fragt nach unbestätigten Fahrern', !!lastConfirm && lastConfirm.includes('Fahrer'));
    checkEqual('completeRace setzt Status auf "completed"', evt.status, 'completed');
    check('CP-Struktur bleibt nach Abschluss gesperrt', isCpLocked(evt));

    onStatusSelectChange('planning');
    checkEqual('Rückwärts-Übergang über Dropdown funktioniert (mit Bestätigung)', evt.status, 'planning');

    window.alert = origAlert;
    window.confirm = origConfirm;
  }

  /* 3c) Kategorien + DNF/DNS + Team-Wertungsmodus */
  {
    openRiders();
    await wait(20);
    addCategoryPreset('drivetrain');
    addCategoryPreset('gender');
    checkEqual('2 Kategorie-Presets hinzugefügt', evt.categoryGroups.length, 2);
    addCategoryPreset('drivetrain');
    checkEqual('Erneutes Preset-Hinzufügen erzeugt keine Dopplung', evt.categoryGroups.length, 2);

    toggleNewCategoryGroupForm();
    await wait(20);
    document.getElementById('newcatgroup-name').value = 'Rahmenmaterial';
    document.querySelectorAll('.newcatgroup-option-input')[0].value = 'Stahl';
    addNewCategoryGroupOptionField();
    await wait(20);
    checkEqual('"+ Option" fügt Feld hinzu ohne bestehende Eingabe zu löschen', document.querySelectorAll('.newcatgroup-option-input')[0].value, 'Stahl');
    document.querySelectorAll('.newcatgroup-option-input')[1].value = 'Alu';
    addCategoryGroup();
    checkEqual('Eigene Kategorie-Gruppe angelegt', evt.categoryGroups.length, 3);

    const drivetrainGroup = evt.categoryGroups.find(g => g.name === 'Antrieb');
    onRiderCategoryChange(evt.riders[0].bib, drivetrainGroup.id, 'Fixed');
    checkEqual('Fahrer-Kategorie zugeordnet', evt.riders[0].categories[drivetrainGroup.id], 'Fixed');

    renameCategoryOption(drivetrainGroup.id, 'Fixed', 'Fixed Gear');
    checkEqual('Options-Umbenennung kaskadiert zur Fahrer-Zuordnung', evt.riders[0].categories[drivetrainGroup.id], 'Fixed Gear');

    const origConfirm3 = window.confirm;
    window.confirm = () => true;
    deleteCategoryOption(drivetrainGroup.id, 'Fixed Gear');
    check('Options-Löschung setzt betroffene Fahrer-Zuordnung zurück', !evt.riders[0].categories[drivetrainGroup.id]);

    const genderGroup = evt.categoryGroups.find(g => g.name === 'Gender');
    onRiderCategoryChange(evt.riders[1].bib, genderGroup.id, 'Open');
    deleteCategoryGroup(genderGroup.id);
    window.confirm = origConfirm3;
    checkEqual('Gruppe gelöscht', evt.categoryGroups.length, 2);
    check('Fahrer-Zuordnung nach Gruppen-Löschung entfernt', !evt.riders[1].categories[genderGroup.id]);

    /* DNF/DNS auf riders[3]/[4] — unabhängig von den späteren Check-in-Tests auf riders[0]/[1] */
    openCheckin();
    selectCheckinRiderByBib(evt.riders[3].bib);
    setRiderRaceStatus('dnf');
    checkEqual('Fahrer als DNF markiert', getActiveCheckinRider().raceStatus, 'dnf');
    check('DNF-Badge wird angezeigt', riderStatusBadgeHtml(evt, getActiveCheckinRider()).includes('DNF'));
    selectCheckinRiderByBib(evt.riders[4].bib);
    setRiderRaceStatus('dns');
    checkEqual('Fahrer als DNS markiert', getActiveCheckinRider().raceStatus, 'dns');

    /* Team-Wertungsmodus — nutzt Team Blau (bereits mit Fahrer #3 belegt) statt ein neues Team anzulegen,
       damit der spätere "Team-Wertung zeigt beide Teams"-Check (Abschnitt 10a) bei 2 Teams bleibt */
    const scoringTeam = evt.teams[1];
    onRiderTeamChange(evt.riders[3].bib, scoringTeam.id);
    onTeamScoringModeChange('allMustFinish');
    let scoringStats = computeTeamStats(evt).teams.find(ts => ts.team.id === scoringTeam.id);
    check('allMustFinish: Team mit DNF-Fahrer nicht "allFinished"', !scoringStats.allFinished);
    onTeamScoringModeChange('bestTime');
    checkEqual('Team-Wertungsmodus persistiert auf Event', evt.teamScoringMode, 'bestTime');

    /* Leaderboard-Filter kombiniert */
    openLeaderboard();
    await wait(20);
    onLeaderboardStatusFilterChange('dnf');
    await wait(20);
    checkEqual('Status-Filter "DNF" zeigt genau einen Fahrer', document.querySelectorAll('#view-leaderboard .lb-row').length, 1);
    const dnfChip = document.querySelector('.filter-chip');
    check('Aktiver Filter erzeugt Chip', !!dnfChip);
    clearLeaderboardFilters();
    await wait(20);
    checkEqual('"Filter zurücksetzen" zeigt wieder alle Fahrer', document.querySelectorAll('#view-leaderboard .lb-row').length, 5);
  }

  /* 3d) CP-Reihenfolge + Distanzberechnung */
  {
    checkEqual('Neues Event hat checkpointOrderMode "frei" per Default', evt.checkpointOrderMode, 'frei');

    check('haversineDistanceKm(A,A) ist 0', haversineDistanceKm(50, 8, 50, 8) === 0);
    check('haversineDistanceKm ist symmetrisch', haversineDistanceKm(50, 8, 51, 9) === haversineDistanceKm(51, 9, 50, 8));
    check('haversineDistanceKm liefert positive Distanz für unterschiedliche Punkte', haversineDistanceKm(50, 8, 51, 9) > 0);

    const routeInfo = computeRouteLegs(evt.checkpoints);
    checkEqual('computeRouteLegs liefert N-1 Legs', routeInfo.legs.length, evt.checkpoints.length - 1);
    check('computeRouteLegs-Gesamtdistanz entspricht Summe der Legs', Math.abs(routeInfo.total - routeInfo.legs.reduce((s, l) => s + l.km, 0)) < 0.0001);

    onCheckpointOrderModeChange('fest');
    checkEqual('checkpointOrderMode auf "fest" gesetzt', evt.checkpointOrderMode, 'fest');

    openCheckin();
    selectCheckinRiderByBib(evt.riders[2].bib);
    const secondCp = evt.checkpoints[1];

    const origConfirm4 = window.confirm;
    let orderConfirmMsg = null;
    window.confirm = (msg) => { orderConfirmMsg = msg; return false; };
    onCheckinToggleCheckpoint(secondCp.id, true);
    check('Out-of-Order-Warnung erscheint bei "fest"', !!orderConfirmMsg && orderConfirmMsg.includes(evt.checkpoints[0].name));
    check('Bei Ablehnung bleibt Checkpoint offen', !(getActiveCheckinRider().completed || []).includes(secondCp.id));

    window.confirm = () => true;
    onCheckinToggleCheckpoint(secondCp.id, true);
    check('Bei Bestätigung wird Checkpoint trotzdem markiert', (getActiveCheckinRider().completed || []).includes(secondCp.id));
    check('Override wird geloggt', (getActiveCheckinRider().checkpointOrderOverrides || []).some(o => o.checkpointId === secondCp.id));

    onCheckpointOrderModeChange('frei');
    orderConfirmMsg = null;
    window.confirm = () => { orderConfirmMsg = 'SOLLTE NICHT AUFGERUFEN WERDEN'; return true; };
    onCheckinToggleCheckpoint(evt.checkpoints[2].id, true);
    check('"Frei"-Modus fragt nicht nach Reihenfolge', orderConfirmMsg === null);
    window.confirm = origConfirm4;

    /* Aufräumen, damit die nachfolgenden Check-in-Abschnitte (5+) unverändert bleiben */
    evt.riders[2].completed = [];
    evt.riders[2].checkpointOrderOverrides = [];
  }

  /* 3e) Dashboard-Übersicht + Widgets */
  {
    checkEqual('Neues Event hat bibsPrinted=false per Default', evt.bibsPrinted, false);

    const tiles = computeRiderStatusTiles(evt);
    checkEqual('Status-Kacheln: 3 angemeldete Fahrer ohne Aktivität', tiles.registered, 3);
    checkEqual('Status-Kacheln: 1 DNF', tiles.dnf, 1);
    checkEqual('Status-Kacheln: 1 DNS', tiles.dns, 1);
    checkEqual('Status-Kacheln: 0 unterwegs', tiles.underway, 0);
    checkEqual('Status-Kacheln: 0 finished', tiles.finished, 0);

    const synthEvt = {
      checkpoints: [
        {id: 'sa', order: 1, name: 'Start', lat: 50, lng: 8},
        {id: 'sb', order: 2, name: 'Bahnhof', lat: 51, lng: 9}
      ],
      riders: [
        {bib: 1, name: 'X', completed: ['sa', 'sb'], checkpointTimes: {sa: '2026-01-01T10:00', sb: '2026-01-01T10:15'}, finishTime: '2026-01-01T10:20', raceStatus: '', categories: {g: 'Fixed'}},
        {bib: 2, name: 'Y', completed: ['sa'], checkpointTimes: {sa: '2026-01-01T10:05'}, finishTime: '', raceStatus: '', categories: {}}
      ],
      categoryGroups: [{id: 'g', name: 'Antrieb', options: ['Fixed', 'Free']}]
    };
    const load = computeCheckpointLoad(synthEvt);
    checkEqual('computeCheckpointLoad: wenigste zuerst', load[0].checkpoint.id, 'sb');
    checkEqual('computeCheckpointLoad: Bahnhof-Count', load[0].count, 1);
    checkEqual('computeCheckpointLoad: Start-Count', load[1].count, 2);

    const activity = computeRecentActivity(synthEvt, 10);
    checkEqual('computeRecentActivity: alle Einträge erfasst (3 CP-Zeiten + 1 Zielzeit)', activity.length, 4);
    checkEqual('computeRecentActivity: neueste zuerst (Zieleinlauf)', activity[0].label, t('overview.finishLabel'));

    const dist = computeCategoryDistribution(synthEvt);
    checkEqual('computeCategoryDistribution: eine Gruppe', dist.length, 1);
    checkEqual('computeCategoryDistribution: Fixed-Count', dist[0].counts.find(c => c.opt === 'Fixed').count, 1);
    checkEqual('computeCategoryDistribution: Free-Count', dist[0].counts.find(c => c.opt === 'Free').count, 0);

    const mini = computeMiniLeaderboard(synthEvt, 5);
    checkEqual('computeMiniLeaderboard: nur Finisher', mini.length, 1);
    checkEqual('computeMiniLeaderboard: richtiger Fahrer', mini[0].bib, 1);

    const untilInfo = computeStartCountdown({status: 'planning', startMode: 'scheduled', startTime: toLocalDateTimeInputValue(new Date(Date.now() + 3600000))});
    checkEqual('computeStartCountdown: Modus "until" vor geplantem Start', untilInfo.mode, 'until');
    check('computeStartCountdown: "until" liegt in der Zukunft', untilInfo.ms > 0);
    const sinceInfo = computeStartCountdown({status: 'running', startConfirmedAt: toLocalDateTimeInputValue(new Date(Date.now() - 600000))});
    checkEqual('computeStartCountdown: Modus "since" während des Rennens', sinceInfo.mode, 'since');
    const durationInfo = computeStartCountdown({status: 'completed', startConfirmedAt: toLocalDateTimeInputValue(new Date(Date.now() - 3600000)), statusChangedAt: toLocalDateTimeInputValue(new Date(Date.now() - 600000))});
    checkEqual('computeStartCountdown: Modus "duration" nach Abschluss', durationInfo.mode, 'duration');
    const noneInfo = computeStartCountdown({status: 'planning', startMode: 'manual', startTime: ''});
    checkEqual('computeStartCountdown: Modus "none" ohne geplante Startzeit', noneInfo.mode, 'none');

    const todosBefore = computeDashboardTodos(evt);
    check('computeDashboardTodos: keine "keine Checkpoints"-Warnung (Checkpoints vorhanden)', !todosBefore.some(td => td.key === 'noCheckpoints'));
    check('computeDashboardTodos: keine Kapazitäts-Warnung (expectedRiders gesetzt)', !todosBefore.some(td => td.key === 'noCapacity'));
    check('computeDashboardTodos: erkennt fehlende Startzeit', todosBefore.some(td => td.key === 'noStartTime'));
    check('computeDashboardTodos: erkennt ungedruckte Startnummern/Spokecards', todosBefore.some(td => td.key === 'notPrinted'));
    check('computeDashboardTodos: erkennt fehlendes Manifest', todosBefore.some(td => td.key === 'noManifest'));
    checkEqual('computeDashboardTodos: alle Kategorie-Gruppen ohne Zuordnung gemeldet', todosBefore.filter(td => td.key.startsWith('catGroupEmpty')).length, evt.categoryGroups.length);

    /* Widget-Sichtbarkeit + Reihenfolge in der Übersicht */
    openOverview();
    await wait(20);
    check('Overview-View rendert Status-Kacheln (Default sichtbar)', document.querySelector('.overview-widget[data-widget="statusTiles"]') !== null);
    check('Overview-View versteckt Mini-Leaderboard per Default', document.querySelector('.overview-widget[data-widget="miniLeaderboard"]') === null);
    onOverviewWidgetVisibilityToggle('miniLeaderboard', true);
    await wait(20);
    check('Sichtbarkeits-Toggle blendet Mini-Leaderboard ein', document.querySelector('.overview-widget[data-widget="miniLeaderboard"]') !== null);
    onOverviewWidgetVisibilityToggle('miniLeaderboard', false);
    await wait(20);
    check('Sichtbarkeits-Toggle blendet Mini-Leaderboard wieder aus', document.querySelector('.overview-widget[data-widget="miniLeaderboard"]') === null);

    const orderBefore = evt.dashboardWidgetOrder.slice();
    moveOverviewWidget(orderBefore[1], -1);
    checkEqual('moveOverviewWidget vertauscht zwei Positionen', evt.dashboardWidgetOrder[0], orderBefore[1]);
    moveOverviewWidget(orderBefore[1], 1);
    checkEqual('Zurückverschieben stellt Original-Reihenfolge wieder her', evt.dashboardWidgetOrder[0], orderBefore[0]);
  }

  /* 3f) Checkpoint-Liste: Sperren, Duplizieren, Inline-Position, Personal */
  {
    const cp0 = evt.checkpoints[0];
    const cp1 = evt.checkpoints[1];

    checkEqual('Checkpoint startet ungesperrt', cp0.locked, false);
    toggleCpLocked(cp0.id);
    checkEqual('toggleCpLocked sperrt Checkpoint', cp0.locked, true);

    const orderBefore = evt.checkpoints.map(c => c.id);
    moveCp(cp0.id, 1);
    checkEqual('moveCp blockiert bei gesperrtem Checkpoint', evt.checkpoints.map(c => c.id).join(','), orderBefore.join(','));

    duplicateCheckpoint(cp0.id);
    checkEqual('duplicateCheckpoint blockiert bei gesperrtem Checkpoint', evt.checkpoints.length, CHECKPOINT_TYPES.length);

    toggleCpLocked(cp0.id);
    checkEqual('toggleCpLocked entsperrt wieder', cp0.locked, false);

    const beforeDupCount = evt.checkpoints.length;
    duplicateCheckpoint(cp1.id);
    checkEqual('duplicateCheckpoint legt Kopie an', evt.checkpoints.length, beforeDupCount + 1);
    const dup = evt.checkpoints[evt.checkpoints.length - 1];
    check('Duplikat hat neue ID', dup.id !== cp1.id);
    check('Duplikat-Name enthält "(Kopie)"', dup.name.includes('Kopie'));
    checkEqual('Duplikat hat leicht versetzte Position', dup.lat, cp1.lat + 0.0005);
    evt.checkpoints = evt.checkpoints.filter(c => c.id !== dup.id);

    const latBefore = cp0.lat, lngBefore = cp0.lng;
    onEditLat(cp0.id, '52.5');
    onEditLng(cp0.id, '9.5');
    checkEqual('onEditLat aktualisiert Position', cp0.lat, 52.5);
    checkEqual('onEditLng aktualisiert Position', cp0.lng, 9.5);
    cp0.lat = latBefore; cp0.lng = lngBefore;

    const cpTw = withCheckpointDefaults({
      id: 'tw1', order: 1, lat: 0, lng: 0, name: 'TW', timeWindowEnabled: true,
      timeWindowStart: toLocalDateTimeInputValue(new Date(Date.now() - 3600000)),
      timeWindowEnd: toLocalDateTimeInputValue(new Date(Date.now() - 1800000))
    });
    checkEqual('cpTimeWindowStatus: geschlossen wenn Ende in Vergangenheit', cpTimeWindowStatus(cpTw), 'closed');
    cpTw.timeWindowStart = toLocalDateTimeInputValue(new Date(Date.now() + 1800000));
    cpTw.timeWindowEnd = toLocalDateTimeInputValue(new Date(Date.now() + 3600000));
    checkEqual('cpTimeWindowStatus: upcoming wenn Start in Zukunft', cpTimeWindowStatus(cpTw), 'upcoming');
    cpTw.timeWindowStart = toLocalDateTimeInputValue(new Date(Date.now() - 1800000));
    cpTw.timeWindowEnd = toLocalDateTimeInputValue(new Date(Date.now() + 1800000));
    checkEqual('cpTimeWindowStatus: open wenn jetzt im Fenster', cpTimeWindowStatus(cpTw), 'open');
    checkEqual('cpTimeWindowStatus: null wenn deaktiviert', cpTimeWindowStatus(withCheckpointDefaults({id: 'tw2'})), null);

    onCpListGroupByChange('type');
    checkEqual('cpListGroupBy gesetzt', state.cpListGroupBy, 'type');
    renderSidebar();
    check('Gruppierung nach Typ zeigt Gruppen-Überschriften', document.querySelectorAll('.cp-group-heading').length > 0);
    onCpListGroupByChange('order');
    renderSidebar();

    checkEqual('Checkpoint startet ohne Personal', cp1.staff.length, 0);
    addCpStaff(cp1.id);
    checkEqual('addCpStaff fügt Eintrag hinzu', cp1.staff.length, 1);
    const staffEntry = cp1.staff[0];
    onCpStaffFieldChange(cp1.id, staffEntry.id, 'name', 'Erika Mustermann');
    onCpStaffFieldChange(cp1.id, staffEntry.id, 'phone', '0170999999');
    onCpStaffFieldChange(cp1.id, staffEntry.id, 'role', 'Marshal');
    checkEqual('onCpStaffFieldChange setzt Namen', cp1.staff[0].name, 'Erika Mustermann');
    checkEqual('onCpStaffFieldChange setzt Telefon', cp1.staff[0].phone, '0170999999');

    const todosStaff = computeDashboardTodos(evt);
    const staffTodo = todosStaff.find(td => td.key === 'noStaff');
    check('computeDashboardTodos erkennt Checkpoints ohne Personal', !!staffTodo);
    checkEqual('Todo-Text nennt korrekte Anzahl', staffTodo && staffTodo.text, t('overview.todoNoStaff', {count: evt.checkpoints.length - 1}));

    removeCpStaff(cp1.id, staffEntry.id);
    checkEqual('removeCpStaff entfernt Eintrag', cp1.staff.length, 0);

    await checkNoThrowAsync('Personal-Briefing-PDF (buildStaffBriefingDoc) läuft ohne Fehler', () => buildStaffBriefingDoc(evt));

    let selectCpErr = null;
    try { selectCp(cp0.id); selectCp(cp0.id); } catch(e){ selectCpErr = e.message; }
    check('selectCp (inkl. Karten-Zentrierung) läuft ohne Fehler', selectCpErr === null);
    state.editingId = null;
  }

  /* 3g) Beamer-Ansicht + Sound-Hook */
  {
    /* Route-Erkennung: echtes Setzen von location.hash würde den in
       init() registrierten hashchange->reload()-Listener auslösen und
       damit den laufenden Testlauf abbrechen — hier daher nur die
       Baseline außerhalb der Beamer-Route prüfen. */
    checkEqual('isBeamerRoute() ist false außerhalb der Beamer-Route', isBeamerRoute(), false);
    checkEqual('beamerEventIdFromHash() liefert null ohne Beamer-Hash', beamerEventIdFromHash(), null);

    checkEqual('SOUND_EVENTS enthält "race_start"', typeof SOUND_EVENTS.race_start, 'string');
    checkEqual('AlleycatSounds: unbekannter Key spielt nichts ab (kein Fehler)', await AlleycatSounds.play('nope'), false);
    checkEqual('AlleycatSounds: unbekannter Key ist nicht registriert', AlleycatSounds.isRegistered('race_start'), false);
    AlleycatSounds.register('race_start', 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
    checkEqual('AlleycatSounds.register registriert den Sound', AlleycatSounds.isRegistered('race_start'), true);
    AlleycatSounds.unregister('race_start');
    checkEqual('AlleycatSounds.unregister entfernt den Sound wieder', AlleycatSounds.isRegistered('race_start'), false);

    checkEqual('Event hat leeres soundHooks-Objekt per Default', Object.keys(evt.soundHooks).length, 0);
    evt.soundHooks.race_start = {name: 'go.mp3', dataUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='};
    registerEventSounds(evt);
    checkEqual('registerEventSounds registriert vorhandene Event-Sounds', AlleycatSounds.isRegistered('race_start'), true);
    await checkNoThrowAsync('testPlaySoundHook läuft ohne Fehler', () => testPlaySoundHook('race_start'));
    removeSoundHook('race_start');
    check('removeSoundHook entfernt Event-Eintrag', !evt.soundHooks.race_start);
    checkEqual('removeSoundHook meldet Sound bei AlleycatSounds ab', AlleycatSounds.isRegistered('race_start'), false);
    /* für den Persistenz-Check in Abschnitt 4 wieder setzen */
    evt.soundHooks.race_start = {name: 'go.mp3', dataUrl: 'data:audio/wav;base64,AAA='};

    const beamerHtml = renderBeamerOverviewSection(evt);
    check('renderBeamerOverviewSection zeigt Öffnen-Button', beamerHtml.includes('openBeamerView'));
    check('renderBeamerOverviewSection zeigt Sound-Zeile für race_start', beamerHtml.includes('go.mp3'));

    const synthEvt = {
      name: 'Synth-Beamer-Event',
      status: 'planning', startMode: 'scheduled', startTime: toLocalDateTimeInputValue(new Date(Date.now() + 65000)),
      checkpoints: [{id: 'sa', order: 1}],
      riders: [
        {bib: 1, name: 'Alice', completed: ['sa'], finishTime: toLocalDateTimeInputValue(new Date()), raceStatus: ''},
        {bib: 2, name: 'Bob', completed: ['sa'], finishTime: '', raceStatus: ''},
        {bib: 3, name: '', completed: [], finishTime: '', raceStatus: ''},
        {bib: 4, name: 'Nina', completed: [], finishTime: '', raceStatus: 'dnf'}
      ]
    };
    checkEqual('computeBeamerRegistered zählt nur benannte Fahrer', computeBeamerRegistered(synthEvt), 3);
    const beamerSorted = sortBeamerRiders(synthEvt);
    checkEqual('sortBeamerRiders: 1 Finisher', beamerSorted.finished.length, 1);
    checkEqual('sortBeamerRiders: 1 unterwegs', beamerSorted.underway.length, 1);
    checkEqual('sortBeamerRiders: 1 DNF/DNS', beamerSorted.dnfDns.length, 1);
    checkEqual('sortBeamerRiders: unbenannter Fahrer wird ignoriert', beamerSorted.finished.length + beamerSorted.underway.length + beamerSorted.dnfDns.length, 3);
    checkEqual('beamerProgressLabel zeigt Fortschritt', beamerProgressLabel(synthEvt, synthEvt.riders[0]), '1/1');
    checkEqual('beamerElapsedFinish ohne startConfirmedAt liefert Platzhalter', beamerElapsedFinish(synthEvt, synthEvt.riders[0]), '—');
    synthEvt.startConfirmedAt = toLocalDateTimeInputValue(new Date(Date.now() - 600000));
    checkEqual('beamerElapsedFinish ohne finishTime liefert Platzhalter', beamerElapsedFinish(synthEvt, synthEvt.riders[1]), '—');
    check('beamerElapsedFinish mit Start+Ziel liefert Uhrzeit-String', /^\d+:\d{2}$/.test(beamerElapsedFinish(synthEvt, synthEvt.riders[0])));

    const countdownHtml = renderBeamerCountdownPhase(synthEvt);
    check('renderBeamerCountdownPhase zeigt Event-Namen', countdownHtml.includes('Synth-Beamer-Event'));
    check('renderBeamerCountdownPhase zeigt Anzahl registrierter Fahrer', countdownHtml.includes(t('beamer.registeredRidersLabel') + ': 3'));
    const noneStartEvt = Object.assign({}, synthEvt, {startMode: 'manual', startTime: ''});
    check('renderBeamerCountdownPhase zeigt Warte-Text ohne geplante Startzeit', renderBeamerCountdownPhase(noneStartEvt).includes(t('beamer.waitingForStart')));

    synthEvt.status = 'running';
    const liveHtml = renderBeamerLivePhase(synthEvt);
    check('renderBeamerLivePhase zeigt Renn-Uhr', liveHtml.includes(t('beamer.raceClockLabel')));
    check('renderBeamerLivePhase listet Finisher mit Platz 1', liveHtml.includes('beamer-lb-rank">1'));
    check('renderBeamerLivePhase markiert unterwegs-Fahrer', liveHtml.includes(t('beamer.underwayLabel')));
    check('renderBeamerLivePhase zeigt DNF/DNS-Fußzeile', liveHtml.includes(t('beamer.dnsDnfFooter', {count: 1})));
    synthEvt.status = 'completed';
    check('renderBeamerLivePhase zeigt Abschluss-Banner', renderBeamerLivePhase(synthEvt).includes(t('beamer.raceCompletedBanner')));

    /* GO-Trigger: nur die synchrone Phase (inkl. abgewartetem Sound-Play)
       prüfen, nicht den vollen 4s-Timer bis zum Live-Übergang abwarten. */
    beamerState = {eventId: 'synth', evt: synthEvt, phase: 'countdown', audioBlocked: false};
    await checkNoThrowAsync('triggerGoSequence läuft ohne Fehler', () => triggerGoSequence());
    checkEqual('triggerGoSequence wechselt Phase auf "go"', beamerState.phase, 'go');
    clearTimeout(beamerGoTimeout);
    beamerState = null;

    const ch = getBeamerChannel();
    check('getBeamerChannel liefert BroadcastChannel oder null (Fallback)', ch === null || (typeof BroadcastChannel !== 'undefined' && ch instanceof BroadcastChannel));
    await checkNoThrowAsync('broadcastEventUpdated läuft ohne Fehler', () => broadcastEventUpdated(evt.id));
    await checkNoThrowAsync('broadcastRaceStart läuft ohne Fehler', () => broadcastRaceStart(evt.id));
  }

  /* 3h) Datensicherheit & Offline */
  {
    checkEqual('Event hat leeren lastBackupAt per Default', evt.lastBackupAt, '');
    checkEqual('Event hat leeren tileCacheUpdatedAt per Default', evt.tileCacheUpdatedAt, '');

    const backup = await exportBackupBlob(evt);
    check('exportBackupBlob liefert Blob+Dateiname (oder null bei geteiltem Storage)', backup === null || (backup.blob instanceof Blob && typeof backup.filename === 'string'));

    await checkNoThrowAsync('triggerBackupNow läuft ohne Fehler', () => triggerBackupNow(true));
    if(typeof hasSharedStorage === 'undefined' || !hasSharedStorage){
      check('triggerBackupNow setzt lastBackupAt', !!evt.lastBackupAt);
    }
    checkEqual('formatMinutesAgo erkennt "gerade eben"', formatMinutesAgo(toLocalDateTimeInputValue(new Date())), t('dataSafety.justNow'));

    const wakeLockOk = await requestWakeLock();
    check('requestWakeLock läuft ohne Fehler (true/false je nach Support)', wakeLockOk === true || wakeLockOk === false);
    releaseWakeLock();

    const persistResult = await requestPersistentStorage();
    check('requestPersistentStorage läuft ohne Fehler (true/false/null)', persistResult === true || persistResult === false || persistResult === null);
    const estimate = await getStorageEstimate();
    check('getStorageEstimate läuft ohne Fehler (Objekt oder null)', estimate === null || typeof estimate.usedMB === 'number');

    check('beforeunload-Listener läuft ohne Fehler', (() => {
      try{ window.dispatchEvent(new Event('beforeunload', {cancelable: true})); return true; }
      catch(e){ return false; }
    })());

    const synthCps = [{lat: 50.0, lng: 8.0}, {lat: 50.02, lng: 8.02}];
    const bounds = computeCheckpointBoundsWithBuffer(synthCps, 500);
    check('computeCheckpointBoundsWithBuffer erweitert die Bounding Box', bounds.minLat < 50.0 && bounds.maxLat > 50.02 && bounds.minLng < 8.0 && bounds.maxLng > 8.02);
    const tiles = tilesInBounds(bounds, 13, 14);
    check('tilesInBounds liefert Kacheln für beide Zoomstufen', tiles.some(tl => tl.z === 13) && tiles.some(tl => tl.z === 14));
    checkEqual('tileCacheKey-Format', tileCacheKey(13, 5, 9), '13/5/9');

    checkEqual('offlineTileCacheStaleness: kein Cache -> null', offlineTileCacheStaleness({tileCacheUpdatedAt: ''}), null);
    checkEqual('offlineTileCacheStaleness: >24h -> warn', offlineTileCacheStaleness({tileCacheUpdatedAt: toLocalDateTimeInputValue(new Date(Date.now() - 25 * 3600000))}), 'warn');
    checkEqual('offlineTileCacheStaleness: >3 Tage -> danger', offlineTileCacheStaleness({tileCacheUpdatedAt: toLocalDateTimeInputValue(new Date(Date.now() - 4 * 86400000))}), 'danger');

    const staleEvt = Object.assign({}, evt, {tileCacheUpdatedAt: toLocalDateTimeInputValue(new Date(Date.now() - 4 * 86400000))});
    const staleTodo = computeDashboardTodos(staleEvt).find(td => td.key === 'tileCacheStale');
    check('computeDashboardTodos meldet veralteten Kartenkacheln-Cache', !!staleTodo && staleTodo.severity === 'danger');

    const cacheStatsBefore = await getTileCacheStats();
    check('getTileCacheStats läuft ohne Fehler', typeof cacheStatsBefore.count === 'number' && typeof cacheStatsBefore.bytes === 'number');
    check('createOfflineTileLayer liefert eine Leaflet-TileLayer-Instanz', createOfflineTileLayer('https://x/{z}/{x}/{y}.png', {}) instanceof L.TileLayer);

    await checkNoThrowAsync('refreshOfflineReadiness läuft ohne Fehler', () => refreshOfflineReadiness());
    check('refreshOfflineReadiness befüllt offlineUiState.events als Array', Array.isArray(offlineUiState.events));
    toggleOfflineEventSelected(evt.id, true);
    const offlineEstimate = computeOfflineEstimateForSelected();
    check('computeOfflineEstimateForSelected liefert numerische Kachelanzahl', typeof offlineEstimate.tileCount === 'number');
    toggleOfflineEventSelected(evt.id, false);
  }

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
  checkEqual('Race-Status persistiert', reloaded && reloaded.status, evt.status);
  checkEqual('Kategorie-Gruppen persistiert', reloaded && reloaded.categoryGroups.length, evt.categoryGroups.length);
  checkEqual('DNF-Status persistiert', reloaded && reloaded.riders[3].raceStatus, 'dnf');
  checkEqual('checkpointOrderMode persistiert', reloaded && reloaded.checkpointOrderMode, 'frei');
  checkEqual('dashboardWidgetOrder persistiert', reloaded && reloaded.dashboardWidgetOrder.length, DASHBOARD_WIDGET_KEYS.length);
  checkEqual('dashboardWidgetVisibility persistiert', reloaded && reloaded.dashboardWidgetVisibility.statusTiles, true);
  checkEqual('cp.locked persistiert', reloaded && reloaded.checkpoints[0].locked, evt.checkpoints[0].locked);
  checkEqual('cp.staff persistiert', reloaded && reloaded.checkpoints[1].staff.length, evt.checkpoints[1].staff.length);
  checkEqual('soundHooks persistiert', reloaded && reloaded.soundHooks && reloaded.soundHooks.race_start && reloaded.soundHooks.race_start.name, 'go.mp3');
  checkEqual('lastBackupAt persistiert', !!(reloaded && reloaded.lastBackupAt), !!evt.lastBackupAt);

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
