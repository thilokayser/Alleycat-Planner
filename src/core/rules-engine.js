/* ---------------- rules engine ----------------
   Generic WENN [Trigger] UND [Bedingung] DANN [Effekt] evaluator. There is
   deliberately NO visual rule builder in the UI (see game-modes.js) — the
   engine itself stays generic so a later preset only needs a new
   GAME_MODE_DEFS entry (trigger/condition/effect functions), never a
   rewrite of this file. evaluateRules() is the single call site every
   trigger point (check-in, finish, tick, manual HQ actions) goes through;
   an effect can veto the action that triggered it by returning
   {block:true, message} (used by e.g. the time-window / zone presets to
   reject an out-of-window or out-of-zone check-in). */
function evaluateRules(evt, triggerType, context){
  const result = {blocked: false, message: ''};
  if(!evt || !evt.gameModes) return result;
  evt.gameModes.filter(m => m.enabled).forEach(mode => {
    const def = GAME_MODE_DEFS[mode.type];
    if(!def || !def.rules) return;
    def.rules.filter(rule => rule.trigger === triggerType).forEach(rule => {
      if(rule.condition && !rule.condition(evt, mode, context || {})) return;
      const effectResult = rule.effect(evt, mode, context || {});
      if(effectResult && effectResult.block){
        result.blocked = true;
        result.message = effectResult.message || result.message;
      }
    });
  });
  return result;
}

/* ---------------- on_tick scheduling ----------------
   One interval for the app's lifetime (same self-guarding pattern as
   startAutoBackup() in data-safety.js) — only does work while a race is
   actually running and at least one enabled mode has an on_tick rule. */
let rulesTickInterval = null;
function startRulesEngineTick(){
  if(rulesTickInterval) return;
  rulesTickInterval = setInterval(runRulesEngineTick, 10000);
}
function runRulesEngineTick(){
  const evt = state.currentEvent;
  if(!evt || evt.status !== 'running') return;
  if(!(evt.gameModes || []).some(m => m.enabled)) return;
  const before = JSON.stringify({rt: evt.ruleRuntimeState, riders: (evt.riders || []).map(r => r.raceStatus)});
  evaluateRules(evt, 'on_tick', {now: Date.now()});
  const after = JSON.stringify({rt: evt.ruleRuntimeState, riders: (evt.riders || []).map(r => r.raceStatus)});
  if(before !== after){
    debouncedSave();
    if(state.view === 'checkin') renderCheckin();
    else if(state.view === 'overview') renderOverview();
  }
}

/* ---------------- event log (feeds the beamer's live ticker, Phase 12) ----------------
   Only recorded while at least one game mode is enabled (the ticker is
   itself only shown then, see getBeamerLayout() in beamer-modes.js) so
   events without any active mode don't accumulate unused log entries in
   storage. Also nudges any open beamer tab via live-sync.js's
   BroadcastChannel for an instant reaction, independent of its normal
   ~7s event-data poll (same pattern as broadcastRaceStart() for GO). */
function anyGameModeEnabled(evt){
  return (evt.gameModes || []).some(m => m.enabled);
}
function pushEventLog(evt, type, message, bib){
  if(!anyGameModeEnabled(evt)) return null;
  evt.ruleRuntimeState = evt.ruleRuntimeState || {};
  evt.ruleRuntimeState.eventLog = evt.ruleRuntimeState.eventLog || [];
  const entry = {id: uid('log'), type, message, bib: bib || null, at: toLocalDateTimeInputValue(new Date())};
  evt.ruleRuntimeState.eventLog.push(entry);
  if(evt.ruleRuntimeState.eventLog.length > 30) evt.ruleRuntimeState.eventLog = evt.ruleRuntimeState.eventLog.slice(-30);
  broadcastLiveEvent(evt.id, entry);
  return entry;
}

