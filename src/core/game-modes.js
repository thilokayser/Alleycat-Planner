/* ---------------- game modes (Spielmodi-Engine preset catalog) ----------------
   MVP decision from the spec doc: only pre-defined modes, toggle on/off with
   parameters (same UX pattern as category presets) — no visual rule builder.
   Each entry below IS the internal, generic rule definition the engine in
   rules-engine.js evaluates; the UI only ever shows a checkbox + a small
   parameter form per mode, never the trigger/condition/effect wiring itself.
   "Kopfgeld" from the spec is explicitly deferred ("Phase 2 / spätere
   Erweiterung" — needs live leader recalculation + rider-tag interaction) and
   intentionally not implemented here; its condition type `is_leader` is
   therefore unused for now. */
const GAME_MODE_TYPES = ['time_window', 'first_n', 'prerequisite', 'zone_active', 'rider_flag', 'sequence_match', 'sudden_death'];
const POINTS_AWARDING_MODE_TYPES = ['first_n', 'sequence_match'];
/* `||` treats an intentional 0 (e.g. "eliminate immediately") the same as
   "unset", silently falling back to the default — use this instead for any
   numeric config field where 0 is a legitimate value. */
function numOr(value, fallback){ return Number.isFinite(value) ? value : fallback; }

function withGameModeDefaults(m){
  const def = GAME_MODE_DEFS[m.type] || {};
  return {
    id: m.id || uid('mode'),
    type: m.type,
    enabled: !!m.enabled,
    config: Object.assign({}, def.defaultConfig || {}, m.config || {})
  };
}

function maybeAdvanceZoneBySchedule(evt, mode){
  const stages = (mode.config && mode.config.stages) || [];
  const startMs = new Date(evt.startConfirmedAt).getTime();
  if(isNaN(startMs)) return;
  const elapsedMin = (Date.now() - startMs) / 60000;
  let advanced = true;
  while(advanced){
    const current = evt.ruleRuntimeState && Number.isInteger(evt.ruleRuntimeState.zoneStage) ? evt.ruleRuntimeState.zoneStage : -1;
    const next = current + 1;
    advanced = next < stages.length && elapsedMin >= stages[next].atMinute && advanceZoneStage(evt, mode);
  }
}

