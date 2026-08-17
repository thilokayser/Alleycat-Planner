/* ---------------- offline map tiles ----------------
   Best-effort Offline-Kartenkacheln-Cache: eigene, von der App-Storage
   (storageGet/Set/Delete) unabhängige IndexedDB (reines Browser-Feature,
   pro Gerät, unabhängig vom Storage-Backend — funktioniert identisch in
   beiden Varianten, daher kein Storage-Seam nötig). Tiles werden per
   z/x/y-Schlüssel gecacht (unabhängig vom Event, da sich Kartenausschnitte
   zwischen Events überschneiden können); nur der "zuletzt aktualisiert"-
   Zeitstempel (`evt.tileCacheUpdatedAt`) ist pro Event. */
const TILES_IDB_DB = 'alleycat-tiles';
const TILES_IDB_STORE = 'tiles';
const OFFLINE_TILE_URL_TEMPLATE = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const OFFLINE_TILE_ZOOM_MIN = 13;
const OFFLINE_TILE_ZOOM_MAX = 17;
const OFFLINE_TILE_BUFFER_METERS = 500;
const OFFLINE_TILE_AVG_KB = 22;
const TILE_GREY_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22256%22%3E%3Crect width=%22256%22 height=%22256%22 fill=%22%23ccc%22/%3E%3C/svg%3E';

function tileCacheKey(z, x, y){ return `${z}/${x}/${y}`; }
function tileUrl(z, x, y){ return OFFLINE_TILE_URL_TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y); }
function tilesIdbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TILES_IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TILES_IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getTileFromCache(key){
  try{
    const db = await tilesIdbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TILES_IDB_STORE, 'readonly');
      const req = tx.objectStore(TILES_IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }catch(e){ return null; }
}
async function putTileInCache(key, blob){
  try{
    const db = await tilesIdbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(TILES_IDB_STORE, 'readwrite');
      tx.objectStore(TILES_IDB_STORE).put(blob, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }catch(e){ console.error('Kartenkachel-Cache schreiben fehlgeschlagen', e); }
}
async function getTileCacheStats(){
  try{
    const db = await tilesIdbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(TILES_IDB_STORE, 'readonly');
      let count = 0, bytes = 0;
      const req = tx.objectStore(TILES_IDB_STORE).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if(cursor){
          count++;
          bytes += (cursor.value && cursor.value.size) || 0;
          cursor.continue();
        } else resolve({count, bytes});
      };
      req.onerror = () => reject(req.error);
    });
  }catch(e){ return {count: 0, bytes: 0}; }
}

/* ---------------- bbox + tile-index math ---------------- */
function lonToTileX(lon, z){ return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
function latToTileY(lat, z){
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z));
}
function computeCheckpointBoundsWithBuffer(checkpoints, bufferMeters){
  const lats = checkpoints.map(c => c.lat), lngs = checkpoints.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latBuf = bufferMeters / 111320;
  const midLat = (minLat + maxLat) / 2;
  const lngBuf = bufferMeters / (111320 * Math.max(0.1, Math.cos(midLat * Math.PI / 180)));
  return {minLat: minLat - latBuf, maxLat: maxLat + latBuf, minLng: minLng - lngBuf, maxLng: maxLng + lngBuf};
}
function tilesInBounds(bounds, zMin, zMax){
  const tiles = [];
  for(let z = zMin; z <= zMax; z++){
    const xMin = lonToTileX(bounds.minLng, z), xMax = lonToTileX(bounds.maxLng, z);
    const yMin = latToTileY(bounds.maxLat, z), yMax = latToTileY(bounds.minLat, z);
    for(let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++){
      for(let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++){
        tiles.push({z, x, y});
      }
    }
  }
  return tiles;
}
function tilesForEvent(evt){
  const withPos = (evt.checkpoints || []).filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if(!withPos.length) return [];
  const bounds = computeCheckpointBoundsWithBuffer(withPos, OFFLINE_TILE_BUFFER_METERS);
  return tilesInBounds(bounds, OFFLINE_TILE_ZOOM_MIN, OFFLINE_TILE_ZOOM_MAX);
}

/* ---------------- download orchestration ---------------- */
async function cacheTileList(tiles, onProgress){
  let done = 0, failed = 0;
  let idx = 0;
  async function worker(){
    while(idx < tiles.length){
      const tile = tiles[idx++];
      const key = tileCacheKey(tile.z, tile.x, tile.y);
      try{
        const existing = await getTileFromCache(key);
        if(!existing){
          const res = await fetch(tileUrl(tile.z, tile.x, tile.y));
          if(!res.ok) throw new Error('HTTP ' + res.status);
          await putTileInCache(key, await res.blob());
        }
      }catch(e){ failed++; }
      done++;
      if(onProgress) onProgress({done, total: tiles.length, failed});
    }
  }
  await Promise.all(Array.from({length: Math.min(6, tiles.length)}, worker));
  return {done, failed};
}

/* ---------------- Leaflet integration ---------------- */
function createOfflineTileLayer(urlTemplate, options){
  const OfflineTileLayer = L.TileLayer.extend({
    createTile(coords, done){
      const tile = document.createElement('img');
      tile.alt = '';
      const key = tileCacheKey(coords.z, coords.x, coords.y);
      getTileFromCache(key).then(blob => {
        if(blob){
          tile.src = URL.createObjectURL(blob);
          done(null, tile);
          return;
        }
        tile.onload = () => done(null, tile);
        tile.onerror = () => {
          tile.onerror = null;
          tile.src = TILE_GREY_PLACEHOLDER;
          done(null, tile);
        };
        tile.src = this.getTileUrl(coords);
      });
      return tile;
    }
  });
  return new OfflineTileLayer(urlTemplate, options);
}