/* ---------------- points ledger ---------------- */
function awardPoints(evt, riderBib, checkpointId, amount, reason, source){
  if(!amount) return;
  evt.pointsLedger = evt.pointsLedger || [];
  evt.pointsLedger.push({
    id: uid('pts'), riderBib, checkpointId: checkpointId || null,
    amount, reason, source, createdAt: toLocalDateTimeInputValue(new Date())
  });
}
function removeLedgerEntries(evt, matcher){
  evt.pointsLedger = (evt.pointsLedger || []).filter(p => !matcher(p));
}
function pointsForRider(evt, riderBib){
  return (evt.pointsLedger || []).filter(p => p.riderBib === riderBib).reduce((sum, p) => sum + p.amount, 0);
}
function ledgerEntriesForRider(evt, riderBib){
  return (evt.pointsLedger || []).filter(p => p.riderBib === riderBib).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/* ---------------- shared helpers used across multiple presets ---------------- */
function getGameMode(evt, type){
  return (evt.gameModes || []).find(m => m.type === type);
}
function isGameModeEnabled(evt, type){
  const m = getGameMode(evt, type);
  return !!(m && m.enabled);
}
function isCpRevealed(evt, cp){
  if(!isGameModeEnabled(evt, 'prerequisite') || !cp.gameHidden) return true;
  return ((evt.ruleRuntimeState && evt.ruleRuntimeState.revealedCheckpoints) || []).includes(cp.id);
}
function isCpSatisfiedForRider(rider, cp){
  if((rider.completed || []).includes(cp.id)) return true;
  return !!(rider.gameFlags && rider.gameFlags.jokerCpId === cp.id);
}
function setZoneActive(evt, zoneId, active){
  const zone = getZone(evt, zoneId);
  if(!zone) return null;
  zone.active = !!active;
  pushEventLog(evt, 'district_toggled', active
    ? t('gameModes.tickerDistrictActivated', {name: zone.name || t('zones.unnamed')})
    : t('gameModes.tickerDistrictDeactivated', {name: zone.name || t('zones.unnamed')}), null);
  return zone;
}
function zoneCenterOf(evt){
  const withPos = (evt.checkpoints || []).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if(!withPos.length) return null;
  const lat = withPos.reduce((s, c) => s + c.lat, 0) / withPos.length;
  const lng = withPos.reduce((s, c) => s + c.lng, 0) / withPos.length;
  return {lat, lng};
}
function currentZoneStage(evt, mode){
  const stages = (mode.config && mode.config.stages) || [];
  const idx = evt.ruleRuntimeState && Number.isInteger(evt.ruleRuntimeState.zoneStage) ? evt.ruleRuntimeState.zoneStage : -1;
  return idx >= 0 && idx < stages.length ? stages[idx] : null;
}
/* Paket 4 migration: zone_active can now anchor on a real, organizer-drawn
   circle from evt.zones (mode.config.zoneId) instead of always the implicit
   checkpoint centroid. Falls back to the original zoneCenterOf() whenever no
   zone is picked (or the picked one was deleted/isn't a circle) — this is
   the compatibility seam that keeps every pre-Paket-4 event and every
   existing zone_active test passing unchanged, since none of them set
   config.zoneId. */
function zoneActiveCenterOf(evt, mode){
  const zone = mode && mode.config && mode.config.zoneId ? getZone(evt, mode.config.zoneId) : null;
  if(zone && zone.type === 'circle' && zone.center) return zone.center;
  return zoneCenterOf(evt);
}
function isCpClosedByZone(evt, cp){
  const mode = getGameMode(evt, 'zone_active');
  if(!mode || !mode.enabled) return false;
  const stage = currentZoneStage(evt, mode);
  if(!stage) return false;
  const center = zoneActiveCenterOf(evt, mode);
  if(!center || !Number.isFinite(cp.lat) || !Number.isFinite(cp.lng)) return false;
  const distMeters = haversineDistanceKm(center.lat, center.lng, cp.lat, cp.lng) * 1000;
  return distMeters > stage.radius;
}
function advanceZoneStage(evt, mode){
  const stages = (mode.config && mode.config.stages) || [];
  evt.ruleRuntimeState = evt.ruleRuntimeState || {};
  const current = Number.isInteger(evt.ruleRuntimeState.zoneStage) ? evt.ruleRuntimeState.zoneStage : -1;
  if(current + 1 >= stages.length) return false;
  evt.ruleRuntimeState.zoneStage = current + 1;
  const newStage = stages[evt.ruleRuntimeState.zoneStage];
  const zone = mode.config.zoneId ? getZone(evt, mode.config.zoneId) : null;
  if(zone && zone.type === 'circle' && newStage) zone.radiusMeters = newStage.radius;
  pushEventLog(evt, 'zone_shrink', t('gameModes.tickerZoneShrink', {n: current + 2}), null);
  AlleycatSounds.play('zone_shrink');
  return true;
}
function lastCheckpointTimeForRider(rider){
  const times = Object.values(rider.checkpointTimes || {}).filter(Boolean);
  if(!times.length) return null;
  return times.sort((a, b) => new Date(a) - new Date(b)).pop();
}
