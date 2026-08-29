/* ---------------- Checkpoint-App: Ansichten ----------------
   Eine renderCp()-Weiche über cpState.view, gleiches Muster wie
   renderRider() in der Fahrer-App. Alles vom Server läuft durch
   escapeHtml(): Event- und Checkpoint-Namen sind Eingaben des
   Organizers, keine Oberfläche. */

function renderCp(){
  const el = document.getElementById('checkpoint-app');
  switch(cpState.view){
    case 'login':   el.innerHTML = cpViewLogin(); break;
    case 'home':    el.innerHTML = cpViewHome(); break;
    case 'scanner': el.innerHTML = cpViewScanner(); break;
    case 'confirm': el.innerHTML = cpViewConfirm(); break;
    case 'error':   el.innerHTML = cpViewError(); break;
    default:        el.innerHTML = cpViewLoading();
  }
}

function cpViewLoading(){
  return `<div class="rider-body"><div class="rider-lead">${t('checkpointScan.loading')}</div></div>`;
}

function cpHead(){
  const evt = cpState.event;
  const activeCp = cpState.checkpoints.find(c => c.cpId === cpState.activeCpId);
  return `
    <div class="rider-head">
      <div class="rider-head-bib" style="font-size:20px;">${activeCp ? escapeHtml(activeCp.label) : '📍'}</div>
      <div class="rider-head-meta">
        <div class="rider-head-event">${escapeHtml(evt ? evt.name : t('checkpointScan.appTitle'))}</div>
        ${cpState.session ? `<div class="rider-head-status"><a href="#" onclick="cpLogout();return false;" style="color:inherit;">${t('checkpointScan.logoutButton')}</a></div>` : ''}
      </div>
    </div>
  `;
}

function cpViewLogin(){
  const isCode = cpState.loginMode !== 'account';
  return `
    <div class="rider-body">
      <div class="rider-title">${t('checkpointScan.loginTitle')}</div>
      <div class="rider-lead">${t('checkpointScan.loginLead')}</div>
      ${cpState.error ? `<div class="rider-note rider-note-error">${escapeHtml(cpState.error)}</div>` : ''}
      <div class="rider-actions" style="flex-direction:row; margin-bottom:10px;">
        <button type="button" class="rider-btn ${isCode ? 'rider-btn-primary' : 'rider-btn-ghost'}" onclick="cpSetLoginMode('code')">${t('checkpointScan.loginModeCode')}</button>
        <button type="button" class="rider-btn ${!isCode ? 'rider-btn-primary' : 'rider-btn-ghost'}" onclick="cpSetLoginMode('account')">${t('checkpointScan.loginModeAccount')}</button>
      </div>
      ${isCode ? `
        <div class="rider-field">
          <label for="cp-login-publicid">${t('checkpointScan.codeEventLabel')}</label>
          <input type="text" id="cp-login-publicid" autocapitalize="none" autocomplete="off" spellcheck="false">
        </div>
        <div class="rider-field">
          <label for="cp-login-cpid">${t('checkpointScan.codeCheckpointLabel')}</label>
          <input type="text" id="cp-login-cpid" autocapitalize="none" autocomplete="off" spellcheck="false">
        </div>
        <div class="rider-field">
          <label for="cp-login-code">${t('checkpointScan.codeLabel')}</label>
          <input type="text" id="cp-login-code" class="code" inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="8">
        </div>
      ` : `
        <div class="rider-field">
          <label for="cp-login-publicid">${t('checkpointScan.accountEventLabel')}</label>
          <input type="text" id="cp-login-publicid" autocapitalize="none" autocomplete="off" spellcheck="false">
        </div>
        <div class="rider-field">
          <label for="cp-login-username">${t('checkpointScan.accountUsernameLabel')}</label>
          <input type="text" id="cp-login-username" autocomplete="username">
        </div>
        <div class="rider-field">
          <label for="cp-login-password">${t('checkpointScan.accountPasswordLabel')}</label>
          <input type="password" id="cp-login-password" autocomplete="current-password">
        </div>
      `}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" ${cpState.busy ? 'disabled' : ''} onclick="cpSubmitLogin()">${isCode ? t('checkpointScan.codeSubmit') : t('checkpointScan.accountSubmit')}</button>
    </div>
  `;
}

