/* ---------------- check-in ---------------- */
function getActiveCheckinRider(){
  if(!state.currentEvent || state.checkinActiveBib == null) return null;
  return (state.currentEvent.riders || []).find(r => r.bib === state.checkinActiveBib) || null;
}
function onCheckinBibInput(value){
  state.checkinBibInput = value;
}
function activateCheckinRider(bib){
  const rider = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!rider) return;
  state.checkinNotFound = false;
  state.checkinActiveBib = bib;
  renderCheckin();
}
let audioCtx = null;
function playConfirmFeedback(){
  if(navigator.vibrate){ try{ navigator.vibrate(120); }catch(e){} }
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
  }catch(e){ /* Web Audio nicht verfügbar */ }
}
function confirmRiderAtFinish(){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.finishTime = toLocalDateTimeInputValue(new Date());
  rider.raceStatus = '';
  evaluateRules(state.currentEvent, 'on_finish', {rider});
  pushEventLog(state.currentEvent, 'rider_finished', t('gameModes.tickerFinished', {name: escapeHtml(rider.name || ('#' + rider.bib))}), rider.bib);
  debouncedSave();
  renderCheckin();
  playConfirmFeedback();
}
function assignJokerCheckpoint(cpId){
  const rider = getActiveCheckinRider(); if(!rider) return;
  evaluateRules(state.currentEvent, 'manual', {action: 'assign_joker', rider, checkpointId: cpId || ''});
  debouncedSave();
  renderCheckin();
}
function setRiderRaceStatus(status){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.raceStatus = (rider.raceStatus === status) ? '' : status;
  if(rider.raceStatus) rider.finishTime = '';
  debouncedSave();
  renderCheckin();
}
function unconfirmRiderAtFinish(){
  const rider = getActiveCheckinRider(); if(!rider) return;
  const bib = rider.bib;
  const previousFinishTime = rider.finishTime;
  rider.finishTime = '';
  removeLedgerEntries(state.currentEvent, p => p.riderBib === bib && p.source === 'sequence_match');
  debouncedSave();
  renderCheckin();
  showToast({
    message: t('checkin.unconfirmedToast', {bib}),
    actionLabel: t('checkin.undo'),
    onAction: () => {
      const r = (state.currentEvent.riders || []).find(x => x.bib === bib);
      if(!r) return;
      r.finishTime = previousFinishTime;
      evaluateRules(state.currentEvent, 'on_finish', {rider: r});
      debouncedSave();
      renderCheckin();
    }
  });
}
function findCheckinRider(){
  const bib = parseInt(state.checkinBibInput, 10);
  const rider = (state.currentEvent.riders || []).find(r => r.bib === bib);
  if(!rider){
    state.checkinNotFound = true;
    state.checkinActiveBib = null;
    renderCheckin();
    return;
  }
  activateCheckinRider(bib);
}
function selectCheckinRiderByBib(bib){
  state.checkinBibInput = String(bib);
  activateCheckinRider(bib);
}

/* ---------------- live countdown ---------------- */
function updateLiveCountdown(){
  if(state.view !== 'checkin'){ stopLiveCountdown(); return; }
  const el = document.getElementById('live-countdown');
  if(!el || !state.currentEvent) return;
  const evt = state.currentEvent;
  const now = new Date();
  let text = '', cls = '';

  if(evt.startMode === 'scheduled' && evt.startTime){
    const start = new Date(evt.startTime);
    if(!isNaN(start.getTime()) && now < start){
      text = t('checkin.startIn', {countdown: formatCountdown(start - now)});
      cls = 'start';
    }
  }
  if(!text && evt.curfewTime){
    const curfew = new Date(evt.curfewTime);
    if(!isNaN(curfew.getTime())){
      if(now < curfew){
        text = t('checkin.curfewIn', {countdown: formatCountdown(curfew - now)});
        cls = 'curfew';
      } else if(evt.curfewMode === 'soft'){
        text = t('checkin.overCurfew', {countdown: formatCountdown(now - curfew)});
        cls = 'over';
      } else {
        text = t('checkin.curfewReached');
        cls = 'over';
      }
    }
  }
  el.textContent = text;
  el.className = 'live-countdown' + (cls ? ' ' + cls : '');
}
function startLiveCountdown(){
  stopLiveCountdown();
  updateLiveCountdown();
  liveCountdownInterval = setInterval(updateLiveCountdown, 1000);
}
function stopLiveCountdown(){
  if(liveCountdownInterval){ clearInterval(liveCountdownInterval); liveCountdownInterval = null; }
}

