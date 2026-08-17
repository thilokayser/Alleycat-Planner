/* ---------------- checkpoint types ---------------- */
function withCheckpointDefaults(cp){
  return Object.assign({
    clue: '',
    mandatory: true,
    type: CHECKPOINT_TYPES[0].key,
    customQuestion: '',
    punchCode: '',
    timeWindowEnabled: false,
    timeWindowStart: '',
    timeWindowEnd: '',
    locked: false,
    staff: [],
    gameHidden: false,
    gameRevealPrerequisiteCpId: ''
  }, cp);
}
function withCpStaffDefaults(s){
  return Object.assign({id: uid('staff'), name: '', phone: '', role: '', shiftNote: '', notes: ''}, s);
}
/* Single source of truth for all checkpoint-type behavior. Add an entry here
   to introduce a new type — every dropdown, icon, manifest cell and check-in
   control derives from this list instead of scattered type === 'x' checks. */
let CHECKPOINT_TYPES = [
  {key: 'qr', icon: '\ud83d\udd32', shortLabel: 'QR', fullLabel: t('checkpoint.types.qr.full'), dropdownLabel: t('checkpoint.types.qr.dropdown'), referenceFieldLabel: t('checkpoint.types.qr.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'photo', icon: '\ud83d\udcf7', shortLabel: 'FOTO', fullLabel: t('checkpoint.types.photo.full'), dropdownLabel: t('checkpoint.types.photo.dropdown'), referenceFieldLabel: t('checkpoint.types.photo.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'item', icon: '\ud83d\udce6', shortLabel: 'ITEM', fullLabel: t('checkpoint.types.item.full'), dropdownLabel: t('checkpoint.types.item.dropdown'), referenceFieldLabel: t('checkpoint.types.item.ref'), hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'custom', icon: '\u2753', shortLabel: 'R\u00c4TSEL', fullLabel: t('checkpoint.types.custom.full'), dropdownLabel: t('checkpoint.types.custom.dropdown'), referenceFieldLabel: t('checkpoint.types.custom.ref'), hasCustomQuestion: true, isScored: false, scoreMax: 0, manifestCell: 'answer-line'},
  {key: 'challenge', icon: '\ud83c\udfc6', shortLabel: 'CHALLENGE', fullLabel: t('checkpoint.types.challenge.full'), dropdownLabel: t('checkpoint.types.challenge.dropdown'), referenceFieldLabel: t('checkpoint.types.challenge.ref'), hasCustomQuestion: false, isScored: true, scoreMax: 10, manifestCell: 'score-line'}
];
const BUILTIN_CHECKPOINT_TYPE_KEYS = CHECKPOINT_TYPES.map(t => t.key);
function getCheckpointType(key){
  return CHECKPOINT_TYPES.find(t => t.key === key) || CHECKPOINT_TYPES[0];
}
function typeLabel(t){ return getCheckpointType(t).shortLabel; }
function typeFullLabel(t){ return getCheckpointType(t).fullLabel; }
function typeIcon(t){ return getCheckpointType(t).icon; }

/* ---------------- custom checkpoint types ---------------- */
async function loadCustomCheckpointTypes(){
  try{
    const res = await storageGet('checkpointTypes:custom');
    const custom = res ? JSON.parse(res.value) : [];
    CHECKPOINT_TYPES = [...CHECKPOINT_TYPES.filter(t => BUILTIN_CHECKPOINT_TYPE_KEYS.includes(t.key)), ...custom];
  }catch(e){ /* keep builtins only */ }
}
async function saveCustomCheckpointTypes(){
  const custom = CHECKPOINT_TYPES.filter(t => !BUILTIN_CHECKPOINT_TYPE_KEYS.includes(t.key));
  await storageSet('checkpointTypes:custom', JSON.stringify(custom));
}
function slugifyTypeKey(label){
  let base = 'custom-' + String(label).toLowerCase()
    .replace(/[\u00e4\u00f6\u00fc]/g, c => ({\u00e4: 'ae', \u00f6: 'oe', \u00fc: 'ue'}[c]))
    .replace(/\u00df/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  if(base === 'custom-' || base === 'custom') base = 'custom-typ';
  let key = base, i = 2;
  while(CHECKPOINT_TYPES.some(t => t.key === key)){ key = base + '-' + i; i++; }
  return key;
}
function toggleNewTypeForm(){
  state.newTypeFormOpen = !state.newTypeFormOpen;
  renderSettings();
}
function addCustomCheckpointType(){
  const icon = (document.getElementById('newtype-icon').value || '').trim() || '\ud83d\udccd';
  const shortLabel = (document.getElementById('newtype-short').value || '').trim().toUpperCase();
  const label = (document.getElementById('newtype-label').value || '').trim();
  const hasCustomQuestion = document.getElementById('newtype-question').checked;
  const isScored = document.getElementById('newtype-scored').checked;
  const scoreMax = isScored ? (parseInt(document.getElementById('newtype-scoremax').value, 10) || 10) : 0;
  if(!label){ alert(t('checkpoint.newTypeNamePrompt')); return; }
  const key = slugifyTypeKey(shortLabel || label);
  const manifestCell = isScored ? 'score-line' : (hasCustomQuestion ? 'answer-line' : 'punch-box');
  CHECKPOINT_TYPES.push({
    key, icon, shortLabel: (shortLabel || label.toUpperCase()).slice(0, 14), fullLabel: label,
    dropdownLabel: label, referenceFieldLabel: t('checkpoint.defaultRefFieldLabel'),
    hasCustomQuestion, isScored, scoreMax, manifestCell
  });
  saveCustomCheckpointTypes();
  state.newTypeFormOpen = false;
  renderSettings();
}
function deleteCustomCheckpointType(key){
  if(!confirm(t('checkpoint.deleteTypeConfirm'))) return;
  CHECKPOINT_TYPES = CHECKPOINT_TYPES.filter(t => t.key !== key);
  saveCustomCheckpointTypes();
  renderSettings();
}


/* ---------------- checkpoint + event-field edit helpers ---------------- */
/* ---------------- checkpoint edit helpers ---------------- */
function findCp(id){
  return state.currentEvent.checkpoints.find(c => c.id === id);
}
function selectCp(id){
  state.editingId = (state.editingId === id) ? null : id;
  renderSidebar();
  const cp = findCp(id);
  if(cp && map) map.flyTo([cp.lat, cp.lng], Math.max(map.getZoom(), 15), {duration: 0.6});
}
function onCpRowClick(e, id){
  if(e.shiftKey){
    e.preventDefault();
    toggleCpBulkSelect(id);
    return;
  }
  selectCp(id);
}
function toggleCpBulkSelect(id){
  const idx = state.cpBulkSelectedIds.indexOf(id);
  if(idx === -1) state.cpBulkSelectedIds.push(id); else state.cpBulkSelectedIds.splice(idx, 1);
  renderSidebar();
}
function clearCpBulkSelection(){
  state.cpBulkSelectedIds = [];
  renderSidebar();
}
function selectedBulkCheckpoints(){
  const evt = state.currentEvent;
  const locked = isCpLocked(evt);
  return evt.checkpoints.filter(cp => state.cpBulkSelectedIds.includes(cp.id) && !cp.locked && !locked);
}
function bulkAssignType(typeKey){
  const cps = selectedBulkCheckpoints();
  if(!cps.length || !typeKey) return;
  cps.forEach(cp => cp.type = typeKey);
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function bulkMarkMandatory(){
  const cps = selectedBulkCheckpoints();
  if(!cps.length) return;
  cps.forEach(cp => cp.mandatory = true);
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function bulkLockCheckpoints(){
  const cps = selectedBulkCheckpoints();
  if(!cps.length) return;
  cps.forEach(cp => cp.locked = true);
  debouncedSave();
  renderSidebar();
}
function bulkDeleteCheckpoints(){
  const cps = selectedBulkCheckpoints();
  if(!cps.length) return;
  if(!confirm(t('checkpoint.bulkDeleteConfirm', {count: cps.length}))) return;
  const ids = cps.map(cp => cp.id);
  if(ids.includes(state.editingId)) state.editingId = null;
  state.currentEvent.checkpoints = state.currentEvent.checkpoints.filter(c => !ids.includes(c.id));
  state.currentEvent.checkpoints.forEach((c, i) => c.order = i + 1);
  state.cpBulkSelectedIds = [];
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function renderCpBulkActionsBar(){
  if(!state.cpBulkSelectedIds.length) return '';
  const typeOptions = CHECKPOINT_TYPES.map(ct => `<option value="${ct.key}">${ct.dropdownLabel}</option>`).join('');
  return `
    <div class="cp-bulk-bar">
      <span class="cp-bulk-count">${t('checkpoint.bulkSelectedCount', {count: state.cpBulkSelectedIds.length})}</span>
      <select onchange="if(this.value){ bulkAssignType(this.value); this.value=''; }">
        <option value="">${t('checkpoint.bulkAssignType')}</option>
        ${typeOptions}
      </select>
      <button type="button" class="btn btn-sm" onclick="bulkMarkMandatory()">${t('checkpoint.bulkMarkMandatory')}</button>
      <button type="button" class="btn btn-sm" onclick="bulkLockCheckpoints()">${t('checkpoint.bulkLock')}</button>
      <button type="button" class="btn btn-sm btn-danger" onclick="bulkDeleteCheckpoints()">${t('checkpoint.bulkDelete')}</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="clearCpBulkSelection()">${t('common.cancel')}</button>
    </div>
  `;
}
function onCpDragStart(e, id){
  e.stopPropagation();
  if(e.button) return;
  const row = e.target.closest('.cp-row');
  const list = document.querySelector('.cp-list');
  if(!row || !list) return;
  cpDragState = {row, list};
  row.classList.add('dragging');
  row.setPointerCapture(e.pointerId);
  row.addEventListener('pointermove', onCpDragMove);
  row.addEventListener('pointerup', onCpDragEnd);
  row.addEventListener('pointercancel', onCpDragEnd);
}
function onCpDragMove(e){
  if(!cpDragState) return;
  const {row, list} = cpDragState;
  const listRect = list.getBoundingClientRect();
  const edgeZone = 36;
  if(e.clientY < listRect.top + edgeZone) list.scrollTop -= 10;
  else if(e.clientY > listRect.bottom - edgeZone) list.scrollTop += 10;

  const siblings = Array.from(list.querySelectorAll('.cp-row')).filter(r => r !== row);
  let target = null;
  for(const sibling of siblings){
    const rect = sibling.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if(e.clientY < mid){ target = sibling; break; }
  }
  if(target){
    if(row.nextElementSibling !== target) list.insertBefore(row, target);
  } else if(list.lastElementChild !== row){
    list.appendChild(row);
  }
}
function onCpDragEnd(e){
  if(!cpDragState) return;
  const {row, list} = cpDragState;
  row.classList.remove('dragging');
  try{ row.releasePointerCapture(e.pointerId); }catch(err){}
  row.removeEventListener('pointermove', onCpDragMove);
  row.removeEventListener('pointerup', onCpDragEnd);
  row.removeEventListener('pointercancel', onCpDragEnd);
  cpDragState = null;

  const newOrderIds = Array.from(list.querySelectorAll('.cp-row')).map(r => r.dataset.cpId);
  const cps = state.currentEvent.checkpoints;
  const byId = new Map(cps.map(c => [c.id, c]));
  const reordered = newOrderIds.map(id => byId.get(id)).filter(Boolean);
  if(reordered.length !== cps.length){ renderSidebar(); return; }
  reordered.forEach((c, i) => c.order = i + 1);
  state.currentEvent.checkpoints = reordered;
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function moveCp(id, dir){
  const list = state.currentEvent.checkpoints;
  const idx = list.findIndex(c => c.id === id);
  if(idx === -1 || list[idx].locked || isCpLocked(state.currentEvent)) return;
  const swap = idx + dir;
  if(swap < 0 || swap >= list.length) return;
  [list[idx], list[swap]] = [list[swap], list[idx]];
  list.forEach((c,i) => c.order = i+1);
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function toggleCpLocked(id){
  const cp = findCp(id); if(!cp || isCpLocked(state.currentEvent)) return;
  cp.locked = !cp.locked;
  debouncedSave();
  renderSidebar();
}
function askDeleteCp(id){
  state.confirmDeleteCpId = id;
  renderSidebar();
}
function confirmDeleteCp(id){
  const cp = findCp(id);
  if(cp && (cp.locked || isCpLocked(state.currentEvent))) return;
  state.currentEvent.checkpoints = state.currentEvent.checkpoints.filter(c => c.id !== id);
  state.currentEvent.checkpoints.forEach((c,i) => c.order = i+1);
  if(state.editingId === id) state.editingId = null;
  state.confirmDeleteCpId = null;
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function onEditName(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.name = value;
  const rowName = document.getElementById('row-name-' + id);
  if(rowName) rowName.textContent = value || t('checkpoint.noName');
  debouncedSave();
}
function onEditClue(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.clue = value;
  debouncedSave();
}
function onEditPunch(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.punchCode = value;
  debouncedSave();
}
function onEditMandatory(id, checked){
  const cp = findCp(id); if(!cp) return;
  cp.mandatory = checked;
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function onEditType(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.type = value;
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function onEditCustomQuestion(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.customQuestion = value;
  debouncedSave();
}
function onEditTimeWindowEnabled(id, checked){
  const cp = findCp(id); if(!cp) return;
  cp.timeWindowEnabled = checked;
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function onEditTimeWindowStart(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.timeWindowStart = value;
  debouncedSave();
  redrawMarkers();
}
function onEditTimeWindowEnd(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.timeWindowEnd = value;
  debouncedSave();
  redrawMarkers();
}
function onEditGameHidden(id, checked){
  const cp = findCp(id); if(!cp) return;
  cp.gameHidden = checked;
  debouncedSave();
  renderSidebar();
}
function onEditGameRevealPrerequisite(id, value){
  const cp = findCp(id); if(!cp) return;
  cp.gameRevealPrerequisiteCpId = value;
  debouncedSave();
}
function onEditLat(id, value){
  const cp = findCp(id); if(!cp) return;
  const n = parseFloat(value);
  if(isNaN(n)) return;
  cp.lat = n;
  debouncedSave();
  redrawMarkers();
}
function onEditLng(id, value){
  const cp = findCp(id); if(!cp) return;
  const n = parseFloat(value);
  if(isNaN(n)) return;
  cp.lng = n;
  debouncedSave();
  redrawMarkers();
}
function duplicateCheckpoint(id){
  const evt = state.currentEvent;
  const cp = findCp(id); if(!cp || isCpLocked(evt) || cp.locked) return;
  const copy = Object.assign({}, cp, {
    id: uid('cp'),
    order: evt.checkpoints.length + 1,
    name: cp.name ? t('checkpoint.duplicateSuffix', {name: cp.name}) : cp.name,
    lat: cp.lat + 0.0005,
    lng: cp.lng + 0.0005,
    locked: false,
    staff: (cp.staff || []).map(s => Object.assign({}, s, {id: uid('staff')}))
  });
  evt.checkpoints.push(copy);
  debouncedSave();
  state.editingId = copy.id;
  renderSidebar();
  redrawMarkers();
}

/* ---------------- checkpoint personnel ---------------- */
function addCpStaff(cpId){
  const cp = findCp(cpId); if(!cp || isCpLocked(state.currentEvent) || cp.locked) return;
  cp.staff = cp.staff || [];
  cp.staff.push(withCpStaffDefaults({}));
  debouncedSave();
  renderSidebar();
}
function removeCpStaff(cpId, staffId){
  const cp = findCp(cpId); if(!cp) return;
  cp.staff = (cp.staff || []).filter(s => s.id !== staffId);
  debouncedSave();
  renderSidebar();
}
function onCpStaffFieldChange(cpId, staffId, field, value){
  const cp = findCp(cpId); if(!cp) return;
  const s = (cp.staff || []).find(s => s.id === staffId); if(!s) return;
  s[field] = value;
  debouncedSave();
}
function toggleSettings(){
  state.settingsOpen = !state.settingsOpen;
  renderSidebar();
}
function onStartModeChange(value){
  state.currentEvent.startMode = value;
  debouncedSave();
  renderSidebar();
}
function onStartTimeChange(value){
  state.currentEvent.startTime = value;
  debouncedSave();
}
function onCurfewModeChange(value){
  state.currentEvent.curfewMode = value;
  debouncedSave();
  renderSidebar();
}
function onCurfewTimeChange(value){
  state.currentEvent.curfewTime = value;
  debouncedSave();
}
function onCurfewPenaltyChange(value){
  state.currentEvent.curfewPenaltyPerMin = value;
  debouncedSave();
}
function toggleAddMode(){
  if(isCpLocked(state.currentEvent)) return;
  state.addMode = !state.addMode;
  renderSidebar();
}
function cpTimeWindowStatus(cp){
  if(!cp.timeWindowEnabled || !cp.timeWindowStart || !cp.timeWindowEnd) return null;
  const now = new Date();
  const start = new Date(cp.timeWindowStart);
  const end = new Date(cp.timeWindowEnd);
  if(isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if(now < start) return 'upcoming';
  if(now > end) return 'closed';
  return 'open';
}
function onCpListGroupByChange(value){
  state.cpListGroupBy = value;
  renderSidebar();
}
function onCheckpointOrderModeChange(value){
  const evt = state.currentEvent;
  if(!evt || isCpLocked(evt)) return;
  evt.checkpointOrderMode = value;
  debouncedSave();
  renderSidebar();
}
function onEventNameInput(value){
  state.currentEvent.name = value;
  const idxItem = state.eventsIndex.find(e => e.id === state.currentEvent.id);
  if(idxItem) idxItem.name = value;
  debouncedSave();
  clearTimeout(window.__idxSaveTimeout);
  window.__idxSaveTimeout = setTimeout(saveEventsIndex, 600);
}
function onEventDateInput(value){
  state.currentEvent.date = value;
  const idxItem = state.eventsIndex.find(e => e.id === state.currentEvent.id);
  if(idxItem) idxItem.date = value;
  debouncedSave();
  clearTimeout(window.__idxSaveTimeout);
  window.__idxSaveTimeout = setTimeout(saveEventsIndex, 600);
}

/* ---------------- render: editor sidebar ---------------- */
function renderCpRow(cp, cpIdx, evt, locked, routeInfo, groupView){
        const itemLocked = locked || cp.locked;
        const editing = state.editingId === cp.id;
        const twStatus = cpTimeWindowStatus(cp);
        const staffCount = (cp.staff || []).length;
        let editBlock = '';
        if(editing && itemLocked){
          editBlock = `
            <div class="cp-edit-readonly" onclick="event.stopPropagation()">
              <div class="cp-readonly-row"><b>${t('checkpoint.checkpointTypeLabel')}:</b> ${escapeHtml(getCheckpointType(cp.type).fullLabel)}</div>
              ${cp.clue ? `<div class="cp-readonly-row"><b>${t('checkpoint.clueLabel')}:</b> ${escapeHtml(cp.clue)}</div>` : ''}
              <div class="cp-readonly-row"><b>${t('checkpoint.coordinatesLabel')}:</b> ${cp.lat.toFixed(5)}, ${cp.lng.toFixed(5)}</div>
              ${cp.locked ? `<div class="cp-readonly-row">${t('checkpoint.lockedHint')}</div>` : ''}
              ${staffCount ? `
                <div class="cp-readonly-row"><b>${t('checkpoint.staffHeading')}:</b></div>
                ${cp.staff.map(s => `<div class="cp-readonly-staff-row">${escapeHtml(s.name || t('checkpoint.staffUnnamed'))}${s.role ? ' · ' + escapeHtml(s.role) : ''}${s.phone ? ` · <a href="tel:${escapeHtml(s.phone)}">${escapeHtml(s.phone)}</a>` : ''}</div>`).join('')}
              ` : ''}
            </div>`;
        } else if(editing){
          if(state.confirmDeleteCpId === cp.id){
            editBlock = `
              <div class="confirm-row">
                ${t('checkpoint.deleteCpConfirm')}
                <div class="row2">
                  <button class="btn btn-danger btn-sm" style="flex:1;" onclick="confirmDeleteCp('${cp.id}')">${t('common.delete')}</button>
                  <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="state.confirmDeleteCpId=null; renderSidebar();">${t('common.cancel')}</button>
                </div>
              </div>`;
          } else {
            editBlock = `
              <div class="cp-edit" onclick="event.stopPropagation()">
                <div>
                  <label>${t('checkpoint.nameLabel')}</label>
                  <input type="text" value="${escapeHtml(cp.name)}" oninput="onEditName('${cp.id}', this.value)">
                </div>
                <div>
                  <label>${t('checkpoint.checkpointTypeLabel')}</label>
                  <select onchange="onEditType('${cp.id}', this.value)">
                    ${CHECKPOINT_TYPES.map(ct => `<option value="${ct.key}" ${cp.type === ct.key ? 'selected' : ''}>${ct.dropdownLabel}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label>${t('checkpoint.clueLabel')}</label>
                  <textarea oninput="onEditClue('${cp.id}', this.value)">${escapeHtml(cp.clue)}</textarea>
                </div>
                ${getCheckpointType(cp.type).hasCustomQuestion ? `
                <div>
                  <label>${t('checkpoint.customQuestionLabel')}</label>
                  <textarea oninput="onEditCustomQuestion('${cp.id}', this.value)">${escapeHtml(cp.customQuestion || '')}</textarea>
                </div>` : ''}
                ${getCheckpointType(cp.type).isScored ? `
                <div class="settings-hint">${t('checkpoint.scoredHint', {max: getCheckpointType(cp.type).scoreMax})}</div>
                ` : ''}
                <div class="row2">
                  <div>
                    <label>${getCheckpointType(cp.type).referenceFieldLabel}</label>
                    <input type="text" class="mono" value="${escapeHtml(cp.punchCode || '')}" oninput="onEditPunch('${cp.id}', this.value)">
                  </div>
                  <div>
                    <label>${t('checkpoint.coordinatesLabel')}</label>
                    <div class="coord-edit-row">
                      <input type="number" step="0.00001" class="mono coord-input" value="${cp.lat}" onchange="onEditLat('${cp.id}', this.value)">
                      <input type="number" step="0.00001" class="mono coord-input" value="${cp.lng}" onchange="onEditLng('${cp.id}', this.value)">
                    </div>
                  </div>
                </div>
                <label class="checkbox-row">
                  <input type="checkbox" ${cp.mandatory ? 'checked' : ''} onchange="onEditMandatory('${cp.id}', this.checked)">
                  ${t('checkpoint.mandatoryCheckboxLabel')}
                </label>
                <label class="checkbox-row">
                  <input type="checkbox" ${cp.timeWindowEnabled ? 'checked' : ''} onchange="onEditTimeWindowEnabled('${cp.id}', this.checked)">
                  ${t('checkpoint.timeWindowCheckboxLabel')}
                </label>
                ${cp.timeWindowEnabled ? `
                <div class="row2">
                  <div>
                    <label>${t('checkpoint.fromLabel')}</label>
                    <input type="datetime-local" value="${escapeHtml(cp.timeWindowStart || '')}" onchange="onEditTimeWindowStart('${cp.id}', this.value)">
                  </div>
                  <div>
                    <label>${t('checkpoint.toLabel')}</label>
                    <input type="datetime-local" value="${escapeHtml(cp.timeWindowEnd || '')}" onchange="onEditTimeWindowEnd('${cp.id}', this.value)">
                  </div>
                </div>
                ` : ''}
                ${isGameModeEnabled(evt, 'prerequisite') ? `
                <label class="checkbox-row">
                  <input type="checkbox" ${cp.gameHidden ? 'checked' : ''} onchange="onEditGameHidden('${cp.id}', this.checked)">
                  ${t('gameModes.hiddenCheckboxLabel')}
                </label>
                ${cp.gameHidden ? `
                <div>
                  <label>${t('gameModes.revealPrerequisiteLabel')}</label>
                  <select onchange="onEditGameRevealPrerequisite('${cp.id}', this.value)">
                    <option value="">${t('gameModes.revealPrerequisiteNone')}</option>
                    ${evt.checkpoints.filter(other => other.id !== cp.id).map(other => `<option value="${other.id}" ${cp.gameRevealPrerequisiteCpId === other.id ? 'selected' : ''}>${escapeHtml(other.name || t('checkpoint.noName'))}</option>`).join('')}
                  </select>
                </div>
                ` : ''}
                ` : ''}
                <div class="cp-staff-section">
                  <label>${t('checkpoint.staffHeading')}</label>
                  ${(cp.staff || []).map(s => `
                    <div class="cp-staff-entry">
                      <div class="cp-staff-row">
                        <input type="text" placeholder="${t('checkpoint.staffNamePlaceholder')}" value="${escapeHtml(s.name)}" oninput="onCpStaffFieldChange('${cp.id}', '${s.id}', 'name', this.value)">
                        <input type="tel" placeholder="${t('checkpoint.staffPhonePlaceholder')}" value="${escapeHtml(s.phone)}" oninput="onCpStaffFieldChange('${cp.id}', '${s.id}', 'phone', this.value)">
                      </div>
                      <div class="cp-staff-row">
                        <input type="text" placeholder="${t('checkpoint.staffRolePlaceholder')}" value="${escapeHtml(s.role)}" oninput="onCpStaffFieldChange('${cp.id}', '${s.id}', 'role', this.value)">
                        <input type="text" placeholder="${t('checkpoint.staffShiftPlaceholder')}" value="${escapeHtml(s.shiftNote)}" oninput="onCpStaffFieldChange('${cp.id}', '${s.id}', 'shiftNote', this.value)">
                      </div>
                      <input type="text" class="cp-staff-notes" placeholder="${t('checkpoint.staffNotesPlaceholder')}" value="${escapeHtml(s.notes)}" oninput="onCpStaffFieldChange('${cp.id}', '${s.id}', 'notes', this.value)">
                      <button type="button" class="btn btn-sm btn-danger" onclick="removeCpStaff('${cp.id}', '${s.id}')">${t('checkpoint.removeStaff')}</button>
                    </div>
                  `).join('')}
                  <button type="button" class="btn btn-sm" onclick="addCpStaff('${cp.id}')">${t('checkpoint.addStaff')}</button>
                </div>
                <div class="edit-actions">
                  <button class="btn btn-sm" onclick="duplicateCheckpoint('${cp.id}')">${t('checkpoint.duplicate')}</button>
                  <button class="btn btn-danger btn-sm" onclick="askDeleteCp('${cp.id}')">${t('checkpoint.deleteCheckpoint')}</button>
                </div>
              </div>`;
          }
        }
        return `
          <div class="cp-row ${editing ? 'editing' : ''} ${cp.mandatory ? '' : 'optional'} ${itemLocked ? 'locked' : ''} ${state.cpBulkSelectedIds.includes(cp.id) ? 'bulk-selected' : ''}" data-cp-id="${cp.id}" onclick="onCpRowClick(event, '${cp.id}')" onmouseenter="setCpMarkerHoverSync('${cp.id}', true)" onmouseleave="setCpMarkerHoverSync('${cp.id}', false)">
            <div class="cp-row-top">
              <span class="cp-drag-handle" title="${t('checkpoint.dragToReorder')}" ${(itemLocked || groupView) ? '' : `onpointerdown="onCpDragStart(event, '${cp.id}')"`} onclick="event.stopPropagation()">
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13.5" r="1.4"/><circle cx="7.5" cy="13.5" r="1.4"/></svg>
              </span>
              <div class="cp-no">${cp.order}</div>
              <div class="cp-name" id="row-name-${cp.id}">${escapeHtml(cp.name || t('checkpoint.noName'))}</div>
              <span class="tag-type">${typeLabel(cp.type)}</span>
              <label class="cp-quick-toggle" title="${t('checkpoint.mandatoryCheckpointTitle')}" onclick="event.stopPropagation()">
                <input type="checkbox" ${cp.mandatory ? 'checked' : ''} ${itemLocked ? 'disabled' : ''} onchange="onEditMandatory('${cp.id}', this.checked)">
                ${t('checkpoint.mandatoryQuickToggle')}
              </label>
              ${!groupView ? `
              <div class="cp-order-btns" onclick="event.stopPropagation()">
                <button onclick="moveCp('${cp.id}', -1)" title="${t('checkpoint.moveUp')}" ${itemLocked ? 'disabled' : ''}>&uarr;</button>
                <button onclick="moveCp('${cp.id}', 1)" title="${t('checkpoint.moveDown')}" ${itemLocked ? 'disabled' : ''}>&darr;</button>
              </div>` : ''}
            </div>
            <div class="cp-row-meta" onclick="event.stopPropagation()">
              ${twStatus ? `<span class="cp-tw-badge cp-tw-${twStatus}">${t('checkpoint.timeWindowStatus.' + twStatus)}</span>` : ''}
              ${cp.gameHidden && isGameModeEnabled(evt, 'prerequisite') ? `<span class="cp-hidden-badge" title="${t('gameModes.hiddenBadgeTitle')}">${isCpRevealed(evt, cp) ? t('gameModes.revealedBadge') : t('gameModes.hiddenBadge')}</span>` : ''}
              ${isGameModeEnabled(evt, 'zone_active') && isCpClosedByZone(evt, cp) ? `<span class="cp-hidden-badge cp-closed-badge" title="${t('gameModes.zoneClosedBadgeTitle')}">${t('gameModes.zoneClosedBadge')}</span>` : ''}
              ${staffCount ? `<span class="cp-staff-badge" title="${t('checkpoint.staffHeading')}">${t('checkpoint.staffBadgeIcon')} ${staffCount}</span>` : ''}
              <span class="cp-row-icon-actions">
                <button type="button" class="cp-icon-btn" onclick="duplicateCheckpoint('${cp.id}')" title="${t('checkpoint.duplicate')}" ${itemLocked ? 'disabled' : ''}>⧉</button>
                <button type="button" class="cp-icon-btn" onclick="toggleCpLocked('${cp.id}')" title="${cp.locked ? t('checkpoint.unlock') : t('checkpoint.lock')}" ${locked ? 'disabled' : ''}>${cp.locked ? '🔒' : '🔓'}</button>
              </span>
            </div>
            ${editBlock}
          </div>
          ${routeInfo && routeInfo.legs[cpIdx] ? `<div class="cp-leg-distance">↓ ${routeInfo.legs[cpIdx].km.toFixed(2)} km</div>` : ''}`;
}
function renderCpListRows(evt, locked, routeInfo){
  if(evt.checkpoints.length === 0) return `<div class="cp-list-empty">${t('checkpoint.noCheckpointsYet')}<br>${t('checkpoint.activateHint')}</div>`;
  if(state.cpListGroupBy === 'type'){
    return CHECKPOINT_TYPES.filter(ct => evt.checkpoints.some(cp => cp.type === ct.key)).map(ct => {
      const group = evt.checkpoints.filter(cp => cp.type === ct.key).slice().sort((a, b) => a.order - b.order);
      return `
        <div class="cp-group-heading">${typeIconHtml(ct.key)} ${escapeHtml(ct.fullLabel)} <span class="cp-group-count">${group.length}</span></div>
        ${group.map((cp) => renderCpRow(cp, evt.checkpoints.indexOf(cp), evt, locked, null, true)).join('')}
      `;
    }).join('');
  }
  return evt.checkpoints.map((cp, cpIdx) => renderCpRow(cp, cpIdx, evt, locked, routeInfo, false)).join('');
}
function renderSidebar(){
  const el = document.getElementById('sidebar');
  if(state.loading || !state.currentEvent){
    el.innerHTML = `<div class="loading-row">${t('checkpoint.loadingEvent')}</div>`;
    return;
  }
  const evt = state.currentEvent;
  const locked = isCpLocked(evt);
  const routeInfo = evt.checkpointOrderMode === 'fest' ? computeRouteLegs(evt.checkpoints) : null;
  const rows = renderCpListRows(evt, locked, routeInfo);

  el.innerHTML = `
    <div class="sidebar-head">
      <input type="text" class="event-title-input" value="${escapeHtml(evt.name)}" oninput="onEventNameInput(this.value)" placeholder="${t('checkpoint.eventNamePlaceholder')}">
      <input type="date" class="event-date-input" value="${escapeHtml(evt.date || '')}" oninput="onEventDateInput(this.value)">
    </div>
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleSettings()">${state.settingsOpen ? '\u25be' : '\u25b8'} ${t('checkpoint.startAndCurfew')}</button>
      ${state.settingsOpen ? `
        <div class="settings-body">
          <div>
            <label>${t('checkpoint.startModeLabel')}</label>
            <select onchange="onStartModeChange(this.value)">
              <option value="manual" ${evt.startMode !== 'scheduled' ? 'selected' : ''}>${t('checkpoint.manualStartOption')}</option>
              <option value="scheduled" ${evt.startMode === 'scheduled' ? 'selected' : ''}>${t('checkpoint.scheduledStartOption')}</option>
            </select>
          </div>
          ${evt.startMode === 'scheduled' ? `
          <div>
            <label>${t('checkpoint.startTimeLabel')}</label>
            <input type="datetime-local" value="${escapeHtml(evt.startTime || '')}" oninput="onStartTimeChange(this.value)">
          </div>` : `<div class="settings-hint">${t('checkpoint.manualStartHint')}</div>`}
          <div>
            <label>${t('checkpoint.curfewModeLabel')}</label>
            <select onchange="onCurfewModeChange(this.value)">
              <option value="hard" ${evt.curfewMode !== 'soft' ? 'selected' : ''}>${t('checkpoint.hardCutoffOption')}</option>
              <option value="soft" ${evt.curfewMode === 'soft' ? 'selected' : ''}>${t('checkpoint.softCurfewOption')}</option>
            </select>
          </div>
          <div class="settings-row2">
            <div>
              <label>${t('checkpoint.curfewTimeLabel')}</label>
              <input type="datetime-local" value="${escapeHtml(evt.curfewTime || '')}" oninput="onCurfewTimeChange(this.value)">
            </div>
            ${evt.curfewMode === 'soft' ? `
            <div>
              <label>${t('checkpoint.penaltyPerMinLabel')}</label>
              <input type="text" inputmode="decimal" value="${escapeHtml(String(evt.curfewPenaltyPerMin ?? 1))}" oninput="onCurfewPenaltyChange(this.value)">
            </div>` : ''}
          </div>
          <div class="settings-hint">${evt.curfewMode === 'soft' ? t('checkpoint.softCurfewHint') : t('checkpoint.hardCurfewHint')}</div>
        </div>
      ` : ''}
    </div>
    ${evt.status === 'running' ? `
      <div class="cp-lock-banner ${evt.cpLockOverride ? 'unlocked' : ''}">
        <span>${evt.cpLockOverride ? t('raceState.cpUnlockedBanner') : t('raceState.cpLockedBanner')}</span>
        <button class="btn btn-sm" onclick="toggleCpLockOverride()">${evt.cpLockOverride ? t('raceState.relockCp') : t('raceState.unlockCp')}</button>
      </div>
    ` : evt.status === 'completed' ? `
      <div class="cp-lock-banner">
        <span>${t('raceState.cpLockedCompletedBanner')}</span>
      </div>
    ` : ''}
    <div class="cp-order-mode-row">
      <label>${t('checkpointOrder.modeLabel')}</label>
      <select onchange="onCheckpointOrderModeChange(this.value)" ${locked ? 'disabled' : ''}>
        <option value="frei" ${evt.checkpointOrderMode !== 'fest' ? 'selected' : ''}>${t('checkpointOrder.modeFrei')}</option>
        <option value="fest" ${evt.checkpointOrderMode === 'fest' ? 'selected' : ''}>${t('checkpointOrder.modeFest')}</option>
      </select>
    </div>
    ${routeInfo ? `
      <div class="cp-total-distance">
        ${t('checkpointOrder.totalDistance', {km: routeInfo.total.toFixed(2)})}
        <span class="cp-distance-hint">${t('checkpointOrder.distanceHint')}</span>
      </div>
    ` : ''}
    <div class="addmode-row">
      <button class="btn btn-toggle ${state.addMode ? 'active' : ''}" onclick="toggleAddMode()" ${locked ? 'disabled' : ''}>
        ${state.addMode ? t('checkpoint.addModeActive') : t('checkpoint.addModeInactive')}
      </button>
      <div class="addmode-hint">${state.addMode ? t('checkpoint.addModeHintActive') : t('checkpoint.addModeHintInactive')}</div>
    </div>
    <div class="cp-group-by-row">
      <label>${t('checkpoint.groupByLabel')}</label>
      <select onchange="onCpListGroupByChange(this.value)">
        <option value="order" ${state.cpListGroupBy !== 'type' ? 'selected' : ''}>${t('checkpoint.groupByOrder')}</option>
        <option value="type" ${state.cpListGroupBy === 'type' ? 'selected' : ''}>${t('checkpoint.groupByType')}</option>
      </select>
    </div>
    ${state.cpBulkSelectedIds.length ? renderCpBulkActionsBar() : `<div class="cp-bulk-hint">${t('checkpoint.bulkSelectHint')}</div>`}
    <div class="cp-list">${rows}</div>
    <div class="sidebar-foot">
      <button class="btn" onclick="exportRouteGPX()">${t('checkpoint.exportGpx')}</button>
      <button class="btn" onclick="openManifest()">${t('checkpoint.generateManifest')}</button>
      <button class="btn" onclick="exportStaffBriefingPDF()">${t('checkpoint.exportStaffBriefing')}</button>
    </div>
  `;
}
