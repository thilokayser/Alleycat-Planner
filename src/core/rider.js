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
    gameFlags: {}
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
    next.push(existing.find(r => r.bib === i) || {bib: i, name: '', emergencyContact: '', finishTime: '', completed: [], scores: {}, checkpointTimes: {}});
  }
  evt.riders = next;
  debouncedSave();
  renderRiders();
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
function renderRiders(){
  const el = document.getElementById('view-riders');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('rider.noEventSelected')}</div>`;
    return;
  }
  const riders = evt.riders || [];
  const teams = evt.teams || [];
  const groups = (evt.categoryGroups || []).slice().sort((a,b) => a.sortOrder - b.sortOrder);
  const cards = riders.map(r => `
    <div class="rider-card">
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
      ${groups.length ? `<div class="rider-categories-row">
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

  const availablePresets = CATEGORY_PRESETS.filter(p => !groups.some(g => g.name === p.name));
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
      ${availablePresets.map(p => `<button class="btn btn-sm" onclick="addCategoryPreset('${p.key}')">+ ${escapeHtml(p.name)}</button>`).join('')}
      <button class="btn" onclick="toggleNewCategoryGroupForm()">${t('category.newGroup')}</button>
    </div>
  `;

  el.innerHTML = `
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
          <button class="btn" onclick="window.print()">${t('rider.printBibs')}</button>
          <button class="btn" onclick="exportRidersPDF()" ${state.riderSheetGenerating ? 'disabled' : ''}>${state.riderSheetGenerating ? t('common.generating') : t('rider.bibsPdf')}</button>
          <button class="btn" onclick="printSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? t('common.generating') : t('rider.printSpokecards')}</button>
          <button class="btn btn-primary" onclick="exportSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? t('rider.generatingSpokecards') : t('rider.spokecardsPdf')}</button>
        </div>
      ` : ''}
    </div>
    ${riders.length ? `<div class="riders-hint">${t('rider.spokecardHint')}</div>` : ''}
    ${riders.length ? `<div class="riders-hint">${t('pdfBlocks.spokecardsHint')} <a href="#" onclick="event.preventDefault(); openManifest(); state.pdfBlocksPanelOpen = true; render();">${t('pdfBlocks.toggleButton')}</a></div>` : ''}
    ${state.printPopupBlocked ? `<div class="riders-hint warn">${t('rider.printPopupBlocked')}</div>` : ''}
    <div class="settings-section" style="margin:0 0 22px;">
      <h3 style="font-size:15px;">${t('rider.teamsHeading')}</h3>
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
    <div class="settings-section" style="margin:0 0 22px;">
      <h3 style="font-size:15px;">${t('category.heading')}</h3>
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
    <div class="spokecard-design">
      <label>${t('rider.cardDesignLabel')}</label>
      <div class="spokecard-design-row">
        ${evt.spokeCardImage ? `<img class="spokecard-design-preview" src="${evt.spokeCardImage}" alt="${t('rider.cardDesignPreviewAlt')}">` : ''}
        <input type="file" accept="image/*" onchange="onSpokeCardImageUpload(this)">
        ${evt.spokeCardImage ? `<button class="btn btn-ghost btn-sm" onclick="clearSpokeCardImage()">${t('common.remove')}</button>` : ''}
      </div>
      <div class="riders-hint" style="margin:6px 0 0;">${t('rider.cardDesignHint')}</div>
    </div>
    ${riders.length === 0 ? `
      <div class="empty-state" style="max-width:520px; margin:20px auto;">
        <div class="display">${t('rider.emptyTitle')}</div>
        <p>${t('rider.emptyHint')}</p>
      </div>
    ` : `
      <div id="print-root">
        <div class="rider-sheet-head">
          <h2>${escapeHtml(evt.name || t('common.unnamedEvent'))}</h2>
          <div class="stamp-tag">${t('rider.bibsStamp')}</div>
        </div>
        <div class="rider-grid">${cards}</div>
      </div>
    `}
  `;

  riders.forEach(r => {
    const container = document.getElementById('qr-' + r.bib);
    if(container && window.QRCode){
      container.innerHTML = '';
      new QRCode(container, {text: String(r.bib), width: 84, height: 84, colorDark: '#241f18', colorLight: '#eee5cd'});
    }
  });
}

