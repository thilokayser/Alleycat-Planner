/* ---------------- zones: data model + geometry ----------------
   Foundation for Paket 4 (Großes Karten-Programm). Pure data model +
   geometry, no game-mode awareness by design — game modes (zone_active/
   Battle Royale in rules-engine.js, districts in game-modes.js) read and
   mutate zone fields (`active`, `radiusMeters`) but the logic of what
   those mean lives with them, not here. Circle math reuses
   haversineDistanceKm() (utils.js) rather than a flat-plane approximation,
   consistent with how the rest of the app already measures checkpoint
   distances. Polygon point-in-polygon uses a standard ray-casting test
   directly on lat/lng — a flat-plane simplification that's fine at the
   city-block scale these events operate at, same tradeoff the original
   centroid-based zoneCenterOf() (rules-engine.js) already made.
   `group` is a loose tag ('' | 'battle_royale' | 'district') set by
   whichever game mode a zone gets attached to — deliberately not an
   enum enforced here, since zones.js shouldn't need to know what game
   modes exist. `active` only has meaning for 'district' zones today
   (independently toggled); Battle Royale instead tracks its one current
   zone via mode.config.zoneId, so it doesn't need this flag. */
function withZoneDefaults(z){
  return Object.assign({
    id: uid('zone'),
    name: '',
    type: 'circle', // 'circle' | 'polygon'
    color: '#ff5f1f',
    group: '',    // '' | 'battle_royale' | 'district'
    active: false, // meaningful for 'district' zones only
    center: null,      // {lat, lng} — circle only
    radiusMeters: 300, // circle only
    points: []         // [{lat, lng}, ...], >= 3 — polygon only
  }, z);
}
/* First zone (in evt.zones array order) whose shape contains the point —
   array order is the deliberate, simple tie-break for overlapping zones
   (same "order decides" convention as category options/checkpoint types/
   PDF blocks/dashboard widgets elsewhere in this app); manual per-checkpoint
   overrides for edge cases are a deferred nice-to-have, not built here. */
function getCheckpointZone(cp, zones){
  if(!cp || !Number.isFinite(cp.lat) || !Number.isFinite(cp.lng)) return null;
  return (zones || []).find(z => isPointInZone(cp.lat, cp.lng, z)) || null;
}
function addZone(evt, zone){
  evt.zones = evt.zones || [];
  const z = withZoneDefaults(zone);
  evt.zones.push(z);
  return z;
}
function removeZone(evt, id){
  evt.zones = (evt.zones || []).filter(z => z.id !== id);
}
function getZone(evt, id){
  return (evt.zones || []).find(z => z.id === id) || null;
}
function updateZone(evt, id, patch){
  const z = getZone(evt, id);
  if(!z) return null;
  Object.assign(z, patch);
  return z;
}

/* ---------------- geometry ---------------- */
function isPointInCircle(lat, lng, centerLat, centerLng, radiusMeters){
  if(![lat, lng, centerLat, centerLng, radiusMeters].every(Number.isFinite)) return false;
  return haversineDistanceKm(lat, lng, centerLat, centerLng) * 1000 <= radiusMeters;
}
function isPointInPolygon(lat, lng, points){
  if(!Number.isFinite(lat) || !Number.isFinite(lng) || !Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for(let i = 0, j = points.length - 1; i < points.length; j = i++){
    const yi = points[i].lat, xi = points[i].lng;
    const yj = points[j].lat, xj = points[j].lng;
    const intersects = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if(intersects) inside = !inside;
  }
  return inside;
}
function isPointInZone(lat, lng, zone){
  if(!zone) return false;
  if(zone.type === 'polygon') return isPointInPolygon(lat, lng, zone.points);
  if(!zone.center || !Number.isFinite(zone.center.lat) || !Number.isFinite(zone.center.lng)) return false;
  return isPointInCircle(lat, lng, zone.center.lat, zone.center.lng, zone.radiusMeters);
}
function polygonCentroid(points){
  if(!Array.isArray(points) || !points.length) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length
  };
}