/* ---------------- QR camera scan ---------------- */
async function startQrScan(){
  state.qrScanError = '';
  state.qrScannerActive = true;
  renderCheckin();
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    state.qrScanError = t('checkin.cameraUnsupported');
    renderCheckin();
    return;
  }
  if(typeof jsQR !== 'function'){
    state.qrScanError = t('checkin.qrLibFailed');
    renderCheckin();
    return;
  }
  try{
    qrScanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
  }catch(e){
    state.qrScanError = t('checkin.cameraAccessDenied');
    renderCheckin();
    return;
  }
  const video = document.getElementById('qr-scan-video');
  if(!video){ stopQrScan(); return; }
  video.srcObject = qrScanStream;
  try{ await video.play(); }catch(e){}

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function tick(){
    if(!qrScanStream) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if(code && code.data){
        onQrScanSuccess(code.data);
        return;
      }
    }
    qrScanRAF = requestAnimationFrame(tick);
  }
  qrScanRAF = requestAnimationFrame(tick);
}
function stopQrScan(){
  if(qrScanRAF){ cancelAnimationFrame(qrScanRAF); qrScanRAF = null; }
  if(qrScanStream){
    qrScanStream.getTracks().forEach(t => t.stop());
    qrScanStream = null;
  }
  state.qrScannerActive = false;
  state.qrScanError = '';
  renderCheckin();
}
/* Der Ziel-Check-in muss ZWEI Spokecard-Formate lesen: die nackte
   Startnummer, die bis zur Fahrer-App auf jeder Karte stand, und die
   neue Token-URL. Wäre das nicht so, entwertete das Release jede bereits
   gedruckte Karte — die kritischste Zusage dieses Arbeitspakets.

   Der Token-Fall wird LOKAL aufgelöst, gegen rider.riderToken im
   geladenen Event, ohne Serverruf. Der Zieltisch muss auch dann
   funktionieren, wenn der Orga-Laptop gerade kein Netz hat; alle Token
   liegen ohnehin im Speicher. */
