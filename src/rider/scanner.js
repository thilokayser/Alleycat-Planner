/* ---------------- Fahrer-App: QR-Scanner ----------------
   Nachbau der Schleife aus checkin.js (startQrScan), nicht Wiederver-
   wendung: die dortige Fassung hängt an state.qrScannerActive und
   renderCheckin(), also am Organizer. Sie herauszuziehen brächte den
   geteilten Kern in Bewegung, ohne dass eine zweite Stelle davon
   profitiert — die Bedienlogik bleibt aber absichtlich dieselbe, damit
   sich beide Scanner gleich anfühlen.

   Ein Unterschied zum Organizer, mit Absicht: hier bekommt der Aufrufer
   den Treffer per Callback statt über globalen Zustand. Der Scanner wird
   von zwei Stellen gebraucht (Spokecard-Anmeldung und Checkpoint-Scan),
   und beide brauchen ein anderes Ergebnis.                             */

let riderScanStream = null;
let riderScanRAF = null;
let riderScanOnResult = null;

async function startRiderScan(onResult){
  riderScanOnResult = onResult;
  riderState.view = 'scanner';
  riderState.error = '';
  renderRider();

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    riderScanFail(t('riderScan.scanCameraUnsupported'));
    return;
  }
  if(typeof jsQR !== 'function'){
    /* Sollte nicht vorkommen — jsQR ist eingebettet, nicht nachgeladen
       (siehe vendor/README.md). Trotzdem geprüft: ohne Scanner muss die
       Code-Eingabe erreichbar bleiben. */
    riderScanFail(t('riderScan.scanNoReader'));
    return;
  }

  try{
    riderScanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
  }catch(e){
    riderScanFail(t('riderScan.scanCameraDenied'));
    return;
  }

  const video = document.getElementById('rider-scan-video');
  if(!video){ stopRiderScan(); return; }
  video.srcObject = riderScanStream;
  try{ await video.play(); }catch(e){}

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function tick(){
    if(!riderScanStream) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if(code && code.data){
        const cb = riderScanOnResult;
        stopRiderScan(true);
        if(cb) cb(String(code.data).trim());
        return;
      }
    }
    riderScanRAF = requestAnimationFrame(tick);
  }
  riderScanRAF = requestAnimationFrame(tick);
}

/* silent = true: die Kamera wird abgeschaltet, aber nicht gerendert —
   der Aufrufer setzt gleich selbst eine neue Ansicht. Ohne das blitzte
   zwischen Scan und Bestätigung kurz die vorige Ansicht auf. */
function stopRiderScan(silent){
  if(riderScanRAF){ cancelAnimationFrame(riderScanRAF); riderScanRAF = null; }
  if(riderScanStream){
    riderScanStream.getTracks().forEach(tr => tr.stop());
    riderScanStream = null;
  }
  riderScanOnResult = null;
  if(!silent){
    riderState.view = riderState.session ? 'home' : 'login';
    renderRider();
  }
}

function riderScanFail(message){
  stopRiderScan(true);
  riderState.error = message;
  riderState.errorRetry = riderState.session ? 'home' : 'login';
  riderState.view = 'error';
  renderRider();
}
