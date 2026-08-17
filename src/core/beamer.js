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
  return `
    <div class="overview-beamer-bar">
      <div class="overview-beamer-info">
        <button type="button" class="btn btn-primary" onclick="openBeamerView('${evt.id}')">${t('beamer.openButton')}</button>
        <span class="overview-beamer-hint">${t('beamer.hintNewTab')}</span>
      </div>
      ${renderBeamerSoundRow(evt, 'race_start', t('beamer.soundRaceStartLabel'))}
    </div>
  `;
}

/* ---------------- beamer bootstrap ---------------- */
async function initBeamer(){
  const eventId = beamerEventIdFromHash();
  if(!(await initStorageBackend())) return;
  document.documentElement.setAttribute('data-theme', 'dunkel');
  const appEl = document.getElementById('app');
  const rootEl = document.getElementById('beamer-root');
  if(appEl) appEl.style.display = 'none';
  if(rootEl) rootEl.style.display = 'flex';
  beamerState = {eventId, evt: null, phase: 'loading', audioBlocked: false};
  await loadBeamerEvent();
  if(!beamerState.evt){
    renderBeamer();
    return;
  }
  beamerState.phase = (beamerState.evt.status === 'running' || beamerState.evt.status === 'completed') ? 'live' : 'countdown';
  renderBeamer();
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
  window.addEventListener('hashchange', () => location.reload());
}
async function loadBeamerEvent(){
  const raw = await loadEvent(beamerState.eventId);
  if(!raw) return;
  beamerState.evt = withEventDefaults(raw);
  registerEventSounds(beamerState.evt);
}
function computeBeamerRegistered(evt){
  return (evt.riders || []).filter(r => (r.name || '').trim()).length;
}
function sortBeamerRiders(evt){
  const named = (evt.riders || []).filter(r => (r.name || '').trim());
  const finished = named.filter(r => r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns')
    .sort((a, b) => new Date(a.finishTime) - new Date(b.finishTime));
  const underway = named.filter(r => !r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns')
    .sort((a, b) => (b.completed || []).length - (a.completed || []).length || a.bib - b.bib);
  const dnfDns = named.filter(r => r.raceStatus === 'dnf' || r.raceStatus === 'dns');
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
  if(beamerState.phase === 'go'){ root.innerHTML = renderBeamerGoOverlay(); return; }
  if(beamerState.phase === 'live') { root.innerHTML = renderBeamerLivePhase(beamerState.evt); return; }
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
function beamerProgressLabel(evt, r){
  const total = (evt.checkpoints || []).length;
  return `${(r.completed || []).length}/${total}`;
}
function beamerElapsedFinish(evt, r){
  if(!evt.startConfirmedAt || !r.finishTime) return '—';
  const ms = new Date(r.finishTime) - new Date(evt.startConfirmedAt);
  return isNaN(ms) ? '—' : formatCountdown(ms);
}
function renderBeamerLivePhase(evt){
  const {finished, underway, dnfDns} = sortBeamerRiders(evt);
  const info = computeStartCountdown(evt);
  const clockLabel = evt.status === 'completed' ? t('beamer.raceDurationLabel') : t('beamer.raceClockLabel');
  const clockText = (info.mode === 'since' || info.mode === 'duration') ? formatCountdown(info.ms) : '—';
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
    <div class="beamer-phase beamer-live-phase">
      <div class="beamer-live-head">
        <div class="beamer-event-name">${escapeHtml(evt.name || t('common.unnamedEvent'))}</div>
        <div class="beamer-race-clock"><span>${clockLabel}</span> <span id="beamer-race-clock">${clockText}</span></div>
      </div>
      ${evt.status === 'completed' ? `<div class="beamer-completed-banner">🏁 ${t('beamer.raceCompletedBanner')}</div>` : ''}
      ${rows ? `
        <table class="beamer-lb-table">
          <thead><tr><th>${t('beamer.tableRank')}</th><th>${t('beamer.tableName')}</th><th>${t('beamer.tableBib')}</th><th>${t('beamer.tableProgress')}</th><th>${t('beamer.tableTime')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      ` : `<div class="beamer-message">${t('beamer.noFinishersYet')}</div>`}
      ${dnfDns.length ? `<div class="beamer-lb-footer">${t('beamer.dnsDnfFooter', {count: dnfDns.length})}</div>` : ''}
    </div>
  `;
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