function onQrScanSuccess(data){
  stopQrScan();
  const raw = String(data).trim();
  const parsed = parseRiderQrPayload(raw);

  if(parsed && parsed.kind === 'rider'){
    const evt = state.currentEvent;
    const rider = (evt.riders || []).find(r => r.riderToken && r.riderToken === parsed.riderToken);
    if(rider){
      state.checkinBibInput = String(rider.bib);
      findCheckinRider();
      return;
    }
    /* Gültiges Format, aber kein Fahrer dazu: die Karte gehört zu einem
       anderen Event. Das ist eine andere Lage als "unlesbar" und
       verdient eine eigene Meldung. */
    state.checkinBibInput = '';
    state.checkinNotFound = true;
    showToast({message: t('checkin.qrForeignEvent')});
    renderCheckin();
    return;
  }

  if(parsed && parsed.kind === 'checkpoint'){
    state.checkinBibInput = '';
    showToast({message: t('checkin.qrIsCheckpoint')});
    renderCheckin();
    return;
  }

  /* legacyBib und alles Unbekannte gehen den bisherigen Weg: rohe
     Eingabe ins Feld, findCheckinRider() entscheidet. Damit bleibt auch
     ein handgeschriebener Zettel oder ein Fremdcode so behandelt wie
     bisher. */
  state.checkinBibInput = parsed && parsed.kind === 'legacyBib' ? String(parsed.bib) : raw;
  findCheckinRider();
}
function clearCheckin(){
  state.checkinActiveBib = null;
  state.checkinBibInput = '';
  state.checkinNotFound = false;
  renderCheckin();
}
function finishCheckin(){
  flushPendingSave();
  clearCheckin();
  const input = document.getElementById('checkin-bib-input');
  if(input) input.focus();
}
function onCheckinNameChange(value){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.name = value;
  debouncedSave();
}
function onCheckinEmergencyChange(value){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.emergencyContact = value;
  debouncedSave();
}
function onCheckinFinishTimeChange(value){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.finishTime = value;
  debouncedSave();
  renderCheckin();
}
function checkOrderBeforeComplete(cpId){
  const evt = state.currentEvent;
  const rider = getActiveCheckinRider();
  if(!evt || !rider || evt.checkpointOrderMode !== 'fest') return true;
  const cp = findCp(cpId);
  if(!cp) return true;
  const completed = rider.completed || [];
  const earlierIncomplete = evt.checkpoints.filter(c => c.order < cp.order && !completed.includes(c.id));
  if(!earlierIncomplete.length) return true;
  const names = earlierIncomplete.map(c => c.name || (t('leaderboard.cpPrefix') + String(c.order).padStart(2, '0'))).join(', ');
  if(!confirm(t('checkpointOrder.outOfOrderConfirm', {names}))) return false;
  rider.checkpointOrderOverrides = rider.checkpointOrderOverrides || [];
  rider.checkpointOrderOverrides.push({checkpointId: cpId, at: toLocalDateTimeInputValue(new Date())});
  return true;
}
/* Paket 6: Paket-Zustellung ohne bestätigte Abholung — gleiches
   Confirm-und-Override-Muster wie checkOrderBeforeComplete() (aus fest 3d),
   bewusst kein hartes Blockieren, da ein Marshal am Zustell-Checkpoint die
   Abholung z. B. wegen eines Geräteproblems am Abholung-Checkpoint auch
   nachträglich bestätigen könnte. */
