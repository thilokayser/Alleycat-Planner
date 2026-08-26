/* ---------------- storage ----------------
   Nutzt window.storage (geteilter Artifact-Speicher), sofern verfügbar.
   Fällt sonst auf das eigene PHP/MySQL-Backend zurück (siehe /php-backend)
   — echtes Server-Backend, von mehreren Geräten/Browsern gemeinsam
   nutzbar. Verbindungsdaten (Endpunkt + API-Key) werden einmalig beim
   ersten Start abgefragt und lokal in localStorage gemerkt (nur die
   Zugangsdaten selbst, nicht die Event-Daten).                        */
const hasSharedStorage = !!(window.storage && typeof window.storage.get === 'function');
if(!hasSharedStorage){
  console.warn('window.storage nicht verfügbar — nutze PHP-Server-Backend.');
}
if(location.search.includes('reset-php-config')){
  localStorage.removeItem('alleycat:php-config');
}
function getPhpConfig(){
  try{ return JSON.parse(localStorage.getItem('alleycat:php-config') || 'null'); }
  catch(e){ return null; }
}
function savePhpConfig(cfg){
  localStorage.setItem('alleycat:php-config', JSON.stringify(cfg));
}
async function phpRequest(method, key, body){
  const cfg = getPhpConfig();
  if(!cfg) throw new Error('PHP-Backend nicht konfiguriert');
  const url = cfg.apiUrl + '?key=' + encodeURIComponent(key);
  return fetch(url, {
    method,
    headers: Object.assign({'X-Api-Key': cfg.apiKey}, method === 'POST' ? {'Content-Type': 'text/plain'} : {}),
    body: method === 'POST' ? body : undefined
  });
}
async function storageGet(key){
  if(hasSharedStorage){
    try{ return await window.storage.get(key, true); }
    catch(e){ console.error('storage.get failed', e); return null; }
  }
  try{
    const res = await phpRequest('GET', key);
    if(res.status === 404) return null;
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return {value: data.value};
  }catch(e){ console.error('php storage get failed', e); return null; }
}
async function storageSet(key, value){
  if(hasSharedStorage){
    try{ await window.storage.set(key, value, true); return true; }
    catch(e){ console.error('storage.set failed', e); return false; }
  }
  try{
    const res = await phpRequest('POST', key, value);
    return res.ok;
  }catch(e){ console.error('php storage set failed', e); return false; }
}
async function storageDelete(key){
  if(hasSharedStorage){
    try{ await window.storage.delete(key, true); return; }
    catch(e){ console.error('storage.delete failed', e); }
    return;
  }
  try{ await phpRequest('DELETE', key); }
  catch(e){ console.error('php storage delete failed', e); }
}
function renderPhpSetup(error){
  document.getElementById('app').innerHTML = `
    <div style="max-width:480px; margin:60px auto; padding:32px; background:var(--asphalt-2); border:1px solid var(--asphalt-3); border-top:3px solid var(--hivis); border-radius:6px;">
      <h2 style="margin:0 0 4px;">Alleycat Dispatch</h2>
      <div style="color:var(--steel); font-size:13px; font-family:'JetBrains Mono'; margin-bottom:22px;">${t('phpSetup.subtitle')}</div>
      ${error ? `<div style="background:rgba(178,58,46,0.15); border:1px solid var(--stamp); color:#ff9a8f; padding:10px 12px; border-radius:4px; font-size:13px; margin-bottom:14px;">${escapeHtml(error)}</div>` : ''}
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.apiEndpointLabel')}</label>
      <input type="text" id="php-setup-url" placeholder="${escapeHtml(t('phpSetup.apiEndpointPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.apiKeyLabel')}</label>
      <input type="text" id="php-setup-key" placeholder="${escapeHtml(t('phpSetup.apiKeyPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:14px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <label style="display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:var(--steel); margin-bottom:4px;">${t('phpSetup.riderAppUrlLabel')}</label>
      <input type="text" id="php-setup-rider-url" placeholder="${escapeHtml(t('phpSetup.riderAppUrlPlaceholder'))}"
        style="width:100%; padding:9px 10px; margin-bottom:6px; border-radius:3px; border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk); font-family:monospace; font-size:13px;">
      <div style="color:var(--steel); font-size:11.5px; margin-bottom:20px; line-height:1.5;">${t('phpSetup.riderAppUrlHint')}</div>
      <button class="btn btn-primary" style="width:100%;" onclick="submitPhpSetup()">${t('phpSetup.connectButton')}</button>
      <div style="color:var(--steel); font-size:11.5px; margin-top:14px; line-height:1.5;">${t('phpSetup.installHint', {installPhp: '<code>install.php</code>', phpBackend: '<code>php-backend</code>', resetParam: '<code>?reset-php-config</code>'})}</div>
    </div>
  `;
}
async function submitPhpSetup(){
  const apiUrl = (document.getElementById('php-setup-url').value || '').trim().replace(/\/$/, '');
  const apiKey = (document.getElementById('php-setup-key').value || '').trim();
  /* Optional: leer lassen heißt "keine Fahrer-App". Die Rider-Seams
     liefern dann null und der geteilte Kern blendet alles Zugehörige
     aus — eine bestehende Installation bleibt damit ohne Zutun
     unverändert lauffähig. */
  const riderAppUrl = (document.getElementById('php-setup-rider-url').value || '').trim();
  if(!apiUrl || !apiKey){ renderPhpSetup(t('phpSetup.errorFieldsRequired')); return; }
  savePhpConfig({apiUrl, apiKey, riderAppUrl});
  try{
    const res = await phpRequest('GET', 'events:index');
    if(res.status === 401){
      localStorage.removeItem('alleycat:php-config');
      renderPhpSetup(t('phpSetup.errorKeyRejected'));
      return;
    }
    if(!res.ok && res.status !== 404){
      localStorage.removeItem('alleycat:php-config');
      renderPhpSetup(t('phpSetup.errorServerStatus', {status: res.status}));
      return;
    }
  }catch(e){
    localStorage.removeItem('alleycat:php-config');
    renderPhpSetup(t('phpSetup.errorConnectionFailed', {message: e.message}));
    return;
  }
  location.reload();
}

