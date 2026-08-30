/* ---------------- roster: persistent teams & riders across events ----------------
   Zwei org-weite, event-unabhängige Register — Grundlage für das
   Liga-System (season.js/league.js): dort brauchen Teams und Fahrer eine
   Identität, die über ein einzelnes Event hinaus Bestand hat, was
   evt.teams[]/evt.riders[] bewusst nie hatten (jede id dort ist ein
   frischer uid() pro Event, siehe team.js/rider.js). Ein Event-Team bzw.
   -Fahrer wird per rosterTeamId/rosterRiderId EXPLIZIT mit einem
   Register-Eintrag verknüpft — kein Name-Matching. Das ist dieselbe
   Falle wie beim JSON-Import in category.js, der Namenskonflikte mit
   einer neuen id statt einer sauberen Zusammenführung auflöst; hier soll
   sie nicht wiederholt werden.

   Speicherform: ein Blob pro Register (`teamRoster:index` /
   `riderRoster:index`), kein Stub+Einzel-Blob-Splitting wie bei Events —
   ein Team-/Fahrer-Register-Eintrag ist klein genug (kein Sub-Datenberg
   wie ein ganzes Event), eine Liste von hundert Einträgen bleibt
   problemlos ein einziger Wert unter dem Zeilenlimit der KV-Tabelle. */

function withRosterTeamDefaults(t){
  return Object.assign({id: uid('rosterteam'), name: '', color: TEAM_COLOR_PALETTE[0], createdAt: new Date().toISOString()}, t);
}
function withRosterRiderDefaults(r){
  return Object.assign({id: uid('rosterrider'), name: '', contact: '', createdAt: new Date().toISOString()}, r);
}

async function loadTeamRoster(){
  try{
    const res = await storageGet('teamRoster:index');
    state.teamRoster = res ? (JSON.parse(res.value) || []).map(withRosterTeamDefaults) : [];
  }catch(e){ state.teamRoster = []; }
}
async function saveTeamRoster(){
  await storageSet('teamRoster:index', JSON.stringify(state.teamRoster));
}
async function loadRiderRoster(){
  try{
    const res = await storageGet('riderRoster:index');
    state.riderRoster = res ? (JSON.parse(res.value) || []).map(withRosterRiderDefaults) : [];
  }catch(e){ state.riderRoster = []; }
}
async function saveRiderRoster(){
  await storageSet('riderRoster:index', JSON.stringify(state.riderRoster));
}

function getRosterTeam(id){
  return (state.teamRoster || []).find(t => t.id === id) || null;
}
function getRosterRider(id){
  return (state.riderRoster || []).find(r => r.id === id) || null;
}
function rosterTeamBadgeHtml(id){
  const rt = getRosterTeam(id);
  if(!rt) return '';
  return `<span class="team-badge" title="${escapeHtml(rt.name)}"><span class="team-dot" style="background:${escapeHtml(rt.color)}"></span>${escapeHtml(rt.name)}</span>`;
}

/* ---------------- team roster CRUD ---------------- */
function createRosterTeam(name){
  const trimmed = (name || '').trim();
  if(!trimmed){ alert(t('league.rosterNamePrompt')); return; }
  state.teamRoster = state.teamRoster || [];
  state.teamRoster.push(withRosterTeamDefaults({name: trimmed, color: TEAM_COLOR_PALETTE[state.teamRoster.length % TEAM_COLOR_PALETTE.length]}));
  saveTeamRoster();
  renderSettings();
}
function renameRosterTeam(id, name){
  const rt = getRosterTeam(id);
  if(!rt) return;
  rt.name = name;
  saveTeamRoster();
}
function setRosterTeamColor(id, color){
  const rt = getRosterTeam(id);
  if(!rt) return;
  rt.color = color;
  saveTeamRoster();
  renderSettings();
}
async function deleteRosterTeam(id){
  if(!confirm(t('league.deleteRosterTeamConfirm'))) return;
  state.teamRoster = (state.teamRoster || []).filter(x => x.id !== id);
  await saveTeamRoster();
  await unlinkRosterTeamFromAllEvents(id);
  renderSettings();
}
/* Höchstes Risiko in diesem Modul: die einzige Stelle, die aus einer
   einzelnen Aktion heraus mehrere Event-Blobs lädt und zurückschreibt.
   Nimmt dieselbe Last-Writer-Wins-Unschärfe in Kauf, die
   confirmDeleteEvent() (dashboard.js) ohnehin schon hat — kein
   zusätzlicher Transaktionsaufwand hier. */
async function unlinkRosterTeamFromAllEvents(rosterTeamId){
  for(const stub of state.eventsIndex){
    const isOpen = state.currentEvent && state.currentEvent.id === stub.id;
    const evt = isOpen ? state.currentEvent : await loadEvent(stub.id);
    if(!evt) continue;
    let changed = false;
    (evt.teams || []).forEach(tm => {
      if(tm.rosterTeamId === rosterTeamId){ tm.rosterTeamId = null; changed = true; }
    });
    if(changed) await storageSet('event:' + stub.id, JSON.stringify(evt));
  }
}
function linkEventTeamToRoster(eventTeamId, rosterTeamId){
  const evt = state.currentEvent;
  const tm = getTeam(evt, eventTeamId);
  if(!tm) return;
  tm.rosterTeamId = rosterTeamId || null;
  debouncedSave();
  renderRiders();
}

