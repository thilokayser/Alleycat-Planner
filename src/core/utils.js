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
function formatDateTime(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d.getTime())) return v;
  return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'}) + ' Uhr';
}
function formatDateOnly(v){
  if(!v) return '';
  const d = new Date(v + 'T00:00:00');
  if(isNaN(d.getTime())) return v;
  return d.toLocaleDateString('de-DE');
}
function formatTimeOnly(v){
  if(!v) return '—';
  const d = new Date(v);
  if(isNaN(d.getTime())) return v;
  return d.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
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
