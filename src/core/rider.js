/* ---------------- riders ---------------- */
function withRiderDefaults(rider){
  return Object.assign({
    name: '',
    teamId: null,
    finishTime: '',
    completed: [],
    scores: {},
    checkpointTimes: {},
    raceStatus: '',
    categories: {},
    checkpointOrderOverrides: [],
    gameFlags: {},
    riderToken: '',
    riderCode: '',
    riderStatus: '',
    pendingData: null,
    gpsFlags: {}
  }, rider);
}

function onExpectedRidersInput(value){
  state.currentEvent.expectedRiders = Math.max(0, parseInt(value, 10) || 0);
  debouncedSave();
}
function generateRiderSlots(){
  const evt = state.currentEvent;
  const n = evt.expectedRiders || 0;
  const existing = evt.riders || [];
  const willLose = existing.filter(r => r.bib > n && (r.finishTime || (r.completed && r.completed.length)));
  if(willLose.length && !confirm(t('rider.reduceConfirm', {
    count: willLose.length,
    noun: willLose.length === 1 ? t('rider.checkinSingular') : t('rider.checkinPlural'),
    bibs: willLose.map(r=>r.bib).join(', ')
  }))) return;
  const next = [];
  for(let i = 1; i <= n; i++){
    /* Bestehende Slots werden wiederverwendet, nicht ersetzt — sonst würde ein
       Regenerieren die riderToken wechseln und jede bereits gedruckte
       Spokecard entwerten. */
    next.push(existing.find(r => r.bib === i) || {
      bib: i, name: '', emergencyContact: '', finishTime: '', completed: [], scores: {}, checkpointTimes: {},
      riderToken: generateRiderToken(), riderCode: generateRiderCode(), riderStatus: '', pendingData: null, gpsFlags: {}
    });
  }
  evt.riders = next;
  ensureRiderTokens(evt);
  debouncedSave();
  renderRiders();
}
/* Rüstet Slots aus Events nach, die vor der Rider-App angelegt wurden. Statt
   eines eigenen Migrationsschritts: läuft beim Publish und beim Slot-Erzeugen,
   ergänzt nur Fehlendes und fasst vorhandene Token nie an. Gibt true zurück,
   wenn etwas ergänzt wurde — der Aufrufer weiß dann, dass er speichern muss. */
function ensureRiderTokens(evt){
  let changed = false;
  (evt.riders || []).forEach(r => {
    if(!r.riderToken){ r.riderToken = generateRiderToken(); changed = true; }
    if(!r.riderCode){ r.riderCode = generateRiderCode(); changed = true; }
  });
  return changed;
}
function onRiderNameInput(bib, value){
  const r = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.name = value;
  debouncedSave();
}
function onRiderEmergencyInput(bib, value){
  const r = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.emergencyContact = value;
  debouncedSave();
}
/* ---------------- riders: sidebar navigation (Paket 11) ----------------
   Same "full Settings pattern" as the Settings-Hub redesign — a sidebar
   replaces the old row of collapsible-panel toggle buttons, right pane
   shows only the active screen. Unlike Settings, this page has one clearly
   dominant section (the roster itself), so — deliberately different from
   Settings' "remember last section" — openRiders() always resets back to
   'roster' rather than persisting the choice; jumpToFeatureConfig's
   category deep-link overrides that default explicitly via
   selectRidersSection() right after. categoriesEnabled is per-event, so
   this can't be a static top-level const like SETTINGS_NAV_GROUPS. */
