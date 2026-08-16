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
    manifestSettings: {}
  }, evt);
  merged.checkpoints = (merged.checkpoints || []).map(withCheckpointDefaults);
  merged.riders = (merged.riders || []).map(withRiderDefaults);
  merged.manifestSettings = withManifestSettingsDefaults(merged.manifestSettings);
  return merged;
}

/* ---------------- events crud ---------------- */
async function createNewEvent(){
  const id = uid('evt');
  const evt = withEventDefaults({id, name:'Neues Alleycat', date:'', description:'', checkpoints:[]});
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
    state.eventsIndex.push({id: newId, name: evt.name || 'Importiertes Event', date: evt.date || ''});
    await saveEventsIndex();
    setSaveStatus('saving');
    const ok = await storageSet('event:' + newId, JSON.stringify(evt));
    setSaveStatus(ok ? 'saved' : 'error');
    input.value = '';
    openEditor(newId);
  }catch(e){
    alert('Import fehlgeschlagen: Die Datei ist kein gültiges Alleycat-Dispatch-Event (JSON).');
    input.value = '';
  }
}

/* ---------------- render: dashboard ---------------- */
function renderDashboard(){
  const el = document.getElementById('view-dashboard');
  if(state.loading){
    el.innerHTML = `<div class="loading-row">L\u00e4dt Events \u2026</div>`;
    return;
  }
  const cards = state.eventsIndex.map(e => {
    if(state.confirmDeleteEventId === e.id){
      return `
        <div class="event-card">
          <h3>${escapeHtml(e.name)}</h3>
          <div class="meta">${escapeHtml(e.date || 'Kein Datum')}</div>
          <div class="confirm-row">
            Event inkl. aller Checkpoints wirklich l\u00f6schen?
            <div class="row2" style="display:flex; gap:8px; margin-top:6px;">
              <button class="btn btn-danger btn-sm" onclick="confirmDeleteEvent('${e.id}')" style="flex:1;">L\u00f6schen</button>
              <button class="btn btn-ghost btn-sm" onclick="state.confirmDeleteEventId=null; render();" style="flex:1;">Abbrechen</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="event-card" onclick="openEditor('${e.id}')">
        <h3>${escapeHtml(e.name || 'Unbenanntes Event')}</h3>
        <div class="meta">${escapeHtml(e.date || 'Kein Datum gesetzt')}</div>
        <div class="event-card-actions">
          <button class="btn btn-sm" onclick="event.stopPropagation(); openEditor('${e.id}')">Bearbeiten</button>
          <button class="btn btn-sm" onclick="event.stopPropagation(); exportEventJSON('${e.id}')">Exportieren</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); askDeleteEvent('${e.id}')">L\u00f6schen</button>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>Deine Alleycats</h2>
        <p>Geteiltes Headquarter-Board \u2014 sichtbar f\u00fcr alle mit Zugriff auf dieses Tool.</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="file" id="import-event-file" accept="application/json,.json" style="display:none;" onchange="onImportEventFile(this)">
        <button class="btn" onclick="document.getElementById('import-event-file').click()">Event importieren</button>
        ${renderStorageDashboardExtras()}
        <button class="btn btn-primary" onclick="createNewEvent()">+ Neues Event</button>
      </div>
    </div>
    ${state.eventsIndex.length === 0 ? `
      <div class="empty-state">
        <div class="display">Noch kein Event angelegt</div>
        <p>Leg dein erstes Alleycat an, setz Checkpoints auf der Karte und generier daraus automatisch das Manifest.</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="createNewEvent()">+ Erstes Event anlegen</button></div>
      </div>
    ` : `
      <div class="event-grid">
        ${cards}
        <div class="new-event-card" onclick="createNewEvent()">+ Neues Event</div>
      </div>
    `}
  `;
}
