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
    bibsPrinted: false,
    manifestGenerated: false,
    teamScoringMode: 'bestTime',
    categoryGroups: [],
    checkpointOrderMode: 'frei',
    dashboardWidgetOrder: DASHBOARD_WIDGET_KEYS.slice(),
    dashboardWidgetVisibility: {statusTiles: true, cpLoad: true, recentActivity: false, categoryDistribution: false, miniLeaderboard: false, countdown: true, todos: false},
    soundHooks: {},
    lastBackupAt: '',
    tileCacheUpdatedAt: '',
    pdfBlocks: []
  }, evt);
  merged.pdfBlocks = (merged.pdfBlocks || []).map(withPdfBlockDefaults);
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

/* ---------------- overview: per-event dashboard widgets ---------------- */
const DASHBOARD_WIDGET_KEYS = ['statusTiles', 'cpLoad', 'recentActivity', 'categoryDistribution', 'miniLeaderboard', 'countdown', 'todos'];

function computeRiderStatusTiles(evt){
  const riders = evt.riders || [];
  const tiles = {registered: 0, underway: 0, finished: 0, dnf: 0, dns: 0};
  riders.forEach(r => {
    if(r.raceStatus === 'dnf'){ tiles.dnf++; return; }
    if(r.raceStatus === 'dns'){ tiles.dns++; return; }
    if(r.finishTime){ tiles.finished++; return; }
    if((r.completed && r.completed.length) || Object.keys(r.checkpointTimes || {}).length){ tiles.underway++; return; }
    tiles.registered++;
  });
  return tiles;
}
function computeCheckpointLoad(evt){
  const riders = evt.riders || [];
  return (evt.checkpoints || []).slice().sort((a, b) => a.order - b.order).map(cp => ({
    checkpoint: cp,
    count: riders.filter(r => (r.completed || []).includes(cp.id)).length
  })).sort((a, b) => a.count - b.count);
}
function computeRecentActivity(evt, limit){
  const entries = [];
  (evt.riders || []).forEach(r => {
    Object.entries(r.checkpointTimes || {}).forEach(([cpId, at]) => {
      if(!at) return;
      const cp = (evt.checkpoints || []).find(c => c.id === cpId);
      entries.push({at, bib: r.bib, name: r.name || '', label: (cp && cp.name) || t('overview.checkpointFallbackLabel')});
    });
    if(r.finishTime) entries.push({at: r.finishTime, bib: r.bib, name: r.name || '', label: t('overview.finishLabel')});
  });
  entries.sort((a, b) => new Date(b.at) - new Date(a.at));
  return entries.slice(0, limit || 8);
}
function computeCategoryDistribution(evt){
  return (evt.categoryGroups || []).map(g => ({
    group: g,
    counts: g.options.map(opt => ({
      opt,
      count: (evt.riders || []).filter(r => r.categories && r.categories[g.id] === opt).length
    }))
  }));
}
function computeMiniLeaderboard(evt, limit){
  const finished = (evt.riders || []).filter(r => r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns');
  return finished.slice().sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime)).slice(0, limit || 5);
}
function computeStartCountdown(evt){
  const now = new Date();
  if(evt.status === 'running' || evt.status === 'completed'){
    if(!evt.startConfirmedAt) return {mode: 'none'};
    const start = new Date(evt.startConfirmedAt);
    if(isNaN(start.getTime())) return {mode: 'none'};
    if(evt.status === 'completed'){
      const end = evt.statusChangedAt ? new Date(evt.statusChangedAt) : now;
      return {mode: 'duration', ms: (isNaN(end.getTime()) ? now : end) - start};
    }
    return {mode: 'since', ms: now - start};
  }
  if(evt.startMode === 'scheduled' && evt.startTime){
    const start = new Date(evt.startTime);
    if(!isNaN(start.getTime())) return {mode: 'until', ms: start - now};
  }
  return {mode: 'none'};
}
function computeDashboardTodos(evt){
  const todos = [];
  if(!evt.checkpoints || !evt.checkpoints.length){
    todos.push({key: 'noCheckpoints', text: t('overview.todoNoCheckpoints')});
  } else if(evt.checkpoints.some(cp => !Number.isFinite(cp.lat) || !Number.isFinite(cp.lng))){
    todos.push({key: 'cpNoPosition', text: t('overview.todoCpNoPosition')});
  }
  if(!evt.startTime) todos.push({key: 'noStartTime', text: t('overview.todoNoStartTime')});
  if(!evt.expectedRiders) todos.push({key: 'noCapacity', text: t('overview.todoNoCapacity')});
  (evt.categoryGroups || []).forEach(g => {
    const assigned = (evt.riders || []).some(r => r.categories && r.categories[g.id]);
    if(!assigned) todos.push({key: 'catGroupEmpty-' + g.id, text: t('overview.todoCategoryGroupEmpty', {name: escapeHtml(g.name)})});
  });
  if(!evt.spokecardsPrinted || !evt.bibsPrinted) todos.push({key: 'notPrinted', text: t('overview.todoNotPrinted')});
  if(!evt.manifestGenerated) todos.push({key: 'noManifest', text: t('overview.todoNoManifest')});
  const staffMissingCount = (evt.checkpoints || []).filter(cp => !(cp.staff || []).length).length;
  if(staffMissingCount > 0) todos.push({key: 'noStaff', text: t('overview.todoNoStaff', {count: staffMissingCount})});
  const tileSeverity = offlineTileCacheStaleness(evt);
  if(tileSeverity){
    const days = Math.floor((Date.now() - new Date(evt.tileCacheUpdatedAt).getTime()) / 86400000);
    todos.push({key: 'tileCacheStale', text: t('overview.todoTileCacheStale', {days}), severity: tileSeverity});
  }
  return todos;
}

