/* ---------------- map ---------------- */
function initMap(){
  const container = document.getElementById('map');
  if(!container) return;
  if(!map){
    map = L.map('map', {zoomControl:true}).setView([50.1109, 8.6821], 13);
    createOfflineTileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    zonesLayer = L.featureGroup().addTo(map);
    map.on('click', onMapClick);
    initZoneDrawControl();
  } else {
    map.invalidateSize();
  }
  const legendTypes = document.getElementById('map-legend-types');
  if(legendTypes) legendTypes.innerHTML = CHECKPOINT_TYPES.map(t => `${typeIconHtml(t.key)} ${t.shortLabel}`).join(' &middot; ');
  redrawMarkers();
  redrawZones();
  fitToCheckpoints();
}

/* ---------------- zones: Leaflet.draw control + layer ----------------
   Kept separate from zones.js on purpose — zones.js is the pure data
   model/geometry module, this is the Leaflet-specific rendering and
   interaction layer, mirroring how checkpoint markers are handled here
   (redrawMarkers()) while checkpoint.js owns the data/sidebar side. */
function initZoneDrawControl(){
  if(typeof L.Control === 'undefined' || !L.Control.Draw) return; // CDN unavailable — degrade gracefully, sidebar list still works
  const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
      circle: {shapeOptions: {color: '#ff5f1f', weight: 2}, showRadius: true, metric: true},
      polygon: {shapeOptions: {color: '#ff5f1f', weight: 2}, allowIntersection: false, showArea: false},
      marker: false, rectangle: false, polyline: false, circlemarker: false
    },
    edit: {featureGroup: zonesLayer, remove: true}
  });
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED, onZoneDrawCreated);
  map.on(L.Draw.Event.EDITED, onZoneDrawEdited);
  map.on(L.Draw.Event.DELETED, onZoneDrawDeleted);
}
function onZoneDrawCreated(e){
  const evt = state.currentEvent;
  if(!evt) return;
  if(e.layerType === 'circle'){
    const c = e.layer.getLatLng();
    addZone(evt, {type: 'circle', name: t('zones.defaultName', {n: evt.zones.length + 1}), center: {lat: c.lat, lng: c.lng}, radiusMeters: Math.round(e.layer.getRadius())});
  } else if(e.layerType === 'polygon'){
    const points = e.layer.getLatLngs()[0].map(ll => ({lat: ll.lat, lng: ll.lng}));
    addZone(evt, {type: 'polygon', name: t('zones.defaultName', {n: evt.zones.length + 1}), points});
  } else {
    return;
  }
  debouncedSave();
  redrawZones();
  renderSidebar();
}
function onZoneDrawEdited(e){
  const evt = state.currentEvent;
  if(!evt) return;
  e.layers.eachLayer(layer => {
    const zone = getZone(evt, layer._zoneId);
    if(!zone) return;
    if(zone.type === 'circle'){
      const c = layer.getLatLng();
      updateZone(evt, zone.id, {center: {lat: c.lat, lng: c.lng}, radiusMeters: Math.round(layer.getRadius())});
    } else if(zone.type === 'polygon'){
      updateZone(evt, zone.id, {points: layer.getLatLngs()[0].map(ll => ({lat: ll.lat, lng: ll.lng}))});
    }
  });
  debouncedSave();
  renderSidebar();
}
function onZoneDrawDeleted(e){
  const evt = state.currentEvent;
  if(!evt) return;
  e.layers.eachLayer(layer => { if(layer._zoneId) removeZone(evt, layer._zoneId); });
  debouncedSave();
  renderSidebar();
}
function redrawZones(){
  if(!zonesLayer || !state.currentEvent) return;
  zonesLayer.clearLayers();
  (state.currentEvent.zones || []).forEach(zone => {
    let layer = null;
    if(zone.type === 'circle' && zone.center){
      layer = L.circle([zone.center.lat, zone.center.lng], {radius: zone.radiusMeters, color: zone.color, weight: 2, fillOpacity: 0.12});
    } else if(zone.type === 'polygon' && zone.points && zone.points.length >= 3){
      layer = L.polygon(zone.points.map(p => [p.lat, p.lng]), {color: zone.color, weight: 2, fillOpacity: 0.12});
    }
    if(!layer) return;
    layer._zoneId = zone.id;
    layer.bindTooltip(zone.name || t('zones.unnamed'), {direction: 'center', className: 'zone-tooltip'});
    layer.addTo(zonesLayer);
  });
}
function toggleZonesPanel(){
  state.zonesPanelOpen = !state.zonesPanelOpen;
  renderSidebar();
}
function onZoneNameChange(id, value){
  const evt = state.currentEvent;
  updateZone(evt, id, {name: value});
  debouncedSave();
  redrawZones();
}
function onZoneColorChange(id, value){
  const evt = state.currentEvent;
  updateZone(evt, id, {color: value});
  debouncedSave();
  redrawZones();
}
function onZoneRadiusChange(id, value){
  const radius = Math.max(10, parseInt(value, 10) || 10);
  updateZone(state.currentEvent, id, {radiusMeters: radius});
  debouncedSave();
  redrawZones();
}
function deleteZoneFromSidebar(id){
  if(!confirm(t('zones.deleteConfirm'))) return;
  removeZone(state.currentEvent, id);
  debouncedSave();
  redrawZones();
  renderSidebar();
}
function flyToZone(id){
  const zone = getZone(state.currentEvent, id);
  if(!zone || !map) return;
  const center = zone.type === 'circle' ? zone.center : polygonCentroid(zone.points);
  if(!center) return;
  map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 15), {duration: 0.6});
}
function renderZoneRow(z){
  return `
    <div class="zone-row">
      <div class="zone-row-top">
        <input type="color" class="zone-color-input" value="${escapeHtml(z.color)}" onchange="onZoneColorChange('${z.id}', this.value)" title="${t('zones.colorTitle')}">
        <input type="text" class="zone-name-input" value="${escapeHtml(z.name)}" placeholder="${t('zones.namePlaceholder')}" oninput="onZoneNameChange('${z.id}', this.value)">
        <span class="zone-type-badge">${z.type === 'circle' ? t('zones.typeCircle') : t('zones.typePolygon')}</span>
      </div>
      <div class="zone-row-meta">
        ${z.type === 'circle'
          ? `<label class="zone-radius-field">${t('zones.radiusLabel')} <input type="number" min="10" step="10" value="${z.radiusMeters}" onchange="onZoneRadiusChange('${z.id}', this.value)"> m</label>`
          : `<span class="zone-row-meta-text">${t('zones.pointCount', {count: z.points.length})}</span>`}
        <span class="cp-row-icon-actions">
          <button type="button" class="cp-icon-btn" onclick="flyToZone('${z.id}')" title="${t('zones.flyToTitle')}">🎯</button>
          <button type="button" class="cp-icon-btn" onclick="deleteZoneFromSidebar('${z.id}')" title="${t('common.delete')}">🗑</button>
        </span>
      </div>
    </div>
  `;
}
function renderZonesPanel(evt){
  const zones = evt.zones || [];
  return `
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleZonesPanel()">${state.zonesPanelOpen ? '▾' : '▸'} ${t('zones.heading')}</button>
      ${state.zonesPanelOpen ? `
        <div class="settings-body">
          <div class="settings-hint">${t('zones.hint')}</div>
          <div class="zone-list">${zones.length ? zones.map(renderZoneRow).join('') : `<div class="riders-hint" style="padding:0;">${t('zones.noneYet')}</div>`}</div>
        </div>
      ` : ''}
    </div>
  `;
}
/* ---------------- hover sync: sidebar row <-> map marker ---------------- */
function setCpRowHoverSync(cpId, on){
  const row = document.querySelector(`.cp-row[data-cp-id="${cpId}"]`);
  if(row) row.classList.toggle('cp-row-hover-sync', on);
}
function setCpMarkerHoverSync(cpId, on){
  const marker = cpMarkers[cpId];
  if(!marker) return;
  const el = marker.getElement();
  const markerDiv = el && el.querySelector('.cp-marker');
  if(markerDiv) markerDiv.classList.toggle('cp-marker-hover-sync', on);
}
function fitToCheckpoints(){
  if(!map || !state.currentEvent || !state.currentEvent.checkpoints.length) return;
  const bounds = L.latLngBounds(state.currentEvent.checkpoints.map(c => [c.lat, c.lng]));
  map.fitBounds(bounds.pad(0.25));
}

