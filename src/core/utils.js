/* ---------------- utils ---------------- */
function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* Paket 5 Teil A, Schritt 2 (Spec 20.1): 12h/24h switch, state.appSettings.
   timeFormat ('24h' default | '12h'). 12h mode formats via 'en-US' (not
   'de-DE') specifically to guarantee an AM/PM suffix — Intl's hour12 option
   is respected by de-DE too, but would render vorm./nachm.-style markers
   rather than the spec's literal "2:30 PM" example, and the German-only
   " Uhr" suffix makes no sense appended after an AM/PM time, so it's
   dropped in 12h mode (formatDateTime delegates its time portion to
   formatTimeOnly rather than duplicating the hour12 branch). */
function formatTimeOnly(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d.getTime())) return v;
  const twelveHour = state.appSettings.timeFormat === '12h';
  return d.toLocaleTimeString(twelveHour ? 'en-US' : 'de-DE', {hour: '2-digit', minute: '2-digit', hour12: twelveHour});
}
function formatDateTime(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d.getTime())) return v;
  const twelveHour = state.appSettings.timeFormat === '12h';
  return d.toLocaleDateString('de-DE') + ', ' + formatTimeOnly(v) + (twelveHour ? '' : ' Uhr');
}
function formatDateOnly(v){
  if(!v) return '';
  const d = new Date(v + 'T00:00:00');
  if(isNaN(d.getTime())) return v;
  return d.toLocaleDateString('de-DE');
}
function truncateText(s, n){
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function toLocalDateTimeInputValue(d){
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function formatCountdown(ms){
  const sign = ms < 0 ? '-' : '';
  ms = Math.abs(ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return sign + (h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s));
}
/* Paket 5 Teil A, Schritt 1 (Spec 20.1): the one place display distances get
   formatted, metric/imperial switch driven by state.appSettings.distanceUnit.
   Takes meters (the canonical unit per spec) — callers that compute in km
   (computeRouteLegs()/logistics.js's route estimator, both pre-dating this
   step and left as-is rather than reworked to a meters-internal
   representation, a much larger and purely internal change for zero
   user-visible benefit) convert with `* 1000` at the call site. Deliberately
   NOT applied to editable radius/buffer inputs (zone radius, proximity
   buffer) — those are configured thresholds the organizer types directly in
   meters, not a reported travel distance, so converting them bidirectionally
   into feet would be a different, bigger feature than this step asks for. */
function formatDistance(meters){
  if(!Number.isFinite(meters)) return '';
  if(state.appSettings.distanceUnit === 'imperial'){
    const feet = meters * 3.28084;
    if(feet < 528) return `${Math.round(feet)} ft`;
    return `${(meters / 1609.344).toFixed(2)} mi`;
  }
  if(meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
function haversineDistanceKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function computeRouteLegs(checkpoints){
  const ordered = (checkpoints || []).slice().sort((a, b) => a.order - b.order);
  const legs = [];
  for(let i = 1; i < ordered.length; i++){
    legs.push({
      from: ordered[i - 1],
      to: ordered[i],
      km: haversineDistanceKm(ordered[i - 1].lat, ordered[i - 1].lng, ordered[i].lat, ordered[i].lng)
    });
  }
  const total = legs.reduce((sum, l) => sum + l.km, 0);
  return {legs, total};
}
