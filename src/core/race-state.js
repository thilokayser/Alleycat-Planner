/* ---------------- race state machine ----------------
   in_planung -> bereit -> läuft -> abgeschlossen (rückwärts jederzeit mit Bestätigung).
   Nur die im Übergabe-Dokument explizit hervorgehobene Sperre wird durchgesetzt:
   CP-Struktur wird ab "läuft" read-only (siehe checkpoint.js renderSidebar). Volle
   Read-only-Durchsetzung in allen anderen Views ist bewusst nicht Teil dieser Phase. */
const RACE_STATUS_ORDER = ['planning', 'ready', 'running', 'completed'];
function raceStatusLabel(status){
  return t('raceState.' + status) || status;
}
function raceStatusIndex(status){
  return RACE_STATUS_ORDER.indexOf(status);
}
function isCpLocked(evt){
  if(!evt) return false;
  if(evt.status === 'running') return !evt.cpLockOverride;
  if(evt.status === 'completed') return true;
  return false;
}
function canAdvanceToReady(evt){
  const blocking = [];
  const warnings = [];
  if(!evt.checkpoints || !evt.checkpoints.length) blocking.push(t('raceState.missingCheckpoint'));
  if(!evt.expectedRiders) blocking.push(t('raceState.missingCapacity'));
  if(!evt.spokecardsPrinted) warnings.push(t('raceState.spokecardsNotPrinted'));
  if(!evt.manifestGenerated) warnings.push(t('raceState.manifestNotGenerated'));
  return {blocking, warnings};
}
function markReady(evt){
  const {blocking, warnings} = canAdvanceToReady(evt);
  if(blocking.length){
    alert(t('raceState.blockedTitle') + '\n\n' + blocking.map(b => '• ' + b).join('\n'));
    render();
    return false;
  }
  if(warnings.length && !confirm(warnings.map(w => '• ' + w).join('\n') + '\n\n' + t('raceState.warningsConfirm'))){
    render();
    return false;
  }
  evt.status = 'ready';
  evt.statusChangedAt = toLocalDateTimeInputValue(new Date());
  /* Sofort statt über den 3-Sekunden-Debounce: rider.php nimmt Check-ins
     nur im Status 'running' an, ein verzögerter Publish sperrte die
     ersten Fahrer nach dem Startschuss ohne erkennbaren Grund aus. */
  publishRiderConfigNow();
  debouncedSave();
  render();
  return true;
}
function startRace(evt){
  if(!evt) return;
  evt.status = 'running';
  evt.statusChangedAt = toLocalDateTimeInputValue(new Date());
  /* Sofort statt über den 3-Sekunden-Debounce: rider.php nimmt Check-ins
     nur im Status 'running' an, ein verzögerter Publish sperrte die
     ersten Fahrer nach dem Startschuss ohne erkennbaren Grund aus. */
  publishRiderConfigNow();
  evt.startConfirmedAt = toLocalDateTimeInputValue(new Date());
  evt.cpLockOverride = false;
  state.addMode = false;
  closeStartDialog();
  broadcastRaceStart(evt.id);
  debouncedSave();
  render();
}
function postponeStart(evt){
  if(!evt) return;
  const base = evt.startTime ? new Date(evt.startTime) : new Date();
  const newTime = new Date((isNaN(base.getTime()) ? new Date() : base).getTime() + 5 * 60000);
  evt.startTime = toLocalDateTimeInputValue(newTime);
  debouncedSave();
  checkStartDialog();
}
function completeRace(evt){
  const unfinished = (evt.riders || []).filter(r => !r.finishTime && r.raceStatus !== 'dnf' && r.raceStatus !== 'dns' && r.raceStatus !== 'eliminated').length;
  const msg = unfinished > 0 ? t('raceState.completeConfirm', {count: unfinished}) : t('raceState.completeConfirmZero');
  if(!confirm(msg)){
    render();
    return false;
  }
  evt.status = 'completed';
  evt.statusChangedAt = toLocalDateTimeInputValue(new Date());
  /* Sofort statt über den 3-Sekunden-Debounce: rider.php nimmt Check-ins
     nur im Status 'running' an, ein verzögerter Publish sperrte die
     ersten Fahrer nach dem Startschuss ohne erkennbaren Grund aus. */
  publishRiderConfigNow();
  debouncedSave();
  render();
  return true;
}
function onStatusSelectChange(value){
  const evt = state.currentEvent;
  if(!evt || value === evt.status) return;
  const fromIdx = raceStatusIndex(evt.status);
  const toIdx = raceStatusIndex(value);
  if(toIdx > fromIdx){
    if(value === 'ready'){ markReady(evt); return; }
    if(value === 'running'){ startRace(evt); return; }
    if(value === 'completed'){ completeRace(evt); return; }
  } else {
    if(!confirm(t('raceState.backwardConfirm', {status: raceStatusLabel(value)}))){
      render();
      return;
    }
    evt.status = value;
    evt.statusChangedAt = toLocalDateTimeInputValue(new Date());
  /* Sofort statt über den 3-Sekunden-Debounce: rider.php nimmt Check-ins
     nur im Status 'running' an, ein verzögerter Publish sperrte die
     ersten Fahrer nach dem Startschuss ohne erkennbaren Grund aus. */
  publishRiderConfigNow();
    debouncedSave();
    render();
  }
}
function toggleCpLockOverride(){
  const evt = state.currentEvent;
  if(!evt) return;
  if(!evt.cpLockOverride){
    if(!confirm(t('raceState.unlockConfirm'))) return;
    evt.cpLockOverride = true;
  } else {
    evt.cpLockOverride = false;
  }
  debouncedSave();
  renderSidebar();
}
function renderStatusControl(evt){
  return `
    <span class="status-control">
      <span class="status-badge status-${evt.status}">${raceStatusLabel(evt.status)}</span>
      <select class="status-select" onchange="onStatusSelectChange(this.value)">
        ${RACE_STATUS_ORDER.map(s => `<option value="${s}" ${evt.status === s ? 'selected' : ''}>${raceStatusLabel(s)}</option>`).join('')}
      </select>
    </span>
  `;
}

/* ---------------- start-time dialog (global, independent of active view) ---------------- */
function checkStartDialog(){
  const evt = state.currentEvent;
  if(!evt || evt.status !== 'ready' || evt.startMode !== 'scheduled' || !evt.startTime){
    closeStartDialog();
    return;
  }
  const start = new Date(evt.startTime);
  if(isNaN(start.getTime()) || new Date() < start){
    closeStartDialog();
    return;
  }
  renderStartDialog();
}
function renderStartDialog(){
  const root = document.getElementById('start-dialog-root');
  if(!root) return;
  root.innerHTML = `
    <div class="start-dialog-overlay">
      <div class="start-dialog">
        <div class="start-dialog-title">${t('raceState.startTimeReachedTitle')}</div>
        <button class="btn btn-primary" onclick="startRace(state.currentEvent)">${t('raceState.startNow')}</button>
        <button class="btn btn-ghost" onclick="postponeStart(state.currentEvent)">${t('raceState.postpone5')}</button>
      </div>
    </div>
  `;
}
function closeStartDialog(){
  const root = document.getElementById('start-dialog-root');
  if(root) root.innerHTML = '';
}