/* ---------------- sidebar resize ---------------- */
const SIDEBAR_MIN = 280, SIDEBAR_MAX = 640, SIDEBAR_BREAKPOINT = 820;
function applySidebarWidth(){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  if(window.innerWidth <= SIDEBAR_BREAKPOINT){ sidebar.style.width = ''; return; }
  let saved = 340;
  try{
    const v = parseInt(localStorage.getItem('alleycat:sidebarWidth'), 10);
    if(!isNaN(v)) saved = v;
  }catch(e){}
  sidebar.style.width = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, saved)) + 'px';
}
function setSidebarWidth(px){
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, px));
  sidebar.style.width = clamped + 'px';
  try{ localStorage.setItem('alleycat:sidebarWidth', String(clamped)); }catch(e){}
  if(map) map.invalidateSize();
}
function isEditorSidebarCollapsed(){
  try{ return localStorage.getItem('alleycat:sidebarCollapsed') === '1'; }catch(e){ return false; }
}
function applyEditorSidebarCollapsed(){
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');
  const toggle = document.getElementById('sidebar-collapse-toggle');
  if(!sidebar || !toggle) return;
  const collapsed = window.innerWidth > SIDEBAR_BREAKPOINT && isEditorSidebarCollapsed();
  sidebar.style.display = collapsed ? 'none' : '';
  if(handle) handle.style.display = collapsed ? 'none' : '';
  toggle.textContent = collapsed ? '‹' : '›';
  toggle.title = collapsed ? t('map.expandSidebar') : t('map.collapseSidebar');
  /* Synchron statt setTimeout: die Sichtbarkeits-/Breitenänderung oben ist zu
     diesem Zeitpunkt bereits im CSSOM angewendet, ein verzögerter Aufruf lief
     Gefahr, erst nach einem zwischenzeitlichen View-Wechsel zu feuern und dann
     eine 0x0-Größe in Leaflet zu cachen (bricht spätere flyTo()-Aufrufe mit
     "Invalid LatLng (NaN, NaN)"). Nur aufrufen, während die Karte sichtbar ist. */
  if(map && state.view === 'editor') map.invalidateSize();
}
function toggleEditorSidebarCollapsed(){
  const next = !isEditorSidebarCollapsed();
  try{ localStorage.setItem('alleycat:sidebarCollapsed', next ? '1' : '0'); }catch(e){}
  applyEditorSidebarCollapsed();
}
function initSidebarResize(){
  const handle = document.getElementById('sidebar-resize-handle');
  if(!handle || handle.dataset.bound) return;
  handle.dataset.bound = '1';
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    if(window.innerWidth <= SIDEBAR_BREAKPOINT) return;
    dragging = true;
    handle.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if(!dragging) return;
    const viewEditor = document.getElementById('view-editor');
    const rect = viewEditor.getBoundingClientRect();
    setSidebarWidth(rect.right - e.clientX);
  });
  function stopDrag(e){
    if(!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    try{ handle.releasePointerCapture(e.pointerId); }catch(err){}
  }
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
  window.addEventListener('resize', () => {
    if(state.view === 'editor'){
      applySidebarWidth();
      applyEditorSidebarCollapsed();
      if(map) map.invalidateSize();
    }
  });
}
function onMapClick(e){
  if(!state.addMode || !state.currentEvent || isCpLocked(state.currentEvent)) return;
  const order = state.currentEvent.checkpoints.length + 1;
  const cp = {
    id: uid('cp'),
    order,
    lat: e.latlng.lat,
    lng: e.latlng.lng,
    name: t('map.defaultCheckpointName', {order}),
    clue: '',
    mandatory: true,
    type: CHECKPOINT_TYPES[0].key,
    customQuestion: '',
    punchCode: String(Math.floor(1000 + Math.random()*9000)),
    timeWindowEnabled: false,
    timeWindowStart: '',
    timeWindowEnd: ''
  };
  state.currentEvent.checkpoints.push(cp);
  debouncedSave();
  state.editingId = cp.id;
  renderSidebar();
  redrawMarkers();
}

