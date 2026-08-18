/* ---------------- logistics: TSP route estimator ----------------
   Paket 4 Teil B, Schritt 1. Planning-only aid — never touches
   evt.checkpoints[].order or checkpointOrderMode, purely computes an
   estimated minimal-distance visiting order via nearest-neighbor +
   2-opt local search (a classic, good-enough heuristic at the small n
   this app operates at — a handful to a few dozen checkpoints; no need
   for anything more sophisticated like Lin-Kernighan). Modeled as an
   open path (fixed start, free end) rather than a closed tour, since
   alleycats don't loop back to the start. */
function tourDistanceKm(points, tour){
  let total = 0;
  for(let i = 0; i < tour.length - 1; i++){
    total += haversineDistanceKm(points[tour[i]].lat, points[tour[i]].lng, points[tour[i + 1]].lat, points[tour[i + 1]].lng);
  }
  return total;
}
function nearestNeighborTour(points, startIdx){
  const n = points.length;
  const visited = new Array(n).fill(false);
  const tour = [startIdx];
  visited[startIdx] = true;
  for(let step = 1; step < n; step++){
    const last = tour[tour.length - 1];
    let best = -1, bestDist = Infinity;
    for(let i = 0; i < n; i++){
      if(visited[i]) continue;
      const d = haversineDistanceKm(points[last].lat, points[last].lng, points[i].lat, points[i].lng);
      if(d < bestDist){ bestDist = d; best = i; }
    }
    tour.push(best);
    visited[best] = true;
  }
  return tour;
}
function twoOptSwap(tour, i, k){
  return [...tour.slice(0, i), ...tour.slice(i, k + 1).reverse(), ...tour.slice(k + 1)];
}
/* Index 0 (the fixed start — HQ or the first checkpoint) is deliberately
   never touched by the swap range (i starts at 1), so it stays fixed
   across every improvement pass. */
function twoOptImprove(points, tour){
  let best = tour.slice();
  let bestDist = tourDistanceKm(points, best);
  const n = best.length;
  let improved = true;
  while(improved){
    improved = false;
    for(let i = 1; i < n - 2; i++){
      for(let k = i + 1; k < n - 1; k++){
        const candidate = twoOptSwap(best, i, k);
        const candidateDist = tourDistanceKm(points, candidate);
        if(candidateDist < bestDist - 1e-9){
          best = candidate;
          bestDist = candidateDist;
          improved = true;
        }
      }
    }
  }
  return {tour: best, distanceKm: bestDist};
}
/* HQ (if set) is the fixed starting point — that's genuinely where the race
   begins; otherwise the checkpoint with order 1 anchors the estimate. */
function estimateOptimalRoute(evt){
  const checkpoints = (evt.checkpoints || []).filter(cp => Number.isFinite(cp.lat) && Number.isFinite(cp.lng)).slice().sort((a, b) => a.order - b.order);
  if(checkpoints.length < 2) return null;
  const hq = getEventLocation(evt, 'headquarters');
  const points = [];
  if(eventLocationHasPosition(hq)) points.push({lat: hq.lat, lng: hq.lng, id: '__hq__'});
  checkpoints.forEach(cp => points.push({lat: cp.lat, lng: cp.lng, id: cp.id}));
  if(points.length < 2) return null;

  const currentOrderTour = points.map((p, i) => i);
  const currentDistanceKm = tourDistanceKm(points, currentOrderTour);

  const nnTour = nearestNeighborTour(points, 0);
  const {tour, distanceKm} = twoOptImprove(points, nnTour);

  return {
    points,
    currentDistanceKm,
    optimizedDistanceKm: distanceKm,
    optimizedOrderIds: tour.map(idx => points[idx].id),
    savingsKm: Math.max(0, currentDistanceKm - distanceKm)
  };
}
function estimateRouteTimeMinutes(km, avgSpeedKmh){
  if(!Number.isFinite(avgSpeedKmh) || avgSpeedKmh <= 0) return 0;
  return (km / avgSpeedKmh) * 60;
}
function formatEstimatedDuration(minutes){
  const totalMin = Math.round(minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
/* Average speed is a per-organizer device preference, not event data —
   same localStorage pattern as alleycat:sidebarWidth. */
function currentAvgSpeedKmh(){
  try{
    const v = parseFloat(localStorage.getItem('alleycat:avgSpeedKmh'));
    if(!isNaN(v) && v > 0) return v;
  }catch(e){}
  return 18;
}

/* ---------------- sidebar panel ---------------- */
function toggleLogisticsPanel(){
  state.logisticsPanelOpen = !state.logisticsPanelOpen;
  renderSidebar();
}
function runRouteEstimate(){
  const evt = state.currentEvent;
  state.routeEstimate = estimateOptimalRoute(evt) || false;
  renderSidebar();
  if(state.showRouteEstimateOnMap) redrawRouteEstimate();
}
function onLogisticsSpeedChange(value){
  const speed = Math.max(1, parseFloat(value) || 1);
  try{ localStorage.setItem('alleycat:avgSpeedKmh', String(speed)); }catch(e){}
  renderSidebar();
}
function toggleRouteEstimateOnMap(){
  state.showRouteEstimateOnMap = !state.showRouteEstimateOnMap;
  if(state.showRouteEstimateOnMap && !state.routeEstimate) runRouteEstimate();
  redrawRouteEstimate();
  renderSidebar();
}
function renderLogisticsPanel(evt){
  const est = state.routeEstimate;
  const speed = currentAvgSpeedKmh();
  let body;
  if(est === undefined){
    body = `<div class="settings-hint">${t('logistics.notYetHint')}</div>`;
  } else if(est === false){
    body = `<div class="settings-hint">${t('logistics.notEnoughPoints')}</div>`;
  } else {
    const percent = est.currentDistanceKm > 0 ? Math.round(est.savingsKm / est.currentDistanceKm * 100) : 0;
    body = `
      <div class="logistics-result-row"><span>${t('logistics.currentDistance')}</span><b>${est.currentDistanceKm.toFixed(2)} km</b></div>
      <div class="logistics-result-row"><span>${t('logistics.optimizedDistance')}</span><b>${est.optimizedDistanceKm.toFixed(2)} km</b></div>
      ${est.savingsKm > 0.05 ? `<div class="logistics-savings">${t('logistics.savings', {km: est.savingsKm.toFixed(2), percent})}</div>` : ''}
      <div class="logistics-speed-row">
        <label>${t('logistics.avgSpeedLabel')}</label>
        <input type="number" min="1" step="1" value="${speed}" onchange="onLogisticsSpeedChange(this.value)"> km/h
      </div>
      <div class="logistics-result-row"><span>${t('logistics.estimatedTime')}</span><b>${formatEstimatedDuration(estimateRouteTimeMinutes(est.optimizedDistanceKm, speed))}</b></div>
      <label class="checkbox-row"><input type="checkbox" ${state.showRouteEstimateOnMap ? 'checked' : ''} onchange="toggleRouteEstimateOnMap()">${t('logistics.showOnMap')}</label>
    `;
  }
  return `
    <div class="settings-section">
      <button class="settings-toggle" onclick="toggleLogisticsPanel()">${state.logisticsPanelOpen ? '▾' : '▸'} ${t('logistics.heading')}</button>
      ${state.logisticsPanelOpen ? `
        <div class="settings-body">
          <div class="settings-hint">${t('logistics.hint')}</div>
          <button type="button" class="btn btn-sm" onclick="runRouteEstimate()">${t('logistics.estimateButton')}</button>
          ${body}
        </div>
      ` : ''}
    </div>
  `;
}
