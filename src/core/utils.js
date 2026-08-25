/* ---------------- utils ---------------- */
function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9); }

/* ---------------- rider credentials ----------------
   Anders als uid() bewusst NICHT über Math.random(): diese Werte sind
   Zugangsdaten. Ein rider token ist alles, was ein Fahrer-Handy vorzeigt,
   um sich als Startnummer 23 auszugeben, und ein qr token alles, was einen
   Checkpoint-Scan gültig macht. Vorhersagbare Werte wären hier eine echte
   Lücke, keine Kosmetik.                                                 */
const RIDER_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/* Ohne O/0/I/1: dieser Code wird von einer gedruckten Spokecard abgetippt,
   wenn die Kamera streikt. Verwechselbare Zeichen kosten dort echte Zeit. */
const RIDER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* Zieht n Zeichen aus alphabet, ohne Modulo-Bias: Werte im nicht durch die
   Alphabetlänge teilbaren Rest des Byte-Bereichs werden verworfen statt
   umgerechnet, sonst wären die ersten Zeichen des Alphabets minimal
   wahrscheinlicher als die letzten. */
function randomStringFromAlphabet(n, alphabet){
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  const buf = new Uint8Array(n * 2);
  while(out.length < n){
    crypto.getRandomValues(buf);
    for(let i = 0; i < buf.length && out.length < n; i++){
      if(buf[i] < limit) out += alphabet[buf[i] % alphabet.length];
    }
  }
  return out;
}
function generateRiderToken(){ return randomStringFromAlphabet(32, RIDER_TOKEN_ALPHABET); }
function generateRiderCode(){ return randomStringFromAlphabet(8, RIDER_CODE_ALPHABET); }

/* SHA-256 als Hex. Der Organizer hasht Tokens, bevor er sie zum Server
   schickt — Klartext-Zugangsdaten verlassen die App nie, auch nicht über
   die eigene authentifizierte Verbindung. */
async function sha256Hex(str){
  const bytes = new TextEncoder().encode(String(str));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadJSON(obj, filename){
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'}), filename);
}
function restoreInputFocus(selector, cursorPos){
  const el = document.querySelector(selector);
  if(!el) return;
  el.focus();
  if(typeof cursorPos === 'number' && el.setSelectionRange) el.setSelectionRange(cursorPos, cursorPos);
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

/* Paket 5 Teil A, Schritt 3 (Spec 20.1): coordinate display switch —
   Dezimalgrad (default) | DMS | UTM | MGRS. toUtm() is the standard
   ellipsoidal (WGS84) transverse Mercator forward formula (Snyder,
   USGS Professional Paper 1395) — validated against a published reference
   (Wikipedia's UTM article: CN Tower, 43.6425667°N 79.387139°W → zone 17,
   630084mE 4833438mN) during development; this implementation reproduces
   that to sub-meter precision. toMgrs() derives the 100km grid square
   letters from the UTM result per the standard MGRS lettering scheme
   (column letters cycle in a 3-zone-repeating pattern, row letters
   alternate starting letter by zone parity) — cross-checked against the
   same CN Tower point's well-known MGRS designation (17T PJ ...), which
   matched on zone/band/grid-square exactly. Good enough for a reference
   display on a printed manifest, not claimed to be survey-grade. */
function toDms(lat, lng){
  const part = (deg, posLetter, negLetter) => {
    const letter = deg >= 0 ? posLetter : negLetter;
    deg = Math.abs(deg);
    const d = Math.floor(deg);
    const minFloat = (deg - d) * 60;
    const m = Math.floor(minFloat);
    const s = Math.round((minFloat - m) * 60);
    return `${d}°${m}'${s}"${letter}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lng, 'E', 'W')}`;
}
function toUtm(lat, lng){
  const a = 6378137, f = 1 / 298.257223563; // WGS84
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ePrime2 = e2 / (1 - e2);
  const zone = Math.floor((lng + 180) / 6) + 1;
  const lngOriginRad = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lngRad = lng * Math.PI / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ePrime2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lngRad - lngOriginRad);
  const M = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latRad)
  );

  const easting = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5 / 120) + 500000;
  let northing = k0 * (M + N * Math.tan(latRad) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6 / 720));
  if(lat < 0) northing += 10000000;
  return {zone, easting, northing, hemisphere: lat < 0 ? 'S' : 'N'};
}
function mgrsLatBand(lat){
  const bands = 'CDEFGHJKLMNPQRSTUVWXX'; // skips I/O (look like 1/0); last X is the wide 72-84° band
  if(lat < -80 || lat > 84) return null;
  return bands[Math.min(Math.floor((lat + 80) / 8), bands.length - 1)];
}
function mgrsGridSquare(zone, easting, northing){
  const colSets = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
  const colLetter = colSets[(zone - 1) % 3][Math.floor(easting / 100000) - 1];
  const rowLetters = zone % 2 === 1 ? 'ABCDEFGHJKLMNPQRSTUV' : 'FGHJKLMNPQRSTUVABCDE';
  const rowLetter = rowLetters[Math.floor(northing / 100000) % 20];
  return colLetter + rowLetter;
}
function toMgrs(lat, lng){
  const utm = toUtm(lat, lng);
  const band = mgrsLatBand(lat);
  const grid = mgrsGridSquare(utm.zone, utm.easting, utm.northing);
  const digits = (v) => String(Math.floor(v % 100000)).padStart(5, '0');
  return `${utm.zone}${band} ${grid} ${digits(utm.easting)} ${digits(utm.northing)}`;
}
function formatCoordinatesAs(fmt, lat, lng){
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  if(fmt === 'dms') return toDms(lat, lng);
  if(fmt === 'utm'){
    const u = toUtm(lat, lng);
    return `${u.zone}${u.hemisphere} ${Math.round(u.easting)}mE ${Math.round(u.northing)}mN`;
  }
  if(fmt === 'mgrs') return toMgrs(lat, lng);
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
function formatCoordinates(lat, lng){
  return formatCoordinatesAs(state.appSettings.coordFormat || 'decimal', lat, lng);
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