function redrawMarkers(){
  if(!markersLayer || !state.currentEvent) return;
  markersLayer.clearLayers();
  cpMarkers = {};
  // Leaflet 1.9.x leaves permanent-tooltip DOM nodes behind when their marker
  // is removed via a LayerGroup — clean them up explicitly to avoid duplicates.
  document.querySelectorAll('.leaflet-tooltip.cp-time-tooltip').forEach(el => el.remove());
  state.currentEvent.checkpoints.forEach((cp, idx) => {
    const rot = idx % 2 === 0 ? -5 : 4;
    const icon = L.divIcon({
      className:'',
      html: `<div class="cp-marker ${cp.mandatory ? '' : 'optional'}" style="transform:rotate(${rot}deg);">${cp.order}<span class="cp-marker-type">${typeIconHtml(cp.type)}</span></div>`,
      iconSize:[32,32], iconAnchor:[16,16]
    });
    const marker = L.marker([cp.lat, cp.lng], {icon, draggable:true});
    cpMarkers[cp.id] = marker;
    marker.on('click', () => { state.editingId = cp.id; renderSidebar(); });
    marker.on('mouseover', () => setCpRowHoverSync(cp.id, true));
    marker.on('mouseout', () => setCpRowHoverSync(cp.id, false));
    marker.on('dragend', (ev) => {
      const pos = ev.target.getLatLng();
      cp.lat = pos.lat; cp.lng = pos.lng;
      debouncedSave();
      renderSidebar();
    });
    if(cp.timeWindowEnabled){
      marker.bindTooltip(`${formatTimeOnly(cp.timeWindowStart)}–${formatTimeOnly(cp.timeWindowEnd)}`, {
        permanent: true, direction: 'top', offset: [0, -18], className: 'cp-time-tooltip'
      });
    }
    marker.addTo(markersLayer);
  });

  if(routeLine){ map.removeLayer(routeLine); routeLine = null; }
  const ordered = [...state.currentEvent.checkpoints].sort((a,b) => a.order - b.order);
  if(ordered.length > 1){
    routeLine = L.polyline(ordered.map(c => [c.lat, c.lng]), {
      color: '#ff5f1f',
      weight: 3,
      dashArray: '7 7',
      opacity: 0.8,
      lineJoin: 'round'
    }).addTo(map);
    routeLine.bringToBack();
  }
}