const GAME_MODE_DEFS = {
  time_window: {
    type: 'time_window',
    defaultConfig: {},
    rules: [{
      trigger: 'on_checkin',
      condition: (evt, mode, ctx) => ctx.checkpoint && ctx.checkpoint.timeWindowEnabled,
      effect: (evt, mode, ctx) => {
        const result = computeTimeWindowResult(ctx.checkpoint, ctx.timestamp);
        if(result && !result.ok){
          return {block: true, message: t('gameModes.timeWindowBlocked', {reason: result.reason === 'early' ? t('checkin.tooEarly') : t('checkin.tooLate')})};
        }
      }
    }]
  },
  first_n: {
    type: 'first_n',
    defaultConfig: {pointsByRank: [5, 3, 1]},
    rules: [{
      trigger: 'on_checkin',
      condition: (evt, mode, ctx) => ctx.checkpoint && !ctx.checkpoint.mandatory,
      effect: (evt, mode, ctx) => {
        const cp = ctx.checkpoint;
        const priorCount = (evt.riders || []).filter(r => r.bib !== ctx.rider.bib && (r.completed || []).includes(cp.id)).length;
        const points = (mode.config.pointsByRank || [])[priorCount];
        if(points){
          awardPoints(evt, ctx.rider.bib, cp.id, points, t('gameModes.firstNReason', {rank: priorCount + 1, name: cp.name || t('overview.checkpointFallbackLabel')}), 'first_n');
          pushEventLog(evt, 'bonus_secured', t('gameModes.tickerBonusSecured', {name: escapeHtml(ctx.rider.name || ('#' + ctx.rider.bib))}), ctx.rider.bib);
          AlleycatSounds.play('bonus_secured');
        }
      }
    }]
  },
  prerequisite: {
    type: 'prerequisite',
    defaultConfig: {},
    rules: [{
      trigger: 'on_checkin',
      condition: () => true,
      effect: (evt, mode, ctx) => {
        evt.ruleRuntimeState = evt.ruleRuntimeState || {};
        evt.ruleRuntimeState.revealedCheckpoints = evt.ruleRuntimeState.revealedCheckpoints || [];
        (evt.checkpoints || []).forEach(cp => {
          if(cp.gameHidden && cp.gameRevealPrerequisiteCpId === ctx.checkpoint.id && !evt.ruleRuntimeState.revealedCheckpoints.includes(cp.id)){
            evt.ruleRuntimeState.revealedCheckpoints.push(cp.id);
            pushEventLog(evt, 'checkpoint_revealed', t('gameModes.tickerRevealed', {name: escapeHtml(cp.name || t('overview.checkpointFallbackLabel'))}), null);
            AlleycatSounds.play('checkpoint_revealed');
          }
        });
      }
    }]
  },
  zone_active: {
    type: 'zone_active',
    defaultConfig: {triggerMode: 'scheduled', stages: [{radius: 2000, atMinute: 10}, {radius: 1000, atMinute: 20}, {radius: 500, atMinute: 30}]},
    rules: [
      {
        trigger: 'on_tick',
        condition: (evt, mode) => evt.status === 'running' && evt.startConfirmedAt && (mode.config.triggerMode === 'scheduled' || mode.config.triggerMode === 'both'),
        effect: (evt, mode) => { maybeAdvanceZoneBySchedule(evt, mode); }
      },
      {
        trigger: 'manual',
        condition: (evt, mode, ctx) => ctx.action === 'advance_zone_stage' && ctx.modeId === mode.id && (mode.config.triggerMode === 'manual' || mode.config.triggerMode === 'both'),
        effect: (evt, mode) => { advanceZoneStage(evt, mode); }
      },
      {
        trigger: 'on_checkin',
        condition: (evt, mode, ctx) => ctx.checkpoint && isCpClosedByZone(evt, ctx.checkpoint),
        effect: () => ({block: true, message: t('gameModes.zoneClosedBlocked')})
      }
    ]
  },
  rider_flag: {
    type: 'rider_flag',
    defaultConfig: {},
    rules: [{
      trigger: 'manual',
      condition: (evt, mode, ctx) => ctx.action === 'assign_joker' && ctx.rider,
      effect: (evt, mode, ctx) => {
        ctx.rider.gameFlags = ctx.rider.gameFlags || {};
        if(ctx.checkpointId) ctx.rider.gameFlags.jokerCpId = ctx.checkpointId;
        else delete ctx.rider.gameFlags.jokerCpId;
      }
    }]
  },
  sequence_match: {
    type: 'sequence_match',
    defaultConfig: {multiplier: 2},
    rules: [{
      trigger: 'on_finish',
      condition: (evt, mode, ctx) => evt.checkpointOrderMode === 'fest' && !(ctx.rider.checkpointOrderOverrides || []).length
        && evt.checkpoints.length > 0 && evt.checkpoints.every(cp => (ctx.rider.completed || []).includes(cp.id)),
      effect: (evt, mode, ctx) => {
        removeLedgerEntries(evt, p => p.riderBib === ctx.rider.bib && p.source === 'sequence_match');
        const base = pointsForRider(evt, ctx.rider.bib);
        const bonus = Math.round(base * (numOr(mode.config.multiplier, 2) - 1));
        if(bonus > 0) awardPoints(evt, ctx.rider.bib, null, bonus, t('gameModes.sequenceMatchReason'), 'sequence_match');
      }
    }]
  },
  sudden_death: {
    type: 'sudden_death',
    defaultConfig: {cutoffMinutes: 30, inactivityMinutes: 20},
    rules: [{
      trigger: 'on_tick',
      condition: (evt, mode) => evt.status === 'running' && !!evt.startConfirmedAt,
      effect: (evt, mode, ctx) => {
        const startMs = new Date(evt.startConfirmedAt).getTime();
        const nowMs = ctx.now || Date.now();
        if(isNaN(startMs)) return;
        const elapsedMin = (nowMs - startMs) / 60000;
        if(elapsedMin < numOr(mode.config.cutoffMinutes, 30)) return;
        (evt.riders || []).forEach(r => {
          if(r.raceStatus || r.finishTime || !(r.name || '').trim()) return;
          const lastCp = lastCheckpointTimeForRider(r);
          const lastMs = lastCp ? new Date(lastCp).getTime() : startMs;
          if((nowMs - lastMs) / 60000 > numOr(mode.config.inactivityMinutes, 20)){
            r.raceStatus = 'eliminated';
            pushEventLog(evt, 'rider_eliminated', t('gameModes.tickerEliminated', {name: escapeHtml(r.name || ('#' + r.bib))}), r.bib);
            AlleycatSounds.play('rider_eliminated');
          }
        });
      }
    }]
  }
};

