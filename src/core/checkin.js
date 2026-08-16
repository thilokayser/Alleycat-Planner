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
    message: `Fahrer #${bib} ist wieder „nicht im Ziel".`,
    actionLabel: 'Rückgängig',
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
      text = 'Start in ' + formatCountdown(start - now);
      cls = 'start';
    }
  }
  if(!text && evt.curfewTime){
    const curfew = new Date(evt.curfewTime);
    if(!isNaN(curfew.getTime())){
      if(now < curfew){
        text = 'Curfew in ' + formatCountdown(curfew - now);
        cls = 'curfew';
      } else if(evt.curfewMode === 'soft'){
        text = formatCountdown(now - curfew) + ' über Curfew';
        cls = 'over';
      } else {
        text = 'Curfew erreicht — Rennen beendet';
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
    state.qrScanError = 'Kamera-Zugriff wird von diesem Browser oder dieser Umgebung nicht unterstützt.';
    renderCheckin();
    return;
  }
  if(typeof jsQR !== 'function'){
    state.qrScanError = 'QR-Scan-Bibliothek konnte nicht geladen werden.';
    renderCheckin();
    return;
  }
  try{
    qrScanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
  }catch(e){
    state.qrScanError = 'Kein Zugriff auf die Kamera. Bitte Berechtigung erlauben und erneut versuchen, oder Bib-Nummer manuell eingeben.';
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
  if(!rider.finishTime) return `<span class="lb-status missing">Fehlt</span>`;
  const curfew = computeCurfewResult(evt, rider.finishTime);
  if(!curfew || curfew.onTime) return `<span class="lb-status arrived">Im Ziel</span>`;
  if(evt.curfewMode === 'soft') return `<span class="lb-status warn">+${curfew.penalty} Strafmin.</span>`;
  return `<span class="lb-status danger">Cutoff</span>`;
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
    el.innerHTML = `<div class="loading-row">Kein Event ausgew\u00e4hlt.</div>`;
    return;
  }
  const rider = getActiveCheckinRider();
  const riders = evt.riders || [];
  let body = '';

  if(!rider){
    body = `
      <div class="checkin-search-hint">${state.checkinNotFound ? `Kein Fahrer mit Bib \u201e${escapeHtml(state.checkinBibInput)}\u201c gefunden.` : 'Bib-Nummer eingeben und auf \u201eSuchen\u201c klicken, um den Fahrer zu laden.'}</div>
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
             Erledigt
           </label>`;
      let timeWindowHtml = '';
      if(cp.timeWindowEnabled && done){
        const twResult = computeTimeWindowResult(cp, cpTimes[cp.id]);
        const badge = twResult
          ? (twResult.ok ? `<span class="tw-badge ok">Im Zeitfenster</span>` : `<span class="tw-badge warn">${twResult.reason === 'early' ? 'Zu früh' : 'Zu spät'}</span>`)
          : '';
        timeWindowHtml = `
          <div class="checkin-timewindow">
            <label>Ankunft hier (Fenster ${formatTimeOnly(cp.timeWindowStart)}–${formatTimeOnly(cp.timeWindowEnd)})</label>
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
            <span class="cp-name">${escapeHtml(cp.name || '(ohne Namen)')}</span>
            ${cp.mandatory ? '' : '<span class="tag-bonus">BONUS</span>'}
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
        curfewBlock = `<div class="checkin-status ok">Im Zeitfenster \u2014 vor Curfew im Ziel.</div>`;
      } else if(evt.curfewMode === 'soft'){
        curfewBlock = `<div class="checkin-status warn">${curfew.diffMin} Min. nach Curfew \u2014 +${curfew.penalty} Strafminuten.</div>`;
      } else {
        curfewBlock = `<div class="checkin-status danger">${curfew.diffMin} Min. nach Hard Cutoff \u2014 au\u00dferhalb der Wertung.</div>`;
      }
    }
    let mandatoryBlock = '';
    if(mandatoryCps.length){
      mandatoryBlock = missingMandatory.length
        ? `<div class="checkin-status warn">${missingMandatory.length} Pflicht-Checkpoint${missingMandatory.length === 1 ? '' : 's'} noch offen.</div>`
        : `<div class="checkin-status ok">Alle Pflicht-Checkpoints erledigt.</div>`;
    }
    body = `
      <div class="checkin-card">
        <div class="checkin-card-head">
          <div class="checkin-bib">#${rider.bib}</div>
          <div class="checkin-name-col">
            <input type="text" class="checkin-name-input" placeholder="Name (optional)" value="${escapeHtml(rider.name || '')}" oninput="onCheckinNameChange(this.value)">
            ${teamBadgeHtml(evt, rider.teamId)}
            <input type="text" class="checkin-emergency-input" placeholder="Notfallkontakt (Name &amp; Telefon)" value="${escapeHtml(rider.emergencyContact || '')}" oninput="onCheckinEmergencyChange(this.value)">
          </div>
          <button class="btn btn-primary btn-sm" onclick="finishCheckin()" title="Speichert sofort und wechselt zur Suche zurück">Speichern &amp; schließen</button>
        </div>
        ${!rider.finishTime ? `
          <div class="checkin-confirm-row">
            <button class="btn btn-primary checkin-confirm-btn" onclick="confirmRiderAtFinish()">Fahrer ist im Ziel — bestätigen</button>
            <div class="checkin-confirm-hint">Noch nicht bestätigt — Zielzeit wird erst beim Klick erfasst.</div>
          </div>
        ` : `
          <div class="checkin-timing">
            <div>
              <label>Zielzeit</label>
              <input type="datetime-local" value="${escapeHtml(rider.finishTime || '')}" onchange="onCheckinFinishTimeChange(this.value)">
            </div>
            ${curfewBlock}
            <button class="btn btn-ghost btn-sm" onclick="unconfirmRiderAtFinish()" title="Falls versehentlich bestätigt">Zurücksetzen</button>
          </div>
        `}
        ${evt.checkpoints.length === 0 ? `<div class="cp-list-empty">Keine Checkpoints im Event.</div>` : `<div class="checkin-cp-list">${cpRows}</div>`}
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
          <label>Bib-Nummer</label>
          <div class="checkin-search-row">
            <input type="text" id="checkin-bib-input" inputmode="numeric" placeholder="z.B. 7" value="${escapeHtml(state.checkinBibInput)}" oninput="onCheckinBibInput(this.value)" onkeydown="if(event.key==='Enter') findCheckinRider()">
            <button class="btn btn-primary" onclick="findCheckinRider()">Suchen</button>
            <button class="btn" onclick="startQrScan()" title="QR-Code der Spokecard scannen">Scannen</button>
          </div>
        </div>
        ${body}
      </div>
    </div>
    <div class="checkin-side">
      <div class="checkin-side-head">
        <span>Alle Fahrer</span>
        <span class="checkin-side-count">${finishedCount} / ${riders.length}</span>
      </div>
      ${riders.length ? `<div class="checkin-overview-list">${overviewRows}</div>` : `<div class="checkin-side-empty">Noch keine Fahrerliste — unter „Fahrer" anlegen.</div>`}
    </div>
    ${state.qrScannerActive ? `
      <div class="qr-scan-overlay">
        ${state.qrScanError ? `
          <div class="qr-scan-status error">${escapeHtml(state.qrScanError)}</div>
          <button class="btn btn-primary" onclick="startQrScan()">Erneut versuchen</button>
        ` : `
          <div class="qr-scan-video-wrap">
            <video id="qr-scan-video" autoplay playsinline muted></video>
            <div class="qr-scan-frame"></div>
          </div>
          <div class="qr-scan-status">QR-Code der Spokecard vor die Kamera halten…</div>
        `}
        <button class="btn btn-ghost" onclick="stopQrScan()">Abbrechen</button>
      </div>
    ` : ''}
  `;
  updateLiveCountdown();
  if(state.qrScannerActive && qrScanStream){
    const video = document.getElementById('qr-scan-video');
    if(video) video.srcObject = qrScanStream;
  }
}

