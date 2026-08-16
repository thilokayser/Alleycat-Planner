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
  debouncedSave();
  renderCheckin();
  playConfirmFeedback();
}
function unconfirmRiderAtFinish(){
  const rider = getActiveCheckinRider(); if(!rider) return;
  const bib = rider.bib;
  const previousFinishTime = rider.finishTime;
  rider.finishTime = '';
  debouncedSave();
  renderCheckin();
  showToast({
    message: t('checkin.unconfirmedToast', {bib}),
    actionLabel: t('checkin.undo'),
    onAction: () => {
      const r = (state.currentEvent.riders || []).find(x => x.bib === bib);
      if(!r) return;
      r.finishTime = previousFinishTime;
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
function onQrScanSuccess(data){
  stopQrScan();
  state.checkinBibInput = String(data).trim();
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
function onCheckinToggleCheckpoint(cpId, checked){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.completed = rider.completed || [];
  if(checked){
    if(!rider.completed.includes(cpId)) rider.completed.push(cpId);
    const cp = findCp(cpId);
    if(cp && cp.timeWindowEnabled){
      rider.checkpointTimes = rider.checkpointTimes || {};
      if(!rider.checkpointTimes[cpId]) rider.checkpointTimes[cpId] = toLocalDateTimeInputValue(new Date());
    }
  } else {
    rider.completed = rider.completed.filter(id => id !== cpId);
  }
  debouncedSave();
  renderCheckin();
}
function onCheckinSetScore(cpId, score){
  const rider = getActiveCheckinRider(); if(!rider) return;
  rider.completed = rider.completed || [];
  rider.scores = rider.scores || {};
  if(rider.scores[cpId] === score){
    delete rider.scores[cpId];
    rider.completed = rider.completed.filter(id => id !== cpId);
  } else {
    rider.scores[cpId] = score;
    if(!rider.completed.includes(cpId)) rider.completed.push(cpId);
    const cp = findCp(cpId);
    if(cp && cp.timeWindowEnabled){
      rider.checkpointTimes = rider.checkpointTimes || {};
      if(!rider.checkpointTimes[cpId]) rider.checkpointTimes[cpId] = toLocalDateTimeInputValue(new Date());
    }
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
function renderCheckin(){
  const el = document.getElementById('view-checkin');
  const evt = state.currentEvent;
  if(!evt){
    el.innerHTML = `<div class="loading-row">${t('checkin.noEventSelected')}</div>`;
    return;
  }
  const rider = getActiveCheckinRider();
  const riders = evt.riders || [];
  let body = '';

  if(!rider){
    body = `
      <div class="checkin-search-hint">${state.checkinNotFound ? t('checkin.riderNotFound', {bib: escapeHtml(state.checkinBibInput)}) : t('checkin.enterBibHint')}</div>
    `;
  } else {
    const completed = rider.completed || [];
    const scores = rider.scores || {};
    const cpTimes = rider.checkpointTimes || {};
    const cpRows = evt.checkpoints.map(cp => {
      const done = completed.includes(cp.id);
      const cpType = getCheckpointType(cp.type);
      const controlsHtml = cpType.isScored
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
      return `
        <div class="checkin-cp-row ${cp.mandatory ? '' : 'optional'}">
          <div class="checkin-cp-head">
            <span class="cp-no">${cp.order}</span>
            <span class="cp-name">${escapeHtml(cp.name || t('checkpoint.noName'))}</span>
            ${cp.mandatory ? '' : `<span class="tag-bonus">${t('exportPdf.bonusBadge')}</span>`}
          </div>
          ${controlsHtml}
          ${timeWindowHtml}
        </div>`;
    }).join('');
    const mandatoryCps = evt.checkpoints.filter(c => c.mandatory);
    const missingMandatory = mandatoryCps.filter(cp => !completed.includes(cp.id));
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
    body = `
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
        ${!rider.finishTime ? `
          <div class="checkin-confirm-row">
            <button class="btn btn-primary checkin-confirm-btn" onclick="confirmRiderAtFinish()">${t('checkin.confirmAtFinish')}</button>
            <div class="checkin-confirm-hint">${t('checkin.notYetConfirmedHint')}</div>
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

  const finishedCount = riders.filter(r => r.finishTime).length;
  const overviewRows = sortRidersForOverview(riders).map(r => `
    <div class="checkin-overview-row ${state.checkinActiveBib === r.bib ? 'active' : ''}" onclick="selectCheckinRiderByBib(${r.bib})">
      <span class="lb-bib">#${r.bib}</span>
      ${r.teamId ? `<span class="team-dot" title="${escapeHtml(getTeam(evt, r.teamId)?.name || '')}" style="background:${escapeHtml(getTeam(evt, r.teamId)?.color || '#7c8388')}"></span>` : ''}
      <span class="lb-name">${escapeHtml(r.name || '—')}</span>
      ${riderStatusBadgeHtml(evt, r)}
    </div>
  `).join('');

  el.innerHTML = `
    <div class="checkin-main">
      <div class="checkin-main-inner">
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
            <div class="qr-scan-frame"></div>
          </div>
          <div class="qr-scan-status">${t('checkin.holdQrToCamera')}</div>
        `}
        <button class="btn btn-ghost" onclick="stopQrScan()">${t('common.cancel')}</button>
      </div>
    ` : ''}
  `;
  updateLiveCountdown();
  if(state.qrScannerActive && qrScanStream){
    const video = document.getElementById('qr-scan-video');
    if(video) video.srcObject = qrScanStream;
  }
}