/* ---------------- toggle + config mutation ---------------- */
function toggleGameMode(type, enabled){
  const evt = state.currentEvent;
  if(!evt) return;
  evt.gameModes = evt.gameModes || [];
  let mode = evt.gameModes.find(m => m.type === type);
  if(!mode){
    mode = withGameModeDefaults({type});
    evt.gameModes.push(mode);
  }
  if(enabled && POINTS_AWARDING_MODE_TYPES.includes(type) && evt.scoringMode !== 'points'){
    if(!confirm(t('gameModes.scoringSwitchConfirm'))){ renderOverview(); return; }
    evt.scoringMode = 'points';
  }
  mode.enabled = enabled;
  debouncedSave();
  renderOverview();
}
function onGameModeConfigChange(type, key, value){
  const mode = getGameMode(state.currentEvent, type);
  if(!mode) return;
  mode.config[key] = value;
  debouncedSave();
  renderOverview();
}
function onFirstNPointsChange(value){
  const mode = getGameMode(state.currentEvent, 'first_n');
  if(!mode) return;
  mode.config.pointsByRank = value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  debouncedSave();
}
function onZoneTriggerModeChange(value){
  const mode = getGameMode(state.currentEvent, 'zone_active');
  if(!mode) return;
  mode.config.triggerMode = value;
  debouncedSave();
  renderOverview();
}
function addZoneStage(){
  const mode = getGameMode(state.currentEvent, 'zone_active');
  if(!mode) return;
  mode.config.stages = mode.config.stages || [];
  mode.config.stages.push({radius: 500, atMinute: (mode.config.stages.length + 1) * 10});
  debouncedSave();
  renderOverview();
}
function removeZoneStage(idx){
  const mode = getGameMode(state.currentEvent, 'zone_active');
  if(!mode) return;
  mode.config.stages.splice(idx, 1);
  debouncedSave();
  renderOverview();
}
function onZoneStageFieldChange(idx, field, value){
  const mode = getGameMode(state.currentEvent, 'zone_active');
  if(!mode || !mode.config.stages[idx]) return;
  mode.config.stages[idx][field] = parseInt(value, 10) || 0;
  debouncedSave();
}
function manualAdvanceZoneStage(){
  const evt = state.currentEvent;
  const mode = getGameMode(evt, 'zone_active');
  if(!evt || !mode) return;
  evaluateRules(evt, 'manual', {action: 'advance_zone_stage', modeId: mode.id});
  debouncedSave();
  renderOverview();
}