/* ---------------- dashboard-todo staleness helper ---------------- */
function offlineTileCacheStaleness(evt){
  if(!evt.tileCacheUpdatedAt) return null;
  const ageMs = Date.now() - new Date(evt.tileCacheUpdatedAt).getTime();
  if(ageMs > 3 * 86400000) return 'danger';
  if(ageMs > 86400000) return 'warn';
  return null;
}

/* ---------------- settings: "Offline-Bereitschaft" ---------------- */
let offlineUiState = {loaded: false, events: [], selected: {}, busy: false, progress: null};
async function refreshOfflineReadiness(){
  offlineUiState.loaded = false;
  const all = await Promise.all(state.eventsIndex.map(e => loadEvent(e.id)));
  offlineUiState.events = all.filter(e => e && (e.status === 'ready' || e.status === 'running')).map(withEventDefaults);
  offlineUiState.loaded = true;
  if(state.view === 'settings') renderSettings();
}
function toggleOfflineEventSelected(id, checked){
  offlineUiState.selected[id] = checked;
  renderSettings();
}
function computeOfflineEstimateForSelected(){
  let tileCount = 0;
  offlineUiState.events.forEach(evt => {
    if(offlineUiState.selected[evt.id]) tileCount += tilesForEvent(evt).length;
  });
  return {tileCount, estimatedMB: tileCount * OFFLINE_TILE_AVG_KB / 1024};
}
async function cacheSelectedOfflineEvents(){
  const selectedEvents = offlineUiState.events.filter(evt => offlineUiState.selected[evt.id]);
  if(!selectedEvents.length || offlineUiState.busy) return;
  if(!state.appSettings.offlineCacheHintShown){
    state.appSettings.offlineCacheHintShown = true;
    saveAppSettings();
    alert(t('offlineTiles.firstTimeHint'));
  }
  offlineUiState.busy = true;
  offlineUiState.progress = {done: 0, total: 0, failed: 0};
  renderSettings();
  for(const evt of selectedEvents){
    const tiles = tilesForEvent(evt);
    await cacheTileList(tiles, (p) => {
      offlineUiState.progress = p;
      renderSettings();
    });
    evt.tileCacheUpdatedAt = toLocalDateTimeInputValue(new Date());
    await storageSet('event:' + evt.id, JSON.stringify(evt));
    if(state.currentEvent && state.currentEvent.id === evt.id) state.currentEvent.tileCacheUpdatedAt = evt.tileCacheUpdatedAt;
  }
  offlineUiState.busy = false;
  offlineUiState.progress = null;
  await refreshOfflineReadiness();
}
function renderOfflineReadinessSection(){
  if(!offlineUiState.loaded){
    refreshOfflineReadiness();
    return `
      <div class="settings-section">
        <h3>${t('offlineTiles.heading')}</h3>
        <div class="settings-section-desc">${t('offlineTiles.loading')}</div>
      </div>
    `;
  }
  const estimate = computeOfflineEstimateForSelected();
  const rows = offlineUiState.events.length ? offlineUiState.events.map(evt => `
    <label class="offline-event-row checkbox-row">
      <input type="checkbox" ${offlineUiState.selected[evt.id] ? 'checked' : ''} onchange="toggleOfflineEventSelected('${evt.id}', this.checked)">
      <span class="offline-event-name">${escapeHtml(evt.name || t('common.unnamedEvent'))}</span>
      <span class="offline-event-meta">${evt.tileCacheUpdatedAt ? t('offlineTiles.cachedAt', {time: formatDateTime(evt.tileCacheUpdatedAt)}) : t('offlineTiles.neverCached')}</span>
    </label>
  `).join('') : `<div class="settings-section-desc">${t('offlineTiles.noEligibleEvents')}</div>`;
  const progressHtml = offlineUiState.busy && offlineUiState.progress ? `
    <div class="offline-progress">${t('offlineTiles.progress', {done: offlineUiState.progress.done, total: offlineUiState.progress.total})}${offlineUiState.progress.failed ? ' ' + t('offlineTiles.progressFailed', {failed: offlineUiState.progress.failed}) : ''}</div>
  ` : '';
  return `
    <div class="settings-section">
      <h3>${t('offlineTiles.heading')}</h3>
      <div class="settings-section-desc">${t('offlineTiles.desc')}</div>
      <div class="offline-event-list">${rows}</div>
      <div class="data-safety-row">
        <button type="button" class="btn btn-sm" ${offlineUiState.busy || !estimate.tileCount ? 'disabled' : ''} onclick="cacheSelectedOfflineEvents()">${t('offlineTiles.cacheNowButton')}</button>
        <span class="settings-section-desc" style="margin:0;">${t('offlineTiles.estimateText', {tiles: estimate.tileCount, mb: estimate.estimatedMB.toFixed(1)})}</span>
      </div>
      ${progressHtml}
      <div class="data-safety-row" id="tile-cache-total-row">${t('offlineTiles.totalLoading')}</div>
    </div>
  `;
}
async function refreshTileCacheTotal(){
  const el = document.getElementById('tile-cache-total-row');
  if(!el) return;
  const stats = await getTileCacheStats();
  el.textContent = t('offlineTiles.totalText', {count: stats.count, mb: (stats.bytes / 1048576).toFixed(1)});
}
