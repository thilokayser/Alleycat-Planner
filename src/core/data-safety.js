/* ---------------- data safety & offline platform features ----------------
   Auto-Backup (Download-Intervall via exportBackupBlob() storage seam),
   Beforeunload-Warnung + Header-Hinweis während "Läuft", Wake Lock
   (Bildschirm bleibt an bei laufendem Check-in / im Beamer), und die
   Storage-APIs (persist/estimate) — alles backend-unabhängig bis auf
   den einen Seam (exportBackupBlob), analog zu initStorageBackend()/
   renderStorageDashboardExtras(). */

/* ---------------- auto-backup ---------------- */
let autoBackupInterval = null;
function formatMinutesAgo(iso){
  if(!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? t('dataSafety.justNow') : t('dataSafety.minutesAgo', {mins});
}
function startAutoBackup(){
  if(autoBackupInterval) clearInterval(autoBackupInterval);
  const minutes = (state.appSettings && state.appSettings.autoBackupIntervalMinutes) || 10;
  autoBackupInterval = setInterval(runAutoBackupTick, minutes * 60000);
}
async function runAutoBackupTick(){
  if(!state.appSettings.autoBackupEnabled) return;
  const evt = state.currentEvent;
  if(!evt || evt.status !== 'running') return;
  await triggerBackupNow(true);
}
async function triggerBackupNow(silent){
  const evt = state.currentEvent;
  if(!evt || typeof exportBackupBlob !== 'function') return;
  const backup = await exportBackupBlob(evt);
  if(!backup) return;
  if(!state.appSettings.autoBackupHintShown){
    state.appSettings.autoBackupHintShown = true;
    saveAppSettings();
    alert(t('dataSafety.multiDownloadHint'));
  }
  downloadBlob(backup.blob, backup.filename);
  evt.lastBackupAt = toLocalDateTimeInputValue(new Date());
  debouncedSave();
  if(!silent) showToast({message: t('dataSafety.backupTriggered')});
  if(state.view === 'overview') renderOverview();
}
function onAutoBackupIntervalChange(value){
  state.appSettings.autoBackupIntervalMinutes = Math.max(1, Math.min(180, parseInt(value, 10) || 10));
  saveAppSettings();
  startAutoBackup();
  render();
}
function onAutoBackupEnabledChange(checked){
  state.appSettings.autoBackupEnabled = !!checked;
  saveAppSettings();
  render();
}

/* ---------------- beforeunload warning (only while a race is running) ---------------- */
window.addEventListener('beforeunload', (e) => {
  if(state.currentEvent && state.currentEvent.status === 'running'){
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ---------------- wake lock ---------------- */
let wakeLock = null;
async function requestWakeLock(){
  if(!('wakeLock' in navigator)) return false;
  try{
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    return true;
  }catch(e){ return false; }
}
function releaseWakeLock(){
  if(wakeLock){ wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', async () => {
  if(wakeLock && document.visibilityState === 'visible') await requestWakeLock();
});
function syncWakeLockForView(){
  const shouldHold = state.view === 'checkin' && state.currentEvent && state.currentEvent.status === 'running';
  if(shouldHold && !wakeLock) requestWakeLock();
  else if(!shouldHold && wakeLock) releaseWakeLock();
}

/* ---------------- storage APIs (persist + estimate) ---------------- */
async function requestPersistentStorage(){
  if(!(navigator.storage && navigator.storage.persist)) return null;
  if(await navigator.storage.persisted()) return true;
  return await navigator.storage.persist();
}
function armPersistentStorageRequest(){
  let alreadyAsked = false;
  try{ alreadyAsked = !!localStorage.getItem('alleycat:persistRequested'); }catch(e){}
  if(alreadyAsked) return;
  const handler = () => {
    document.removeEventListener('click', handler);
    requestPersistentStorage();
    try{ localStorage.setItem('alleycat:persistRequested', '1'); }catch(e){}
  };
  document.addEventListener('click', handler, {once: true});
}
async function getStorageEstimate(){
  if(!(navigator.storage && navigator.storage.estimate)) return null;
  const {usage, quota} = await navigator.storage.estimate();
  return {usedMB: usage / 1048576, quotaMB: quota / 1048576, percentUsed: quota ? (usage / quota * 100) : 0};
}
async function refreshStorageEstimate(){
  const el = document.getElementById('storage-estimate-value');
  if(!el) return;
  const est = await getStorageEstimate();
  el.textContent = est
    ? t('dataSafety.storageEstimateText', {used: est.usedMB.toFixed(1), quota: est.quotaMB.toFixed(0), percent: est.percentUsed.toFixed(0)})
    : t('dataSafety.storageEstimateUnsupported');
  const warnEl = document.getElementById('storage-estimate-warning');
  if(warnEl) warnEl.style.display = (est && est.percentUsed > 80) ? 'block' : 'none';
}
async function onRequestPersistentStorageClick(){
  const ok = await requestPersistentStorage();
  const el = document.getElementById('persistent-storage-status');
  if(el) el.textContent = ok ? t('dataSafety.persistGranted') : t('dataSafety.persistDenied');
}

/* ---------------- settings: data-safety section ---------------- */
function renderDataSafetySection(){
  const autoBackupEnabled = !!state.appSettings.autoBackupEnabled;
  const backupSection = (typeof hasSharedStorage !== 'undefined' && hasSharedStorage) ? '' : `
    <div class="settings-section">
      <h3>${t('dataSafety.backupHeading')}</h3>
      <div class="settings-section-desc">${t('dataSafety.backupDesc')}</div>
      <div class="data-safety-row">
        <label class="toggle-switch">
          <input type="checkbox" ${autoBackupEnabled ? 'checked' : ''} onchange="onAutoBackupEnabledChange(this.checked)">
          <span class="toggle-switch-track"></span>
        </label>
        <span>${t('dataSafety.autoBackupEnabledLabel')}</span>
      </div>
      ${autoBackupEnabled ? `
        <div class="data-safety-row">
          <label>${t('dataSafety.intervalLabel')}</label>
          <input type="number" min="1" max="180" style="width:80px;" value="${state.appSettings.autoBackupIntervalMinutes || 10}" onchange="onAutoBackupIntervalChange(this.value)">
          <span class="settings-section-desc" style="margin:0;">${t('dataSafety.intervalUnit')}</span>
        </div>
      ` : ''}
      <button type="button" class="btn btn-sm" onclick="triggerBackupNow(false)">${t('dataSafety.backupNowButton')}</button>
    </div>
  `;
  return `
    ${backupSection}
    <div class="settings-section">
      <h3>${t('dataSafety.storageHeading')}</h3>
      <div class="settings-section-desc">${t('dataSafety.storageDesc')}</div>
      <div class="data-safety-row">
        <span id="storage-estimate-value">${t('dataSafety.storageEstimateLoading')}</span>
      </div>
      <div id="storage-estimate-warning" class="data-safety-warning" style="display:none;">${t('dataSafety.storageEstimateHighUsage')}</div>
      <div class="data-safety-row">
        <button type="button" class="btn btn-sm" onclick="onRequestPersistentStorageClick()">${t('dataSafety.requestPersistButton')}</button>
        <span id="persistent-storage-status"></span>
      </div>
    </div>
    ${isFeatureEnabled('offline_map_cache') ? renderOfflineReadinessSection() : ''}
  `;
}