function ridersNavGroups(evt){
  const categoriesEnabled = isFeatureEnabled('categories', evt);
  /* Nur sichtbar, wenn es überhaupt eine Fahrer-App gibt UND gerade
     jemand wartet — ein dauerhaft leerer Nav-Punkt wäre in der lokalen
     Variante schlicht tot. */
  const pending = riderAppBaseUrl() ? pendingRiderRegistrations(evt).length : 0;
  return [
    {id: 'roster', label: () => t('rider.navGroupRoster'), items: [
      {id: 'roster', icon: '🚴', label: () => t('rider.navRoster')},
      ...(pending ? [{id: 'pending', icon: '📥', label: () => t('riderApp.navPending', {count: pending})}] : []),
      {id: 'bulkImport', icon: '📋', label: () => t('rider.navBulkImport')}
    ]},
    {id: 'config', label: () => t('rider.navGroupConfig'), items: [
      {id: 'teams', icon: '👥', label: () => t('rider.teamsHeading')},
      ...(categoriesEnabled ? [{id: 'categories', icon: '🎫', label: () => t('category.heading')}] : []),
      {id: 'cardDesign', icon: '🎴', label: () => t('rider.cardDesignToggle')},
      ...(riderAppBaseUrl() ? [{id: 'selfRegister', icon: '📝', label: () => t('riderApp.selfRegisterNav')}] : [])
    ]}
  ];
}
function ridersNavItem(evt, id){
  for(const group of ridersNavGroups(evt)){
    const item = group.items.find(i => i.id === id);
    if(item) return item;
  }
  return null;
}
function selectRidersSection(id){
  state.ridersSection = id;
  state.ridersMobileDetailOpen = true;
  if(id === 'bulkImport' && !state.bulkImportOpen) toggleBulkImportPanel();
  render();
}
function closeRidersMobileDetail(){
  state.ridersMobileDetailOpen = false;
  render();
}
function renderRidersSidebar(evt){
  const groups = ridersNavGroups(evt);
  return `
    <nav class="settings-sidebar">
      <div class="settings-sidebar-head">
        <h2>${t('ui.navRiders')}</h2>
        <p>${t('rider.sidebarIntro')}</p>
      </div>
      ${groups.map(group => `
        <div class="settings-nav-group">
          <div class="settings-nav-group-label">${group.label()}</div>
          ${group.items.map(item => `
            <button type="button" class="settings-nav-item ${state.ridersSection === item.id ? 'active' : ''}" onclick="selectRidersSection('${item.id}')">
              <span class="settings-nav-icon">${item.icon}</span>
              <span>${item.label()}</span>
            </button>
          `).join('')}
        </div>
      `).join('')}
    </nav>
  `;
}
function deleteRider(bib){
  const evt = state.currentEvent;
  const idx = (evt.riders || []).findIndex(r => r.bib === bib);
  if(idx === -1) return;
  if(!confirm(t('rider.deleteConfirm', {bib}))) return;
  const removed = evt.riders[idx];
  evt.riders.splice(idx, 1);
  renderRiders();
  logUndoableAction(evt, t('actionLog.riderDeleted', {bib, name: removed.name || ''}), () => {
    evt.riders.splice(idx, 0, removed);
    renderRiders();
  });
}


function renderQrDataUrl(text, sizePx){
  return new Promise((resolve) => {
    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-9999px';
    holder.style.top = '0';
    document.body.appendChild(holder);
    new QRCode(holder, {text, width: sizePx, height: sizePx, colorDark: '#241f18', colorLight: '#ffffff'});
    setTimeout(() => {
      const canvas = holder.querySelector('canvas');
      const dataUrl = canvas ? canvas.toDataURL('image/png') : null;
      document.body.removeChild(holder);
      resolve(dataUrl);
    }, 20);
  });
}