/* ---------------- rider roster CRUD ---------------- */
function createRosterRider(name, contact){
  const trimmed = (name || '').trim();
  if(!trimmed){ alert(t('league.rosterNamePrompt')); return; }
  state.riderRoster = state.riderRoster || [];
  state.riderRoster.push(withRosterRiderDefaults({name: trimmed, contact: (contact || '').trim()}));
  saveRiderRoster();
  renderSettings();
}
function renameRosterRider(id, name){
  const rr = getRosterRider(id);
  if(!rr) return;
  rr.name = name;
  saveRiderRoster();
}
function setRosterRiderContact(id, contact){
  const rr = getRosterRider(id);
  if(!rr) return;
  rr.contact = contact;
  saveRiderRoster();
}
async function deleteRosterRider(id){
  if(!confirm(t('league.deleteRosterRiderConfirm'))) return;
  state.riderRoster = (state.riderRoster || []).filter(x => x.id !== id);
  await saveRiderRoster();
  await unlinkRosterRiderFromAllEvents(id);
  renderSettings();
}
async function unlinkRosterRiderFromAllEvents(rosterRiderId){
  for(const stub of state.eventsIndex){
    const isOpen = state.currentEvent && state.currentEvent.id === stub.id;
    const evt = isOpen ? state.currentEvent : await loadEvent(stub.id);
    if(!evt) continue;
    let changed = false;
    (evt.riders || []).forEach(r => {
      if(r.rosterRiderId === rosterRiderId){ r.rosterRiderId = null; changed = true; }
    });
    if(changed) await storageSet('event:' + stub.id, JSON.stringify(evt));
  }
}
function linkEventRiderToRoster(bib, rosterRiderId){
  const evt = state.currentEvent;
  const r = (evt.riders || []).find(r => r.bib === bib);
  if(!r) return;
  r.rosterRiderId = rosterRiderId || null;
  debouncedSave();
}

/* ---------------- settings screens ---------------- */
function renderSettingsSectionTeamRoster(){
  const rows = (state.teamRoster || []).map(rt => `
    <div class="type-row">
      <input type="color" class="team-color-input" value="${escapeHtml(rt.color)}" onchange="setRosterTeamColor('${rt.id}', this.value)" title="${t('rider.teamColorTitle')}">
      <div class="type-info">
        <input type="text" class="team-name-input" value="${escapeHtml(rt.name)}" onchange="renameRosterTeam('${rt.id}', this.value)">
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteRosterTeam('${rt.id}')">${t('common.delete')}</button>
    </div>
  `).join('');
  return `
    <div class="settings-section">
      <h3>${t('league.teamRosterHeading')}</h3>
      <div class="settings-section-desc">${t('league.teamRosterDesc')}</div>
      <div class="type-list">${rows || `<p class="settings-hint">${t('league.teamRosterEmpty')}</p>`}</div>
      <div class="settings-form">
        <div class="row2">
          <input type="text" id="new-roster-team-name" placeholder="${t('league.newRosterTeamPlaceholder')}">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="createRosterTeam(document.getElementById('new-roster-team-name').value); document.getElementById('new-roster-team-name').value='';">${t('league.addRosterTeam')}</button>
        </div>
      </div>
    </div>
  `;
}
function renderSettingsSectionRiderRoster(){
  const rows = (state.riderRoster || []).map(rr => `
    <div class="type-row">
      <div class="type-info">
        <input type="text" class="team-name-input" value="${escapeHtml(rr.name)}" onchange="renameRosterRider('${rr.id}', this.value)">
        <input type="text" class="team-name-input" value="${escapeHtml(rr.contact)}" placeholder="${t('league.rosterRiderContactPlaceholder')}" onchange="setRosterRiderContact('${rr.id}', this.value)">
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteRosterRider('${rr.id}')">${t('common.delete')}</button>
    </div>
  `).join('');
  return `
    <div class="settings-section">
      <h3>${t('league.riderRosterHeading')}</h3>
      <div class="settings-section-desc">${t('league.riderRosterDesc')}</div>
      <div class="type-list">${rows || `<p class="settings-hint">${t('league.riderRosterEmpty')}</p>`}</div>
      <div class="settings-form">
        <div class="row2">
          <input type="text" id="new-roster-rider-name" placeholder="${t('league.newRosterRiderPlaceholder')}">
          <input type="text" id="new-roster-rider-contact" placeholder="${t('league.rosterRiderContactPlaceholder')}">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="createRosterRider(document.getElementById('new-roster-rider-name').value, document.getElementById('new-roster-rider-contact').value); document.getElementById('new-roster-rider-name').value=''; document.getElementById('new-roster-rider-contact').value='';">${t('league.addRosterRider')}</button>
        </div>
      </div>
    </div>
  `;
}