/* ---------------- map search (Nominatim) ---------------- */
function onSearchInput(value){
  clearTimeout(searchDebounce);
  document.getElementById('map-search-clear').style.display = value ? 'inline-block' : 'none';
  const q = value.trim();
  if(q.length < 3){
    searchResultsData = [];
    renderSearchResults(false);
    return;
  }
  renderSearchResults(true);
  searchDebounce = setTimeout(() => performSearch(q), 450);
}
async function performSearch(query){
  try{
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' + encodeURIComponent(query);
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    const data = await res.json();
    searchResultsData = Array.isArray(data) ? data : [];
  }catch(e){
    console.error('Ortssuche fehlgeschlagen', e);
    searchResultsData = [];
  }
  renderSearchResults(false);
}
function renderSearchResults(isLoading){
  const el = document.getElementById('map-search-results');
  if(!el) return;
  if(isLoading){
    el.style.display = 'block';
    el.innerHTML = `<div class="map-search-loading">${t('map.searching')}</div>`;
    return;
  }
  if(!searchResultsData.length){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = searchResultsData.map((r, i) => `
    <div class="map-search-result" onclick="selectSearchResult(${i})">${escapeHtml(r.display_name)}</div>
  `).join('');
}
function selectSearchResult(i){
  const r = searchResultsData[i];
  if(!r || !map) return;
  map.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 16, {duration:0.8});
  searchResultsData = [];
  renderSearchResults(false);
  const input = document.getElementById('map-search-input');
  if(input) input.value = r.display_name;
}
function clearSearch(){
  const input = document.getElementById('map-search-input');
  if(input) input.value = '';
  document.getElementById('map-search-clear').style.display = 'none';
  searchResultsData = [];
  renderSearchResults(false);
}
