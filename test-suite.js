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
    /* Kategorien-Panel ist seit Paket 4 (Fahrer-Seite im Manifest-Anpassen-Look)
       standardmäßig eingeklappt — ohne diesen Klick existiert #newcatgroup-name
       weiter unten nicht im DOM, genau wie ein echter Nutzer erst "Kategorien"
       aufklappen müsste, bevor das Formular erreichbar ist. */
    toggleCategoriesPanel();
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

  /* 3i) PDF-Baukasten */
  {
    checkEqual('Event hat leere pdfBlocks per Default', evt.pdfBlocks.length, 0);
    addPdfBlock('waiver');
    addPdfBlock('sponsors');
    addPdfBlock('checkpoint_list');
    checkEqual('addPdfBlock legt 3 Blöcke an', evt.pdfBlocks.length, 3);
    checkEqual('Neuer Block hat Default-Target "manifest"', evt.pdfBlocks[0].targetDocuments.join(','), 'manifest');

    const waiverBlock = evt.pdfBlocks[0];
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
    state.pdfBlocksPanelOpen = true;
    render();
    await wait(20);
    check('PDF-Baukasten-Panel rendert im Manifest-Toolbar', document.querySelector('.pdf-blocks-panel') !== null);
    checkEqual('Block-Zeilen im Panel entsprechen Blockanzahl', document.querySelectorAll('.pdf-block-row').length, evt.pdfBlocks.length);
    state.pdfBlocksPanelOpen = false;

    const countBeforeDelete = evt.pdfBlocks.length;
    deletePdfBlock(evt.pdfBlocks[0].id);
    window.confirm = origConfirmPdf;
    checkEqual('deletePdfBlock entfernt Block', evt.pdfBlocks.length, countBeforeDelete - 1);
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
    check('Deaktivierte Kategorien blenden die Kategorien-Sektion in der Fahrerliste aus', !document.getElementById('view-riders').innerHTML.includes('rider-categories-section'));
    toggleFeature('categories');
    openRiders();
    check('Kategorien-Sektion erscheint nach Reaktivierung wieder', document.getElementById('view-riders').innerHTML.includes('rider-categories-section'));

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

  /* Zusammenfassung */
  const failed = results.filter(r => !r.pass);
  const color = failed.length ? 'color:#c0392b' : 'color:#2e7d32';
  console.log(`%c--- Ergebnis: ${results.length - failed.length}/${results.length} bestanden ---`, `font-weight:bold; font-size:13px; ${color}`);
  if(failed.length) console.table(failed);
  return {total: results.length, passed: results.length - failed.length, failed: failed.length, results};
}
if(typeof window !== 'undefined') window.runAlleycatTestSuite = runAlleycatTestSuite;
