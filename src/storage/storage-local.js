/* ---------------- storage ----------------
   Nutzt window.storage (geteilter Artifact-Speicher), sofern verfügbar.
   Fällt sonst auf eine lokale SQLite-Datenbank zurück (sql.js/WASM, als
   Binär-Blob in IndexedDB persistiert) — nur lokal im Browser, nicht
   geteilt, aber als echte .sqlite-Datei exportier- und importierbar.   */
const hasSharedStorage = !!(window.storage && typeof window.storage.get === 'function');
if(!hasSharedStorage){
  console.warn('window.storage nicht verfügbar — nutze lokalen SQLite-Fallback (nicht geteilt).');
}
let sqlJsModule = null;
let sqlDb = null;
const SQLITE_IDB_DB = 'alleycat-sqlite';
const SQLITE_IDB_STORE = 'files';
const SQLITE_IDB_KEY = 'main';
function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SQLITE_IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SQLITE_IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbLoadBytes(){
  try{
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SQLITE_IDB_STORE, 'readonly');
      const req = tx.objectStore(SQLITE_IDB_STORE).get(SQLITE_IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }catch(e){ console.error('IndexedDB-Lesen fehlgeschlagen', e); return null; }
}
async function idbSaveBytes(bytes){
  try{
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SQLITE_IDB_STORE, 'readwrite');
      tx.objectStore(SQLITE_IDB_STORE).put(bytes, SQLITE_IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }catch(e){ console.error('IndexedDB-Schreiben fehlgeschlagen', e); }
}
async function persistSqlDb(){
  if(!sqlDb) return;
  await idbSaveBytes(sqlDb.export());
}
async function initSqliteStorage(){
  if(hasSharedStorage || sqlDb) return;
  sqlJsModule = await initSqlJs({
    locateFile: file => 'https://cdn.jsdelivr.net/npm/sql.js@1.14.2/dist/' + file
  });
  const existingBytes = await idbLoadBytes();
  sqlDb = existingBytes ? new sqlJsModule.Database(existingBytes) : new sqlJsModule.Database();
  sqlDb.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
  if(!existingBytes) await persistSqlDb();
}
async function storageGet(key){
  if(hasSharedStorage){
    try{ return await window.storage.get(key, true); }
    catch(e){ console.error('storage.get failed', e); return null; }
  }
  try{
    const stmt = sqlDb.prepare('SELECT value FROM kv WHERE key = ?');
    stmt.bind([key]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row ? {value: row.value} : null;
  }catch(e){ console.error('sqlite get failed', e); return null; }
}
async function storageSet(key, value){
  if(hasSharedStorage){
    try{ await window.storage.set(key, value, true); return true; }
    catch(e){ console.error('storage.set failed', e); return false; }
  }
  try{
    sqlDb.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
    await persistSqlDb();
    return true;
  }catch(e){ console.error('sqlite set failed', e); return false; }
}
async function storageDelete(key){
  if(hasSharedStorage){
    try{ await window.storage.delete(key, true); return; }
    catch(e){ console.error('storage.delete failed', e); }
    return;
  }
  try{
    sqlDb.run('DELETE FROM kv WHERE key = ?', [key]);
    await persistSqlDb();
  }catch(e){ console.error('sqlite delete failed', e); }
}
function exportSqliteFile(){
  if(!sqlDb) return;
  const blob = new Blob([sqlDb.export()], {type: 'application/x-sqlite3'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'alleycat-dispatch.sqlite';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function onImportSqliteFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  try{
    const bytes = new Uint8Array(await file.arrayBuffer());
    const db = new sqlJsModule.Database(bytes);
    db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');
    sqlDb = db;
    await persistSqlDb();
    input.value = '';
    await loadEventsIndex();
    goDashboard();
    render();
  }catch(e){
    console.error('sqlite import failed', e);
    alert('Import fehlgeschlagen: Die Datei ist keine gültige Alleycat-Dispatch-SQLite-Datenbank.');
    input.value = '';
  }
}

async function exportBackupBlob(evt){
  if(!sqlDb || !evt) return null;
  const slug = (evt.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
  const ts = toLocalDateTimeInputValue(new Date()).replace(/[:T]/g, '-');
  return {blob: new Blob([sqlDb.export()], {type: 'application/x-sqlite3'}), filename: `alleycat-autobackup-${slug}-${ts}.sqlite`};
}

/* ---------------- storage capability seams (used by shared core/*.js) ---------------- */
/* Whether this install can write its own backup files at all. False under a
   shared window.storage: there the data lives on someone else's server, so a
   per-device backup would be both misleading and useless. Core modules ask
   this instead of testing hasSharedStorage themselves — same reason
   exportBackupBlob() returns null there. */
function supportsLocalBackup(){
  return !hasSharedStorage;
}
/* Rider-App-Seams. Diese Variante hat kein Backend, das ein Fahrer-Handy
   erreichen könnte — ohne gemeinsamen Server gibt es keine Fahrer-App.
   null ist das vereinbarte Signal dafür: der geteilte Kern blendet daran
   sämtliche Rider-Oberfläche aus, statt selbst nach der Variante zu
   fragen. Gleiches Muster wie exportBackupBlob(). */
async function publishRiderConfig(){ return null; }
async function pollRiderLog(){ return null; }
async function confirmRiderSlot(){ return null; }
/* Gehört zum selben Seam-Vertrag: der Kern erzeugt daraus die QR-Nutzlast.
   Leer heißt "keine Adresse, auf die ein QR-Code zeigen könnte". */
function riderAppBaseUrl(){ return ''; }
/* Admin-Rollen-Seam: diese Variante läuft in genau einem Browser ohne
   geteiltes Backend — es gibt niemanden, dem gegenüber eine Rolle
   überhaupt etwas bedeuten würde. currentUserRole() in auth.js liest das
   und behandelt jeden als 'admin'. */
function hasAdminRoles(){ return false; }
async function adminLogin(){ return {ok: false, error: 'not_supported'}; }
async function adminLogout(){}
async function adminWhoami(){ return null; }
async function adminBootstrap(){ return {ok: false, error: 'not_supported'}; }
async function adminListUsers(){ return {ok: false, error: 'not_supported'}; }
async function adminCreateUser(){ return {ok: false, error: 'not_supported'}; }
async function adminUpdateUser(){ return {ok: false, error: 'not_supported'}; }
async function adminDeleteUser(){ return {ok: false, error: 'not_supported'}; }
async function adminGetCheckpointStaff(){ return {ok: false, error: 'not_supported'}; }
async function adminSetCheckpointStaff(){ return {ok: false, error: 'not_supported'}; }
async function createInviteCode(){ return null; }
async function listInviteCodes(){ return null; }
async function revokeInviteCode(){ return null; }
async function registerWithInviteCode(){ return null; }
async function initStorageBackend(){
  await initSqliteStorage();
  return true;
}
function renderStorageDashboardExtras(){
  if(hasSharedStorage) return '';
  return `
    <input type="file" id="import-sqlite-file" accept="application/x-sqlite3,.sqlite,.db" style="display:none;" onchange="onImportSqliteFile(this)">
    <button class="btn" onclick="document.getElementById('import-sqlite-file').click()" title="${t('dashboard.importSqliteTitle')}">${t('dashboard.importSqlite')}</button>
    <button class="btn" onclick="exportSqliteFile()" title="${t('dashboard.exportSqliteTitle')}">${t('dashboard.exportSqlite')}</button>
  `;
}
/* Seeds the fictional demo event (demo-event.js) exactly once, only into a
   genuinely empty, private local install — never when hasSharedStorage (this
   build embedded with a shared window.storage, same clutter risk as the
   server variant). Gated on a persisted flag rather than "events list is
   empty" so deleting the demo (or every real event later) never brings it
   back — it's a first-run affordance, not a permanent fixture. */
async function seedDemoEventIfNeeded(){
  if(hasSharedStorage) return;
  if(await storageGet('demoEvent:seeded')) return;
  if(state.eventsIndex.length === 0){
    const evt = buildDemoEvent();
    state.eventsIndex.push({id: evt.id, name: evt.name, date: evt.date});
    await saveEventsIndex();
    await storageSet('event:' + evt.id, JSON.stringify(evt));
  }
  await storageSet('demoEvent:seeded', '1');
}