async function exportBackupBlob(evt){
  if(hasSharedStorage || !evt) return null;
  const slug = (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
  const ts = toLocalDateTimeInputValue(new Date()).replace(/[:T]/g, '-');
  return {blob: new Blob([JSON.stringify(evt, null, 2)], {type: 'application/json'}), filename: `alleycat-autobackup-${slug}-${ts}.json`};
}

/* ---------------- storage capability seams (used by shared core/*.js) ---------------- */
/* See the local variant for the full rationale: false under a shared
   window.storage, where a per-device backup would be misleading. With the PHP
   backend configured, backups are genuine JSON exports of the event. */
function supportsLocalBackup(){
  return !hasSharedStorage;
}

/* ---------------- Rider-App-Seams ----------------
   Alle drei liefern null, wenn es keine Fahrer-App geben kann: unter
   einem geteilten window.storage gibt es kein PHP-Backend, und ohne
   konfigurierte Rider-App-URL gibt es keine Adresse, auf die ein
   QR-Code zeigen könnte. Der geteilte Kern wertet ausschließlich dieses
   null aus und fragt nie selbst nach der Variante. */
function riderAppBaseUrl(){
  const cfg = getPhpConfig();
  return (cfg && cfg.riderAppUrl) ? cfg.riderAppUrl : '';
}
function riderEndpointUrl(){
  const cfg = getPhpConfig();
  if(!cfg || !cfg.apiUrl) return '';
  /* rider.php liegt neben api.php — der Nutzer konfiguriert nur einen
     Endpunkt, und beide Dateien kommen aus demselben Ordner. */
  return cfg.apiUrl.replace(/\/[^\/]*$/, '/rider.php');
}
function riderSeamsAvailable(){
  return !hasSharedStorage && !!getPhpConfig() && !!riderAppBaseUrl();
}
async function riderRequest(method, query, body){
  const cfg = getPhpConfig();
  const res = await fetch(riderEndpointUrl() + '?' + query, {
    method,
    headers: Object.assign({'X-Api-Key': cfg.apiKey}, body ? {'Content-Type': 'application/json'} : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function publishRiderConfig(payload){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('POST', 'a=sync', payload);
  }catch(e){
    console.error('rider sync failed', e);
    return {ok: false, error: e.message};
  }
}
async function pollRiderLog(publicId, sinceId){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('GET', 'a=log&public_id=' + encodeURIComponent(publicId) + '&since=' + (sinceId || 0));
  }catch(e){
    console.error('rider log poll failed', e);
    return {ok: false, error: e.message};
  }
}
async function confirmRiderSlot(publicId, bib, status){
  if(!riderSeamsAvailable()) return null;
  try{
    return await riderRequest('POST', 'a=slotstatus', {publicId, bib, status});
  }catch(e){
    console.error('rider slot status failed', e);
    return {ok: false, error: e.message};
  }
}
async function initStorageBackend(){
  if(!hasSharedStorage && !getPhpConfig()){
    renderPhpSetup();
    return false;
  }
  return true;
}
function renderStorageDashboardExtras(){
  return '';
}
/* No-op: this variant's storage is shared across every organizer on the
   installation (PHP backend, or a shared window.storage), so auto-creating
   a demo event here would clutter a board other people already use. See
   the local variant's seedDemoEventIfNeeded() for the real implementation. */
async function seedDemoEventIfNeeded(){}
