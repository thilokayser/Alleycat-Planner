/* ---------------- bulk import (CSV Fahrerliste) ----------------
   3-step inline panel (rendered into rider.js's toolbar area, no
   modal/overlay needed — matches the pdf-blocks panel pattern):
   upload -> mapping -> review. Validates before import (missing/
   invalid/duplicate Startnummer) and surfaces an error list instead
   of silently skipping rows (spec 4.17) — only rows that pass
   validation are ever written to evt.riders/teams. The whole apply
   step is wrapped in logUndoableAction() so an accidental import can
   be undone like any other action-log entry. */
function detectCsvDelimiter(text){
  const firstLine = (text.split(/\r\n|\n|\r/)[0] || '');
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}
function parseCsvText(text){
  const delimiter = detectCsvDelimiter(text);
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i = 0; i < src.length; i++){
    const c = src[i];
    if(inQuotes){
      if(c === '"'){
        if(src[i + 1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if(c === '"'){ inQuotes = true; }
    else if(c === delimiter){ row.push(field); field = ''; }
    else if(c === '\n' || c === '\r'){
      if(c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c && c.trim() !== ''));
}
function guessBulkImportMapping(headerRow){
  const norm = s => (s || '').toLowerCase().trim();
  const find = (patterns) => {
    const idx = (headerRow || []).findIndex(h => patterns.some(p => norm(h).includes(p)));
    return idx > -1 ? String(idx) : '';
  };
  return {
    bib: find(['startnummer', 'bib', 'nr.', 'nr', 'nummer']),
    name: find(['name']),
    team: find(['team']),
    emergency: find(['notfall', 'emergency', 'kontakt'])
  };
}
function toggleBulkImportPanel(){
  state.bulkImportOpen = !state.bulkImportOpen;
  state.bulkImportStep = 'upload';
  state.bulkImportRows = [];
  state.bulkImportErrors = [];
  state.bulkImportValidRows = [];
  renderRiders();
}
async function onBulkImportFileChange(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const text = await file.text();
  const rows = parseCsvText(text);
  input.value = '';
  if(!rows.length){ alert(t('bulkImport.errorEmptyFile')); return; }
  state.bulkImportRows = rows;
  state.bulkImportHasHeader = true;
  state.bulkImportMapping = guessBulkImportMapping(rows[0]);
  state.bulkImportStep = 'mapping';
  renderRiders();
}
function onBulkImportHeaderToggle(checked){
  state.bulkImportHasHeader = checked;
  state.bulkImportMapping = guessBulkImportMapping(checked ? state.bulkImportRows[0] : []);
  renderRiders();
}
function onBulkImportMappingChange(field, value){
  state.bulkImportMapping[field] = value;
}
function backToBulkImportMapping(){
  state.bulkImportStep = 'mapping';
  renderRiders();
}
function runBulkImportValidation(){
  const rows = state.bulkImportRows;
  const map = state.bulkImportMapping;
  const dataRows = state.bulkImportHasHeader ? rows.slice(1) : rows;
  const lineOffset = state.bulkImportHasHeader ? 2 : 1;
  const errors = [];
  const valid = [];
  if(!map.bib){
    state.bulkImportErrors = [{line: 0, message: t('bulkImport.errorNoBibColumn')}];
    state.bulkImportValidRows = [];
    state.bulkImportStep = 'review';
    renderRiders();
    return;
  }
  const seenBibs = new Set();
  dataRows.forEach((row, i) => {
    const line = i + lineOffset;
    const bibRaw = (row[Number(map.bib)] || '').trim();
    if(!/^\d+$/.test(bibRaw) || parseInt(bibRaw, 10) <= 0){
      errors.push({line, message: t('bulkImport.errorInvalidBib', {value: bibRaw || '—'})});
      return;
    }
    const bib = parseInt(bibRaw, 10);
    if(seenBibs.has(bib)){
      errors.push({line, message: t('bulkImport.errorDuplicateBib', {bib})});
      return;
    }
    seenBibs.add(bib);
    valid.push({
      bib,
      name: map.name !== '' ? (row[Number(map.name)] || '').trim() : '',
      teamName: map.team !== '' ? (row[Number(map.team)] || '').trim() : '',
      emergencyContact: map.emergency !== '' ? (row[Number(map.emergency)] || '').trim() : ''
    });
  });
  state.bulkImportErrors = errors;
  state.bulkImportValidRows = valid;
  state.bulkImportStep = 'review';
  renderRiders();
}
function applyBulkImportRows(){
  const evt = state.currentEvent;
  const rows = state.bulkImportValidRows;
  if(!rows.length) return;
  const ridersSnapshot = JSON.parse(JSON.stringify(evt.riders || []));
  const teamsSnapshot = JSON.parse(JSON.stringify(evt.teams || []));
  const expectedSnapshot = evt.expectedRiders || 0;
  evt.riders = evt.riders || [];
  evt.teams = evt.teams || [];
  let created = 0, updated = 0;
  rows.forEach(row => {
    let r = evt.riders.find(x => x.bib === row.bib);
    if(!r){
      r = withRiderDefaults({bib: row.bib});
      evt.riders.push(r);
      created++;
    } else updated++;
    if(row.name) r.name = row.name;
    if(row.emergencyContact) r.emergencyContact = row.emergencyContact;
    if(row.teamName){
      let team = evt.teams.find(tm => tm.name === row.teamName);
      if(!team){
        team = {id: uid('team'), name: row.teamName, color: TEAM_COLOR_PALETTE[evt.teams.length % TEAM_COLOR_PALETTE.length]};
        evt.teams.push(team);
      }
      r.teamId = team.id;
    }
  });
  evt.riders.sort((a, b) => a.bib - b.bib);
  const maxBib = evt.riders.reduce((m, r) => Math.max(m, r.bib), 0);
  if(maxBib > (evt.expectedRiders || 0)) evt.expectedRiders = maxBib;
  state.bulkImportOpen = false;
  state.bulkImportStep = 'upload';
  state.bulkImportRows = [];
  state.bulkImportValidRows = [];
  state.bulkImportErrors = [];
  renderRiders();
  logUndoableAction(evt, t('actionLog.bulkImportApplied', {created, updated}), () => {
    evt.riders = ridersSnapshot;
    evt.teams = teamsSnapshot;
    evt.expectedRiders = expectedSnapshot;
    renderRiders();
  });
}
function bulkImportColumnOptions(selectedValue){
  const rows = state.bulkImportRows;
  const headerRow = rows[0] || [];
  return `<option value="">${t('bulkImport.columnNone')}</option>` + headerRow.map((h, i) => {
    const label = state.bulkImportHasHeader && h ? h : (t('bulkImport.columnFallback') + ' ' + (i + 1));
    return `<option value="${i}" ${String(selectedValue) === String(i) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}
function renderBulkImportPanel(){
  if(!state.bulkImportOpen) return '';
  const step = state.bulkImportStep;
  let body = '';
  if(step === 'upload'){
    body = `
      <p class="riders-hint" style="padding:0;">${t('bulkImport.uploadHint')}</p>
      <input type="file" accept=".csv,text/csv" onchange="onBulkImportFileChange(this)">
    `;
  } else if(step === 'mapping'){
    const map = state.bulkImportMapping;
    body = `
      <label class="bulk-import-header-toggle">
        <input type="checkbox" ${state.bulkImportHasHeader ? 'checked' : ''} onchange="onBulkImportHeaderToggle(this.checked)">
        ${t('bulkImport.hasHeaderLabel')}
      </label>
      <div class="bulk-import-mapping-grid">
        <div><label>${t('bulkImport.fieldBib')} *</label><select onchange="onBulkImportMappingChange('bib', this.value)">${bulkImportColumnOptions(map.bib)}</select></div>
        <div><label>${t('bulkImport.fieldName')}</label><select onchange="onBulkImportMappingChange('name', this.value)">${bulkImportColumnOptions(map.name)}</select></div>
        <div><label>${t('bulkImport.fieldTeam')}</label><select onchange="onBulkImportMappingChange('team', this.value)">${bulkImportColumnOptions(map.team)}</select></div>
        <div><label>${t('bulkImport.fieldEmergency')}</label><select onchange="onBulkImportMappingChange('emergency', this.value)">${bulkImportColumnOptions(map.emergency)}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" onclick="runBulkImportValidation()">${t('bulkImport.validateButton')}</button>
        <button class="btn btn-ghost" onclick="toggleBulkImportPanel()">${t('common.cancel')}</button>
      </div>
    `;
  } else if(step === 'review'){
    const errors = state.bulkImportErrors;
    const valid = state.bulkImportValidRows;
    body = `
      <div class="bulk-import-summary">
        <span class="bulk-import-summary-ok">${t('bulkImport.summaryValid', {count: valid.length})}</span>
        ${errors.length ? `<span class="bulk-import-summary-err">${t('bulkImport.summaryErrors', {count: errors.length})}</span>` : ''}
      </div>
      ${errors.length ? `
        <ul class="bulk-import-error-list">
          ${errors.map(e => `<li>${e.line ? t('bulkImport.errorLinePrefix', {line: e.line}) + ' ' : ''}${escapeHtml(e.message)}</li>`).join('')}
        </ul>
      ` : ''}
      ${valid.length ? `
        <table class="bulk-import-preview-table">
          <thead><tr><th>${t('bulkImport.fieldBib')}</th><th>${t('bulkImport.fieldName')}</th><th>${t('bulkImport.fieldTeam')}</th></tr></thead>
          <tbody>
            ${valid.slice(0, 8).map(r => `<tr><td>${r.bib}</td><td>${escapeHtml(r.name || '—')}</td><td>${escapeHtml(r.teamName || '—')}</td></tr>`).join('')}
          </tbody>
        </table>
        ${valid.length > 8 ? `<div class="riders-hint" style="padding:0;">${t('bulkImport.previewMore', {count: valid.length - 8})}</div>` : ''}
      ` : ''}
      <div class="form-actions">
        <button class="btn btn-primary" onclick="applyBulkImportRows()" ${valid.length ? '' : 'disabled'}>${t('bulkImport.applyButton', {count: valid.length})}</button>
        <button class="btn btn-ghost" onclick="backToBulkImportMapping()">${t('common.back')}</button>
        <button class="btn btn-ghost" onclick="toggleBulkImportPanel()">${t('common.cancel')}</button>
      </div>
    `;
  }
  return `<div class="bulk-import-panel">${body}</div>`;
}
