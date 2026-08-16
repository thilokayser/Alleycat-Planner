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
  if(willLose.length && !confirm(`Beim Verkleinern gehen ${willLose.length} bereits erfasste Check-in${willLose.length===1?'':'s'} verloren (Bib ${willLose.map(r=>r.bib).join(', ')}). Fortfahren?`)) return;
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
    el.innerHTML = `<div class="loading-row">Kein Event ausgew\u00e4hlt.</div>`;
    return;
  }
  const riders = evt.riders || [];
  const teams = evt.teams || [];
  const cards = riders.map(r => `
    <div class="rider-card">
      <div class="rider-qr" id="qr-${r.bib}"></div>
      <div class="rider-bib">#${r.bib}</div>
      <input type="text" class="rider-name-input" placeholder="Name (optional)" value="${escapeHtml(r.name || '')}" oninput="onRiderNameInput(${r.bib}, this.value)">
      <div class="rider-team-row">
        ${r.teamId ? `<span class="team-dot" style="background:${escapeHtml(getTeam(evt, r.teamId)?.color || '#7c8388')}"></span>` : ''}
        <select class="rider-team-select" onchange="onRiderTeamChange(${r.bib}, this.value)">
          <option value="">— Kein Team —</option>
          ${teams.map(t => `<option value="${t.id}" ${r.teamId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <input type="text" class="rider-emergency-input" placeholder="Notfallkontakt (Name &amp; Telefon)" value="${escapeHtml(r.emergencyContact || '')}" oninput="onRiderEmergencyInput(${r.bib}, this.value)">
    </div>
  `).join('');

  const teamRows = teams.map(t => `
    <div class="type-row">
      <input type="color" class="team-color-input" value="${escapeHtml(t.color)}" onchange="setTeamColor('${t.id}', this.value)" title="Team-Farbe">
      <div class="type-info">
        <input type="text" class="team-name-input" value="${escapeHtml(t.name)}" onchange="renameTeam('${t.id}', this.value)">
        <div class="type-meta">${riders.filter(r => r.teamId === t.id).length} Fahrer</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteTeam('${t.id}')">Löschen</button>
    </div>
  `).join('');
  const newTeamForm = state.newTeamFormOpen ? `
    <div class="settings-form">
      <div class="row2">
        <div>
          <label>Team-Name</label>
          <input type="text" id="newteam-name" placeholder="z. B. Team Rot">
        </div>
        <div>
          <label>Farbe</label>
          <input type="color" id="newteam-color" value="${TEAM_COLOR_PALETTE[teams.length % TEAM_COLOR_PALETTE.length]}">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="addTeam()">Team anlegen</button>
        <button class="btn btn-ghost" onclick="toggleNewTeamForm()">Abbrechen</button>
      </div>
    </div>
  ` : `<button class="btn" onclick="toggleNewTeamForm()">+ Neues Team</button>`;

  el.innerHTML = `
    <div class="riders-toolbar">
      <div class="riders-count-field">
        <div>
          <label>Erwartete Fahrer</label>
          <input type="text" inputmode="numeric" value="${evt.expectedRiders || 0}" oninput="onExpectedRidersInput(this.value)">
        </div>
        <button class="btn" onclick="generateRiderSlots()">Liste generieren / aktualisieren</button>
      </div>
      ${riders.length ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn" onclick="window.print()">Startnummern drucken</button>
          <button class="btn" onclick="exportRidersPDF()" ${state.riderSheetGenerating ? 'disabled' : ''}>${state.riderSheetGenerating ? 'Generiere…' : 'Startnummern (PDF)'}</button>
          <button class="btn" onclick="printSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? 'Generiere…' : 'Spokecards drucken'}</button>
          <button class="btn btn-primary" onclick="exportSpokeCardsPDF()" ${state.spokeCardsGenerating ? 'disabled' : ''}>${state.spokeCardsGenerating ? 'Generiere Spokecards…' : 'Spokecards (PDF)'}</button>
        </div>
      ` : ''}
    </div>
    ${riders.length ? `<div class="riders-hint">Spokecards im Pokerkarten-Format (63,5 × 88,9 mm): Vorderseite mit Event-Design, Rückseite mit individuellem QR-Code je Fahrer. Die PDF enthält erst alle Vorderseiten, danach alle Rückseiten in gleicher Reihenfolge — zum Duplex-Drucken oder für den Copyshop.</div>` : ''}
    ${state.printPopupBlocked ? `<div class="riders-hint warn">Pop-up wurde vom Browser blockiert. Bitte Pop-ups für diese Seite erlauben und „Spokecards drucken" erneut klicken.</div>` : ''}
    <div class="settings-section" style="margin:0 0 22px;">
      <h3 style="font-size:15px;">Teams</h3>
      <div class="type-list">${teamRows || '<div class="riders-hint" style="padding:0;">Noch keine Teams angelegt.</div>'}</div>
      ${newTeamForm}
    </div>
    <div class="spokecard-design">
      <label>Eigenes Kartendesign (Vorderseite)</label>
      <div class="spokecard-design-row">
        ${evt.spokeCardImage ? `<img class="spokecard-design-preview" src="${evt.spokeCardImage}" alt="Kartendesign-Vorschau">` : ''}
        <input type="file" accept="image/*" onchange="onSpokeCardImageUpload(this)">
        ${evt.spokeCardImage ? `<button class="btn btn-ghost btn-sm" onclick="clearSpokeCardImage()">Entfernen</button>` : ''}
      </div>
      <div class="riders-hint" style="margin:6px 0 0;">Wird automatisch auf Kartenformat zugeschnitten. Ohne Upload wird ein generiertes Stempel-Design mit Event-Name verwendet.</div>
    </div>
    ${riders.length === 0 ? `
      <div class="empty-state" style="max-width:520px; margin:20px auto;">
        <div class="display">Noch keine Fahrerliste</div>
        <p>Trag oben die erwartete Fahreranzahl ein und generiere die Startnummern samt individuellem QR-Code je Fahrer.</p>
      </div>
    ` : `
      <div id="print-root">
        <div class="rider-sheet-head">
          <h2>${escapeHtml(evt.name || 'Unbenanntes Event')}</h2>
          <div class="stamp-tag">Startnummern</div>
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

