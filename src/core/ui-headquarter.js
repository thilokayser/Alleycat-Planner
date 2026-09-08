/* ---------------- app state ---------------- */
let state = {
  view: 'dashboard',
  eventsIndex: [],
  currentEvent: null,
  /* Liga-System (season.js/league.js/roster.js): org-weite Register,
     unabhängig von jedem einzelnen Event, plus die Saison-Liste. Analog
     zu eventsIndex, aber Teams/Fahrer sind hier klein genug, um komplett
     in einer Blob-Zeile statt Stub+Einzel-Blobs zu leben (siehe
     roster.js). */
  teamRoster: [],
  riderRoster: [],
  seasonsIndex: [],
  selectedSeasonId: null,
  confirmDeleteSeasonId: null,
  leagueStandingsCache: null,
  leagueStandingsTab: 'teams',
  addMode: false,
  editingId: null,
  confirmDeleteCpId: null,
  confirmDeleteEventId: null,
  settingsOpen: false,
  eventDateSettingsOpen: false,
  loading: true,
  storageOk: true,
  adminSession: null,   // {token, role, username, displayName} — siehe auth.js currentUserRole()
  adminUsersList: null, // gecachte ?a=users-Antwort für die Benutzerverwaltung
  adminUsersError: '',
  smtpSettings: null,  // gecachter config:smtpSettings-Wert (SysAdmin-only)
  adminUsersEditingId: null,
  adminAssignEditingId: null,
  inviteList: null,    // gecachte ?a=invite-list-Antwort
  inviteError: '',
  inviteFormOpen: false,
  inviteJustCreated: null, // Klartext-Codes direkt nach dem Erstellen — werden nie wieder angezeigt
  resetCodeJustCreated: null, // {userId, code, expiresAt} — wie inviteJustCreated, nur für Passwort-Reset
  userListSearch: '',
  userListRoleFilter: '',
  userListSortBy: 'username',
  userBulkSelectedIds: [],
  auditLogList: null,
  checkinBibInput: '',
  checkinActiveBib: null,
  checkinNotFound: false,
  leaderboardSearch: '',
  /* null = diese Installation hat keine Fahrer-App (Seam liefert null).
     Sonst {ok, at, error} des letzten Publish-Versuchs. */
  riderPublish: null,
  spokeCardsGenerating: false,
  riderSheetGenerating: false,
  printPopupBlocked: false,
  saveStatus: 'idle',
  qrScannerActive: false,
  qrScanError: '',
  racedayActive: false,
  manifestSection: 'anpassen',
  manifestMobileDetailOpen: false,
  appSettings: {theme: 'signal', iconPack: 'emoji', autoBackupEnabled: false, autoBackupIntervalMinutes: 10, autoBackupHintShown: false, offlineCacheHintShown: false, featureToggles: {}, distanceUnit: 'metric', timeFormat: '24h', coordFormat: 'decimal', showSplashScreen: true, onboardingCompleted: false},
  featureRegistrySearch: '',
  docSearch: '',
  settingsReturnView: 'dashboard',
  newTypeFormOpen: false,
  newTeamFormOpen: false,
  newCategoryGroupFormOpen: false,
  leaderboardStatusFilter: '',
  leaderboardCategoryFilters: {},
  leaderboardCsvSplitKey: '',
  leaderboardTab: 'individual',
  leaderboardSortMode: 'time',
  leaderboardTeamFilter: '',
  overviewSettingsOpen: false,
  cpListGroupBy: 'order',
  bulkImportOpen: false,
  bulkImportStep: 'upload',
  bulkImportRows: [],
  bulkImportHasHeader: true,
  bulkImportMapping: {bib: '', name: '', team: '', emergency: ''},
  bulkImportErrors: [],
  bulkImportValidRows: [],
  actionUndoHandlers: {},
  gameModesSectionOpen: false,
  commandPaletteOpen: false,
  commandPaletteQuery: '',
  commandPaletteActiveIndex: 0,
  cpBulkSelectedIds: [],
  pdfPreviewOpen: false,
  pdfPreviewFilename: '',
  socialShareOpen: false,
  ridersSection: 'roster',
  ridersMobileDetailOpen: false,
  riderRosterSearch: '',
  riderSortBy: 'bib',
  zonesPanelOpen: false,
  eventLocationsPanelOpen: false,
  locationPlacementMode: null,
  mapSearchOpen: false,
  logisticsPanelOpen: false,
  routeEstimate: undefined,
  showRouteEstimateOnMap: false,
  showProximityBuffers: false,
  eventSettingsPanelOpen: false,
  orgaPinsPanelOpen: false,
  mapContextMenu: null,
  geoImportPanelOpen: false,
  geoImportLayers: [], // session-only ("temporär") imported layers — see geo-import.js
  cluePreviewMode: false,
  settingsSection: null,
  settingsMobileDetailOpen: false,
  /* Multi-Tenancy/Orgs (nur unter hasAdminRoles() befüllt, siehe init()) */
  myOrgs: [],
  activeOrgSlug: '',
  orgMembersList: null,  // gecachte ?a=org/members-Antwort für die Organisations-Einstellungen
  orgMembersError: '',
  /* SysAdmin-Instanzpanel (state.view = 'instance'): eigene, vom
     Workspace-Dropdown unabhängige Liste, weil ein SysAdmin ganz ohne
     Org-Mitgliedschaft dastehen kann (myOrgs() wäre dann leer). */
  instanceIsSysAdmin: false,
  instanceOrgsList: null,
  instanceOrgsError: '',
};
let pdfPreviewDoc = null;
let map, markersLayer, zonesLayer, eventLocationsLayer, orgaPinsLayer, importedGeoLayer, routeLine, routeEstimateLine, proximityBufferLayer, cpMarkers = {};
let qrScanStream = null;
let qrScanRAF = null;
let liveCountdownInterval = null;
let overviewTickInterval = null;
let zoneShrinkTickInterval = null;
let saveTimeout;
let searchDebounce;
let cpDragState = null;
let searchResultsData = [];

/* ---------------- toast ---------------- */
function showToast({message, actionLabel, onAction, duration = 6000}){
  const root = document.getElementById('toast-root');
  if(!root) return;
  /* Nur ein aktiver Toast gleichzeitig — sonst kann z. B. "Bestätigen"
     gefolgt von schnellem "Zurücksetzen" zwei Toasts mit je eigenem
     "Rückgängig" stapeln, deren Buttons Gegenteiliges tun; ein Klick auf
     den (DOM-älteren, optisch aber nicht unbedingt hinteren) Button löst
     dann die falsche Aktion aus. */
  root.querySelectorAll('.toast').forEach(el => el.remove());
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.innerHTML = `
    <span class="toast-msg">${escapeHtml(message)}</span>
    ${actionLabel ? `<button type="button" class="toast-action"></button>` : ''}
    <button type="button" class="toast-close" aria-label="${t('ui.close')}">&times;</button>
  `;
  root.appendChild(toastEl);
  let dismissed = false;
  let timer;
  const dismiss = () => {
    if(dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    toastEl.classList.add('toast-out');
    setTimeout(() => toastEl.remove(), 180);
  };
  if(actionLabel && onAction){
    const actionBtn = toastEl.querySelector('.toast-action');
    actionBtn.textContent = actionLabel;
    actionBtn.onclick = () => { onAction(); dismiss(); };
  }
  toastEl.querySelector('.toast-close').onclick = dismiss;
  timer = setTimeout(dismiss, duration);
}


/* ---------------- error boundary ----------------
   No framework, so no component-tree boundary — the closest equivalent
   is a global window error/unhandledrejection listener. All writes go
   through debouncedSave()/saveCurrentEvent() already, so by the time an
   uncaught error reaches here the last known-good state is very likely
   already persisted; this overlay exists to replace whatever half-broken
   DOM state a crash leaves behind with a reassuring, recoverable screen
   instead (spec 4.17). Registered at module load, not inside init(), so
   it's active even if init() itself throws. */
function showErrorBoundary(err){
  const root = document.getElementById('error-boundary-root');
  if(!root || root.dataset.shown === '1') return;
  root.dataset.shown = '1';
  console.error('Unerwarteter Fehler:', err);
  root.innerHTML = `
    <div class="error-boundary-overlay">
      <div class="error-boundary-box">
        <div class="error-boundary-title">${t('errorBoundary.title')}</div>
        <p class="error-boundary-text">${t('errorBoundary.text')}</p>
        <button class="btn btn-primary" onclick="location.reload()">${t('errorBoundary.reload')}</button>
      </div>
    </div>
  `;
}
window.addEventListener('error', (e) => { showErrorBoundary((e && (e.error || e.message)) || e); });
window.addEventListener('unhandledrejection', (e) => { showErrorBoundary(e && e.reason); });

/* ---------------- storage-agnostic persistence ---------------- */
async function loadEventsIndex(){
  try{
    const res = await storageGet('events:index');
    state.eventsIndex = res ? JSON.parse(res.value) : [];
  }catch(e){ state.eventsIndex = []; }
}
async function saveEventsIndex(){
  setSaveStatus('saving');
  const ok = await storageSet('events:index', JSON.stringify(state.eventsIndex));
  setSaveStatus(ok ? 'saved' : 'error');
}
async function loadEvent(id){
  try{
    const res = await storageGet('event:' + id);
    return res ? JSON.parse(res.value) : null;
  }catch(e){ return null; }
}
async function saveCurrentEvent(){
  if(!state.currentEvent) return;
  /* Letzte Bremse für die Betrachter-Rolle: der Server lehnt einen
     schreibenden Aufruf ohnehin mit 403 ab (apiVerifyAccess() in
     bootstrap.php), aber ohne diesen Rückweg hier bliebe das Speichern-
     Symbol dauerhaft auf "pending"/"error" hängen und lokale
     optimistische Änderungen wichen nie wieder vom letzten echten Stand
     ab. Rollen-UI-Gating pro Button ist bewusst nicht Teil dieses
     Durchgangs — dieser eine Engpass deckt jeden Schreibpfad ab, siehe
     debouncedSave(). */
  if(isViewerRole()){ setSaveStatus('saved'); return; }
  setSaveStatus('saving');
  const ok = await storageSet('event:' + state.currentEvent.id, JSON.stringify(state.currentEvent));
  setSaveStatus(ok ? 'saved' : 'error');
  if(ok){
    broadcastEventUpdated(state.currentEvent.id);
    schedulePublishRiderConfig();
  }
}
function debouncedSave(){
  if(isViewerRole()) return;
  setSaveStatus('pending');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveCurrentEvent, 450);
}
function cancelPendingSave(){
  clearTimeout(saveTimeout);
  saveTimeout = null;
}
function flushPendingSave(){
  if(saveTimeout){
    clearTimeout(saveTimeout);
    saveTimeout = null;
    saveCurrentEvent();
  }
  if(window.__idxSaveTimeout){
    clearTimeout(window.__idxSaveTimeout);
    window.__idxSaveTimeout = null;
    saveEventsIndex();
  }
}
window.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') flushPendingSave();
});
window.addEventListener('beforeunload', flushPendingSave);
function setSaveStatus(status){
  state.saveStatus = status;
  const el = document.getElementById('save-status');
  if(!el) return;
  el.className = 'save-status ' + status;
  el.textContent = status === 'pending' ? t('ui.saveStatusPending')
    : status === 'saving' ? t('ui.saveStatusSaving')
    : status === 'saved' ? t('ui.saveStatusSaved')
    : status === 'error' ? t('ui.saveStatusError')
    : '';
}

