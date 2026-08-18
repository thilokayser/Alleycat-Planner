/* ---------------- app state ---------------- */
let state = {
  view: 'dashboard',
  eventsIndex: [],
  currentEvent: null,
  addMode: false,
  editingId: null,
  confirmDeleteCpId: null,
  confirmDeleteEventId: null,
  settingsOpen: false,
  loading: true,
  storageOk: true,
  checkinBibInput: '',
  checkinActiveBib: null,
  checkinNotFound: false,
  leaderboardSearch: '',
  spokeCardsGenerating: false,
  riderSheetGenerating: false,
  printPopupBlocked: false,
  saveStatus: 'idle',
  qrScannerActive: false,
  qrScanError: '',
  manifestSettingsOpen: false,
  appSettings: {theme: 'feldpost', iconPack: 'emoji', autoBackupIntervalMinutes: 10, autoBackupHintShown: false, offlineCacheHintShown: false, featureToggles: {}, distanceUnit: 'metric', timeFormat: '24h', coordFormat: 'decimal'},
  featureRegistrySearch: '',
  settingsReturnView: 'dashboard',
  newTypeFormOpen: false,
  newTeamFormOpen: false,
  newCategoryGroupFormOpen: false,
  leaderboardStatusFilter: '',
  leaderboardCategoryFilters: {},
  leaderboardCsvSplitKey: '',
  leaderboardTab: 'individual',
  leaderboardTeamFilter: '',
  overviewSettingsOpen: false,
  cpListGroupBy: 'order',
  pdfBlocksPanelOpen: false,
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
  teamsPanelOpen: false,
  categoriesPanelOpen: false,
  cardDesignPanelOpen: false,
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
  setSaveStatus('saving');
  const ok = await storageSet('event:' + state.currentEvent.id, JSON.stringify(state.currentEvent));
  setSaveStatus(ok ? 'saved' : 'error');
  if(ok) broadcastEventUpdated(state.currentEvent.id);
}
function debouncedSave(){
  setSaveStatus('pending');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveCurrentEvent, 450);
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
  if(!(await initStorageBackend())) return;
  await loadAppSettings();
  applyAppSettings();
  await loadCustomLanguagePacks();
  applyStaticTranslations();
  await loadCustomCheckpointTypes();
  await loadEventsIndex();
  await seedDemoEventIfNeeded();
  state.loading = false;
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
  render();
}
function openRiders(){
  state.view = 'riders';
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
    if(!state.currentEvent || state.view === 'dashboard' || state.view === 'settings') return;
    const fn = NAV_SHORTCUT_KEYS[e.key];
    if(fn){ e.preventDefault(); fn(); }
  });
}