/* ---------------- render: riders ---------------- */
function renderRiderCardsHtml(evt, riders){
  const teams = evt.teams || [];
  const categoriesEnabled = isFeatureEnabled('categories', evt);
  const groups = (evt.categoryGroups || []).slice().sort((a,b) => a.sortOrder - b.sortOrder);
  return riders.map(r => `
    <div class="rider-card">
      <button type="button" class="rider-delete-btn" title="${t('rider.deleteTitle')}" onclick="deleteRider(${r.bib})">&times;</button>
      <div class="rider-qr" id="qr-${r.bib}"></div>
      <div class="rider-bib">#${r.bib}</div>
      <input type="text" class="rider-name-input" placeholder="${t('rider.namePlaceholder')}" value="${escapeHtml(r.name || '')}" oninput="onRiderNameInput(${r.bib}, this.value)">
      <div class="rider-team-row">
        ${r.teamId ? `<span class="team-dot" style="background:${escapeHtml(getTeam(evt, r.teamId)?.color || '#7c8388')}"></span>` : ''}
        <select class="rider-team-select" onchange="onRiderTeamChange(${r.bib}, this.value)">
          <option value="">${t('rider.noTeam')}</option>
          ${teams.map(tm => `<option value="${tm.id}" ${r.teamId === tm.id ? 'selected' : ''}>${escapeHtml(tm.name)}</option>`).join('')}
        </select>
      </div>
      ${groups.length && categoriesEnabled ? `<div class="rider-categories-row">
        ${groups.map(g => `
          <div class="rider-category-field">
            <label>${escapeHtml(g.name)}</label>
            <select onchange="onRiderCategoryChange(${r.bib}, '${g.id}', this.value)">
              <option value="">${t('category.noCategory')}</option>
              ${g.options.map(opt => `<option value="${escapeHtml(opt)}" ${r.categories && r.categories[g.id] === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>` : ''}
      <input type="text" class="rider-emergency-input" placeholder="${t('rider.emergencyPlaceholder')}" value="${escapeHtml(r.emergencyContact || '')}" oninput="onRiderEmergencyInput(${r.bib}, this.value)">
    </div>
  `).join('');
}
/* ---------------- riders: roster search + sort/group (Paket 11) ----------------
   Applies to what's rendered AND what gets printed (#print-root wraps
   whatever renderRiderRosterGrid() returns) — deliberate: "print what's on
   screen" matches how a filtered/sorted table print is expected to behave
   elsewhere, and grouped-by-team headings printing too is a feature (easier
   physical sorting), not a bug. Grouping by category is intentionally not
   offered — an event can have multiple independent category groups (Antrieb,
   Gender, ...), so "group by category" has no single unambiguous axis. */
function filteredRosterRiders(evt){
  const q = (state.riderRosterSearch || '').trim().toLowerCase();
  const riders = evt.riders || [];
  if(!q) return riders.slice();
  return riders.filter(r => (r.name || '').toLowerCase().includes(q) || String(r.bib).includes(q));
}
let riderRosterSearchRenderTimeout;
function onRiderRosterSearchInput(value){
  state.riderRosterSearch = value;
  clearTimeout(riderRosterSearchRenderTimeout);
  riderRosterSearchRenderTimeout = setTimeout(() => {
    const active = document.activeElement;
    const cursor = active && active.classList.contains('riders-search-input') ? active.selectionStart : null;
    renderRiders();
    restoreInputFocus('.riders-search-input', cursor);
  }, 150);
}
function onRiderSortByChange(value){
  state.riderSortBy = value;
  renderRiders();
}
function renderRiderRosterGrid(evt){
  const filtered = filteredRosterRiders(evt);
  if(!filtered.length){
    return `<div class="riders-hint">${t('rider.searchNoResults', {query: state.riderRosterSearch})}</div>`;
  }
  if(state.riderSortBy === 'team'){
    const teams = evt.teams || [];
    const blocks = teams.map(tm => ({tm, members: filtered.filter(r => r.teamId === tm.id)})).filter(g => g.members.length).map(g => `
      <div class="rider-group-heading">${escapeHtml(g.tm.name)} <span class="rider-group-count">${g.members.length}</span></div>
      <div class="rider-grid">${renderRiderCardsHtml(evt, g.members)}</div>
    `);
    const withoutTeam = filtered.filter(r => !r.teamId || !teams.some(tm => tm.id === r.teamId));
    if(withoutTeam.length) blocks.push(`
      <div class="rider-group-heading">${t('rider.noTeam')} <span class="rider-group-count">${withoutTeam.length}</span></div>
      <div class="rider-grid">${renderRiderCardsHtml(evt, withoutTeam)}</div>
    `);
    return blocks.join('');
  }
  const sorted = filtered.slice().sort((a, b) => state.riderSortBy === 'name'
    ? (a.name || '').localeCompare(b.name || '', 'de')
    : a.bib - b.bib);
  return `<div class="rider-grid">${renderRiderCardsHtml(evt, sorted)}</div>`;
}
function renderRidersSectionRoster(evt){
  const riders = evt.riders || [];
  const toolbar = `
    <div class="riders-toolbar">
      <div class="riders-count-field">
        <div>
          <label>${t('rider.expectedRidersLabel')}</label>
          <input type="text" inputmode="numeric" value="${evt.expectedRiders || 0}" oninput="onExpectedRidersInput(this.value)">
        </div>
        <button class="btn" onclick="generateRiderSlots()">${t('rider.generateSlots')}</button>
      </div>
      ${riders.length ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="window.print()">${t('rider.printBibs')}</button>
          <button class="btn" onclick="exportRidersPDF()" ${state.riderSheetGenerating ? 'disabled' : ''}>${state.riderSheetGenerating ? t('common.generating') : t('rider.bibsPdf')}</button>
          <button class="btn btn-ghost" onclick="printSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? t('common.generating') : t('rider.printSpokecards')}</button>
          <button class="btn btn-primary" onclick="exportSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? t('rider.generatingSpokecards') : t('rider.spokecardsPdf')}</button>
        </div>
      ` : ''}
    </div>
    ${riders.length ? `
      <div class="riders-search-sort-row">
        <input type="text" class="riders-search-input" placeholder="${t('rider.searchPlaceholder')}" value="${escapeHtml(state.riderRosterSearch || '')}" oninput="onRiderRosterSearchInput(this.value)">
        <label>${t('rider.sortByLabel')}</label>
        <select onchange="onRiderSortByChange(this.value)">
          <option value="bib" ${state.riderSortBy !== 'name' && state.riderSortBy !== 'team' ? 'selected' : ''}>${t('rider.sortByBib')}</option>
          <option value="name" ${state.riderSortBy === 'name' ? 'selected' : ''}>${t('rider.sortByName')}</option>
          <option value="team" ${state.riderSortBy === 'team' ? 'selected' : ''}>${t('rider.sortByTeam')}</option>
        </select>
      </div>
    ` : ''}
    ${renderActionLogPanel(evt)}
    ${riders.length ? `<div class="riders-hint">${t('rider.spokecardHint')} ${t('pdfBlocks.spokecardsHint')} <a href="#" onclick="event.preventDefault(); openManifest(); state.manifestSection = 'baukasten'; state.manifestMobileDetailOpen = true; render();">${t('pdfBlocks.toggleButton')}</a></div>` : ''}
    ${state.printPopupBlocked ? `<div class="riders-hint warn">${t('rider.printPopupBlocked')}</div>` : ''}
  `;
  if(riders.length === 0){
    return `${toolbar}<div style="max-width:520px; margin:20px auto;">${emptyStateHtml({
      icon: '🚴',
      title: t('rider.emptyTitle'),
      description: t('rider.emptyHint'),
      primaryAction: {label: t('rider.emptyStatePrimary'), onclick: "document.querySelector('.riders-count-field input').focus()"},
      secondaryAction: {label: t('bulkImport.openButton'), onclick: "selectRidersSection('bulkImport')"}
    })}</div>`;
  }
  return `
    ${toolbar}
    <div id="print-root">
      <div class="rider-sheet-head">
        <h2>${escapeHtml(evt.name || t('common.unnamedEvent'))}</h2>
        <div class="stamp-tag">${t('rider.bibsStamp')}</div>
      </div>
      ${renderRiderRosterGrid(evt)}
    </div>
  `;
}
function renderRidersSectionBulkImport(evt){
  return `
    <div class="settings-section">
      <h3>${t('rider.navBulkImport')}</h3>
      <div class="settings-section-desc">${t('bulkImport.uploadHint')}</div>
      ${renderBulkImportPanel()}
    </div>
  `;
}
function renderRidersSectionTeams(evt){
  const riders = evt.riders || [];
  const teams = evt.teams || [];
  const teamRows = teams.map(tm => `
    <div class="type-row">
      <input type="color" class="team-color-input" value="${escapeHtml(tm.color)}" onchange="setTeamColor('${tm.id}', this.value)" title="${t('rider.teamColorTitle')}">
      <div class="type-info">
        <input type="text" class="team-name-input" value="${escapeHtml(tm.name)}" onchange="renameTeam('${tm.id}', this.value)">
        <div class="type-meta">${t('rider.memberCount', {count: riders.filter(r => r.teamId === tm.id).length})}</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteTeam('${tm.id}')">${t('common.delete')}</button>
    </div>
  `).join('');
  const newTeamForm = state.newTeamFormOpen ? `
    <div class="settings-form">
      <div class="row2">
        <div>
          <label>${t('rider.teamNameLabel')}</label>
          <input type="text" id="newteam-name" placeholder="${t('rider.teamNamePlaceholder')}">
        </div>
        <div>
          <label>${t('rider.colorLabel')}</label>
          <input type="color" id="newteam-color" value="${TEAM_COLOR_PALETTE[teams.length % TEAM_COLOR_PALETTE.length]}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addTeam()">${t('rider.createTeam')}</button>
        <button class="btn btn-ghost" onclick="toggleNewTeamForm()">${t('common.cancel')}</button>
      </div>
    </div>
  ` : `<button class="btn" onclick="toggleNewTeamForm()">${t('rider.newTeam')}</button>`;
  return `
    <div class="settings-section">
      <h3>${t('rider.teamsHeading')}</h3>
      <div class="settings-section-desc">${t('rider.teamsDesc')}</div>
      <div class="team-scoring-mode-row">
        <label>${t('rider.teamScoringModeLabel')}</label>
        <select onchange="onTeamScoringModeChange(this.value)">
          <option value="bestTime" ${evt.teamScoringMode !== 'allMustFinish' ? 'selected' : ''}>${t('rider.teamScoringBestTime')}</option>
          <option value="allMustFinish" ${evt.teamScoringMode === 'allMustFinish' ? 'selected' : ''}>${t('rider.teamScoringAllMustFinish')}</option>
        </select>
      </div>
      <div class="type-list">${teamRows || `<div class="riders-hint" style="padding:0;">${t('rider.noTeamsYet')}</div>`}</div>
      ${newTeamForm}
    </div>
  `;
}
function renderRidersSectionCategories(evt){
  const groups = (evt.categoryGroups || []).slice().sort((a,b) => a.sortOrder - b.sortOrder);
  const availablePresets = CATEGORY_PRESETS.filter(p => !groups.some(g => g.name === p.name()));
  const categoryGroupRows = groups.map(g => `
    <div class="type-row category-group-row">
      <div class="type-info" style="flex:1;">
        <input type="text" class="team-name-input" value="${escapeHtml(g.name)}" onchange="renameCategoryGroup('${g.id}', this.value)">
        <div class="category-options-list">
          ${g.options.map(opt => `
            <span class="category-option-chip">
              <input type="text" value="${escapeHtml(opt)}" data-group="${g.id}" data-old="${escapeHtml(opt)}" onchange="renameCategoryOption(this.dataset.group, this.dataset.old, this.value)">
              <button type="button" data-group="${g.id}" data-value="${escapeHtml(opt)}" onclick="deleteCategoryOption(this.dataset.group, this.dataset.value)" title="${t('common.delete')}">&times;</button>
            </span>
          `).join('')}
          <span class="category-option-add">
            <input type="text" id="newoption-${g.id}" placeholder="${t('category.optionPlaceholder')}" onkeydown="if(event.key==='Enter'){ addCategoryOption('${g.id}'); event.preventDefault(); }">
            <button type="button" onclick="addCategoryOption('${g.id}')">${t('category.addOption')}</button>
          </span>
        </div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteCategoryGroup('${g.id}')">${t('common.delete')}</button>
    </div>
  `).join('');
  const newCategoryGroupForm = state.newCategoryGroupFormOpen ? `
    <div class="settings-form">
      <div>
        <label>${t('category.groupNameLabel')}</label>
        <input type="text" id="newcatgroup-name" placeholder="${t('category.groupNamePlaceholder')}">
      </div>
      <div>
        <label>${t('category.optionsLabel')}</label>
        <div id="newcatgroup-options-container">
          <input type="text" class="newcatgroup-option-input" placeholder="${t('category.optionPlaceholder')} 1" style="margin-bottom:6px; display:block;">
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="addNewCategoryGroupOptionField()">${t('category.addOption')}</button>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addCategoryGroup()">${t('category.createGroup')}</button>
        <button class="btn btn-ghost" onclick="toggleNewCategoryGroupForm()">${t('common.cancel')}</button>
      </div>
    </div>
  ` : `
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      ${availablePresets.map(p => `<button class="btn btn-sm" onclick="addCategoryPreset('${p.key}')">+ ${escapeHtml(p.name())}</button>`).join('')}
      <button class="btn" onclick="toggleNewCategoryGroupForm()">${t('category.newGroup')}</button>
    </div>
  `;
  return `
    <div class="settings-section">
      <h3>${t('category.heading')}</h3>
      <div class="settings-section-desc">${t('featureRegistry.categoriesDesc')}</div>
      <div class="type-list">${categoryGroupRows || `<div class="riders-hint" style="padding:0;">${t('category.noGroupsYet')}</div>`}</div>
      ${newCategoryGroupForm}
      ${groups.length ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <input type="file" id="import-categories-file" accept="application/json,.json" style="display:none;" onchange="onImportCategoriesFile(this)">
          <button class="btn btn-sm" onclick="document.getElementById('import-categories-file').click()">${t('category.importJson')}</button>
          <button class="btn btn-sm" onclick="exportCategoriesJSON()">${t('category.exportJson')}</button>
        </div>
      ` : `
        <div style="margin-top:12px;">
          <input type="file" id="import-categories-file" accept="application/json,.json" style="display:none;" onchange="onImportCategoriesFile(this)">
          <button class="btn btn-sm" onclick="document.getElementById('import-categories-file').click()">${t('category.importJson')}</button>
        </div>
      `}
    </div>
  `;
}
/* Selbstanmeldungen, die auf eine Entscheidung warten. Bewusst eine
   eigene Sektion statt einer Markierung in der Roster-Liste: das ist
   Arbeit, die am HQ-Tisch abgearbeitet wird, während der Fahrer davor
   steht — sie soll nicht zwischen 45 Startnummern gesucht werden.
   Fahrer-eingegebene Werte laufen durch escapeHtml() und nicht durch
   t(), sie sind Inhalt, keine Oberfläche. */
function renderRidersSectionPending(evt){
  const pending = pendingRiderRegistrations(evt);
  if(!pending.length){
    return `<div class="settings-section"><h3>${t('riderApp.pendingHeading')}</h3>${emptyStateHtml({
      icon: '📥',
      title: t('riderApp.pendingEmptyTitle'),
      description: t('riderApp.pendingEmptyDesc'),
      compact: true
    })}</div>`;
  }
  return `
    <div class="settings-section">
      <h3>${t('riderApp.pendingHeading')}</h3>
      <div class="settings-section-desc">${t('riderApp.pendingDesc')}</div>
      <div class="rider-pending-list">
        ${pending.map(r => {
          const d = r.pendingData || {};
          return `
            <div class="rider-pending-card">
              <div class="rider-pending-bib">#${r.bib}</div>
              <div class="rider-pending-body">
                <div class="rider-pending-name">${escapeHtml(d.name || t('riderApp.pendingNoName'))}</div>
                ${d.contact ? `<div class="rider-pending-line">${t('riderApp.pendingContact')}: ${escapeHtml(d.contact)}</div>` : ''}
                ${d.emergencyContact ? `<div class="rider-pending-line">${t('riderApp.pendingEmergency')}: ${escapeHtml(d.emergencyContact)}</div>` : ''}
              </div>
              <div class="rider-pending-actions">
                <button type="button" class="btn btn-primary btn-sm" onclick="confirmPendingRider(${r.bib})">${t('riderApp.confirmButton')}</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="rejectPendingRider(${r.bib})">${t('riderApp.rejectButton')}</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
function renderRidersSectionCardDesign(evt){
  return `
    <div class="settings-section">
      <h3>${t('rider.cardDesignToggle')}</h3>
      <div class="settings-section-desc">${t('rider.cardDesignDesc')}</div>
      <div class="spokecard-design">
        <label>${t('rider.cardDesignLabel')}</label>
        <div class="spokecard-design-row">
          ${evt.spokeCardImage ? `<img class="spokecard-design-preview" src="${evt.spokeCardImage}" alt="${t('rider.cardDesignPreviewAlt')}">` : ''}
          <input type="file" accept="image/*" onchange="onSpokeCardImageUpload(this)">
          ${evt.spokeCardImage ? `<button class="btn btn-ghost btn-sm" onclick="clearSpokeCardImage()">${t('common.remove')}</button>` : ''}
        </div>
        <div class="riders-hint" style="margin:6px 0 0;">${t('rider.cardDesignHint')}</div>
      </div>
    </div>
  `;
}
/* Erste organizer-seitige UI für evt.riderApp.* überhaupt — .progress/
   .map/.leaderboard haben ebenfalls keine Oberfläche (Nebenfund während
   der Design-Recherche, siehe Design-Doku §9), bleiben hier aber bewusst
   unangetastet: nur .selfRegister gehört zu diesem Umbau. */
function renderRidersSectionSelfRegister(evt){
  const enabled = !!(evt.riderApp && evt.riderApp.selfRegister);
  const link = (riderAppBaseUrl() && evt.publicId) ? buildSelfRegisterQrPayload(riderAppBaseUrl(), evt) : '';
  return `
    <div class="settings-section">
      <h3>${t('riderApp.selfRegisterHeading')}</h3>
      <div class="settings-section-desc">${t('riderApp.selfRegisterDesc')}</div>
      <label class="checkbox-row">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleSelfRegister(this.checked)">
        ${t('riderApp.selfRegisterToggleLabel')}
      </label>
      ${enabled ? `
        <div style="margin-top:14px;">
          <label>${t('riderApp.selfRegisterLinkLabel')}</label>
          ${link ? `
            <div class="coord-edit-row">
              <input type="text" class="mono" id="self-register-link-input" readonly value="${escapeHtml(link)}" onclick="this.select()">
              <button type="button" class="btn btn-sm" onclick="copySelfRegisterLink()">${t('riderApp.selfRegisterCopyButton')}</button>
            </div>
          ` : `<div class="settings-hint">${t('riderApp.selfRegisterLinkPending')}</div>`}
        </div>
      ` : ''}
    </div>
  `;
}
function toggleSelfRegister(checked){
  const evt = state.currentEvent; if(!evt) return;
  evt.riderApp = evt.riderApp || {};
  evt.riderApp.selfRegister = checked;
  debouncedSave();
  renderRiders();
}
function copySelfRegisterLink(){
  const input = document.getElementById('self-register-link-input');
  if(!input) return;
  input.select();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(input.value)
      .then(() => showToast({message: t('riderApp.selfRegisterCopiedToast')}))
      .catch(() => {});
  }
}
function ridersSectionContent(evt, id){
  switch(id){
    case 'pending': return renderRidersSectionPending(evt);
    case 'bulkImport': return renderRidersSectionBulkImport(evt);
    case 'teams': return renderRidersSectionTeams(evt);
    case 'categories': return renderRidersSectionCategories(evt);
    case 'cardDesign': return renderRidersSectionCardDesign(evt);
    case 'selfRegister': return renderRidersSectionSelfRegister(evt);
    case 'roster':
    default: return renderRidersSectionRoster(evt);
  }
}
function renderRiders(){
  const el = document.getElementById('view-riders');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('rider.noEventSelected')}</div>`;
    return;
  }
  if(!ridersNavItem(evt, state.ridersSection)) state.ridersSection = 'roster';
  el.innerHTML = `
    <div class="settings-layout ${state.ridersMobileDetailOpen ? 'settings-mobile-detail' : 'settings-mobile-list'}">
      ${renderRidersSidebar(evt)}
      <div class="settings-content">
        <button type="button" class="settings-mobile-back" onclick="closeRidersMobileDetail()">${t('rider.backToList')}</button>
        ${ridersSectionContent(evt, state.ridersSection)}
      </div>
    </div>
  `;
  (evt.riders || []).forEach(r => {
    const container = document.getElementById('qr-' + r.bib);
    if(container && window.QRCode){
      container.innerHTML = '';
      new QRCode(container, {text: String(r.bib), width: 84, height: 84, colorDark: '#241f18', colorLight: '#eee5cd'});
    }
  });
}