function overviewWidgetTitle(key){
  return {
    statusTiles: t('overview.widgetTitleStatusTiles'),
    cpLoad: t('overview.widgetTitleCpLoad'),
    recentActivity: t('overview.widgetTitleRecentActivity'),
    categoryDistribution: t('overview.widgetTitleCategoryDistribution'),
    miniLeaderboard: t('overview.widgetTitleMiniLeaderboard'),
    countdown: t('overview.widgetTitleCountdown'),
    todos: t('overview.widgetTitleTodos')
  }[key] || key;
}
function overviewWidgetWrap(key, bodyHtml){
  return `<div class="overview-widget" data-widget="${key}"><div class="overview-widget-head"><h3>${overviewWidgetTitle(key)}</h3></div><div class="overview-widget-body">${bodyHtml}</div></div>`;
}
function renderStatusTilesWidget(evt){
  const tiles = computeRiderStatusTiles(evt);
  const items = [
    {key: 'registered', label: t('overview.tileRegistered'), cls: ''},
    {key: 'underway', label: t('overview.tileUnderway'), cls: 'underway'},
    {key: 'finished', label: t('overview.tileFinished'), cls: 'finished'},
    {key: 'dnf', label: t('overview.tileDnf'), cls: 'dnf'},
    {key: 'dns', label: t('overview.tileDns'), cls: 'dns'}
  ];
  return overviewWidgetWrap('statusTiles', `
    <div class="overview-status-tiles">
      ${items.map(it => `<div class="overview-status-tile ${it.cls}"><span class="overview-status-tile-count">${tiles[it.key]}</span><span class="overview-status-tile-label">${it.label}</span></div>`).join('')}
    </div>
  `);
}
function renderCpLoadWidget(evt){
  const rows = computeCheckpointLoad(evt);
  const body = rows.length ? `
    <div class="overview-cp-load-list">
      ${rows.map(r => `
        <div class="overview-cp-load-row">
          <span class="overview-cp-load-name">${escapeHtml(r.checkpoint.name || t('overview.checkpointFallbackLabel'))}</span>
          <span class="overview-cp-load-count">${r.count}</span>
        </div>
      `).join('')}
    </div>
  ` : `<div class="overview-widget-empty">${t('overview.noCheckpoints')}</div>`;
  return overviewWidgetWrap('cpLoad', body);
}
function renderRecentActivityWidget(evt){
  const entries = computeRecentActivity(evt, 8);
  const body = entries.length ? `
    <ul class="overview-activity-list">
      ${entries.map(e => `<li><span class="overview-activity-time">${formatTimeOnly(e.at)}</span> <b>#${e.bib}</b> ${escapeHtml(e.name || '—')} &mdash; ${escapeHtml(e.label)}</li>`).join('')}
    </ul>
  ` : `<div class="overview-widget-empty">${t('overview.noActivity')}</div>`;
  return overviewWidgetWrap('recentActivity', body);
}
function renderCategoryDistributionWidget(evt){
  const groups = computeCategoryDistribution(evt);
  if(!groups.length) return overviewWidgetWrap('categoryDistribution', `<div class="overview-widget-empty">${t('overview.noCategoryGroups')}</div>`);
  const body = groups.map(({group, counts}) => {
    const max = Math.max(1, ...counts.map(c => c.count));
    return `
      <div class="overview-cat-group">
        <div class="overview-cat-group-name">${escapeHtml(group.name)}</div>
        ${counts.map(c => `
          <div class="overview-cat-bar-row">
            <span class="overview-cat-bar-label">${escapeHtml(c.opt)}</span>
            <span class="overview-cat-bar-track"><span class="overview-cat-bar-fill" style="width:${Math.round(c.count / max * 100)}%"></span></span>
            <span class="overview-cat-bar-count">${c.count}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
  return overviewWidgetWrap('categoryDistribution', body);
}
function renderMiniLeaderboardWidget(evt){
  const top = computeMiniLeaderboard(evt, 5);
  const body = top.length ? `
    <ol class="overview-mini-leaderboard">
      ${top.map(r => `<li><b>#${r.bib}</b> ${escapeHtml(r.name || '—')} <span class="overview-mini-lb-time">${formatTimeOnly(r.finishTime)}</span></li>`).join('')}
    </ol>
    <button type="button" class="btn btn-sm" onclick="openLeaderboard()">${t('overview.openFullLeaderboard')}</button>
  ` : `<div class="overview-widget-empty">${t('overview.noFinishers')}</div>`;
  return overviewWidgetWrap('miniLeaderboard', body);
}
function formatOverviewCountdownText(info){
  if(info.mode === 'until') return t('overview.countdownUntil', {time: formatCountdown(info.ms)});
  if(info.mode === 'since') return t('overview.countdownSince', {time: formatCountdown(info.ms)});
  if(info.mode === 'duration') return t('overview.countdownDuration', {time: formatCountdown(info.ms)});
  return t('overview.countdownNone');
}
function renderCountdownWidget(evt){
  const info = computeStartCountdown(evt);
  return overviewWidgetWrap('countdown', `<div class="overview-countdown" id="overview-countdown-value">${formatOverviewCountdownText(info)}</div>`);
}
function renderTodosWidget(evt){
  const todos = computeDashboardTodos(evt);
  const body = todos.length ? `
    <ul class="overview-todo-list">${todos.map(td => `<li class="${td.severity ? 'todo-' + td.severity : ''}">${td.text}</li>`).join('')}</ul>
  ` : `<div class="overview-widget-empty">${t('overview.allDone')}</div>`;
  return overviewWidgetWrap('todos', body);
}
function renderOverviewWidget(key, evt){
  switch(key){
    case 'statusTiles': return renderStatusTilesWidget(evt);
    case 'cpLoad': return renderCpLoadWidget(evt);
    case 'recentActivity': return renderRecentActivityWidget(evt);
    case 'categoryDistribution': return renderCategoryDistributionWidget(evt);
    case 'miniLeaderboard': return renderMiniLeaderboardWidget(evt);
    case 'countdown': return renderCountdownWidget(evt);
    case 'todos': return renderTodosWidget(evt);
    default: return '';
  }
}
function toggleOverviewSettings(){
  state.overviewSettingsOpen = !state.overviewSettingsOpen;
  renderOverview();
}
function onOverviewWidgetVisibilityToggle(key, checked){
  const evt = state.currentEvent;
  if(!evt) return;
  evt.dashboardWidgetVisibility[key] = checked;
  debouncedSave();
  renderOverview();
}
function moveOverviewWidget(key, dir){
  const evt = state.currentEvent;
  if(!evt) return;
  const order = evt.dashboardWidgetOrder;
  const idx = order.indexOf(key);
  const newIdx = idx + dir;
  if(idx < 0 || newIdx < 0 || newIdx >= order.length) return;
  const tmp = order[idx]; order[idx] = order[newIdx]; order[newIdx] = tmp;
  debouncedSave();
  renderOverview();
}
function startOverviewTick(){
  stopOverviewTick();
  overviewTickInterval = setInterval(updateOverviewCountdown, 1000);
}
function stopOverviewTick(){
  if(overviewTickInterval){ clearInterval(overviewTickInterval); overviewTickInterval = null; }
}
function updateOverviewCountdown(){
  if(state.view !== 'overview'){ stopOverviewTick(); return; }
  const evt = state.currentEvent;
  const el = document.getElementById('overview-countdown-value');
  if(!el || !evt) return;
  el.textContent = formatOverviewCountdownText(computeStartCountdown(evt));
}
function renderOverview(){
  const el = document.getElementById('view-overview');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('checkin.noEventSelected')}</div>`;
    return;
  }
  const subtitle = evt.status === 'running' ? t('overview.subtitleLive')
    : evt.status === 'completed' ? t('overview.subtitleResults')
    : t('overview.subtitlePrep');

  const order = (evt.dashboardWidgetOrder && evt.dashboardWidgetOrder.length) ? evt.dashboardWidgetOrder : DASHBOARD_WIDGET_KEYS.slice();
  const visibility = evt.dashboardWidgetVisibility || {};
  const visibleWidgets = order.filter(k => visibility[k] && DASHBOARD_WIDGET_KEYS.includes(k));

  const settingsPanel = state.overviewSettingsOpen ? `
    <div class="overview-settings-panel">
      <div class="overview-settings-hint">${t('overview.settingsHint')}</div>
      ${order.map((key, i) => `
        <div class="overview-settings-row">
          <label class="checkbox-row">
            <input type="checkbox" ${visibility[key] ? 'checked' : ''} onchange="onOverviewWidgetVisibilityToggle('${key}', this.checked)">
            ${overviewWidgetTitle(key)}
          </label>
          <span class="overview-settings-move">
            <button type="button" class="btn btn-sm" ${i === 0 ? 'disabled' : ''} onclick="moveOverviewWidget('${key}', -1)">&uarr;</button>
            <button type="button" class="btn btn-sm" ${i === order.length - 1 ? 'disabled' : ''} onclick="moveOverviewWidget('${key}', 1)">&darr;</button>
          </span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const widgetsHtml = visibleWidgets.length ? `
    <div class="overview-widget-grid">${visibleWidgets.map(key => renderOverviewWidget(key, evt)).join('')}</div>
  ` : `
    <div class="empty-state">
      <div class="display">${t('overview.emptyTitle')}</div>
      <p>${t('overview.emptyHint')}</p>
    </div>
  `;

  el.innerHTML = `
    <div class="dash-head">
      <div>
        <h2>${t('overview.title')}</h2>
        <p>${subtitle}</p>
      </div>
      <div>
        <button type="button" class="btn btn-sm" onclick="toggleOverviewSettings()">${state.overviewSettingsOpen ? t('overview.doneCustomizing') : t('overview.customize')}</button>
      </div>
    </div>
    ${renderBackupStatusLine(evt)}
    ${renderBeamerOverviewSection(evt)}
    ${settingsPanel}
    ${widgetsHtml}
  `;
}
function renderBackupStatusLine(evt){
  if(typeof hasSharedStorage !== 'undefined' && hasSharedStorage) return '';
  if(!evt.lastBackupAt && evt.status !== 'running') return '';
  const text = evt.lastBackupAt ? t('dataSafety.lastBackupLine', {time: formatMinutesAgo(evt.lastBackupAt)}) : t('dataSafety.noBackupYet');
  return `
    <div class="overview-backup-line">
      <span>${text}</span>
      ${evt.status === 'running' ? `<button type="button" class="btn btn-sm" onclick="triggerBackupNow(false)">${t('dataSafety.backupNowButton')}</button>` : ''}
    </div>
  `;
}