function cpViewHome(){
  const cps = cpState.checkpoints;
  const queued = typeof cpQueueLength === 'function' ? cpQueueLength() : 0;
  const activeCp = cps.find(c => c.cpId === cpState.activeCpId);

  const picker = cps.length > 1 ? `
    <div class="rider-field">
      <label>${t('checkpointScan.homePickCheckpointLabel')}</label>
      <select id="cp-active-select" onchange="cpSetActiveCheckpoint(this.value)">
        ${cps.map(cp => `<option value="${escapeHtml(cp.cpId)}" ${cp.cpId === cpState.activeCpId ? 'selected' : ''}>${escapeHtml(cp.label)}</option>`).join('')}
      </select>
    </div>
  ` : '';

  return `
    ${cpHead()}
    <div class="rider-body">
      ${cpState.offlineSince ? `<div class="rider-note rider-note-warn">${escapeHtml(t('checkpointScan.homeOfflineBanner', {time: cpShortTime(cpState.offlineSince)}))}</div>` : ''}
      ${cpState.error ? `<div class="rider-note rider-note-error">${escapeHtml(cpState.error)}</div>` : ''}
      ${queued ? `<div class="rider-note rider-note-warn"><span class="rider-queue-badge">⏳ ${escapeHtml(queued === 1 ? t('checkpointScan.homeQueueWaiting', {count: queued}) : t('checkpointScan.homeQueueWaitingPlural', {count: queued}))}</span></div>` : ''}
      ${picker}
      <div class="rider-field" style="margin-top:18px;">
        <label for="cp-bib-input">${t('checkpointScan.homeBibFallbackLabel')}</label>
        <input type="text" id="cp-bib-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off">
      </div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-ghost" onclick="cpSubmitBibFallback()">${t('checkpointScan.homeBibFallbackSubmit')}</button>
      <button type="button" class="rider-btn rider-btn-primary" ${activeCp ? '' : 'disabled'} onclick="cpStartRiderScan()">${t('checkpointScan.homeScanButton')}</button>
    </div>
  `;
}

function cpViewScanner(){
  return `
    <div class="rider-scanner">
      <video id="cp-scan-video" autoplay playsinline muted></video>
      <div class="rider-scanner-frame"></div>
      <div class="rider-scanner-hint">${t('checkpointScan.scanHint')}</div>
      <button type="button" class="rider-btn rider-btn-ghost rider-scanner-close" onclick="stopCpScan()">${t('checkpointScan.scanCancel')}</button>
    </div>
  `;
}

function cpViewConfirm(){
  const c = cpState.confirm || {};
  return `
    ${cpHead()}
    <div class="rider-confirm">
      <div class="rider-confirm-mark">${c.already ? '↩️' : '✅'}</div>
      <div class="rider-confirm-name">#${c.bib != null ? Number(c.bib) : '—'} · ${escapeHtml(c.label || '')}</div>
      <div class="rider-confirm-time">${escapeHtml(c.already ? t('checkpointScan.confirmAlready') + ' · ' + cpShortTime(c.at) : cpShortTime(c.at))}</div>
      ${c.queued ? `<div class="rider-note rider-note-info" style="margin-top:14px;">${t('checkpointScan.confirmQueued')}</div>` : ''}
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="cpGoHome()">${t('checkpointScan.confirmBack')}</button>
    </div>
  `;
}

function cpViewError(){
  return `
    ${cpHead()}
    <div class="rider-body">
      <div class="rider-note rider-note-error">${escapeHtml(cpState.error || t('checkpointScan.errGeneric'))}</div>
    </div>
    <div class="rider-actions">
      <button type="button" class="rider-btn rider-btn-primary" onclick="cpRecoverFromError()">${t('checkpointScan.errRetry')}</button>
    </div>
  `;
}

function cpShortTime(v){
  if(!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if(isNaN(d.getTime())) return String(v);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
