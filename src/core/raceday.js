/* ---------------- raceday (fullscreen operator console) ----------------
   Not a separate view: state.view stays 'checkin' the whole time. Entering
   raceday just re-parents the already-rendered #view-checkin node into the
   raceday chrome once and hides #app — reuses 100% of check-in's business
   logic (scan, curfew, scoring, joker) instead of duplicating it. The
   chrome (topbar + stats sidebar) is built once on entry; renderCheckin()'s
   normal re-renders (typing a bib, confirming a rider, ...) only touch
   #view-checkin's own innerHTML, never re-parent it — reparenting on every
   keystroke would drop input focus. Stats sidebar refreshes alongside
   check-in via refreshRacedayStats(), a separate cheap update. See
   docs/superpowers/specs/2026-08-27-redesign-foundation-theme-nav-design.md
   for the redesign this belongs to (Teilprojekt 3). */
function enterRacedayMode(){
  if(!state.currentEvent) return;
  state.racedayActive = true;
  renderCheckin();
  const appEl = document.getElementById('app');
  const racedayEl = document.getElementById('raceday-root');
  renderRacedayChrome();
  const slot = document.getElementById('raceday-checkin-slot');
  const viewCheckin = document.getElementById('view-checkin');
  if(slot && viewCheckin) slot.appendChild(viewCheckin);
  if(appEl) appEl.style.display = 'none';
  if(racedayEl) racedayEl.style.display = 'flex';
  startRacedayTick();
  syncWakeLockForView();
}
function exitRacedayMode(){
  state.racedayActive = false;
  stopRacedayTick();
  const appEl = document.getElementById('app');
  const racedayEl = document.getElementById('raceday-root');
  const mainEl = document.getElementById('main');
  const viewCheckin = document.getElementById('view-checkin');
  if(mainEl && viewCheckin) mainEl.appendChild(viewCheckin);
  if(racedayEl) racedayEl.style.display = 'none';
  if(appEl) appEl.style.display = 'flex';
  render();
  syncWakeLockForView();
}
let racedayTickInterval = null;
function startRacedayTick(){
  stopRacedayTick();
  racedayTickInterval = setInterval(updateRacedayClock, 1000);
}
function stopRacedayTick(){
  if(racedayTickInterval){ clearInterval(racedayTickInterval); racedayTickInterval = null; }
}
function updateRacedayClock(){
  if(!state.racedayActive){ stopRacedayTick(); return; }
  const el = document.getElementById('raceday-clock-value');
  if(!el || !state.currentEvent) return;
  el.textContent = formatOverviewCountdownText(computeStartCountdown(state.currentEvent));
}
/* Prefers evt.ruleRuntimeState.eventLog (rules-engine.js's pushEventLog) —
   it's type-tagged (finish/bonus/zone-shrink/elimination/reveal) so the
   ticker can color-code events like the mockup, and it's already what
   feeds the beamer's ticker (beamer-modes.js:44). It's only populated
   while a game mode is enabled (pushEventLog's own guard); for a plain
   event without game modes, fall back to computeRecentActivity's
   checkpoint/finish-only feed so the ticker isn't just empty. */
const RACEDAY_TICKER_TONE = {
  rider_finished: 'finish',
  rider_eliminated: 'danger',
  zone_shrink: 'warn',
  district_toggled: 'warn'
};
function renderRacedayTicker(evt){
  const log = (evt.ruleRuntimeState && evt.ruleRuntimeState.eventLog) || [];
  if(log.length){
    const entries = log.slice(-10).reverse();
    return `
      <div class="raceday-ticker-list">
        ${entries.map(e => `
          <div class="raceday-ticker-row ${RACEDAY_TICKER_TONE[e.type] || ''}">
            <span class="raceday-ticker-time">${formatTimeOnly(e.at)}</span>
            <span>${e.message}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  const entries = computeRecentActivity(evt, 10);
  if(!entries.length) return `<div class="overview-widget-empty">${t('overview.noActivity')}</div>`;
  const finishLabel = t('overview.finishLabel');
  return `
    <div class="raceday-ticker-list">
      ${entries.map(e => `
        <div class="raceday-ticker-row ${e.label === finishLabel ? 'finish' : ''}">
          <span class="raceday-ticker-time">${formatTimeOnly(e.at)}</span>
          <span>#${e.bib} ${escapeHtml(e.name || '—')} &mdash; ${escapeHtml(e.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}
function refreshRacedayStats(){
  if(!state.racedayActive) return;
  const el = document.getElementById('raceday-stats');
  const evt = state.currentEvent;
  if(!el || !evt) return;
  el.innerHTML = `
    ${renderStatusTilesWidget(evt)}
    ${renderMiniLeaderboardWidget(evt)}
    <div class="overview-widget">
      <div class="overview-widget-head"><h3>${t('raceday.tickerTitle')}</h3></div>
      <div class="overview-widget-body">${renderRacedayTicker(evt)}</div>
    </div>
    <div class="raceday-status-footer">
      <span class="raceday-status-dot"></span>
      <span>${t('raceday.statusFooter')}</span>
    </div>
  `;
}
function renderRacedayChrome(){
  const root = document.getElementById('raceday-root');
  const evt = state.currentEvent;
  if(!root || !evt) return;
  root.innerHTML = `
    <div class="raceday-topbar">
      <span class="raceday-eyebrow">${t('raceday.eyebrow')}</span>
      <h2>${escapeHtml(evt.name || t('common.unnamedEvent'))}</h2>
      ${renderStatusControl(evt)}
      <div class="raceday-topbar-spacer"></div>
      <div class="raceday-clock">
        <div class="raceday-clock-value" id="raceday-clock-value">${formatOverviewCountdownText(computeStartCountdown(evt))}</div>
      </div>
      <div class="raceday-topbar-divider"></div>
      <button type="button" class="btn btn-sm" onclick="openBeamerView('${evt.id}')">${t('beamer.openButton')}</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="exitRacedayMode()">${t('raceday.exitButton')}</button>
    </div>
    <div class="raceday-body">
      <div class="raceday-checkin-slot" id="raceday-checkin-slot"></div>
      <div class="raceday-stats" id="raceday-stats"></div>
    </div>
  `;
  refreshRacedayStats();
}
