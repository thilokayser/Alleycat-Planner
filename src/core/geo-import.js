/* ---------------- geo import: GPX / GeoJSON / KML reference layers ----------------
   Spec 18.5. Hand-rolled parsers (DOMParser for GPX/KML, JSON.parse for
   GeoJSON) — all native browser APIs, no new dependency, consistent with
   PROJEKT-UEBERSICHT.md §9's "kein Fremd-Framework" policy (Leaflet.draw is
   the one documented exception, and this isn't a Leaflet plugin at all).
   Purely a *reference* layer for planning (e.g. a city's main bike network,
   a Komoot pre-plan) — not a data model the rest of the app reads from;
   the only bridge back into real event data is the explicit "convert to
   checkpoint" action on an imported waypoint.

   Per spec, an imported layer can be "temporär oder persistent": temporary
   layers live in `state.geoImportLayers` (session-only, lost on reload —
   the sensible default for a large imported track nobody wants bloating
   every future save of the event JSON) and persistent ones move into
   `evt.importedGeoLayers` via setGeoImportLayerPersistent(). Both arrays
   share the same layer shape and are merged for rendering via
   allGeoImportLayers() — callers never need to care which array a given
   layer currently lives in. */
const GEO_IMPORT_COLORS = ['#3fa9f5', '#c76bd6', '#5c8a5c', '#d9a406'];
function withGeoImportLayerDefaults(l){
  return Object.assign({
    id: uid('geo'),
    name: '',
    filename: '',
    format: 'gpx', // 'gpx' | 'geojson' | 'kml'
    color: '#3fa9f5',
    visible: true,
    tracks: [],  // [[{lat,lng}, ...], ...]
    points: []   // [{lat,lng,name}, ...]
  }, l);
}
function allGeoImportLayers(evt){
  return [...(evt.importedGeoLayers || []), ...(state.geoImportLayers || [])];
}
function findGeoImportLayer(evt, id){
  return allGeoImportLayers(evt).find(l => l.id === id) || null;
}
function removeGeoImportLayer(evt, id){
  evt.importedGeoLayers = (evt.importedGeoLayers || []).filter(l => l.id !== id);
  state.geoImportLayers = (state.geoImportLayers || []).filter(l => l.id !== id);
}
function setGeoImportLayerPersistent(evt, id, persistent){
  evt.importedGeoLayers = evt.importedGeoLayers || [];
  state.geoImportLayers = state.geoImportLayers || [];
  if(persistent){
    const idx = state.geoImportLayers.findIndex(l => l.id === id);
    if(idx >= 0) evt.importedGeoLayers.push(state.geoImportLayers.splice(idx, 1)[0]);
  } else {
    const idx = evt.importedGeoLayers.findIndex(l => l.id === id);
    if(idx >= 0) state.geoImportLayers.push(evt.importedGeoLayers.splice(idx, 1)[0]);
  }
}
function isGeoImportLayerPersistent(evt, id){
  return (evt.importedGeoLayers || []).some(l => l.id === id);
}

/* ---------------- parsers ----------------
   Uniform output: {tracks: [[{lat,lng},...],...], points: [{lat,lng,name},...]}
   or null if the file couldn't be parsed as that format. Every point is
   filtered on Number.isFinite so a malformed coordinate drops silently
   rather than producing a broken marker at (NaN, NaN) — same defensive
   convention as zones.js's isPointInCircle(). */