/* ---------------- settings panel UI (rendered into the Overview tab) ---------------- */
function gameModeLabel(type){ return t('gameModes.type.' + type); }
function gameModeDesc(type){ return t('gameModes.desc.' + type); }
function renderGameModeConfigForm(evt, mode){
  switch(mode.type){
    case 'first_n':
      return `
        <div class="game-mode-config-row">
          <label>${t('gameModes.pointsByRankLabel')}</label>
          <input type="text" value="${escapeHtml((mode.config.pointsByRank || []).join(', '))}" onchange="onFirstNPointsChange(this.value)">
        </div>
      `;
    case 'sequence_match':
      return `
        <div class="game-mode-config-row">
          <label>${t('gameModes.multiplierLabel')}</label>
          <input type="number" min="1" step="0.5" value="${numOr(mode.config.multiplier, 2)}" onchange="onGameModeConfigChange('sequence_match', 'multiplier', numOr(parseFloat(this.value), 2))">
        </div>
      `;
    case 'sudden_death':
      return `
        <div class="game-mode-config-row">
          <label>${t('gameModes.cutoffMinutesLabel')}</label>
          <input type="number" min="0" value="${numOr(mode.config.cutoffMinutes, 30)}" onchange="onGameModeConfigChange('sudden_death', 'cutoffMinutes', numOr(parseInt(this.value, 10), 30))">
        </div>
        <div class="game-mode-config-row">
          <label>${t('gameModes.inactivityMinutesLabel')}</label>
          <input type="number" min="0" value="${numOr(mode.config.inactivityMinutes, 20)}" onchange="onGameModeConfigChange('sudden_death', 'inactivityMinutes', numOr(parseInt(this.value, 10), 20))">
        </div>
      `;
    case 'zone_active': {
      const stages = mode.config.stages || [];
      const stageInfo = currentZoneStage(evt, mode);
      const closedCps = (evt.checkpoints || []).filter(cp => isCpClosedByZone(evt, cp));
      return `
        <div class="game-mode-config-row">
          <label>${t('gameModes.zoneTriggerModeLabel')}</label>
          <select onchange="onZoneTriggerModeChange(this.value)">
            <option value="scheduled" ${mode.config.triggerMode === 'scheduled' ? 'selected' : ''}>${t('gameModes.zoneTriggerScheduled')}</option>
            <option value="manual" ${mode.config.triggerMode === 'manual' ? 'selected' : ''}>${t('gameModes.zoneTriggerManual')}</option>
            <option value="both" ${mode.config.triggerMode === 'both' ? 'selected' : ''}>${t('gameModes.zoneTriggerBoth')}</option>
          </select>
        </div>
        <div class="game-mode-zone-stages">
          ${stages.map((s, i) => `
            <div class="game-mode-zone-stage-row">
              <span>${t('gameModes.stageLabel', {n: i + 1})}</span>
              <input type="number" min="1" value="${s.radius}" onchange="onZoneStageFieldChange(${i}, 'radius', this.value)"> m
              <input type="number" min="0" value="${s.atMinute}" onchange="onZoneStageFieldChange(${i}, 'atMinute', this.value)"> ${t('gameModes.minuteAfterStart')}
              <button type="button" class="btn btn-sm btn-danger" onclick="removeZoneStage(${i})">${t('common.remove')}</button>
            </div>
          `).join('')}
          <button type="button" class="btn btn-sm" onclick="addZoneStage()">${t('gameModes.addStage')}</button>
        </div>
        <div class="game-mode-zone-status">
          <span>${stageInfo ? t('gameModes.currentStage', {n: evt.ruleRuntimeState.zoneStage + 1, radius: stageInfo.radius}) : t('gameModes.noStageYet')}</span>
          ${(mode.config.triggerMode === 'manual' || mode.config.triggerMode === 'both') ? `<button type="button" class="btn btn-sm" onclick="manualAdvanceZoneStage()">${t('gameModes.advanceStageButton')}</button>` : ''}
        </div>
        ${closedCps.length ? `<div class="game-mode-zone-closed">${t('gameModes.closedCheckpoints', {names: closedCps.map(c => escapeHtml(c.name || '—')).join(', ')})}</div>` : ''}
      `;
    }
    default:
      return '';
  }
}
function toggleGameModesSection(){
  state.gameModesSectionOpen = !state.gameModesSectionOpen;
  renderOverview();
}
function renderGameModesSection(evt){
  evt.gameModes = evt.gameModes || [];
  const open = state.gameModesSectionOpen;
  const body = open ? `
    <div class="settings-section-desc">${t('gameModes.hint')}</div>
    ${evt.scoringMode === 'points' ? `<div class="game-mode-scoring-banner">${t('gameModes.scoringPointsBanner')}</div>` : ''}
    <div class="game-mode-list">${GAME_MODE_TYPES.map(type => {
      const mode = getGameMode(evt, type) || withGameModeDefaults({type});
      return `
        <div class="game-mode-row">
          <label class="checkbox-row game-mode-toggle">
            <input type="checkbox" ${mode.enabled ? 'checked' : ''} onchange="toggleGameMode('${type}', this.checked)">
            <span class="game-mode-name">${gameModeLabel(type)}</span>
          </label>
          <div class="game-mode-desc">${gameModeDesc(type)}</div>
          ${mode.enabled ? `<div class="game-mode-config">${renderGameModeConfigForm(evt, mode)}</div>` : ''}
        </div>
      `;
    }).join('')}</div>
  ` : '';
  return `
    <div class="settings-section game-modes-panel" id="overview-gamemodes-section">
      <div class="settings-section-head">
        <h3>${t('gameModes.heading')}</h3>
        <button type="button" class="btn btn-sm" aria-expanded="${open}" onclick="toggleGameModesSection()">${open ? t('gameModes.hideSection') : t('gameModes.showSection')}</button>
      </div>
      ${body}
    </div>
  `;
}
