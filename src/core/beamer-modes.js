/* ---------------- beamer modes ----------------
   Game-mode-aware beamer widgets, kept in their own module (separate
   from beamer.js) so an event with no active game mode renders the
   beamer exactly as in Phase 8 — getBeamerLayout() below is the single
   switchboard every one of these widgets is gated behind. */
function getBeamerLayout(evt){
  const modes = (evt.gameModes || []).filter(m => m.enabled);
  return {
    showZoneMap: modes.some(m => m.type === 'zone_active'),
    showPointsBoard: evt.scoringMode === 'points',
    showEventTicker: modes.length > 0,
    showZoneCountdown: modes.some(m => m.type === 'zone_active' && m.config.triggerMode !== 'manual')
  };
}

/* ---------------- points leaderboard (reuses leaderboard.js's ranking) ---------------- */
function renderBeamerPointsBoard(evt){
  const named = (evt.riders || []).filter(r => (r.name || '').trim());
  const ranked = sortRidersByPoints(named, evt);
  const rows = ranked.map((r, i) => `
    <tr class="${r.raceStatus === 'eliminated' ? 'beamer-lb-eliminated' : ''}">
      <td class="beamer-lb-rank">${i + 1}</td>
      <td class="beamer-lb-name">${escapeHtml(r.name || '—')}${r.raceStatus === 'eliminated' ? ' 💀' : ''}</td>
      <td class="beamer-lb-bib">#${r.bib}</td>
      <td class="beamer-lb-points">${pointsForRider(evt, r.bib)}</td>
      <td class="beamer-lb-time">${beamerElapsedFinish(evt, r)}</td>
    </tr>
  `).join('');
  return rows ? `
    <table class="beamer-lb-table beamer-points-table">
      <thead><tr><th>${t('beamer.tableRank')}</th><th>${t('beamer.tableName')}</th><th>${t('beamer.tableBib')}</th><th>${t('gameModes.colGameModePoints')}</th><th>${t('gameModes.colFinishTime')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  ` : `<div class="beamer-message">${t('beamer.noFinishersYet')}</div>`;
}

/* ---------------- live event ticker ---------------- */
function renderBeamerTicker(evt){
  const entries = ((evt.ruleRuntimeState && evt.ruleRuntimeState.eventLog) || []).slice(-8).reverse();
  if(!entries.length) return '';
  return `
    <div class="beamer-ticker">
      ${entries.map(e => `<div class="beamer-ticker-item">${e.message}</div>`).join('')}
    </div>
  `;
}

/* ---------------- zone map (Battle Royale) ----------------
   grau = per-CP-Sperre (cp.locked, unabhängig von der Zone), rot =
   offen aber außerhalb der aktuellen Zonen-Stufe (isCpClosedByZone),
   grün = offen und in der Zone, ausgeblendet = geheim+nicht enthüllt
   (isCpRevealed filtert diese schon vor dem Rendern raus). Nutzt
   denselben Offline-Kachel-Cache wie die Editor-Karte (map.js). */
let beamerZoneMap = null;
function beamerZoneCountdownText(evt, mode){
  const stages = (mode.config && mode.config.stages) || [];
  const currentIdx = evt.ruleRuntimeState && Number.isInteger(evt.ruleRuntimeState.zoneStage) ? evt.ruleRuntimeState.zoneStage : -1;
  const next = stages[currentIdx + 1];
  if(!next || !evt.startConfirmedAt) return null;
  const targetMs = new Date(evt.startConfirmedAt).getTime() + next.atMinute * 60000;
  const remaining = targetMs - Date.now();
  return remaining > 0 ? formatCountdown(remaining) : null;
}
function updateBeamerZoneMap(evt){
  const container = document.getElementById('beamer-zone-map');
  if(!container) return;
  if(beamerZoneMap){ beamerZoneMap.remove(); beamerZoneMap = null; }
  const mode = getGameMode(evt, 'zone_active');
  if(!mode) return;
  const center = zoneActiveCenterOf(evt, mode);
  if(!center) return;
  beamerZoneMap = L.map(container, {zoomControl: false, attributionControl: false, scrollWheelZoom: false}).setView([center.lat, center.lng], 14);
  createOfflineTileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
    subdomains: 'abcd', maxZoom: 20
  }).addTo(beamerZoneMap);
  const stage = currentZoneStage(evt, mode);
  if(stage) L.circle([center.lat, center.lng], {radius: stage.radius, color: '#e0435b', weight: 2, fillOpacity: 0.08}).addTo(beamerZoneMap);
  const bounds = [];
  (evt.checkpoints || []).filter(cp => isCpRevealed(evt, cp) && Number.isFinite(cp.lat) && Number.isFinite(cp.lng)).forEach(cp => {
    const color = cp.locked ? '#888888' : (isCpClosedByZone(evt, cp) ? '#e0435b' : '#3fb950');
    L.circleMarker([cp.lat, cp.lng], {radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2}).addTo(beamerZoneMap);
    bounds.push([cp.lat, cp.lng]);
  });
  if(bounds.length) beamerZoneMap.fitBounds(L.latLngBounds(bounds).pad(0.2));
}
function renderBeamerZoneSide(evt){
  const mode = getGameMode(evt, 'zone_active');
  if(!mode) return '';
  const layout = getBeamerLayout(evt);
  const countdown = layout.showZoneCountdown ? beamerZoneCountdownText(evt, mode) : null;
  return `
    <div class="beamer-live-side">
      <div id="beamer-zone-map" class="beamer-zone-map"></div>
      ${countdown ? `<div class="beamer-zone-countdown">${t('gameModes.zoneNextShrinkIn', {time: countdown})}</div>` : ''}
    </div>
  `;
}

/* ---------------- elimination overlay ----------------
   Reuses the same fullscreen-snapshot mechanic as the GO! trigger in
   beamer.js: a few seconds of overlay, then back to the live view. */
let beamerOverlayTimeout = null;
function renderBeamerEliminationOverlay(name){
  return `
    <div class="beamer-elimination-overlay">
      <div class="beamer-elimination-icon">💀</div>
      <div class="beamer-elimination-text">${t('gameModes.eliminationOverlayText', {name: escapeHtml(name || '')})}</div>
    </div>
  `;
}
function triggerBeamerEliminationOverlay(name){
  if(!beamerState) return;
  clearTimeout(beamerOverlayTimeout);
  beamerState.overlay = {name};
  AlleycatSounds.play('rider_eliminated');
  renderBeamer();
  beamerOverlayTimeout = setTimeout(() => {
    if(!beamerState) return;
    beamerState.overlay = null;
    renderBeamer();
  }, 3500);
}

/* ---------------- live-sync reaction ----------------
   The only job of a received live-sync message is to reload event data
   right away instead of waiting for the ~7s poll — loadBeamerEvent()
   itself does the before/after elimination diff that decides whether
   to show the overlay, so this stays a single code path regardless of
   whether a reload was triggered by the broadcast or the poll fallback. */
function handleLiveEvent(entry){
  if(!beamerState) return;
  loadBeamerEvent().then(renderBeamer);
}