function parseGpxFile(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')) return null;
  const tracks = [];
  const trkPtsOf = (seg) => Array.from(seg.querySelectorAll('trkpt'))
    .map(pt => ({lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon'))}))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  doc.querySelectorAll('trk > trkseg').forEach(seg => { const pts = trkPtsOf(seg); if(pts.length >= 2) tracks.push(pts); });
  doc.querySelectorAll('rte').forEach(rte => {
    const pts = Array.from(rte.querySelectorAll('rtept'))
      .map(pt => ({lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon'))}))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if(pts.length >= 2) tracks.push(pts);
  });
  const points = Array.from(doc.querySelectorAll('wpt')).map(pt => {
    const nameEl = pt.querySelector('name');
    return {lat: parseFloat(pt.getAttribute('lat')), lng: parseFloat(pt.getAttribute('lon')), name: nameEl ? nameEl.textContent.trim() : ''};
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if(!tracks.length && !points.length) return null;
  return {tracks, points};
}
function parseGeoJsonFile(text){
  let json;
  try{ json = JSON.parse(text); }catch(e){ return null; }
  const tracks = [], points = [];
  const lineFromCoords = (coords) => coords.map(c => ({lat: c[1], lng: c[0]})).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const handleGeometry = (geom, props) => {
    if(!geom || !geom.type) return;
    if(geom.type === 'Point'){
      const [lng, lat] = geom.coordinates || [];
      if(Number.isFinite(lat) && Number.isFinite(lng)) points.push({lat, lng, name: (props && (props.name || props.title)) || ''});
    } else if(geom.type === 'LineString'){
      const pts = lineFromCoords(geom.coordinates || []);
      if(pts.length >= 2) tracks.push(pts);
    } else if(geom.type === 'MultiLineString'){
      (geom.coordinates || []).forEach(line => { const pts = lineFromCoords(line); if(pts.length >= 2) tracks.push(pts); });
    } else if(geom.type === 'Polygon'){
      const pts = lineFromCoords((geom.coordinates || [])[0] || []);
      if(pts.length >= 2) tracks.push(pts);
    } else if(geom.type === 'MultiPolygon'){
      (geom.coordinates || []).forEach(poly => { const pts = lineFromCoords(poly[0] || []); if(pts.length >= 2) tracks.push(pts); });
    } else if(geom.type === 'GeometryCollection'){
      (geom.geometries || []).forEach(g => handleGeometry(g, props));
    }
  };
  if(json.type === 'FeatureCollection') (json.features || []).forEach(f => handleGeometry(f.geometry, f.properties));
  else if(json.type === 'Feature') handleGeometry(json.geometry, json.properties);
  else if(json.type) handleGeometry(json, null);
  else return null;
  if(!tracks.length && !points.length) return null;
  return {tracks, points};
}
function parseKmlFile(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')) return null;
  const tracks = [], points = [];
  const parseCoordText = (raw) => (raw || '').trim().split(/\s+/).filter(Boolean).map(tuple => {
    const parts = tuple.split(',').map(Number);
    return {lat: parts[1], lng: parts[0]};
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  doc.querySelectorAll('Placemark').forEach(pm => {
    const nameEl = pm.querySelector('name');
    const name = nameEl ? nameEl.textContent.trim() : '';
    const pointCoords = pm.querySelector('Point > coordinates');
    if(pointCoords){
      const pts = parseCoordText(pointCoords.textContent);
      if(pts.length) points.push({lat: pts[0].lat, lng: pts[0].lng, name});
    }
    pm.querySelectorAll('LineString > coordinates, LinearRing > coordinates').forEach(coordEl => {
      const pts = parseCoordText(coordEl.textContent);
      if(pts.length >= 2) tracks.push(pts);
    });
  });
  if(!tracks.length && !points.length) return null;
  return {tracks, points};
}
/* Dispatches on file extension (case-insensitive) — .json also accepted as
   GeoJSON since exports from common tools (geojson.io, QGIS) often use it. */
function parseGeoImportFile(filename, text){
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let format, result;
  if(ext === 'gpx'){ format = 'gpx'; result = parseGpxFile(text); }
  else if(ext === 'geojson' || ext === 'json'){ format = 'geojson'; result = parseGeoJsonFile(text); }
  else if(ext === 'kml'){ format = 'kml'; result = parseKmlFile(text); }
  else return null;
  if(!result) return null;
  return Object.assign({format}, result);
}

/* ---------------- sidebar panel ---------------- */
function toggleGeoImportPanel(){
  state.geoImportPanelOpen = !state.geoImportPanelOpen;
  renderSidebar();
}
function onGeoImportNameChange(id, value){
  const layer = findGeoImportLayer(state.currentEvent, id);
  if(!layer) return;
  layer.name = value;
  if(isGeoImportLayerPersistent(state.currentEvent, id)) debouncedSave();
}
function onGeoImportVisibleChange(id, checked){
  const layer = findGeoImportLayer(state.currentEvent, id);
  if(!layer) return;
  layer.visible = checked;
  if(isGeoImportLayerPersistent(state.currentEvent, id)) debouncedSave();
  redrawImportedGeo();
}
function onGeoImportPersistentChange(id, checked){
  setGeoImportLayerPersistent(state.currentEvent, id, checked);
  debouncedSave();
  renderSidebar();
}
function deleteGeoImportLayerFromSidebar(id){
  if(!confirm(t('geoImport.deleteConfirm'))) return;
  removeGeoImportLayer(state.currentEvent, id);
  debouncedSave();
  redrawImportedGeo();
  renderSidebar();
}
function renderGeoImportRow(evt, layer){
  const persistent = isGeoImportLayerPersistent(evt, layer.id);
  return `
    <div class="zone-row geo-import-row" data-geo-id="${layer.id}">
      <div class="zone-row-top">
        <input type="color" class="zone-color-input" value="${escapeHtml(layer.color)}" disabled title="${escapeHtml(layer.color)}">
        <input type="text" class="zone-name-input" value="${escapeHtml(layer.name)}" placeholder="${escapeHtml(layer.filename)}" oninput="onGeoImportNameChange('${layer.id}', this.value)">
        <span class="zone-type-badge">${layer.format.toUpperCase()}</span>
      </div>
      <div class="zone-row-meta">
        <span class="zone-row-meta-text">${t('geoImport.layerStats', {tracks: layer.tracks.length, points: layer.points.length})}</span>
        <span class="cp-row-icon-actions">
          <button type="button" class="cp-icon-btn" onclick="deleteGeoImportLayerFromSidebar('${layer.id}')" title="${t('common.delete')}" aria-label="${t('common.delete')}">🗑</button>
        </span>
      </div>
      <div class="zone-visibility-row">
        <label class="checkbox-row"><input type="checkbox" ${layer.visible ? 'checked' : ''} onchange="onGeoImportVisibleChange('${layer.id}', this.checked)">${t('geoImport.visibleLabel')}</label>
        <label class="checkbox-row"><input type="checkbox" ${persistent ? 'checked' : ''} onchange="onGeoImportPersistentChange('${layer.id}', this.checked)">${t('geoImport.persistLabel')}</label>
      </div>
    </div>
  `;
}
function renderGeoImportPanel(evt){
  const layers = allGeoImportLayers(evt);
  return `
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleGeoImportPanel()">${state.geoImportPanelOpen ? '▾' : '▸'} ${t('geoImport.heading')}</button>
      ${state.geoImportPanelOpen ? `
        <div class="settings-body">
          <div class="settings-hint">${t('geoImport.hint')}</div>
          <div class="zone-list">${layers.length ? layers.map(l => renderGeoImportRow(evt, l)).join('') : `<div class="riders-hint" style="padding:0;">${t('geoImport.noneYet')}</div>`}</div>
        </div>
      ` : ''}
    </div>
  `;
}
