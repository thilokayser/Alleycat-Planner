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
    map.on('click', onMapClick);
  } else {
    map.invalidateSize();
  }
  const legendTypes = document.getElementById('map-legend-types');
  if(legendTypes) legendTypes.innerHTML = CHECKPOINT_TYPES.map(t => `${typeIconHtml(t.key)} ${t.shortLabel}`).join(' &middot; ');
  redrawMarkers();
  fitToCheckpoints();
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
    marker.on('click', () => { state.editingId = cp.id; renderSidebar(); });
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
