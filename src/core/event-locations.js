/* ---------------- event locations: HQ & Afterparty ----------------
   Sonderorte sind Informationspunkte ohne Check-in-Logik, kein Checkpoint
   im eigentlichen Sinn (Spec 15.1). Höchstens ein Eintrag pro `type` —
   anders als zones.js (beliebig viele Zonen) ist "mehrere Headquarters"
   kein sinnvoller Anwendungsfall, daher hier bewusst kein Array-CRUD mit
   IDs im UI, sondern get/ensure/remove pro Typ. */
function withEventLocationDefaults(loc){
  return Object.assign({
    id: uid('loc'),
    type: 'headquarters', // 'headquarters' | 'afterparty'
    name: '',
    lat: null,
    lng: null,
    address: '',
    notes: '',
    linkedCheckpointId: null
  }, loc);
}
function getEventLocation(evt, type){
  return (evt.eventLocations || []).find(l => l.type === type) || null;
}
function ensureEventLocation(evt, type){
  evt.eventLocations = evt.eventLocations || [];
  let loc = getEventLocation(evt, type);
  if(!loc){
    loc = withEventLocationDefaults({type});
    evt.eventLocations.push(loc);
  }
  return loc;
}
function removeEventLocation(evt, type){
  evt.eventLocations = (evt.eventLocations || []).filter(l => l.type !== type);
}
function eventLocationHasPosition(loc){
  return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
}
function mapsDeepLink(lat, lng){
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
function mapsDirectionsLink(origin, dest){
  return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`;
}
/* "HQ oder letzter Checkpoint → Afterparty" per Spec 15.1 — HQ ist der
   bevorzugte Startpunkt (falls gesetzt), sonst der letzte Checkpoint nach
   Reihenfolge als sinnvoller Fallback-Ausgangspunkt für die Anfahrt. */
function afterpartyRouteOrigin(evt){
  const hq = getEventLocation(evt, 'headquarters');
  if(eventLocationHasPosition(hq)) return {lat: hq.lat, lng: hq.lng};
  const ordered = (evt.checkpoints || []).slice().sort((a, b) => b.order - a.order);
  const last = ordered[0];
  if(last && Number.isFinite(last.lat) && Number.isFinite(last.lng)) return {lat: last.lat, lng: last.lng};
  return null;
}

/* ---------------- HQ <-> checkpoint link ---------------- */
function isCheckpointHq(evt, cpId){
  const loc = getEventLocation(evt, 'headquarters');
  return !!(loc && loc.linkedCheckpointId === cpId);
}
/* Returns false if the user cancelled a required confirm (switching HQ from
   another checkpoint/free marker) — caller should still re-render so the
   checkbox visually resets to the unchanged state. */
function setCheckpointAsHq(evt, cpId, checked){
  const cp = evt.checkpoints.find(c => c.id === cpId);
  if(!cp) return false;
  const existing = getEventLocation(evt, 'headquarters');
  if(checked){
    if(existing && existing.linkedCheckpointId && existing.linkedCheckpointId !== cpId){
      const otherCp = evt.checkpoints.find(c => c.id === existing.linkedCheckpointId);
      if(!confirm(t('eventLocations.switchHqConfirm', {name: otherCp ? (otherCp.name || t('checkpoint.noName')) : t('eventLocations.unknownCheckpoint')}))) return false;
    } else if(existing && !existing.linkedCheckpointId){
      if(!confirm(t('eventLocations.overwriteFreeHqConfirm'))) return false;
    }
    const loc = ensureEventLocation(evt, 'headquarters');
    loc.linkedCheckpointId = cp.id;
    loc.lat = cp.lat;
    loc.lng = cp.lng;
    if(!loc.name) loc.name = cp.name || t('eventLocations.hqLabel');
  } else if(existing && existing.linkedCheckpointId === cp.id){
    removeEventLocation(evt, 'headquarters');
  }
  return true;
}
function syncHqLocationFromCheckpoint(evt, cp){
  const loc = getEventLocation(evt, 'headquarters');
  if(loc && loc.linkedCheckpointId === cp.id){ loc.lat = cp.lat; loc.lng = cp.lng; }
}
function unlinkHqIfCheckpointDeleted(evt, cpId){
  const loc = getEventLocation(evt, 'headquarters');
  if(loc && loc.linkedCheckpointId === cpId) loc.linkedCheckpointId = null;
}
function unlinkHqFromCheckpoint(){
  const evt = state.currentEvent;
  const loc = getEventLocation(evt, 'headquarters');
  if(!loc) return;
  loc.linkedCheckpointId = null;
  debouncedSave();
  renderSidebar();
}

/* ---------------- freestanding placement (map click) ---------------- */
function toggleLocationPlacementMode(type){
  state.locationPlacementMode = state.locationPlacementMode === type ? null : type;
  renderSidebar();
  applyMobileMapCollapsed();
}
/* Returns the placed location, or null if placement was cancelled (e.g. user
   declined to override an HQ that's still linked to a checkpoint). */
function placeEventLocationAt(evt, type, lat, lng){
  const existing = getEventLocation(evt, type);
  if(type === 'headquarters' && existing && existing.linkedCheckpointId){
    const cp = evt.checkpoints.find(c => c.id === existing.linkedCheckpointId);
    if(!confirm(t('eventLocations.switchHqConfirm', {name: cp ? (cp.name || t('checkpoint.noName')) : t('eventLocations.unknownCheckpoint')}))) return null;
  }
  const loc = ensureEventLocation(evt, type);
  loc.lat = lat;
  loc.lng = lng;
  loc.linkedCheckpointId = null;
  if(!loc.name) loc.name = type === 'headquarters' ? t('eventLocations.hqLabel') : t('eventLocations.afterpartyLabel');
  return loc;
}

/* ---------------- sidebar panel ---------------- */
function toggleEventLocationsPanel(){
  state.eventLocationsPanelOpen = !state.eventLocationsPanelOpen;
  renderSidebar();
}
function onEventLocationFieldChange(type, field, value){
  const loc = getEventLocation(state.currentEvent, type);
  if(!loc) return;
  loc[field] = value;
  debouncedSave();
  if(field === 'name') redrawEventLocations();
}
function removeEventLocationFromSidebar(type){
  if(!confirm(t('eventLocations.removeConfirm'))) return;
  removeEventLocation(state.currentEvent, type);
  debouncedSave();
  redrawEventLocations();
  renderSidebar();
}
function flyToEventLocation(type){
  const loc = getEventLocation(state.currentEvent, type);
  if(!eventLocationHasPosition(loc) || !map) return;
  map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 15), {duration: 0.6});
}
function renderEventLocationRow(evt, type){
  const loc = getEventLocation(evt, type);
  const icon = type === 'headquarters' ? '🏠' : '🎉';
  const label = type === 'headquarters' ? t('eventLocations.hqLabel') : t('eventLocations.afterpartyLabel');
  const linkedCp = loc && loc.linkedCheckpointId ? evt.checkpoints.find(c => c.id === loc.linkedCheckpointId) : null;
  if(!eventLocationHasPosition(loc)){
    return `
      <div class="event-loc-row">
        <div class="event-loc-row-top"><span class="event-loc-icon">${icon}</span><b>${label}</b></div>
        <div class="settings-hint">${type === 'headquarters' ? t('eventLocations.hqEmptyHint') : t('eventLocations.afterpartyEmptyHint')}</div>
        <button type="button" class="btn btn-sm ${state.locationPlacementMode === type ? 'btn-toggle active' : ''}" onclick="toggleLocationPlacementMode('${type}')">
          ${state.locationPlacementMode === type ? t('eventLocations.placementActive') : t('eventLocations.placeOnMap')}
        </button>
      </div>`;
  }
  return `
    <div class="event-loc-row">
      <div class="event-loc-row-top">
        <span class="event-loc-icon">${icon}</span>
        <input type="text" class="zone-name-input" value="${escapeHtml(loc.name)}" placeholder="${label}" oninput="onEventLocationFieldChange('${type}', 'name', this.value)">
      </div>
      ${linkedCp
        ? `<div class="settings-hint">${t('eventLocations.linkedToCheckpoint', {name: escapeHtml(linkedCp.name || t('checkpoint.noName'))})}</div>`
        : `<input type="text" class="zone-name-input" placeholder="${t('eventLocations.addressPlaceholder')}" value="${escapeHtml(loc.address || '')}" oninput="onEventLocationFieldChange('${type}', 'address', this.value)">`}
      <textarea class="event-loc-notes" placeholder="${t('eventLocations.notesPlaceholder')}" oninput="onEventLocationFieldChange('${type}', 'notes', this.value)">${escapeHtml(loc.notes || '')}</textarea>
      <div class="zone-row-meta">
        <a class="event-loc-maps-link" href="${mapsDeepLink(loc.lat, loc.lng)}" target="_blank" rel="noopener">${t('eventLocations.openInMaps')}</a>
        <span class="cp-row-icon-actions">
          <button type="button" class="cp-icon-btn" onclick="flyToEventLocation('${type}')" title="${t('zones.flyToTitle')}" aria-label="${t('zones.flyToTitle')}">🎯</button>
          ${linkedCp ? `<button type="button" class="cp-icon-btn" onclick="unlinkHqFromCheckpoint()" title="${t('eventLocations.unlink')}" aria-label="${t('eventLocations.unlink')}">🔗</button>` : ''}
          <button type="button" class="cp-icon-btn" onclick="removeEventLocationFromSidebar('${type}')" title="${t('common.delete')}" aria-label="${t('common.delete')}">🗑</button>
        </span>
      </div>
    </div>`;
}
function renderEventLocationsPanel(evt){
  return `
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleEventLocationsPanel()">${state.eventLocationsPanelOpen ? '▾' : '▸'} ${t('eventLocations.heading')}</button>
      ${state.eventLocationsPanelOpen ? `
        <div class="settings-body">
          <div class="settings-hint">${t('eventLocations.hint')}</div>
          ${renderEventLocationRow(evt, 'headquarters')}
          ${renderEventLocationRow(evt, 'afterparty')}
        </div>
      ` : ''}
    </div>
  `;
}

/* ---------------- orga pins: data model ----------------
   Purely internal planning markers (Baustellen, gefährliche Kreuzungen,
   Sammelpunkte) per Spec 18.4 — array-based like zones.js (any number of
   pins, unlike the single-per-type HQ/Afterparty above), but small enough
   to live alongside the other "special map object" data here rather than
   its own module. Never rendered on rider-facing exports or the beamer —
   there's deliberately no per-pin visibility flag for that (the spec's own
   `visible_on_hq_only` field would always be true in practice, since pins
   are categorically HQ-only; a flag that never varies is dead config). */
function withOrgaPinDefaults(p){
  return Object.assign({
    id: uid('pin'),
    type: 'note', // 'warning' | 'danger' | 'note' | 'info'
    title: '',
    notes: '',
    lat: null,
    lng: null
  }, p);
}
function addOrgaPin(evt, pin){
  evt.orgaPins = evt.orgaPins || [];
  const p = withOrgaPinDefaults(pin);
  evt.orgaPins.push(p);
  return p;
}
function getOrgaPin(evt, id){
  return (evt.orgaPins || []).find(p => p.id === id) || null;
}
function removeOrgaPin(evt, id){
  evt.orgaPins = (evt.orgaPins || []).filter(p => p.id !== id);
}
function orgaPinIcon(type){
  return {warning: '⚠️', danger: '🚫', note: '📌', info: 'ℹ️'}[type] || '📌';
}
