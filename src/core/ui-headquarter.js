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
  appSettings: {theme: 'feldpost', iconPack: 'emoji'},
  settingsReturnView: 'dashboard',
  newTypeFormOpen: false,
  newTeamFormOpen: false,
  leaderboardTab: 'individual',
  leaderboardTeamFilter: '',
};
let map, markersLayer, routeLine;
let qrScanStream = null;
let qrScanRAF = null;
let liveCountdownInterval = null;
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
    <button type="button" class="toast-close" aria-label="Schließen">&times;</button>
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
  el.textContent = status === 'pending' ? 'Ungespeicherte Änderungen…'
    : status === 'saving' ? 'Speichert…'
    : status === 'saved' ? 'Gespeichert'
    : status === 'error' ? 'Fehler beim Speichern — Änderung evtl. verloren'
    : '';
}

/* ---------------- init ---------------- */
async function init(){
  if(!(await initStorageBackend())) return;
  await loadAppSettings();
  applyAppSettings();
  await loadCustomCheckpointTypes();
  await loadEventsIndex();
  state.loading = false;
  render();
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
  state.currentEvent = withEventDefaults(evt || {id, name:'Unbenanntes Event', date:'', checkpoints:[]});
  state.loading = false;
  render();
  setTimeout(() => { initMap(); initSidebarResize(); applySidebarWidth(); }, 30);
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

/* ---------------- app settings: theme + icon pack ---------------- */
const ICON_PACKS = {
  emoji: {
    label: 'Emoji', desc: 'Standard — keine externen Ressourcen nötig', cdn: null,
    render: (key) => typeIcon(key)
  },
  fa: {
    label: 'Font Awesome', desc: 'Lädt Font Awesome 6 von cdnjs nach',
    cdn: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
    icons: {qr: 'fa-solid fa-qrcode', photo: 'fa-solid fa-camera', item: 'fa-solid fa-box', custom: 'fa-solid fa-circle-question', challenge: 'fa-solid fa-trophy'},
    render(key){ return `<i class="${this.icons[key] || 'fa-solid fa-location-dot'}"></i>`; }
  },
  material: {
    label: 'Material Symbols', desc: 'Lädt Material Symbols von Google Fonts nach',
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
    if(res) state.appSettings = Object.assign({theme: 'feldpost', iconPack: 'emoji'}, JSON.parse(res.value));
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
  document.getElementById('view-editor').classList.toggle('active', state.view === 'editor');
  document.getElementById('view-manifest').classList.toggle('active', state.view === 'manifest');
  document.getElementById('view-riders').classList.toggle('active', state.view === 'riders');
  document.getElementById('view-checkin').classList.toggle('active', state.view === 'checkin');
  document.getElementById('view-leaderboard').classList.toggle('active', state.view === 'leaderboard');
  document.getElementById('view-settings').classList.toggle('active', state.view === 'settings');

  if(state.view === 'dashboard') renderDashboard();
  if(state.view === 'editor') renderSidebar();
  if(state.view === 'manifest') renderManifest();
  if(state.view === 'riders') renderRiders();
  if(state.view === 'checkin') renderCheckin();
  if(state.view === 'leaderboard') renderLeaderboard();
  if(state.view === 'settings') renderSettings();
}

const NAV_ITEMS = [
  {view: 'editor', label: 'Karte', shortLabel: 'Karte', onclick: evtId => `openEditor('${evtId}')`,
    icon: '<path d="M12 21s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'},
  {view: 'riders', label: 'Fahrer', shortLabel: 'Fahrer', onclick: () => 'openRiders()',
    icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>'},
  {view: 'checkin', label: 'Ziel-Check-in', shortLabel: 'Check-in', onclick: () => 'openCheckin()',
    icon: '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>'},
  {view: 'leaderboard', label: 'Leaderboard', shortLabel: 'Board', onclick: () => 'openLeaderboard()',
    icon: '<path d="M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5H4.5A2.5 2.5 0 0 0 7 9.5"/><path d="M17 5h2.5A2.5 2.5 0 0 1 17 9.5"/><path d="M12 12v3.5"/><path d="M9.5 19.5h5"/><path d="M10.3 15.5h3.4l.6 4h-4.6z"/>'},
  {view: 'manifest', label: 'Manifest ansehen', shortLabel: 'Manifest', onclick: () => 'openManifest()',
    icon: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9.5 12.5h5"/><path d="M9.5 16h5"/>'}
];
function renderTopbar(){
  const sub = document.getElementById('topbar-sub');
  const actions = document.getElementById('topbar-actions');
  const bottomNav = document.getElementById('bottom-nav');

  if(state.view === 'settings'){
    sub.textContent = 'Einstellungen';
    actions.innerHTML = `<button class="btn btn-ghost" onclick="closeSettings()">&larr; Zurück</button>`;
    bottomNav.innerHTML = '';
    return;
  }

  if(state.view === 'dashboard' || !state.currentEvent){
    sub.textContent = 'Organizer Backend';
    actions.innerHTML = '';
    bottomNav.innerHTML = '';
    return;
  }

  sub.textContent = state.currentEvent.name || 'Unbenanntes Event';
  const evtId = state.currentEvent.id;
  const navBtn = item =>
    `<button class="btn ${state.view === item.view ? 'btn-primary' : ''}" onclick="${item.onclick(evtId)}">${item.label}</button>`;
  actions.innerHTML = `
    <button class="btn btn-ghost" onclick="goDashboard()">&larr; Alle Events</button>
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
  feldpost: {label: 'Feldpost', desc: 'Rally-Stempel-Look — dunkles Chrome, warmes Papier (Standard)', swatch: ['#17191a', '#eee5cd', '#ff5f1f', '#b23a2e']},
  hell: {label: 'Hell', desc: 'Helles Chrome, klassisches Papier', swatch: ['#f4f1ea', '#fffdf7', '#e0551c', '#b23a2e']},
  dunkel: {label: 'Dunkel', desc: 'Durchgehend dunkel, ruhiger blauer Akzent', swatch: ['#121212', '#1e1e1e', '#5b8cff', '#e05a4e']},
  dracula: {label: 'Dracula', desc: 'Pink/Lila-Akzente auf klassischem Dracula-Dunkel', swatch: ['#282a36', '#2b2d3a', '#ff79c6', '#bd93f9']}
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
  const themeCards = Object.entries(THEMES).map(([key, t]) => `
    <button class="option-card ${state.appSettings.theme === key ? 'active' : ''}" onclick="setTheme('${key}')">
      <span class="option-swatch">${t.swatch.map(c => `<span style="background:${c}"></span>`).join('')}</span>
      <span class="option-card-label">${t.label}</span>
      <span class="option-card-desc">${t.desc}</span>
    </button>
  `).join('');
  const iconCards = Object.entries(ICON_PACKS).map(([key, p]) => `
    <button class="option-card ${state.appSettings.iconPack === key ? 'active' : ''}" onclick="setIconPack('${key}')">
      <span class="icon-preview-row">${['qr', 'photo', 'item', 'custom', 'challenge'].map(k => p.render(k)).join('')}</span>
      <span class="option-card-label">${p.label}</span>
      <span class="option-card-desc">${p.desc}</span>
    </button>
  `).join('');
  const typeRows = CHECKPOINT_TYPES.map(t => {
    const isBuiltin = BUILTIN_CHECKPOINT_TYPE_KEYS.includes(t.key);
    const meta = t.isScored ? `Bewertet 0–${t.scoreMax} Punkte` : t.hasCustomQuestion ? 'Freitext-Frage im Editor' : 'Ankreuzfeld im Manifest';
    return `
      <div class="type-row">
        <span class="type-icon">${typeIconHtml(t.key)}</span>
        <div class="type-info">
          <div class="type-name">${escapeHtml(t.fullLabel)}</div>
          <div class="type-meta">${escapeHtml(t.shortLabel)} &middot; ${meta}</div>
        </div>
        ${isBuiltin
          ? `<span class="type-badge">Standard</span>`
          : `<button class="btn btn-sm btn-danger" onclick="deleteCustomCheckpointType('${t.key}')">Löschen</button>`}
      </div>
    `;
  }).join('');
  const newTypeForm = state.newTypeFormOpen ? `
    <div class="settings-form">
      <div class="row2">
        <div>
          <label>Icon (Emoji)</label>
          <input type="text" id="newtype-icon" class="icon-input" maxlength="4" value="📍">
        </div>
        <div>
          <label>Kurzname (Badge)</label>
          <input type="text" id="newtype-short" maxlength="14" placeholder="z. B. SPRINT">
        </div>
      </div>
      <div>
        <label>Name</label>
        <input type="text" id="newtype-label" placeholder="z. B. Sprint-Wertung">
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="newtype-question">
        Hat eine frei definierbare Frage (z. B. Rätsel)
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="newtype-scored" onchange="document.getElementById('newtype-scoremax-row').style.display = this.checked ? 'block' : 'none';">
        Wird vom Marshal mit Punkten bewertet
      </label>
      <div id="newtype-scoremax-row" style="display:none;">
        <label>Maximalpunktzahl</label>
        <input type="number" id="newtype-scoremax" value="10" min="1" max="999">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addCustomCheckpointType()">Checkpoint-Typ anlegen</button>
        <button class="btn btn-ghost" onclick="toggleNewTypeForm()">Abbrechen</button>
      </div>
    </div>
  ` : `<button class="btn" onclick="toggleNewTypeForm()">+ Neuer Checkpoint-Typ</button>`;
  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>Einstellungen</h2>
        <p>Individualisiere Theme und Icon-Darstellung — gilt für alle Events auf diesem Gerät.</p>
      </div>
    </div>
    <div class="settings-section">
      <h3>Theme</h3>
      <div class="settings-section-desc">Verändert die Farbpalette der gesamten App.</div>
      <div class="option-grid">${themeCards}</div>
    </div>
    <div class="settings-section">
      <h3>Icon-Pack</h3>
      <div class="settings-section-desc">Bestimmt, wie Checkpoint-Typen auf der Karte und in der Legende dargestellt werden. Font Awesome und Material Symbols werden bei Auswahl von einem CDN nachgeladen.</div>
      <div class="option-grid">${iconCards}</div>
    </div>
    <div class="settings-section">
      <h3>Checkpoint-Typen</h3>
      <div class="settings-section-desc">Eigene Checkpoint-Typen stehen sofort in jedem Event im Typ-Dropdown, auf der Karte, im Manifest und im Ziel-Check-in zur Verfügung.</div>
      <div class="type-list">${typeRows}</div>
      ${newTypeForm}
    </div>
  `;
}