/* ---------------- init ---------------- */
function applyStaticTranslations(){
  const settingsBtn = document.getElementById('settings-gear-btn');
  if(settingsBtn) settingsBtn.title = t('settings.title');
  const searchInput = document.getElementById('map-search-input');
  if(searchInput) searchInput.placeholder = t('map.searchPlaceholder');
  const mapSearchToggle = document.getElementById('map-search-toggle');
  if(mapSearchToggle) mapSearchToggle.title = t('map.searchToggleTitle');
  const cluePreviewToggle = document.getElementById('clue-preview-toggle');
  if(cluePreviewToggle) cluePreviewToggle.title = t('map.cluePreviewToggleTitle');
  const sidebarCollapseToggle = document.getElementById('sidebar-collapse-toggle');
  if(sidebarCollapseToggle){
    const collapsed = window.innerWidth > SIDEBAR_BREAKPOINT && isEditorSidebarCollapsed();
    sidebarCollapseToggle.title = collapsed ? t('map.expandSidebar') : t('map.collapseSidebar');
  }
  const resizeHandle = document.getElementById('sidebar-resize-handle');
  if(resizeHandle) resizeHandle.title = t('map.sidebarResizeTitle');
  const legendMandatory = document.getElementById('legend-mandatory');
  if(legendMandatory) legendMandatory.textContent = t('common.mandatory');
  const legendBonus = document.getElementById('legend-bonus');
  if(legendBonus) legendBonus.textContent = t('common.bonus');
  const legendRoute = document.getElementById('legend-route');
  if(legendRoute) legendRoute.textContent = t('map.routeLegend');
}
async function init(){
  if(isBeamerRoute()){ await initBeamer(); return; }
  state.adminSession = loadAdminSession();
  if(!(await initStorageBackend())) return;
  /* Workspace/Org-Bootstrap (Paket "Multi-Tenancy"): nur unter
     hasAdminRoles() — die lokale Variante und der geteilte
     window.storage-Modus kennen keine Orgs. myOrgs() ist damit ein reiner
     No-Op-Aufruf, den es unter beiden Bedingungen gar nicht erst gibt. */
  if(hasAdminRoles()){
    state.myOrgs = await myOrgs();
    state.activeOrgSlug = getActiveOrgSlug() || (state.myOrgs[0] ? state.myOrgs[0].slug : '');
    if(state.activeOrgSlug) setActiveOrgSlug(state.activeOrgSlug);
    /* SysAdmin-Instanzpanel-Sichtbarkeit: eigener whoami()-Check statt
       myOrgs()-Länge, weil ein SysAdmin ganz ohne Org-Mitgliedschaft
       dastehen kann (siehe state.instanceIsSysAdmin-Kommentar oben). */
    const who = await adminWhoami();
    state.instanceIsSysAdmin = !!(who.ok && who.isSysAdmin);
    ensureInstancePanelContainer();
  }
  await Promise.all([loadAppSettings(), loadCustomLanguagePacks(), loadCustomCheckpointTypes(), hasAdminRoles() ? loadEventsIndexForActiveOrg() : loadEventsIndex(), loadTeamRoster(), loadRiderRoster(), loadSeasonsIndex()]);
  applyAppSettings();
  await seedDemoEventIfNeeded();
  state.loading = false;
  if(state.appSettings.showSplashScreen) state.view = 'splashscreen';
  render();
  setInterval(checkStartDialog, 1000);
  startAutoBackup();
  armPersistentStorageRequest();
  startRulesEngineTick();
  initGlobalShortcuts();
  window.addEventListener('hashchange', () => { if(isBeamerRoute()) location.reload(); });
}


/* ---------------- navigation ---------------- */
function goDashboard(){
  state.view = 'dashboard';
  state.currentEvent = null;
  state.addMode = false;
  state.editingId = null;
  stopRiderPolling();
  render();
}
async function openEditor(id){
  flushPendingSave();
  state.loading = true; state.view = 'editor'; render();
  const evt = await loadEvent(id);
  state.currentEvent = withEventDefaults(evt || {id, name:t('common.unnamedEvent'), date:'', checkpoints:[]});
  state.actionUndoHandlers = {};
  state.cpBulkSelectedIds = [];
  state.geoImportLayers = []; // "temporär" imported geo layers are session-only, tied to whichever event is currently open
  registerEventSounds(state.currentEvent);
  state.loading = false;
  startRiderPolling();
  render();
  /* Guarded on state.view, same reasoning as the sidebar-collapse/mobile-map
     invalidateSize() gotcha already documented in CLAUDE.md: this is a
     deferred macrotask, so if the user navigates away from the editor
     before it fires, initMap()'s own unconditional invalidateSize() would
     cache a 0x0 size against a display:none container — poisoning every
     later map.flyTo() with "Invalid LatLng (NaN, NaN)". This call site had
     the same unguarded structure as the ones already fixed; noticed and
     closed while investigating an unrelated map-flyTo test flake (which
     turned out to be a stale browser-tab viewport, not this). */
  setTimeout(() => {
    if(state.view !== 'editor') return;
    initMap(); initSidebarResize(); applySidebarWidth(); applyEditorSidebarCollapsed(); applyMobileMapCollapsed();
  }, 30);
}
function openOverview(){
  state.view = 'overview';
  state.overviewSettingsOpen = false;
  render();
  startOverviewTick();
}
function openManifest(){
  state.view = 'manifest';
  state.manifestSection = 'anpassen';
  state.manifestMobileDetailOpen = false;
  render();
}
function selectManifestSection(id){
  state.manifestSection = id;
  state.manifestMobileDetailOpen = true;
  render();
}
function closeManifestMobileDetail(){
  state.manifestMobileDetailOpen = false;
  render();
}
function openRiders(){
  state.view = 'riders';
  state.ridersSection = 'roster';
  state.ridersMobileDetailOpen = false;
  render();
}
function openCheckin(){
  state.view = 'checkin';
  state.checkinBibInput = '';
  state.checkinActiveBib = null;
  state.checkinNotFound = false;
  render();
  startLiveCountdown();
}
function openLeaderboard(){
  state.view = 'leaderboard';
  state.leaderboardSearch = '';
  state.leaderboardSortMode = (state.currentEvent && state.currentEvent.scoringMode === 'points') ? 'points' : 'time';
  render();
}

