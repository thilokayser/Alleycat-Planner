/* ---------------- riders ---------------- */
function withRiderDefaults(rider){
  return Object.assign({
    name: '',
    teamId: null,
    finishTime: '',
    completed: [],
    scores: {},
    checkpointTimes: {}
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
    ${state.printPopupBlocked ? `<div class="riders-hint warn">${t('rider.printPopupBlocked')}</div>` : ''}
    <div class="settings-section" style="margin:0 0 22px;">
      <h3 style="font-size:15px;">${t('rider.teamsHeading')}</h3>
      <div class="type-list">${teamRows || `<div class="riders-hint" style="padding:0;">${t('rider.noTeamsYet')}</div>`}</div>
      ${newTeamForm}
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

