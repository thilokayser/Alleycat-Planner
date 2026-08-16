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
    timeWindowEnd: ''
  }, cp);
}
/* Single source of truth for all checkpoint-type behavior. Add an entry here
   to introduce a new type — every dropdown, icon, manifest cell and check-in
   control derives from this list instead of scattered type === 'x' checks. */
let CHECKPOINT_TYPES = [
  {key: 'qr', icon: '\ud83d\udd32', shortLabel: 'QR', fullLabel: 'QR-Code-Scan', dropdownLabel: 'QR-Code-Scan', referenceFieldLabel: 'QR-Inhalt / Code', hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'photo', icon: '\ud83d\udcf7', shortLabel: 'FOTO', fullLabel: 'Foto-Beweis', dropdownLabel: 'Foto-Beweis', referenceFieldLabel: 'Referenz-Code', hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'item', icon: '\ud83d\udce6', shortLabel: 'ITEM', fullLabel: 'Item-Abgabe', dropdownLabel: 'Item-Abgabe', referenceFieldLabel: 'Referenz-Code', hasCustomQuestion: false, isScored: false, scoreMax: 0, manifestCell: 'punch-box'},
  {key: 'custom', icon: '\u2753', shortLabel: 'R\u00c4TSEL', fullLabel: 'R\u00e4tselfrage', dropdownLabel: 'R\u00e4tselfrage / Custom Input', referenceFieldLabel: 'Referenz-Code', hasCustomQuestion: true, isScored: false, scoreMax: 0, manifestCell: 'answer-line'},
  {key: 'challenge', icon: '\ud83c\udfc6', shortLabel: 'CHALLENGE', fullLabel: 'Marshal-Bewertung', dropdownLabel: 'Marshal-Bewertung (Challenge)', referenceFieldLabel: 'Referenz-Code', hasCustomQuestion: false, isScored: true, scoreMax: 10, manifestCell: 'score-line'}
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
  if(!label){ alert('Bitte einen Namen f\u00fcr den Checkpoint-Typ angeben.'); return; }
  const key = slugifyTypeKey(shortLabel || label);
  const manifestCell = isScored ? 'score-line' : (hasCustomQuestion ? 'answer-line' : 'punch-box');
  CHECKPOINT_TYPES.push({
    key, icon, shortLabel: (shortLabel || label.toUpperCase()).slice(0, 14), fullLabel: label,
    dropdownLabel: label, referenceFieldLabel: 'Referenz-Code',
    hasCustomQuestion, isScored, scoreMax, manifestCell
  });
  saveCustomCheckpointTypes();
  state.newTypeFormOpen = false;
  renderSettings();
}
function deleteCustomCheckpointType(key){
  if(!confirm('Diesen Checkpoint-Typ wirklich l\u00f6schen? Bereits angelegte Checkpoints dieses Typs bleiben erhalten, fallen aber auf den Standard-Typ zur\u00fcck.')) return;
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
  const swap = idx + dir;
  if(swap < 0 || swap >= list.length) return;
  [list[idx], list[swap]] = [list[swap], list[idx]];
  list.forEach((c,i) => c.order = i+1);
  debouncedSave();
  renderSidebar();
  redrawMarkers();
}
function askDeleteCp(id){
  state.confirmDeleteCpId = id;
  renderSidebar();
}
function confirmDeleteCp(id){
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
  if(rowName) rowName.textContent = value || '(ohne Namen)';
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
  state.addMode = !state.addMode;
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
function renderSidebar(){
  const el = document.getElementById('sidebar');
  if(state.loading || !state.currentEvent){
    el.innerHTML = `<div class="loading-row">L\u00e4dt Event \u2026</div>`;
    return;
  }
  const evt = state.currentEvent;
  const rows = evt.checkpoints.length === 0
    ? `<div class="cp-list-empty">Noch keine Checkpoints.<br>Aktiviere "Checkpoint setzen" und klick auf die Karte.</div>`
    : evt.checkpoints.map(cp => {
        const editing = state.editingId === cp.id;
        let editBlock = '';
        if(editing){
          if(state.confirmDeleteCpId === cp.id){
            editBlock = `
              <div class="confirm-row">
                Checkpoint wirklich l\u00f6schen?
                <div class="row2">
                  <button class="btn btn-danger btn-sm" style="flex:1;" onclick="confirmDeleteCp('${cp.id}')">L\u00f6schen</button>
                  <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="state.confirmDeleteCpId=null; renderSidebar();">Abbrechen</button>
                </div>
              </div>`;
          } else {
            editBlock = `
              <div class="cp-edit" onclick="event.stopPropagation()">
                <div>
                  <label>Name</label>
                  <input type="text" value="${escapeHtml(cp.name)}" oninput="onEditName('${cp.id}', this.value)">
                </div>
                <div>
                  <label>Checkpoint-Typ</label>
                  <select onchange="onEditType('${cp.id}', this.value)">
                    ${CHECKPOINT_TYPES.map(t => `<option value="${t.key}" ${cp.type === t.key ? 'selected' : ''}>${t.dropdownLabel}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label>Clue / Hinweis f\u00fcr Fahrer</label>
                  <textarea oninput="onEditClue('${cp.id}', this.value)">${escapeHtml(cp.clue)}</textarea>
                </div>
                ${getCheckpointType(cp.type).hasCustomQuestion ? `
                <div>
                  <label>R\u00e4tselfrage / erwartete Antwort</label>
                  <textarea oninput="onEditCustomQuestion('${cp.id}', this.value)">${escapeHtml(cp.customQuestion || '')}</textarea>
                </div>` : ''}
                ${getCheckpointType(cp.type).isScored ? `
                <div class="settings-hint">Marshal bewertet die Challenge vor Ort direkt im Ziel-Check-in mit 0\u2013${getCheckpointType(cp.type).scoreMax} Punkten (z. B. Trackstand, Bunny-Hop).</div>
                ` : ''}
                <div class="row2">
                  <div>
                    <label>${getCheckpointType(cp.type).referenceFieldLabel}</label>
                    <input type="text" class="mono" value="${escapeHtml(cp.punchCode || '')}" oninput="onEditPunch('${cp.id}', this.value)">
                  </div>
                  <div>
                    <label>Koordinaten</label>
                    <div class="coord-readout">${cp.lat.toFixed(5)}, ${cp.lng.toFixed(5)}</div>
                  </div>
                </div>
                <label class="checkbox-row">
                  <input type="checkbox" ${cp.mandatory ? 'checked' : ''} onchange="onEditMandatory('${cp.id}', this.checked)">
                  Pflicht-Checkpoint (unchecked = Bonus)
                </label>
                <label class="checkbox-row">
                  <input type="checkbox" ${cp.timeWindowEnabled ? 'checked' : ''} onchange="onEditTimeWindowEnabled('${cp.id}', this.checked)">
                  Zeitfenster aktivieren (z. B. Happy-Hour-Barstop)
                </label>
                ${cp.timeWindowEnabled ? `
                <div class="row2">
                  <div>
                    <label>Von</label>
                    <input type="datetime-local" value="${escapeHtml(cp.timeWindowStart || '')}" onchange="onEditTimeWindowStart('${cp.id}', this.value)">
                  </div>
                  <div>
                    <label>Bis</label>
                    <input type="datetime-local" value="${escapeHtml(cp.timeWindowEnd || '')}" onchange="onEditTimeWindowEnd('${cp.id}', this.value)">
                  </div>
                </div>
                ` : ''}
                <div class="edit-actions">
                  <button class="btn btn-danger btn-sm" onclick="askDeleteCp('${cp.id}')">Checkpoint l\u00f6schen</button>
                </div>
              </div>`;
          }
        }
        return `
          <div class="cp-row ${editing ? 'editing' : ''} ${cp.mandatory ? '' : 'optional'}" data-cp-id="${cp.id}" onclick="selectCp('${cp.id}')">
            <div class="cp-row-top">
              <span class="cp-drag-handle" title="Ziehen zum Umsortieren" onpointerdown="onCpDragStart(event, '${cp.id}')" onclick="event.stopPropagation()">
                <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13.5" r="1.4"/><circle cx="7.5" cy="13.5" r="1.4"/></svg>
              </span>
              <div class="cp-no">${cp.order}</div>
              <div class="cp-name" id="row-name-${cp.id}">${escapeHtml(cp.name || '(ohne Namen)')}</div>
              <span class="tag-type">${typeLabel(cp.type)}</span>
              <label class="cp-quick-toggle" title="Pflicht-Checkpoint" onclick="event.stopPropagation()">
                <input type="checkbox" ${cp.mandatory ? 'checked' : ''} onchange="onEditMandatory('${cp.id}', this.checked)">
                Pflicht
              </label>
              <div class="cp-order-btns" onclick="event.stopPropagation()">
                <button onclick="moveCp('${cp.id}', -1)" title="Nach oben">&uarr;</button>
                <button onclick="moveCp('${cp.id}', 1)" title="Nach unten">&darr;</button>
              </div>
            </div>
            ${editBlock}
          </div>`;
      }).join('');

  el.innerHTML = `
    <div class="sidebar-head">
      <input type="text" class="event-title-input" value="${escapeHtml(evt.name)}" oninput="onEventNameInput(this.value)" placeholder="Eventname">
      <input type="date" class="event-date-input" value="${escapeHtml(evt.date || '')}" oninput="onEventDateInput(this.value)">
    </div>
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleSettings()">${state.settingsOpen ? '\u25be' : '\u25b8'} Start &amp; Curfew</button>
      ${state.settingsOpen ? `
        <div class="settings-body">
          <div>
            <label>Start-Modus</label>
            <select onchange="onStartModeChange(this.value)">
              <option value="manual" ${evt.startMode !== 'scheduled' ? 'selected' : ''}>Manueller Startknopf</option>
              <option value="scheduled" ${evt.startMode === 'scheduled' ? 'selected' : ''}>Fester Startzeitpunkt</option>
            </select>
          </div>
          ${evt.startMode === 'scheduled' ? `
          <div>
            <label>Startzeit</label>
            <input type="datetime-local" value="${escapeHtml(evt.startTime || '')}" oninput="onStartTimeChange(this.value)">
          </div>` : `<div class="settings-hint">Der Admin l\u00f6st den Start manuell per Knopf aus, sobald das Feld bereit ist.</div>`}
          <div>
            <label>Curfew-Modus</label>
            <select onchange="onCurfewModeChange(this.value)">
              <option value="hard" ${evt.curfewMode !== 'soft' ? 'selected' : ''}>Hard Cutoff (Sperre)</option>
              <option value="soft" ${evt.curfewMode === 'soft' ? 'selected' : ''}>Soft Curfew (Strafzeit)</option>
            </select>
          </div>
          <div class="settings-row2">
            <div>
              <label>Curfew-Zeitpunkt</label>
              <input type="datetime-local" value="${escapeHtml(evt.curfewTime || '')}" oninput="onCurfewTimeChange(this.value)">
            </div>
            ${evt.curfewMode === 'soft' ? `
            <div>
              <label>Strafmin. / Min. sp\u00e4t</label>
              <input type="text" inputmode="decimal" value="${escapeHtml(String(evt.curfewPenaltyPerMin ?? 1))}" oninput="onCurfewPenaltyChange(this.value)">
            </div>` : ''}
          </div>
          <div class="settings-hint">${evt.curfewMode === 'soft' ? 'Fahrer k\u00f6nnen nach Curfew noch ins Ziel \u2014 pro Minute Versp\u00e4tung gibt es Strafminuten auf die Wertung.' : 'Nach dem Curfew-Zeitpunkt gilt das Rennen als beendet.'}</div>
        </div>
      ` : ''}
    </div>
    <div class="addmode-row">
      <button class="btn btn-toggle ${state.addMode ? 'active' : ''}" onclick="toggleAddMode()">
        ${state.addMode ? '\u25CF Checkpoint setzen (aktiv)' : 'Checkpoint setzen'}
      </button>
      <div class="addmode-hint">${state.addMode ? 'Klick auf die Karte, um einen Checkpoint zu platzieren. Marker sind verschiebbar.' : 'Aktivieren, dann per Klick auf die Karte Checkpoints anlegen.'}</div>
    </div>
    <div class="cp-list">${rows}</div>
    <div class="sidebar-foot">
      <button class="btn" onclick="exportRouteGPX()">GPX exportieren</button>
      <button class="btn" onclick="openManifest()">Manifest generieren</button>
    </div>
  `;
}