/* ---------------- app settings: theme + icon pack ---------------- */
const ICON_PACKS = {
  emoji: {
    label: t('ui.iconPackEmojiLabel'), desc: t('ui.iconPackEmojiDesc'), cdn: null,
    render: (key) => typeIcon(key)
  },
  fa: {
    label: t('ui.iconPackFaLabel'), desc: t('ui.iconPackFaDesc'),
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    icons: {qr: 'fa-solid fa-qrcode', photo: 'fa-solid fa-camera', item: 'fa-solid fa-box', custom: 'fa-solid fa-circle-question', challenge: 'fa-solid fa-trophy'},
    render(key){ return `<i class="${this.icons[key] || 'fa-solid fa-location-dot'}"></i>`; }
  },
  material: {
    label: t('ui.iconPackMaterialLabel'), desc: t('ui.iconPackMaterialDesc'),
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
    if(res) state.appSettings = Object.assign({theme: 'feldpost', iconPack: 'emoji', autoBackupIntervalMinutes: 10, autoBackupHintShown: false, offlineCacheHintShown: false, featureToggles: {}, distanceUnit: 'metric', timeFormat: '24h', coordFormat: 'decimal'}, JSON.parse(res.value));
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
  state.settingsReturnView = state.view;
  state.view = 'settings';
  render();
}
function closeSettings(){
  state.view = state.settingsReturnView || 'dashboard';
  render();
}

/* ---------------- render: root ---------------- */
function render(){
  renderTopbar();
  document.getElementById('view-dashboard').classList.toggle('active', state.view === 'dashboard');
  document.getElementById('view-overview').classList.toggle('active', state.view === 'overview');
  document.getElementById('view-editor').classList.toggle('active', state.view === 'editor');
  document.getElementById('view-manifest').classList.toggle('active', state.view === 'manifest');
  document.getElementById('view-riders').classList.toggle('active', state.view === 'riders');
  document.getElementById('view-checkin').classList.toggle('active', state.view === 'checkin');
  document.getElementById('view-leaderboard').classList.toggle('active', state.view === 'leaderboard');
  document.getElementById('view-settings').classList.toggle('active', state.view === 'settings');

  if(state.view === 'dashboard') renderDashboard();
  if(state.view === 'overview') renderOverview();
  if(state.view === 'editor') renderSidebar();
  if(state.view === 'manifest') renderManifest();
  if(state.view === 'riders') renderRiders();
  if(state.view === 'checkin') renderCheckin();
  if(state.view === 'leaderboard') renderLeaderboard();
  if(state.view === 'settings') renderSettings();
  syncWakeLockForView();
}

const NAV_ITEMS = [
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
function renderTopbar(){
  const sub = document.getElementById('topbar-sub');
  const actions = document.getElementById('topbar-actions');
  const bottomNav = document.getElementById('bottom-nav');

  if(state.view === 'settings'){
    sub.textContent = t('settings.title');
    actions.innerHTML = `<button class="btn btn-ghost" onclick="closeSettings()">${t('settings.back')}</button>`;
    bottomNav.innerHTML = '';
    return;
  }

  if(state.view === 'dashboard' || !state.currentEvent){
    sub.textContent = t('ui.headquarter');
    actions.innerHTML = '';
    bottomNav.innerHTML = '';
    return;
  }

  sub.textContent = state.currentEvent.name || t('common.unnamedEvent');
  const evtId = state.currentEvent.id;
  const navBtn = item =>
    `<button class="btn ${state.view === item.view ? 'btn-primary' : ''}" onclick="${item.onclick(evtId)}">${item.label}</button>`;
  actions.innerHTML = `
    <button class="btn btn-ghost" onclick="goDashboard()">${t('ui.backToAllEvents')}</button>
    ${state.currentEvent.status === 'running' ? `<span class="running-hint">${t('dataSafety.keepTabOpenHint')}</span>` : ''}
    ${renderStatusControl(state.currentEvent)}
    <span class="topbar-nav-buttons">${NAV_ITEMS.map(navBtn).join('')}</span>
  `;
  bottomNav.innerHTML = NAV_ITEMS.map(item => `
    <button class="bottom-nav-item ${state.view === item.view ? 'active' : ''}" onclick="${item.onclick(evtId)}">
      <svg viewBox="0 0 24 24">${item.icon}</svg>
      <span>${item.shortLabel}</span>
    </button>
  `).join('');
}


/* ---------------- render: settings ---------------- */
const THEMES = {
  feldpost: {label: t('settings.themeFeldpostLabel'), desc: t('settings.themeFeldpostDesc'), swatch: ['#17191a', '#eee5cd', '#ff5f1f', '#b23a2e']},
  hell: {label: t('settings.themeHellLabel'), desc: t('settings.themeHellDesc'), swatch: ['#f4f1ea', '#fffdf7', '#e0551c', '#b23a2e']},
  dunkel: {label: t('settings.themeDunkelLabel'), desc: t('settings.themeDunkelDesc'), swatch: ['#121212', '#1e1e1e', '#5b8cff', '#e05a4e']},
  dracula: {label: t('settings.themeDraculaLabel'), desc: t('settings.themeDraculaDesc'), swatch: ['#282a36', '#2b2d3a', '#ff79c6', '#bd93f9']},
  outdoor: {label: t('settings.themeOutdoorLabel'), desc: t('settings.themeOutdoorDesc'), swatch: ['#ffffff', '#000000', '#ffcc00', '#b30000']}
};
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
  const el = document.getElementById('view-settings');
  const themeCards = Object.entries(THEMES).map(([key, th]) => `
    <button class="option-card ${state.appSettings.theme === key ? 'active' : ''}" onclick="setTheme('${key}')">
      <span class="option-swatch">${th.swatch.map(c => `<span style="background:${c}"></span>`).join('')}</span>
      <span class="option-card-label">${th.label}</span>
      <span class="option-card-desc">${th.desc}</span>
    </button>
  `).join('');
  const iconCards = Object.entries(ICON_PACKS).map(([key, p]) => `
    <button class="option-card ${state.appSettings.iconPack === key ? 'active' : ''}" onclick="setIconPack('${key}')">
      <span class="icon-preview-row">${['qr', 'photo', 'item', 'custom', 'challenge'].map(k => p.render(k)).join('')}</span>
      <span class="option-card-label">${p.label}</span>
      <span class="option-card-desc">${p.desc}</span>
    </button>
  `).join('');
  const typeRows = CHECKPOINT_TYPES.map(ct => {
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
  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>${t('settings.title')}</h2>
        <p>${t('settings.intro')}</p>
      </div>
    </div>
    ${renderFeatureRegistrySection()}
    <div class="settings-section">
      <h3>${t('settings.themeHeading')}</h3>
      <div class="settings-section-desc">${t('settings.themeDesc')}</div>
      <div class="option-grid">${themeCards}</div>
    </div>
    <div class="settings-section">
      <h3>${t('settings.iconPackHeading')}</h3>
      <div class="settings-section-desc">${t('settings.iconPackDesc')}</div>
      <div class="option-grid">${iconCards}</div>
    </div>
    <div class="settings-section">
      <h3>${t('settings.languageHeading')}</h3>
      <div class="settings-section-desc">${t('settings.languageDesc')}</div>
      <div class="option-grid">
        ${availableLanguages().map(code => `
          <button class="option-card ${getCurrentLanguage() === code ? 'active' : ''}" onclick="setLanguage('${code}')">
            <span class="option-card-label">${escapeHtml(languagePackDisplayName(code))}</span>
            ${code !== 'de' ? `<span class="option-card-desc">${t('settings.languagePackCustomBadge')}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
        <input type="file" id="import-language-pack-file" accept="application/json,.json" style="display:none;" onchange="onLanguagePackFileChange(this)">
        <button class="btn btn-sm" onclick="document.getElementById('import-language-pack-file').click()">${t('settings.languagePackImport')}</button>
        <button class="btn btn-sm" onclick="exportLanguagePackTemplate()">${t('settings.languagePackExportTemplate')}</button>
      </div>
      ${availableLanguages().filter(c => c !== 'de').length ? `
        <div style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">
          ${availableLanguages().filter(c => c !== 'de').map(code => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <span class="settings-hint">${escapeHtml(languagePackDisplayName(code))} (${code})</span>
              <button type="button" class="cp-icon-btn" onclick="deleteLanguagePack('${code}')" title="${t('common.delete')}" aria-label="${t('common.delete')}">🗑</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
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
    <div class="settings-section">
      <h3>${t('settings.checkpointTypesHeading')}</h3>
      <div class="settings-section-desc">${t('settings.checkpointTypesDesc')}</div>
      <div class="type-list">${typeRows}</div>
      ${newTypeForm}
    </div>
    ${renderDataSafetySection()}
  `;
  refreshStorageEstimate();
  if(isFeatureEnabled('offline_map_cache')) refreshTileCacheTotal();
}

