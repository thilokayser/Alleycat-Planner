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
   PDF-Baukasten (Block-CRUD/Reihenfolge/Ziel-Dokumente, JSON-Vorlagen-
   Export/Import, Anhängen an Manifest- und Spokecards-PDF unabhängig
   von deren jsPDF-Einheiten), Spielmodi-Engine (generischer Trigger/
   Bedingung/Effekt-Evaluator, alle 7 Presets: Zeitfenster-CPs/Bonus-CPs/
   Geheime CPs/Battle Royale/Wildcard-Joker/Kettenreaktion/Sudden Death,
   Punkte-Ledger, Scoring-Mode-Wechsel), Renn-Zustandsmaschine
   (Planung/Bereit/Läuft/Abgeschlossen inkl. CP-Struktur-Sperre und
   Override), kompletter Ziel-Check-in-Flow
   (bestätigen/zurücksetzen/Undo-Toast/Speichern & schließen/Übersicht),
   Leaderboard inkl. Team-Wertung-Tab und kombinierbaren Filtern, Manifest,
   PDF-Export (Startnummern + Spokecards + Personal-Briefing),
   Storage-Roundtrip, sowie QoL-Features (CSV-Bulk-Import inkl.
   Spalten-Zuordnung/Validierung/Fehlerliste, globale Error-Boundary,
   generisches Undo-/Aktions-Log für Fahrer-Löschung und
   Kategorie-Änderungen), sowie Paket 1 der neu geordneten Roadmap (Phase 19:
   Sidebar-Collapse, globale Tab-Shortcuts inkl. Eingabefeld-Ausnahme und
   Esc-Abbruch, Command Palette mit Fuzzy-Suche, Outdoor-High-Contrast-Theme,
   Hover-Sync zwischen Checkpoint-Sidebar und Karten-Marker, Bulk-Actions
   für Checkpoint-Zeilen inkl. Sperr-Guard, In-Page-PDF-Vorschau-Modal),
   sowie Paket 2 (Phase 16: Feature-Registry mit Device-/Event-Scope-Toggles
   und Settings-Hub-Suche, generische Empty-State-Komponente, Social-Share-
   Karten-Rendering per Canvas inkl. In-Page-Vorschau).

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
  getCheckpointTypes().forEach((t, i) => {
    evt.checkpoints.push(withCheckpointDefaults({
      id: uid('cp'), order: i + 1, lat: 50 + i * 0.01, lng: 8 + i * 0.01,
      name: 'CP ' + t.shortLabel, type: t.key, mandatory: i % 2 === 0
    }));
  });
  checkEqual('Alle ' + getCheckpointTypes().length + ' Checkpoint-Typen angelegt', evt.checkpoints.length, getCheckpointTypes().length);
  getCheckpointTypes().forEach(t => {
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
    /* Seit Paket 11 (Fahrer-Sidebar) ist "Kategorien" ein eigener Sidebar-
       Screen statt eines aufklappbaren Panels — ohne diesen Wechsel existiert
       #newcatgroup-name weiter unten nicht im DOM, genau wie ein echter
       Nutzer erst zu "Kategorien" navigieren müsste. */
    selectRidersSection('categories');
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

    /* Aufräumen, damit die nachfolgenden Check-in-Abschnitte (5+) unverändert bleiben.
       checkpointTimes wird seit Phase 11 bei JEDEM Check-in miterfasst (nicht mehr nur
       bei timeWindowEnabled, siehe sudden_death), daher hier ebenfalls zurücksetzen. */
    evt.riders[2].completed = [];
    evt.riders[2].checkpointOrderOverrides = [];
    evt.riders[2].checkpointTimes = {};
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
    checkEqual('duplicateCheckpoint blockiert bei gesperrtem Checkpoint', evt.checkpoints.length, getCheckpointTypes().length);

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

    /* Auto-Backup an/ausschaltbar, Default aus (Ad-hoc-Nutzerwunsch 19.08.2026).
       triggerBackupNow() wird hier durch einen Spy ersetzt statt echt aufgerufen
       zu werden, damit der Test nicht bei jedem Lauf einen zweiten echten
       Download auslöst (der erste, echte kommt bereits aus dem Check oben). */
    {
      const origTriggerBackupNow = window.triggerBackupNow;
      let backupCalls = 0;
      window.triggerBackupNow = async () => { backupCalls++; };
      const statusBeforeAutoBackup = evt.status;

      checkEqual('appSettings.autoBackupEnabled ist per Default deaktiviert', state.appSettings.autoBackupEnabled, false);

      evt.status = 'running';
      await runAutoBackupTick();
      checkEqual('runAutoBackupTick tut nichts, wenn deaktiviert (auch während "Läuft")', backupCalls, 0);

      onAutoBackupEnabledChange(true);
      checkEqual('onAutoBackupEnabledChange aktiviert Auto-Backup', state.appSettings.autoBackupEnabled, true);

      evt.status = 'planning';
      await runAutoBackupTick();
      checkEqual('runAutoBackupTick tut nichts, wenn kein Rennen läuft (auch wenn aktiviert)', backupCalls, 0);

      evt.status = 'running';
      await runAutoBackupTick();
      checkEqual('runAutoBackupTick löst Backup aus, wenn aktiviert + "Läuft"', backupCalls, 1);

      onAutoBackupEnabledChange(false);
      checkEqual('onAutoBackupEnabledChange deaktiviert wieder', state.appSettings.autoBackupEnabled, false);

      evt.status = statusBeforeAutoBackup;
      window.triggerBackupNow = origTriggerBackupNow;
    }

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

  /* 3i) PDF-Baukasten */
  {
    /* Paket 5 Teil B (17.6): neue Events bekommen jetzt vorbefüllte
       Dokument-Typ-Vorlagen statt eines leeren Baukastens — 5 Manifest- +
       2 Spokecards-Default-Blöcke, siehe PDF_DOCUMENT_TEMPLATES. */
    checkEqual('Neues Event hat vorbefüllte Standard-PDF-Blöcke (Dokument-Typ-Vorlagen)', evt.pdfBlocks.length, 7);
    check('Standard-Blöcke enthalten Checkpoint-Übersicht für Manifest', evt.pdfBlocks.some(b => b.type === 'checkpoint_list' && b.targetDocuments.includes('manifest')));
    check('Standard-Blöcke enthalten Notfall-Infos für Spokecards', evt.pdfBlocks.some(b => b.type === 'emergency_info' && b.targetDocuments.includes('spokecards')));

    const countBeforeAdds = evt.pdfBlocks.length;
    addPdfBlock('waiver');
    addPdfBlock('sponsors');
    addPdfBlock('checkpoint_list');
    checkEqual('addPdfBlock legt 3 weitere Blöcke an', evt.pdfBlocks.length, countBeforeAdds + 3);
    const waiverBlock = evt.pdfBlocks[evt.pdfBlocks.length - 3];
    checkEqual('Neuer Block hat Default-Target "manifest"', waiverBlock.targetDocuments.join(','), 'manifest');

    onPdfBlockContentChange(waiverBlock.id, 'Teilnahme auf eigene Gefahr.\n\nZweiter Absatz.');
    checkEqual('onPdfBlockContentChange setzt Inhalt', waiverBlock.content, 'Teilnahme auf eigene Gefahr.\n\nZweiter Absatz.');
    onPdfBlockConfigToggle(waiverBlock.id, 'showSignatureLine', true);
    checkEqual('onPdfBlockConfigToggle setzt Config', waiverBlock.config.showSignatureLine, true);
    togglePdfBlockTargetDocument(waiverBlock.id, 'spokecards', true);
    check('togglePdfBlockTargetDocument fügt Ziel hinzu', waiverBlock.targetDocuments.includes('spokecards'));
    togglePdfBlockEnabled(waiverBlock.id, false);
    checkEqual('togglePdfBlockEnabled deaktiviert Block', waiverBlock.enabled, false);
    togglePdfBlockEnabled(waiverBlock.id, true);

    const idsBefore = evt.pdfBlocks.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(b => b.id);
    movePdfBlock(evt.pdfBlocks[1].id, -1);
    const idsAfter = evt.pdfBlocks.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(b => b.id);
    checkEqual('movePdfBlock vertauscht Reihenfolge', idsAfter[0], idsBefore[1]);
    movePdfBlock(idsAfter[0], 1);

    const customBlock = withPdfBlockDefaults({type: 'custom_text'});
    checkEqual('pdfBlockTitle nutzt Typ-Label ohne customTitle', pdfBlockTitle(customBlock), t('pdfBlocks.type.custom_text'));
    customBlock.config.customTitle = 'Mein Titel';
    checkEqual('pdfBlockTitle nutzt customTitle wenn gesetzt', pdfBlockTitle(customBlock), 'Mein Titel');

    const sponsorsBlock = evt.pdfBlocks.find(b => b.type === 'sponsors');
    sponsorsBlock.config.logos = [];
    onPdfBlockSponsorLogoUpload(sponsorsBlock.id, {files: [new File(['x'], 'logo.png', {type: 'image/png'})], value: ''});
    await wait(60);
    check('onPdfBlockSponsorLogoUpload fügt Logo hinzu', sponsorsBlock.config.logos.length === 1);
    removePdfBlockSponsorLogo(sponsorsBlock.id, 0);
    checkEqual('removePdfBlockSponsorLogo entfernt Logo', sponsorsBlock.config.logos.length, 0);

    /* event_locations-Block (Paket 4, Schritt 8) — Auto-Block wie checkpoint_list,
       kein manueller Inhalt. evt.eventLocations ist an dieser Stelle der Suite
       noch leer (erst in 3p befüllt), deckt also zunächst den Leer-Zustand ab. */
    check('PDF_BLOCK_TYPES enthält "event_locations"', PDF_BLOCK_TYPES.includes('event_locations'));
    addPdfBlock('event_locations');
    const eventLocBlock = evt.pdfBlocks.find(b => b.type === 'event_locations');
    checkEqual('pdfBlockTitle nutzt das Typ-Label für event_locations', pdfBlockTitle(eventLocBlock), t('pdfBlocks.type.event_locations'));
    await checkNoThrowAsync('appendPdfBlocks rendert event_locations ohne gesetzte Orte (Leer-Hinweis) ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });
    setCheckpointAsHq(evt, evt.checkpoints[0].id, true);
    placeEventLocationAt(evt, 'afterparty', 50.95, 6.96);
    await checkNoThrowAsync('appendPdfBlocks rendert event_locations mit HQ+Afterparty ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit: 'pt', format: 'a4'});
      appendPdfBlocks(doc, evt, 'manifest');
      check('event_locations-Block hängt eine zusätzliche Seite an', doc.internal.getNumberOfPages() >= 2);
    });
    evt.eventLocations = [];

    await checkNoThrowAsync('appendPdfBlocks (Manifest, pt-Einheiten) läuft ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });
    await checkNoThrowAsync('appendPdfBlocks (Spokecards, mm-Einheiten) läuft ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'mm', format: 'a4'}), evt, 'spokecards');
    });
    await checkNoThrowAsync('exportManifestPDF mit aktivem Baukasten läuft ohne Fehler', exportManifestPDF);
    closePdfPreview();
    await checkNoThrowAsync('buildSpokeCardsDoc mit aktivem Baukasten läuft ohne Fehler', () => buildSpokeCardsDoc(evt));

    const countBeforeImport = evt.pdfBlocks.length;
    const templateJson = JSON.stringify(evt.pdfBlocks);
    evt.pdfBlocks = [];
    const origConfirmPdf = window.confirm;
    window.confirm = () => true;
    await onImportPdfBlocksFile({value: '', files: [new File([templateJson], 'template.json', {type: 'application/json'})]});
    checkEqual('JSON-Vorlagen-Import stellt Blockanzahl wieder her', evt.pdfBlocks.length, countBeforeImport);

    openManifest();
    state.manifestSection = 'baukasten';
    render();
    await wait(20);
    check('PDF-Baukasten-Panel rendert in der Manifest-Sidebar-Sektion', document.querySelector('.pdf-blocks-panel') !== null);
    checkEqual('Block-Zeilen im Panel entsprechen Blockanzahl', document.querySelectorAll('.pdf-block-row').length, evt.pdfBlocks.length);
    state.manifestSection = 'anpassen';

    const countBeforeDelete = evt.pdfBlocks.length;
    deletePdfBlock(evt.pdfBlocks[0].id);
    window.confirm = origConfirmPdf;
    checkEqual('deletePdfBlock entfernt Block', evt.pdfBlocks.length, countBeforeDelete - 1);
  }

  /* 3i-b) PDF-Baukasten 2.0 — Auto-Flow-Layout, Breiten, neue Blocktypen,
     Dokument-Vorlagen, Vorschau (Paket 5 Teil B, Phase 17) */
  {
    /* layoutBlocks() — verbatim spec function 17.2 */
    const mk = (width, pageBreakBefore) => ({width, pageBreakBefore: !!pageBreakBefore});
    checkEqual('layoutBlocks: leere Liste -> keine Zeilen', layoutBlocks([]).length, 0);
    const rFull = layoutBlocks([mk('full'), mk('full')]);
    checkEqual('layoutBlocks: zwei full-Blöcke -> je eigene Zeile', rFull.length, 2);
    const rHalf = layoutBlocks([mk('half'), mk('half')]);
    checkEqual('layoutBlocks: zwei half-Blöcke -> 1 gemeinsame Zeile', rHalf.length, 1);
    checkEqual('layoutBlocks: Zeile enthält beide half-Blöcke', rHalf[0].length, 2);
    const rThird3 = layoutBlocks([mk('third'), mk('third'), mk('third')]);
    checkEqual('layoutBlocks: drei third-Blöcke (0.99) passen in 1 Zeile', rThird3.length, 1);
    checkEqual('layoutBlocks: Zeile enthält alle drei third-Blöcke', rThird3[0].length, 3);
    const rThird4 = layoutBlocks([mk('third'), mk('third'), mk('third'), mk('third')]);
    checkEqual('layoutBlocks Edge Case Summe>100%: vierter third-Block startet neue Zeile', rThird4.length, 2);
    check('layoutBlocks Edge Case: erste Zeile 3 Blöcke, zweite 1 Block', rThird4[0].length === 3 && rThird4[1].length === 1);
    const rHalfThird = layoutBlocks([mk('half'), mk('third')]);
    checkEqual('layoutBlocks: half+third (0.83) teilen sich eine Zeile', rHalfThird.length, 1);
    const rBreak = layoutBlocks([mk('half'), mk('half', true)]);
    checkEqual('layoutBlocks: pageBreakBefore erzwingt neue Zeile trotz freiem Platz', rBreak.length, 2);

    /* Migrationsregression (17.8 Schritt 8): ein Block ohne width/pageBreakBefore-
       Feld (Storage-Shape vor Teil B) muss weiterhin wie ein einzelner
       full-width-Block behandelt werden — eigene Zeile, eigene Seite. */
    const legacyRaw = {id: 'legacy1', type: 'rules', targetDocuments: ['manifest'], enabled: true, sortOrder: 0, content: 'Alter Inhalt', config: {}};
    const migrated = withPdfBlockDefaults(legacyRaw);
    checkEqual('Migration: Legacy-Block ohne width-Feld bekommt Default "full"', migrated.width, 'full');
    checkEqual('Migration: Legacy-Block ohne pageBreakBefore-Feld bekommt Default false', migrated.pageBreakBefore, false);
    checkEqual('Migration: zwei migrierte full-Blöcke bleiben je eine eigene Zeile', layoutBlocks([migrated, withPdfBlockDefaults({id: 'legacy2', type: 'notes', targetDocuments: ['manifest'], enabled: true, sortOrder: 1, content: 'B', config: {}})]).length, 2);
    await checkNoThrowAsync('Migration: appendPdfBlocks rendert einen migrierten Legacy-Block ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit: 'pt', format: 'a4'});
      appendPdfBlocks(doc, Object.assign({}, evt, {pdfBlocks: [migrated]}), 'manifest');
      checkEqual('Migration: ein full-width-Block bekommt weiterhin genau eine eigene Seite', doc.internal.getNumberOfPages(), 2);
    });

    /* width/pageBreakBefore Setter + UI */
    const widthTestBlock = evt.pdfBlocks[0];
    setPdfBlockWidth(widthTestBlock.id, 'half');
    checkEqual('setPdfBlockWidth setzt Breite', widthTestBlock.width, 'half');
    setPdfBlockWidth(widthTestBlock.id, 'invalid-value');
    checkEqual('setPdfBlockWidth ignoriert ungültigen Wert', widthTestBlock.width, 'half');
    togglePdfBlockPageBreak(widthTestBlock.id, true);
    checkEqual('togglePdfBlockPageBreak setzt Flag', widthTestBlock.pageBreakBefore, true);
    togglePdfBlockPageBreak(widthTestBlock.id, false);
    setPdfBlockWidth(widthTestBlock.id, 'full');

    openManifest();
    state.manifestSection = 'baukasten';
    render();
    await wait(20);
    checkEqual('Breiten-Dropdown pro Block gerendert', document.querySelectorAll('.pdf-block-width-label select').length, evt.pdfBlocks.length);
    checkEqual('Seitenumbruch-Checkbox pro Block gerendert', document.querySelectorAll('.pdf-block-row-options input[type=checkbox]').length, evt.pdfBlocks.length);
    check('Vorschau-Buttons im Panel gerendert', document.body.innerHTML.includes(t('pdfBlocks.previewManifest')) && document.body.innerHTML.includes(t('pdfBlocks.previewSpokecards')));
    state.manifestSection = 'anpassen';
    render();

    /* neuer Blocktyp: image (inkl. Client-Komprimierung) */
    check('PDF_BLOCK_TYPES enthält "image"', PDF_BLOCK_TYPES.includes('image'));
    addPdfBlock('image');
    const imageBlock = evt.pdfBlocks[evt.pdfBlocks.length - 1];
    checkEqual('Neuer image-Block hat noch kein dataUrl', !!imageBlock.config.dataUrl, false);

    const bigCanvas = document.createElement('canvas');
    bigCanvas.width = 2000; bigCanvas.height = 1000;
    bigCanvas.getContext('2d').fillRect(0, 0, 2000, 1000);
    const bigBlob = await new Promise(resolve => bigCanvas.toBlob(resolve, 'image/png'));
    const bigResult = await compressImageFile(new File([bigBlob], 'route.png', {type: 'image/png'}));
    check('compressImageFile liefert eine JPEG-DataURL', bigResult.dataUrl.startsWith('data:image/jpeg'));
    checkEqual('compressImageFile skaliert >1600px Breite auf 1600px', bigResult.w, 1600);
    checkEqual('compressImageFile skaliert Höhe proportional (2000x1000 -> 1600x800)', bigResult.h, 800);

    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = 400; smallCanvas.height = 300;
    smallCanvas.getContext('2d').fillRect(0, 0, 400, 300);
    const smallBlob = await new Promise(resolve => smallCanvas.toBlob(resolve, 'image/png'));
    const smallResult = await compressImageFile(new File([smallBlob], 'small.png', {type: 'image/png'}));
    checkEqual('compressImageFile skaliert kleine Bilder nicht hoch', smallResult.w, 400);

    await onPdfBlockImageUpload(imageBlock.id, {files: [new File([bigBlob], 'route.png', {type: 'image/png'})], value: ''});
    check('onPdfBlockImageUpload speichert dataUrl + imageDims', !!imageBlock.config.dataUrl && imageBlock.config.imageDims.w === 1600);
    onPdfBlockImageCaptionChange(imageBlock.id, 'Streckenübersicht');
    checkEqual('onPdfBlockImageCaptionChange setzt Bildunterschrift', imageBlock.config.caption, 'Streckenübersicht');
    onPdfBlockImageAlignChange(imageBlock.id, 'left');
    checkEqual('onPdfBlockImageAlignChange setzt Ausrichtung', imageBlock.config.alignment, 'left');
    await checkNoThrowAsync('appendPdfBlocks rendert image-Block mit Bild ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });
    removePdfBlockImage(imageBlock.id);
    checkEqual('removePdfBlockImage entfernt dataUrl', !!imageBlock.config.dataUrl, false);
    await checkNoThrowAsync('appendPdfBlocks rendert image-Block ohne Bild (Leer-Hinweis) ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });

    /* neuer Blocktyp: table (feste App-Daten-Quellen) */
    check('PDF_BLOCK_TYPES enthält "table"', PDF_BLOCK_TYPES.includes('table'));
    checkEqual('pdfBlockLogosPerRow: full->3, half->2, third->1', [pdfBlockLogosPerRow('full'), pdfBlockLogosPerRow('half'), pdfBlockLogosPerRow('third')].join(','), '3,2,1');
    addPdfBlock('table');
    const tableBlock = evt.pdfBlocks[evt.pdfBlocks.length - 1];
    const cpTableData = pdfBlockTableData(tableBlock, evt);
    checkEqual('table-Block Default-Source ist checkpoint_distances', cpTableData.headers[0], t('pdfBlocks.table.checkpoint'));
    checkEqual('table checkpoint_distances liefert eine Zeile pro Checkpoint (+ Gesamt bei >1)', cpTableData.rows.length, evt.checkpoints.length + (evt.checkpoints.length > 1 ? 1 : 0));
    onPdfBlockTableSourceChange(tableBlock.id, 'category_breakdown');
    checkEqual('onPdfBlockTableSourceChange wechselt Quelle', tableBlock.config.source, 'category_breakdown');
    checkEqual('table category_breakdown liefert 3 Spalten', pdfBlockTableData(tableBlock, evt).headers.length, 3);
    onPdfBlockTableSourceChange(tableBlock.id, 'team_list');
    const teamTableData = pdfBlockTableData(tableBlock, evt);
    checkEqual('table team_list liefert 2 Spalten', teamTableData.headers.length, 2);
    checkEqual('table team_list liefert eine Zeile pro Team', teamTableData.rows.length, evt.teams.length);
    onPdfBlockTableSourceChange(tableBlock.id, 'invalid-source');
    checkEqual('onPdfBlockTableSourceChange ignoriert ungültige Quelle', tableBlock.config.source, 'team_list');
    await checkNoThrowAsync('appendPdfBlocks rendert table-Block ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });

    /* neuer Blocktyp: variable_text (Platzhalter-Interpolation, 17.5) */
    check('PDF_BLOCK_TYPES enthält "variable_text"', PDF_BLOCK_TYPES.includes('variable_text'));
    addPdfBlock('variable_text');
    const varBlock = evt.pdfBlocks[evt.pdfBlocks.length - 1];
    onPdfBlockContentChange(varBlock.id, 'Willkommen beim {{event.name}}! {{event.riderCount}} Fahrer am Start. Unbekannt: {{event.doesNotExist}}');
    const interpolated = interpolatePdfBlockVariables(varBlock.content, evt);
    check('interpolatePdfBlockVariables setzt {{event.name}} ein', interpolated.includes(evt.name));
    check('interpolatePdfBlockVariables setzt {{event.riderCount}} ein', interpolated.includes(String(evt.riders.length)));
    check('interpolatePdfBlockVariables lässt unbekannte Platzhalter unverändert', interpolated.includes('{{event.doesNotExist}}'));
    check('interpolatePdfBlockVariables verändert den gespeicherten content nicht (Vorlage bleibt wiederverwendbar)', varBlock.content.includes('{{event.name}}'));
    await checkNoThrowAsync('appendPdfBlocks rendert variable_text-Block ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });

    /* Dokument-Typ-Vorlagen + "Auf Standard zurücksetzen" (17.6) */
    check('PDF_DOCUMENT_TEMPLATES enthält Vorlagen für manifest und spokecards', !!PDF_DOCUMENT_TEMPLATES.manifest && !!PDF_DOCUMENT_TEMPLATES.spokecards);
    const freshBlocks = defaultPdfBlocksForNewEvent();
    checkEqual('defaultPdfBlocksForNewEvent liefert 7 Blöcke (5 Manifest + 2 Spokecards)', freshBlocks.length, 7);
    checkEqual('defaultPdfBlocksForNewEvent: 5 Blöcke targeten nur Manifest', freshBlocks.filter(b => b.targetDocuments.join(',') === 'manifest').length, 5);
    checkEqual('defaultPdfBlocksForNewEvent: 2 Blöcke targeten nur Spokecards', freshBlocks.filter(b => b.targetDocuments.join(',') === 'spokecards').length, 2);

    const dualTargetBlock = evt.pdfBlocks.find(b => b.targetDocuments.includes('manifest'));
    togglePdfBlockTargetDocument(dualTargetBlock.id, 'spokecards', true);
    check('Vorbereitung Reset-Test: Block targetet jetzt Manifest+Spokecards', dualTargetBlock.targetDocuments.includes('manifest') && dualTargetBlock.targetDocuments.includes('spokecards'));
    const origConfirmReset = window.confirm;
    window.confirm = () => true;
    resetPdfBlocksToDefault('manifest');
    window.confirm = origConfirmReset;
    const manifestOnlyAfterReset = evt.pdfBlocks.filter(b => b.targetDocuments.length === 1 && b.targetDocuments[0] === 'manifest');
    checkEqual('resetPdfBlocksToDefault(manifest) hinterlässt genau die 5 Vorlagen-Blöcke für Manifest', manifestOnlyAfterReset.length, 5);
    check('resetPdfBlocksToDefault(manifest) lässt Spokecards-Blöcke unangetastet', evt.pdfBlocks.some(b => b.targetDocuments.includes('spokecards')));
    checkEqual('resetPdfBlocksToDefault(manifest) entfernt "manifest" aus Blöcken die auch Spokecards targeten (kein komplettes Löschen)', dualTargetBlock.targetDocuments.join(','), 'spokecards');
    await checkNoThrowAsync('appendPdfBlocks rendert nach Reset-to-Default ohne Fehler', async () => {
      const { jsPDF } = window.jspdf;
      appendPdfBlocks(new jsPDF({unit: 'pt', format: 'a4'}), evt, 'manifest');
    });

    /* Vorlagen-Export/-Import um Breiten erweitert (17.8 Schritt 7) */
    const widthImportBlock = evt.pdfBlocks[0];
    setPdfBlockWidth(widthImportBlock.id, 'half');
    togglePdfBlockPageBreak(widthImportBlock.id, true);
    const templateJsonWithWidth = JSON.stringify(evt.pdfBlocks);
    const countBeforeWidthImport = evt.pdfBlocks.length;
    evt.pdfBlocks = [];
    const origConfirmImport2 = window.confirm;
    window.confirm = () => true;
    await onImportPdfBlocksFile({value: '', files: [new File([templateJsonWithWidth], 'template-width.json', {type: 'application/json'})]});
    window.confirm = origConfirmImport2;
    checkEqual('JSON-Import stellt Blockanzahl wieder her', evt.pdfBlocks.length, countBeforeWidthImport);
    check('JSON-Import überträgt width/pageBreakBefore aus der Vorlage (statt sie zu verwerfen)', evt.pdfBlocks.some(b => b.width === 'half' && b.pageBreakBefore === true));

    /* Vorschau-Funktion (17.8 Schritt 5) — rendert nur den Baukasten-Teil
       in einem Standalone-Doc, gezeigt über die bestehende Iframe-Vorschau
       aus Paket 1 statt einer neuen PDF->Bild-Rasterisierung. */
    await checkNoThrowAsync('previewPdfBlocksLayout("manifest") läuft ohne Fehler', async () => previewPdfBlocksLayout('manifest'));
    check('previewPdfBlocksLayout öffnet die PDF-Vorschau', state.pdfPreviewOpen === true);
    closePdfPreview();
    await checkNoThrowAsync('previewPdfBlocksLayout("spokecards") läuft ohne Fehler', async () => previewPdfBlocksLayout('spokecards'));
    closePdfPreview();

    const origAlertPreview = window.alert;
    let previewAlertCalled = false;
    window.alert = () => { previewAlertCalled = true; };
    const emptyBlocksEvt = state.currentEvent;
    const savedBlocks = emptyBlocksEvt.pdfBlocks;
    emptyBlocksEvt.pdfBlocks = [];
    previewPdfBlocksLayout('manifest');
    check('previewPdfBlocksLayout zeigt Hinweis statt Vorschau bei keinen aktiven Blöcken', previewAlertCalled && !state.pdfPreviewOpen);
    window.alert = origAlertPreview;
    emptyBlocksEvt.pdfBlocks = savedBlocks;
  }

  /* 3j) Spielmodi-Engine */
  {
    checkEqual('Event hat scoringMode "time" per Default', evt.scoringMode, 'time');
    checkEqual('Event hat leere gameModes per Default', evt.gameModes.length, 0);
    checkEqual('Event hat leere pointsLedger per Default', evt.pointsLedger.length, 0);
    checkEqual('Checkpoint hat gameHidden=false per Default', evt.checkpoints[0].gameHidden, false);

    const noopResult = evaluateRules(evt, 'on_checkin', {rider: evt.riders[0], checkpoint: evt.checkpoints[0], timestamp: toLocalDateTimeInputValue(new Date())});
    checkEqual('evaluateRules ohne aktive Modi liefert unblocked', noopResult.blocked, false);

    /* Eigenständiges Synth-Event, damit die Modi-Logik isoliert von den
       späteren Check-in-Abschnitten (5+) getestet werden kann. */
    const gEvt = {
      id: 'synth-game', name: 'Synth Game', status: 'planning', startMode: 'manual', startConfirmedAt: '',
      checkpointOrderMode: 'frei', scoringMode: 'time', gameModes: [], ruleRuntimeState: {}, pointsLedger: [],
      checkpoints: [
        withCheckpointDefaults({id: 'g-cp1', order: 1, lat: 50.10, lng: 8.68, name: 'Mandatory', mandatory: true}),
        withCheckpointDefaults({id: 'g-cp2', order: 2, lat: 50.11, lng: 8.69, name: 'Bonus', mandatory: false}),
        withCheckpointDefaults({id: 'g-cp3', order: 3, lat: 50.30, lng: 8.90, name: 'Far', mandatory: false})
      ],
      riders: [
        withRiderDefaults({bib: 1, name: 'Rider1'}),
        withRiderDefaults({bib: 2, name: 'Rider2'}),
        withRiderDefaults({bib: 3, name: 'Rider3'})
      ]
    };
    function enableMode(type, config){
      const mode = withGameModeDefaults({type, enabled: true, config: config || {}});
      gEvt.gameModes.push(mode);
      return mode;
    }

    /* time_window: Check-in außerhalb des Fensters wird blockiert */
    {
      const cp = gEvt.checkpoints[0];
      cp.timeWindowEnabled = true;
      cp.timeWindowStart = toLocalDateTimeInputValue(new Date(Date.now() + 3600000));
      cp.timeWindowEnd = toLocalDateTimeInputValue(new Date(Date.now() + 7200000));
      enableMode('time_window');
      const r = evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: cp, timestamp: toLocalDateTimeInputValue(new Date())});
      check('time_window blockiert Check-in außerhalb des Fensters', r.blocked && r.message);
      cp.timeWindowEnabled = false;
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'time_window');
    }

    /* first_n: Bonus-Checkpoint vergibt Punkte nach Ankunftsrang */
    {
      enableMode('first_n', {pointsByRank: [5, 3, 1]});
      const bonusCp = gEvt.checkpoints[1];
      [gEvt.riders[0], gEvt.riders[1], gEvt.riders[2]].forEach(r => {
        evaluateRules(gEvt, 'on_checkin', {rider: r, checkpoint: bonusCp, timestamp: toLocalDateTimeInputValue(new Date())});
        r.completed.push(bonusCp.id);
      });
      checkEqual('first_n: 1. Fahrer erhält 5 Punkte', pointsForRider(gEvt, 1), 5);
      checkEqual('first_n: 2. Fahrer erhält 3 Punkte', pointsForRider(gEvt, 2), 3);
      checkEqual('first_n: 3. Fahrer erhält 1 Punkt', pointsForRider(gEvt, 3), 1);
      checkEqual('first_n: Ledger-Einträge korrekt gezählt', gEvt.pointsLedger.filter(p => p.source === 'first_n').length, 3);
      removeLedgerEntries(gEvt, p => p.source === 'first_n');
      checkEqual('removeLedgerEntries räumt gezielt auf', gEvt.pointsLedger.length, 0);
      gEvt.riders.forEach(r => { r.completed = []; });
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'first_n');
    }

    /* prerequisite: geheimer Checkpoint wird erst nach Vorbedingung sichtbar */
    {
      const secretCp = gEvt.checkpoints[2];
      secretCp.gameHidden = true;
      secretCp.gameRevealPrerequisiteCpId = gEvt.checkpoints[0].id;
      enableMode('prerequisite');
      checkEqual('isCpRevealed: versteckt bis Vorbedingung erfüllt', isCpRevealed(gEvt, secretCp), false);
      evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: gEvt.checkpoints[0], timestamp: toLocalDateTimeInputValue(new Date())});
      checkEqual('isCpRevealed: sichtbar nach Vorbedingung', isCpRevealed(gEvt, secretCp), true);
      checkEqual('rule_runtime_state führt enthüllte Checkpoints', gEvt.ruleRuntimeState.revealedCheckpoints.includes(secretCp.id), true);
      secretCp.gameHidden = false;
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'prerequisite');
    }

    /* zone_active: Battle Royale — Zonen-Stufen + gesperrte Checkpoints */
    {
      const zoneMode = enableMode('zone_active', {triggerMode: 'manual', stages: [{radius: 100, atMinute: 0}]});
      const farCp = gEvt.checkpoints[2];
      checkEqual('isCpClosedByZone: ohne aktive Stufe nichts gesperrt', isCpClosedByZone(gEvt, farCp), false);
      evaluateRules(gEvt, 'manual', {action: 'advance_zone_stage', modeId: zoneMode.id});
      checkEqual('manuelles advance_zone_stage erhöht ruleRuntimeState.zoneStage', gEvt.ruleRuntimeState.zoneStage, 0);
      checkEqual('isCpClosedByZone: entfernter Checkpoint jetzt gesperrt', isCpClosedByZone(gEvt, farCp), true);
      const blockResult = evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: farCp, timestamp: toLocalDateTimeInputValue(new Date())});
      check('zone_active blockiert Check-in an gesperrtem Checkpoint', blockResult.blocked);

      /* Zeitplan-Modus: automatischer Stufenaufstieg on_tick */
      gEvt.ruleRuntimeState.zoneStage = -1;
      zoneMode.config.triggerMode = 'scheduled';
      zoneMode.config.stages = [{radius: 9999999, atMinute: 0}];
      gEvt.status = 'running';
      gEvt.startConfirmedAt = toLocalDateTimeInputValue(new Date(Date.now() - 60000));
      evaluateRules(gEvt, 'on_tick', {now: Date.now()});
      checkEqual('Zeitplan-Modus advanced automatisch bei Erreichen von at_minute', gEvt.ruleRuntimeState.zoneStage, 0);
      gEvt.status = 'planning';
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'zone_active');
    }

    /* zone_active + Paket 4: optionale Bindung an eine echte evt.zones-
       Kreiszone (config.zoneId) statt am automatischen Checkpoint-Mittelpunkt.
       Rückwärtskompatibilität ist im Block direkt oberhalb bereits erwiesen
       (dort bleibt zoneId ungesetzt, Verhalten unverändert). */
    {
      gEvt.ruleRuntimeState.zoneStage = -1;
      const zoneMode2 = enableMode('zone_active', {triggerMode: 'manual', stages: [{radius: 100, atMinute: 0}, {radius: 50, atMinute: 5}]});
      const farCp2 = gEvt.checkpoints[2];
      const linkedZone = addZone(gEvt, {type: 'circle', name: 'Arena', center: {lat: farCp2.lat, lng: farCp2.lng}, radiusMeters: 999});
      zoneMode2.config.zoneId = linkedZone.id;

      evaluateRules(gEvt, 'manual', {action: 'advance_zone_stage', modeId: zoneMode2.id});
      checkEqual('Mit gesetzter zoneId liegt der Mittelpunkt auf der Zone statt dem Checkpoint-Mittelpunkt (derselbe Checkpoint war oben mit Auto-Mittelpunkt gesperrt)', isCpClosedByZone(gEvt, farCp2), false);
      checkEqual('advanceZoneStage synct den Radius der verknüpften Zone auf die neue Stufe', linkedZone.radiusMeters, 100);

      evaluateRules(gEvt, 'manual', {action: 'advance_zone_stage', modeId: zoneMode2.id});
      checkEqual('Zweiter Stufenwechsel synct den Zonen-Radius erneut', linkedZone.radiusMeters, 50);

      const formHtml = renderGameModeConfigForm(gEvt, zoneMode2);
      check('Zonen-Auswahl erscheint im Konfigurationsformular', formHtml.includes(t('gameModes.zoneSourceLabel')) && formHtml.includes('Arena'));

      removeZone(gEvt, linkedZone.id);
      gEvt.ruleRuntimeState.zoneStage = -1;
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'zone_active');
    }

    /* districts ("Bezirke"): mehrere gleichzeitig aktive Zonen, unabhängig
       vom einen schrumpfenden zone_active-Kreis — teilt sich nur das
       zones.js-Fundament (group/active-Felder, getCheckpointZone()). */
    {
      checkEqual('withZoneDefaults: group-Default ist leer', withZoneDefaults({}).group, '');
      checkEqual('withZoneDefaults: active-Default ist false', withZoneDefaults({}).active, false);

      const districtMode = enableMode('districts', {subVariant: 'points_only', pointsPerCheckpoint: 5});
      const insideCp = gEvt.checkpoints[0];
      const outsideCp = gEvt.checkpoints[2];
      const district = addZone(gEvt, {type: 'circle', name: 'Bezirk A', group: 'district', center: {lat: insideCp.lat, lng: insideCp.lng}, radiusMeters: 100});

      checkEqual('getCheckpointZone findet die Zone für einen Checkpoint innerhalb', getCheckpointZone(insideCp, [district]).id, district.id);
      checkEqual('getCheckpointZone liefert null für einen Checkpoint außerhalb', getCheckpointZone(outsideCp, [district]), null);

      const before = pointsForRider(gEvt, gEvt.riders[0].bib);
      evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: insideCp, timestamp: toLocalDateTimeInputValue(new Date())});
      checkEqual('points_only: keine Punkte, solange der Bezirk inaktiv ist', pointsForRider(gEvt, gEvt.riders[0].bib), before);

      evaluateRules(gEvt, 'manual', {action: 'toggle_district', zoneId: district.id, active: true});
      checkEqual('manuelles toggle_district aktiviert die Zone', district.active, true);
      check('Aktivierung erzeugt eventLog-Eintrag', gEvt.ruleRuntimeState.eventLog.some(e => e.type === 'district_toggled'));

      evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: insideCp, timestamp: toLocalDateTimeInputValue(new Date())});
      checkEqual('points_only: Punkte werden gutgeschrieben, sobald der Bezirk aktiv ist', pointsForRider(gEvt, gEvt.riders[0].bib), before + 5);

      removeLedgerEntries(gEvt, p => p.source === 'districts');
      districtMode.config.subVariant = 'gated';
      evaluateRules(gEvt, 'manual', {action: 'toggle_district', zoneId: district.id, active: false});
      const gatedBlock = evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: insideCp, timestamp: toLocalDateTimeInputValue(new Date())});
      check('gated: Check-in wird blockiert, solange der Bezirk inaktiv ist', gatedBlock.blocked);

      evaluateRules(gEvt, 'manual', {action: 'toggle_district', zoneId: district.id, active: true});
      const gatedOpen = evaluateRules(gEvt, 'on_checkin', {rider: gEvt.riders[0], checkpoint: insideCp, timestamp: toLocalDateTimeInputValue(new Date())});
      check('gated: Check-in nicht blockiert, sobald der Bezirk aktiv ist', !gatedOpen.blocked);

      const districtFormHtml = renderGameModeConfigForm(gEvt, districtMode);
      check('Bezirks-Konfigurationsformular zeigt die Zone und die Variante', districtFormHtml.includes('Bezirk A') && districtFormHtml.includes(t('gameModes.districtSubVariantLabel')));

      removeZone(gEvt, district.id);
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'districts');
    }

    /* rider_flag: Wildcard/Joker */
    {
      enableMode('rider_flag');
      const cp = gEvt.checkpoints[0];
      const rider = gEvt.riders[1];
      checkEqual('Fahrer ohne Joker: Checkpoint nicht automatisch erfüllt', isCpSatisfiedForRider(rider, cp), false);
      evaluateRules(gEvt, 'manual', {action: 'assign_joker', rider, checkpointId: cp.id});
      checkEqual('Joker-Zuweisung gesetzt', rider.gameFlags.jokerCpId, cp.id);
      checkEqual('isCpSatisfiedForRider erkennt Joker-Ausnahme', isCpSatisfiedForRider(rider, cp), true);
      evaluateRules(gEvt, 'manual', {action: 'assign_joker', rider, checkpointId: ''});
      checkEqual('Joker-Zuweisung kann wieder entfernt werden', !rider.gameFlags.jokerCpId, true);
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'rider_flag');
    }

    /* sequence_match: Kettenreaktion-Bonus bei perfekter Reihenfolge */
    {
      enableMode('sequence_match', {multiplier: 3});
      gEvt.checkpointOrderMode = 'fest';
      const rider = gEvt.riders[0];
      rider.completed = gEvt.checkpoints.map(c => c.id);
      rider.checkpointOrderOverrides = [];
      awardPoints(gEvt, rider.bib, null, 10, 'Testpunkte', 'test_source');
      evaluateRules(gEvt, 'on_finish', {rider});
      checkEqual('sequence_match: Bonus = Basis * (Multiplikator - 1)', pointsForRider(gEvt, rider.bib), 10 + 20);
      evaluateRules(gEvt, 'on_finish', {rider});
      checkEqual('sequence_match: erneuter Finish ersetzt statt verdoppelt den Bonus', pointsForRider(gEvt, rider.bib), 10 + 20);
      removeLedgerEntries(gEvt, () => true);
      gEvt.checkpointOrderMode = 'frei';
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'sequence_match');
    }

    /* sudden_death: Elimination nach Inaktivität — inkl. Regressionstest für
       explizite 0-Werte (0 || fallback würde 0 fälschlich ignorieren) */
    {
      const mode = enableMode('sudden_death', {cutoffMinutes: 0, inactivityMinutes: 0});
      gEvt.status = 'running';
      gEvt.startConfirmedAt = toLocalDateTimeInputValue(new Date(Date.now() - 3600000));
      gEvt.riders.forEach(r => { r.raceStatus = ''; r.finishTime = ''; r.checkpointTimes = {}; });
      evaluateRules(gEvt, 'on_tick', {now: Date.now()});
      check('sudden_death eliminiert inaktive Fahrer bei cutoffMinutes=0', gEvt.riders.every(r => r.raceStatus === 'eliminated'));
      checkEqual('riderStatusBadgeHtml zeigt Ausgeschieden-Badge', riderStatusBadgeHtml(gEvt, gEvt.riders[0]).includes(t('gameModes.eliminatedStatus')), true);
      gEvt.status = 'planning';
      gEvt.gameModes = gEvt.gameModes.filter(m => m.type !== 'sudden_death');
    }

    /* Leaderboard-Sortierung nach Punkten */
    {
      awardPoints(gEvt, 1, null, 2, 'x', 'x'); awardPoints(gEvt, 2, null, 9, 'x', 'x'); awardPoints(gEvt, 3, null, 5, 'x', 'x');
      const sorted = sortRidersByPoints(gEvt.riders, gEvt);
      checkEqual('sortRidersByPoints sortiert absteigend nach Punkten', sorted.map(r => r.bib).join(','), '2,3,1');
      removeLedgerEntries(gEvt, () => true);
    }

    /* Scoring-Mode-Wechsel: Aktivieren eines Punkte-Modus fragt nach Bestätigung */
    {
      const origConfirmGm = window.confirm;
      let confirmMsg = null;
      window.confirm = (msg) => { confirmMsg = msg; return true; };
      toggleGameMode('first_n', true);
      window.confirm = origConfirmGm;
      check('Aktivieren eines Punkte-Modus fragt nach Bestätigung', !!confirmMsg);
      checkEqual('Bestätigung schaltet scoringMode auf "points"', evt.scoringMode, 'points');
      checkEqual('toggleGameMode legt Moduseintrag an', !!getGameMode(evt, 'first_n'), true);
      check('isGameModeEnabled erkennt aktiven Modus', isGameModeEnabled(evt, 'first_n'));
    }
  }

  /* 3k) Live-Beamer für Spielmodi (Phase 12) */
  {
    /* Eigenständiges Synth-Event, unabhängig vom in 3j aufgeräumten gEvt. */
    const bEvt = {
      id: 'synth-beamer', name: 'Synth Beamer', status: 'running', startMode: 'manual',
      startConfirmedAt: toLocalDateTimeInputValue(new Date(Date.now() - 60000)),
      checkpointOrderMode: 'frei', scoringMode: 'time', gameModes: [], ruleRuntimeState: {}, pointsLedger: [],
      checkpoints: [
        withCheckpointDefaults({id: 'b-cp1', order: 1, lat: 50.10, lng: 8.68, name: 'Start', mandatory: true}),
        withCheckpointDefaults({id: 'b-cp2', order: 2, lat: 50.11, lng: 8.69, name: 'Bonus', mandatory: false}),
        withCheckpointDefaults({id: 'b-cp3', order: 3, lat: 50.30, lng: 8.90, name: 'Secret', mandatory: false})
      ],
      riders: [
        withRiderDefaults({bib: 1, name: 'BRider1'}),
        withRiderDefaults({bib: 2, name: 'BRider2'})
      ]
    };
    function enableBMode(type, config){
      const mode = withGameModeDefaults({type, enabled: true, config: config || {}});
      bEvt.gameModes.push(mode);
      return mode;
    }

    /* pushEventLog: keine Modi aktiv -> kein Log-Eintrag */
    checkEqual('pushEventLog ohne aktive Modi liefert null', pushEventLog(bEvt, 'bonus_secured', 'x', 1), null);
    checkEqual('eventLog bleibt bei keinen aktiven Modi leer', (bEvt.ruleRuntimeState.eventLog || []).length, 0);

    /* getBeamerLayout: reflektiert Modi-Konfiguration */
    let layout = getBeamerLayout(bEvt);
    checkEqual('getBeamerLayout: ohne Modi alles aus', layout.showZoneMap || layout.showPointsBoard || layout.showEventTicker, false);

    const zoneMode = enableBMode('zone_active', {triggerMode: 'scheduled', stages: [{radius: 2000, atMinute: 5}]});
    bEvt.scoringMode = 'points';
    layout = getBeamerLayout(bEvt);
    checkEqual('getBeamerLayout: showZoneMap bei aktivem zone_active', layout.showZoneMap, true);
    checkEqual('getBeamerLayout: showPointsBoard bei scoringMode points', layout.showPointsBoard, true);
    checkEqual('getBeamerLayout: showEventTicker bei mind. einem aktiven Modus', layout.showEventTicker, true);
    checkEqual('getBeamerLayout: showZoneCountdown bei triggerMode!=manual', layout.showZoneCountdown, true);
    zoneMode.config.triggerMode = 'manual';
    checkEqual('getBeamerLayout: showZoneCountdown=false bei triggerMode manual', getBeamerLayout(bEvt).showZoneCountdown, false);

    /* zone_shrink: manuelles Advance pusht Ticker-Eintrag + spielt Sound */
    evaluateRules(bEvt, 'manual', {action: 'advance_zone_stage', modeId: zoneMode.id});
    checkEqual('zone_shrink erzeugt eventLog-Eintrag', bEvt.ruleRuntimeState.eventLog.some(e => e.type === 'zone_shrink'), true);
    bEvt.gameModes = bEvt.gameModes.filter(m => m.type !== 'zone_active');
    bEvt.ruleRuntimeState.eventLog = [];

    /* bonus_secured: first_n pusht Ticker-Eintrag mit escapetem Fahrernamen */
    {
      enableBMode('first_n', {pointsByRank: [5]});
      const rider = bEvt.riders[0];
      rider.name = 'Max <b>Mustermann</b>';
      evaluateRules(bEvt, 'on_checkin', {rider, checkpoint: bEvt.checkpoints[1], timestamp: toLocalDateTimeInputValue(new Date())});
      const entry = bEvt.ruleRuntimeState.eventLog.find(e => e.type === 'bonus_secured');
      check('bonus_secured erzeugt eventLog-Eintrag', !!entry);
      check('bonus_secured-Nachricht escaped den Fahrernamen', entry && entry.message.includes('&lt;b&gt;') && !entry.message.includes('<b>'));
      rider.name = 'BRider1';
      bEvt.gameModes = bEvt.gameModes.filter(m => m.type !== 'first_n');
      bEvt.ruleRuntimeState.eventLog = [];
      removeLedgerEntries(bEvt, () => true);
    }

    /* checkpoint_revealed: prerequisite pusht Ticker-Eintrag */
    {
      enableBMode('prerequisite');
      const secretCp = bEvt.checkpoints[2];
      secretCp.gameHidden = true;
      secretCp.gameRevealPrerequisiteCpId = bEvt.checkpoints[0].id;
      evaluateRules(bEvt, 'on_checkin', {rider: bEvt.riders[0], checkpoint: bEvt.checkpoints[0], timestamp: toLocalDateTimeInputValue(new Date())});
      checkEqual('checkpoint_revealed erzeugt eventLog-Eintrag', bEvt.ruleRuntimeState.eventLog.some(e => e.type === 'checkpoint_revealed'), true);
      secretCp.gameHidden = false;
      bEvt.gameModes = bEvt.gameModes.filter(m => m.type !== 'prerequisite');
      bEvt.ruleRuntimeState.eventLog = [];
    }

    /* rider_eliminated: sudden_death pusht Ticker-Eintrag */
    {
      enableBMode('sudden_death', {cutoffMinutes: 0, inactivityMinutes: 0});
      bEvt.riders.forEach(r => { r.raceStatus = ''; r.finishTime = ''; r.checkpointTimes = {}; r.name = r.name || 'X'; });
      evaluateRules(bEvt, 'on_tick', {now: Date.now()});
      checkEqual('rider_eliminated erzeugt eventLog-Eintrag', bEvt.ruleRuntimeState.eventLog.some(e => e.type === 'rider_eliminated'), true);
      bEvt.riders.forEach(r => { r.raceStatus = ''; });
      bEvt.gameModes = bEvt.gameModes.filter(m => m.type !== 'sudden_death');
    }

    /* eventLog wird auf max. 30 Einträge gekappt */
    {
      enableBMode('first_n', {pointsByRank: [1]});
      bEvt.ruleRuntimeState.eventLog = [];
      for(let i = 0; i < 35; i++) pushEventLog(bEvt, 'bonus_secured', 'entry ' + i, 1);
      checkEqual('eventLog wird auf 30 Einträge gekappt', bEvt.ruleRuntimeState.eventLog.length, 30);
      checkEqual('eventLog behält die neuesten Einträge', bEvt.ruleRuntimeState.eventLog[29].message, 'entry 34');
      bEvt.gameModes = bEvt.gameModes.filter(m => m.type !== 'first_n');
    }

    /* Renderer: Ticker + Punkte-Board */
    {
      bEvt.scoringMode = 'points';
      bEvt.ruleRuntimeState.eventLog = [{id: 'log1', type: 'bonus_secured', message: '🎯 Testfahrer sichert sich einen Bonus', bib: 1, at: toLocalDateTimeInputValue(new Date())}];
      const tickerHtml = renderBeamerTicker(bEvt);
      check('renderBeamerTicker zeigt Log-Eintrag', tickerHtml.includes('Testfahrer sichert sich einen Bonus'));
      checkEqual('renderBeamerTicker liefert leeren String ohne Einträge', renderBeamerTicker({ruleRuntimeState: {eventLog: []}}), '');
      awardPoints(bEvt, 1, null, 7, 'Test', 'test_source');
      const pointsHtml = renderBeamerPointsBoard(bEvt);
      check('renderBeamerPointsBoard zeigt Fahrername + Punkte', pointsHtml.includes('BRider1') && pointsHtml.includes('7'));
      removeLedgerEntries(bEvt, () => true);
    }

    /* Elimination-Overlay: reine Render-Funktion (kein beamerState, um die
       Beamer-Route nicht anzufassen — siehe Hinweis zu location.hash oben) */
    checkEqual('renderBeamerEliminationOverlay escaped den Namen', renderBeamerEliminationOverlay('<script>x</script>').includes('<script>x</script>'), false);
    check('renderBeamerEliminationOverlay enthält Skull-Icon', renderBeamerEliminationOverlay('Test').includes('💀'));

    /* live-sync: broadcastLiveEvent/getLiveSyncChannel wirft nie */
    {
      let threw = false;
      try{ broadcastLiveEvent('synth-beamer', {id: 'x', type: 'zone_shrink'}); }
      catch(e){ threw = true; }
      check('broadcastLiveEvent wirft nicht (auch ohne Empfänger)', !threw);
    }
  }

  /* 3l) QoL: Bulk-Import, Error Boundary, Undo-Log (Phase 13) */
  {
    /* Sauberer Log-Stand für diesen Abschnitt (3c hat bereits Einträge erzeugt) */
    evt.actionLog = [];

    /* CSV-Parsing: Trennzeichen-Erkennung + Quoting */
    checkEqual('detectCsvDelimiter erkennt Semikolon', detectCsvDelimiter('a;b;c\n1;2;3'), ';');
    checkEqual('detectCsvDelimiter erkennt Komma', detectCsvDelimiter('a,b,c\n1,2,3'), ',');
    const csvText = `Startnummer;Name;Team;Notfallkontakt\n42;"Zoe ""Z"" Fast";Rot;123\n43;Yannick;;456\nabc;Bad;;789\n42;Dup;;000\n`;
    const csvRows = parseCsvText(csvText);
    checkEqual('parseCsvText liefert Header + 4 Datenzeilen', csvRows.length, 5);
    checkEqual('parseCsvText löst verdoppelte Anführungszeichen korrekt auf', csvRows[1][1], 'Zoe "Z" Fast');
    const guessedMap = guessBulkImportMapping(csvRows[0]);
    checkEqual('guessBulkImportMapping erkennt Startnummer-Spalte', guessedMap.bib, '0');
    checkEqual('guessBulkImportMapping erkennt Name-Spalte', guessedMap.name, '1');
    checkEqual('guessBulkImportMapping erkennt Team-Spalte', guessedMap.team, '2');
    checkEqual('guessBulkImportMapping erkennt Notfallkontakt-Spalte', guessedMap.emergency, '3');

    /* Validierung vor Import: fehlende/doppelte Startnummern landen als Fehlerliste statt stillem Scheitern */
    state.bulkImportRows = csvRows;
    state.bulkImportHasHeader = true;
    state.bulkImportMapping = guessedMap;
    runBulkImportValidation();
    checkEqual('Validierung erkennt 2 Fehlerzeilen (ungültig + doppelt)', state.bulkImportErrors.length, 2);
    check('Validierung meldet ungültige Startnummer', state.bulkImportErrors.some(e => e.message.includes('Ungültige Startnummer')));
    check('Validierung meldet doppelte Startnummer', state.bulkImportErrors.some(e => e.message.includes('Doppelte Startnummer')));
    checkEqual('Validierung liefert genau 2 gültige Zeilen', state.bulkImportValidRows.length, 2);

    /* Fehlende Spalten-Zuordnung wird ebenfalls als Fehler gemeldet, nicht stillschweigend übersprungen */
    state.bulkImportMapping = {bib: '', name: '', team: '', emergency: ''};
    runBulkImportValidation();
    checkEqual('Fehlende Bib-Zuordnung erzeugt genau einen Fehler', state.bulkImportErrors.length, 1);
    checkEqual('Ohne Bib-Zuordnung keine gültigen Zeilen', state.bulkImportValidRows.length, 0);
    state.bulkImportMapping = guessedMap;
    runBulkImportValidation();

    /* Import anwenden: legt neue Fahrer + fehlendes Team an, erweitert erwartete Fahrerzahl */
    const ridersBefore = evt.riders.length;
    const teamsBefore = evt.teams.length;
    const expectedBefore = evt.expectedRiders;
    applyBulkImportRows();
    checkEqual('Bulk-Import legt 2 neue Fahrer an', evt.riders.length, ridersBefore + 2);
    checkEqual('Bulk-Import legt genau 1 neues Team an ("Rot")', evt.teams.length, teamsBefore + 1);
    checkEqual('Bulk-Import erweitert erwartete Fahrerzahl auf die höchste importierte Bib', evt.expectedRiders, 43);
    const importedRider = evt.riders.find(r => r.bib === 42);
    const rotTeam = evt.teams.find(tm => tm.name === 'Rot');
    check('Importierter Fahrer ist dem neu angelegten Team zugeordnet', !!importedRider && !!rotTeam && importedRider.teamId === rotTeam.id);

    /* Undo macht den gesamten Import inkl. Team wieder rückgängig */
    let logEntry = evt.actionLog[evt.actionLog.length - 1];
    check('Bulk-Import erzeugt Undo-Log-Eintrag mit aktivem Handler', !!logEntry && !!state.actionUndoHandlers[logEntry.id]);
    undoLoggedAction(logEntry.id);
    checkEqual('Undo stellt ursprüngliche Fahrerzahl wieder her', evt.riders.length, ridersBefore);
    checkEqual('Undo entfernt das neu angelegte Team wieder', evt.teams.length, teamsBefore);
    checkEqual('Undo stellt erwartete Fahrerzahl wieder her', evt.expectedRiders, expectedBefore);
    checkEqual('Undo entfernt den Log-Eintrag wieder', evt.actionLog.length, 0);

    /* applyBulkImportRows mit leerer Auswahl ist ein No-op */
    state.bulkImportValidRows = [];
    applyBulkImportRows();
    checkEqual('Import ohne gültige Zeilen ändert Fahrerzahl nicht', evt.riders.length, ridersBefore);
    state.bulkImportOpen = false;
    state.bulkImportRows = [];
    state.bulkImportErrors = [];
    state.bulkImportValidRows = [];

    /* Fahrer löschen + Rückgängig (Undo-Log-Beispiel 1 aus der Spec) */
    evt.riders.push(withRiderDefaults({bib: 99, name: 'Temp <b>XSS</b>'}));
    const origConfirm4 = window.confirm;
    window.confirm = () => true;
    deleteRider(99);
    window.confirm = origConfirm4;
    check('deleteRider entfernt den Fahrer aus der Liste', !evt.riders.some(r => r.bib === 99));
    logEntry = evt.actionLog[evt.actionLog.length - 1];
    checkEqual('deleteRider-Log-Eintrag korrekt beschriftet', logEntry.label, 'Fahrer #99 Temp <b>XSS</b> gelöscht');
    check('deleteRider-Undo-Handler ist unmittelbar verfügbar', !!state.actionUndoHandlers[logEntry.id]);
    check('Aktions-Log-Panel escaped den Fahrernamen', renderActionLogPanel(evt).includes('&lt;b&gt;') && !renderActionLogPanel(evt).includes('<b>XSS'));
    undoLoggedAction(logEntry.id);
    check('Undo stellt den gelöschten Fahrer wieder her', evt.riders.some(r => r.bib === 99));
    evt.riders = evt.riders.filter(r => r.bib !== 99);
    evt.actionLog = [];

    /* Kategorie geändert (Undo-Log-Beispiel 2 aus der Spec) */
    const catGroup = evt.categoryGroups[0];
    const catRider = evt.riders[0];
    const previousCatValue = catRider.categories[catGroup.id];
    onRiderCategoryChange(catRider.bib, catGroup.id, 'Frei/Fixed-Test');
    checkEqual('Kategorie-Änderung wird sofort übernommen', catRider.categories[catGroup.id], 'Frei/Fixed-Test');
    logEntry = evt.actionLog[evt.actionLog.length - 1];
    check('Kategorie-Änderung erzeugt Undo-Log-Eintrag', !!logEntry && logEntry.label.includes('Kategorie'));
    undoLoggedAction(logEntry.id);
    checkEqual('Undo stellt vorherigen Kategorie-Wert wieder her', catRider.categories[catGroup.id], previousCatValue);
    evt.actionLog = [];

    /* Aktions-Log: Kappung auf die letzten 5 Einträge */
    for(let i = 0; i < 8; i++) logUndoableAction(evt, 'Testaktion ' + i, () => {});
    checkEqual('Aktions-Log wird auf 5 Einträge gekappt', evt.actionLog.length, 5);
    checkEqual('Aktions-Log behält den jeweils neuesten Eintrag', evt.actionLog[4].label, 'Testaktion 7');
    checkEqual('renderActionLogPanel liefert leeren String ohne Einträge', renderActionLogPanel({actionLog: []}), '');
    evt.actionLog = [];
    state.actionUndoHandlers = {};

    /* Error Boundary: Fehlerbildschirm statt weißem Bildschirm, Daten bleiben unangetastet im Speicher */
    const ebRoot = document.getElementById('error-boundary-root');
    showErrorBoundary(new Error('Test-Fehler für Verifikation'));
    check('Error Boundary zeigt Fehlerbildschirm statt weißem Bildschirm', !!document.querySelector('.error-boundary-overlay'));
    check('Error Boundary zeigt Reload-Button', !!document.querySelector('.error-boundary-box button'));
    showErrorBoundary(new Error('Zweiter Fehler'));
    checkEqual('Error Boundary zeigt sich nicht mehrfach übereinander', document.querySelectorAll('.error-boundary-overlay').length, 1);
    ebRoot.innerHTML = '';
    delete ebRoot.dataset.shown;

    /* Aufräumen: dieser Abschnitt hat mehrere Undo-Toasts ausgelöst (eigene 6s-Timer) —
       #toast-root leeren, damit spätere Tests (Abschnitt 7: Undo-Toast beim Check-in)
       nicht versehentlich den Rückgängig-Button eines hier ausgelösten Toasts treffen. */
    document.getElementById('toast-root').innerHTML = '';

    openRiders();
    await wait(20);
  }

  /* 3m) Paket 1 (Phase 19): Command Palette, Shortcuts, Sidebar-Collapse,
     Outdoor-Theme, Hover-Sync, Bulk-Actions, In-Page-PDF-Vorschau.
     Ruft bewusst NICHT openEditor() erneut auf — das würde state.currentEvent
     per Storage-Reload durch ein neues Objekt ersetzen und die lokale `evt`-
     Variable (dieselbe Referenz seit Abschnitt 1) vom weiteren Suite-Verlauf
     entkoppeln. Stattdessen wird direkt gerendert (state.view/render()) bzw.
     initMap()/redrawMarkers() manuell aufgerufen. */
  {
    /* Sidebar-Collapse: reiner Zustands-Roundtrip, unabhängig von der
       Fensterbreite (die tatsächliche Sichtbarkeit hängt zusätzlich vom
       SIDEBAR_BREAKPOINT ab, siehe map.js) */
    const collapsedBefore = isEditorSidebarCollapsed();
    toggleEditorSidebarCollapsed();
    checkEqual('Sidebar-Collapse-Zustand wird umgeschaltet', isEditorSidebarCollapsed(), !collapsedBefore);
    toggleEditorSidebarCollapsed();
    checkEqual('Sidebar-Collapse-Zustand zurückgeschaltet', isEditorSidebarCollapsed(), collapsedBefore);

    /* Globale Tab-Shortcuts: Zahlen navigieren, aber nicht innerhalb von Eingabefeldern */
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: '3', bubbles: true}));
    checkEqual('Taste "3" navigiert zu Fahrerliste', state.view, 'riders');
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: '5', bubbles: true}));
    checkEqual('Taste "5" navigiert zu Leaderboard', state.view, 'leaderboard');
    const shortcutProbeInput = document.createElement('input');
    shortcutProbeInput.type = 'text';
    document.body.appendChild(shortcutProbeInput);
    shortcutProbeInput.dispatchEvent(new KeyboardEvent('keydown', {key: '2', bubbles: true}));
    checkEqual('Zahlen-Shortcut wird in Eingabefeldern ignoriert', state.view, 'leaderboard');
    shortcutProbeInput.remove();

    /* Esc bricht den aktiven Checkpoint-Setzen-Modus ab */
    state.addMode = true;
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    checkEqual('Esc bricht aktiven Checkpoint-Setzen-Modus ab', state.addMode, false);

    /* Command Palette: öffnen, Fuzzy-Suche, Esc schließt */
    openCommandPalette();
    check('Command Palette öffnet sich', state.commandPaletteOpen);
    check('Command-Palette-Eingabefeld ist im DOM', !!document.getElementById('command-palette-input'));
    onCommandPaletteInput(t('ui.navCheckin'));
    const paletteItems = filteredCommandPaletteItems();
    check('Fuzzy-Suche findet Navigationseintrag "Ziel-Check-in"', paletteItems.some(i => i.label === t('ui.navCheckin')));
    check('commandPaletteFuzzyScore: Substring-Treffer liefert positiven Score', commandPaletteFuzzyScore('Hell', 'hell') > 0);
    checkEqual('commandPaletteFuzzyScore: kein Treffer liefert -1', commandPaletteFuzzyScore('Hell', 'xyz'), -1);
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    check('Esc schließt offene Command Palette', !state.commandPaletteOpen);
    checkEqual('Command-Palette-Root ist nach Schließen leer', document.getElementById('command-palette-root').innerHTML, '');

    /* Outdoor-Theme: 5. Theme, max. Kontrast, korrekt in THEMES registriert */
    const themeBefore = state.appSettings.theme;
    check('THEMES enthält Outdoor-Eintrag mit 4-teiligem Swatch', !!THEMES.outdoor && THEMES.outdoor.swatch.length === 4);
    setTheme('outdoor');
    checkEqual('Outdoor-Theme setzt data-theme auf der Wurzel', document.documentElement.getAttribute('data-theme'), 'outdoor');
    setTheme(themeBefore);
    checkEqual('Theme nach Test zurückgesetzt', document.documentElement.getAttribute('data-theme'), themeBefore);

    /* Hover-Sync: Sidebar-Zeile <-> Karten-Marker, in beide Richtungen */
    state.view = 'editor';
    render();
    initMap();
    redrawMarkers();
    await wait(30);
    checkEqual('cpMarkers enthält einen Marker je Checkpoint', Object.keys(cpMarkers).length, evt.checkpoints.length);
    const hoverCp = evt.checkpoints[0];
    setCpMarkerHoverSync(hoverCp.id, true);
    const hoverMarkerEl = cpMarkers[hoverCp.id].getElement();
    check('Sidebar-Hover pulsiert den zugehörigen Marker', hoverMarkerEl.querySelector('.cp-marker').classList.contains('cp-marker-hover-sync'));
    setCpMarkerHoverSync(hoverCp.id, false);
    check('Hover-Pulse-Klasse wird beim Verlassen wieder entfernt', !hoverMarkerEl.querySelector('.cp-marker').classList.contains('cp-marker-hover-sync'));
    setCpRowHoverSync(hoverCp.id, true);
    const hoverRowEl = document.querySelector(`.cp-row[data-cp-id="${hoverCp.id}"]`);
    check('Marker-Hover hebt die zugehörige Sidebar-Zeile hervor', hoverRowEl && hoverRowEl.classList.contains('cp-row-hover-sync'));
    setCpRowHoverSync(hoverCp.id, false);

    /* Bulk-Actions: Shift-Klick-Mehrfachauswahl + Sammelaktionen */
    const shiftClickRowEl = document.querySelector(`.cp-row[data-cp-id="${hoverCp.id}"]`);
    shiftClickRowEl.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true}));
    check('Shift-Klick wählt Checkpoint-Zeile für Sammelaktionen aus', state.cpBulkSelectedIds.includes(hoverCp.id));
    check('Bulk-Aktionsleiste erscheint bei aktiver Auswahl', !!document.querySelector('.cp-bulk-bar'));
    shiftClickRowEl.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true}));
    check('Erneuter Shift-Klick wählt die Zeile wieder ab', !state.cpBulkSelectedIds.includes(hoverCp.id));

    const bulkTypeBefore = hoverCp.type, bulkMandatoryBefore = hoverCp.mandatory;
    state.cpBulkSelectedIds = [hoverCp.id];
    bulkAssignType('photo');
    checkEqual('Bulk "Typ zuweisen" ändert den Checkpoint-Typ', hoverCp.type, 'photo');
    hoverCp.mandatory = false;
    bulkMarkMandatory();
    checkEqual('Bulk "Als Pflicht markieren" setzt mandatory=true', hoverCp.mandatory, true);
    hoverCp.type = bulkTypeBefore;
    hoverCp.mandatory = bulkMandatoryBefore;
    clearCpBulkSelection();
    checkEqual('clearCpBulkSelection leert die Auswahl', state.cpBulkSelectedIds.length, 0);

    const bulkCpCountBefore = evt.checkpoints.length;
    const bulkExistingIds = new Set(evt.checkpoints.map(c => c.id));
    duplicateCheckpoint(evt.checkpoints[0].id);
    duplicateCheckpoint(evt.checkpoints[1].id);
    const bulkTempIds = evt.checkpoints.filter(c => !bulkExistingIds.has(c.id)).map(c => c.id);
    checkEqual('Zwei temporäre Checkpoints für den Bulk-Test dupliziert', bulkTempIds.length, 2);
    state.cpBulkSelectedIds = bulkTempIds.slice();
    bulkLockCheckpoints();
    check('Bulk "Sperren" setzt cp.locked für alle Ausgewählten', bulkTempIds.every(id => evt.checkpoints.find(c => c.id === id).locked));
    state.cpBulkSelectedIds = bulkTempIds.slice();
    bulkDeleteCheckpoints();
    checkEqual('Bulk-Löschen ignoriert gesperrte Checkpoints (kein Confirm-Dialog nötig)', evt.checkpoints.length, bulkCpCountBefore + 2);
    bulkTempIds.forEach(id => toggleCpLocked(id));
    state.cpBulkSelectedIds = bulkTempIds.slice();
    const origConfirmBulk = window.confirm;
    window.confirm = () => true;
    bulkDeleteCheckpoints();
    window.confirm = origConfirmBulk;
    checkEqual('Bulk-Löschen entfernt entsperrte, ausgewählte Checkpoints', evt.checkpoints.length, bulkCpCountBefore);
    checkEqual('Checkpoint-Reihenfolge nach Bulk-Löschen lückenlos neu vergeben', evt.checkpoints.map(c => c.order).join(','), evt.checkpoints.map((c, i) => i + 1).join(','));
    state.cpBulkSelectedIds = [];

    /* In-Page-PDF-Vorschau: Personal-Briefing öffnet Modal statt Direkt-Download */
    await checkNoThrowAsync('exportStaffBriefingPDF öffnet die In-Page-Vorschau', exportStaffBriefingPDF);
    check('PDF-Vorschau ist nach dem Export geöffnet', state.pdfPreviewOpen);
    check('PDF-Vorschau zeigt den erwarteten Dateinamen', state.pdfPreviewFilename.includes('personal-briefing'));
    check('PDF-Vorschau-Modal ist im DOM vorhanden', !!document.querySelector('.pdfprev-box'));
    check('PDF-Vorschau-Iframe verweist auf eine Blob-URL', (document.querySelector('.pdfprev-frame') || {}).src.startsWith('blob:'));
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    check('Esc schließt die PDF-Vorschau', !state.pdfPreviewOpen);
    checkEqual('PDF-Vorschau-Root ist nach Schließen leer', document.getElementById('pdf-preview-root').innerHTML, '');

    openRiders();
    await wait(20);
  }

  /* 3n) Paket 2 (Phase 16): Feature-Registry, Settings-Hub, Empty-States,
     Social-Share-Karten. Wie 3m: kein erneutes openEditor(). */
  {
    /* Feature-Registry: alle 5 Paket-2-Einträge vorhanden, Default-Werte korrekt */
    check('FEATURE_REGISTRY enthält alle 5 Paket-2-Einträge', ['social_share_cards', 'sound_hook', 'offline_map_cache', 'categories', 'game_modes'].every(id => !!featureRegistryEntry(id)));
    check('Social-Share-Karten sind standardmäßig aktiv (Device-Scope)', isFeatureEnabled('social_share_cards'));
    check('Offline-Kartenkacheln sind standardmäßig inaktiv (Device-Scope)', !isFeatureEnabled('offline_map_cache'));
    check('Kategorien sind standardmäßig aktiv (Event-Scope)', isFeatureEnabled('categories', evt));

    /* Device-Scope-Toggle: Persistenz in appSettings.featureToggles */
    toggleFeature('offline_map_cache');
    check('toggleFeature schaltet Device-Scope-Feature um', isFeatureEnabled('offline_map_cache'));
    checkEqual('Device-Scope-Toggle wird in appSettings.featureToggles persistiert', state.appSettings.featureToggles.offline_map_cache, true);
    toggleFeature('offline_map_cache');
    check('toggleFeature schaltet Device-Scope-Feature zurück', !isFeatureEnabled('offline_map_cache'));

    /* Event-Scope-Toggle: Persistenz in evt.featureFlags, blendet UI-Sektionen aus */
    toggleFeature('categories');
    check('toggleFeature schaltet Event-Scope-Feature um', !isFeatureEnabled('categories', evt));
    checkEqual('Event-Scope-Toggle landet in evt.featureFlags', evt.featureFlags.categories, false);
    openRiders();
    check('Deaktivierte Kategorien blenden den Kategorien-Sidebar-Punkt in der Fahrerliste aus', !ridersNavGroups(evt).some(g => g.items.some(i => i.id === 'categories')));
    toggleFeature('categories');
    openRiders();
    check('Kategorien-Sidebar-Punkt erscheint nach Reaktivierung wieder', ridersNavGroups(evt).some(g => g.items.some(i => i.id === 'categories')));

    toggleFeature('game_modes');
    openOverview();
    check('Deaktivierte Spielmodi blenden die Spielmodi-Sektion in der Übersicht aus', !document.getElementById('view-overview').innerHTML.includes('overview-gamemodes-section'));
    toggleFeature('game_modes');
    openOverview();
    check('Spielmodi-Sektion erscheint nach Reaktivierung wieder', document.getElementById('view-overview').innerHTML.includes('overview-gamemodes-section'));

    /* sound_hook gated: AlleycatSounds.play() ruft die Wiedergabe nur bei aktivem Toggle auf */
    let soundPlayCalled = false;
    AlleycatSounds.sounds['__test_sound'] = {play: () => { soundPlayCalled = true; return Promise.resolve(); }, currentTime: 0};
    toggleFeature('sound_hook');
    await AlleycatSounds.play('__test_sound');
    check('AlleycatSounds.play() ruft die Wiedergabe nicht auf, wenn sound_hook deaktiviert ist', !soundPlayCalled);
    toggleFeature('sound_hook');
    await AlleycatSounds.play('__test_sound');
    check('AlleycatSounds.play() ruft die Wiedergabe auf, wenn sound_hook aktiviert ist', soundPlayCalled);
    delete AlleycatSounds.sounds['__test_sound'];

    /* Settings-Hub: Suche filtert, Toggle-Switches je Feature vorhanden, Config-Jump navigiert */
    state.featureRegistrySearch = 'sound';
    const filteredGroups = featureRegistryGroups(evt);
    check('Feature-Suche filtert auf passende Einträge', filteredGroups.device.some(f => f.id === 'sound_hook') && !filteredGroups.device.some(f => f.id === 'offline_map_cache'));
    state.featureRegistrySearch = '';

    openSettings();
    selectSettingsSection('features');
    check('Settings-Hub rendert die Feature-Übersicht', document.getElementById('view-settings').innerHTML.includes('feature-registry-section'));
    check('Settings-Hub zeigt einen Toggle-Switch pro sichtbarem Feature', document.querySelectorAll('.feature-row .toggle-switch').length >= 5);
    closeSettings();

    jumpToFeatureConfig('category-settings');
    checkEqual('jumpToFeatureConfig("category-settings") navigiert zur Fahreransicht', state.view, 'riders');

    /* Empty States: generische Komponente */
    const emptyHtml = emptyStateHtml({icon: '🧪', title: 'Testtitel', description: 'Testtext', primaryAction: {label: 'Primär', onclick: 'void(0)'}, secondaryAction: {label: 'Sekundär', onclick: 'void(0)'}});
    check('emptyStateHtml rendert Icon, Titel, Beschreibung und beide Aktionen', emptyHtml.includes('🧪') && emptyHtml.includes('Testtitel') && emptyHtml.includes('Testtext') && emptyHtml.includes('Primär') && emptyHtml.includes('Sekundär'));
    check('Leere Checkpoint-Liste nutzt emptyStateHtml (Icon + Primäraktion)', renderCpListRows({checkpoints: []}, false, null).includes('empty-state-icon'));

    /* Leaderboard-Empty-State "Rennen läuft noch nicht" (vor Rennstart, Fahrer aber ohne Fortschritt) */
    const lbFakeEvt = Object.assign({}, evt, {status: 'planning', riders: evt.riders.map(r => Object.assign({}, r, {finishTime: '', raceStatus: ''}))});
    const realCurrentEvtForLb = state.currentEvent;
    state.currentEvent = lbFakeEvt;
    renderLeaderboard();
    check('Leaderboard zeigt "Rennen läuft noch nicht" vor dem Start', document.getElementById('view-leaderboard').innerHTML.includes(t('leaderboard.raceNotStartedTitle')));
    state.currentEvent = realCurrentEvtForLb;
    renderLeaderboard();

    /* Social-Share-Karten: Canvas-Rendering + In-Page-Vorschau */
    check('computeSocialShareTopRiders liefert höchstens 3 Fahrer', computeSocialShareTopRiders(evt).length <= 3);
    const shareCanvas = await renderSocialShareCanvas(evt);
    check('renderSocialShareCanvas liefert ein 1080x1080-Canvas', shareCanvas.width === 1080 && shareCanvas.height === 1080);

    const statusBeforeShare = evt.status;
    evt.status = 'completed';
    openOverview();
    check('"Ergebnis-Karte erstellen"-Button erscheint bei Status "Abgeschlossen"', document.getElementById('view-overview').innerHTML.includes(t('socialShare.createButton')));
    await checkNoThrowAsync('openSocialShareCard läuft ohne Fehler', openSocialShareCard);
    check('Social-Share-Vorschau ist nach dem Erstellen geöffnet', state.socialShareOpen);
    check('Social-Share-Vorschau-Modal ist im DOM vorhanden', !!document.querySelector('.socialshare-box'));
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    check('Esc schließt die Social-Share-Vorschau', !state.socialShareOpen);
    checkEqual('Social-Share-Root ist nach Schließen leer', document.getElementById('social-share-root').innerHTML, '');
    evt.status = statusBeforeShare;

    openRiders();
    await wait(20);
  }

  /* 3o) Paket 4 Teil A, Schritt 1: Zonen-Fundament — Datenmodell + Geometrie
     (src/core/zones.js). Bewusst isoliert von game-modes.js/rules-engine.js
     getestet — die bestehende Battle-Royale-Logik (zone_active) rechnet
     weiterhin mit ihrem eigenen, auto-zentrierten Kreis; die Migration auf
     evt.zones ist ein separater, späterer Schritt. */
  {
    checkEqual('Event hat leere zones per Default', evt.zones.length, 0);

    const domCenter = {lat: 50.9413, lng: 6.9583};
    const circleZone = addZone(evt, {name: 'Dom-Kreis', type: 'circle', center: domCenter, radiusMeters: 200});
    checkEqual('addZone legt Zone an', evt.zones.length, 1);
    check('withZoneDefaults vergibt eine zone-ID', circleZone.id.startsWith('zone-'));
    checkEqual('withZoneDefaults: type-Default ist "circle"', withZoneDefaults({}).type, 'circle');

    checkEqual('getZone findet die angelegte Zone', getZone(evt, circleZone.id).name, 'Dom-Kreis');
    updateZone(evt, circleZone.id, {radiusMeters: 500});
    checkEqual('updateZone ändert Felder', getZone(evt, circleZone.id).radiusMeters, 500);
    updateZone(evt, circleZone.id, {radiusMeters: 200});

    const squarePoints = [
      {lat: 50.940, lng: 6.957}, {lat: 50.940, lng: 6.960},
      {lat: 50.943, lng: 6.960}, {lat: 50.943, lng: 6.957}
    ];
    const polygonZone = addZone(evt, {name: 'Dom-Polygon', type: 'polygon', points: squarePoints});
    checkEqual('Zweite Zone angelegt', evt.zones.length, 2);

    check('isPointInCircle: Zentrum liegt im Kreis', isPointInCircle(domCenter.lat, domCenter.lng, domCenter.lat, domCenter.lng, 200));
    check('isPointInCircle: 5km entfernter Punkt liegt außerhalb', !isPointInCircle(50.99, 7.02, domCenter.lat, domCenter.lng, 200));
    check('isPointInCircle: fehlende Koordinaten liefern false statt Fehler', !isPointInCircle(NaN, 6.96, domCenter.lat, domCenter.lng, 200));

    check('isPointInPolygon: Punkt innerhalb des Quadrats', isPointInPolygon(50.9415, 6.9585, squarePoints));
    check('isPointInPolygon: Punkt klar außerhalb', !isPointInPolygon(50.95, 6.98, squarePoints));
    check('isPointInPolygon: Polygon mit <3 Punkten liefert false', !isPointInPolygon(50.9415, 6.9585, squarePoints.slice(0, 2)));

    check('isPointInZone dispatcht auf Kreis-Zone', isPointInZone(domCenter.lat, domCenter.lng, circleZone));
    check('isPointInZone dispatcht auf Polygon-Zone', isPointInZone(50.9415, 6.9585, polygonZone));
    check('isPointInZone: Punkt außerhalb beider Zonen', !isPointInZone(50.95, 6.98, polygonZone) && !isPointInZone(50.95, 6.98, circleZone));

    const centroid = polygonCentroid(squarePoints);
    check('polygonCentroid berechnet den Mittelpunkt korrekt', Math.abs(centroid.lat - 50.9415) < 0.0001 && Math.abs(centroid.lng - 6.9585) < 0.0001);

    removeZone(evt, polygonZone.id);
    checkEqual('removeZone entfernt die Zone wieder', evt.zones.length, 1);
    /* Kreis-Zone bleibt bewusst stehen, für den Persistenz-Check in Abschnitt 4 */
  }

  /* 3p) Paket 4 Teil A, Schritt 5: Sonderorte (HQ & Afterparty) — event-locations.js.
     HQ ist eine eigenständige, in evt.eventLocations gespeicherte Entität mit
     optionalem Checkpoint-Link (Koordinaten dann vom Checkpoint geerbt und bei
     Bewegung/Löschung nachgezogen); Afterparty ist immer freistehend. */
  {
    checkEqual('Event hat leere eventLocations per Default', evt.eventLocations.length, 0);

    const hqCp = evt.checkpoints[0];
    const otherCp = evt.checkpoints[1];

    setCheckpointAsHq(evt, hqCp.id, true);
    checkEqual('setCheckpointAsHq legt HQ-Location an', evt.eventLocations.length, 1);
    check('HQ ist mit dem Checkpoint verknüpft', isCheckpointHq(evt, hqCp.id));
    checkEqual('HQ erbt Koordinaten vom Checkpoint', getEventLocation(evt, 'headquarters').lat, hqCp.lat);

    const origConfirmHq = window.confirm;
    window.confirm = () => false;
    setCheckpointAsHq(evt, otherCp.id, true);
    check('Abgelehnter Confirm lässt HQ-Verknüpfung unverändert', isCheckpointHq(evt, hqCp.id) && !isCheckpointHq(evt, otherCp.id));

    window.confirm = () => true;
    setCheckpointAsHq(evt, otherCp.id, true);
    check('Bestätigter Confirm verschiebt die HQ-Verknüpfung', isCheckpointHq(evt, otherCp.id) && !isCheckpointHq(evt, hqCp.id));
    window.confirm = origConfirmHq;

    otherCp.lat += 0.001; otherCp.lng += 0.001;
    syncHqLocationFromCheckpoint(evt, otherCp);
    checkEqual('syncHqLocationFromCheckpoint zieht die Koordinaten nach', getEventLocation(evt, 'headquarters').lat, otherCp.lat);
    otherCp.lat -= 0.001; otherCp.lng -= 0.001;
    syncHqLocationFromCheckpoint(evt, otherCp);

    unlinkHqIfCheckpointDeleted(evt, otherCp.id);
    const hqAfterUnlink = getEventLocation(evt, 'headquarters');
    check('unlinkHqIfCheckpointDeleted löst die Verknüpfung, behält aber die Location', !hqAfterUnlink.linkedCheckpointId && eventLocationHasPosition(hqAfterUnlink));

    const afterparty = placeEventLocationAt(evt, 'afterparty', 50.95, 6.96);
    checkEqual('placeEventLocationAt legt Afterparty-Location an', evt.eventLocations.length, 2);
    check('Afterparty ist freistehend (kein Checkpoint-Link)', afterparty && !afterparty.linkedCheckpointId);
    check('eventLocationHasPosition erkennt gesetzte Koordinaten', eventLocationHasPosition(afterparty));
    check('mapsDeepLink liefert eine Google-Maps-URL', mapsDeepLink(50.95, 6.96).includes('maps'));

    /* Paket 4, Schritt 8: Dashboard-Zeile, Beamer-Einblendung, Routen-Deeplink.
       HQ (freistehend, s.o.) + Afterparty sind an dieser Stelle beide gesetzt. */
    check('mapsDirectionsLink enthält Origin und Destination', mapsDirectionsLink({lat: 1, lng: 2}, {lat: 3, lng: 4}).includes('origin=1,2') && mapsDirectionsLink({lat: 1, lng: 2}, {lat: 3, lng: 4}).includes('destination=3,4'));
    const hqLoc = getEventLocation(evt, 'headquarters');
    const origin = afterpartyRouteOrigin(evt);
    checkEqual('afterpartyRouteOrigin bevorzugt die HQ-Position', origin && origin.lat, hqLoc.lat);

    const overviewHtml = renderAfterpartyStatusLine(evt);
    check('renderAfterpartyStatusLine zeigt Name und Route-Link bei gesetzter Afterparty', overviewHtml.includes(escapeHtml(afterparty.name)) && overviewHtml.includes(t('overview.afterpartyRouteLink')));

    const beamerBannerHtml = renderBeamerAfterpartyBanner(evt);
    check('renderBeamerAfterpartyBanner zeigt den Afterparty-Namen verlinkt', beamerBannerHtml.includes(escapeHtml(afterparty.name)) && beamerBannerHtml.includes('maps/dir'));

    removeEventLocation(evt, 'afterparty');
    check('renderAfterpartyStatusLine liefert leeren String ohne Afterparty', renderAfterpartyStatusLine(evt) === '');
    check('renderBeamerAfterpartyBanner liefert leeren String ohne Afterparty', renderBeamerAfterpartyBanner(evt) === '');

    /* Escaping-Regression: ein Checkpoint-Name mit HTML-Sonderzeichen darf im
       "Verknüpft mit Checkpoint"-Hinweis nicht als rohes Markup landen. HQ ist
       an dieser Stelle freistehend (s.o.) — für diesen Check erneut verlinken. */
    const origConfirmEsc = window.confirm;
    window.confirm = () => true; // überschreibt die bestehende freistehende HQ-Location
    setCheckpointAsHq(evt, hqCp.id, true);
    window.confirm = origConfirmEsc;
    check('HQ ist für den Escaping-Check mit dem Checkpoint verknüpft', isCheckpointHq(evt, hqCp.id));
    const originalHqCpName = hqCp.name;
    hqCp.name = '<img src=x onerror=alert(1)>';
    const hqRowHtml = renderEventLocationRow(evt, 'headquarters');
    check('renderEventLocationRow escaped den verknüpften Checkpoint-Namen', hqRowHtml.includes('&lt;img') && !hqRowHtml.includes('<img src=x'));
    hqCp.name = originalHqCpName;
    unlinkHqIfCheckpointDeleted(evt, hqCp.id); // HQ zurück in den freistehenden Zustand, für den Persistenz-Check in Abschnitt 4

    removeEventLocation(evt, 'afterparty');
    checkEqual('removeEventLocation entfernt die Location wieder', evt.eventLocations.length, 1);
    /* HQ-Location bleibt bewusst stehen (freistehend), für den Persistenz-Check in Abschnitt 4 */
  }

  /* 3q) Paket 4 Teil A, Schritt 6: Zonen-Schrumpfen + Sichtbarkeits-Flags.
     Kontinuierliches, kreis-only Schrumpfen (zones.js) ist bewusst unabhängig
     vom diskreten, stufenbasierten Battle-Royale-Schrumpfen (rules-engine.js)
     — siehe die separaten zone_active-Checks weiter oben, die unverändert
     bleiben. */
  {
    const defaults = withZoneDefaults({});
    checkEqual('withZoneDefaults: shrinkEnabled-Default ist false', defaults.shrinkEnabled, false);
    checkEqual('withZoneDefaults: shrinkMode-Default ist "duration"', defaults.shrinkMode, 'duration');
    checkEqual('withZoneDefaults: visibleOnHqMap-Default ist true', defaults.visibleOnHqMap, true);
    checkEqual('withZoneDefaults: hiddenOnBeamerUntilActive-Default ist false', defaults.hiddenOnBeamerUntilActive, false);

    const shrinkCenter = {lat: 50.94, lng: 6.96};
    const shrinkZone = addZone(evt, {name: 'Schrumpf-Zone', type: 'circle', center: shrinkCenter, radiusMeters: 1000, shrinkEnabled: true, shrinkMode: 'duration', shrinkDurationMinutes: 60, shrinkEndRadiusMeters: 100});

    const origStartConfirmedAt = evt.startConfirmedAt, origCurfewTime = evt.curfewTime;
    checkEqual('effectiveZoneRadius ohne evt liefert den rohen Radius', effectiveZoneRadius(shrinkZone, null), 1000);
    evt.startConfirmedAt = ''; // startRace() weiter oben in der Suite hat evt.startConfirmedAt bereits gesetzt
    checkEqual('effectiveZoneRadius ohne startConfirmedAt liefert den rohen Radius', effectiveZoneRadius(shrinkZone, evt), 1000);

    /* toLocalDateTimeInputValue() (utils.js) rundet auf die Minute — exakt wie
       ein echtes datetime-local-Feld im Browser. shrinkStart wird deshalb aus
       dem bereits gerundeten String zurückgelesen statt aus dem rohen
       new Date(), sonst würden die Sekunden des rohen Zeitstempels beim
       internen new Date(evt.startConfirmedAt) verloren gehen und einen
       Zeitversatz von bis zu 59s in jeden folgenden Vergleich einschleusen. */
    evt.startConfirmedAt = toLocalDateTimeInputValue(new Date());
    const shrinkStart = new Date(evt.startConfirmedAt);

    checkEqual('effectiveZoneRadius am Rennstart: voller Radius', effectiveZoneRadius(shrinkZone, evt, shrinkStart), 1000);
    checkEqual('effectiveZoneRadius nach halber Dauer: Radius exakt in der Mitte', effectiveZoneRadius(shrinkZone, evt, new Date(shrinkStart.getTime() + 30 * 60000)), 550);
    checkEqual('effectiveZoneRadius nach voller Dauer: Endradius erreicht', effectiveZoneRadius(shrinkZone, evt, new Date(shrinkStart.getTime() + 60 * 60000)), 100);
    checkEqual('effectiveZoneRadius über die Dauer hinaus: bleibt auf Endradius geklemmt', effectiveZoneRadius(shrinkZone, evt, new Date(shrinkStart.getTime() + 90 * 60000)), 100);
    check('effectiveZoneRadius vor dem Rennstart: voller Radius', effectiveZoneRadius(shrinkZone, evt, new Date(shrinkStart.getTime() - 60000)) === 1000);

    updateZone(evt, shrinkZone.id, {shrinkMode: 'curfew'});
    const curfewEnd = new Date(shrinkStart.getTime() + 120 * 60000); // liegt bereits auf einer vollen Minute, kein weiterer Rundungsverlust
    evt.curfewTime = toLocalDateTimeInputValue(curfewEnd);
    checkEqual('Curfew-Modus: Endradius exakt zur Curfew-Zeit', effectiveZoneRadius(shrinkZone, evt, curfewEnd), 100);
    checkEqual('Curfew-Modus: nach 60 von 120 Minuten exakt auf halbem Weg', effectiveZoneRadius(shrinkZone, evt, new Date(shrinkStart.getTime() + 60 * 60000)), 550);

    updateZone(evt, shrinkZone.id, {shrinkMode: 'duration'});
    /* getCheckpointZone/isPointInZone mit echtem "jetzt" (kein injiziertes atDate)
       — startConfirmedAt 45 von 60 Minuten in der Vergangenheit ergibt einen
       aktuellen Radius von 1000 - 900*0.75 = 325m. */
    evt.startConfirmedAt = toLocalDateTimeInputValue(new Date(Date.now() - 45 * 60000));
    const farButInFullRadius = {lat: 50.94 + 0.0045, lng: 6.96}; // ~500m vom Zentrum
    const closeToCenterRadius = {lat: 50.94 + 0.001, lng: 6.96}; // ~110m vom Zentrum
    check('getCheckpointZone: Checkpoint bei ~500m liegt außerhalb der geschrumpften (aber innerhalb der ursprünglichen) Zone', !getCheckpointZone(farButInFullRadius, [shrinkZone], evt));
    check('getCheckpointZone: Checkpoint bei ~110m liegt weiterhin innerhalb der geschrumpften Zone', !!getCheckpointZone(closeToCenterRadius, [shrinkZone], evt));
    check('isPointInZone ohne evt bleibt rückwärtskompatibel (roher, ungeschrumpfter Radius)', isPointInZone(farButInFullRadius.lat, farButInFullRadius.lng, getZone(evt, shrinkZone.id)));

    const polygonNoShrink = addZone(evt, {name: 'Polygon ohne Schrumpfen', type: 'polygon', points: [{lat: 50.94, lng: 6.96}, {lat: 50.94, lng: 6.962}, {lat: 50.942, lng: 6.962}, {lat: 50.942, lng: 6.96}], shrinkEnabled: true});
    checkEqual('effectiveZoneRadius ignoriert shrinkEnabled bei Polygon-Zonen', effectiveZoneRadius(polygonNoShrink, evt, new Date(shrinkStart.getTime() + 30 * 60000)), polygonNoShrink.radiusMeters);
    removeZone(evt, polygonNoShrink.id);

    evt.startConfirmedAt = origStartConfirmedAt;
    evt.curfewTime = origCurfewTime;

    updateZone(evt, shrinkZone.id, {visibleOnHqMap: false});
    checkEqual('Sichtbarkeits-Flag setzt visibleOnHqMap', getZone(evt, shrinkZone.id).visibleOnHqMap, false);
    updateZone(evt, shrinkZone.id, {visibleOnHqMap: true, hiddenOnBeamerUntilActive: true, active: false});

    /* Die Dom-Kreis-Zone aus Block 3o ist immer noch in evt.zones (bleibt dort
       bewusst stehen) und wäre standardmäßig beamer-sichtbar — für einen
       sauberen "gar keine Zone sichtbar"-Fall hier kurz mitverstecken. */
    const domKreisZone = evt.zones.find(z => z.name === 'Dom-Kreis');
    const domKreisOrigHidden = domKreisZone.hiddenOnBeamerUntilActive, domKreisOrigActive = domKreisZone.active;
    domKreisZone.hiddenOnBeamerUntilActive = true;
    domKreisZone.active = false;

    check('getBeamerLayout: alle Zonen mit hiddenOnBeamerUntilActive+inaktiv zeigen keine Zonenkarte', !getBeamerLayout(evt).showZoneMap);
    updateZone(evt, shrinkZone.id, {active: true});
    check('getBeamerLayout: Zonenkarte erscheint, sobald eine Zone aktiviert wird', getBeamerLayout(evt).showZoneMap);
    updateZone(evt, shrinkZone.id, {hiddenOnBeamerUntilActive: false});
    check('getBeamerLayout: Zonenkarte erscheint auch ganz ohne aktivierten Spielmodus', getBeamerLayout(evt).showZoneMap && evt.gameModes.filter(m => m.enabled).every(m => m.type !== 'zone_active'));

    domKreisZone.hiddenOnBeamerUntilActive = domKreisOrigHidden;
    domKreisZone.active = domKreisOrigActive;

    removeZone(evt, shrinkZone.id);
    checkEqual('Aufräumen: Schrumpf-Testzone wieder entfernt', evt.zones.length, 1);
    /* Kreis-Zone aus 3o bleibt weiterhin stehen, für den Persistenz-Check in Abschnitt 4 */
  }

  /* 3r) Paket 4 Teil A, Schritt 7: Mobiles CollapsibleMapPanel + Lupen-Icon-Suche.
     window.innerWidth wird für die breitenabhängigen Checks gezielt mit
     Object.defineProperty gemockt (danach zurückgesetzt) statt vom
     tatsächlichen Testfenster abzuhängen — gleiches Prinzip wie die
     window.confirm-Mocks weiter oben in dieser Suite. */
  {
    state.zonesPanelOpen = false; state.addMode = false; state.locationPlacementMode = null;
    check('isMapForceExpanded: false ohne aktiven Eingabemodus', !isMapForceExpanded());
    state.zonesPanelOpen = true;
    check('isMapForceExpanded: true bei offenem Zonen-Panel', isMapForceExpanded());
    state.zonesPanelOpen = false;
    state.addMode = true;
    check('isMapForceExpanded: true bei aktivem "Checkpoint setzen"', isMapForceExpanded());
    state.addMode = false;
    state.locationPlacementMode = 'headquarters';
    check('isMapForceExpanded: true bei aktiver Sonderort-Platzierung', isMapForceExpanded());
    state.locationPlacementMode = null;

    const origInnerWidthDesc = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const setTestWidth = (w) => Object.defineProperty(window, 'innerWidth', {value: w, configurable: true});
    try{
      localStorage.removeItem('alleycat:mapCollapsed');
      setTestWidth(1200);
      check('isMobileMapCollapsed: false bei Desktop-Breite (>820px)', !isMobileMapCollapsed());

      setTestWidth(500);
      check('isMobileMapCollapsed: Default eingeklappt unter 768px ohne gespeicherte Präferenz', isMobileMapCollapsed());

      setTestWidth(800);
      check('isMobileMapCollapsed: Default ausgeklappt zwischen 768 und 820px', !isMobileMapCollapsed());

      localStorage.setItem('alleycat:mapCollapsed', '0');
      setTestWidth(500);
      check('isMobileMapCollapsed: gespeicherte Präferenz "0" übersteuert den <768px-Default', !isMobileMapCollapsed());

      localStorage.setItem('alleycat:mapCollapsed', '1');
      setTestWidth(800);
      check('isMobileMapCollapsed: gespeicherte Präferenz "1" übersteuert den 768–820px-Default', isMobileMapCollapsed());

      state.zonesPanelOpen = true;
      check('isMobileMapCollapsed: Zonen-Editor ignoriert eine gespeicherte "1"-Präferenz', !isMobileMapCollapsed());
      state.zonesPanelOpen = false;

      localStorage.removeItem('alleycat:mapCollapsed');
    } finally {
      Object.defineProperty(window, 'innerWidth', origInnerWidthDesc);
    }

    /* Kartensuche: Icon-only, klappt per toggleMapSearch() aus/ein. Die
       statischen #map-search-*-Elemente existieren unabhängig von der
       aktiven Ansicht (nur per CSS .active ein-/ausgeblendet), daher hier
       ohne erneutes openEditor() testbar. */
    state.mapSearchOpen = false;
    document.getElementById('map-search-wrap').classList.remove('open');
    toggleMapSearch();
    check('toggleMapSearch: öffnet die Suche (state + DOM-Klasse)', state.mapSearchOpen && document.getElementById('map-search-wrap').classList.contains('open'));
    document.getElementById('map-search-input').value = 'Testsuche';
    document.getElementById('map-search-clear').style.display = 'inline-block';
    toggleMapSearch();
    check('toggleMapSearch: schließt die Suche wieder', !state.mapSearchOpen && !document.getElementById('map-search-wrap').classList.contains('open'));
    checkEqual('toggleMapSearch: Schließen leert das Eingabefeld (clearSearch())', document.getElementById('map-search-input').value, '');
    toggleMapSearch(true);
    check('toggleMapSearch(true): erzwingt offenen Zustand', state.mapSearchOpen);
    toggleMapSearch(false);
    check('toggleMapSearch(false): erzwingt geschlossenen Zustand', !state.mapSearchOpen);
  }

  /* 3s) Paket 4 Teil B, Schritt 1: Routen-Schätzer (2-Opt-TSP-Heuristik).
     Reine Planungshilfe — rührt evt.checkpoints[].order/checkpointOrderMode
     nicht an. Geometrie-Tests laufen auf einem eigenständigen synthetischen
     Fixture statt dem Haupt-`evt`, um unabhängig von dessen Checkpoint-
     Koordinaten (die sich im Lauf der Suite ändern) ein bekanntes,
     nachrechenbares Ergebnis zu haben. */
  {
    const square = [
      {lat: 0, lng: 0}, {lat: 0, lng: 1}, {lat: 1, lng: 1}, {lat: 1, lng: 0}
    ];
    checkEqual('tourDistanceKm: Summe der Einzeldistanzen', tourDistanceKm(square, [0, 1, 2]).toFixed(4), (haversineDistanceKm(0, 0, 0, 1) + haversineDistanceKm(0, 1, 1, 1)).toFixed(4));

    const nn = nearestNeighborTour(square, 0);
    checkEqual('nearestNeighborTour startet am vorgegebenen Index', nn[0], 0);
    checkEqual('nearestNeighborTour besucht jeden Punkt genau einmal', nn.slice().sort().join(','), '0,1,2,3');

    /* Bewusst schlecht sortierte Reihenfolge (Diagonalen-Kreuzung: 0→2→1→3) —
       2-Opt muss das auf die kreuzungsfreie Quadrat-Umrandung verbessern. */
    const crossedTour = [0, 2, 1, 3];
    const crossedDist = tourDistanceKm(square, crossedTour);
    const {tour: improvedTour, distanceKm: improvedDist} = twoOptImprove(square, crossedTour);
    check('twoOptImprove verbessert eine sich kreuzende Route', improvedDist < crossedDist - 0.01);
    checkEqual('twoOptImprove lässt den Startindex unangetastet', improvedTour[0], 0);
    check('twoOptImprove liefert weiterhin eine gültige Permutation', improvedTour.slice().sort().join(',') === '0,1,2,3');

    check('estimateOptimalRoute: null bei weniger als 2 georeferenzierten Checkpoints', estimateOptimalRoute({checkpoints: [{id: 'a', order: 1, lat: 0, lng: 0}], eventLocations: []}) === null);

    const synthEvtNoHq = {
      eventLocations: [],
      checkpoints: [
        {id: 'sq0', order: 1, lat: 0, lng: 0},
        {id: 'sq1', order: 2, lat: 0, lng: 1},
        {id: 'sq2', order: 3, lat: 1, lng: 1},
        {id: 'sq3', order: 4, lat: 1, lng: 0}
      ]
    };
    const estNoHq = estimateOptimalRoute(synthEvtNoHq);
    check('estimateOptimalRoute ohne HQ verankert am ersten Checkpoint (order 1)', estNoHq.points[0].id === 'sq0');
    check('estimateOptimalRoute: optimierte Distanz ≤ aktuelle Distanz', estNoHq.optimizedDistanceKm <= estNoHq.currentDistanceKm + 1e-9);
    checkEqual('estimateOptimalRoute: savingsKm ist die Differenz', estNoHq.savingsKm.toFixed(4), Math.max(0, estNoHq.currentDistanceKm - estNoHq.optimizedDistanceKm).toFixed(4));
    check('estimateOptimalRoute: optimierte Reihenfolge ist eine Permutation aller Punkt-IDs', estNoHq.optimizedOrderIds.slice().sort().join(',') === estNoHq.points.map(p => p.id).sort().join(','));

    const synthEvtWithHq = Object.assign({}, synthEvtNoHq, {
      eventLocations: [withEventLocationDefaults({type: 'headquarters', lat: 5, lng: 5})]
    });
    const estWithHq = estimateOptimalRoute(synthEvtWithHq);
    check('estimateOptimalRoute mit HQ verankert am HQ statt am ersten Checkpoint', estWithHq.points[0].id === '__hq__');

    checkEqual('estimateRouteTimeMinutes rechnet Distanz/Geschwindigkeit*60', estimateRouteTimeMinutes(18, 18), 60);
    checkEqual('estimateRouteTimeMinutes: ungültige Geschwindigkeit liefert 0', estimateRouteTimeMinutes(10, 0), 0);
    checkEqual('formatEstimatedDuration formatiert Stunden+Minuten', formatEstimatedDuration(75), '1h 15min');
    checkEqual('formatEstimatedDuration unter einer Stunde ohne Stunden-Anteil', formatEstimatedDuration(42), '42min');

    localStorage.removeItem('alleycat:avgSpeedKmh');
    checkEqual('currentAvgSpeedKmh: Default ohne gespeicherte Präferenz', currentAvgSpeedKmh(), 18);
    onLogisticsSpeedChange('25');
    checkEqual('onLogisticsSpeedChange persistiert die Geschwindigkeit', currentAvgSpeedKmh(), 25);
    localStorage.removeItem('alleycat:avgSpeedKmh');

    /* Panel-Zustände: nicht berechnet / zu wenige Punkte / Ergebnis vorhanden.
       Nutzt state.currentEvent (Haupt-evt), unabhängig von dessen konkreten
       Checkpoint-Koordinaten — nur die drei Render-Zweige werden geprüft. */
    state.routeEstimate = undefined;
    state.logisticsPanelOpen = true;
    check('renderLogisticsPanel (offen, noch nicht berechnet) zeigt den Hinweis', renderLogisticsPanel(evt).includes(t('logistics.notYetHint')));
    state.routeEstimate = false;
    check('renderLogisticsPanel (offen, zu wenige Punkte) zeigt den Hinweis', renderLogisticsPanel(evt).includes(t('logistics.notEnoughPoints')));
    state.routeEstimate = estNoHq;
    const panelHtml = renderLogisticsPanel(evt);
    check('renderLogisticsPanel (offen, Ergebnis vorhanden) zeigt Distanzen', panelHtml.includes('km') && panelHtml.includes(t('logistics.showOnMap')));
    state.logisticsPanelOpen = false;
    state.routeEstimate = undefined;
    state.showRouteEstimateOnMap = false;
  }

  /* 3t) Paket 4 Teil B, Schritt 2: Proximity-Puffer-Ringe + Klumpen-Warnung.
     Rein geometrisch, auf einem synthetischen Fixture getestet statt dem
     Haupt-`evt` (dessen Checkpoints über die Stadt verteilt sind und
     absichtlich keinen Klumpen bilden — s. Kartenüberprüfung während der
     Entwicklung). */
  {
    const clusterFixture = {
      checkpoints: [
        {id: 'near1', order: 1, lat: 50.9400, lng: 6.9600, name: 'Nah 1'},
        {id: 'near2', order: 2, lat: 50.9400, lng: 6.9601, name: 'Nah 2'}, // ~7m entfernt
        {id: 'danger1', order: 3, lat: 50.9500, lng: 6.9700, name: 'Sehr nah 1'},
        {id: 'danger2', order: 4, lat: 50.9500, lng: 6.97001, name: 'Sehr nah 2'}, // ~1m entfernt
        {id: 'far', order: 5, lat: 50.9600, lng: 6.9800, name: 'Weit weg'}
      ]
    };
    checkEqual('findProximityClusters: keine Paare bei sehr kleinem Radius', findProximityClusters(clusterFixture, 0.5).length, 0);
    const clustersAt30 = findProximityClusters(clusterFixture, 30);
    checkEqual('findProximityClusters findet beide nahen Paare bei 30m', clustersAt30.length, 2);
    check('findProximityClusters: distanceMeters ist plausibel (<30m)', clustersAt30.every(p => p.distanceMeters < 30));

    checkEqual('proximityClusterSeverity: null ohne Paare', proximityClusterSeverity([]), null);
    checkEqual('proximityClusterSeverity: "warn" ohne extrem nahe Paare', proximityClusterSeverity(findProximityClusters(clusterFixture, 10).filter(p => p.a.id === 'near1')), 'warn');
    checkEqual('proximityClusterSeverity: "danger" bei einem Paar <5m', proximityClusterSeverity(clustersAt30), 'danger');

    const clusteredIds = clusteredCheckpointIds(clustersAt30);
    check('clusteredCheckpointIds enthält alle vier beteiligten Checkpoints', ['near1', 'near2', 'danger1', 'danger2'].every(id => clusteredIds.has(id)) && !clusteredIds.has('far'));

    localStorage.removeItem('alleycat:proximityBufferMeters');
    checkEqual('currentProximityBufferMeters: Default ohne gespeicherte Präferenz', currentProximityBufferMeters(), 30);
    onProximityBufferMetersChange('15');
    checkEqual('onProximityBufferMetersChange persistiert den Radius', currentProximityBufferMeters(), 15);
    localStorage.setItem('alleycat:proximityBufferMeters', '30');

    check('renderProximitySection zeigt eine Warnung bei vorhandenen Klumpen', renderProximitySection(clusterFixture).includes(t('logistics.proximityClusterWarning', {count: 2, radius: 30})));
    check('renderProximitySection (kein Klumpen): kein Warnungs-Div im Markup', !/class="logistics-cluster-warning/.test(renderProximitySection({checkpoints: [clusterFixture.checkpoints[0], clusterFixture.checkpoints[4]]})));

    const todosWithCluster = computeDashboardTodos(Object.assign({}, evt, {checkpoints: clusterFixture.checkpoints, categoryGroups: [], tileCacheUpdatedAt: evt.tileCacheUpdatedAt}));
    const clusterTodo = todosWithCluster.find(td => td.key === 'proximityCluster');
    check('computeDashboardTodos meldet den Proximity-Klumpen mit "danger"', clusterTodo && clusterTodo.severity === 'danger');
    const todosWithoutCluster = computeDashboardTodos(Object.assign({}, evt, {checkpoints: [clusterFixture.checkpoints[0], clusterFixture.checkpoints[4]], categoryGroups: [], tileCacheUpdatedAt: evt.tileCacheUpdatedAt}));
    check('computeDashboardTodos meldet keinen Klumpen ohne nahe Checkpoints', !todosWithoutCluster.some(td => td.key === 'proximityCluster'));

    /* Kartenlayer: auf dem echten evt (bereits initialisierte Karte), da
       redrawProximityBuffers() state.currentEvent liest. */
    const origBufferMeters = localStorage.getItem('alleycat:proximityBufferMeters');
    localStorage.setItem('alleycat:proximityBufferMeters', '5000'); // großzügig, damit die echten Checkpoints sicher "clustern"
    state.showProximityBuffers = true;
    redrawProximityBuffers();
    checkEqual('redrawProximityBuffers zeichnet einen Ring pro georeferenziertem Checkpoint', proximityBufferLayer.getLayers().length, evt.checkpoints.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng)).length);
    state.showProximityBuffers = false;
    redrawProximityBuffers();
    check('redrawProximityBuffers entfernt den Layer wieder, wenn ausgeschaltet', !proximityBufferLayer);
    if(origBufferMeters === null) localStorage.removeItem('alleycat:proximityBufferMeters'); else localStorage.setItem('alleycat:proximityBufferMeters', origBufferMeters);
  }

  /* 3u) Paket 4 Teil B, Schritt 3: Logistik-Overlay — Marker-Farbbadge nach
     Personal-Status (gestaffelt: unstaffed rot, staffed grün, kein separates
     Material-Tracking, s. Roadmap-Entscheidung 18.08.2026) + Klick-zu-Sidebar. */
  {
    const staffCp = evt.checkpoints[0];
    const origStaff = staffCp.staff;
    staffCp.staff = [];
    redrawMarkers();
    let markerEl = cpMarkers[staffCp.id].getElement();
    check('Unbesetzter Checkpoint zeigt roten Personal-Marker', markerEl.querySelector('.cp-marker-staffing').classList.contains('unstaffed'));
    staffCp.staff = [withCpStaffDefaults({name: 'Marshal Mo'})];
    redrawMarkers();
    markerEl = cpMarkers[staffCp.id].getElement();
    check('Besetzter Checkpoint zeigt grünen Personal-Marker (keine "unstaffed"-Klasse)', !markerEl.querySelector('.cp-marker-staffing').classList.contains('unstaffed'));

    /* Klick auf den Marker selektiert denselben Checkpoint wie ein Sidebar-Klick
       (selectCp()) und scrollt dessen Zeile ins Blickfeld. */
    state.editingId = null;
    markerEl.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    checkEqual('Marker-Klick selektiert den Checkpoint über selectCp()', state.editingId, staffCp.id);
    const selectedRow = document.querySelector(`.cp-row[data-cp-id="${staffCp.id}"]`);
    check('Ausgewählte Sidebar-Zeile ist nach Marker-Klick im DOM vorhanden', !!selectedRow);
    selectCp(staffCp.id); // Toggle: erneuter Aufruf mit derselben id schaltet ab
    checkEqual('Erneutes selectCp() mit derselben id schaltet die Auswahl ab', state.editingId, null);

    const legendStaffingHtml = document.getElementById('map-legend-staffing').innerHTML;
    check('Legende enthält Personal-Status-Einträge (grün+rot)', legendStaffingHtml.includes('dot staffed') && legendStaffingHtml.includes('dot unstaffed'));

    staffCp.staff = origStaff;
    redrawMarkers();
  }

  /* 3v) Paket 4 Teil B, Schritt 4: Orga-Pins (event-locations.js) + Karten-
     Rechtsklick-Kontextmenü (map.js). Läuft komplett auf dem echten `evt`
     (echte Karte bereits initialisiert), stellt aber jeden Seiteneffekt
     danach exakt zurück — Abschnitt 4 gleich im Anschluss prüft u. a. eine
     feste Checkpoint-Anzahl (`getCheckpointTypes().length`) und
     `eventLocations[0]` als die freistehende HQ-Location; beides darf durch
     diesen Test nicht verschoben werden. */
  {
    checkEqual('withOrgaPinDefaults: type "note" als Default', withOrgaPinDefaults({}).type, 'note');
    const pin = addOrgaPin(evt, {lat: 50.9, lng: 6.9, type: 'danger', title: 'Baustelle'});
    check('addOrgaPin fügt den Pin zu evt.orgaPins hinzu', getOrgaPin(evt, pin.id) === pin);
    checkEqual('orgaPinIcon liefert das Symbol je Typ', orgaPinIcon('danger'), '🚫');
    checkEqual('orgaPinIcon: unbekannter Typ fällt auf die Pin-Nadel zurück', orgaPinIcon('xyz'), '📌');

    redrawOrgaPins();
    checkEqual('redrawOrgaPins zeichnet einen Marker pro Pin', orgaPinsLayer.getLayers().length, 1);

    const viewBeforePin = state.view;
    state.view = 'editor';
    render();
    selectOrgaPin(pin.id);
    check('selectOrgaPin öffnet das Orga-Pins-Panel', state.orgaPinsPanelOpen);
    check('Ausgewählte Orga-Pin-Zeile ist im DOM vorhanden', !!document.querySelector(`.orga-pin-row[data-pin-id="${pin.id}"]`));
    state.orgaPinsPanelOpen = false;
    state.eventSettingsPanelOpen = false;

    removeOrgaPin(evt, pin.id);
    checkEqual('removeOrgaPin entfernt den Pin wieder', getOrgaPin(evt, pin.id), null);
    redrawOrgaPins();
    state.view = viewBeforePin;
    render();

    /* Rechtsklick-Kontextmenü: onMapContextMenu() nimmt ein Leaflet-Event
       entgegen (containerPoint/latlng/originalEvent), hier von Hand nachgebaut
       wie an anderen Stellen der Suite bereits für Leaflet.draw-Events. */
    let preventDefaultCalled = false;
    const fakeCtxEvent = {containerPoint: {x: 120, y: 80}, latlng: {lat: 50.93, lng: 6.94}, originalEvent: {preventDefault: () => { preventDefaultCalled = true; }}};
    onMapContextMenu(fakeCtxEvent);
    check('onMapContextMenu unterdrückt das native Browser-Kontextmenü', preventDefaultCalled);
    check('onMapContextMenu setzt state.mapContextMenu', !!state.mapContextMenu && state.mapContextMenu.lat === 50.93);
    const menuEl = document.getElementById('map-context-menu');
    check('Kontextmenü zeigt alle 5 Aktionen an', menuEl.style.display === 'block'
      && menuEl.innerHTML.includes(t('map.contextMenuAddCheckpoint'))
      && menuEl.innerHTML.includes(t('map.contextMenuSetHq'))
      && menuEl.innerHTML.includes(t('map.contextMenuSetAfterparty'))
      && menuEl.innerHTML.includes(t('map.contextMenuAddOrgaPin'))
      && menuEl.innerHTML.includes(t('map.contextMenuSearchHere')));

    hideMapContextMenu();
    checkEqual('hideMapContextMenu leert state.mapContextMenu wieder', state.mapContextMenu, null);
    checkEqual('Kontextmenü-Element ist danach unsichtbar', menuEl.style.display, 'none');

    onMapContextMenu(fakeCtxEvent);
    document.body.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    checkEqual('Klick außerhalb schließt das Kontextmenü (document-Listener)', state.mapContextMenu, null);

    onMapContextMenu(fakeCtxEvent);
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    checkEqual('Esc schließt das Kontextmenü (höchste Priorität in handleGlobalEscape)', state.mapContextMenu, null);

    /* Jede Aktion einzeln: state.mapContextMenu wird pro Aktion frisch gesetzt,
       da jede Aktion selbst zuerst hideMapContextMenu() aufruft. */
    const cpCountBefore = evt.checkpoints.length;
    state.mapContextMenu = {x: 0, y: 0, lat: 50.91, lng: 6.91};
    contextMenuAddCheckpoint();
    checkEqual('"Checkpoint hier anlegen" fügt einen Checkpoint an den Klick-Koordinaten hinzu', evt.checkpoints.length, cpCountBefore + 1);
    const addedCp = evt.checkpoints[evt.checkpoints.length - 1];
    check('Neuer Checkpoint liegt an den Kontextmenü-Koordinaten', addedCp.lat === 50.91 && addedCp.lng === 6.91);
    evt.checkpoints.pop(); // exakte Checkpoint-Anzahl für Abschnitt 4 wiederherstellen
    state.editingId = null;

    const origHq = getEventLocation(evt, 'headquarters');
    const origHqLat = origHq.lat, origHqLng = origHq.lng;
    state.mapContextMenu = {x: 0, y: 0, lat: 50.92, lng: 6.92};
    contextMenuSetHq();
    checkEqual('"HQ hierher setzen" verschiebt die bestehende freistehende HQ-Location', getEventLocation(evt, 'headquarters').lat, 50.92);
    checkEqual('HQ bleibt die einzige Location (kein zweiter Eintrag)', evt.eventLocations.length, 1);
    origHq.lat = origHqLat; origHq.lng = origHqLng; // Koordinaten für Abschnitt 4 wiederherstellen

    check('Vor dem Test noch keine Afterparty gesetzt', !getEventLocation(evt, 'afterparty'));
    state.mapContextMenu = {x: 0, y: 0, lat: 50.94, lng: 6.94};
    contextMenuSetAfterparty();
    const newAfterparty = getEventLocation(evt, 'afterparty');
    check('"Afterparty definieren" legt eine Afterparty-Location an den Koordinaten an', !!newAfterparty && newAfterparty.lat === 50.94);
    removeEventLocation(evt, 'afterparty'); // Ausgangszustand für Abschnitt 4 wiederherstellen

    const pinCountBefore = (evt.orgaPins || []).length;
    state.mapContextMenu = {x: 0, y: 0, lat: 50.95, lng: 6.95};
    contextMenuAddOrgaPin();
    checkEqual('"Orga-Notiz anheften" legt sofort einen Pin an den Koordinaten an', evt.orgaPins.length, pinCountBefore + 1);
    const newPin = evt.orgaPins[evt.orgaPins.length - 1];
    check('Neuer Orga-Pin liegt an den Kontextmenü-Koordinaten', newPin.lat === 50.95 && newPin.lng === 6.95);
    check('"Orga-Notiz anheften" öffnet das Orga-Pins-Panel zur Bearbeitung', state.orgaPinsPanelOpen);
    removeOrgaPin(evt, newPin.id); // Ausgangszustand (leer) für Abschnitt 4 wiederherstellen
    state.orgaPinsPanelOpen = false;
    state.eventSettingsPanelOpen = false;
    redrawOrgaPins();

    state.mapSearchOpen = false;
    state.mapContextMenu = {x: 0, y: 0, lat: 50.9, lng: 6.9};
    contextMenuSearchHere();
    check('"Adresse / Ort suchen" öffnet die Kartensuche', state.mapSearchOpen);
    toggleMapSearch(false);
  }

  /* 3w) Paket 4 Teil B, Schritt 5: GeoJSON/GPX/KML-Import (geo-import.js).
     Parser sind reine Funktionen (kein DOM/Karte nötig), Rendering + Drop-
     Handling laufen auf dem echten evt/der echten Karte — mit derselben
     Restaurierungs-Disziplin wie 3v (Abschnitt 4 prüft eine feste
     Checkpoint-Anzahl). */
  {
    const gpxSample = `<?xml version="1.0"?><gpx><wpt lat="50.95" lon="6.96"><name>Bäckerei</name></wpt><trk><trkseg><trkpt lat="50.90" lon="6.90"></trkpt><trkpt lat="50.91" lon="6.91"></trkpt></trkseg></trk></gpx>`;
    const geoJsonSample = JSON.stringify({type: 'FeatureCollection', features: [
      {type: 'Feature', geometry: {type: 'Point', coordinates: [6.96, 50.95]}, properties: {name: 'Kiosk'}},
      {type: 'Feature', geometry: {type: 'LineString', coordinates: [[6.90, 50.90], [6.91, 50.91]]}, properties: {}}
    ]});
    const kmlSample = `<?xml version="1.0"?><kml><Document><Placemark><name>Treffpunkt</name><Point><coordinates>6.96,50.95,0</coordinates></Point></Placemark><Placemark><LineString><coordinates>6.90,50.90,0 6.91,50.91,0</coordinates></LineString></Placemark></Document></kml>`;

    const gpxResult = parseGpxFile(gpxSample);
    checkEqual('parseGpxFile findet eine Strecke mit 2 Punkten', gpxResult.tracks.length === 1 && gpxResult.tracks[0].length, 2);
    check('parseGpxFile findet den benannten Wegpunkt', gpxResult.points.length === 1 && gpxResult.points[0].name === 'Bäckerei' && gpxResult.points[0].lat === 50.95);

    const geoJsonResult = parseGeoJsonFile(geoJsonSample);
    checkEqual('parseGeoJsonFile findet eine Strecke mit 2 Punkten', geoJsonResult.tracks.length === 1 && geoJsonResult.tracks[0].length, 2);
    check('parseGeoJsonFile findet den benannten Punkt (lng/lat vertauscht zu lat/lng)', geoJsonResult.points.length === 1 && geoJsonResult.points[0].name === 'Kiosk' && geoJsonResult.points[0].lat === 50.95 && geoJsonResult.points[0].lng === 6.96);

    const kmlResult = parseKmlFile(kmlSample);
    checkEqual('parseKmlFile findet eine Strecke mit 2 Punkten', kmlResult.tracks.length === 1 && kmlResult.tracks[0].length, 2);
    check('parseKmlFile findet den benannten Punkt', kmlResult.points.length === 1 && kmlResult.points[0].name === 'Treffpunkt');

    check('parseGeoImportFile erkennt .gpx', parseGeoImportFile('route.gpx', gpxSample).format === 'gpx');
    check('parseGeoImportFile erkennt .geojson', parseGeoImportFile('layer.geojson', geoJsonSample).format === 'geojson');
    check('parseGeoImportFile erkennt .kml', parseGeoImportFile('layer.kml', kmlSample).format === 'kml');
    checkEqual('parseGeoImportFile: nicht unterstützte Endung liefert null', parseGeoImportFile('layer.txt', gpxSample), null);
    checkEqual('parseGeoImportFile: kaputtes GPX liefert null', parseGeoImportFile('broken.gpx', '<gpx><trk><trkseg><trkpt/></trkseg></trk></gpx>'), null);
    checkEqual('parseGeoImportFile: kaputtes GeoJSON (kein valides JSON) liefert null', parseGeoImportFile('broken.geojson', '{not json'), null);

    const defLayer = withGeoImportLayerDefaults({});
    check('withGeoImportLayerDefaults: format "gpx", sichtbar, leere Arrays', defLayer.format === 'gpx' && defLayer.visible === true && defLayer.tracks.length === 0 && defLayer.points.length === 0);

    /* CRUD + persistent/temporär-Umschaltung auf dem echten evt */
    const tempLayer = withGeoImportLayerDefaults({name: 'Testlayer', filename: 'test.gpx', tracks: gpxResult.tracks, points: gpxResult.points});
    state.geoImportLayers = state.geoImportLayers || [];
    state.geoImportLayers.push(tempLayer);
    check('allGeoImportLayers enthält den temporären Layer', allGeoImportLayers(evt).some(l => l.id === tempLayer.id));
    check('findGeoImportLayer findet ihn', findGeoImportLayer(evt, tempLayer.id) === tempLayer);
    check('isGeoImportLayerPersistent: temporärer Layer ist nicht persistent', !isGeoImportLayerPersistent(evt, tempLayer.id));

    setGeoImportLayerPersistent(evt, tempLayer.id, true);
    check('setGeoImportLayerPersistent(true) verschiebt in evt.importedGeoLayers', isGeoImportLayerPersistent(evt, tempLayer.id) && evt.importedGeoLayers.some(l => l.id === tempLayer.id));
    check('Layer ist nicht mehr in state.geoImportLayers', !state.geoImportLayers.some(l => l.id === tempLayer.id));

    setGeoImportLayerPersistent(evt, tempLayer.id, false);
    check('setGeoImportLayerPersistent(false) verschiebt zurück in state.geoImportLayers', !isGeoImportLayerPersistent(evt, tempLayer.id) && state.geoImportLayers.some(l => l.id === tempLayer.id));

    /* Kartenrendering: 1 Polyline (Strecke) + 1 CircleMarker (Wegpunkt) */
    redrawImportedGeo();
    checkEqual('redrawImportedGeo zeichnet Strecke + Wegpunkt', importedGeoLayer.getLayers().length, 2);
    tempLayer.visible = false;
    redrawImportedGeo();
    checkEqual('redrawImportedGeo überspringt unsichtbare Layer', importedGeoLayer.getLayers().length, 0);
    tempLayer.visible = true;

    /* Wegpunkt-zu-Checkpoint-Konvertierung */
    const cpCountBeforeGeo = evt.checkpoints.length;
    const convertedCp = convertGeoImportPointToCheckpoint(tempLayer.id, 0);
    checkEqual('convertGeoImportPointToCheckpoint legt einen Checkpoint an', evt.checkpoints.length, cpCountBeforeGeo + 1);
    const lastCp = evt.checkpoints[evt.checkpoints.length - 1];
    check('Neuer Checkpoint übernimmt Koordinaten und Namen des Wegpunkts', lastCp.lat === 50.95 && lastCp.lng === 6.96 && lastCp.name === 'Bäckerei');
    evt.checkpoints.pop(); // exakte Checkpoint-Anzahl für Abschnitt 4 wiederherstellen
    state.editingId = null;

    removeGeoImportLayer(evt, tempLayer.id);
    check('removeGeoImportLayer entfernt aus beiden Arrays', !allGeoImportLayers(evt).some(l => l.id === tempLayer.id));
    redrawImportedGeo();

    /* Drop-Handling: handleGeoImportFileDrop() ist aus dem 'drop'-Listener
       herausgezogen, testbar mit einem echten File-Objekt statt einem
       simulierten DragEvent/DataTransfer. */
    const gpxFile = new File([gpxSample], 'strecke.gpx', {type: 'application/gpx+xml'});
    const droppedLayer = await handleGeoImportFileDrop(gpxFile);
    check('handleGeoImportFileDrop parst und legt einen temporären Layer an', !!droppedLayer && droppedLayer.tracks.length === 1 && droppedLayer.points.length === 1);
    check('Layer landet in state.geoImportLayers (temporär, nicht im Event gespeichert)', state.geoImportLayers.some(l => l.id === droppedLayer.id) && !isGeoImportLayerPersistent(evt, droppedLayer.id));
    check('handleGeoImportFileDrop öffnet das Panel zur Kontrolle', state.geoImportPanelOpen);
    removeGeoImportLayer(evt, droppedLayer.id);
    state.geoImportPanelOpen = false;
    redrawImportedGeo();

    const origAlertGeo = window.alert;
    let geoAlertMsg = null;
    window.alert = (msg) => { geoAlertMsg = msg; };
    const badFile = new File(['not a real gpx/geojson/kml file'], 'notes.txt', {type: 'text/plain'});
    const badResult = await handleGeoImportFileDrop(badFile);
    check('handleGeoImportFileDrop: nicht unterstützte Datei liefert null + Fehlermeldung', badResult === null && !!geoAlertMsg);
    window.alert = origAlertGeo;

    const realCurrentEvt = state.currentEvent;
    state.currentEvent = null;
    checkEqual('handleGeoImportFileDrop: ohne aktuelles Event liefert null', await handleGeoImportFileDrop(gpxFile), null);
    state.currentEvent = realCurrentEvt;

    initGeoImportDragDrop();
    check('initGeoImportDragDrop setzt den Drop-Hint als Attribut', document.querySelector('.map-wrap').getAttribute('data-drop-hint') === t('geoImport.dropHint'));
  }

  /* 3x) Paket 4 Teil B, Schritt 6 (letzter Teil-B-Schritt): Clue-Vorschau-
     Modus (Spec 18.6). Kein eigenes Datenmodell/keine Persistenz — reiner
     Anzeige-Umschalter, geprüft auf dem echten evt/der echten Karte. */
  {
    const viewBeforeClue = state.view;
    state.view = 'editor';
    render();

    const clueCp = evt.checkpoints[0];
    const noClueCp = evt.checkpoints[1];
    const origClue = clueCp.clue, origNoClue = noClueCp.clue;
    clueCp.clue = 'Finde die rote Tür am Marktplatz.';
    noClueCp.clue = '';

    checkEqual('cluePreviewMode startet deaktiviert', state.cluePreviewMode, false);
    check('Sidebar zeigt normal den Checkpoint-Namen', document.getElementById(`row-name-${clueCp.id}`).textContent.trim() === (clueCp.name || t('checkpoint.noName')));
    redrawMarkers();
    check('Marker haben ohne Clue-Vorschau kein Popup gebunden', !cpMarkers[clueCp.id].getPopup());

    toggleCluePreviewMode();
    check('toggleCluePreviewMode aktiviert den Modus', state.cluePreviewMode);
    check('Toggle-Button bekommt die "active"-Klasse', document.getElementById('clue-preview-toggle').classList.contains('active'));
    check('Sidebar zeigt jetzt den Rätsel-Text statt des Namens', document.getElementById(`row-name-${clueCp.id}`).textContent.trim() === clueCp.clue);
    check('Sidebar zeigt den "kein Rätsel-Text"-Hinweis bei leerem clue', document.getElementById(`row-name-${noClueCp.id}`).textContent.includes(t('cluePreview.noClue')));
    check('Hinweis-Banner erscheint im Sidebar-Markup', document.getElementById('sidebar').innerHTML.includes(t('cluePreview.activeHint')));
    check('Marker mit Rätsel-Text bekommen jetzt ein Popup', !!cpMarkers[clueCp.id].getPopup());
    check('Popup-Inhalt enthält den Rätsel-Text', cpMarkers[clueCp.id].getPopup().getContent().includes('Finde die rote Tür'));
    check('Popup für Checkpoint ohne Rätsel-Text zeigt den Leer-Hinweis', cpMarkers[noClueCp.id].getPopup().getContent().includes(t('cluePreview.noClue')));

    toggleCluePreviewMode();
    checkEqual('Erneutes Umschalten deaktiviert den Modus wieder', state.cluePreviewMode, false);
    check('Toggle-Button verliert die "active"-Klasse', !document.getElementById('clue-preview-toggle').classList.contains('active'));
    check('Sidebar zeigt wieder den normalen Namen', document.getElementById(`row-name-${clueCp.id}`).textContent.trim() === (clueCp.name || t('checkpoint.noName')));
    check('Marker verlieren das Popup wieder', !cpMarkers[clueCp.id].getPopup());

    clueCp.clue = origClue; noClueCp.clue = origNoClue;
    redrawMarkers();
    state.view = viewBeforeClue;
    render();
  }

  /* 3y) Paket 5 Teil A, Schritt 1: formatDistance() + Metrisch/Imperial-Switch
     (Spec 20.1). Reine Formatierungsschicht — computeRouteLegs()/der
     Routen-Schätzer rechnen weiterhin intern in km (unverändert), nur die
     Ausgabe geht jetzt durch formatDistance(meters). Editierbare
     Radius-Felder (Zonen, Proximity-Puffer) bewusst NICHT migriert — siehe
     Kommentar in utils.js. */
  {
    checkEqual('formatDistance: Standard ist metrisch', state.appSettings.distanceUnit, 'metric');
    checkEqual('formatDistance (metrisch, <1000m) rundet auf ganze Meter', formatDistance(542.7), '543 m');
    checkEqual('formatDistance (metrisch, >=1000m) zeigt km mit 2 Nachkommastellen', formatDistance(2345), '2.35 km');
    checkEqual('formatDistance: ungültiger Wert liefert leeren String', formatDistance(NaN), '');

    const unitBefore = state.appSettings.distanceUnit;
    setDistanceUnit('imperial');
    checkEqual('setDistanceUnit persistiert die Einheit', state.appSettings.distanceUnit, 'imperial');
    checkEqual('formatDistance (imperial, <528ft) zeigt Fuß', formatDistance(100), '328 ft');
    checkEqual('formatDistance (imperial, >=528ft) zeigt Meilen', formatDistance(2000), '1.24 mi');

    /* Integration: Sidebar-Gesamtdistanz + Routen-Schätzer respektieren die
       Einheit, ohne dass computeRouteLegs()/estimateOptimalRoute() selbst
       etwas von Einheiten wissen. */
    const orderModeBefore = evt.checkpointOrderMode;
    evt.checkpointOrderMode = 'fest';
    state.view = 'editor';
    render();
    check('Sidebar-Gesamtdistanz zeigt Imperial-Einheit statt km', document.getElementById('sidebar').innerHTML.includes(' mi') || document.getElementById('sidebar').innerHTML.includes(' ft'));
    evt.checkpointOrderMode = orderModeBefore;

    state.logisticsPanelOpen = true;
    state.routeEstimate = estimateOptimalRoute(evt);
    const logisticsHtmlImperial = renderLogisticsPanel(evt);
    check('Logistik-Panel zeigt Imperial-Einheit statt km', logisticsHtmlImperial.includes(' mi') || logisticsHtmlImperial.includes(' ft'));
    state.logisticsPanelOpen = false;
    state.routeEstimate = undefined;

    setDistanceUnit(unitBefore);
    checkEqual('setDistanceUnit zurückgesetzt', state.appSettings.distanceUnit, unitBefore);
    render();
  }

  /* 3z) Paket 5 Teil A, Schritt 2: 12h/24h-Zeitformat-Switch (Spec 20.1).
     formatTimeOnly()/formatDateTime() um state.appSettings.timeFormat
     erweitert, gleiches geräte-lokales Setting-Muster wie distanceUnit. */
  {
    const sampleTime = '2026-08-18T14:30:00';
    checkEqual('timeFormat startet bei "24h"', state.appSettings.timeFormat, '24h');
    checkEqual('formatTimeOnly (24h) zeigt 24-Stunden-Format', formatTimeOnly(sampleTime), '14:30');
    checkEqual('formatDateTime (24h) hängt "Uhr" an', formatDateTime(sampleTime), '18.8.2026, 14:30 Uhr');

    const formatBefore = state.appSettings.timeFormat;
    setTimeFormat('12h');
    checkEqual('setTimeFormat persistiert das Format', state.appSettings.timeFormat, '12h');
    checkEqual('formatTimeOnly (12h) zeigt AM/PM statt 24h', formatTimeOnly(sampleTime), '02:30 PM');
    checkEqual('formatDateTime (12h) hängt kein "Uhr" an (ergäbe mit AM/PM keinen Sinn)', formatDateTime(sampleTime), '18.8.2026, 02:30 PM');

    setTimeFormat(formatBefore);
    checkEqual('setTimeFormat zurückgesetzt', state.appSettings.timeFormat, formatBefore);

    const settingsHtml = (() => {
      const viewBeforeSettings = state.view;
      const sectionBeforeSettings = state.settingsSection;
      state.view = 'settings';
      state.settingsSection = 'units';
      render();
      const html = document.getElementById('view-settings').innerHTML;
      state.view = viewBeforeSettings;
      state.settingsSection = sectionBeforeSettings;
      render();
      return html;
    })();
    check('Settings-Seite zeigt die "Einheiten"-Sektion mit Distanz- und Uhrzeit-Unterüberschriften', settingsHtml.includes(t('settings.unitsHeading')) && settingsHtml.includes(t('settings.unitsDistanceSubheading')) && settingsHtml.includes(t('settings.unitsTimeSubheading')));
  }

  /* 4a) Paket 5 Teil A, Schritt 3: Koordinatenanzeige-Switch (Spec 20.1) —
     Dezimalgrad/DMS/UTM/MGRS. toUtm()/toMgrs() während der Entwicklung
     gegen eine echte Referenz validiert (Wikipedia UTM-Artikel: CN Tower,
     43.6425667°N 79.387139°W -> Zone 17, 630084mE 4833438mN, und dessen
     bekannte MGRS-Angabe "17T PJ ..."); hier als Regressionstest
     nachgebildet. */
  {
    checkEqual('coordFormat startet bei "decimal"', state.appSettings.coordFormat, 'decimal');
    checkEqual('formatCoordinatesAs (decimal) — 5 Nachkommastellen', formatCoordinatesAs('decimal', 50.9375, 6.9603), '50.93750, 6.96030');
    checkEqual('toDms entspricht dem Spec-Beispiel (50.9375, 6.9603 -> 50°56\'15"N 6°57\'37"E)', toDms(50.9375, 6.9603), `50°56'15"N 6°57'37"E`);

    const cnTowerLat = 43.6425667, cnTowerLng = -79.387139;
    const utm = toUtm(cnTowerLat, cnTowerLng);
    checkEqual('toUtm: CN-Tower-Referenz — Zone 17', utm.zone, 17);
    checkEqual('toUtm: CN-Tower-Referenz — Nordhalbkugel', utm.hemisphere, 'N');
    check('toUtm: Easting stimmt mit der Wikipedia-Referenz (630084) auf < 1m', Math.abs(utm.easting - 630084) < 1);
    check('toUtm: Northing stimmt mit der Wikipedia-Referenz (4833438) auf < 1m', Math.abs(utm.northing - 4833438) < 1);

    const mgrs = toMgrs(cnTowerLat, cnTowerLng);
    check('toMgrs: CN-Tower-Referenz — Zone+Band+Gitterquadrat "17T PJ"', mgrs.startsWith('17T PJ '));

    const decimalDesc = formatCoordinatesAs('decimal', 50.9375, 6.9603);
    const dmsDesc = formatCoordinatesAs('dms', 50.9375, 6.9603);
    const utmDesc = formatCoordinatesAs('utm', 50.9375, 6.9603);
    const mgrsDesc = formatCoordinatesAs('mgrs', 50.9375, 6.9603);
    check('formatCoordinatesAs liefert für jedes Format einen unterschiedlichen String', new Set([decimalDesc, dmsDesc, utmDesc, mgrsDesc]).size === 4);
    checkEqual('formatCoordinatesAs: ungültige Koordinaten liefern leeren String', formatCoordinatesAs('decimal', NaN, 6.96), '');

    const coordFormatBefore = state.appSettings.coordFormat;
    setCoordFormat('mgrs');
    checkEqual('setCoordFormat persistiert das Format', state.appSettings.coordFormat, 'mgrs');
    checkEqual('formatCoordinates folgt jetzt state.appSettings.coordFormat', formatCoordinates(cnTowerLat, cnTowerLng), mgrs);

    /* Integration: Checkpoint-Sidebar (readonly-Block, sichtbar bei editing+
       locked) nutzt formatCoordinates() statt fest verdrahtetem Dezimalgrad. */
    const coordCp = evt.checkpoints[0];
    const editingIdBefore = state.editingId;
    state.editingId = coordCp.id;
    const readonlyHtml = renderCpRow(coordCp, 0, evt, true, null, false);
    check('Checkpoint-Readonly-Zeile zeigt die gewählte Koordinatenanzeige (MGRS)', readonlyHtml.includes(formatCoordinates(coordCp.lat, coordCp.lng)) && !readonlyHtml.includes(coordCp.lat.toFixed(5) + ', ' + coordCp.lng.toFixed(5)));
    state.editingId = editingIdBefore;

    setCoordFormat(coordFormatBefore);
    checkEqual('setCoordFormat zurückgesetzt', state.appSettings.coordFormat, coordFormatBefore);

    const settingsHtmlCoord = (() => {
      const viewBeforeSettings = state.view;
      const sectionBeforeSettings = state.settingsSection;
      state.view = 'settings';
      state.settingsSection = 'units';
      render();
      const html = document.getElementById('view-settings').innerHTML;
      state.view = viewBeforeSettings;
      state.settingsSection = sectionBeforeSettings;
      render();
      return html;
    })();
    check('Settings zeigt die "Koordinatenanzeige"-Unterüberschrift mit allen 4 Formaten', settingsHtmlCoord.includes(t('settings.unitsCoordSubheading'))
      && settingsHtmlCoord.includes(t('settings.coordFormatDecimalLabel')) && settingsHtmlCoord.includes(t('settings.coordFormatDmsLabel'))
      && settingsHtmlCoord.includes(t('settings.coordFormatUtmLabel')) && settingsHtmlCoord.includes(t('settings.coordFormatMgrsLabel')));
  }

  /* 4b) Paket 5 Teil A, Schritt 4 (letzter Teil-A-Schritt): Community-
     Sprachpakete — JSON-Import/Export in i18n.js (Spec 20.3). Sprachcode
     kommt aus dem Dateinamen (alleycat-i18n-XX.json), nicht aus einem
     Metadaten-Feld — Export/Re-Import laufen über dieselbe Konvention.
     Testsprache "xx" gewählt, um keine echte Sprache zu kollidieren; wird
     am Ende wieder vollständig entfernt (auch aus dem Storage). */
  {
    checkEqual('getCurrentLanguage() startet bei "de"', getCurrentLanguage(), 'de');
    check('availableLanguages() enthält zunächst "de"', availableLanguages().includes('de'));
    checkEqual('t() liefert deutschen Text als Baseline', t('common.save'), 'Speichern');

    const langCountBefore = availableLanguages().length;
    const packFile = new File([JSON.stringify({common: {save: 'TESTSAVE'}}, null, 2)], 'alleycat-i18n-xx.json', {type: 'application/json'});
    await onLanguagePackFileChange({value: '', files: [packFile]});
    check('onLanguagePackFileChange fügt die Sprache aus dem Dateinamen hinzu', availableLanguages().includes('xx'));
    checkEqual('Neue Sprache hat genau einen zusätzlichen Eintrag', availableLanguages().length, langCountBefore + 1);
    checkEqual('Hochgeladener Wert landet unverändert in translations', translations.xx.common.save, 'TESTSAVE');

    const langBefore = getCurrentLanguage();
    setLanguage('xx');
    checkEqual('setLanguage wechselt die aktive Sprache', getCurrentLanguage(), 'xx');
    checkEqual('t() nutzt jetzt das Community-Sprachpaket', t('common.save'), 'TESTSAVE');
    checkEqual('t() fällt bei fehlendem Schlüssel im Sprachpaket auf Deutsch zurück', t('common.cancel'), 'Abbrechen');

    const origAlertLang = window.alert;
    let langAlertMsg = null;
    window.alert = (msg) => { langAlertMsg = msg; };

    const badNameFile = new File(['{}'], 'wrong-name.json', {type: 'application/json'});
    await onLanguagePackFileChange({value: '', files: [badNameFile]});
    checkEqual('Dateiname ohne "alleycat-i18n-XX.json"-Schema wird abgelehnt', langAlertMsg, t('settings.languagePackNameError'));
    checkEqual('Falscher Dateiname legt keine neue Sprache an', availableLanguages().length, langCountBefore + 1);

    langAlertMsg = null;
    const badJsonFile = new File(['{not valid json'], 'alleycat-i18n-yy.json', {type: 'application/json'});
    await onLanguagePackFileChange({value: '', files: [badJsonFile]});
    checkEqual('Ungültiges JSON wird abgelehnt', langAlertMsg, t('settings.languagePackParseError'));
    check('Ungültiges JSON legt keine Sprache "yy" an', !availableLanguages().includes('yy'));
    window.alert = origAlertLang;

    const origConfirmLang = window.confirm;
    window.confirm = () => true;
    deleteLanguagePack('de');
    check('deleteLanguagePack("de") ist ein No-op (eingebaute Sprache bleibt)', availableLanguages().includes('de'));
    deleteLanguagePack('xx');
    check('deleteLanguagePack entfernt das Community-Paket wieder', !availableLanguages().includes('xx'));
    checkEqual('Löschen der aktiven Sprache schaltet zurück auf Deutsch', getCurrentLanguage(), 'de');
    window.confirm = origConfirmLang;

    setLanguage(langBefore);
    checkEqual('Ausgangssprache wiederhergestellt', getCurrentLanguage(), langBefore);
    checkEqual('availableLanguages() wieder auf dem Ausgangsstand', availableLanguages().length, langCountBefore);

    const settingsHtmlLang = (() => {
      const viewBeforeSettings = state.view;
      const sectionBeforeSettings = state.settingsSection;
      state.view = 'settings';
      state.settingsSection = 'language';
      render();
      const html = document.getElementById('view-settings').innerHTML;
      state.view = viewBeforeSettings;
      state.settingsSection = sectionBeforeSettings;
      render();
      return html;
    })();
    check('Settings zeigt die "Sprache"-Sektion mit Import/Export-Buttons', settingsHtmlLang.includes(t('settings.languageHeading')) && settingsHtmlLang.includes(t('settings.languagePackImport')) && settingsHtmlLang.includes(t('settings.languagePackExportTemplate')));
  }


  /* 4d) Paket-Abholung/-Zustellung: zwei verknüpfte Checkpoint-Typen
     (Fahrer holt an A ab, muss an B zustellen). Läuft komplett auf zwei
     eigens angelegten, am Ende wieder entfernten Test-Checkpoints statt auf
     den von getCheckpointTypes().forEach oben mit-erzeugten "CP ABHOLUNG"/
     "CP ZUSTELLUNG" — die bleiben bewusst unverknüpft, damit
     evt.checkpoints.length für die getCheckpointTypes().length-Assertionen in
     Abschnitt 4 unverändert bleibt. Ruft bewusst NICHT openEditor() auf,
     siehe Begründung in 3m — stattdessen direkt state.view/render(). */
  {
    check('CHECKPOINT_TYPES enthält "pickup"', getCheckpointTypes().some(ct => ct.key === 'pickup'));
    check('CHECKPOINT_TYPES enthält "dropoff"', getCheckpointTypes().some(ct => ct.key === 'dropoff'));
    checkEqual('pickup ist nicht gewertet', getCheckpointType('pickup').isScored, false);
    checkEqual('dropoff ist nicht gewertet', getCheckpointType('dropoff').isScored, false);
    checkEqual('withCheckpointDefaults setzt pairedDropoffCpId auf leer', withCheckpointDefaults({}).pairedDropoffCpId, '');

    const pickupCp = withCheckpointDefaults({id: uid('cp'), order: 900, lat: 51, lng: 9, name: 'Testabholung', type: 'pickup'});
    const dropoffCp = withCheckpointDefaults({id: uid('cp'), order: 901, lat: 51.1, lng: 9.1, name: 'Testzustellung', type: 'dropoff'});
    evt.checkpoints.push(pickupCp, dropoffCp);

    checkEqual('pickupForDropoff findet ohne Verknüpfung nichts', pickupForDropoff(evt, dropoffCp.id), null);
    onEditPairedDropoff(pickupCp.id, dropoffCp.id);
    checkEqual('onEditPairedDropoff setzt pairedDropoffCpId', pickupCp.pairedDropoffCpId, dropoffCp.id);
    const foundPickup = pickupForDropoff(evt, dropoffCp.id);
    check('pickupForDropoff findet den verknüpften Abholung-Checkpoint', !!foundPickup && foundPickup.id === pickupCp.id);

    /* Ziel-Check-in-Gate: Zustellung ohne bestätigte Abholung.
       riders[3] (DNF aus 3c) wird hier nur als isolierter Test-Fahrer
       wiederverwendet — completed/checkpointOrderOverrides werden am Ende
       wieder bereinigt, raceStatus bleibt unberührt. */
    const testRider = evt.riders[3];
    testRider.completed = (testRider.completed || []).filter(id => id !== pickupCp.id && id !== dropoffCp.id);
    activateCheckinRider(testRider.bib);

    const origConfirmPkg = window.confirm;
    let confirmMsg = null;
    window.confirm = (msg) => { confirmMsg = msg; return false; };
    onCheckinToggleCheckpoint(dropoffCp.id, true);
    check('checkPickupBeforeDropoff fragt nach, wenn Abholung fehlt', !!confirmMsg && confirmMsg.includes(pickupCp.name));
    check('Bei Ablehnung bleibt Zustellung offen', !(testRider.completed || []).includes(dropoffCp.id));

    window.confirm = () => true;
    confirmMsg = null;
    onCheckinToggleCheckpoint(dropoffCp.id, true);
    check('Bei Bestätigung wird Zustellung trotzdem markiert', (testRider.completed || []).includes(dropoffCp.id));
    check('Override wird geloggt', (testRider.checkpointOrderOverrides || []).some(o => o.checkpointId === dropoffCp.id));
    onCheckinToggleCheckpoint(dropoffCp.id, false);

    confirmMsg = null;
    onCheckinToggleCheckpoint(pickupCp.id, true);
    check('Abholung selbst braucht keine Bestätigung', confirmMsg === null);
    onCheckinToggleCheckpoint(dropoffCp.id, true);
    check('Zustellung nach erledigter Abholung ohne Rückfrage möglich', confirmMsg === null && (testRider.completed || []).includes(dropoffCp.id));
    window.confirm = origConfirmPkg;

    /* Check-in-Karte: Status-Hinweise */
    renderCheckin();
    await wait(20);
    check('Zustellung zeigt "Abholung erledigt"-Badge', document.body.innerHTML.includes(t('checkin.pickupDoneBadge')));
    check('Abholung zeigt Ziel-Hinweis auf die Zustellung', document.body.innerHTML.includes(t('checkin.pickupHint', {name: dropoffCp.name})));

    /* Sidebar-Badges (Karten-Editor) */
    state.view = 'editor';
    render();
    await wait(20);
    check('Abholung-Zeile zeigt Zustell-Badge', document.body.innerHTML.includes(t('checkpoint.pickupBadge', {name: dropoffCp.name})));
    check('Zustellung-Zeile zeigt Abholung-Badge', document.body.innerHTML.includes(t('checkpoint.dropoffBadge', {name: pickupCp.name})));

    /* Löschen der Zustellung entfernt die Verknüpfung beim Abholung-Checkpoint (kein Dangling Reference) */
    const origConfirmDel = window.confirm;
    window.confirm = () => true;
    confirmDeleteCp(dropoffCp.id);
    window.confirm = origConfirmDel;
    checkEqual('Löschen des Zustell-Checkpoints entfernt die Verknüpfung beim Abholung-Checkpoint', pickupCp.pairedDropoffCpId, '');

    /* Aufräumen */
    evt.checkpoints = evt.checkpoints.filter(c => c.id !== pickupCp.id && c.id !== dropoffCp.id);
    evt.checkpoints.forEach((c, i) => { c.order = i + 1; });
    testRider.completed = (testRider.completed || []).filter(id => id !== pickupCp.id && id !== dropoffCp.id);
    testRider.checkpointOrderOverrides = (testRider.checkpointOrderOverrides || []).filter(o => o.checkpointId !== dropoffCp.id);
    state.checkinActiveBib = null;
    renderCheckin();
  }

  /* 4e) Paket 9: Settings-Sidebar-Redesign — Sidebar-Navigation mit Gruppen
     statt einer langen Scroll-Seite (Obsidian-artig). Nur der aktive
     Settings-Screen landet im DOM, nicht mehr alle Sektionen gleichzeitig —
     daher hier explizit über selectSettingsSection() navigieren statt wie
     vorher direkt im HTML nach jeder Überschrift zu suchen. */
  {
    const allNavIds = SETTINGS_NAV_GROUPS.flatMap(g => g.items.map(i => i.id));
    checkEqual('SETTINGS_NAV_GROUPS hat 4 Gruppen', SETTINGS_NAV_GROUPS.length, 4);
    checkEqual('SETTINGS_NAV_GROUPS listet 8 Screens', allNavIds.length, 8);
    checkEqual('Alle Nav-IDs sind eindeutig', new Set(allNavIds).size, allNavIds.length);

    const viewBeforeNav = state.view;
    const sectionBeforeNav = state.settingsSection;
    const mobileDetailBeforeNav = state.settingsMobileDetailOpen;

    localStorage.removeItem('alleycat:settingsSection');
    state.settingsSection = null;
    openSettings();
    checkEqual('openSettings() ohne gespeicherte Präferenz landet auf dem ersten Nav-Punkt', state.settingsSection, SETTINGS_NAV_GROUPS[0].items[0].id);
    checkEqual('openSettings() startet auf Mobile im Listen-Modus (nicht sofort im Detail)', state.settingsMobileDetailOpen, false);

    selectSettingsSection('theme');
    checkEqual('selectSettingsSection setzt die aktive Sektion', state.settingsSection, 'theme');
    check('selectSettingsSection öffnet die mobile Detail-Ansicht', state.settingsMobileDetailOpen);
    checkEqual('selectSettingsSection persistiert die Wahl in localStorage', localStorage.getItem('alleycat:settingsSection'), 'theme');
    /* #view-settings .settings-content statt eines bloßen .settings-content-
       Selektors, seit Paket 11 (Fahrer-Sidebar) dieselbe Klasse auch auf
       #view-riders verwendet — ein ungescopter Selector würde je nach
       DOM-Reihenfolge die falsche Seite treffen. Zusätzlich .settings-content
       statt des gesamten #view-settings, da die Sidebar selbst auch einen
       Nav-Eintrag "Checkpoint-Typen" listet — dessen Label ist wortgleich mit
       der Sektions-Überschrift und würde die Content-Only-Prüfung sonst
       falsch bestehen lassen. */
    let settingsContentHtml = document.querySelector('#view-settings .settings-content').innerHTML;
    check('Aktive Sektion (Design) ist im Content-Bereich', settingsContentHtml.includes(t('settings.themeHeading')));
    check('Inaktive Sektion (Checkpoint-Typen) ist NICHT im Content-Bereich (nur ein Screen gleichzeitig gerendert)', !settingsContentHtml.includes(t('settings.checkpointTypesDesc')));

    closeSettingsMobileDetail();
    check('closeSettingsMobileDetail schließt die mobile Detail-Ansicht wieder', !state.settingsMobileDetailOpen);

    selectSettingsSection('checkpointTypes');
    settingsContentHtml = document.querySelector('#view-settings .settings-content').innerHTML;
    check('Wechsel zu Checkpoint-Typen zeigt deren Inhalt', settingsContentHtml.includes(t('settings.checkpointTypesDesc')));
    check('Wechsel zu Checkpoint-Typen entfernt den vorherigen Design-Inhalt aus dem Content-Bereich', !settingsContentHtml.includes(t('settings.themeDesc')));

    toggleFeature('offline_map_cache');
    jumpToFeatureConfig('offline-settings');
    checkEqual('jumpToFeatureConfig("offline-settings") navigiert in die Settings', state.view, 'settings');
    checkEqual('jumpToFeatureConfig("offline-settings") wählt die Datensicherheit-Sektion', state.settingsSection, 'dataSafety');
    check('Datensicherheit-Sektion zeigt die Offline-Bereitschaft (Deep-Link-Ziel)', document.getElementById('offline-readiness-section') !== null);
    toggleFeature('offline_map_cache');

    state.view = viewBeforeNav;
    state.settingsSection = sectionBeforeNav;
    state.settingsMobileDetailOpen = mobileDetailBeforeNav;
    if(sectionBeforeNav) saveSettingsSectionPref(sectionBeforeNav); else localStorage.removeItem('alleycat:settingsSection');
    render();
  }

  /* 4f) Paket 11: Fahrer-Sidebar-Redesign — gleiches "volles Settings-Muster"
     wie Paket 9, aber mit einem dominanten Standardabschnitt (Roster) statt
     einer gemerkten Auswahl: openRiders() setzt state.ridersSection deshalb
     bei jedem Aufruf explizit zurück, statt wie settingsSection persistiert
     zu werden. Neu in diesem Paket: Roster-Suche + Sortierung/Gruppierung. */
  {
    const allRidersNavIds = ridersNavGroups(evt).flatMap(g => g.items.map(i => i.id));
    checkEqual('ridersNavGroups hat 2 Gruppen (Roster/Konfiguration)', ridersNavGroups(evt).length, 2);
    checkEqual('ridersNavGroups listet 5 Screens (Kategorien-Feature aktiv)', allRidersNavIds.length, 5);
    checkEqual('Alle Riders-Nav-IDs sind eindeutig', new Set(allRidersNavIds).size, allRidersNavIds.length);

    const viewBeforeRidersNav = state.view;
    const sectionBeforeRidersNav = state.ridersSection;
    const mobileDetailBeforeRidersNav = state.ridersMobileDetailOpen;
    const searchBeforeRidersNav = state.riderRosterSearch;
    const sortBeforeRidersNav = state.riderSortBy;

    selectRidersSection('teams');
    openRiders();
    checkEqual('openRiders() setzt die Sektion IMMER auf "roster" zurück (kein Merken wie bei Settings)', state.ridersSection, 'roster');
    checkEqual('openRiders() startet auf Mobile im Listen-Modus', state.ridersMobileDetailOpen, false);

    selectRidersSection('teams');
    checkEqual('selectRidersSection setzt die aktive Sektion', state.ridersSection, 'teams');
    check('selectRidersSection öffnet die mobile Detail-Ansicht', state.ridersMobileDetailOpen);
    let ridersContentHtml = document.querySelector('#view-riders .settings-content').innerHTML;
    check('Aktive Sektion (Teams) ist im Content-Bereich', ridersContentHtml.includes(t('rider.teamsDesc')));
    check('Inaktive Sektion (Kartendesign) ist NICHT im Content-Bereich', !ridersContentHtml.includes(t('rider.cardDesignDesc')));

    closeRidersMobileDetail();
    check('closeRidersMobileDetail schließt die mobile Detail-Ansicht wieder', !state.ridersMobileDetailOpen);

    selectRidersSection('roster');
    const namedRider = evt.riders.find(r => r.name) || evt.riders[0];
    onRiderRosterSearchInput(namedRider.name || String(namedRider.bib));
    check('Roster-Suche filtert auf den Namen', filteredRosterRiders(evt).every(r => (r.name || '').toLowerCase().includes((namedRider.name || String(namedRider.bib)).toLowerCase())));
    onRiderRosterSearchInput(String(namedRider.bib));
    check('Roster-Suche filtert auch nach Startnummer', filteredRosterRiders(evt).some(r => r.bib === namedRider.bib));
    onRiderRosterSearchInput('');

    onRiderSortByChange('team');
    renderRiders();
    check('Sortierung "Team" gruppiert das Grid mit Team-Überschriften', document.querySelectorAll('#view-riders .rider-group-heading').length > 0);
    onRiderSortByChange('bib');
    renderRiders();
    check('Sortierung "Startnummer" zeigt ein flaches Grid ohne Gruppen-Überschriften', document.querySelectorAll('#view-riders .rider-group-heading').length === 0);

    check('Kategorien-Feature ist an dieser Stelle aktiv (Voraussetzung für den folgenden Deep-Link-Check)', isFeatureEnabled('categories', evt));
    jumpToFeatureConfig('category-settings');
    checkEqual('jumpToFeatureConfig("category-settings") landet auf der Fahrer-Ansicht', state.view, 'riders');
    checkEqual('jumpToFeatureConfig("category-settings") wählt die Kategorien-Sektion', state.ridersSection, 'categories');

    state.view = viewBeforeRidersNav;
    state.ridersSection = sectionBeforeRidersNav;
    state.ridersMobileDetailOpen = mobileDetailBeforeRidersNav;
    state.riderRosterSearch = searchBeforeRidersNav;
    state.riderSortBy = sortBeforeRidersNav;
    render();
  }

  /* 4) Speichern + aus dem Storage-Backend zurücklesen (backend-agnostisch) */
  await saveCurrentEvent();
  await saveEventsIndex();
  const reloaded = await loadEvent(evt.id);
  check('Event aus Storage zurückgelesen', !!reloaded);
  checkEqual('Event-Name persistiert', reloaded && reloaded.name, evt.name);
  checkEqual('Checkpoints persistiert', reloaded && reloaded.checkpoints.length, getCheckpointTypes().length);
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
  checkEqual('pdfBlocks persistiert', reloaded && reloaded.pdfBlocks.length, evt.pdfBlocks.length);
  checkEqual('scoringMode persistiert', reloaded && reloaded.scoringMode, evt.scoringMode);
  checkEqual('gameModes persistiert', reloaded && reloaded.gameModes.length, evt.gameModes.length);
  checkEqual('gameModes-Aktivierung persistiert', reloaded && reloaded.gameModes.find(m => m.type === 'first_n') && reloaded.gameModes.find(m => m.type === 'first_n').enabled, true);
  checkEqual('zones persistiert', reloaded && reloaded.zones.length, evt.zones.length);
  checkEqual('Zonen-Radius persistiert', reloaded && reloaded.zones[0] && reloaded.zones[0].radiusMeters, 200);
  checkEqual('Zonen-Sichtbarkeits-Flag persistiert', reloaded && reloaded.zones[0] && reloaded.zones[0].visibleOnHqMap, true);
  checkEqual('eventLocations persistiert', reloaded && reloaded.eventLocations.length, evt.eventLocations.length);
  checkEqual('freistehende HQ-Location (linkedCheckpointId=null) persistiert korrekt', reloaded && reloaded.eventLocations[0] && reloaded.eventLocations[0].linkedCheckpointId, null);

  /* 5) Ziel-Check-in: Fahrer bestätigen */
  openCheckin();
  selectCheckinRiderByBib(evt.riders[0].bib);
  confirmRiderAtFinish();
  check('Fahrer #1 nach Bestätigen im Ziel', !!getActiveCheckinRider().finishTime);
  check('rider_finished landet im eventLog (first_n bereits aktiv seit 3j)', (evt.ruleRuntimeState.eventLog || []).some(e => e.type === 'rider_finished'));

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
  closePdfPreview();

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

  /* 15) Splashscreen */
  {
    checkEqual('appSettings.showSplashScreen ist per Default aktiviert', state.appSettings.showSplashScreen !== false, true);

    const splashHtml = renderSplashscreen();
    check('renderSplashscreen zeigt den Titel', splashHtml.includes(t('splashscreen.title')));
    check('renderSplashscreen zeigt den Claim', splashHtml.includes(t('splashscreen.claim')));
    check('renderSplashscreen zeigt den Loslegen-Button mit dismissSplashscreen()', splashHtml.includes('dismissSplashscreen()'));

    const viewBeforeDismiss = state.view;
    const origStartOnboardingTour = window.startOnboardingTour;
    window.startOnboardingTour = () => {};
    state.view = 'splashscreen';
    dismissSplashscreen();
    checkEqual('dismissSplashscreen() navigiert zum Dashboard', state.view, 'dashboard');
    state.view = viewBeforeDismiss;
    window.startOnboardingTour = origStartOnboardingTour;

    onShowSplashScreenChange(false);
    checkEqual('onShowSplashScreenChange(false) deaktiviert den Splashscreen', state.appSettings.showSplashScreen, false);
    onShowSplashScreenChange(true);
    checkEqual('onShowSplashScreenChange(true) aktiviert ihn wieder', state.appSettings.showSplashScreen, true);
  }

  /* 16) Onboarding-Tour */
  {
    checkEqual('ONBOARDING_STEPS hat 6 Einträge', ONBOARDING_STEPS.length, 6);
    checkEqual('ONBOARDING_STEPS-Reihenfolge stimmt', ONBOARDING_STEPS.map(s => s.view).join(','), 'dashboard,editor,riders,checkin,leaderboard,manifest');

    const backupIndex = state.eventsIndex;
    state.eventsIndex = [];
    checkEqual('findOnboardingTargetEvent() liefert null bei leerem eventsIndex', findOnboardingTargetEvent(), null);

    let toastCalls = 0;
    const origShowToast = window.showToast;
    window.showToast = () => { toastCalls++; };
    const activeBeforeEmptyTest = !!(state.onboarding && state.onboarding.active);
    startOnboardingTour();
    checkEqual('startOnboardingTour() ohne Event zeigt Toast', toastCalls, 1);
    checkEqual('startOnboardingTour() ohne Event lässt den Aktiv-Zustand unangetastet', !!(state.onboarding && state.onboarding.active), activeBeforeEmptyTest);

    toastCalls = 0;
    startOnboardingTour(true);
    checkEqual('startOnboardingTour(true) ohne Event zeigt keinen Toast (Auto-Start-Fall)', toastCalls, 0);
    window.showToast = origShowToast;
    state.eventsIndex = backupIndex;

    /* findOnboardingTargetEvent() bevorzugt immer das namentlich gefundene Demo-Event
       (siehe Spec §4) — ein zusätzliches, frisch angelegtes Event würde es nie
       verdrängen. Die folgenden Checks nutzen deshalb bewusst das echte Ziel-Event
       statt eines eigens angelegten, statt eine falsche Erwartung zu testen. */
    const targetEvt = findOnboardingTargetEvent();
    if(targetEvt){
      goDashboard();
      startOnboardingTour();
      checkEqual('startOnboardingTour() setzt onboarding.active', state.onboarding.active, true);
      checkEqual('startOnboardingTour() startet bei Schritt 0', state.onboarding.stepIndex, 0);
      checkEqual('startOnboardingTour() wählt das erwartete Ziel-Event', state.onboarding.eventId, targetEvt.id);

      advanceOnboardingStep();
      await wait(60);
      checkEqual('advanceOnboardingStep() wechselt zu Schritt 1', state.onboarding.stepIndex, 1);
      checkEqual('Schritt 1 navigiert zur Editor-View', state.view, 'editor');
      checkEqual('Event bleibt beim Wechsel erhalten', state.currentEvent.id, targetEvt.id);

      retreatOnboardingStep();
      await wait(60);
      checkEqual('retreatOnboardingStep() wechselt zurück zu Schritt 0', state.onboarding.stepIndex, 0);
      checkEqual('Schritt 0 navigiert zurück zum Dashboard', state.view, 'dashboard');

      const stepBeforeInvalid = state.onboarding.stepIndex;
      goToTourStep(-1);
      checkEqual('goToTourStep() ignoriert Index < 0', state.onboarding.stepIndex, stepBeforeInvalid);
      goToTourStep(99);
      checkEqual('goToTourStep() ignoriert Index >= Länge', state.onboarding.stepIndex, stepBeforeInvalid);

      skipOnboardingTour();
      checkEqual('skipOnboardingTour() beendet die Tour', state.onboarding.active, false);
      checkEqual('skipOnboardingTour() setzt onboardingCompleted', state.appSettings.onboardingCompleted, true);

      state.appSettings.onboardingCompleted = false;
      startOnboardingTour();
      for(let i = 0; i < ONBOARDING_STEPS.length - 1; i++){
        advanceOnboardingStep();
        await wait(60);
      }
      checkEqual('Sequenzielles Durchklicken erreicht den letzten Schritt', state.onboarding.stepIndex, ONBOARDING_STEPS.length - 1);
      checkEqual('Letzter Schritt navigiert zur Manifest-View', state.view, 'manifest');
      finishOnboardingTour();
      checkEqual('finishOnboardingTour() beendet die Tour', state.onboarding.active, false);
      checkEqual('finishOnboardingTour() setzt onboardingCompleted', state.appSettings.onboardingCompleted, true);

      goDashboard();
    } else {
      console.log('ℹ️  Onboarding-Navigationschecks übersprungen (kein Event im Scope — z. B. Server-Variante ohne Demo-Seeding).');
    }

    const settingsHtml = renderSettingsSectionTheme();
    check('Settings zeigt den "Einführung erneut anzeigen"-Button', settingsHtml.includes('startOnboardingTour()'));

    state.appSettings.onboardingCompleted = false;
    await saveAppSettings();
  }

  /* 17) Settings-Zurück-Button (Regressionstest) */
  {
    const viewBeforeSettings = state.view;
    goDashboard();
    openSettings();
    checkEqual('openSettings() merkt sich Dashboard als Rückkehr-View', state.settingsReturnView, 'dashboard');

    /* jumpToFeatureConfig('offline-settings') ruft openSettings() erneut auf,
       während man schon in Settings ist — das darf settingsReturnView NICHT
       auf 'settings' selbst umbiegen (sonst tut "Zurück" nichts mehr). */
    jumpToFeatureConfig('offline-settings');
    checkEqual('Erneutes openSettings() aus Settings heraus überschreibt settingsReturnView nicht', state.settingsReturnView, 'dashboard');

    closeSettings();
    checkEqual('closeSettings() kehrt zum echten Ursprungs-View zurück, nicht zu Settings selbst', state.view, 'dashboard');

    if(viewBeforeSettings !== 'dashboard') goDashboard();
  }

  /* 18) Splashscreen-Sprachauswahl */
  {
    const langBeforeTest = getCurrentLanguage();
    const switchHtml = renderSplashscreenLangSwitch();
    check('renderSplashscreenLangSwitch() zeigt einen Button pro verfügbarer Sprache', availableLanguages().every(code => switchHtml.includes(`setLanguage('${code}')`)));
    check('renderSplashscreenLangSwitch() markiert die aktive Sprache', switchHtml.includes(`splashscreen-lang-btn active`));

    setLanguage('en');
    checkEqual('setLanguage() im Splash wechselt getCurrentLanguage()', getCurrentLanguage(), 'en');
    const splashHtmlEn = renderSplashscreen();
    check('Splashscreen zeigt englischen Titel nach Sprachwechsel', splashHtmlEn.includes(t('splashscreen.title')));

    setLanguage(langBeforeTest);
    checkEqual('Sprache nach Test zurückgesetzt', getCurrentLanguage(), langBeforeTest);
  }

  /* 19) Dokumentationsseite */
  {
    checkEqual('DOC_TOPICS hat 11 Einträge', DOC_TOPICS.length, 11);
    checkEqual('filteredDocTopics() liefert ohne Suche alle Themen', filteredDocTopics().length, DOC_TOPICS.length);

    const searchBefore = state.docSearch;
    onDocSearchInput('Zonen');
    checkEqual('onDocSearchInput() übernimmt den Suchbegriff', state.docSearch, 'Zonen');
    const filtered = filteredDocTopics();
    check('Suche nach "Zonen" findet das Zonen-Thema', filtered.some(topic => topic.id === 'zonesGameModes'));
    check('Suche nach "Zonen" filtert nicht-passende Themen heraus', filtered.length < DOC_TOPICS.length);

    onDocSearchInput('xyzxyz-nichts-passt-hier');
    checkEqual('Suche ohne Treffer liefert leere Liste', filteredDocTopics().length, 0);
    const emptyHtml = renderDocumentationSection();
    check('Doku zeigt Hinweis bei keinem Treffer', emptyHtml.includes(t('docs.noMatches')));

    onDocSearchInput(searchBefore || '');

    const docHtml = renderDocumentationSection();
    check('Doku-Sektion zeigt die Überschrift', docHtml.includes(t('docs.heading')));
    check('Doku-Sektion zeigt alle Themen-Titel', DOC_TOPICS.every(topic => docHtml.includes(escapeHtml(t(topic.titleKey)))));

    checkEqual('Neue Settings-Gruppe "Hilfe" ist registriert', !!settingsNavItem('documentation'), true);
    const sidebarHtml = renderSettingsSidebar();
    check('Settings-Sidebar zeigt den Dokumentation-Nav-Punkt', sidebarHtml.includes(t('settings.navDocumentation')));

    checkEqual('settingsSectionContent("documentation") rendert die Doku-Sektion', settingsSectionContent('documentation').includes(t('docs.heading')), true);
  }

  /* 20) Rider-App-Fundament (Teilprojekt 1, Paket 1) */
  {
    /* Zugangsdaten */
    const tok = generateRiderToken();
    const code = generateRiderCode();
    checkEqual('generateRiderToken() liefert 32 Zeichen', tok.length, 32);
    check('generateRiderToken() nutzt nur [a-z0-9]', /^[a-z0-9]{32}$/.test(tok));
    checkEqual('generateRiderCode() liefert 8 Zeichen', code.length, 8);
    check('generateRiderCode() nutzt nur [A-HJ-NP-Z2-9]', /^[A-HJ-NP-Z2-9]{8}$/.test(code));
    check('generateRiderCode() meidet verwechselbare Zeichen O/0/I/1', !/[O0I1]/.test(code));

    const tokens = new Set();
    for(let i = 0; i < 5000; i++) tokens.add(generateRiderToken());
    checkEqual('generateRiderToken() kollidiert nicht über 5000 Aufrufe', tokens.size, 5000);

    checkEqual('sha256Hex() liefert den bekannten Hash von "abc"',
      await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    /* QR-Nutzlast */
    const pid = 'abcdefghijkl';
    const rTok = 'a'.repeat(32);
    const riderPayload = `https://x.tld/rider.html#r.${pid}.${rTok}`;
    const parsedRider = parseRiderQrPayload(riderPayload);
    checkEqual('parseRiderQrPayload() erkennt eine Spokecard', parsedRider && parsedRider.kind, 'rider');
    checkEqual('parseRiderQrPayload() liest das riderToken', parsedRider && parsedRider.riderToken, rTok);

    const cpPayload = `https://x.tld/rider.html#c.${pid}.cp-abc1234.${rTok}`;
    const parsedCp = parseRiderQrPayload(cpPayload);
    checkEqual('parseRiderQrPayload() erkennt einen Checkpoint', parsedCp && parsedCp.kind, 'checkpoint');
    checkEqual('parseRiderQrPayload() liest die cpId', parsedCp && parsedCp.cpId, 'cp-abc1234');

    const legacy = parseRiderQrPayload('42');
    checkEqual('parseRiderQrPayload() erkennt die alte nackte Startnummer', legacy && legacy.kind, 'legacyBib');
    checkEqual('parseRiderQrPayload() liest die alte Startnummer als Zahl', legacy && legacy.bib, 42);

    check('parseRiderQrPayload() weist Müll ab', parseRiderQrPayload('hallo welt') === null);
    check('parseRiderQrPayload() weist eine zu kurze publicId ab', parseRiderQrPayload(`#r.kurz.${rTok}`) === null);
    check('parseRiderQrPayload() weist ein zu kurzes Token ab', parseRiderQrPayload(`#r.${pid}.abc`) === null);
    check('parseRiderQrPayload() weist Leerstring ab', parseRiderQrPayload('') === null);

    /* Slot-Status */
    checkEqual('slotStatusToDb() bildet "" auf "free" ab', slotStatusToDb(''), 'free');
    checkEqual('slotStatusToDb() lässt "pending" unverändert', slotStatusToDb('pending'), 'pending');
    checkEqual('slotStatusFromDb() bildet "free" auf "" zurück', slotStatusFromDb('free'), '');
    checkEqual('slotStatusFromDb() lässt "confirmed" unverändert', slotStatusFromDb('confirmed'), 'confirmed');

    /* Defaults und Token-Nachrüstung */
    const slotDefaults = withRiderDefaults({bib: 1});
    checkEqual('withRiderDefaults() ergänzt riderStatus', slotDefaults.riderStatus, '');
    checkEqual('withRiderDefaults() ergänzt gpsFlags', typeof slotDefaults.gpsFlags, 'object');
    const keptToken = withRiderDefaults({bib: 1, riderToken: 'schon-da'});
    checkEqual('withRiderDefaults() überschreibt ein vorhandenes Token nicht', keptToken.riderToken, 'schon-da');

    const tokenEvt = {riders: [{bib: 1, riderToken: 'behalten', riderCode: 'BEHALTEN'}, {bib: 2}]};
    const tokenChanged = ensureRiderTokens(tokenEvt);
    checkEqual('ensureRiderTokens() meldet die Nachrüstung', tokenChanged, true);
    checkEqual('ensureRiderTokens() fasst vorhandene Token nicht an', tokenEvt.riders[0].riderToken, 'behalten');
    checkEqual('ensureRiderTokens() rüstet fehlende Token nach', tokenEvt.riders[1].riderToken.length, 32);
    checkEqual('ensureRiderTokens() meldet beim zweiten Lauf nichts mehr', ensureRiderTokens(tokenEvt), false);

    const cpEvt = {checkpoints: [{id: 'cp-1', qrToken: 'behalten'}, {id: 'cp-2'}]};
    checkEqual('ensureCheckpointTokens() meldet die Nachrüstung', ensureCheckpointTokens(cpEvt), true);
    checkEqual('ensureCheckpointTokens() fasst vorhandene Token nicht an', cpEvt.checkpoints[0].qrToken, 'behalten');
    checkEqual('ensureCheckpointTokens() meldet beim zweiten Lauf nichts mehr', ensureCheckpointTokens(cpEvt), false);
    checkEqual('withCheckpointDefaults() setzt qrCheckinEnabled auf false', withCheckpointDefaults({id: 'x'}).qrCheckinEnabled, false);

    /* Freie Startnummern */
    const bibEvt = {riders: [
      {bib: 1, riderStatus: 'confirmed'}, {bib: 2, riderStatus: 'pending'},
      {bib: 3, riderStatus: ''}, {bib: 4}
    ]};
    const freeBibs = computeFreeBibs(bibEvt);
    checkEqual('computeFreeBibs() zählt bestätigte Slots', freeBibs.confirmed.join(','), '1');
    checkEqual('computeFreeBibs() zählt ausstehende Slots', freeBibs.pending.join(','), '2');
    checkEqual('computeFreeBibs() zählt freie Slots', freeBibs.free.join(','), '3,4');

    /* Merge — die zentrale Zusage des Moduls */
    const mergeEvt = {
      riders: [withRiderDefaults({bib: 7}), withRiderDefaults({bib: 8})],
      checkpoints: [{id: 'cp-a'}, {id: 'cp-b'}],
      orphanCheckins: []
    };
    const rows = [
      {id: 1, type: 'checkin', bib: 7, cp_id: 'cp-a', created_at: '2026-08-25 14:32:00'},
      {id: 2, type: 'checkin', bib: 7, cp_id: 'cp-b', created_at: '2026-08-25 14:48:00', gps_distance_m: 1200},
      {id: 3, type: 'register', bib: 8, cp_id: null, payload: '{"name":"Testfahrer"}'}
    ];
    const first = mergeRiderLogRows(mergeEvt, rows);
    checkEqual('mergeRiderLogRows() meldet die erste Anwendung als Änderung', first.changed, true);
    checkEqual('mergeRiderLogRows() trägt Check-ins in completed ein', mergeEvt.riders[0].completed.join(','), 'cp-a,cp-b');
    checkEqual('mergeRiderLogRows() trägt die Check-in-Zeit ein', mergeEvt.riders[0].checkpointTimes['cp-a'], '2026-08-25 14:32:00');
    checkEqual('mergeRiderLogRows() markiert auffällige GPS-Distanz', mergeEvt.riders[0].gpsFlags['cp-b'], 1200);
    check('mergeRiderLogRows() markiert unauffällige GPS-Distanz nicht', mergeEvt.riders[0].gpsFlags['cp-a'] === undefined);
    checkEqual('mergeRiderLogRows() setzt eine Anmeldung auf pending', mergeEvt.riders[1].riderStatus, 'pending');
    checkEqual('mergeRiderLogRows() übernimmt die Anmeldedaten', mergeEvt.riders[1].pendingData.name, 'Testfahrer');

    const snapshot = JSON.stringify(mergeEvt);
    const second = mergeRiderLogRows(mergeEvt, rows);
    checkEqual('mergeRiderLogRows() ist idempotent — zweiter Lauf ändert nichts', second.changed, false);
    checkEqual('mergeRiderLogRows() ist idempotent — Zustand bleibt gleich', JSON.stringify(mergeEvt), snapshot);

    /* Verwaiste Zeilen dürfen nie stillschweigend verschwinden */
    const orphanRows = [
      {id: 4, type: 'checkin', bib: 99, cp_id: 'cp-a', created_at: 'x'},
      {id: 5, type: 'checkin', bib: 7, cp_id: 'cp-geloescht', created_at: 'x'}
    ];
    const orphanResult = mergeRiderLogRows(mergeEvt, orphanRows);
    checkEqual('mergeRiderLogRows() erkennt eine unbekannte Startnummer als verwaist', orphanResult.orphans.length, 2);
    checkEqual('mergeRiderLogRows() sammelt verwaiste Zeilen im Event', mergeEvt.orphanCheckins.length, 2);
    checkEqual('mergeRiderLogRows() sammelt dieselbe verwaiste Zeile nicht doppelt',
      mergeRiderLogRows(mergeEvt, orphanRows).changed, false);

    /* Publish-Nutzlast: Positivliste, keine Klartext-Token, keine Namen */
    const syncEvt = withEventDefaults({
      id: 'evt-test', name: 'Sync-Test', publicId: generateEventPublicId(),
      checkpoints: [{id: 'cp-a', name: 'Dom', lat: 50.94, lng: 6.96, qrToken: 'q'.repeat(32), qrCheckinEnabled: true}],
      riders: [{bib: 1, name: 'Geheim Name', emergencyContact: '0170-123', riderToken: 'r'.repeat(32), riderCode: 'ABCDEFGH'}]
    });
    const payload = await buildRiderSyncPayload(syncEvt);
    const payloadJson = JSON.stringify(payload);
    check('buildRiderSyncPayload() sendet keinen Fahrernamen', !payloadJson.includes('Geheim Name'));
    check('buildRiderSyncPayload() sendet keinen Notfallkontakt', !payloadJson.includes('0170-123'));
    check('buildRiderSyncPayload() sendet kein Klartext-riderToken', !payloadJson.includes('r'.repeat(32)));
    check('buildRiderSyncPayload() sendet kein Klartext-qrToken', !payloadJson.includes('q'.repeat(32)));
    check('buildRiderSyncPayload() sendet keinen Klartext-riderCode', !payloadJson.includes('ABCDEFGH'));
    checkEqual('buildRiderSyncPayload() hasht das riderToken', payload.slots[0].tokenHash, await sha256Hex('r'.repeat(32)));
    checkEqual('buildRiderSyncPayload() bildet den Slot-Status auf die DB ab', payload.slots[0].status, 'free');
    checkEqual('buildRiderSyncPayload() überträgt qrEnabled', payload.checkpoints[0].qrEnabled, true);
    check('buildRiderSyncPayload() hält Koordinaten zurück, solange die Karte aus ist', payload.checkpoints[0].lat === null);

    syncEvt.riderApp.map = true;
    const payloadWithMap = await buildRiderSyncPayload(syncEvt);
    checkEqual('buildRiderSyncPayload() sendet Koordinaten, wenn die Karte an ist', payloadWithMap.checkpoints[0].lat, 50.94);

    /* Event-Defaults */
    const defaultEvt = withEventDefaults({id: 'x', name: 'y'});
    checkEqual('withEventDefaults() ergänzt riderLastLogId', defaultEvt.riderLastLogId, 0);
    checkEqual('withEventDefaults() aktiviert die Fortschrittsansicht per Default', defaultEvt.riderApp.progress, true);
    checkEqual('withEventDefaults() lässt die Selbstregistrierung per Default aus', defaultEvt.riderApp.selfRegister, false);
    const partialRiderApp = withEventDefaults({id: 'x', name: 'y', riderApp: {map: true}});
    checkEqual('withEventDefaults() ergänzt fehlende riderApp-Schalter', partialRiderApp.riderApp.progress, true);
    checkEqual('withEventDefaults() behält gesetzte riderApp-Schalter', partialRiderApp.riderApp.map, true);

    /* Checkpoint-Typen folgen dem Sprachwechsel (Regressionstest).
       Vor der Umstellung auf getCheckpointTypes() wertete die Typtabelle
       t() genau einmal beim Laden aus und blieb danach in der Startsprache
       stehen — dieselbe Fehlerklasse wie bei NAV_ITEMS/THEMES (19.08.2026). */
    {
      const langBefore = getCurrentLanguage();
      const deLabel = getCheckpointType('qr').fullLabel;
      setLanguage('en');
      const enLabel = getCheckpointType('qr').fullLabel;
      const enDirect = t('checkpoint.types.qr.full');
      setLanguage(langBefore);
      const backLabel = getCheckpointType('qr').fullLabel;

      check('Checkpoint-Typ-Beschriftung wechselt mit der Sprache', deLabel !== enLabel);
      checkEqual('Checkpoint-Typ-Beschriftung entspricht t() nach dem Wechsel', enLabel, enDirect);
      checkEqual('Checkpoint-Typ-Beschriftung kehrt zurück', backLabel, deLabel);
      checkEqual('Sprache nach dem Test zurückgesetzt', getCurrentLanguage(), langBefore);
    }

    /* Memo von getCheckpointTypes(): muss greifen, aber nie veralten */
    {
      check('getCheckpointTypes() liefert bei unverändertem Zustand dieselbe Referenz',
        getCheckpointTypes() === getCheckpointTypes());

      const lenBefore = getCheckpointTypes().length;
      customCheckpointTypes.push({key: 'custom-suite-test', icon: '🧪', shortLabel: 'TEST',
        fullLabel: 'Suite-Testtyp', dropdownLabel: 'Suite-Testtyp', referenceFieldLabel: 'x',
        hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'});

      /* Bewusst OHNE invalidateCheckpointTypes(): das Längen-Sicherheitsnetz
         muss den vergessenen Aufruf abfangen. */
      checkEqual('Neuer eigener Typ erscheint auch ohne Invalidierung', getCheckpointTypes().length, lenBefore + 1);
      checkEqual('Eigener Typ ist über getCheckpointType() auffindbar', getCheckpointType('custom-suite-test').fullLabel, 'Suite-Testtyp');

      const langBefore2 = getCurrentLanguage();
      setLanguage('en');
      checkEqual('Eigener Typ wird nicht übersetzt (Nutzereingabe)', getCheckpointType('custom-suite-test').fullLabel, 'Suite-Testtyp');
      setLanguage(langBefore2);

      customCheckpointTypes = customCheckpointTypes.filter(ct => ct.key !== 'custom-suite-test');
      invalidateCheckpointTypes();
      checkEqual('Eigener Typ nach dem Entfernen wieder weg', getCheckpointTypes().length, lenBefore);
    }

    /* Ausstehende Anmeldungen */
    const pendEvt = withEventDefaults({id: 'p', name: 'p', riders: [
      {bib: 1, riderStatus: 'confirmed'}, {bib: 2, riderStatus: 'pending', pendingData: {name: 'Wartender'}},
      {bib: 3, riderStatus: ''}
    ]});
    checkEqual('pendingRiderRegistrations() findet nur wartende Slots', pendingRiderRegistrations(pendEvt).length, 1);
    checkEqual('pendingRiderRegistrations() liefert den richtigen Slot', pendingRiderRegistrations(pendEvt)[0].bib, 2);

    /* In der lokalen Variante liefert riderAppBaseUrl() '' — daran hängt
       die gesamte Rider-Oberfläche. Diese Prüfungen laufen deshalb im
       lokalen Build und belegen genau das Ausblenden. */
    checkEqual('riderAppBaseUrl() ist in der lokalen Variante leer', riderAppBaseUrl(), '');
    check('Fahrer-Sidebar zeigt ohne Fahrer-App keinen Anmeldungs-Punkt',
      !ridersNavGroups(pendEvt).some(g => g.items.some(i => i.id === 'pending')));

    const pendHtml = renderRidersSectionPending(pendEvt);
    check('Anmeldungs-Sektion zeigt die wartende Startnummer', pendHtml.includes('#2'));
    check('Anmeldungs-Sektion zeigt den eingegebenen Namen', pendHtml.includes('Wartender'));
    const emptyPendHtml = renderRidersSectionPending(withEventDefaults({id: 'q', name: 'q'}));
    check('Anmeldungs-Sektion zeigt einen Empty State ohne Anmeldungen', emptyPendHtml.includes(t('riderApp.pendingEmptyTitle')));

    /* Fahrer-eingegebene Namen dürfen nicht als HTML landen */
    const xssEvt = withEventDefaults({id: 'x2', name: 'x2', riders: [
      {bib: 5, riderStatus: 'pending', pendingData: {name: '<img src=x onerror=alert(1)>', contact: '<b>roh</b>'}}
    ]});
    const xssHtml = renderRidersSectionPending(xssEvt);
    check('Anmeldungs-Sektion escapt einen eingegebenen Namen', !xssHtml.includes('<img src=x'));
    check('Anmeldungs-Sektion escapt einen eingegebenen Kontakt', !xssHtml.includes('<b>roh</b>'));

    /* Spokecard-QR-Inhalt hängt am Seam. In der lokalen Variante liefert
       riderAppBaseUrl() '' — dort muss es bei der nackten Startnummer
       bleiben, sonst zeigten gedruckte Karten ins Leere. */
    {
      const seamEvt = withEventDefaults({id: 's', name: 's', publicId: 'abcdefghijkl'});
      const seamRider = withRiderDefaults({bib: 23, riderToken: 'k'.repeat(32), riderCode: 'ABCDEFGH'});
      checkEqual('Spokecard-QR ohne Fahrer-App ist die nackte Startnummer', spokecardQrPayload(seamEvt, seamRider), '23');

      /* Mit Fahrer-App die Token-URL — der Seam wird dafür kurz gestubbt,
         weil die lokale Variante ihn nie liefert. */
      const echterSeam = window.riderAppBaseUrl;
      window.riderAppBaseUrl = () => 'https://x.tld/alleycat-rider.html';
      const mitApp = spokecardQrPayload(seamEvt, seamRider);
      window.riderAppBaseUrl = echterSeam;
      check('Spokecard-QR mit Fahrer-App ist die Token-URL', mitApp === 'https://x.tld/alleycat-rider.html#r.abcdefghijkl.' + 'k'.repeat(32));
      check('Token-URL ist wieder parsebar', parseRiderQrPayload(mitApp).kind === 'rider');
    }

    /* Ziel-Check-in liest BEIDE Spokecard-Formate. Das ist die
       kritischste Zusage des Druckstück-Pakets: eine vor dem Release
       gedruckte Karte trägt nur die Startnummer und muss weiter
       funktionieren. */
    {
      const evtBefore2 = state.currentEvent, viewBefore2 = state.view;
      const scanEvt = withEventDefaults({
        id: 'q', name: 'q', publicId: 'abcdefghijkl', status: 'running',
        riders: [
          withRiderDefaults({bib: 11, name: 'Alt', riderToken: 'm'.repeat(32)}),
          withRiderDefaults({bib: 12, name: 'Neu', riderToken: 'n'.repeat(32)})
        ],
        checkpoints: [withCheckpointDefaults({id: 'cp-q', name: 'Q', order: 0})]
      });
      state.currentEvent = scanEvt;
      state.view = 'checkin';

      onQrScanSuccess('11');
      checkEqual('Alte Karte (nackte Startnummer) findet den Fahrer', state.checkinBibInput, '11');

      state.checkinBibInput = '';
      onQrScanSuccess('https://x.tld/alleycat-rider.html#r.abcdefghijkl.' + 'n'.repeat(32));
      checkEqual('Neue Karte (Token-URL) wird lokal zur Startnummer aufgelöst', state.checkinBibInput, '12');

      state.checkinBibInput = '';
      onQrScanSuccess('https://x.tld/alleycat-rider.html#r.abcdefghijkl.' + 'z'.repeat(32));
      checkEqual('Karte eines fremden Events füllt kein Startnummernfeld', state.checkinBibInput, '');

      state.checkinBibInput = '';
      onQrScanSuccess('https://x.tld/alleycat-rider.html#c.abcdefghijkl.cp-q.' + 'm'.repeat(32));
      checkEqual('Checkpoint-Code am Zieltisch füllt kein Startnummernfeld', state.checkinBibInput, '');

      state.currentEvent = evtBefore2; state.view = viewBefore2;
      clearCheckin();
    }

    /* Checkpoint-QR-PDF: nur QR-Checkpoints, und nur mit Fahrer-App */
    {
      const qrEvt = withEventDefaults({
        id: 'pdf', name: 'PDF-Test', publicId: 'abcdefghijkl',
        checkpoints: [
          withCheckpointDefaults({id: 'cp-1', name: 'A', order: 0, qrCheckinEnabled: true, qrToken: 'a'.repeat(32)}),
          withCheckpointDefaults({id: 'cp-2', name: 'B', order: 1, qrCheckinEnabled: false, qrToken: 'b'.repeat(32)}),
          withCheckpointDefaults({id: 'cp-3', name: 'C', order: 2, qrCheckinEnabled: true, qrToken: 'c'.repeat(32)})
        ]
      });
      const mitQr = qrEvt.checkpoints.filter(cp => cp.qrCheckinEnabled).length;
      checkEqual('Zwei der drei Checkpoints haben QR-Check-In', mitQr, 2);

      const echterSeam2 = window.riderAppBaseUrl;
      window.riderAppBaseUrl = () => 'https://x.tld/alleycat-rider.html';
      const nutzlast = buildCheckpointQrPayload(riderAppBaseUrl(), qrEvt, qrEvt.checkpoints[0]);
      window.riderAppBaseUrl = echterSeam2;

      const zurueck = parseRiderQrPayload(nutzlast);
      checkEqual('Checkpoint-Nutzlast ist als Checkpoint parsebar', zurueck.kind, 'checkpoint');
      checkEqual('Checkpoint-Nutzlast trägt die richtige cpId', zurueck.cpId, 'cp-1');
      checkEqual('Checkpoint-Nutzlast trägt das richtige Token', zurueck.qrToken, 'a'.repeat(32));

      const evtBefore3 = state.currentEvent, sectionBefore = state.manifestSection;
      state.currentEvent = qrEvt;
      state.manifestSection = 'drucken';
      const druckenLokal = renderManifestPanel(qrEvt);
      check('Ohne Fahrer-App erscheint kein QR-Blätter-Abschnitt', !druckenLokal.includes(t('exportPdf.cpQrHeading')));

      const echterSeam3 = window.riderAppBaseUrl;
      window.riderAppBaseUrl = () => 'https://x.tld/alleycat-rider.html';
      const druckenMitApp = renderManifestPanel(qrEvt);
      window.riderAppBaseUrl = echterSeam3;
      check('Mit Fahrer-App erscheint der QR-Blätter-Abschnitt', druckenMitApp.includes(t('exportPdf.cpQrHeading')));
      check('Knopf nennt die Anzahl der QR-Checkpoints', druckenMitApp.includes(t('exportPdf.cpQrButton', {count: 2})));

      /* Kein QR-Checkpoint: Hinweis statt Knopf, damit niemand ein leeres
         PDF erzeugt. */
      const ohneQr = withEventDefaults({id: 'p2', name: 'p2', publicId: 'abcdefghijkl',
        checkpoints: [withCheckpointDefaults({id: 'cp-x', name: 'X', order: 0})]});
      state.currentEvent = ohneQr;
      window.riderAppBaseUrl = () => 'https://x.tld/alleycat-rider.html';
      const leer = renderManifestPanel(ohneQr);
      window.riderAppBaseUrl = echterSeam3;
      check('Ohne QR-Checkpoint erscheint ein Hinweis', leer.includes(t('exportPdf.cpQrNone')));
      check('Ohne QR-Checkpoint erscheint kein Erzeugen-Knopf', !leer.includes('exportCheckpointQrPDF()'));

      state.currentEvent = evtBefore3; state.manifestSection = sectionBefore;
    }

    /* Verwaiste Check-ins erscheinen im Leaderboard */
    const orphanEvt = withEventDefaults({id: 'o', name: 'o',
      riders: [withRiderDefaults({bib: 1, finishTime: '2026-08-25T12:00'})],
      checkpoints: [withCheckpointDefaults({id: 'cp-x', name: 'X', order: 0})],
      orphanCheckins: [{id: 9, bib: 42, cp_id: 'cp-weg', type: 'checkin'}]
    });
    const evtBefore = state.currentEvent, viewBefore = state.view;
    state.currentEvent = orphanEvt;
    renderLeaderboard();
    const lbHtml = document.getElementById('view-leaderboard').innerHTML;
    check('Leaderboard weist auf verwaiste Check-ins hin', lbHtml.includes(t('riderApp.orphanHeading', {count: 1})));
    check('Leaderboard nennt die verwaiste Startnummer', lbHtml.includes('42'));
    state.currentEvent = evtBefore; state.view = viewBefore;
    render();
  }

  /* Zusammenfassung */
  const failed = results.filter(r => !r.pass);
  const color = failed.length ? 'color:#c0392b' : 'color:#2e7d32';
  console.log(`%c--- Ergebnis: ${results.length - failed.length}/${results.length} bestanden ---`, `font-weight:bold; font-size:13px; ${color}`);
  if(failed.length) console.table(failed);
  return {total: results.length, passed: results.length - failed.length, failed: failed.length, results};
}
if(typeof window !== 'undefined') window.runAlleycatTestSuite = runAlleycatTestSuite;