function checkPickupBeforeDropoff(cpId){
  const evt = state.currentEvent;
  const rider = getActiveCheckinRider();
  if(!evt || !rider) return true;
  const cp = findCp(cpId);
  if(!cp || cp.type !== 'dropoff') return true;
  const pickup = pickupForDropoff(evt, cpId);
  if(!pickup) return true;
  if((rider.completed || []).includes(pickup.id)) return true;
  if(!confirm(t('checkin.dropoffWithoutPickupConfirm', {name: pickup.name || t('checkpoint.noName')}))) return false;
  rider.checkpointOrderOverrides = rider.checkpointOrderOverrides || [];
  rider.checkpointOrderOverrides.push({checkpointId: cpId, at: toLocalDateTimeInputValue(new Date())});
  return true;
}
function onCheckinToggleCheckpoint(cpId, checked){
  const rider = getActiveCheckinRider(); if(!rider) return;
  const evt = state.currentEvent;
  rider.completed = rider.completed || [];
  if(checked){
    if(!rider.completed.includes(cpId)){
      if(!checkOrderBeforeComplete(cpId)){ renderCheckin(); return; }
      if(!checkPickupBeforeDropoff(cpId)){ renderCheckin(); return; }
      const cp = findCp(cpId);
      const timestamp = toLocalDateTimeInputValue(new Date());
      const ruleResult = evaluateRules(evt, 'on_checkin', {rider, checkpoint: cp, timestamp});
      if(ruleResult.blocked){ alert(ruleResult.message); renderCheckin(); return; }
      rider.completed.push(cpId);
      rider.checkpointTimes = rider.checkpointTimes || {};
      if(!rider.checkpointTimes[cpId]) rider.checkpointTimes[cpId] = timestamp;
    }
  } else {
    rider.completed = rider.completed.filter(id => id !== cpId);
    removeLedgerEntries(evt, p => p.riderBib === rider.bib && p.checkpointId === cpId && p.source === 'first_n');
  }
  debouncedSave();
  renderCheckin();
}
function onCheckinSetScore(cpId, score){
  const rider = getActiveCheckinRider(); if(!rider) return;
  const evt = state.currentEvent;
  rider.completed = rider.completed || [];
  rider.scores = rider.scores || {};
  if(rider.scores[cpId] === score){
    delete rider.scores[cpId];
    rider.completed = rider.completed.filter(id => id !== cpId);
    removeLedgerEntries(evt, p => p.riderBib === rider.bib && p.checkpointId === cpId && p.source === 'first_n');
  } else {
    if(!checkOrderBeforeComplete(cpId)){ renderCheckin(); return; }
    const cp = findCp(cpId);
    const timestamp = toLocalDateTimeInputValue(new Date());
    const ruleResult = evaluateRules(evt, 'on_checkin', {rider, checkpoint: cp, timestamp});
    if(ruleResult.blocked){ alert(ruleResult.message); renderCheckin(); return; }
    rider.scores[cpId] = score;
    if(!rider.completed.includes(cpId)) rider.completed.push(cpId);
    rider.checkpointTimes = rider.checkpointTimes || {};
    if(!rider.checkpointTimes[cpId]) rider.checkpointTimes[cpId] = timestamp;
  }
  debouncedSave();
  renderCheckin();
}
function onCheckinCheckpointTimeChange(cpId, value){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.checkpointTimes = rider.checkpointTimes || {};
  rider.checkpointTimes[cpId] = value;
  debouncedSave();
  renderCheckin();
}
function computeCurfewResult(evt, finishTimeValue){
  if(!evt.curfewTime || !finishTimeValue) return null;
  const finish = new Date(finishTimeValue);
  const curfew = new Date(evt.curfewTime);
  if(isNaN(finish.getTime()) || isNaN(curfew.getTime())) return null;
  const diffMin = Math.round((finish - curfew) / 60000);
  if(diffMin <= 0) return {onTime: true, diffMin: 0, penalty: 0};
  if(evt.curfewMode === 'soft') return {onTime: false, diffMin, penalty: Math.round(diffMin * (evt.curfewPenaltyPerMin ?? 1))};
  return {onTime: false, diffMin, penalty: null};
}
function riderStatusBadgeHtml(evt, rider){
  if(rider.raceStatus === 'eliminated') return `<span class="lb-status danger">${t('gameModes.eliminatedStatus')}</span>`;
  if(rider.raceStatus === 'dnf') return `<span class="lb-status danger">${t('checkin.statusDnf')}</span>`;
  if(rider.raceStatus === 'dns') return `<span class="lb-status missing">${t('checkin.statusDns')}</span>`;
  if(!rider.finishTime) return `<span class="lb-status missing">${t('checkin.statusMissing')}</span>`;
  const curfew = computeCurfewResult(evt, rider.finishTime);
  if(!curfew || curfew.onTime) return `<span class="lb-status arrived">${t('checkin.statusArrived')}</span>`;
  if(evt.curfewMode === 'soft') return `<span class="lb-status warn">${t('checkin.statusPenalty', {penalty: curfew.penalty})}</span>`;
  return `<span class="lb-status danger">${t('checkin.statusCutoff')}</span>`;
}

function computeTimeWindowResult(cp, timeValue){
  if(!cp.timeWindowEnabled || !timeValue) return null;
  const t = new Date(timeValue);
  if(isNaN(t.getTime())) return null;
  const start = cp.timeWindowStart ? new Date(cp.timeWindowStart) : null;
  const end = cp.timeWindowEnd ? new Date(cp.timeWindowEnd) : null;
  if(start && !isNaN(start.getTime()) && t < start) return {ok: false, reason: 'early'};
  if(end && !isNaN(end.getTime()) && t > end) return {ok: false, reason: 'late'};
  return {ok: true};
}


