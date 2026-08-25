/* ---------------- rider QR payloads ----------------
   Erzeugen und Zerlegen der beiden QR-Nutzlasten. Eigene Datei, weil das
   Fahrer-Bundle den Parser braucht, der Rest von rider-sync.js aber an
   state, debouncedSave() und logUndoableAction() hängt — Dinge, die es dort
   nicht gibt. generateEventPublicId() bleibt bewusst drüben: die Fahrer-App
   liest Event-IDs, sie erzeugt keine.                                    */
const RIDER_PUBLIC_ID_RE = /^[a-z0-9]{12}$/;
const RIDER_TOKEN_RE = /^[a-z0-9]{32}$/;
/* ---------------- QR-Nutzlast ----------------
   Zwei Formate, beide als URL, damit ein Scan mit der System-Kamera in der
   App landet statt in einer Fehlermeldung:

     <riderAppUrl>#r.<publicId>.<riderToken>
     <riderAppUrl>#c.<publicId>.<cpId>.<qrToken>

   Das dritte erkannte Format ist die nackte Startnummer. Die stand bis zur
   Rider-App auf jeder Spokecard, und der Marshal-Check-in scannt sie heute
   noch. Sie muss erkannt bleiben, sonst entwertet dieses Release jede
   bereits gedruckte Karte.                                              */
function parseRiderQrPayload(text){
  const raw = String(text == null ? '' : text).trim();
  if(!raw) return null;

  const bare = raw.match(/^#?(\d{1,5})$/);
  if(bare) return {kind: 'legacyBib', bib: parseInt(bare[1], 10)};

  const hashAt = raw.indexOf('#');
  const fragment = hashAt === -1 ? raw : raw.slice(hashAt + 1);
  const parts = fragment.split('.');

  if(parts[0] === 'r' && parts.length === 3){
    const [, publicId, riderToken] = parts;
    if(!RIDER_PUBLIC_ID_RE.test(publicId) || !RIDER_TOKEN_RE.test(riderToken)) return null;
    return {kind: 'rider', publicId, riderToken};
  }
  if(parts[0] === 'c' && parts.length === 4){
    const [, publicId, cpId, qrToken] = parts;
    if(!RIDER_PUBLIC_ID_RE.test(publicId) || !RIDER_TOKEN_RE.test(qrToken) || !cpId) return null;
    return {kind: 'checkpoint', publicId, cpId, qrToken};
  }
  return null;
}

function buildRiderQrPayload(baseUrl, evt, rider){
  return `${baseUrl}#r.${evt.publicId}.${rider.riderToken}`;
}
function buildCheckpointQrPayload(baseUrl, evt, cp){
  return `${baseUrl}#c.${evt.publicId}.${cp.id}.${cp.qrToken}`;
}
