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
async function initStorageBackend(){
  await initSqliteStorage();
  return true;
}
function renderStorageDashboardExtras(){
  if(hasSharedStorage) return '';
  return `
    <input type="file" id="import-sqlite-file" accept="application/x-sqlite3,.sqlite,.db" style="display:none;" onchange="onImportSqliteFile(this)">
    <button class="btn" onclick="document.getElementById('import-sqlite-file').click()" title="Komplette lokale Datenbank aus .sqlite-Datei laden (ersetzt alle Events)">SQLite importieren</button>
    <button class="btn" onclick="exportSqliteFile()" title="Komplette lokale Datenbank als .sqlite-Datei sichern">SQLite exportieren</button>
  `;
}