/* ---------------- render: check-in ---------------- */
function buildCheckinResultCardHtml(evt, rider){
    const completed = rider.completed || [];
    const scores = rider.scores || {};
    const cpTimes = rider.checkpointTimes || {};
    const visibleCps = evt.checkpoints.filter(cp => isCpRevealed(evt, cp));
    const jokerCpId = rider.gameFlags && rider.gameFlags.jokerCpId;
    const cpRows = visibleCps.map(cp => {
      const done = completed.includes(cp.id);
      const isJoker = !done && jokerCpId === cp.id;
      const closedByZone = isGameModeEnabled(evt, 'zone_active') && isCpClosedByZone(evt, cp);
      const cpType = getCheckpointType(cp.type);
      const controlsHtml = isJoker
        ? `<div class="checkin-joker-satisfied">${t('gameModes.jokerSatisfiesCp')}</div>`
        : cpType.isScored
        ? `<div class="checkin-score-row">${Array.from({length: cpType.scoreMax + 1}, (_, s) => s).map(s => `<button type="button" class="score-btn ${scores[cp.id] === s ? 'active' : ''}" onclick="onCheckinSetScore('${cp.id}', ${s})">${s}</button>`).join('')}</div>`
        : `<label class="checkin-cp-check">
             <input type="checkbox" ${done ? 'checked' : ''} onchange="onCheckinToggleCheckpoint('${cp.id}', this.checked)">
             ${t('checkin.done')}
           </label>`;
      let timeWindowHtml = '';
      if(cp.timeWindowEnabled && done){
        const twResult = computeTimeWindowResult(cp, cpTimes[cp.id]);
        const badge = twResult
          ? (twResult.ok ? `<span class="tw-badge ok">${t('checkin.inTimeWindowBadge')}</span>` : `<span class="tw-badge warn">${twResult.reason === 'early' ? t('checkin.tooEarly') : t('checkin.tooLate')}</span>`)
          : '';
        timeWindowHtml = `
          <div class="checkin-timewindow">
            <label>${t('checkin.arrivalWindowLabel', {start: formatTimeOnly(cp.timeWindowStart), end: formatTimeOnly(cp.timeWindowEnd)})}</label>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <input type="datetime-local" value="${escapeHtml(cpTimes[cp.id] || '')}" onchange="onCheckinCheckpointTimeChange('${cp.id}', this.value)">
              ${badge}
            </div>
          </div>`;
      }
      let packageHtml = '';
      if(cp.type === 'dropoff'){
        const pickup = pickupForDropoff(evt, cp.id);
        if(pickup){
          const pickupDone = completed.includes(pickup.id);
          packageHtml = `<div class="checkin-timewindow"><span class="tw-badge ${pickupDone ? 'ok' : 'warn'}">${pickupDone ? t('checkin.pickupDoneBadge') : t('checkin.pickupPendingBadge')}</span></div>`;
        }
      } else if(cp.type === 'pickup' && cp.pairedDropoffCpId){
        const dropoff = findCp(cp.pairedDropoffCpId);
        if(dropoff) packageHtml = `<div class="checkin-timewindow">${t('checkin.pickupHint', {name: dropoff.name || t('checkpoint.noName')})}</div>`;
      }
      return `
        <div class="checkin-cp-row ${cp.mandatory ? '' : 'optional'}">
          <div class="checkin-cp-head">
            <span class="cp-no">${cp.order}</span>
            <span class="cp-name">${escapeHtml(cp.name || t('checkpoint.noName'))}</span>
            ${cp.mandatory ? '' : `<span class="tag-bonus">${t('exportPdf.bonusBadge')}</span>`}
            ${closedByZone ? `<span class="tag-bonus danger">${t('gameModes.zoneClosedBadge')}</span>` : ''}
          </div>
          ${controlsHtml}
          ${timeWindowHtml}
          ${packageHtml}
        </div>`;
    }).join('');
    const mandatoryCps = visibleCps.filter(c => c.mandatory);
    const missingMandatory = mandatoryCps.filter(cp => !isCpSatisfiedForRider(rider, cp));
    const curfew = computeCurfewResult(evt, rider.finishTime);
    let curfewBlock = '';
    if(curfew){
      if(curfew.onTime){
        curfewBlock = `<div class="checkin-status ok">${t('checkin.onTimeStatus')}</div>`;
      } else if(evt.curfewMode === 'soft'){
        curfewBlock = `<div class="checkin-status warn">${t('checkin.softCurfewStatus', {diffMin: curfew.diffMin, penalty: curfew.penalty})}</div>`;
      } else {
        curfewBlock = `<div class="checkin-status danger">${t('checkin.hardCurfewStatus', {diffMin: curfew.diffMin})}</div>`;
      }
    }
    let mandatoryBlock = '';
    if(mandatoryCps.length){
      mandatoryBlock = missingMandatory.length
        ? `<div class="checkin-status warn">${t(missingMandatory.length === 1 ? 'checkin.missingMandatorySingular' : 'checkin.missingMandatoryPlural', {count: missingMandatory.length})}</div>`
        : `<div class="checkin-status ok">${t('checkin.allMandatoryDone')}</div>`;
    }
    return `
      <div class="checkin-card">
        <div class="checkin-card-head">
          <div class="checkin-bib">#${rider.bib}</div>
          <div class="checkin-name-col">
            <input type="text" class="checkin-name-input" placeholder="${t('rider.namePlaceholder')}" value="${escapeHtml(rider.name || '')}" oninput="onCheckinNameChange(this.value)">
            ${teamBadgeHtml(evt, rider.teamId)}
            <input type="text" class="checkin-emergency-input" placeholder="${t('rider.emergencyPlaceholder')}" value="${escapeHtml(rider.emergencyContact || '')}" oninput="onCheckinEmergencyChange(this.value)">
          </div>
          <button class="btn btn-primary btn-sm" onclick="finishCheckin()" title="${t('checkin.saveAndCloseTitle')}">${t('checkin.saveAndClose')}</button>
        </div>
        ${isGameModeEnabled(evt, 'rider_flag') ? `
          <div class="checkin-joker-row">
            <label>${t('gameModes.assignJokerLabel')}</label>
            <select onchange="assignJokerCheckpoint(this.value)">
              <option value="">${t('gameModes.jokerNone')}</option>
              ${evt.checkpoints.map(cp => `<option value="${cp.id}" ${jokerCpId === cp.id ? 'selected' : ''}>${escapeHtml(cp.name || t('checkpoint.noName'))}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        ${rider.raceStatus === 'eliminated' ? `
          <div class="checkin-status danger">
            <span>${t('gameModes.eliminatedStatus')}</span>
            <button class="btn btn-ghost btn-sm" onclick="setRiderRaceStatus('eliminated')">${t('common.cancel')}</button>
          </div>
        ` : rider.raceStatus === 'dnf' || rider.raceStatus === 'dns' ? `
          <div class="checkin-status danger">
            <span>${rider.raceStatus === 'dnf' ? t('checkin.dnfSet') : t('checkin.dnsSet')}</span>
            <button class="btn btn-ghost btn-sm" onclick="setRiderRaceStatus('${rider.raceStatus}')">${t('common.cancel')}</button>
          </div>
        ` : !rider.finishTime ? `
          <div class="checkin-confirm-row">
            <button class="btn btn-primary checkin-confirm-btn" onclick="confirmRiderAtFinish()">${t('checkin.confirmAtFinish')}</button>
            <div class="checkin-confirm-hint">${t('checkin.notYetConfirmedHint')}</div>
            <div class="checkin-dnf-dns-row">
              <button class="btn btn-ghost btn-sm" onclick="setRiderRaceStatus('dnf')">${t('checkin.markDnf')}</button>
              <button class="btn btn-ghost btn-sm" onclick="setRiderRaceStatus('dns')">${t('checkin.markDns')}</button>
            </div>
          </div>
        ` : `
          <div class="checkin-timing">
            <div>
              <label>${t('checkin.finishTimeLabel')}</label>
              <input type="datetime-local" value="${escapeHtml(rider.finishTime || '')}" onchange="onCheckinFinishTimeChange(this.value)">
            </div>
            ${curfewBlock}
            <button class="btn btn-ghost btn-sm" onclick="unconfirmRiderAtFinish()" title="${t('checkin.resetTitle')}">${t('checkin.reset')}</button>
          </div>
        `}
        ${evt.checkpoints.length === 0 ? `<div class="cp-list-empty">${t('checkin.noCheckpointsInEvent')}</div>` : `<div class="checkin-cp-list">${cpRows}</div>`}
        ${mandatoryBlock}
      </div>
    `;
}
function buildCheckinViewHtml(evt){
  const rider = getActiveCheckinRider();
  const riders = evt.riders || [];
  const body = rider ? buildCheckinResultCardHtml(evt, rider) : `
    <div class="checkin-search-hint">${state.checkinNotFound ? t('checkin.riderNotFound', {bib: escapeHtml(state.checkinBibInput)}) : t('checkin.enterBibHint')}</div>
  `;

  const finishedCount = riders.filter(r => r.finishTime).length;
  const overviewRows = sortRidersForOverview(riders).map(r => `
    <div class="checkin-overview-row ${state.checkinActiveBib === r.bib ? 'active' : ''}" onclick="selectCheckinRiderByBib(${r.bib})">
      <span class="lb-bib">#${r.bib}</span>
      ${r.teamId ? `<span class="team-dot" title="${escapeHtml(getTeam(evt, r.teamId)?.name || '')}" style="background:${escapeHtml(getTeam(evt, r.teamId)?.color || '#7c8388')}"></span>` : ''}
      <span class="lb-name">${escapeHtml(r.name || '—')}</span>
      ${riderStatusBadgeHtml(evt, r)}
    </div>
  `).join('');

  return `
    <div class="checkin-main">
      <div class="checkin-main-inner">
        ${state.racedayActive ? '' : `
          <div class="checkin-page-head">
            <button type="button" class="btn btn-ghost btn-sm" onclick="enterRacedayMode()">${t('raceday.enterButton')}</button>
          </div>
        `}
        <div id="live-countdown" class="live-countdown"></div>
        <div class="checkin-search">
          <label>${t('checkin.bibNumberLabel')}</label>
          <div class="checkin-search-row">
            <input type="text" id="checkin-bib-input" inputmode="numeric" placeholder="${t('checkin.bibPlaceholder')}" value="${escapeHtml(state.checkinBibInput)}" oninput="onCheckinBibInput(this.value)" onkeydown="if(event.key==='Enter') findCheckinRider()">
            <button class="btn btn-primary" onclick="findCheckinRider()">${t('checkin.search')}</button>
            <button class="btn" onclick="startQrScan()" title="${t('checkin.scanQrTitle')}">${t('checkin.scan')}</button>
          </div>
        </div>
        ${body}
      </div>
    </div>
    <div class="checkin-side">
      <div class="checkin-side-head">
        <span>${t('checkin.allRiders')}</span>
        <span class="checkin-side-count">${finishedCount} / ${riders.length}</span>
      </div>
      ${riders.length ? `<div class="checkin-overview-list">${overviewRows}</div>` : `<div class="checkin-side-empty">${t('checkin.noRiderListYet')}</div>`}
    </div>
    ${state.qrScannerActive ? `
      <div class="qr-scan-overlay">
        ${state.qrScanError ? `
          <div class="qr-scan-status error">${escapeHtml(state.qrScanError)}</div>
          <button class="btn btn-primary" onclick="startQrScan()">${t('checkin.retry')}</button>
        ` : `
          <div class="qr-scan-video-wrap">
            <video id="qr-scan-video" autoplay playsinline muted></video>
            <div class="qr-scan-frame">
              <span class="qr-scan-corner tl"></span>
              <span class="qr-scan-corner tr"></span>
              <span class="qr-scan-corner bl"></span>
              <span class="qr-scan-corner br"></span>
              <span class="qr-scan-line"></span>
            </div>
          </div>
          <div class="qr-scan-status">${t('checkin.holdQrToCamera')}</div>
        `}
        <button class="btn btn-ghost" onclick="stopQrScan()">${t('common.cancel')}</button>
      </div>
    ` : ''}
  `;
}
function afterCheckinRender(){
  updateLiveCountdown();
  if(state.qrScannerActive && qrScanStream){
    const video = document.getElementById('qr-scan-video');
    if(video) video.srcObject = qrScanStream;
  }
}
function renderCheckin(){
  const el = document.getElementById('view-checkin');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('checkin.noEventSelected')}</div>`;
    return;
  }
  el.innerHTML = buildCheckinViewHtml(evt);
  afterCheckinRender();
  if(state.racedayActive) refreshRacedayStats();
}

