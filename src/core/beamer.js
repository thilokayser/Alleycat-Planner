/* ---------------- beamer view ----------------
   Eigene, komplett von der normalen SPA-Navigation losgelöste Route
   (#/beamer/<event-id>), Vollbild, hoher Kontrast. In der lokalen
   Variante heißt "separat erreichbar" praktisch: zweiter Tab im
   selben Browser (IndexedDB ist origin-, nicht tab-gebunden) — echtes
   Cross-Device gibt es nur über die Server-Variante, dort funktioniert
   dieselbe Route genauso (storageGet/Set sind backend-agnostisch).
   Sync: BroadcastChannel für sofortige Reaktion (Start-Trigger, neue
   Daten), IndexedDB/Storage-Polling alle 7s als robuster Fallback,
   falls der Beamer-Tab neu geladen wurde oder den Broadcast verpasst
   hat — Storage bleibt in jedem Fall Wahrheitsquelle. */
let beamerState = null;
let beamerChannel;
let beamerPollInterval = null;
let beamerTickInterval = null;
let beamerGoTimeout = null;

function isBeamerRoute(){
  return /^#\/beamer\//.test(location.hash);
}
function beamerEventIdFromHash(){
  const m = location.hash.match(/^#\/beamer\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function openBeamerView(eventId){
  window.open(location.pathname + location.search + '#/beamer/' + encodeURIComponent(eventId), '_blank');
}
function getBeamerChannel(){
  if(beamerChannel === undefined){
    try{ beamerChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('alleycat-beamer') : null; }
    catch(e){ beamerChannel = null; }
  }
  return beamerChannel;
}
function broadcastRaceStart(eventId){
  const ch = getBeamerChannel();
  if(ch) ch.postMessage({type: 'race-started', eventId});
}
function broadcastEventUpdated(eventId){
  const ch = getBeamerChannel();
  if(ch) ch.postMessage({type: 'event-updated', eventId});
}

/* ---------------- sound-hook wiring (per-event, base64 in event data) ---------------- */
function registerEventSounds(evt){
  Object.keys(SOUND_EVENTS).forEach(key => {
    const hook = evt.soundHooks && evt.soundHooks[key];
    if(hook && hook.dataUrl) AlleycatSounds.register(key, hook.dataUrl);
    else AlleycatSounds.unregister(key);
  });
}
function onSoundHookFileChange(key, input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(file.size > 2 * 1024 * 1024){
    alert(t('beamer.soundTooLarge'));
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const evt = state.currentEvent;
    if(!evt) return;
    evt.soundHooks = evt.soundHooks || {};
    evt.soundHooks[key] = {name: file.name, dataUrl: reader.result};
    AlleycatSounds.register(key, reader.result);
    debouncedSave();
    renderOverview();
  };
  reader.readAsDataURL(file);
  input.value = '';
}
function removeSoundHook(key){
  const evt = state.currentEvent;
  if(!evt || !evt.soundHooks || !evt.soundHooks[key]) return;
  delete evt.soundHooks[key];
  AlleycatSounds.unregister(key);
  debouncedSave();
  renderOverview();
}
function testPlaySoundHook(key){
  const evt = state.currentEvent;
  const hook = evt && evt.soundHooks && evt.soundHooks[key];
  if(hook && !AlleycatSounds.isRegistered(key)) AlleycatSounds.register(key, hook.dataUrl);
  AlleycatSounds.play(key);
}
function renderBeamerSoundRow(evt, key, label){
  const hook = evt.soundHooks && evt.soundHooks[key];
  return `
    <div class="sound-hook-row">
      <span class="sound-hook-label">${label}</span>
      ${hook
        ? `<span class="sound-hook-filename">${escapeHtml(hook.name)}</span>
           <button type="button" class="btn btn-sm" onclick="testPlaySoundHook('${key}')">${t('beamer.soundTestButton')}</button>
           <button type="button" class="btn btn-sm btn-danger" onclick="removeSoundHook('${key}')">${t('common.delete')}</button>`
        : `<span class="sound-hook-empty">${t('beamer.soundNoneSet')}</span>`}
      <input type="file" id="sound-upload-${key}" accept="audio/*" style="display:none;" onchange="onSoundHookFileChange('${key}', this)">
      <button type="button" class="btn btn-sm" onclick="document.getElementById('sound-upload-${key}').click()">${t('beamer.soundUploadButton')}</button>
    </div>
  `;
}
function renderBeamerOverviewSection(evt){
  const soundEnabled = isFeatureEnabled('sound_hook');
  return `
    <div class="overview-beamer-bar" id="overview-beamer-section">
      <div class="overview-beamer-info">
        <button type="button" class="btn btn-primary" onclick="openBeamerView('${evt.id}')">${t('beamer.openButton')}</button>
        <span class="overview-beamer-hint">${t('beamer.hintNewTab')}</span>
      </div>
      ${soundEnabled ? `
      ${renderBeamerSoundRow(evt, 'race_start', t('beamer.soundRaceStartLabel'))}
      ${isGameModeEnabled(evt, 'zone_active') ? renderBeamerSoundRow(evt, 'zone_shrink', t('beamer.soundZoneShrinkLabel')) : ''}
      ${isGameModeEnabled(evt, 'sudden_death') ? renderBeamerSoundRow(evt, 'rider_eliminated', t('beamer.soundRiderEliminatedLabel')) : ''}
      ${isGameModeEnabled(evt, 'first_n') ? renderBeamerSoundRow(evt, 'bonus_secured', t('beamer.soundBonusSecuredLabel')) : ''}
      ${isGameModeEnabled(evt, 'prerequisite') ? renderBeamerSoundRow(evt, 'checkpoint_revealed', t('beamer.soundCheckpointRevealedLabel')) : ''}
      ` : ''}
    </div>
  `;
}

/* ---------------- beamer bootstrap ---------------- */
async function initBeamer(){
  const eventId = beamerEventIdFromHash();
  if(!(await initStorageBackend())) return;
  document.documentElement.setAttribute('data-theme', 'signal');
  const appEl = document.getElementById('app');
  const rootEl = document.getElementById('beamer-root');
  if(appEl) appEl.style.display = 'none';
  if(rootEl) rootEl.style.display = 'flex';
  beamerState = {eventId, evt: null, phase: 'loading', audioBlocked: false, mapPrefs: Object.assign({}, BEAMER_DEFAULT_MAP_PREFS)};
  await loadBeamerEvent();
  if(!beamerState.evt){
    renderBeamer();
    return;
  }
  beamerState.phase = (beamerState.evt.status === 'running' || beamerState.evt.status === 'completed') ? 'live' : 'countdown';
  renderBeamer();
  requestWakeLock();
  beamerPollInterval = setInterval(async () => { await loadBeamerEvent(); renderBeamer(); }, 7000);
  beamerTickInterval = setInterval(updateBeamerTick, 1000);
  const ch = getBeamerChannel();
  if(ch){
    ch.onmessage = (e) => {
      const data = e.data;
      if(!data || data.eventId !== eventId) return;
      if(data.type === 'race-started' && beamerState.phase === 'countdown') triggerGoSequence();
      else loadBeamerEvent().then(renderBeamer);
    };
  }
  const liveCh = getLiveSyncChannel();
  if(liveCh){
    liveCh.onmessage = (e) => {
      const data = e.data;
      if(!data || data.eventId !== eventId) return;
      handleLiveEvent(data.entry);
    };
  }
  window.addEventListener('hashchange', () => location.reload());
}
async function loadBeamerEvent(){
  const prevEliminated = (beamerState.evt && beamerState.phase === 'live')
    ? new Set((beamerState.evt.riders || []).filter(r => r.raceStatus === 'eliminated').map(r => r.bib))
    : null;
  const raw = await loadEvent(beamerState.eventId);
  if(!raw) return;
  beamerState.evt = withEventDefaults(raw);
  registerEventSounds(beamerState.evt);
  if(prevEliminated){
    const newlyEliminated = (beamerState.evt.riders || []).find(r => r.raceStatus === 'eliminated' && !prevEliminated.has(r.bib));
    if(newlyEliminated) triggerBeamerEliminationOverlay(newlyEliminated.name || ('#' + newlyEliminated.bib));
  }
}
function computeBeamerRegistered(evt){
  return (evt.riders || []).filter(r => (r.name || '').trim()).length;
}
function sortBeamerRiders(evt){
  const named = (evt.riders || []).filter(r => (r.name || '').trim());
  const finished = named.filter(r => r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated')
    .sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const underway = named.filter(r => !r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated')
    .sort((a, b) => (b.completed || []).length - (a.completed || []).length || a.bib - b.bib);
  const dnfDns = named.filter(r => r.raceStatus === 'dnf' || r.raceStatus === 'dns' || r.raceStatus === 'eliminated');
  return {finished, underway, dnfDns};
}

/* ---------------- render ---------------- */
function renderBeamer(){
  const root = document.getElementById('beamer-root');
  if(!root) return;
  if(!beamerState || !beamerState.evt){
    root.innerHTML = `<div class="beamer-message">${t('beamer.eventNotFound')}</div>`;
    return;
  }
  if(beamerState.overlay){ root.innerHTML = renderBeamerEliminationOverlay(beamerState.overlay.name); return; }
  if(beamerState.phase === 'go'){ root.innerHTML = renderBeamerGoOverlay(); return; }
  if(beamerState.phase === 'live'){
    root.innerHTML = renderBeamerLivePhase(beamerState.evt);
    const layout = getBeamerLayout(beamerState.evt);
    if(layout.showZoneMap) updateBeamerZoneMap(beamerState.evt);
    if(beamerUsesMapLayout(layout)) initBeamerLiveMap(beamerState.evt);
    return;
  }
  root.innerHTML = renderBeamerCountdownPhase(beamerState.evt);
}
function renderBeamerCountdownPhase(evt){
  const info = computeStartCountdown(evt);
  const countdownText = info.mode === 'until' ? formatCountdown(info.ms) : t('beamer.waitingForStart');
  return `
    <div class="beamer-phase beamer-countdown-phase">
      <div class="beamer-event-name">${escapeHtml(evt.name || t('common.unnamedEvent'))}</div>
      <div class="beamer-countdown" id="beamer-countdown-value">${countdownText}</div>
      <div class="beamer-registered">${t('beamer.registeredRidersLabel')}: ${computeBeamerRegistered(evt)}</div>
    </div>
  `;
}
function renderBeamerGoOverlay(){
  return `
    <div class="beamer-go-overlay">
      <div class="beamer-go-text">${t('beamer.goText')}</div>
      ${beamerState.audioBlocked ? `<div class="beamer-audio-unlock" onclick="dismissBeamerAudioBlock()">🔊 ${t('beamer.clickToActivateAudio')}</div>` : ''}
    </div>
  `;
}
/* Spec 15.1: optionale Einblendung nach Rennende — bewusst kein eigener
   Vollbild-Podium-Screen (15.6 führt den als separate, zurückgestellte
   Ergänzung), nur eine zweite Banner-Zeile neben der bestehenden
   "Rennen abgeschlossen"-Anzeige, verlinkt auf die Anfahrtsroute. */
function renderBeamerAfterpartyBanner(evt){
  const afterparty = getEventLocation(evt, 'afterparty');
  if(!eventLocationHasPosition(afterparty)) return '';
  const name = escapeHtml(afterparty.name || t('eventLocations.afterpartyLabel'));
  const origin = afterpartyRouteOrigin(evt);
  const text = t('beamer.afterpartyBanner', {name});
  return `<div class="beamer-afterparty-banner">🎉 ${origin ? `<a href="${mapsDirectionsLink(origin, afterparty)}" target="_blank" rel="noopener">${text}</a>` : text}</div>`;
}
function beamerProgressLabel(evt, r){
  const total = (evt.checkpoints || []).length;
  return `${(r.completed || []).length}/${total}`;
}
function beamerElapsedFinish(evt, r){
  if(!evt.startConfirmedAt || !r.finishTime) return '—';
  const ms = new Date(r.finishTime) - new Date(evt.startConfirmedAt);
  return isNaN(ms) ? '—' : formatCountdown(ms);
}
function renderBeamerTimeLeaderboard(evt){
  const {finished, underway, dnfDns} = sortBeamerRiders(evt);
  const rows = [
    ...finished.map((r, i) => `
      <tr>
        <td class="beamer-lb-rank">${i + 1}</td>
        <td class="beamer-lb-name">${escapeHtml(r.name || '—')}</td>
        <td class="beamer-lb-bib">#${r.bib}</td>
        <td class="beamer-lb-progress">${beamerProgressLabel(evt, r)}</td>
        <td class="beamer-lb-time">${beamerElapsedFinish(evt, r)}</td>
      </tr>
    `),
    ...underway.map(r => `
      <tr class="beamer-lb-underway">
        <td class="beamer-lb-rank">–</td>
        <td class="beamer-lb-name">${escapeHtml(r.name || '—')}</td>
        <td class="beamer-lb-bib">#${r.bib}</td>
        <td class="beamer-lb-progress">${beamerProgressLabel(evt, r)}</td>
        <td class="beamer-lb-time">${t('beamer.underwayLabel')}</td>
      </tr>
    `)
  ].join('');
  return `
    ${rows ? `
      <table class="beamer-lb-table">
        <thead><tr><th>${t('beamer.tableRank')}</th><th>${t('beamer.tableName')}</th><th>${t('beamer.tableBib')}</th><th>${t('beamer.tableProgress')}</th><th>${t('beamer.tableTime')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    ` : `<div class="beamer-message">${t('beamer.noFinishersYet')}</div>`}
    ${dnfDns.length ? `<div class="beamer-lb-footer">${t('beamer.dnsDnfFooter', {count: dnfDns.length})}</div>` : ''}
  `;
}
/* Default live view (no active game modes): full checkpoint map + rail,
   see beamerUsesMapLayout(). Any game mode enabled (zone/points/ticker)
   falls back to the pre-existing table/zone-map layout unchanged — see
   the scope note above computeBeamerCpProgress(). */
function beamerUsesMapLayout(layout){
  return !layout.showZoneMap && !layout.showPointsBoard && !layout.showEventTicker;
}
function renderBeamerLivePhase(evt){
  const info = computeStartCountdown(evt);
  const clockLabel = evt.status === 'completed' ? t('beamer.raceDurationLabel') : t('beamer.raceClockLabel');
  const clockText = (info.mode === 'since' || info.mode === 'duration') ? formatCountdown(info.ms) : '—';
  const layout = getBeamerLayout(evt);
  const useMapLayout = beamerUsesMapLayout(layout);
  return `
    <div class="beamer-phase beamer-live-phase">
      <div class="beamer-live-head">
        <div class="beamer-head-bar"></div>
        <div class="beamer-event-name">${escapeHtml(evt.name || t('common.unnamedEvent'))}</div>
        <div class="beamer-head-spacer"></div>
        <div class="beamer-clock-block" id="beamer-clock-block" style="visibility:${beamerMapPrefs().clock ? 'visible' : 'hidden'}">
          <span class="beamer-clock-label">${clockLabel}</span>
          <span class="beamer-clock-value" id="beamer-race-clock">${clockText}</span>
        </div>
      </div>
      ${evt.status === 'completed' ? `
        <div class="beamer-completed-banner">🏁 ${t('beamer.raceCompletedBanner')}</div>
        ${renderBeamerAfterpartyBanner(evt)}
      ` : ''}
      ${useMapLayout ? renderBeamerMapLayout(evt) : `
        <div class="beamer-live-body ${layout.showZoneMap ? 'has-zone-map' : ''}">
          <div class="beamer-live-main">
            ${layout.showPointsBoard ? renderBeamerPointsBoard(evt) : renderBeamerTimeLeaderboard(evt)}
          </div>
          ${layout.showZoneMap ? renderBeamerZoneSide(evt) : ''}
        </div>
        ${layout.showEventTicker ? renderBeamerTicker(evt) : ''}
      `}
      <div class="beamer-live-footer"><span class="beamer-brand">${t('beamer.brandFooter')}</span></div>
    </div>
  `;
}

/* ---------------- default live map layout (Beamer-Livekarte redesign) ----------------
   Riders have no live GPS in this app (only per-checkpoint scan timestamps,
   see rider-sync.js) — a rider's map pin therefore sits at the coordinates
   of their last-passed checkpoint, not a real live position. Several
   riders sharing a checkpoint are spread with beamerScatterOffset() so
   pins don't fully overlap. */
function computeBeamerOrderedCps(evt){
  return (evt.checkpoints || []).map((cp, i) => ({cp, num: i + 1}));
}
function computeBeamerCpProgress(evt){
  const field = computeBeamerRegistered(evt);
  const riders = evt.riders || [];
  return computeBeamerOrderedCps(evt).map(({cp, num}) => ({
    cp, num, field,
    done: riders.filter(r => (r.name || '').trim() && (r.completed || []).includes(cp.id)).length
  }));
}
function beamerCpColorValue(cp){
  return cp.mandatory ? 'var(--ok)' : 'var(--beamer-bonus)';
}
function renderBeamerCpProgressList(evt){
  return computeBeamerCpProgress(evt).map(({cp, num, done, field}) => {
    const pct = field ? Math.round(done / field * 100) : 0;
    const color = beamerCpColorValue(cp);
    return `
      <div class="beamer-cp-row">
        <div class="beamer-cp-row-head">
          <span class="beamer-cp-badge" style="background:${color}">${num}</span>
          <span class="beamer-cp-name">${escapeHtml(cp.name || ('#' + num))}</span>
          <span class="beamer-cp-count">${done}/${field}</span>
        </div>
        <span class="beamer-cp-bar"><span class="beamer-cp-bar-fill" style="width:${pct}%;background:${color}"></span></span>
      </div>
    `;
  }).join('');
}
function beamerRiderLastCheckpoint(evt, rider){
  const entries = Object.entries(rider.checkpointTimes || {}).filter(([, iso]) => iso);
  if(!entries.length) return null;
  entries.sort((a, b) => new Date(a[1]) - new Date(b[1]));
  const [cpId, time] = entries[entries.length - 1];
  return {cp: (evt.checkpoints || []).find(c => c.id === cpId) || null, time};
}
function renderBeamerUnderwayList(evt){
  const {underway} = sortBeamerRiders(evt);
  if(!underway.length) return `<div class="beamer-message">${t('beamer.noRidersUnderway')}</div>`;
  return underway.map(r => {
    const last = beamerRiderLastCheckpoint(evt, r);
    return `
      <div class="beamer-rider-row">
        <span class="beamer-rider-bib">#${r.bib}</span>
        <span class="beamer-rider-name">${escapeHtml(r.name || '—')}</span>
        <span class="beamer-rider-last">${last && last.cp ? escapeHtml(last.cp.name) : '—'}</span>
        <span class="beamer-rider-since">${last ? formatMinutesAgo(last.time) : '—'}</span>
      </div>
    `;
  }).join('');
}
/* renderBeamerLivePhase()/renderBeamerMapLayout() take evt as their only
   real argument but also read the map-view toggle prefs off the global
   beamerState (same pattern as beamerState.audioBlocked in the GO
   overlay) — this helper keeps them callable (e.g. from test-suite.js)
   even before initBeamer() has set beamerState up. */
const BEAMER_DEFAULT_MAP_PREFS = {cp: true, radius: true, riders: true, nr: true, legend: true, cpRail: true, rdRail: true, clock: true};
function beamerMapPrefs(){
  return (beamerState && beamerState.mapPrefs) || BEAMER_DEFAULT_MAP_PREFS;
}
function beamerToggleRow(key, label){
  const on = beamerMapPrefs()[key];
  return `
    <div class="beamer-toggle-row${on ? ' on' : ''}" onclick="toggleBeamerMapPref('${key}', this)">
      <span class="beamer-toggle-switch"><i></i></span>${escapeHtml(label)}
    </div>
  `;
}
function renderBeamerMapLayout(evt){
  const prefs = beamerMapPrefs();
  return `
    <div class="beamer-map-layout">
      <div class="beamer-map-panel${prefs.nr ? '' : ' no-nr'}">
        <div id="beamer-live-map" class="beamer-live-map"></div>
        <div id="beamer-map-legend" class="beamer-map-legend" style="display:${prefs.legend ? 'flex' : 'none'}">
          <span class="beamer-legend-item"><span class="beamer-legend-dot" style="background:var(--ok)"></span>${t('beamer.legendMandatory')}</span>
          <span class="beamer-legend-item"><span class="beamer-legend-dot" style="background:var(--beamer-bonus)"></span>${t('beamer.legendBonus')}</span>
          <span class="beamer-legend-item"><span class="beamer-legend-dot" style="background:var(--hivis)"></span>${t('beamer.riderLegendLabel')}</span>
        </div>
        <div class="beamer-map-menu">
          <button type="button" class="beamer-menu-btn" onclick="toggleBeamerMenu()">${t('beamer.mapViewMenuLabel')}<span class="beamer-menu-caret" id="beamer-menu-caret">▾</span></button>
          <div class="beamer-menu-panel" id="beamer-menu-panel">
            <div class="beamer-menu-group">
              <span class="beamer-menu-heading">${t('beamer.mapSectionMap')}</span>
              ${beamerToggleRow('cp', t('beamer.toggleCheckpoints'))}
              ${beamerToggleRow('radius', t('beamer.toggleRadius'))}
              ${beamerToggleRow('riders', t('beamer.riderLegendLabel'))}
              ${beamerToggleRow('nr', t('beamer.toggleBibNumbers'))}
              ${beamerToggleRow('legend', t('beamer.toggleLegend'))}
            </div>
            <div class="beamer-menu-divider"></div>
            <div class="beamer-menu-group">
              <span class="beamer-menu-heading">${t('beamer.mapSectionSidebar')}</span>
              ${beamerToggleRow('cpRail', t('beamer.tableProgress'))}
              ${beamerToggleRow('rdRail', t('beamer.riderRailTitle'))}
              ${beamerToggleRow('clock', t('beamer.toggleClock'))}
            </div>
          </div>
        </div>
      </div>
      <div class="beamer-rail" id="beamer-rail" style="display:${(prefs.cpRail || prefs.rdRail) ? 'flex' : 'none'}">
        <div class="beamer-rail-card" id="beamer-cp-card" style="display:${prefs.cpRail ? 'flex' : 'none'}">
          <span class="beamer-rail-title">${t('beamer.tableProgress')}</span>
          <div class="beamer-cp-list">${renderBeamerCpProgressList(evt)}</div>
        </div>
        <div class="beamer-rail-card beamer-rail-card-grow" id="beamer-rider-card" style="display:${prefs.rdRail ? 'flex' : 'none'}">
          <div class="beamer-rail-title-row">
            <span class="beamer-rail-dot"></span>
            <span class="beamer-rail-title">${t('beamer.riderRailTitle')}</span>
          </div>
          <div class="beamer-rider-list">${renderBeamerUnderwayList(evt)}</div>
        </div>
      </div>
    </div>
  `;
}

/* Purely decorative catchment ring around each checkpoint (not tied to
   any enforced geofence — the actual GPS-mismatch check in rider-sync.js
   uses its own threshold and never draws on a map). */
const BEAMER_CP_RADIUS_M = 180;
function beamerScatterOffset(lat, lng, idx, total){
  if(total <= 1) return {lat, lng};
  const angle = (idx / total) * 2 * Math.PI;
  const deltaDeg = 0.00045;
  return {lat: lat + Math.sin(angle) * deltaDeg, lng: lng + (Math.cos(angle) * deltaDeg) / Math.cos(lat * Math.PI / 180)};
}
function computeBeamerRiderPositions(evt){
  const {underway} = sortBeamerRiders(evt);
  const byLastCp = {};
  const withLast = underway.map(rider => {
    const last = beamerRiderLastCheckpoint(evt, rider);
    if(!last || !last.cp || !Number.isFinite(last.cp.lat) || !Number.isFinite(last.cp.lng)) return null;
    byLastCp[last.cp.id] = (byLastCp[last.cp.id] || 0) + 1;
    return {rider, cp: last.cp};
  }).filter(Boolean);
  const seenPerCp = {};
  return withLast.map(({rider, cp}) => {
    const idx = seenPerCp[cp.id] || 0;
    seenPerCp[cp.id] = idx + 1;
    const pos = beamerScatterOffset(cp.lat, cp.lng, idx, byLastCp[cp.id]);
    return {rider, lat: pos.lat, lng: pos.lng};
  });
}
let beamerLiveMap = null;
let beamerLiveMapLayers = null;
function initBeamerLiveMap(evt){
  const container = document.getElementById('beamer-live-map');
  if(!container) return;
  if(beamerLiveMap){ beamerLiveMap.remove(); beamerLiveMap = null; beamerLiveMapLayers = null; }
  const orderedCps = computeBeamerOrderedCps(evt).filter(({cp}) => Number.isFinite(cp.lat) && Number.isFinite(cp.lng));
  if(!orderedCps.length) return;
  const prefs = beamerMapPrefs();
  beamerLiveMap = L.map(container, {zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false, doubleClickZoom: false, keyboard: false});
  createOfflineTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {subdomains: 'abc', maxZoom: 19}).addTo(beamerLiveMap);
  const cpLayer = L.layerGroup();
  const radiusLayer = L.layerGroup();
  const riderLayer = L.layerGroup();
  orderedCps.forEach(({cp, num}) => {
    const color = beamerCpColorValue(cp);
    radiusLayer.addLayer(L.circle([cp.lat, cp.lng], {radius: BEAMER_CP_RADIUS_M, color, weight: 2, opacity: .55, fillColor: color, fillOpacity: .1}));
    cpLayer.addLayer(L.marker([cp.lat, cp.lng], {
      icon: L.divIcon({className: '', iconSize: null, iconAnchor: [19, 19],
        html: `<div class="beamer-cp-pin" style="background:${color}"><span>${num}</span></div>`})
    }));
  });
  computeBeamerRiderPositions(evt).forEach(({rider, lat, lng}) => {
    riderLayer.addLayer(L.marker([lat, lng], {
      icon: L.divIcon({className: '', iconSize: null, iconAnchor: [16, 16],
        html: `<div class="beamer-rider-pin"><span class="beamer-rider-ping"></span><span class="beamer-rider-dot">${escapeHtml(String(rider.bib))}</span></div>`}),
      zIndexOffset: 500
    }));
  });
  beamerLiveMapLayers = {cp: cpLayer, radius: radiusLayer, riders: riderLayer};
  if(prefs.cp) cpLayer.addTo(beamerLiveMap);
  if(prefs.radius) radiusLayer.addTo(beamerLiveMap);
  if(prefs.riders) riderLayer.addTo(beamerLiveMap);
  const bounds = L.latLngBounds(orderedCps.map(({cp}) => [cp.lat, cp.lng]));
  requestAnimationFrame(() => { beamerLiveMap.invalidateSize(); beamerLiveMap.fitBounds(bounds, {padding: [50, 60]}); });
}
function toggleBeamerMenu(){
  const panel = document.getElementById('beamer-menu-panel');
  const caret = document.getElementById('beamer-menu-caret');
  if(!panel) return;
  const open = panel.style.display === 'flex';
  panel.style.display = open ? 'none' : 'flex';
  if(caret) caret.textContent = open ? '▾' : '▴';
}
function syncBeamerRail(){
  const cpCard = document.getElementById('beamer-cp-card');
  const rdCard = document.getElementById('beamer-rider-card');
  const rail = document.getElementById('beamer-rail');
  if(!rail) return;
  const any = (cpCard && cpCard.style.display !== 'none') || (rdCard && rdCard.style.display !== 'none');
  rail.style.display = any ? 'flex' : 'none';
  if(beamerLiveMap) requestAnimationFrame(() => beamerLiveMap.invalidateSize());
}
function toggleBeamerMapPref(key, el){
  if(!beamerState) return;
  const on = !beamerState.mapPrefs[key];
  beamerState.mapPrefs[key] = on;
  if(el) el.classList.toggle('on', on);
  const layers = beamerLiveMapLayers;
  if(key === 'cp' && layers) on ? layers.cp.addTo(beamerLiveMap) : layers.cp.remove();
  else if(key === 'radius' && layers) on ? layers.radius.addTo(beamerLiveMap) : layers.radius.remove();
  else if(key === 'riders' && layers) on ? layers.riders.addTo(beamerLiveMap) : layers.riders.remove();
  else if(key === 'nr'){ const panel = document.querySelector('.beamer-map-panel'); if(panel) panel.classList.toggle('no-nr', !on); }
  else if(key === 'legend'){ const el2 = document.getElementById('beamer-map-legend'); if(el2) el2.style.display = on ? 'flex' : 'none'; }
  else if(key === 'cpRail'){ const el2 = document.getElementById('beamer-cp-card'); if(el2) el2.style.display = on ? 'flex' : 'none'; syncBeamerRail(); }
  else if(key === 'rdRail'){ const el2 = document.getElementById('beamer-rider-card'); if(el2) el2.style.display = on ? 'flex' : 'none'; syncBeamerRail(); }
  else if(key === 'clock'){ const el2 = document.getElementById('beamer-clock-block'); if(el2) el2.style.visibility = on ? 'visible' : 'hidden'; }
}

/* ---------------- GO trigger + live tick ---------------- */
async function triggerGoSequence(){
  if(!beamerState) return;
  clearTimeout(beamerGoTimeout);
  beamerState.phase = 'go';
  beamerState.audioBlocked = false;
  renderBeamer();
  const played = await AlleycatSounds.play('race_start');
  if(!played && AlleycatSounds.isRegistered('race_start')){
    beamerState.audioBlocked = true;
    renderBeamer();
  }
  beamerGoTimeout = setTimeout(async () => {
    await loadBeamerEvent();
    beamerState.phase = 'live';
    beamerState.audioBlocked = false;
    renderBeamer();
  }, 4000);
}
function dismissBeamerAudioBlock(){
  if(!beamerState) return;
  beamerState.audioBlocked = false;
  AlleycatSounds.play('race_start');
  renderBeamer();
}
function updateBeamerTick(){
  if(!beamerState || !beamerState.evt) return;
  if(beamerState.phase === 'countdown'){
    const el = document.getElementById('beamer-countdown-value');
    if(!el) return;
    const info = computeStartCountdown(beamerState.evt);
    el.textContent = info.mode === 'until' ? formatCountdown(info.ms) : t('beamer.waitingForStart');
  } else if(beamerState.phase === 'live'){
    const el = document.getElementById('beamer-race-clock');
    if(!el) return;
    const info = computeStartCountdown(beamerState.evt);
    el.textContent = (info.mode === 'since' || info.mode === 'duration') ? formatCountdown(info.ms) : '—';
  }
}
