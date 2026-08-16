/* ---------------- dashboard: event model + CRUD ---------------- */
function withEventDefaults(evt){
  const merged = Object.assign({
    startMode: 'manual',
    startTime: '',
    curfewMode: 'hard',
    curfewTime: '',
    curfewPenaltyPerMin: 1,
    expectedRiders: 0,
    checkpoints: [],
    riders: [],
    teams: [],
    spokeCardImage: '',
    manifestSettings: {},
    status: 'planning',
    statusChangedAt: '',
    startConfirmedAt: '',
    cpLockOverride: false,
    spokecardsPrinted: false,
    manifestGenerated: false,
    teamScoringMode: 'bestTime',
    categoryGroups: []
  }, evt);
  merged.checkpoints = (merged.checkpoints || []).map(withCheckpointDefaults);
  merged.riders = (merged.riders || []).map(withRiderDefaults);
  merged.manifestSettings = withManifestSettingsDefaults(merged.manifestSettings);
  return merged;
}

/* ---------------- events crud ---------------- */
async function createNewEvent(){
  const id = uid('evt');
  const evt = withEventDefaults({id, name:t('dashboard.newEventDefaultName'), date:'', description:'', checkpoints:[]});
  state.eventsIndex.push({id, name:evt.name, date:evt.date});
  await saveEventsIndex();
  state.currentEvent = evt;
  await saveCurrentEvent();
  await loadEventsIndex();
  openEditor(id);
}
function askDeleteEvent(id){
  state.confirmDeleteEventId = id;
  render();
}
async function confirmDeleteEvent(id){
  state.eventsIndex = state.eventsIndex.filter(e => e.id !== id);
  await saveEventsIndex();
  await storageDelete('event:' + id);
  state.confirmDeleteEventId = null;
  render();
}
async function exportEventJSON(id){
  const evt = state.currentEvent && state.currentEvent.id === id ? state.currentEvent : await loadEvent(id);
  if(!evt) return;
  const filename = (evt.name || 'event').replace(/\s+/g, '_').toLowerCase() + '-backup.json';
  downloadJSON(evt, filename);
}
async function onImportEventFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.checkpoints)){
      throw new Error('invalid shape');
    }
    const newId = uid('evt');
    const evt = withEventDefaults(Object.assign({}, parsed, {id: newId}));
    state.eventsIndex.push({id: newId, name: evt.name || t('dashboard.importedEventDefaultName'), date: evt.date || ''});
    await saveEventsIndex();
    setSaveStatus('saving');
    const ok = await storageSet('event:' + newId, JSON.stringify(evt));
    setSaveStatus(ok ? 'saved' : 'error');
    input.value = '';
    openEditor(newId);
  }catch(e){
    alert(t('dashboard.importFailed'));
    input.value = '';
  }
}

/* ---------------- render: dashboard ---------------- */
function renderDashboard(){
  const el = document.getElementById('view-dashboard');
  if(state.loading){
    el.innerHTML = `<div class="loading-row">${t('dashboard.loadingEvents')}</div>`;
    return;
  }
  const cards = state.eventsIndex.map(e => {
    if(state.confirmDeleteEventId === e.id){
      return `
        <div class="event-card">
          <h3>${escapeHtml(e.name)}</h3>
          <div class="meta">${escapeHtml(e.date || t('common.noDate'))}</div>
          <div class="confirm-row">
            ${t('dashboard.deleteConfirm')}
            <div class="row2" style="display:flex; gap:8px; margin-top:6px;">
              <button class="btn btn-danger btn-sm" onclick="confirmDeleteEvent('${e.id}')" style="flex:1;">${t('common.delete')}</button>
              <button class="btn btn-ghost btn-sm" onclick="state.confirmDeleteEventId=null; render();" style="flex:1;">${t('common.cancel')}</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="event-card" onclick="openEditor('${e.id}')">
        <h3>${escapeHtml(e.name || t('common.unnamedEvent'))}</h3>
        <div class="meta">${escapeHtml(e.date || t('dashboard.noDateSet'))}</div>
        <div class="event-card-actions">
          <button class="btn btn-sm" onclick="event.stopPropagation(); openEditor('${e.id}')">${t('common.edit')}</button>
          <button class="btn btn-sm" onclick="event.stopPropagation(); exportEventJSON('${e.id}')">${t('common.export')}</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); askDeleteEvent('${e.id}')">${t('common.delete')}</button>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>${t('dashboard.title')}</h2>
        <p>${t('dashboard.sharedBoardHint')}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="file" id="import-event-file" accept="application/json,.json" style="display:none;" onchange="onImportEventFile(this)">
        <button class="btn" onclick="document.getElementById('import-event-file').click()">${t('dashboard.importEvent')}</button>
        ${renderStorageDashboardExtras()}
        <button class="btn btn-primary" onclick="createNewEvent()">${t('dashboard.newEvent')}</button>
      </div>
    </div>
    ${state.eventsIndex.length === 0 ? `
      <div class="empty-state">
        <div class="display">${t('dashboard.emptyTitle')}</div>
        <p>${t('dashboard.emptyHint')}</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="createNewEvent()">${t('dashboard.createFirstEvent')}</button></div>
      </div>
    ` : `
      <div class="event-grid">
        ${cards}
        <div class="new-event-card" onclick="createNewEvent()">${t('dashboard.newEvent')}</div>
      </div>
    `}
  `;
}