/* ---------------- global keyboard shortcuts ---------------- */
const NAV_SHORTCUT_KEYS = {
  '1': () => openOverview(),
  '2': () => openEditor(state.currentEvent.id),
  '3': () => openRiders(),
  '4': () => openCheckin(),
  '5': () => openLeaderboard(),
  '6': () => openManifest()
};
function isTypingTarget(el){
  if(!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
function handleGlobalEscape(){
  if(state.mapContextMenu){ hideMapContextMenu(); return true; }
  if(state.pdfPreviewOpen){ closePdfPreview(); return true; }
  if(state.socialShareOpen){ closeSocialShareCard(); return true; }
  if(state.commandPaletteOpen){ closeCommandPalette(); return true; }
  if(state.mapSearchOpen){ toggleMapSearch(false); return true; }
  if(state.addMode){ toggleAddMode(); return true; }
  return false;
}
function initGlobalShortcuts(){
  document.addEventListener('keydown', (e) => {
    if((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      toggleCommandPalette();
      return;
    }
    if(e.key === 'Escape'){
      if(handleGlobalEscape()) e.preventDefault();
      return;
    }
    if(isTypingTarget(e.target)) return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(state.racedayActive) return;
    if(!state.currentEvent || state.view === 'dashboard' || state.view === 'settings') return;
    const fn = NAV_SHORTCUT_KEYS[e.key];
    if(fn){ e.preventDefault(); fn(); }
  });
}

/* ---------------- app settings: theme + icon pack ---------------- */
const ICON_PACKS = {
  emoji: {
    label: () => t('ui.iconPackEmojiLabel'), desc: () => t('ui.iconPackEmojiDesc'), cdn: null,
    render: (key) => typeIcon(key)
  },
  fa: {
    label: () => t('ui.iconPackFaLabel'), desc: () => t('ui.iconPackFaDesc'),
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    icons: {qr: 'fa-solid fa-qrcode', photo: 'fa-solid fa-camera', item: 'fa-solid fa-box', custom: 'fa-solid fa-circle-question', challenge: 'fa-solid fa-trophy'},
    render(key){ return `<i class="${this.icons[key] || 'fa-solid fa-location-dot'}"></i>`; }
  },
  material: {
    label: () => t('ui.iconPackMaterialLabel'), desc: () => t('ui.iconPackMaterialDesc'),
    cdn: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0&display=block',
    icons: {qr: 'qr_code_2', photo: 'photo_camera', item: 'inventory_2', custom: 'help', challenge: 'emoji_events'},
    render(key){ return `<span class="material-symbols-outlined">${this.icons[key] || 'place'}</span>`; }
  }
};
function typeIconHtml(key){
  const pack = ICON_PACKS[state.appSettings.iconPack] || ICON_PACKS.emoji;
  if(pack.icons && !pack.icons[key]) return typeIcon(key);
  return pack.render(key);
}
async function loadAppSettings(){
  try{
    const res = await storageGet('app:settings');
    if(res) state.appSettings = Object.assign({theme: 'signal', iconPack: 'emoji', autoBackupEnabled: false, autoBackupIntervalMinutes: 10, autoBackupHintShown: false, offlineCacheHintShown: false, featureToggles: {}, distanceUnit: 'metric', timeFormat: '24h', coordFormat: 'decimal', showSplashScreen: true, onboardingCompleted: false}, JSON.parse(res.value));
  }catch(e){ /* keep defaults */ }
}
async function saveAppSettings(){
  await storageSet('app:settings', JSON.stringify(state.appSettings));
}
function applyAppSettings(){
  document.documentElement.setAttribute('data-theme', state.appSettings.theme);
  const pack = ICON_PACKS[state.appSettings.iconPack] || ICON_PACKS.emoji;
  const existing = document.getElementById('icon-pack-cdn');
  if(existing) existing.remove();
  if(pack.cdn){
    const link = document.createElement('link');
    link.id = 'icon-pack-cdn';
    link.rel = 'stylesheet';
    link.href = pack.cdn;
    document.head.appendChild(link);
  }
}
function setTheme(name){
  state.appSettings.theme = name;
  applyAppSettings();
  saveAppSettings();
  render();
}
function setIconPack(name){
  state.appSettings.iconPack = name;
  applyAppSettings();
  saveAppSettings();
  render();
}
function setDistanceUnit(unit){
  state.appSettings.distanceUnit = unit;
  saveAppSettings();
  render();
}
function setTimeFormat(fmt){
  state.appSettings.timeFormat = fmt;
  saveAppSettings();
  render();
}
function setCoordFormat(fmt){
  state.appSettings.coordFormat = fmt;
  saveAppSettings();
  render();
}
function openSettings(){
  if(state.view !== 'settings') state.settingsReturnView = state.view;
  state.view = 'settings';
  state.settingsMobileDetailOpen = false;
  render();
}
function closeSettings(){
  state.view = state.settingsReturnView || 'dashboard';
  render();
}
function loadSettingsSectionPref(){
  try{ return localStorage.getItem('alleycat:settingsSection'); }catch(e){ return null; }
}
function saveSettingsSectionPref(id){
  try{ localStorage.setItem('alleycat:settingsSection', id); }catch(e){}
}
function selectSettingsSection(id){
  state.settingsSection = id;
  state.settingsMobileDetailOpen = true;
  saveSettingsSectionPref(id);
  render();
}
function closeSettingsMobileDetail(){
  state.settingsMobileDetailOpen = false;
  render();
}

/* ---------------- render: root ---------------- */
function render(){
  const appEl = document.getElementById('app');
  const splashEl = document.getElementById('splashscreen-root');
  if(state.view === 'splashscreen'){
    if(appEl) appEl.style.display = 'none';
    if(splashEl){ splashEl.style.display = 'flex'; splashEl.innerHTML = renderSplashscreen(); }
    return;
  }
  if(appEl) appEl.style.display = '';
  if(splashEl) splashEl.style.display = 'none';

  applyStaticTranslations();
  renderTopbar();
  document.getElementById('view-dashboard').classList.toggle('active', state.view === 'dashboard');
  document.getElementById('view-overview').classList.toggle('active', state.view === 'overview');
  document.getElementById('view-editor').classList.toggle('active', state.view === 'editor');
  document.getElementById('view-manifest').classList.toggle('active', state.view === 'manifest');
  document.getElementById('view-riders').classList.toggle('active', state.view === 'riders');
  document.getElementById('view-checkin').classList.toggle('active', state.view === 'checkin');
  document.getElementById('view-leaderboard').classList.toggle('active', state.view === 'leaderboard');
  document.getElementById('view-settings').classList.toggle('active', state.view === 'settings');
  document.getElementById('view-league').classList.toggle('active', state.view === 'league');
  /* view-instance existiert nur unter hasAdminRoles() (siehe
     ensureInstancePanelContainer() in init()) — im lokalen Build und ohne
     Server-Accounts gibt es das Element nie, daher der Null-Check statt
     des unbedingten .classList.toggle() der anderen Views oben. */
  const instanceEl = document.getElementById('view-instance');
  if(instanceEl) instanceEl.classList.toggle('active', state.view === 'instance');

  if(state.view === 'dashboard') renderDashboard();
  if(state.view === 'overview') renderOverview();
  if(state.view === 'editor') renderSidebar();
  if(state.view === 'manifest') renderManifest();
  if(state.view === 'riders') renderRiders();
  if(state.view === 'checkin') renderCheckin();
  if(state.view === 'leaderboard') renderLeaderboard();
  if(state.view === 'settings') renderSettings();
  if(state.view === 'league') renderLeague();
  if(state.view === 'instance') renderInstancePanel();
  syncWakeLockForView();
}

function getNavItems(){
  return [
    {view: 'overview', label: t('ui.navOverview'), shortLabel: t('ui.navOverview'), onclick: () => 'openOverview()',
      icon: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'},
    {view: 'editor', label: t('ui.navMap'), shortLabel: t('ui.navMap'), onclick: evtId => `openEditor('${evtId}')`,
      icon: '<path d="M12 21s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'},
    {view: 'riders', label: t('ui.navRiders'), shortLabel: t('ui.navRiders'), onclick: () => 'openRiders()',
      icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>'},
    {view: 'checkin', label: t('ui.navCheckin'), shortLabel: t('ui.navCheckinShort'), onclick: () => 'openCheckin()',
      icon: '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>'},
    {view: 'leaderboard', label: t('ui.navLeaderboard'), shortLabel: t('ui.navLeaderboardShort'), onclick: () => 'openLeaderboard()',
      icon: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5H4.5A2.5 2.5 0 0 0 7 9.5"/><path d="M17 5h2.5A2.5 2.5 0 0 1 17 9.5"/><path d="M12 12v3.5"/><path d="M9.5 19.5h5"/><path d="M10.3 15.5h3.4l.6 4h-4.6z"/>'},
    {view: 'manifest', label: t('ui.navManifest'), shortLabel: t('ui.navManifestShort'), onclick: () => 'openManifest()',
      icon: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9.5 12.5h5"/><path d="M9.5 16h5"/>'}
  ];
}
function renderIconSidebar(navItems, evtId){
  const iconSidebar = document.getElementById('icon-sidebar');
  const navBtn = item => `
    <button class="icon-sidebar-item ${state.view === item.view ? 'active' : ''}" onclick="${item.onclick(evtId)}">
      <svg viewBox="0 0 24 24">${item.icon}</svg>
      <span>${item.shortLabel}</span>
    </button>
  `;
  iconSidebar.innerHTML = `
    <div class="icon-sidebar-mark">AC</div>
    ${navItems.map(navBtn).join('')}
    <div class="icon-sidebar-spacer"></div>
    <button class="icon-sidebar-item" onclick="openCommandPalette()" title="${t('commandPalette.shortcutHint')}">
      <span class="icon-sidebar-kbd">&#8984;K</span>
    </button>
    <button class="icon-sidebar-item" onclick="openSettings()" title="${t('settings.title')}">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span>${t('settings.title')}</span>
    </button>
  `;
}
/* Kleines Abzeichen statt eines eigenen Banner-Elements: das Template hat
   keinen dedizierten Platz dafür, und topbar-actions wird ohnehin bei
   jedem render() neu gebaut. Erscheint nur unter dem Server-Backend mit
   personalisiertem Login (hasAdminRoles() && state.adminSession) — beim
   Master-Key-Zugriff und in beiden anderen Varianten gibt es keine
   Rolle anzuzeigen. */
function renderAuthBadge(){
  if(!hasAdminRoles() || !state.adminSession) return '';
  /* Seit Multi-Tenancy kann die Rolle null sein: ein Konto, das (noch) in
     keiner Org ist, hat schlicht keine. adminRoleLabel() fängt das ab. */
  const role = currentUserRole();
  const roleLabel = adminRoleLabel(role);
  return `
    <span class="auth-badge ${role === 'viewer' ? 'auth-badge-viewer' : ''}" title="${escapeHtml(currentUserDisplayName())}">
      ${role === 'viewer' ? '👁 ' : ''}${escapeHtml(currentUserDisplayName())} · ${escapeHtml(roleLabel)}
    </span>
    <button class="btn btn-ghost" onclick="adminLogout().then(() => location.reload())">${t('auth.logoutButton')}</button>
  `;
}

/* Workspace-Dropdown (Multi-Tenancy): analog zu renderAuthBadge() nur
   unter hasAdminRoles() sichtbar, und zusätzlich nur mit mindestens einer
   Org-Mitgliedschaft — ein Konto ohne Orgs (noch nicht eingeladen) soll
   kein leeres Dropdown sehen. */
function renderWorkspaceDropdown(){
  if(!hasAdminRoles() || !(state.myOrgs || []).length) return '';
  const options = state.myOrgs.map(o =>
    `<option value="${escapeHtml(o.slug)}" ${o.slug === state.activeOrgSlug ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
  ).join('');
  return `<select class="workspace-dropdown" title="${escapeHtml(t('workspace.dropdownTitle'))}" onchange="onWorkspaceChange(this.value)">${options}</select>`;
}
async function onWorkspaceChange(slug){
  setActiveOrgSlug(slug);
  state.activeOrgSlug = slug;
  state.eventsIndex = await listEventsForActiveOrg();
  state.currentEvent = null;
  state.view = 'dashboard';
  render();
}
/* Einstiegspunkt fürs SysAdmin-Instanzpanel: nur unter hasAdminRoles()
   und nur für SysAdmins sichtbar (state.instanceIsSysAdmin, gesetzt in
   init() über adminWhoami() — nicht myOrgs()-Länge, siehe dortiger
   Kommentar). */
function renderInstancePanelButton(){
  if(!hasAdminRoles() || !state.instanceIsSysAdmin) return '';
  return `<button class="btn btn-ghost" onclick="openInstancePanel()">${t('instance.navButton')}</button>`;
}

function renderTopbar(){
  const sub = document.getElementById('topbar-sub');
  const actions = document.getElementById('topbar-actions');
  const bottomNav = document.getElementById('bottom-nav');
  const iconSidebar = document.getElementById('icon-sidebar');

  if(state.view === 'settings'){
    sub.textContent = t('settings.title');
    actions.innerHTML = `<button class="btn btn-ghost" onclick="closeSettings()">${t('settings.back')}</button>`;
    bottomNav.innerHTML = '';
    if(iconSidebar) iconSidebar.innerHTML = `<div class="icon-sidebar-mark">AC</div>`;
    return;
  }

  if(state.view === 'dashboard' || !state.currentEvent){
    sub.textContent = t('ui.headquarter');
    actions.innerHTML = `${renderWorkspaceDropdown()}${renderInstancePanelButton()}${renderAuthBadge()}`;
    bottomNav.innerHTML = '';
    if(iconSidebar) iconSidebar.innerHTML = `<div class="icon-sidebar-mark">AC</div>`;
    return;
  }

  sub.textContent = state.currentEvent.name || t('common.unnamedEvent');
  const evtId = state.currentEvent.id;
  const navItems = getNavItems();
  actions.innerHTML = `
    <button class="btn btn-ghost" onclick="goDashboard()">${t('ui.backToAllEvents')}</button>
    ${state.currentEvent.status === 'running' ? `<span class="running-hint">${t('dataSafety.keepTabOpenHint')}</span>` : ''}
    ${renderStatusControl(state.currentEvent)}
    ${renderWorkspaceDropdown()}
    ${renderAuthBadge()}
  `;
  bottomNav.innerHTML = navItems.map(item => `
    <button class="bottom-nav-item ${state.view === item.view ? 'active' : ''}" data-nav-view="${item.view}" onclick="${item.onclick(evtId)}">
      <svg viewBox="0 0 24 24">${item.icon}</svg>
      <span>${item.shortLabel}</span>
    </button>
  `).join('');
  if(iconSidebar) renderIconSidebar(navItems, evtId);
}


/* ---------------- render: settings ---------------- */
const THEMES = {
  signal: {label: () => t('settings.themeSignalLabel'), desc: () => t('settings.themeSignalDesc'), swatch: ['#0e1113', '#f5f2ec', '#f4762a', '#e05540']},
  feldpost: {label: () => t('settings.themeFeldpostLabel'), desc: () => t('settings.themeFeldpostDesc'), swatch: ['#17191a', '#eee5cd', '#ff5f1f', '#b23a2e']},
  hell: {label: () => t('settings.themeHellLabel'), desc: () => t('settings.themeHellDesc'), swatch: ['#f4f1ea', '#fffdf7', '#e0551c', '#b23a2e']},
  dunkel: {label: () => t('settings.themeDunkelLabel'), desc: () => t('settings.themeDunkelDesc'), swatch: ['#121212', '#1e1e1e', '#5b8cff', '#e05a4e']},
  dracula: {label: () => t('settings.themeDraculaLabel'), desc: () => t('settings.themeDraculaDesc'), swatch: ['#282a36', '#2b2d3a', '#ff79c6', '#bd93f9']},
  outdoor: {label: () => t('settings.themeOutdoorLabel'), desc: () => t('settings.themeOutdoorDesc'), swatch: ['#ffffff', '#000000', '#ffcc00', '#b30000']}
};
/* Sidebar-Navigation (Paket 9): Gruppen+Reihenfolge fest, keine Registrierung
   von außen nötig (anders als FEATURE_REGISTRY) — es gibt hier nur die 7
   fest verdrahteten Settings-Screens, kein dynamisches Hinzufügen. label()
   als Funktion (nicht als am Modul-Ladezeitpunkt ausgewerteter String) aus
   demselben Grund wie bei FEATURE_REGISTRY-Einträgen: ein später geladenes
   Community-Sprachpaket muss den Text bei jedem render() neu übersetzen. */
const SETTINGS_NAV_GROUPS = [
  {id: 'general', label: () => t('settings.groupGeneral'), items: [
    {id: 'features', icon: '🧩', label: () => t('settings.navFeatures')},
    {id: 'theme', icon: '🎨', label: () => t('settings.navTheme')},
    {id: 'iconpack', icon: '🖼', label: () => t('settings.navIconPack')},
    {id: 'language', icon: '🌐', label: () => t('settings.navLanguage')},
    {id: 'units', icon: '📏', label: () => t('settings.navUnits')}
  ]},
  {id: 'event', label: () => t('settings.groupEvent'), items: [
    {id: 'checkpointTypes', icon: '📍', label: () => t('settings.navCheckpointTypes')}
  ]},
  {id: 'league', label: () => t('league.settingsGroupLabel'), items: [
    {id: 'teamRoster', icon: '🏳', label: () => t('league.navTeamRoster')},
    {id: 'riderRoster', icon: '🚴', label: () => t('league.navRiderRoster')}
  ]},
  {id: 'data', label: () => t('settings.groupData'), items: [
    {id: 'dataSafety', icon: '💾', label: () => t('settings.navDataSafety')}
  ]},
  {id: 'help', label: () => t('settings.groupHelp'), items: [
    {id: 'documentation', icon: '📖', label: () => t('settings.navDocumentation')}
  ]},
  /* Nur sichtbar für Rolle 'admin' (renderSettingsSidebar() filtert),
     nur relevant unter hasAdminRoles() — ohne Server-Backend gibt es
     nichts zu verwalten. Als eigene Gruppe statt Item unter 'data', weil
     Betrachter/Editor diese Gruppe nie zu Gesicht bekommen sollen, auch
     nicht als deaktivierten Eintrag. */
  {id: 'account', label: () => t('settings.groupAccount'), items: [
    {id: 'users', icon: '👤', label: () => t('auth.navUsers')}
  ]},
  /* Organisation (Multi-Tenancy): eigene Gruppe statt Item unter 'account'
     — die Sichtbarkeit hängt an Org-Mitgliedschaft (state.myOrgs), nicht
     an der Geräte-Rolle manageUsers, die 'account' oben gate. Ein Editor
     ohne Benutzerverwaltungsrechte soll seine eigene Org trotzdem sehen
     können. */
  {id: 'organization', label: () => t('settings.groupOrganization'), items: [
    {id: 'orgSettings', icon: '🏢', label: () => t('settings.navOrganization')}
  ]}
];
function settingsNavItem(id){
  for(const group of SETTINGS_NAV_GROUPS){
    const item = group.items.find(i => i.id === id);
    if(item) return item;
  }
  return null;
}
function renderSettingsSidebar(){
  return `
    <nav class="settings-sidebar">
      <div class="settings-sidebar-head">
        <h2>${t('settings.title')}</h2>
        <p>${t('settings.intro')}</p>
      </div>
      ${SETTINGS_NAV_GROUPS.filter(group => group.id !== 'account' || (hasAdminRoles() && currentUserCan('manageUsers')))
        .filter(group => group.id !== 'organization' || (hasAdminRoles() && (state.myOrgs || []).length))
        .filter(group => group.id !== 'league' || isFeatureEnabled('seasons_league')).map(group => `
        <div class="settings-nav-group">
          <div class="settings-nav-group-label">${group.label()}</div>
          ${group.items.map(item => `
            <button type="button" class="settings-nav-item ${state.settingsSection === item.id ? 'active' : ''}" onclick="selectSettingsSection('${item.id}')">
              <span class="settings-nav-icon">${item.icon}</span>
              <span>${item.label()}</span>
            </button>
          `).join('')}
        </div>
      `).join('')}
    </nav>
  `;
}
function renderSettingsSectionTheme(){
  const themeCards = Object.entries(THEMES).map(([key, th]) => `
    <button class="option-card ${state.appSettings.theme === key ? 'active' : ''}" onclick="setTheme('${key}')">
      <span class="option-swatch">${th.swatch.map(c => `<span style="background:${c}"></span>`).join('')}</span>
      <span class="option-card-label">${th.label()}</span>
      <span class="option-card-desc">${th.desc()}</span>
    </button>
  `).join('');
  const splashEnabled = state.appSettings.showSplashScreen !== false;
  return `
    <div class="settings-section">
      <h3>${t('settings.themeHeading')}</h3>
      <div class="settings-section-desc">${t('settings.themeDesc')}</div>
      <div class="option-grid">${themeCards}</div>
      <div class="settings-subheading">${t('settings.splashscreenSubheading')}</div>
      <div class="data-safety-row">
        <label class="toggle-switch">
          <input type="checkbox" ${splashEnabled ? 'checked' : ''} onchange="onShowSplashScreenChange(this.checked)">
          <span class="toggle-switch-track"></span>
        </label>
        <span>${t('settings.splashscreenToggleLabel')}</span>
      </div>
      <div style="margin-top:12px;">
        <button type="button" class="btn btn-sm" onclick="startOnboardingTour()">${t('settings.onboardingRestartButton')}</button>
      </div>
    </div>
  `;
}
function onShowSplashScreenChange(checked){
  state.appSettings.showSplashScreen = !!checked;
  saveAppSettings();
  render();
}
function renderSettingsSectionIconPack(){
  const iconCards = Object.entries(ICON_PACKS).map(([key, p]) => `
    <button class="option-card ${state.appSettings.iconPack === key ? 'active' : ''}" onclick="setIconPack('${key}')">
      <span class="icon-preview-row">${['qr', 'photo', 'item', 'custom', 'challenge'].map(k => p.render(k)).join('')}</span>
      <span class="option-card-label">${p.label()}</span>
      <span class="option-card-desc">${p.desc()}</span>
    </button>
  `).join('');
  return `
    <div class="settings-section">
      <h3>${t('settings.iconPackHeading')}</h3>
      <div class="settings-section-desc">${t('settings.iconPackDesc')}</div>
      <div class="option-grid">${iconCards}</div>
    </div>
  `;
}
function renderSettingsSectionLanguage(){
  return `
    <div class="settings-section">
      <h3>${t('settings.languageHeading')}</h3>
      <div class="settings-section-desc">${t('settings.languageDesc')}</div>
      <div class="option-grid">
        ${availableLanguages().map(code => `
          <button class="option-card ${getCurrentLanguage() === code ? 'active' : ''}" onclick="setLanguage('${code}')">
            <span class="option-card-label">${escapeHtml(languagePackDisplayName(code))}</span>
            ${!BUILTIN_LANGS.includes(code) ? `<span class="option-card-desc">${t('settings.languagePackCustomBadge')}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        <input type="file" id="import-language-pack-file" accept="application/json,.json" style="display:none;" onchange="onLanguagePackFileChange(this)">
        <button class="btn btn-sm" onclick="document.getElementById('import-language-pack-file').click()">${t('settings.languagePackImport')}</button>
        <button class="btn btn-sm" onclick="exportLanguagePackTemplate()">${t('settings.languagePackExportTemplate')}</button>
      </div>
      ${availableLanguages().filter(c => !BUILTIN_LANGS.includes(c)).length ? `
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">
          ${availableLanguages().filter(c => !BUILTIN_LANGS.includes(c)).map(code => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <span class="settings-hint">${escapeHtml(languagePackDisplayName(code))} (${code})</span>
              <button type="button" class="cp-icon-btn" onclick="deleteLanguagePack('${code}')" title="${t('common.delete')}" aria-label="${t('common.delete')}">🗑</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}
function renderSettingsSectionUnits(){
  return `
    <div class="settings-section">
      <h3>${t('settings.unitsHeading')}</h3>
      <div class="settings-section-desc">${t('settings.unitsDesc')}</div>
      <div class="settings-subheading">${t('settings.unitsDistanceSubheading')}</div>
      <div class="option-grid">
        <button class="option-card ${state.appSettings.distanceUnit !== 'imperial' ? 'active' : ''}" onclick="setDistanceUnit('metric')">
          <span class="option-card-label">${t('settings.unitsMetricLabel')}</span>
          <span class="option-card-desc">${t('settings.unitsMetricDesc')}</span>
        </button>
        <button class="option-card ${state.appSettings.distanceUnit === 'imperial' ? 'active' : ''}" onclick="setDistanceUnit('imperial')">
          <span class="option-card-label">${t('settings.unitsImperialLabel')}</span>
          <span class="option-card-desc">${t('settings.unitsImperialDesc')}</span>
        </button>
      </div>
      <div class="settings-subheading">${t('settings.unitsTimeSubheading')}</div>
      <div class="option-grid">
        <button class="option-card ${state.appSettings.timeFormat !== '12h' ? 'active' : ''}" onclick="setTimeFormat('24h')">
          <span class="option-card-label">${t('settings.timeFormat24hLabel')}</span>
          <span class="option-card-desc">${t('settings.timeFormat24hDesc')}</span>
        </button>
        <button class="option-card ${state.appSettings.timeFormat === '12h' ? 'active' : ''}" onclick="setTimeFormat('12h')">
          <span class="option-card-label">${t('settings.timeFormat12hLabel')}</span>
          <span class="option-card-desc">${t('settings.timeFormat12hDesc')}</span>
        </button>
      </div>
      <div class="settings-subheading">${t('settings.unitsCoordSubheading')}</div>
      <div class="option-grid">
        ${['decimal', 'dms', 'utm', 'mgrs'].map(fmt => `
          <button class="option-card ${(state.appSettings.coordFormat || 'decimal') === fmt ? 'active' : ''}" onclick="setCoordFormat('${fmt}')">
            <span class="option-card-label">${t('settings.coordFormat' + fmt.charAt(0).toUpperCase() + fmt.slice(1) + 'Label')}</span>
            <span class="option-card-desc">${formatCoordinatesAs(fmt, 50.9375, 6.9603)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}
function renderSettingsSectionCheckpointTypes(){
  const typeRows = getCheckpointTypes().map(ct => {
    const isBuiltin = BUILTIN_CHECKPOINT_TYPE_KEYS.includes(ct.key);
    const meta = ct.isScored ? t('settings.scoredMeta', {max: ct.scoreMax}) : ct.hasCustomQuestion ? t('settings.customQuestionMeta') : t('settings.checkboxMeta');
    return `
      <div class="type-row">
        <span class="type-icon">${typeIconHtml(ct.key)}</span>
        <div class="type-info">
          <div class="type-name">${escapeHtml(ct.fullLabel)}</div>
          <div class="type-meta">${escapeHtml(ct.shortLabel)} &middot; ${meta}</div>
        </div>
        ${isBuiltin
          ? `<span class="type-badge">${t('settings.builtinBadge')}</span>`
          : `<button class="btn btn-sm btn-danger" onclick="deleteCustomCheckpointType('${ct.key}')">${t('common.delete')}</button>`}
      </div>
    `;
  }).join('');
  const newTypeForm = state.newTypeFormOpen ? `
    <div class="settings-form">
      <div class="row2">
        <div>
          <label>${t('settings.iconLabel')}</label>
          <input type="text" id="newtype-icon" class="icon-input" maxlength="4" value="📍">
        </div>
        <div>
          <label>${t('settings.shortNameLabel')}</label>
          <input type="text" id="newtype-short" maxlength="14" placeholder="${t('settings.shortNamePlaceholder')}">
        </div>
      </div>
      <div>
        <label>${t('settings.nameLabel')}</label>
        <input type="text" id="newtype-label" placeholder="${t('settings.namePlaceholder')}">
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="newtype-question">
        ${t('settings.hasQuestionCheckbox')}
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="newtype-scored" onchange="document.getElementById('newtype-scoremax-row').style.display = this.checked ? 'block' : 'none';">
        ${t('settings.isScoredCheckbox')}
      </label>
      <div id="newtype-scoremax-row" style="display:none;">
        <label>${t('settings.maxScoreLabel')}</label>
        <input type="number" id="newtype-scoremax" value="10" min="1" max="999">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addCustomCheckpointType()">${t('settings.createType')}</button>
        <button class="btn btn-ghost" onclick="toggleNewTypeForm()">${t('common.cancel')}</button>
      </div>
    </div>
  ` : `<button class="btn" onclick="toggleNewTypeForm()">${t('settings.newType')}</button>`;
  return `
    <div class="settings-section">
      <h3>${t('settings.checkpointTypesHeading')}</h3>
      <div class="settings-section-desc">${t('settings.checkpointTypesDesc')}</div>
      <div class="type-list">${typeRows}</div>
      ${newTypeForm}
    </div>
  `;
}
function settingsSectionContent(id){
  switch(id){
    case 'theme': return renderSettingsSectionTheme();
    case 'iconpack': return renderSettingsSectionIconPack();
    case 'language': return renderSettingsSectionLanguage();
    case 'units': return renderSettingsSectionUnits();
    case 'checkpointTypes': return renderSettingsSectionCheckpointTypes();
    case 'teamRoster': return renderSettingsSectionTeamRoster();
    case 'riderRoster': return renderSettingsSectionRiderRoster();
    case 'dataSafety': return renderDataSafetySection();
    case 'documentation': return renderDocumentationSection();
    case 'users': return renderSettingsSectionUsers();
    case 'orgSettings': return renderOrganizationSettingsSection();
    case 'features':
    default: return renderFeatureRegistrySection();
  }
}
/* ---------------- Benutzerverwaltung ---------------- */
async function loadAdminUsersIfNeeded(force){
  if(state.adminUsersList && !force) return;
  const res = await adminListUsers();
  state.adminUsersError = res.ok ? '' : (res.error || 'error');
  state.adminUsersList = res.ok ? res.users : [];
  if(state.settingsSection === 'users') renderSettings();
}
function toggleAddUserForm(){
  state.adminUsersEditingId = state.adminUsersEditingId === 'new' ? null : 'new';
  renderSettings();
}
async function submitNewUser(){
  const username = (document.getElementById('newuser-username').value || '').trim();
  const password = document.getElementById('newuser-password').value || '';
  const displayName = (document.getElementById('newuser-displayname').value || '').trim();
  const role = document.getElementById('newuser-role').value;
  if(!username || password.length < 8){ alert(t('auth.usersDesc')); return; }
  const res = await adminCreateUser({username, password, displayName, role});
  if(!res.ok){
    alert(res.error === 'username_taken' ? t('auth.usersUsernameTaken') : t('checkpointScan.errGeneric'));
    return;
  }
  state.adminUsersEditingId = null;
  await loadAdminUsersIfNeeded(true);
}
async function updateUserRole(id, role){
  const res = await adminUpdateUser({id, role});
  if(!res.ok && res.error === 'last_admin') alert(t('auth.usersLastAdminError'));
  await loadAdminUsersIfNeeded(true);
}
async function toggleUserActive(id, active){
  const res = await adminUpdateUser({id, active});
  if(!res.ok && res.error === 'last_admin') alert(t('auth.usersLastAdminError'));
  await loadAdminUsersIfNeeded(true);
}
async function resetUserPasswordPrompt(id, username){
  const password = prompt(t('auth.usersResetPasswordButton') + ' — ' + username);
  if(password === null) return;
  if(!validatePasswordStrength(password).valid){ alert(t('auth.passwordHintMinLength', {min: PASSWORD_MIN_LENGTH})); return; }
  await adminUpdateUser({id, password});
  alert(t('auth.usersSaveButton'));
}
/* ---------------- Passwort-Reset-Code / Überall abmelden (Feature-Registry) ---------------- */
async function createResetCodeForUser(id){
  const res = await createResetCode(id);
  if(!res.ok){ alert(t('auth.resetCodeErrorGeneric')); return; }
  /* Wie inviteJustCreated: der Klartext-Code ist danach nirgendwo mehr
     abrufbar (der Server speichert nur den Hash), deshalb bis zum
     nächsten Neuladen/Schließen im UI-State gehalten. */
  state.resetCodeJustCreated = {userId: id, code: res.code, expiresAt: res.expiresAt};
  renderSettings();
}
function copyResetCode(code){
  if(!navigator.clipboard || !navigator.clipboard.writeText) return;
  navigator.clipboard.writeText(code).then(() => showToast({message: t('auth.inviteCopiedToast')})).catch(() => {});
}
async function logoutAllSessionsForUser(id, username){
  if(!confirm(t('auth.usersLogoutAllConfirm', {username}))) return;
  await logoutAllSessions(id);
  showToast({message: t('auth.usersLogoutAllDoneToast')});
}
/* ---------------- Suche/Filter/Sortierung + Bulk-Aktionen (Feature-Registry) ---------------- */
function onUserListSearchInput(value){ state.userListSearch = value; renderSettings(); }
function onUserListRoleFilterChange(value){ state.userListRoleFilter = value; renderSettings(); }
function onUserListSortByChange(value){ state.userListSortBy = value; renderSettings(); }
function filteredSortedUsers(){
  const users = state.adminUsersList || [];
  const q = (state.userListSearch || '').trim().toLowerCase();
  let list = users.filter(u =>
    (!q || u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)) &&
    (!state.userListRoleFilter || u.role === state.userListRoleFilter)
  );
  const sortBy = state.userListSortBy || 'username';
  list = list.slice().sort((a, b) => {
    if(sortBy === 'lastSeenAt') return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
    if(sortBy === 'role') return a.role.localeCompare(b.role);
    return a.username.localeCompare(b.username);
  });
  return list;
}
function toggleUserBulkSelected(id, checked){
  const ids = new Set(state.userBulkSelectedIds);
  if(checked) ids.add(id); else ids.delete(id);
  state.userBulkSelectedIds = [...ids];
  renderSettings();
}
async function applyBulkRoleChange(){
  const role = document.getElementById('user-bulk-role').value;
  for(const id of state.userBulkSelectedIds) await adminUpdateUser({id, role});
  state.userBulkSelectedIds = [];
  await loadAdminUsersIfNeeded(true);
}
async function applyBulkActiveChange(active){
  for(const id of state.userBulkSelectedIds) await adminUpdateUser({id, active});
  state.userBulkSelectedIds = [];
  await loadAdminUsersIfNeeded(true);
}
/* ---------------- CSV-Export der Userliste (Feature-Registry) ---------------- */
function exportUsersCSV(){
  const header = [t('auth.usersUsernameLabel'), t('auth.usersDisplayNameLabel'), t('auth.usersRoleLabel'), t('auth.usersActiveLabel'), t('auth.usersLastSeen')];
  const lines = [header.map(csvEscape).join(';')];
  filteredSortedUsers().forEach(u => {
    lines.push([u.username, u.displayName || '', adminRoleLabel(u.role), u.active ? 'x' : '', u.lastSeenAt || ''].map(csvEscape).join(';'));
  });
  downloadBlob(new Blob([lines.join('\n')], {type: 'text/csv;charset=utf-8'}), 'alleycat-benutzer.csv');
}
/* ---------------- Audit-Log (Feature-Registry) ---------------- */
async function loadAuditLogIfNeeded(force){
  if(state.auditLogList && !force) return;
  const res = await listAuditLog();
  state.auditLogList = (res && res.ok) ? res.entries : [];
  if(state.settingsSection === 'users') renderSettings();
}
function renderAuditLogSection(){
  if(!isFeatureEnabled('user_audit_log')) return '';
  const entries = state.auditLogList || [];
  const rows = entries.map(e => `
    <div style="display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--asphalt-3); font-size:12px; flex-wrap:wrap;">
      <span style="color:var(--steel); font-family:monospace;">${escapeHtml(e.at)}</span>
      <strong>${escapeHtml(e.actorUsername || '—')}</strong>
      <span>${escapeHtml(e.action)}</span>
      ${e.targetUsername ? `<span style="color:var(--steel);">→ ${escapeHtml(e.targetUsername)}</span>` : ''}
      ${e.detail ? `<span style="color:var(--steel);">(${escapeHtml(e.detail)})</span>` : ''}
    </div>
  `).join('');
  return `
    <div class="settings-section" style="margin-top:24px;">
      <h3>${t('auth.auditLogHeading')}</h3>
      <div class="settings-section-desc">${t('auth.auditLogDesc')}</div>
      ${rows || `<div class="settings-section-desc">${t('auth.auditLogEmpty')}</div>`}
    </div>
  `;
}
async function deleteUserRow(id, username){
  if(!confirm(t('auth.usersDeleteConfirm', {username}))) return;
  const res = await adminDeleteUser(id);
  if(!res.ok && res.error === 'last_admin') alert(t('auth.usersLastAdminError'));
  await loadAdminUsersIfNeeded(true);
}
/* ---------------- Einladungscodes ---------------- */
async function loadInviteCodesIfNeeded(force){
  if(state.inviteList && !force) return;
  const res = await listInviteCodes();
  state.inviteError = (res && res.ok) ? '' : ((res && res.error) || 'error');
  state.inviteList = (res && res.ok) ? res.invites : [];
  if(state.settingsSection === 'users') renderSettings();
}
function toggleInviteCreateForm(){
  state.inviteFormOpen = !state.inviteFormOpen;
  state.inviteJustCreated = null;
  renderSettings();
}
async function submitCreateInviteCode(){
  const role = document.getElementById('newinvite-role').value;
  const expiresAt = document.getElementById('newinvite-expires').value;
  const count = parseInt(document.getElementById('newinvite-count').value, 10) || 1;
  const note = (document.getElementById('newinvite-note').value || '').trim();
  if(!expiresAt){ alert(t('auth.inviteErrorExpiresRequired')); return; }
  const res = await createInviteCode({role, expiresAt: new Date(expiresAt).toISOString(), count, note});
  if(!res.ok){ alert(t('auth.inviteErrorGeneric')); return; }
  /* Die Klartext-Codes sind ab jetzt nirgendwo sonst mehr abrufbar
     (auth.php speichert nur den Hash) — deshalb hier im UI-State
     zwischengehalten, bis der Admin sie kopiert oder als PDF exportiert
     hat, statt sie nach dem Schließen des Formulars zu verlieren. */
  state.inviteJustCreated = res.codes.map(code => ({code, role, expiresAt}));
  state.inviteFormOpen = false;
  await loadInviteCodesIfNeeded(true);
}
function copyInviteCode(code){
  if(!navigator.clipboard || !navigator.clipboard.writeText) return;
  navigator.clipboard.writeText(code).then(() => showToast({message: t('auth.inviteCopiedToast')})).catch(() => {});
}
async function revokeInviteCodeRow(id){
  if(!confirm(t('auth.inviteRevokeConfirm'))) return;
  await revokeInviteCode(id);
  await loadInviteCodesIfNeeded(true);
}
function inviteStatusBadgeHtml(status){
  const map = {
    open: {label: t('auth.inviteStatusOpen'), color: 'var(--hivis)'},
    used: {label: t('auth.inviteStatusUsed'), color: '#3a9a5c'},
    expired: {label: t('auth.inviteStatusExpired'), color: 'var(--steel)'}
  };
  const s = map[status] || map.expired;
  return `<span style="color:${s.color}; font-size:11px; text-transform:uppercase; letter-spacing:0.04em;">${s.label}</span>`;
}
function renderInviteCodesSection(){
  const invites = state.inviteList || [];
  const createdBlock = state.inviteJustCreated ? `
    <div style="border:1px solid var(--hivis); border-radius:4px; padding:12px 14px; margin-bottom:14px; background:var(--asphalt);">
      <div style="color:var(--steel); font-size:11.5px; margin-bottom:8px;">${t('auth.inviteJustCreatedHint')}</div>
      ${state.inviteJustCreated.map(c => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; font-family:monospace;">
          <strong style="letter-spacing:0.06em;">${escapeHtml(c.code)}</strong>
          <button class="btn btn-ghost btn-sm" onclick="copyInviteCode('${c.code}')">${t('common.copy')}</button>
        </div>
      `).join('')}
      <button class="btn btn-sm" style="margin-top:8px;" onclick="exportInviteCardsPDF(state.inviteJustCreated)">${t('auth.inviteExportCardsButton')}</button>
    </div>
  ` : '';
  const createForm = state.inviteFormOpen ? `
    <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:14px;">
      <div class="rider-field"><label>${t('auth.usersRoleLabel')}</label>
        <select id="newinvite-role">${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}">${escapeHtml(adminRoleLabel(r))}</option>`).join('')}</select>
      </div>
      <div class="rider-field"><label>${t('auth.inviteExpiresLabel')}</label><input type="datetime-local" id="newinvite-expires" value="${isFeatureEnabled('invite_default_expiry') ? toLocalDateTimeInputValue(new Date(Date.now() + 7 * 86400000)) : ''}"></div>
      <div class="rider-field"><label>${t('auth.inviteCountLabel')}</label><input type="number" id="newinvite-count" value="1" min="1" max="50"></div>
      <div class="rider-field"><label>${t('auth.inviteNoteLabel')}</label><input type="text" id="newinvite-note" placeholder="${t('auth.inviteNotePlaceholder')}"></div>
      <button class="btn btn-primary" onclick="submitCreateInviteCode()">${t('auth.inviteCreateButton')}</button>
    </div>
  ` : '';
  const rows = invites.map(i => `
    <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:10px 14px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong>${escapeHtml(adminRoleLabel(i.role))}</strong>
        ${i.note ? `<span style="color:var(--steel); font-size:12px;">${escapeHtml(i.note)}</span>` : ''}
        <span style="margin-left:auto;">${inviteStatusBadgeHtml(i.status)}</span>
        ${i.status === 'open' ? `<button class="btn btn-ghost btn-sm" onclick="revokeInviteCodeRow(${i.id})">${t('auth.inviteRevokeButton')}</button>` : ''}
      </div>
      <div style="color:var(--steel); font-size:11px; margin-top:4px;">
        ${t('auth.inviteExpiresLabel')}: ${escapeHtml(i.expiresAt)}
        ${i.usedByUsername ? ` · ${t('auth.inviteUsedByLabel')}: ${escapeHtml(i.usedByUsername)}` : ''}
      </div>
    </div>
  `).join('');
  return `
    <div class="settings-section" style="margin-top:24px;">
      <h3>${t('auth.inviteHeading')}</h3>
      <div class="settings-section-desc">${t('auth.inviteDesc')}</div>
      ${state.inviteError ? `<div class="rider-note rider-note-error">${escapeHtml(state.inviteError)}</div>` : ''}
      ${createdBlock}
      <button class="btn btn-primary" style="margin:12px 0;" onclick="toggleInviteCreateForm()">${t('auth.inviteCreateButton')}</button>
      ${createForm}
      ${rows || `<div class="settings-section-desc">${t('auth.inviteEmpty')}</div>`}
    </div>
  `;
}
function toggleAssignForUser(id){
  state.adminAssignEditingId = state.adminAssignEditingId === id ? null : id;
  if(state.adminAssignEditingId && state.currentEvent){
    adminGetCheckpointStaff(state.currentEvent.publicId || '').then(res => {
      state.adminAssignCache = res.ok ? res.assignments : [];
      renderSettings();
    });
  }
  renderSettings();
}
async function saveAssignForUser(id){
  const evt = state.currentEvent;
  if(!evt || !evt.publicId) return;
  const checked = [...document.querySelectorAll(`.admin-assign-cp[data-user="${id}"]:checked`)].map(el => el.value);
  await adminSetCheckpointStaff(id, evt.publicId, checked);
  state.adminAssignEditingId = null;
  renderSettings();
}
/* 'captain' statt 'admin': authValidRole() in auth.php akzeptiert seit
   Multi-Tenancy nur noch die vier Org-Rollennamen — ein Formular, das
   'admin' schickt, bekäme ein 400 invalid_role zurück. Damit ist dieses
   Set identisch zu ORG_ROLE_OPTIONS weiter unten; beide bleiben trotzdem
   getrennt, weil sie verschiedene Endpunkte bedienen (Konten- vs.
   Org-Mitgliederverwaltung) und getrennt driften dürfen. */
const ADMIN_ROLE_OPTIONS = ['captain', 'editor', 'viewer', 'checkpoint_staff'];
function adminRoleLabel(role){
  if(!role) return t('auth.roleUnknown');
  return t('auth.role' + role.charAt(0).toUpperCase() + role.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
}
/* Fahrer-App-Adresse: steht bisher nur auf dem Einrichtungsbildschirm,
   den ein Browser mit Auto-Erkennung nie zu Gesicht bekommt. Der Wert
   liegt zusätzlich serverseitig (Storage-Key config:riderAppUrl), damit
   jedes weitere Gerät ihn mitbekommt statt still ohne Fahrer-App
   dazustehen. Schreiben geht über die Seam setRiderAppBaseUrl(). */
function renderRiderAppUrlSection(){
  if(!hasAdminRoles()) return '';
  return `
    <div class="settings-section">
      <h3>${t('phpSetup.riderAppUrlLabel')}</h3>
      <div class="settings-section-desc">${t('phpSetup.riderAppUrlHint')}</div>
      <div class="rider-field">
        <input type="text" id="settings-rider-app-url" value="${escapeHtml(riderAppBaseUrl())}" placeholder="${escapeHtml(t('phpSetup.riderAppUrlPlaceholder'))}">
      </div>
      <button class="btn btn-primary" onclick="submitRiderAppUrl()">${t('auth.usersSaveButton')}</button>
    </div>
  `;
}
async function submitRiderAppUrl(){
  const el = document.getElementById('settings-rider-app-url');
  if(!el) return;
  const url = (el.value || '').trim();
  const ok = await setRiderAppBaseUrl(url);
  showToast({message: ok ? t('featureRegistry.riderAppUrlSaved') : t('featureRegistry.riderAppUrlSaveFailed')});
  renderSettings();
}
/* SMTP-Konfiguration für Fahrer-Passwort-Reset-Mails. Instanzweit wie
   config:riderAppUrl (siehe api.php $instanceWideKeys), deshalb SysAdmin-
   only — ein Editor einer einzigen Org dürfte sonst instanzweit fremde
   SMTP-Zugangsdaten verändern.

   renderSmtpSettingsSection() ist bewusst synchron: storageGet() ist async,
   deshalb folgt die Sektion demselben Cache-dann-Re-Render-Muster wie
   state.adminUsersList/loadAdminUsersIfNeeded() weiter oben — render liest
   nur aus state.smtpSettings, das Laden passiert fire-and-forget aus
   renderSettings() heraus und stößt bei Erfolg selbst ein renderSettings()
   an. */
async function loadSmtpSettingsIfNeeded(force){
  if(state.smtpSettings && !force) return;
  const raw = await storageGet('config:smtpSettings');
  let cfg = {};
  if(raw){
    try{ cfg = JSON.parse(raw.value) || {}; }catch(e){ cfg = {}; }
  }
  state.smtpSettings = cfg;
  if(state.settingsSection === 'users') renderSettings();
}
function renderSmtpSettingsSection(){
  if(!hasAdminRoles() || !currentUserIsSysAdmin()) return '';
  const cfg = state.smtpSettings || {};
  /* Gleiche Bedingung wie smtpLoadSettings() im PHP-Backend (php-backend/
     smtp.php): fehlt host ODER fromAddress, gilt SMTP als "nicht
     konfiguriert" und rider-forgot/smtp-test funktionieren nicht.
     Zusätzlich an state.smtpSettings selbst geprüft (nicht nur cfg), damit
     die Warnung nicht kurz aufblitzt, bevor loadSmtpSettingsIfNeeded()
     überhaupt fertig geladen hat — "noch unbekannt" ist etwas anderes als
     "geladen und leer". */
  const notConfigured = !!state.smtpSettings && (!cfg.host || !cfg.fromAddress);
  return `
    <div class="settings-section">
      <h3>${t('auth.smtpHeading')}</h3>
      <div class="settings-section-desc">${t('auth.smtpDesc')}</div>
      ${notConfigured ? `<div class="data-safety-warning">${t('auth.smtpNotConfiguredWarning')}</div>` : ''}
      <div class="rider-field"><label>${t('auth.smtpHostLabel')}</label>
        <input type="text" id="smtp-host" value="${escapeHtml(cfg.host || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpPortLabel')}</label>
        <input type="number" id="smtp-port" value="${escapeHtml(String(cfg.port || 587))}"></div>
      <div class="rider-field"><label>${t('auth.smtpUsernameLabel')}</label>
        <input type="text" id="smtp-username" value="${escapeHtml(cfg.username || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpPasswordLabel')}</label>
        <input type="password" id="smtp-password" value="${escapeHtml(cfg.password || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpFromAddressLabel')}</label>
        <input type="email" id="smtp-from-address" value="${escapeHtml(cfg.fromAddress || '')}"></div>
      <div class="rider-field"><label>${t('auth.smtpFromNameLabel')}</label>
        <input type="text" id="smtp-from-name" value="${escapeHtml(cfg.fromName || '')}"></div>
      <button class="btn btn-primary" onclick="submitSmtpSettings()">${t('auth.usersSaveButton')}</button>
      <div class="rider-field" style="margin-top:12px;"><label>${t('auth.smtpTestEmailLabel')}</label>
        <input type="email" id="smtp-test-email"></div>
      <button class="btn btn-ghost" onclick="submitSmtpTest()">${t('auth.smtpTestButton')}</button>
    </div>
  `;
}
async function submitSmtpSettings(){
  const cfg = {
    host: document.getElementById('smtp-host').value.trim(),
    port: parseInt(document.getElementById('smtp-port').value, 10) || 587,
    username: document.getElementById('smtp-username').value.trim(),
    password: document.getElementById('smtp-password').value,
    fromAddress: document.getElementById('smtp-from-address').value.trim(),
    fromName: document.getElementById('smtp-from-name').value.trim()
  };
  const ok = await storageSet('config:smtpSettings', JSON.stringify(cfg));
  showToast({message: ok ? t('auth.smtpSaved') : t('auth.smtpSaveFailed')});
  if(ok){
    state.smtpSettings = cfg;
    renderSettings();
  }
}
async function submitSmtpTest(){
  const toEmail = document.getElementById('smtp-test-email').value.trim();
  /* authRequest()s zweiter Parameter ist der volle Query-String (siehe
     adminBootstrap() weiter oben: 'a=bootstrap'), nicht nur der Action-
     Name — und im Fehlerfall liegt der Code direkt unter res.error
     (siehe authRequest() in storage-server.js), es gibt kein res.data.
     Bei smtp-test liefert der Server zusätzlich res.detail — die echte
     SMTP-Fehlermeldung (falscher Host, Auth abgelehnt, TLS-Handshake
     fehlgeschlagen, ...), siehe auth.php a=smtp-test. */
  const res = await authRequest('POST', 'a=smtp-test', {toEmail});
  showToast({message: res.ok ? t('auth.smtpTestOk') : t('auth.smtpTestFailed', {error: res.detail || res.error || ''})});
}
function renderSettingsSectionUsers(){
  if(!hasAdminRoles()){
    return `<div class="settings-section"><h3>${t('auth.usersHeading')}</h3><div class="settings-section-desc">${t('auth.usersDesc')}</div></div>`;
  }
  const listToolsOn = isFeatureEnabled('user_list_tools');
  const bulkOn = isFeatureEnabled('user_bulk_actions');
  const users = listToolsOn ? filteredSortedUsers() : (state.adminUsersList || []);
  const rows = users.map(u => {
    const assignOpen = state.adminAssignEditingId === u.id;
    const cps = (state.currentEvent && state.currentEvent.checkpoints) || [];
    const assigned = new Set((state.adminAssignCache || []).filter(a => a.user_id == u.id).map(a => a.cp_id));
    const resetJustCreated = state.resetCodeJustCreated && state.resetCodeJustCreated.userId === u.id ? state.resetCodeJustCreated : null;
    return `
      <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          ${bulkOn ? `<input type="checkbox" onchange="toggleUserBulkSelected(${u.id}, this.checked)" ${state.userBulkSelectedIds.includes(u.id) ? 'checked' : ''}>` : ''}
          <strong>${escapeHtml(u.username)}</strong>
          <span style="color:var(--steel); font-size:12px;">${escapeHtml(u.displayName || '')}</span>
          <select onchange="updateUserRole(${u.id}, this.value)" style="margin-left:auto;">
            ${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${escapeHtml(adminRoleLabel(r))}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" onclick="toggleUserActive(${u.id}, ${!u.active})">${u.active ? t('auth.usersDeactivateButton') : t('auth.usersActivateButton')}</button>
          <button class="btn btn-ghost" onclick="resetUserPasswordPrompt(${u.id}, '${escapeHtml(u.username)}')">${t('auth.usersResetPasswordButton')}</button>
          ${isFeatureEnabled('user_password_reset') ? `<button class="btn btn-ghost" onclick="createResetCodeForUser(${u.id})">${t('auth.resetCodeCreateButton')}</button>` : ''}
          ${isFeatureEnabled('user_logout_all_sessions') ? `<button class="btn btn-ghost" onclick="logoutAllSessionsForUser(${u.id}, '${escapeHtml(u.username)}')">${t('auth.usersLogoutAllButton')}</button>` : ''}
          <button class="btn btn-ghost" onclick="deleteUserRow(${u.id}, '${escapeHtml(u.username)}')">${t('auth.usersDeleteButton')}</button>
        </div>
        <div style="color:var(--steel); font-size:11px; margin-top:4px;">${t('auth.usersLastSeen')}: ${u.lastSeenAt ? escapeHtml(u.lastSeenAt) : t('auth.usersLastSeenNever')}${u.active ? '' : ' · ' + t('auth.usersActiveLabel') + ': ✕'}</div>
        ${resetJustCreated ? `
          <div style="border:1px solid var(--hivis); border-radius:4px; padding:8px 10px; margin-top:8px; background:var(--asphalt); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="color:var(--steel); font-size:11.5px;">${t('auth.resetCodeJustCreatedHint')}</span>
            <strong style="font-family:monospace; letter-spacing:0.06em;">${escapeHtml(resetJustCreated.code)}</strong>
            <button class="btn btn-ghost btn-sm" onclick="copyResetCode('${resetJustCreated.code}')">${t('common.copy')}</button>
          </div>
        ` : ''}
        ${u.role === 'checkpoint_staff' ? `
          <div style="margin-top:8px;">
            <button class="btn btn-ghost" onclick="toggleAssignForUser(${u.id})">${t('auth.usersCheckpointAssignHeading')}</button>
            ${assignOpen ? (
              !state.currentEvent ? `<div class="settings-section-desc">${t('auth.usersCheckpointAssignNoEvent')}</div>` : `
              <div style="margin-top:8px; padding:10px; background:var(--asphalt); border-radius:4px;">
                <div class="settings-section-desc">${t('auth.usersCheckpointAssignHint')}</div>
                ${cps.map(cp => `
                  <label style="display:block; margin:4px 0;">
                    <input type="checkbox" class="admin-assign-cp" data-user="${u.id}" value="${escapeHtml(cp.id)}" ${assigned.has(cp.id) ? 'checked' : ''}>
                    ${escapeHtml(cp.name || cp.id)}
                  </label>
                `).join('')}
                <button class="btn btn-primary" style="margin-top:8px;" onclick="saveAssignForUser(${u.id})">${t('auth.usersSaveButton')}</button>
              </div>
            `) : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  const addForm = state.adminUsersEditingId === 'new' ? `
    <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:14px;">
      <div class="rider-field"><label>${t('auth.usersUsernameLabel')}</label><input type="text" id="newuser-username"></div>
      <div class="rider-field"><label>${t('auth.usersPasswordLabel')}</label><input type="password" id="newuser-password"></div>
      <div class="rider-field"><label>${t('auth.usersDisplayNameLabel')}</label><input type="text" id="newuser-displayname"></div>
      <div class="rider-field"><label>${t('auth.usersRoleLabel')}</label>
        <select id="newuser-role">${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}">${escapeHtml(adminRoleLabel(r))}</option>`).join('')}</select>
      </div>
      <button class="btn btn-primary" onclick="submitNewUser()">${t('auth.usersSaveButton')}</button>
    </div>
  ` : '';

  const listToolsBar = listToolsOn ? `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
      <input type="text" placeholder="${t('auth.usersSearchPlaceholder')}" value="${escapeHtml(state.userListSearch || '')}" oninput="onUserListSearchInput(this.value)" style="flex:1; min-width:160px;">
      <select onchange="onUserListRoleFilterChange(this.value)">
        <option value="">${t('auth.usersFilterAllRoles')}</option>
        ${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}" ${state.userListRoleFilter === r ? 'selected' : ''}>${escapeHtml(adminRoleLabel(r))}</option>`).join('')}
      </select>
      <select onchange="onUserListSortByChange(this.value)">
        <option value="username" ${state.userListSortBy === 'username' ? 'selected' : ''}>${t('auth.usersSortUsername')}</option>
        <option value="role" ${state.userListSortBy === 'role' ? 'selected' : ''}>${t('auth.usersSortRole')}</option>
        <option value="lastSeenAt" ${state.userListSortBy === 'lastSeenAt' ? 'selected' : ''}>${t('auth.usersSortLastSeen')}</option>
      </select>
    </div>
  ` : '';
  const bulkBar = (bulkOn && state.userBulkSelectedIds.length) ? `
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px; padding:8px 10px; background:var(--asphalt); border-radius:4px;">
      <span style="font-size:12px;">${t('auth.usersBulkSelectedCount', {count: state.userBulkSelectedIds.length})}</span>
      <select id="user-bulk-role">${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}">${escapeHtml(adminRoleLabel(r))}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" onclick="applyBulkRoleChange()">${t('auth.usersBulkApplyRole')}</button>
      <button class="btn btn-ghost btn-sm" onclick="applyBulkActiveChange(false)">${t('auth.usersDeactivateButton')}</button>
      <button class="btn btn-ghost btn-sm" onclick="applyBulkActiveChange(true)">${t('auth.usersActivateButton')}</button>
    </div>
  ` : '';
  return `
    <div class="settings-section" id="users-features-section">
      <h3>${t('featureRegistry.groupUsersHeading')}</h3>
      <div class="settings-section-desc">${t('featureRegistry.groupUsersDesc')}</div>
      <div class="feature-row-list">${renderFeatureRegistryGroupRows('users')}</div>
    </div>
    ${renderRiderAppUrlSection()}
    ${renderSmtpSettingsSection()}
    <div class="settings-section">
      <h3>${t('auth.usersHeading')}</h3>
      <div class="settings-section-desc">${t('auth.usersDesc')}</div>
      ${state.adminUsersError ? `<div class="rider-note rider-note-error">${escapeHtml(state.adminUsersError)}</div>` : ''}
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:12px 0;">
        <button class="btn btn-primary" onclick="toggleAddUserForm()">${t('auth.usersAddButton')}</button>
        ${isFeatureEnabled('user_csv_export') ? `<button class="btn" onclick="exportUsersCSV()">${t('auth.usersCsvExportButton')}</button>` : ''}
      </div>
      ${addForm}
      ${listToolsBar}
      ${bulkBar}
      ${rows || `<div class="settings-section-desc">…</div>`}
    </div>
    ${renderInviteCodesSection()}
    ${renderAuditLogSection()}
  `;
}

/* ---------------- Organisation (Multi-Tenancy) ---------------- */
/* Vier Org-Rollen, analog zu ADMIN_ROLE_OPTIONS oben, aber ein eigenes
   Set — 'captain' statt 'admin' (auth.php: org/members/set-role prüft
   genau diese vier Werte), editor/viewer/checkpoint_staff teilen sich
   Label-Keys mit den Geräte-Rollen (gleiche Bedeutung). */
const ORG_ROLE_OPTIONS = ['captain', 'editor', 'viewer', 'checkpoint_staff'];
function orgRoleLabel(role){
  if(role === 'captain') return t('auth.roleCaptain');
  return adminRoleLabel(role);
}
/* Ein einziger delegierter Listener statt inline-onclick für die beiden
   Org-Listen (Mitglieder in den Einstellungen, Orgs im SysAdmin-Panel).
   Grund ist keine Stilfrage, sondern Sicherheit: beide Listen zeigen frei
   gewählte Namen, und ein Name in einem inline-onclick-Stringliteral ist
   nicht sicher escapebar (escapeHtml macht ' zu &#39;, was der HTML-Parser
   vor dem JS-Parser wieder auflöst). Über data-Attribute + dataset gibt es
   diesen Übergang gar nicht erst.

   Delegation auf document, weil beide Container bei jedem render() neu
   per innerHTML entstehen — ein direkt am Button hängender Listener wäre
   sofort wieder weg. Idempotent, damit mehrfaches Rendern nicht mehrfach
   feuert. */
let orgActionDelegationBound = false;
function ensureOrgActionDelegation(){
  if(orgActionDelegationBound) return;
  orgActionDelegationBound = true;
  document.addEventListener('click', (ev) => {
    const removeBtn = ev.target.closest && ev.target.closest('[data-org-member-remove]');
    if(removeBtn){
      removeOrgMember(parseInt(removeBtn.dataset.orgMemberRemove, 10), removeBtn.dataset.username || '');
      return;
    }
    const deactivateBtn = ev.target.closest && ev.target.closest('[data-org-deactivate]');
    if(deactivateBtn){
      deactivateOrgRow(parseInt(deactivateBtn.dataset.orgDeactivate, 10), deactivateBtn.dataset.orgName || '');
    }
  });
}
async function loadOrgMembersIfNeeded(force){
  ensureOrgActionDelegation();
  if(state.orgMembersList && !force) return;
  const res = await authRequest('GET', 'a=org/members');
  state.orgMembersError = res.ok ? '' : (res.error || 'error');
  state.orgMembersList = res.ok ? res.members : [];
  if(state.settingsSection === 'orgSettings') renderSettings();
}
function renderOrgMembersList(){
  if(state.orgMembersError) return `<div class="rider-note rider-note-error">${escapeHtml(state.orgMembersError)}</div>`;
  const members = state.orgMembersList;
  if(members === null) return t('settings.org.loadingMembers');
  if(!members.length) return `<div class="settings-section-desc">${t('settings.org.membersEmpty')}</div>`;
  /* Name NICHT in einen inline-onclick interpolieren: escapeHtml() macht
     aus ' ein &#39;, das der Parser VOR dem Auswerten des JS-Strings
     wieder zu ' auflöst — ein Benutzername mit Apostroph bräche damit aus
     dem Stringliteral aus. Übergabe deshalb per data-Attribut, gelesen in
     einem delegierten Listener (ensureOrgActionDelegation()). */
  return members.map(m => `
    <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong>${escapeHtml(m.username)}</strong>
        <span style="color:var(--steel); font-size:12px;">${escapeHtml(m.display_name || '')}</span>
        <select onchange="updateOrgMemberRole(${m.user_id}, this.value)" style="margin-left:auto;">
          ${ORG_ROLE_OPTIONS.map(r => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${escapeHtml(orgRoleLabel(r))}</option>`).join('')}
        </select>
        <button class="btn btn-ghost" data-org-member-remove="${m.user_id}" data-username="${escapeHtml(m.username)}">${t('settings.org.removeMemberButton')}</button>
      </div>
    </div>
  `).join('');
}
async function updateOrgMemberRole(userId, role){
  const res = await authRequest('POST', 'a=org/members/set-role', {userId, role});
  if(!res.ok && res.error === 'last_captain') alert(t('settings.org.lastCaptainError'));
  await loadOrgMembersIfNeeded(true);
}
async function removeOrgMember(userId, username){
  if(!confirm(t('settings.org.removeMemberConfirm', {username}))) return;
  const res = await authRequest('POST', 'a=org/members/remove', {userId});
  if(!res.ok && res.error === 'last_captain') alert(t('settings.org.lastCaptainError'));
  await loadOrgMembersIfNeeded(true);
}
function renderOrganizationSettingsSection(){
  if(!hasAdminRoles()) return '';
  const org = (state.myOrgs || []).find(o => o.slug === state.activeOrgSlug);
  if(!org) return '';
  return `
    <div class="settings-section">
      <h3>${escapeHtml(org.name)}</h3>
      <div class="settings-section-desc">${escapeHtml(org.slug)}</div>
    </div>
    <div class="settings-section">
      <h3>${t('settings.org.membersHeading')}</h3>
      <div id="org-members-list">${renderOrgMembersList()}</div>
    </div>
  `;
}

/* ---------------- SysAdmin-Instanzpanel ---------------- */
/* Eigenständige Top-Level-View, gleiche Form wie #view-league (event-
   unabhängig, eigene Route, nicht Teil der Settings-Sidebar) — aber ohne
   eigenes Template-Element, weil dieser Task nur src/core/*-Dateien
   ändern darf. Das Container-Div wird deshalb hier per JS angelegt statt
   in templates/server.template.html, siehe ensureInstancePanelContainer(). */
function ensureInstancePanelContainer(){
  ensureOrgActionDelegation();
  let el = document.getElementById('view-instance');
  if(!el){
    el = document.createElement('div');
    el.id = 'view-instance';
    el.className = 'view';
    const main = document.getElementById('main');
    if(main) main.appendChild(el);
  }
  return el;
}
function openInstancePanel(){
  if(!state.instanceIsSysAdmin) return;
  state.view = 'instance';
  state.currentEvent = null;
  render();
  loadInstanceOrgsIfNeeded();
}
async function loadInstanceOrgsIfNeeded(force){
  if(state.instanceOrgsList && !force) return;
  const res = await authRequest('GET', 'a=org/list');
  state.instanceOrgsError = res.ok ? '' : (res.error || 'error');
  state.instanceOrgsList = res.ok ? res.orgs : [];
  if(state.view === 'instance') renderInstancePanel();
}
async function submitNewOrg(){
  const slugEl = document.getElementById('instance-new-org-slug');
  const nameEl = document.getElementById('instance-new-org-name');
  const slug = (slugEl && slugEl.value || '').trim();
  const name = (nameEl && nameEl.value || '').trim();
  if(!slug || !name){ alert(t('instance.newOrgValidation')); return; }
  const res = await authRequest('POST', 'a=org/create', {slug, name});
  if(!res.ok){
    alert(res.error === 'slug_taken' ? t('instance.slugTaken') : t('checkpointScan.errGeneric'));
    return;
  }
  await loadInstanceOrgsIfNeeded(true);
}
async function deactivateOrgRow(orgId, name){
  if(!confirm(t('instance.deactivateConfirm', {name}))) return;
  await authRequest('POST', 'a=org/deactivate', {orgId});
  await loadInstanceOrgsIfNeeded(true);
}
function renderInstancePanel(){
  const el = document.getElementById('view-instance');
  if(!el) return;
  if(!state.instanceIsSysAdmin){
    el.innerHTML = `<div class="loading-row">${t('instance.accessDenied')}</div>`;
    return;
  }
  const orgs = state.instanceOrgsList;
  const rows = orgs === null ? t('settings.org.loadingMembers') : !orgs.length ? `<div class="settings-section-desc">${t('instance.orgListEmpty')}</div>` : orgs.map(o => `
    <div class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:10px;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <strong>${escapeHtml(o.name)}</strong>
        <span style="color:var(--steel); font-size:12px;">${escapeHtml(o.slug)}</span>
        <button class="btn btn-ghost" style="margin-left:auto;" data-org-deactivate="${o.id}" data-org-name="${escapeHtml(o.name)}">${t('instance.deactivateButton')}</button>
      </div>
    </div>
  `).join('');
  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>${t('instance.title')}</h2>
        <p>${t('instance.intro')}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="goDashboard()">${t('ui.backToAllEvents')}</button>
      </div>
    </div>
    ${state.instanceOrgsError ? `<div class="rider-note rider-note-error">${escapeHtml(state.instanceOrgsError)}</div>` : ''}
    <div class="settings-section">
      <h3>${t('instance.createOrgHeading')}</h3>
      <div class="rider-field"><label>${t('instance.orgSlugLabel')}</label><input type="text" id="instance-new-org-slug" placeholder="${escapeHtml(t('instance.orgSlugPlaceholder'))}"></div>
      <div class="rider-field"><label>${t('instance.orgNameLabel')}</label><input type="text" id="instance-new-org-name"></div>
      <button class="btn btn-primary" onclick="submitNewOrg()">${t('instance.createOrgButton')}</button>
    </div>
    <div class="settings-section">
      <h3>${t('instance.orgListHeading')}</h3>
      ${rows}
    </div>
  `;
}

function renderSettings(){
  Object.entries(ICON_PACKS).forEach(([key, p]) => {
    if(!p.cdn) return;
    const linkId = 'icon-pack-preview-cdn-' + key;
    if(document.getElementById(linkId)) return;
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = p.cdn;
    document.head.appendChild(link);
  });
  if(!settingsNavItem(state.settingsSection)) state.settingsSection = loadSettingsSectionPref() || SETTINGS_NAV_GROUPS[0].items[0].id;
  const el = document.getElementById('view-settings');
  el.innerHTML = `
    <div class="settings-layout ${state.settingsMobileDetailOpen ? 'settings-mobile-detail' : 'settings-mobile-list'}">
      ${renderSettingsSidebar()}
      <div class="settings-content">
        <button type="button" class="settings-mobile-back" onclick="closeSettingsMobileDetail()">${t('settings.backToList')}</button>
        ${settingsSectionContent(state.settingsSection)}
      </div>
    </div>
  `;
  if(state.settingsSection === 'dataSafety'){
    refreshStorageEstimate();
    if(isFeatureEnabled('offline_map_cache')) refreshTileCacheTotal();
  }
  if(state.settingsSection === 'users' && hasAdminRoles()){
    loadAdminUsersIfNeeded();
    if(currentUserIsSysAdmin()) loadSmtpSettingsIfNeeded();
    if(currentUserCan('manageUsers')){
      loadInviteCodesIfNeeded();
      if(isFeatureEnabled('user_audit_log')) loadAuditLogIfNeeded();
    }
  }
  if(state.settingsSection === 'orgSettings' && hasAdminRoles()){
    loadOrgMembersIfNeeded();
  }
}

